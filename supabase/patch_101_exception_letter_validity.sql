-- patch_101_exception_letter_validity.sql — Carta de Exceção com validade (28/09)
-- Regra nova (pedido do Luiz após o 1º uso real): o CLIENTE anexa a carta e
-- informa a VALIDADE — a exceção vale na hora, sem análise do backoffice.
-- A carta cobre os documentos da categoria que estavam pendentes/reprovados/
-- faltantes no momento do anexo (covered_docs). No vencimento: documentos
-- regularizados → exceção encerrada (EXCEPTION_RESOLVED); senão o processo
-- é SUSPENSO (EXCEPTION_EXPIRED) — rotina diária exception-letters-expire.
-- Idempotente.
alter table supplier_category_approvals
  add column if not exists letter_valid_until date,
  add column if not exists covered_docs text[] not null default '{}',
  add column if not exists closed_at timestamptz,
  add column if not exists warned_at timestamptz;

alter table supplier_category_approvals drop constraint if exists supplier_category_approvals_status_check;
alter table supplier_category_approvals add constraint supplier_category_approvals_status_check
  check (status in ('PENDING','ACTIVE','REJECTED','SUSPENDED',
                    'EXCEPTION_REQUESTED','EXCEPTION_APPROVED','EXCEPTION_EXPIRED','EXCEPTION_RESOLVED'));

create index if not exists idx_sca_exception_open
  on supplier_category_approvals (letter_valid_until) where status = 'EXCEPTION_APPROVED';
