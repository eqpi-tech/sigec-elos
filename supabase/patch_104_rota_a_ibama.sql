-- patch_104_rota_a_ibama.sql — Rota A, fase 1b: doc 18 (IBAMA — Certificado
-- de Regularidade do CTF/APP) passa a ser coletado na fonte (conector
-- ibama_cr). Sem cadastro no CTF a sugestão é "revisar" (nem toda atividade
-- exige). Aplicar só no staging por enquanto (depende do patch_098).
update documents_catalog set route = 'A', validation_mode = 'assistido' where id = 18;
