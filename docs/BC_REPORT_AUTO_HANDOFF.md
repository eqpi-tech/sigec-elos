# BC_REPORT_AUTO_HANDOFF.md

Handoff de implementação — **BC Report Automatizado (Light + Full)** no SIGEC ELOS.
Leia este documento inteiro antes de escrever código. Implemente em estágios, na ordem da seção 12.

---

## 1. Contexto e objetivo

Hoje o BC Report é produzido **manualmente** pela parceira EQP (analista consulta ~20 portais, tira prints, monta PDF). Vamos automatizar 100% do processo dentro do ELOS, gerando dois produtos:

- **BC Report Light** — 1 página, layout do mock `IDEIA_CONCEITUAL_DE_UM_BC_REPORT_LIGHT.png` (já aprovado como referência visual).
- **BC Report Full** — dossiê multi-página em 5 aspectos (Identidade, Integridade, Listas Restritivas, Jurídico, Financeiro), estrutura herdada do BC Report manual da EQP, com evidências anexadas.

Fontes de dados em 3 rotas:
1. **Grátis direto** (APIs oficiais e dumps ingeridos) — custo zero.
2. **Infosimples** (`api.infosimples.com`) — bypass de captcha, JSON + comprovantes (`site_receipts`).
3. **Assertiva** — bureau de crédito, **integração já em produção** (`netlify/functions/assertiva-report.js`). É a referência de padrão de conector.

Stack: React + Vite (Netlify) · Supabase (Auth/Postgres/Storage) · Netlify Functions · pipeline HTML→PDF Playwright já usado no projeto.

---

## 2. Decisões TRAVADAS (não alterar sem aprovação do Luiz)

| # | Decisão |
|---|---|
| L1 | **Assertiva entra no Light E no Full.** Custo unitário: R$ 9,576/consulta. |
| L2 | **TTL Assertiva = 30 dias é regra de negócio.** Qualquer emissão (Light ou Full) reaproveita consulta Assertiva com < 30 dias. Reconsulta forçada apenas via flag explícita `force_refresh_bureau` (permissão backoffice). |
| L3 | **Grátis primeiro.** Toda fonte que tiver rota gratuita oficial usa a rota gratuita; Infosimples só onde há captcha/fricção; bureau só para dado privado. |
| L4 | **COGS auditável.** Cada consulta grava `cost_brl`; cada relatório soma o custo real; admin exibe custo por emissão e por cliente. |
| L5 | **Preços de venda** (tabela aprovada p/ CEO): Light R$ 59 · Full R$ 299 · conversão Full ≤30d pós-Light R$ 249 · Monitoramento R$ 29/mês. Armazenar em tabela de config, não hardcode. |
| L6 | Evidências (site_receipts, PDFs de certidão, JSON bruto) são **persistidas no Supabase Storage** com hash SHA-256 e timestamp — receipts da Infosimples expiram, baixar imediatamente. |
| L7 | Renderização final via **pipeline Playwright/Chromium existente** (`page.pdf`, A4, print_background, Montserrat/DM Sans embutidas, paleta EQPI: navy `#1B1F3B`/`#2E3192`, orange `#F47E2F`, light `#EEF0FF`). O PDF Assertiva atual (pdf-lib) continua existindo como doc #578; o BC Report é um documento novo que **consome os dados** da tabela `assertiva_reports`, não o PDF. |
| L8 | Anti-duplicidade: reaproveitar padrões do `assertiva-report.js` (janela de bloqueio + GET retorna último salvo). |
| L9 | **Detalhe processual v1** (aprovado): sumário Assertiva (qtde + valor de ações) + DataJud onde responder por CNPJ. Escavador/Judit (pago, ~R$ 0,50–2/consulta) fica catalogado como fase 3, só se cliente exigir lista processo a processo. |
| L10 | **Worker** (aprovado): Netlify Functions + fila no Supabase — tabela `report_requests` como fila, processamento incremental por invocação (cada invocação processa N conectores pendentes e reagenda, para caber no timeout de function). VM dedicada só se o incremental se mostrar frágil; a arquitetura de conectores não muda nesse caso. |

## 3. Decisões com DEFAULT RECOMENDADO (implementar assim; Luiz pode trocar)

| # | Default | Alternativa registrada |
|---|---|---|
| D3 | Mídia negativa: 2 consultas `buscador-google` da Infosimples (empresa + sócio administrador) com as queries no padrão EQP (`"RAZAO SOCIAL" wp AND LAVAGEM DE DINHEIRO! OR CRIME! OR CORRUPÇÃO!` etc.). | Claude API com web search (avaliar em fase 3 para parecer qualitativo). |
| D4 | Parecer resumido do Light: gerado por template de regras (determinístico). | LLM para redação do parecer — fase 3, com revisão humana. |

---

## 4. Arquitetura

```
[UI ELOS: botão "Emitir BC Report" (Light/Full)] 
        │  POST /api/bc-report  { cnpj, tipo, requested_by }
        ▼
report_requests (fila, status=pending)
        │  scheduled function / trigger a cada 1 min + invocação imediata
        ▼
Orquestrador ──► para cada conector do plano do relatório:
        │          1. cache hit? (source_results dentro do TTL) → reusa
        │          2. rota A grátis: fetch API/DB local
        │          3. rota B Infosimples: POST api.infosimples.com/api/v2/consultas/<slug>
        │          4. rota C Assertiva: reusar assertiva_reports (TTL 30d) ou emitir
        │          grava source_results (raw + parsed + cost_brl + evidence)
        ▼
Todos conectores resolvidos (ok | not_found | failed_soft)
        ▼
Score EQPI (motor de regras, seção 8) → parecer
        ▼
Render HTML → PDF (Playwright) → Supabase Storage → vira documento do fornecedor
        ▼
report_requests.status = done · COGS somado · notificação
```

Regras do orquestrador:
- Conectores rodam **em paralelo por lote** (Promise.allSettled, lote de 5–8).
- `failed_soft` (fonte fora do ar) **não bloqueia** o relatório: a seção sai como "Fonte indisponível na data da consulta — nova tentativa agendada", e o request fica `done_partial` com retry automático (máx. 3, backoff 15 min) que regenera o PDF ao completar.
- Infosimples: timeout por consulta 300s; tratar `code` de retorno deles (`200` sucesso, `6xx` erros de site/validação — mapear para `not_found`/`failed_soft` conforme doc da API v2).
- Idempotência: request duplicado (mesmo cnpj+tipo, < 10 min, status não-final) retorna o request existente.

---

## 5. Schema (Supabase — migrations novas)

```sql
-- fila / cabeçalho do relatório
create table report_requests (
  id uuid primary key default gen_random_uuid(),
  cnpj text not null,
  supplier_id uuid references suppliers(id),
  tipo text not null check (tipo in ('light','full')),
  status text not null default 'pending'
    check (status in ('pending','collecting','rendering','done','done_partial','failed','canceled')),
  requested_by uuid,                -- auth.users
  requested_channel text,           -- 'supplier','backoffice','api'
  force_refresh_bureau boolean default false,
  score_eqpi int,                   -- 0-100
  risk_band text,                   -- 'baixo','medio','alto','critico'
  parecer text,
  pdf_path text,                    -- storage path
  cost_brl numeric(10,2) default 0, -- soma real
  price_brl numeric(10,2),          -- preço cobrado (da config)
  error text,
  created_at timestamptz default now(),
  finished_at timestamptz
);

-- resultado por fonte (cache + auditoria)
create table source_results (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references report_requests(id),
  cnpj text not null,
  connector text not null,          -- slug: 'pgfn_cnd', 'ceis', 'assertiva_pj'...
  route text not null check (route in ('free','infosimples','assertiva','local_db')),
  status text not null check (status in ('ok','not_found','failed_soft','failed')),
  parsed jsonb,                     -- dados normalizados p/ o template
  raw jsonb,                        -- resposta bruta completa
  result_flag text,                 -- 'nada_consta','apontamento','verificar','indisponivel'
  cost_brl numeric(10,4) default 0,
  valid_until timestamptz,          -- created_at + TTL do conector
  protocol text,                    -- protocolo do provedor quando houver
  created_at timestamptz default now()
);
create index on source_results (cnpj, connector, created_at desc);

-- evidências persistidas
create table report_evidences (
  id uuid primary key default gen_random_uuid(),
  source_result_id uuid references source_results(id),
  kind text,                        -- 'site_receipt','certidao_pdf','raw_json','screenshot'
  storage_path text not null,
  sha256 text not null,
  created_at timestamptz default now()
);

-- catálogo de conectores + preços de venda (config, sem redeploy)
create table bc_config (
  key text primary key,             -- 'price_light','price_full','price_full_conv','price_monitor',
  value jsonb                       -- 'connector:<slug>' → {ttl_days, route, cost_base, cost_extra, enabled, in_light, in_full}
);
```

Cache: antes de consultar, o orquestrador busca `source_results` do mesmo `cnpj+connector` com `valid_until > now()` e `status='ok'` — se existir, clona a referência para o novo request com `cost_brl=0` (marcar `route='local_db'` no clone? Não — manter route original e adicionar campo `reused_from uuid` para auditoria; custo zero no clone).

RLS: **todas** as leituras dessas tabelas via Netlify Functions com `service_role` (padrão já aprendido no projeto — RLS client-side causa falha silenciosa). Fornecedor só enxerga seus próprios PDFs via endpoint, nunca as tabelas.

---

## 6. Contrato de conector

Um conector = 1 módulo em `netlify/functions/lib/connectors/<slug>.js` exportando:

```js
export default {
  slug: 'pgfn_cnd',
  route: 'infosimples',            // free | infosimples | assertiva | local_db
  ttlDays: 30,
  inLight: true, inFull: true,
  costBase: 0.20, costExtra: 0.10, // Infosimples: base por faixa + adicional; free: 0
  // executa a consulta e devolve o shape normalizado
  async fetch({ cnpj, company, socios, env }) { ... },
  // normaliza: parsed usado pelos templates
  parse(raw) {
    return {
      result_flag,                 // 'nada_consta' | 'apontamento' | 'verificar' | 'indisponivel'
      headline,                    // linha do quadro "Consultas públicas realizadas"
      details,                     // objeto livre por conector
      evidence: [{kind, url|buffer}],
      protocol
    };
  }
};
```

Cliente Infosimples único (`lib/infosimples.js`): `POST https://api.infosimples.com/api/v2/consultas/<caminho>` com `token` (env `INFOSIMPLES_TOKEN`), `timeout=300`, body com parâmetros do conector. Baixar cada `site_receipt` na hora e subir ao Storage. **Nunca** logar token; env vars no Netlify como no padrão Assertiva.

Conector Assertiva (`assertiva_pj`): **não** reimplementar OAuth — extrair a lógica existente do `assertiva-report.js` para `lib/connectors/assertiva_pj.js` e fazer a function atual consumi-la (refactor sem mudança de comportamento; casos `429`/`202` preservados). `fetch` primeiro tenta `assertiva_reports` com < 30 dias; senão emite e grava lá como hoje. `cost_brl = 9.576` só quando emite de fato.

---

## 7. Catálogo de conectores v1

**Rota A — grátis direto (custo 0):**

| Slug | Fonte | Como | TTL | Light | Full |
|---|---|---|---|---|---|
| `cnpj_base` | Base CNPJ (já existente no ELOS) | reuso da integração atual | 7d | ✔ | ✔ |
| `ceis` | Portal da Transparência | `GET api.portaldatransparencia.gov.br/api-de-dados/ceis?codigoSancionado=` (header `chave-api-dados`, env `TRANSPARENCIA_API_KEY`) | 1d | ✔ | ✔ |
| `cnep` | idem | `/cnep` | 1d | ✔ | ✔ |
| `cepim` | idem | `/cepim` | 1d | ✔ | ✔ |
| `ceaf` + `leniencia` | idem | `/ceaf`, `/acordos-leniencia` | 1d | — | ✔ |
| `pep` | Dump mensal PEP (Transparência) ingerido no Postgres | match por CPF dos sócios | 30d (dump) | — | ✔ |
| `trabalho_escravo` | Lista Suja MTE (CSV oficial) ingerida | match por CNPJ raiz | 7d (dump) | ✔ | ✔ |
| `tse_candidaturas` | Dados abertos TSE (2020/2022/2024) ingeridos | match por CPF/nome de sócio | dump estático | — | ✔ |
| `ofac` | SDN CSV oficial ingerido | fuzzy match razão social + sócios | 7d (dump) | ✔ | ✔ |
| `onu` | Consolidated List XML ONU ingerida | idem | 7d (dump) | ✔ | ✔ |
| `icij` | Offshore Leaks dump ingerido | idem | dump | — | ✔ |
| `datajud` | API pública CNJ (env `DATAJUD_API_KEY`) | busca por CNPJ nos tribunais que suportam; resultado marcado "cobertura parcial" | 7d | — | ✔ |
| `renuncias` | Transparência `/renuncias...` | panorama relação c/ Governo Federal | 7d | — | ✔ |

Ingestões (dumps): scheduled function/cron semanal → tabelas `ref_pep`, `ref_trabalho_escravo`, `ref_ofac`, `ref_onu`, `ref_icij`, `ref_tse` com data da versão da lista (aparece no relatório: "Lista atualizada em ...", como a EQP faz).

**Rota B — Infosimples:**

| Slug | API (caminho) | Adicional | TTL | Light | Full |
|---|---|---|---|---|---|
| `pgfn_cnd` | `receita-federal/pgfn` (fallback `-nova`/`-2via`) | +0,10 | 30d* | ✔ | ✔ |
| `fgts_crf` | `caixa/regularidade` | +0,06 | 30d* | ✔ | ✔ |
| `cndt` | `mte/certidao-debitos` | +0,08 | 30d* | ✔ | ✔ |
| `cartao_cnpj` | `receita-federal/cnpj` (comprovante oficial + QSA) | +0,04 | 30d | ✔ | ✔ |
| `sefaz_cnd` | `sefaz/certidao-debitos` (unificada, UF da sede) | var. | 30d* | — | ✔ |
| `pref_cnd` | `pref/cnd` (unificada, município da sede; se não coberto → `result_flag='indisponivel'` + nota) | var. | 30d* | — | ✔ |
| `cgu_correcional` | `cgu/cnc-tipo1` (certidão consolidada ePAD+CEIS+CNEP+CEPIM — evidência oficial) | +0,04 | 30d | — | ✔ |
| `cnj_improbidade` | `cnj/improbidade` | +0,04 | 7d | — | ✔ |
| `mpt_cnf` | `mpt/cnf-unificada` | +0,04 | 30d | — | ✔ |
| `mpf_cn` | `mpf/certidao-negativa` | +0,06 | 30d | — | ✔ |
| `ibama` | `ibama/certidao-embargos` + `ibama/certificado-regularidade` | +0,06/0 | 30d | — | ✔ |
| `simples` | `receita-federal/simples` | +0,08 | 30d | — | ✔ |
| `sintegra` | `sintegra/<uf>` da sede | var. | 30d | — | ✔ |
| `midia_negativa` | `buscador/google` ×2 (empresa; sócio adm) — queries padrão EQP (D3) | 0 | 7d | ✔ (1: empresa) | ✔ (empresa+sócios) |

\* TTL operacional de cache; **no PDF sempre imprimir a validade oficial da certidão** retornada pela fonte (ex.: CND válida até dd/mm/aaaa).

**Rota C — Assertiva:** `assertiva_pj` (score classe A–F + 0–1000, protestos, ações sumário, CCF, pendências, registro de consultas, faturamento presumido). TTL 30d (L2). Light ✔ Full ✔.

Custos esperados (faixa inicial, conferir em runtime pela fatura): Light ≈ R$ 11,10 · Full ≈ R$ 13,80 · Full com Assertiva em cache ≈ R$ 4,20.

---

## 8. Score EQPI (0–100) e faixas

Motor determinístico de regras em `lib/score.js` — pesos em `bc_config` (`key='score_weights'`) para ajuste sem deploy. Começa em 100 e subtrai:

| Achado | Penalidade |
|---|---|
| CEIS / CNEP / Lista Suja / OFAC / ONU com apontamento | −60 cada (piso 0) — risco crítico automático |
| CND Federal positiva | −25 · positiva c/ efeitos de negativa: −8 |
| CRF-FGTS irregular | −15 · CNDT positiva: −15 |
| Situação cadastral ≠ Ativa | −40 |
| Protestos (Assertiva): 1 de baixo valor (<R$ 5 mil) −5; múltiplos ou alto valor −20 |
| Score Assertiva classe E/F | −20 · classe D −10 |
| Ações judiciais como réu: 1–3 −5; >3 ou valor >R$ 500 mil −15 |
| CCF > 0 | −10 |
| Pendências financeiras | −5 a −15 proporcional |
| Empresa < 2 anos | −5 · < 1 ano −10 |
| PEP no quadro societário | −10 (flag amarela, não crítica) |
| Mídia negativa com resultado | −15 (revisão manual sugerida) |
| Certidão indisponível (`failed_soft`) | −0, mas trava faixa máxima em "médio" se for CND/CRF/CNDT |

Faixas: 80–100 **Baixo risco** · 60–79 **Médio** · 40–59 **Alto** · <40 ou lista crítica **Crítico**. Parecer resumido montado por template com os achados ordenados por severidade (D4).

---

## 9. Renderização

- `lib/render/light.html` — 1 página A4, **fiel ao mock aprovado**: header navy + badge "BC REPORT · LIGHT", card empresa + score box, "Situação documental na base ELOS" (docs analisados/pendentes do fornecedor no ELOS, quando `supplier_id` presente; ocultar cards se emissão avulsa por CNPJ), tabela "Consultas públicas realizadas" (fonte/escopo/badge de resultado, verde `Nada consta`/`Regular`, amarelo `Verificar`, vermelho apontamento), "Parecer resumido", footer com contatos + disclaimer.
- `lib/render/full.html` — capa (CONFIDENCIAL, razão social, CNPJ, data, solicitante) → Score EQPI (gauge SVG) → Resumo das conclusões em 5 aspectos (bullets com destaque laranja "Não foram encontradas…"/"Foram encontradas…", espelhando o BC Report manual) → 1 seção por conector com dados + evidência incorporada (imagem do receipt ou 1ª página do PDF da certidão) → página final de contatos EQPI.
- Ambos com Montserrat embutida (base64 woff2), paleta EQPI, gerados por Playwright `page.pdf({format:'A4', printBackground:true})`. QA automático: pypdfium2 valida nº de páginas (Light === 1) e renderiza screenshot da página 1 em dev.
- Disclaimer LGPD obrigatório no rodapé (adaptar o texto do BC Report atual: fontes públicas, uso interno do solicitante, não usar como fonte única de decisão).

## 10. UI

- **Backoffice (ficha de análise)**: botões "Emitir BC Report Light" / "Full"; status em tempo real (pending→collecting com contador de fontes→done); linha de COGS real por emissão; histórico de relatórios do CNPJ; flag `force_refresh_bureau` restrita a admin.
- **Fornecedor**: Light aparece como documento do seu dossiê (mesmo fluxo do doc #578).
- **Admin → Custos**: total mensal por rota (Assertiva/Infosimples), custo médio por relatório, COGS por cliente (L4).

## 11. Segurança e LGPD

- Tokens só em env vars Netlify (`INFOSIMPLES_TOKEN`, `TRANSPARENCIA_API_KEY`, `DATAJUD_API_KEY`, Assertiva existentes). Nunca em código/log.
- Registrar finalidade da consulta (`requested_by`, `requested_channel`) — base de legítimo interesse; reter `raw` por 5 anos (auditoria), evidências idem.
- Dados de sócios (CPF mascarado no PDF como `***.611.647-**`, padrão do relatório atual).
- Endpoint de emissão autenticado + rate limit por conta.

## 12. Estágios de implementação (ordem obrigatória)

1. **Migrations + config**: tabelas da seção 5, seed do catálogo de conectores e preços em `bc_config`.
2. **Cliente Infosimples + 3 conectores piloto** (`pgfn_cnd`, `fgts_crf`, `cndt`) com testes contra CNPJ real; persistência de receipts.
3. **Conectores rota A**: Transparência API + ingestões de dumps (scheduled) + matchers.
4. **Refactor Assertiva** → `lib/connectors/assertiva_pj.js` (sem mudança de comportamento da function atual).
5. **Orquestrador + fila** (L10), cache/TTL, retries, COGS.
6. **Score EQPI + parecer**.
7. **Render Light** + endpoint de emissão + UI backoffice → **entrega do MVP Light**.
8. **Conectores Full restantes** (sefaz, pref, cgu, cnj, mpt, mpf, ibama, simples, sintegra, datajud, pep, tse, icij, mídia sócios).
9. **Render Full** com evidências → entrega Full.
10. **Admin de custos** + monitoramento mensal (job que revalida rota A + certidões vencendo e alerta).

Cada estágio: PR próprio, testado contra ao menos 2 CNPJs reais (usar Techocean `08.932.635/0001-39` como caso com apontamentos conhecidos: CND positiva c/ efeitos de negativa, 4 processos TJRJ, divergência de endereço).

## 13. Fora de escopo v1 (catalogado, não implementar)

- Lista detalhada de processos via Escavador/Judit (L9, alternativa catalogada).
- Protestos via CENPROT direto (coberto pela Assertiva no v1).
- Parecer por LLM (D4 alternativa) e mídia negativa via Claude+web search (D3 alternativa).
- Bloco "Lastro Real"/Núclea do relatório concorrente (recebimentos/pagamentos) — sem fonte contratada.
- Venda avulsa self-service com checkout Stripe (v1 emite via backoffice/planos; checkout é fase seguinte).
- Consulta por CPF (pessoa física) — só PJ no v1.

## 14. Critérios de aceite

- Emitir Light da Techocean em < 5 min com: CND "positiva c/ efeitos de negativa" (badge amarelo), CNDT/CRF negativas (verde), listas restritivas nada consta, score Assertiva, Score EQPI coerente com seção 8, PDF de 1 página no layout do mock.
- Reemissão do mesmo CNPJ em < 30 dias: **zero** custo Assertiva e custo Infosimples só das fontes fora de TTL.
- `report_requests.cost_brl` bate com a soma de `source_results.cost_brl`.
- Derrubar uma fonte (simular 6xx Infosimples) → relatório sai `done_partial` com a seção marcada indisponível e retry agendado.
- Nenhum token em código, log ou resposta de API.
