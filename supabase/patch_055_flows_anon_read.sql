-- PATCH 055: portal white-label (anon) lê os fluxos ativos do cliente
-- para exibir os pacotes de homologação com o preço NÃO subsidiado.
DROP POLICY IF EXISTS client_flows_anon_read ON client_flows;
CREATE POLICY client_flows_anon_read ON client_flows
  FOR SELECT TO anon USING (active = true);
