# Sincronização diária HOC → ELOS

> **Objetivo:** o HOC continua sendo operado pela equipe (análises, substituições de documentos, novos processos). Todo dia de madrugada, o ELOS é atualizado para espelhar o HOC. **Mão única**: nada do ELOS volta para o HOC — homologações do selo ELOS, fornecedores espontâneos do marketplace e enriquecimentos são exclusivos do ELOS e ficam intocados.

## Princípios (invioláveis)

1. **HOC manda** — para toda entidade vinculada (`hoc_id` preenchido), o valor do HOC prevalece quando o HOC tem valor. Campos que só existem no ELOS (user_id, enriquecimento `legado_eqpi`, dados de login) nunca são tocados.
2. **ELOS-only é intocável** — registros sem `hoc_id` (fornecedores espontâneos, selo ELOS, convites do marketplace) ficam fora do sync.
3. **MySQL somente leitura** — `SET SESSION transaction_read_only = 1` em toda conexão; escrita apenas no Supabase.
4. **Incremental por watermark** — todas as tabelas-chave do HOC têm `update_date` (verificado em 20/08): `fornecedor`, `processo`, `processo_documento`, `categoria`, `categoria_documento`, `documento`, `questao`. As sem watermark são pequenas e fazem diff completo: `balanco` (7,4k), `resposta` (621), clientes (17).
5. **Idempotente e auditável** — reprocessar o mesmo dia não duplica nada; cada execução grava contagens em uma tabela `sync_state`.
6. **Nunca DELETE** — remoções no HOC viram desativação/suspensão no ELOS (`active=false`, selo SUSPENDED), preservando histórico.

## Escopo por entidade

| # | Entidade HOC → ELOS | Estratégia | Volume diário estimado |
|---|---|---|---|
| 1 | contratantes → `clients` | diff completo (17 linhas) | ~0 |
| 2 | `categoria` → `categories` (por cliente) | upsert por `hoc_id` onde `update_date > watermark`; removidas → `active=false` | dezenas |
| 3 | `categoria_documento` → `category_documents` (Matriz) | idem, por watermark | dezenas |
| 4 | `documento` → `documents_catalog` | diff completo (535) | ~0 |
| 5 | `fornecedor` → `suppliers` | upsert cadastral por `hoc_id` (watermark). NÃO toca: `user_id`, e-mail/telefone se HOC vier vazio, colunas ELOS | dezenas |
| 6 | `processo` → `seals` + `supplier_categories` | processos com `update_date > watermark` → recalcula status do selo do cliente e vínculos de categoria | dezenas |
| 7 | `processo_documento` → `documents` | watermark (é a maior mesa: ~100–650 mudanças/dia medidos). Atualiza arquivo (`hoc_arquivo_id`), vencimento, situação | centenas |
| 8 | sócios / bancários / balanços / questionários | watermark onde houver; diff completo nas pequenas | dezenas |
| 9 | `log_processo` → `audit_log` (`HOC_LOG`) | incremental por `id > último hoc_log_id` (só ações humanas) | centenas |

**Conflito documentos (migrados):** se o fornecedor subiu um doc no ELOS e o analista atualizou o mesmo doc no HOC no mesmo dia, **o HOC vence** na madrugada (princípio 1). O `document_history` preserva a versão do ELOS. Vale comunicar à equipe: enquanto o HOC for o sistema operacional, alterações de documentos de migrados devem ser feitas lá.

**Fornecedores novos criados no HOC** após a migração entram no ELOS automaticamente (insert com `hoc_id` novo, mesmo caminho do sync).

## Infraestrutura

- **Script:** `scripts/sync_hoc_daily.py` — derivado do `migrate_hoc_v2.py` (reaproveita conexões, mapeamentos e as lições de upsert), com watermarks por entidade.
- **Estado:** tabela `sync_state` no Supabase (`entity, watermark, last_run_at, rows_read, rows_written, status, error`).
- **Agendamento (decisão pendente — recomendo tentar A):**
  - **A. GitHub Actions cron** (06:00 UTC = 03:00 BRT): já usamos p/ notificações. Requer que o runner alcance o MySQL do HOC (se o host aceita conexões externas — o Mac local alcança hoje; testar do runner). Credenciais em Secrets.
  - **B. VM mínima** (Lightsail/EC2 nano) com cron, na mesma rede/allowlist do MySQL. Mais robusto se o MySQL for restrito por IP.
  - **C. No servidor do próprio HOC** (cron local): menor latência, mas acopla ao legado.
- **Falhas:** e-mail de alerta via Resend quando `status='error'`; execução seguinte reprocessa a partir do watermark antigo (nada se perde).
- **Duração alvo:** 2–5 min por noite (volumes atuais).

## O que o sync NÃO faz

- Não replica `historico_status_homologacao` (12,8M — decisão adiada).
- Não mexe em selos ELOS (client_id NULL), planos Stripe, convites, interesses, perfis de usuário, LPs.
- Não deleta nada, nunca.

## Passos de implementação (após aprovação)

1. Tabela `sync_state` (patch_046) + esqueleto do script com watermarks.
2. Entidades 1–5 (cadastros) → rodar em modo dry-run e comparar contagens.
3. Entidades 6–9 (processos/documentos/log) → dry-run + validação manual de 5 fornecedores.
4. Teste de alcance do MySQL a partir do GitHub Actions → escolher A ou B.
5. Ativar cron + alerta de falha + 1 semana de acompanhamento dos relatórios.
