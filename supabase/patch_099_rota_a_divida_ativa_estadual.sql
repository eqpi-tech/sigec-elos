-- patch_099_rota_a_divida_ativa_estadual.sql — Rota A (homologação automática)
-- Doc 10039 "Certidão negativa de dívida ativa estadual" (fluxo Medicina N2)
-- passa a ser coletado pela mesma consulta da CND Estadual da Sefaz
-- (lib/route_a.js). Cobertura parcial como o doc 16: praça sem serviço ou
-- Sefaz que exige certificado digital volta para upload do fornecedor.
-- Aplicar PRIMEIRO no staging (depende do patch_098).
update documents_catalog set route = 'A*', validation_mode = 'assistido' where id = 10039;
