-- patch_007_client_rls.sql
-- Permite que usuários CLIENT leiam suppliers e seals dos fornecedores que convidaram

-- Suppliers: CLIENT lê fornecedores vinculados às suas invitations
CREATE POLICY "client_read_invited_suppliers" ON public.suppliers
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.invitations i
      WHERE i.supplier_id = suppliers.id
        AND i.client_id IN (
          SELECT ur.client_id FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.client_id IS NOT NULL
        )
    )
  );

-- Seals: CLIENT lê seals dos fornecedores que convidou
CREATE POLICY "client_read_invited_seals" ON public.seals
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.invitations i
      WHERE i.supplier_id = seals.supplier_id
        AND i.client_id IN (
          SELECT ur.client_id FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.client_id IS NOT NULL
        )
    )
  );

-- Documents: CLIENT lê documentos dos fornecedores que convidou
CREATE POLICY "client_read_invited_documents" ON public.documents
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.invitations i
      WHERE i.supplier_id = documents.supplier_id
        AND i.client_id IN (
          SELECT ur.client_id FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.client_id IS NOT NULL
        )
    )
  );

-- CNPJ Consultations: CLIENT lê consultas dos fornecedores que convidou
CREATE POLICY "client_read_invited_cnpj_consultations" ON public.cnpj_consultations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.invitations i
      WHERE i.supplier_id = cnpj_consultations.supplier_id
        AND i.client_id IN (
          SELECT ur.client_id FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.client_id IS NOT NULL
        )
    )
  );

-- Supplier Categories: CLIENT lê categorias dos fornecedores que convidou
CREATE POLICY "client_read_invited_supplier_categories" ON public.supplier_categories
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.invitations i
      WHERE i.supplier_id = supplier_categories.supplier_id
        AND i.client_id IN (
          SELECT ur.client_id FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.client_id IS NOT NULL
        )
    )
  );
