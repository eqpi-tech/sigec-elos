-- patch_100_exception_letter_status.sql — Carta de Exceção (patch_051)
-- O patch_051 passou a gravar os status EXCEPTION_REQUESTED (carta anexada)
-- e EXCEPTION_APPROVED (homologado com exceção) em
-- supplier_category_approvals, mas não ampliou o CHECK da tabela: todo
-- anexo de carta falhava no insert (achado 28/09, processo da SALUMED).
-- Idempotente.
alter table supplier_category_approvals drop constraint if exists supplier_category_approvals_status_check;
alter table supplier_category_approvals add constraint supplier_category_approvals_status_check
  check (status in ('PENDING','ACTIVE','REJECTED','SUSPENDED','EXCEPTION_REQUESTED','EXCEPTION_APPROVED'));
