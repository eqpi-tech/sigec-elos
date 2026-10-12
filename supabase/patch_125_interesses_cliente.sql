-- patch_125 — Interessados do cliente com nome e CNPJ (12/10/2026)
-- A aba "Interessados" lia suppliers(...) embutido em supplier_interests e o
-- RLS de suppliers só deixa o CLIENTE ver fornecedores com processo/convite
-- dele — quem declarou interesse (homologado para OUTRO cliente) vinha sem
-- nome e sem CNPJ. RPC SECURITY DEFINER guardada pelo vínculo CLIENT (ou
-- ADMIN), devolvendo só os campos da lista — sem abrir a tabela suppliers.

CREATE OR REPLACE FUNCTION public.client_supplier_interests(p_client uuid)
 RETURNS TABLE(id uuid, supplier_id uuid, message text, created_at timestamptz,
               razao_social text, cnpj text, city text, state text,
               email text, phone text, contact_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT i.id, i.supplier_id, i.message, i.created_at,
         s.razao_social, s.cnpj, s.city, s.state, s.email, s.phone, s.contact_name
  FROM supplier_interests i
  JOIN suppliers s ON s.id = i.supplier_id
  WHERE i.client_id = p_client AND i.status = 'PENDING'
    AND ((SELECT public.is_admin()) OR EXISTS (
          SELECT 1 FROM user_roles ur
          WHERE ur.user_id = auth.uid() AND ur.role = 'CLIENT'
            AND ur.client_id = p_client AND coalesce(ur.is_active, true)))
  ORDER BY i.created_at DESC;
$function$;

GRANT EXECUTE ON FUNCTION public.client_supplier_interests(uuid) TO authenticated;
