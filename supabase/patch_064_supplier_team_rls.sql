-- PATCH 064: acesso do fornecedor via VÍNCULO (user_roles), não só via dono
-- suppliers/documents/plans só reconheciam suppliers.user_id = auth.uid().
-- Usuários adicionais de equipe E as contas da campanha primeiro acesso
-- (fornecedores migrados têm user_id NULL) não liam a própria empresa
-- (406 no piloto). seals/supplier_categories já eram team-aware.
CREATE OR REPLACE FUNCTION public.my_supplier_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT supplier_id FROM user_roles
  WHERE user_id = auth.uid() AND role = 'SUPPLIER'
    AND supplier_id IS NOT NULL AND COALESCE(is_active, true)
$fn$;

DROP POLICY IF EXISTS suppliers_team_select ON suppliers;
CREATE POLICY suppliers_team_select ON suppliers FOR SELECT TO authenticated
  USING (id IN (SELECT my_supplier_ids()));
DROP POLICY IF EXISTS suppliers_team_update ON suppliers;
CREATE POLICY suppliers_team_update ON suppliers FOR UPDATE TO authenticated
  USING (id IN (SELECT my_supplier_ids()));

DROP POLICY IF EXISTS documents_team_all ON documents;
CREATE POLICY documents_team_all ON documents FOR ALL TO authenticated
  USING (supplier_id IN (SELECT my_supplier_ids()))
  WITH CHECK (supplier_id IN (SELECT my_supplier_ids()));

DROP POLICY IF EXISTS plans_team_select ON plans;
CREATE POLICY plans_team_select ON plans FOR SELECT TO authenticated
  USING (supplier_id IN (SELECT my_supplier_ids()));
