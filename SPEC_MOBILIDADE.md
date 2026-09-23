# SPEC — Módulo de Mobilidade (documentos de PF por posto/pessoa)

> Status: **APPROVED 23/09** — decisões: (1) PCMSO/PGR migram para a matriz de
> mobilidade com escopo 'posto'; (2) mobilidade **bloqueia o selo** (fase 1 já
> bloqueante); (3) SUPERVISOR (vigilância) → PORTARIA; FRENTISTA/MANOBRISTA →
> LAVAGEM DE VEÍCULOS. Cliente piloto referido como
> "pilot client" (id `78802f94-6dec-4554-af60-71a2b72e3903`) conforme regra de
> sanitização do CLAUDE.md; nomes reais só via canal seguro.

## 1. Problem

Suppliers of labor-attached services (vigilância patrimonial, limpeza predial,
portaria, controle de acesso, manobristas…) must be homologated on **two levels**:
company documents (PJ, existing flow) **and person documents** (PF) for each
worker allocated to a **posto** (a service slot at a specific client site/city).

Today the PF documents (ASO, CNV, CNH, Registro de Arma, Curso de formação,
PCMSO, PGR) are wrongly modeled as PJ documents inside `category_documents`
(imported from the client spreadsheet of documents/levels). One upload of "ASO"
per company is meaningless — it must be one ASO **per person, per posto, per
site** (certificates can vary by city).

## 2. What exists (exploration done 23/09 — production verified)

- **Catalog**: PF docs already exist as ELOS-native entries:
  `10012 CNH (manobristas)`, `10016 ASO`, `10017 Registro da Arma (PF)`,
  `10018 CNV`, `10019 Curso de formação técnica`; plus company programs
  `545 PCMSO`, `546 PGR`. `documents_catalog.dado_pessoal` flag exists
  (patch_052) — set on 10012/10016/10018 only.
- **Pilot client categories** (ELOS-native, 500k range) currently carrying PF
  docs in the PJ matrix: `500027 VIGILÂNCIA PATRIMONIAL ARMADA`,
  `500028 … QUARTEIRIZADA`, `500029 PORTARIA`, `500030 LIMPEZA PREDIAL E DE
  ÔNIBUS`, `500031 LAVAGEM DE VEÍCULOS`, `500025 CONTROLE DE PRAGAS` (only
  PCMSO/PGR).
- **Screens**: backoffice `ClientDocumentFlows.jsx` (abas "Fluxos de
  Categorias" + "Matriz de Documentos"), `DocumentAnalysis.jsx` (análise),
  supplier `Documents.jsx` (upload) — all keyed on the `documents` table.
- **Seal logic**: `requiredDocsForSeal` (netlify/functions/lib/required_docs.js)
  builds the required-doc denominator from `category_documents.required`.
- **Spreadsheets read** (both, 23/09):
  - *Vigilância Patrimonial*: cols Fornecedor, CNPJ, Contratante, Localidade,
    Estado, Função (PORTEIRO/VIGILANTE/SUPERVISOR), **Armado**, **Qtde Posto**,
    **Qtde Pessoas**. 16 rows for the pilot contratante → 22 postos / 49 pessoas,
    6 suppliers.
  - *Limpeza Predial e Veicular*: cols Fornecedor, CNPJ, Contratante,
    Localidade, Estado, **Qtde Pessoas**, Função (ASG/LAVADOR/… with rateio
    labels like "ASG 40%"). No Armado/Qtde Posto columns → each row = 1 posto,
    armado=false. 40 rows for the pilot contratante → 71 pessoas, 4 suppliers.
  - **Data issues to resolve at import**: one row with supplier name of one
    company but CNPJ of another (limpeza, name HIGITRONS on CNPJ 17210341000194
    = RRC); one vigilância row with CNPJ all zeros; função labels carry rateio
    percentages that are NOT categories.

## 3. Data model — `supabase/patch_093_mobilidade.sql`

```
mobility_posts            -- slot aberto pelo backoffice (sempre a partir de um CNPJ)
  id uuid pk
  client_id uuid not null -> clients
  category_id bigint not null -> categories   -- a "função" ≙ categoria de homologação
  supplier_cnpj text not null                 -- obrigatório; abre o slot ANTES do cadastro
  supplier_id uuid null -> suppliers          -- resolvido quando o CNPJ se cadastra/já existe
  site_city text not null, site_uf text not null
  armado boolean not null default false
  qty_posts int not null default 1, qty_people int not null
  funcao_label text                           -- rótulo original da planilha (ex. "ASG 40%")
  active boolean default true, source text default 'manual',  -- 'import'|'manual'
  created_by uuid, created_at timestamptz

mobility_people           -- pessoas alocadas num posto
  id uuid pk
  post_id uuid not null -> mobility_posts
  supplier_id uuid not null -> suppliers
  nome text not null
  cpf_digits text not null                    -- 11 dígitos; NUNCA exibido aberto (LGPD)
  active boolean default true, created_at
  unique(post_id, cpf_digits)

category_mobility_documents  -- a Matriz de Mobilidade (espelho da matriz PJ + escopo)
  id, category_id -> categories, document_id -> documents_catalog
  escopo text check in ('pessoa','posto')     -- pessoa: 1 doc por pessoa
                                              -- posto: 1 doc por posto/unidade
  required bool, blocking bool
  unique(category_id, document_id)

alter table documents add column mobility_person_id uuid null -> mobility_people,
                      add column mobility_post_id  uuid null -> mobility_posts;
-- PJ docs keep both null; doc de pessoa tem os dois; doc de posto só post_id.
```

RLS: supplier reads/writes own (`supplier_id` via `my_supplier_ids()`), admin
tudo (padrão SECURITY DEFINER RPC onde a tela for de listagem larga), client
lê os postos do próprio `client_id` (fase 2, fora deste escopo). CPF sai
**sempre mascarado** (`***.***.***-NN`) em qualquer payload de leitura — máscara
server-side (function/RPC), dígito completo só para dedupe/validação no servidor.

### Migração da matriz (mesmo patch)

Para toda categoria que hoje tem os docs PF na matriz PJ:

| Doc | Escopo | Regra |
|---|---|---|
| 10016 ASO, 10018 CNV, 10019 Curso, 10012 CNH | `pessoa` | migra sempre |
| 10017 Registro da Arma | `posto` | migra; exigido só quando `armado=true` |
| 545 PCMSO, 546 PGR | `posto` | migra (programas variam por unidade/cidade) |

`delete from category_documents` dessas linhas + `insert` em
`category_mobility_documents` (idempotente). `dado_pessoal=true` em 10017/10019.
Documentos PJ já enviados nesses tipos (se houver) permanecem em `documents`
sem vínculo de mobilidade — visíveis no histórico, não contam na nova matriz.

## 4. Backoffice — manutenção (ClientDocumentFlows.jsx, nova aba)

Nova aba **"👷 Mobilidade"** ao lado de Fluxos/Matriz, com dois painéis:

1. **Matriz de Mobilidade** — mesma UX da Matriz de Documentos: categoria →
   docs do catálogo, com coluna extra **Escopo** (Pessoa/Posto) + required/
   blocking.
2. **Postos** — grid CRUD; inclusão **começa pelo CNPJ** (obrigatório, DV
   validado): CNPJ → categoria (do cliente) → cidade/UF → armado → qtde postos
   → qtde pessoas → rótulo da função. Filtros por CNPJ/categoria/UF. Badge de
   progresso por posto (pessoas cadastradas × esperadas, docs ok × exigidos).

Ações via Netlify function (`admin-mobility.js`, service_role) — mesma
convenção das demais escritas privilegiadas.

## 5. Fornecedor (Documents.jsx + Process.jsx)

Se o CNPJ do fornecedor tem `mobility_posts` ativos (resolvidos no cadastro ou
por match de CNPJ ao logar), a tela de documentos ganha a seção em árvore:

```
📄 Documentos da Empresa            (hoje, inalterado)
👷 Documentos de Mobilidade
   └─ Posto: VIGILÂNCIA … — Cidade/UF (armado) — 1 posto / 4 pessoas
        ├─ Documentos do posto (escopo 'posto': PCMSO, PGR, Registro da Arma…)
        └─ Pessoas (4)
             ├─ [+ Cadastrar pessoa]  → Nome + CPF (obrigatório, DV validado)
             └─ Fulano — CPF ***.***.***-12
                  └─ docs escopo 'pessoa': ASO, CNV, Curso… (upload por pessoa)
```

- Upload cria `documents` com `mobility_person_id`/`mobility_post_id` — mesmo
  ciclo de status, mesma validação, mesmos e-mails de pendência.
- Pessoa pode ser inativada (substituição de colaborador); docs ficam no
  histórico.
- UI copy pt-BR seguindo os padrões da tela atual.

## 6. Backoffice — análise (DocumentAnalysis.jsx)

Mesma tela e mesmo processo dos docs PJ: a lista/fila ganha o agrupamento
"Documentos de Mobilidade" abaixo dos docs da empresa, abrindo
posto → pessoa → documento. Aprovar/rejeitar usa `admin-approve-document.js`
inalterado no essencial (a linha é um `documents` comum; o join extra traz
posto/pessoa para o cabeçalho). O RPC de listagem (`admin_list_documents`)
ganha os campos de mobilidade.

## 7. Selo / auto-finalização — DECIDIDO: mobilidade bloqueia

A auto-finalização do selo passa a exigir, para fornecedores com
`mobility_posts` ativos no cliente do selo:

1. cada posto ativo com `count(mobility_people active) >= qty_people`, e
2. todos os docs `required=true` da matriz de mobilidade aprovados
   (escopo 'pessoa': por pessoa ativa; escopo 'posto': por posto —
   Registro da Arma só quando `armado=true`).

Implementação em `required_docs.js` (nova função `mobilityPending(sb,
supplierId, clientId)`) usada por `admin-approve-document.js` na
auto-finalização; o posto também ganha o farol "Posto conforme" nas telas.
Fornecedor sem posto aberto: comportamento atual inalterado.

## 8. Importação dos postos (script ops)

`scripts/import_mobility_posts.py` (padrão dos demais ops):

- Lê as duas planilhas de `~/Downloads`, filtra `Empresa Contratante` ==
  contratante piloto (arg `--contratante`, aceita grafias com/sem acento),
  normaliza CNPJ (só dígitos, zero-pad 14, valida DV).
- Mapa Função → categoria do cliente (dicionário no script, com relatório de
  não-mapeados — nada é inserido às cegas):
  - Vigilância: `VIGILANTE` → 500027 (armado do campo Armado); `PORTEIRO` e
    `SUPERVISOR` → 500029 PORTARIA (decidido 23/09).
  - Limpeza: `ASG*`, `LAVADOR*` (exceto manobrista), `OPERADOR DE ETA`,
    `SUPERVISOR*` → 500030; `FRENTISTA/MANOBRISTA` e `LAVADOR MANOBRISTA` →
    500031 LAVAGEM DE VEÍCULOS (decidido 23/09).
  - Rótulo original (com rateio) preservado em `funcao_label`.
- Linhas rejeitadas (CNPJ inválido/zerado, contratante divergente, função sem
  mapa) saem num relatório ao final; nada de silencioso.
- Idempotente: `source='import'` + upsert por (client, cnpj, categoria, cidade,
  uf, funcao_label).

Volumetria esperada (pilot): vigilância 16 linhas → 22 postos/49 pessoas;
limpeza 40 linhas → 40 postos/71 pessoas.

## 9. Out of scope (fase 2+)

Visão do cliente (acompanhar postos), bloqueio de selo por posto, vencimento/
renovação por pessoa nos lembretes automáticos (entra no reminder de pendências
existente depois que a base estiver rodando), MFA.

## 10. Delivery steps

1. patch_093 (tabelas + RLS + migração da matriz + dado_pessoal) — SQL editor,
   commit junto com o código.
2. `admin-mobility.js` + service layer (`api.js`) + aba Mobilidade no
   ClientDocumentFlows.
3. Supplier: árvore de mobilidade em Documents.jsx (cadastro de pessoas +
   uploads vinculados).
4. Análise: agrupamento em DocumentAnalysis + campos no RPC.
5. Script de importação + execução assistida (relatório antes de gravar).
6. Verificação: `npm run build`, `node --check`, simulação com um CNPJ de
   teste da lista livre, depois limpeza padrão.
