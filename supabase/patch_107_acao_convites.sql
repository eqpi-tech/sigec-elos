-- patch_107_acao_convites.sql — item "Convites" no backoffice (28/09)
-- Nova ação de perfil 'acao:convites' (menu Análise → Convites). Perfis de
-- ADMIN que configuraram ações explicitamente não enxergariam a chave nova:
-- ela é incluída em todo perfil ADMIN que já tem 'acao:processos'.
-- Perfis sem nenhuma 'acao:' e o 'Acesso Total' ('*') já veem tudo.
update access_profiles
   set modules = array_append(modules, 'acao:convites')
 where role_type = 'ADMIN'
   and 'acao:processos' = any(modules)
   and not ('acao:convites' = any(modules));
