# ENRICHMENT_PLAN.md — Enriquecimento do ELOS com bases legadas PF/PJ (S3)

Leia este plano inteiro antes de escrever qualquer código. Você já tem acesso
ao S3 (bases legadas PF/PJ da EQPI) e ao Supabase do projeto ELOS — use as
credenciais/conexões já configuradas no projeto, não peça novas.

**Regra de ouro do projeto inteiro: dados que já existem no ELOS nunca são
sobrescritos. Só preenchemos campos vazios (sócios, telefone, e-mail).**
CNPJs que não existem ainda no ELOS vão para uma tabela separada de
prospects, não direto para a tabela pública de fornecedores.

Execute em fases. Pare e reporte ao final de cada fase antes de avançar —
principalmente antes de qualquer escrita em produção.

## Fase 0 — Descobrir o schema real

Não assuma nomes de tabela/coluna. Rode contra o Supabase:

```sql
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
order by table_name, ordinal_position;
```

Identifique: tabela de fornecedores/empresas (chave CNPJ), tabela de
sócios/partners (chave CNPJ da empresa + CPF do sócio), e quais colunas de
contato (email, telefone) existem e como estão nomeadas. Reporte o que
encontrou antes de seguir.

## Fase 1 — Profiling das bases legadas

Sem baixar os 43GB inteiros. Use DuckDB com `httpfs` para ler amostra direto
do S3 (`read_csv_auto(..., sample_size=10000)`). Confirme: delimitador,
encoding (bases legadas BR costumam vir em latin1), se CNPJ/CPF têm máscara
ou zeros à esquerda truncados. Reporte a estrutura encontrada nas duas bases
(PF e PJ) antes de seguir — especialmente como a base PF referencia a empresa
(campo de vínculo CNPJ↔sócio pode não existir ou ter nome diferente do
esperado).

## Fase 2 — Normalização → parquet

Converta as duas bases de CSV para parquet normalizado (isso reduz
drasticamente o volume processado depois). Regras:
- CNPJ/CPF: só dígitos, `varchar`, padded a 14/11 posições
- Telefone: só dígitos
- E-mail: lowercase + trim
- Descartar linhas com CNPJ/CPF de tamanho inválido

Reporte contagem de linhas lidas vs linhas válidas após normalização, para
cada base.

## Fase 3 — Export das chaves do ELOS

Exporte do Supabase (via DuckDB `postgres` extension ou client direto) só as
colunas necessárias para o match: CNPJ + campos de contato atuais da tabela
de fornecedores, e CNPJ+CPF da tabela de sócios. Não exporte a base inteira,
só o necessário para o join.

## Fase 4 — Match e delta

Join por CNPJ normalizado entre export do ELOS e base legada PJ.
Delta = `coalesce(elos.campo, legado.campo)`, isto é, só gera valor novo
quando o campo do ELOS está vazio. Para sócios: gerar candidatos a insert
(não update) com dedupe por CNPJ+CPF, evitando duplicar sócio já cadastrado.

Reporte: total de CNPJs com match, % de preenchimento de email/telefone
antes vs depois do delta, quantidade de sócios novos candidatos.
**Pare aqui e mostre uma amostra de ~50 linhas do delta antes de aplicar
qualquer coisa em produção.**

## Fase 5 — CNPJs novos (fora do ELOS)

CNPJs presentes na base legada e ausentes no ELOS vão para uma tabela nova
`prospects_hoc_legado` (cnpj, email, telefone, source, imported_at) — nunca
direto na tabela de fornecedores. Isso evita que apareçam no marketplace sem
nunca terem se cadastrado no ELOS.

## Fase 6 — Aplicação em produção

Só depois de validação manual da Fase 4:
1. Rodar primeiro contra o ambiente de staging do Supabase, se existir
2. `COPY` do delta para uma staging table + `UPDATE ... FROM staging` dentro
   de transação
3. Usar a mesma disciplina de acesso do projeto: escrita sensível
   server-side/local com credencial privilegiada, nunca client-side
4. Adicionar/usar colunas `enriched_from` e `enriched_at` nos registros
   alterados, para auditoria
5. Confirmar snapshot/backup do banco existe antes do `UPDATE`

## Ao terminar cada fase, reporte

- O que foi encontrado/decidido
- Contagens relevantes (linhas, matches, deltas)
- Qualquer divergência do que este plano assumiu (schema diferente,
  estrutura de vínculo sócio↔empresa diferente, encoding inesperado etc.)

Não aplique nada em produção sem esse checkpoint manual explícito na Fase 4.
