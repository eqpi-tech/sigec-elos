-- patch_118 — "Meus Fornecedores" e Dashboard do cliente numa única chamada (05/10/2026)
--
-- clientApi.getSuppliers montava a lista no navegador baixando TODOS os convites
-- do cliente em páginas de 1.000, uma após a outra. Com o histórico do HOC
-- (patch_116) a Appian passou a 10.794 convites → 11 idas e voltas em série +
-- selos + cartas: a tela levava segundos para abrir. O banco responde cada
-- consulta em < 50 ms; o custo era a sequência de requisições.
--
-- Esta RPC devolve uma linha por fornecedor, já cruzada, em uma chamada.
-- SECURITY DEFINER: o cliente sai do usuário logado (auth.uid()), nunca de
-- parâmetro — mesma visibilidade das policies atuais: fornecedores com processo
-- (selo) do cliente (patch_115) + convidados PELO ELOS já cadastrados. O convite
-- do HOC finalizado sem processo vigente não vira item (ver getSuppliers).

CREATE OR REPLACE FUNCTION public.client_suppliers_overview()
RETURNS TABLE (supplier_id uuid, seal jsonb, supplier jsonb, invite jsonb, carta boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  WITH me AS (
    SELECT ur.client_id AS cid FROM user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'CLIENT'
      AND ur.client_id IS NOT NULL AND COALESCE(ur.is_active, true)
    LIMIT 1
  ),
  -- um selo por fornecedor (antes: o último por id vencia no mapa em JS)
  s AS (
    SELECT DISTINCT ON (s.supplier_id) s.*
    FROM seals s JOIN me ON s.client_id = me.cid
    WHERE s.supplier_id IS NOT NULL
    ORDER BY s.supplier_id, s.id DESC
  ),
  -- convite de referência por fornecedor: o REGISTERED mais recente, senão o mais recente
  inv AS (
    SELECT DISTINCT ON (i.supplier_id) i.*
    FROM invitations i JOIN me ON i.client_id = me.cid
    WHERE i.supplier_id IS NOT NULL
    ORDER BY i.supplier_id, (i.status = 'REGISTERED') DESC, i.created_at DESC
  ),
  ids AS (
    SELECT supplier_id FROM s
    UNION
    SELECT i.supplier_id FROM invitations i JOIN me ON i.client_id = me.cid
    WHERE i.status = 'REGISTERED' AND i.supplier_id IS NOT NULL AND i.hoc_id IS NULL
  ),
  cartas AS (
    SELECT DISTINCT a.supplier_id FROM supplier_category_approvals a JOIN me ON a.client_id = me.cid
    WHERE a.status = 'EXCEPTION_APPROVED' AND a.letter_valid_until >= current_date
  )
  SELECT ids.supplier_id,
    CASE WHEN s.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', s.id, 'supplier_id', s.supplier_id, 'level', s.level, 'status', s.status,
      'score', s.score, 'seal_name', s.seal_name, 'flow_id', s.flow_id,
      'issued_at', s.issued_at, 'expires_at', s.expires_at,
      'client_suspended_at', s.client_suspended_at, 'released_at', s.released_at,
      'hoc_process_id', s.hoc_process_id, 'priority_requested_at', s.priority_requested_at) END,
    CASE WHEN sp.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', sp.id, 'razao_social', sp.razao_social, 'cnpj', sp.cnpj, 'city', sp.city,
      'state', sp.state, 'status', sp.status, 'employee_range', sp.employee_range) END,
    CASE WHEN inv.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', inv.id, 'status', inv.status, 'subsidiado', inv.subsidiado,
      'tipo_fornecedor', inv.tipo_fornecedor, 'escopo', inv.escopo, 'created_at', inv.created_at,
      'supplier_razao_social', inv.supplier_razao_social, 'supplier_cnpj', inv.supplier_cnpj,
      'flow_id', inv.flow_id, 'hoc_id', inv.hoc_id) END,
    (cartas.supplier_id IS NOT NULL)
  FROM ids
  LEFT JOIN s       ON s.supplier_id = ids.supplier_id
  LEFT JOIN inv     ON inv.supplier_id = ids.supplier_id
  LEFT JOIN suppliers sp ON sp.id = ids.supplier_id
  LEFT JOIN cartas  ON cartas.supplier_id = ids.supplier_id
$fn$;

REVOKE ALL ON FUNCTION public.client_suppliers_overview() FROM public;
GRANT EXECUTE ON FUNCTION public.client_suppliers_overview() TO authenticated;
