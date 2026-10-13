-- patch_136 — Perfis e limite de usuários da migração HOC → ELOS (13/10/2026)
--
-- 1) Perfis de cliente do de/para dos grupos do HOC (decisão do Luiz, 13/10):
--      Gestão de Fornecedores (grupos 11 e 31) · Gerencial (35)
--      Comprador (12 e 36) · Consulta (15, somente leitura)
--    Todos com chaves 'acao:' explícitas, para as ações valerem (hasAction).
-- 2) Empresas migradas do HOC (suppliers.hoc_id) não têm o limite de 4
--    usuários: no HOC há empresas com até 20 usuários ativos.

INSERT INTO public.access_profiles (name, role_type, modules, is_system)
SELECT v.name, 'CLIENT', v.modules, false
FROM (VALUES
  ('Gestão de Fornecedores', ARRAY['dashboard','fornecedores','convites','rfq','questionarios','relatorios','compliance','configuracoes','equipe',
     'acao:todos_fornecedores','acao:interessados','acao:pre_cadastros','acao:ver_documentos','acao:carta_excecao',
     'acao:priorizar_analise','acao:enviar_doc_cliente','acao:novo_convite','acao:nova_cotacao']),
  ('Gerencial', ARRAY['dashboard','fornecedores','convites','rfq','questionarios','relatorios','compliance','equipe',
     'acao:todos_fornecedores','acao:interessados','acao:pre_cadastros','acao:ver_documentos','acao:carta_excecao',
     'acao:priorizar_analise','acao:enviar_doc_cliente','acao:novo_convite','acao:nova_cotacao']),
  ('Comprador', ARRAY['dashboard','fornecedores','convites','rfq','questionarios','relatorios',
     'acao:todos_fornecedores','acao:interessados','acao:pre_cadastros','acao:ver_documentos','acao:novo_convite','acao:nova_cotacao']),
  ('Consulta', ARRAY['dashboard','fornecedores','relatorios','acao:ver_documentos'])
) AS v(name, modules)
WHERE NOT EXISTS (SELECT 1 FROM public.access_profiles a WHERE a.name = v.name AND a.role_type = 'CLIENT');

CREATE OR REPLACE FUNCTION public.fn_check_supplier_user_limit()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.role = 'SUPPLIER' AND NEW.is_active = true
     -- migrada do HOC: sem limite (patch_136)
     AND NOT EXISTS (SELECT 1 FROM public.suppliers s WHERE s.id = NEW.supplier_id AND s.hoc_id IS NOT NULL) THEN
    IF (SELECT COUNT(*) FROM public.user_roles
        WHERE supplier_id = NEW.supplier_id AND role = 'SUPPLIER' AND is_active = true
          AND id IS DISTINCT FROM NEW.id) >= 4 THEN
      RAISE EXCEPTION 'Limite de 4 usuários por fornecedor atingido';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
