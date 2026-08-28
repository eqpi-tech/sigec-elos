-- PATCH 053: regra de validação no catálogo de documentos
-- Campo SÓ do ELOS (o sync HOC não o toca): descritivo de COMO o
-- backoffice valida cada tipo de documento. Editável na nova tela
-- /backoffice/catalogo-documentos e exibido no modal de análise.
ALTER TABLE documents_catalog ADD COLUMN IF NOT EXISTS validation_rule TEXT;

DROP POLICY IF EXISTS catalog_admin_write ON documents_catalog;
CREATE POLICY catalog_admin_write ON documents_catalog
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'ADMIN'))
  WITH CHECK (EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'ADMIN'));
