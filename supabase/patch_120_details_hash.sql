-- patch_120 — fase details do sync grava só o que mudou no HOC (07/10/2026)
--
-- A fase details (migrate_hoc_v2.py --phase details, semanal) regravava TODOS os
-- registros a cada execução: 55,9 mil fornecedores com o bloco hoc_extra, ~59,5
-- mil sócios, bancários e balanços — mesmo sem nenhuma mudança no HOC. Em 05–06/10
-- duas execuções seguidas contribuíram para derrubar o banco (compute Nano,
-- queda de 07/10). Cada linha passa a guardar o hash do conteúdo gravado; o
-- script compara antes e só grava o que mudou. Colunas só de controle do sync.

alter table if exists suppliers              add column if not exists hoc_details_hash text;
alter table if exists supplier_partners      add column if not exists hoc_hash text;
alter table if exists supplier_bank_accounts add column if not exists hoc_hash text;
alter table if exists supplier_financials    add column if not exists hoc_hash text;

comment on column suppliers.hoc_details_hash is
  'Hash do registro da fase details do sync HOC→ELOS; igual ao calculado = não regrava (patch_120).';
