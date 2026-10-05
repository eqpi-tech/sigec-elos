-- patch_115 — cliente enxerga os fornecedores dos SEUS processos (05/10/2026)
-- Aprovado pelo Luiz em 05/10/2026 (pré-requisito da migração HOC→ELOS por cliente).
--
-- Até aqui o cliente só lia fornecedor/documentos/categorias de quem ele
-- CONVIDOU (policies client_read_invited_*). Os processos migrados do HOC não
-- têm convite: MVV via 0 de 771 fornecedores e Atlantic Nickel 2 de 931 — o
-- selo aparecia, mas sem nome, documentos nem categorias.
--
-- Regra nova (SOMENTE LEITURA): fornecedor com selo (processo) do cliente do
-- usuário logado. As policies por convite continuam valendo (fluxo novo).
-- Função SECURITY DEFINER avaliada uma vez por consulta (IN (SELECT ...)),
-- mesmo padrão de my_supplier_ids() do patch_064.

CREATE OR REPLACE FUNCTION public.my_client_supplier_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT DISTINCT s.supplier_id
  FROM seals s
  WHERE s.supplier_id IS NOT NULL
    AND s.client_id IN (
      SELECT ur.client_id FROM user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'CLIENT'
        AND ur.client_id IS NOT NULL AND COALESCE(ur.is_active, true))
$fn$;

REVOKE ALL ON FUNCTION public.my_client_supplier_ids() FROM public;
GRANT EXECUTE ON FUNCTION public.my_client_supplier_ids() TO authenticated;

DROP POLICY IF EXISTS client_read_process_suppliers ON suppliers;
CREATE POLICY client_read_process_suppliers ON suppliers FOR SELECT TO authenticated
  USING (id IN (SELECT my_client_supplier_ids()));

DROP POLICY IF EXISTS client_read_process_documents ON documents;
CREATE POLICY client_read_process_documents ON documents FOR SELECT TO authenticated
  USING (supplier_id IN (SELECT my_client_supplier_ids()));

DROP POLICY IF EXISTS client_read_process_supplier_categories ON supplier_categories;
CREATE POLICY client_read_process_supplier_categories ON supplier_categories FOR SELECT TO authenticated
  USING (supplier_id IN (SELECT my_client_supplier_ids()));
