-- patch_108_coleta_historico.sql — evidência da Rota A (28/09): a fila da
-- coleta passa a guardar a FONTE consultada e o HISTÓRICO de tentativas
-- (quando, resultado, motivo, custo) — exibido no quadro "Coleta automática"
-- da tela do processo no backoffice. Aplicar só no staging (depende do 098).
alter table auto_collect_jobs
  add column if not exists fonte text,
  add column if not exists history jsonb not null default '[]'::jsonb;

-- jobs já existentes: fonte pelo documento coletado ou pelo tipo
update auto_collect_jobs j set fonte = coalesce(
    (select d.metadata->'consulta'->>'fonte' from documents d where d.supplier_id = j.supplier_id and d.type = j.doc_type),
    case j.doc_type when '37' then 'receita_cadastro' when '62' then 'receita_simples' when '10001' then 'sintegra'
      when '42' then 'pgfn_cnd' when '7' then 'fgts_crf' when '8' then 'cndt' when '16' then 'sefaz_cnd' when '10039' then 'sefaz_cnd'
      when '6' then 'pref_cnd' when '10040' then 'pref_cnd' when '10038' then 'pgfn_devedores' when '10002' then 'trabalho_escravo'
      when '150' then 'falencia_rj' when '18' then 'ibama_cr' when '166' then 'pf_seguranca' end)
 where j.fonte is null;
