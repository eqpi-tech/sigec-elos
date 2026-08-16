-- ============================================================
-- PATCH 034 — Fornecedor lê os clientes aos quais está vinculado
-- Bug: a tabela clients só tinha clients_self_all → joins
-- clients(razao_social) retornavam NULL para fornecedores, e a
-- UI caía em fallbacks errados ("SIGEC-ELOS" no certificado,
-- nome cortado na carteira de selos).
-- Vínculo = selo ou convite ligando o supplier ao cliente.
-- ============================================================

DROP POLICY IF EXISTS clients_read_linked_supplier ON clients;
CREATE POLICY clients_read_linked_supplier ON clients
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN seals s ON s.supplier_id = ur.supplier_id
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'SUPPLIER'
        AND s.client_id = clients.id
    )
    OR EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN invitations i ON i.supplier_id = ur.supplier_id
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'SUPPLIER'
        AND i.client_id = clients.id
    )
  );
