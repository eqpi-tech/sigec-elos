-- patch_077_ready_grant.sql (18/09)
-- Fornecedor e cliente exibem o status honesto do processo ("aguardando
-- fornecedor" × "em análise") usando a MESMA regra do servidor.
GRANT EXECUTE ON FUNCTION public.supplier_ready_for_analysis(uuid) TO authenticated;
