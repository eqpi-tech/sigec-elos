-- PATCH 066: RLS de suppliers avaliada 1x por consulta, não por linha
-- is_admin()/get_user_role() eram chamadas POR LINHA (55,8k) → busca de
-- fornecedor levava 13s sob RLS (0,4s sem) → timeout → telas 'vazias'.
-- Padrão Supabase: embrulhar em (select fn()) vira InitPlan (avalia 1x).
DROP POLICY IF EXISTS suppliers_select ON suppliers;
CREATE POLICY suppliers_select ON suppliers FOR SELECT USING (
  user_id = auth.uid()
  OR (SELECT is_admin())
  OR (status = 'ACTIVE' AND (SELECT get_user_role()) = ANY (ARRAY['BUYER'::text, 'ADMIN'::text]))
);
-- PATCH 066 (v2): TODAS as funções da política como InitPlan — inclusive
-- auth.uid(), cujo inline parseava o JWT (jsonb) POR LINHA (55,8k×) e
-- deixava qualquer busca de fornecedor em ~13s sob RLS (timeout na tela).
DROP POLICY IF EXISTS suppliers_select ON suppliers;
CREATE POLICY suppliers_select ON suppliers FOR SELECT USING (
  user_id = (SELECT auth.uid())
  OR (SELECT is_admin())
  OR (status = 'ACTIVE' AND (SELECT get_user_role()) = ANY (ARRAY['BUYER'::text, 'ADMIN'::text]))
);
