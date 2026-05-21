-- patch_015_client_storage_policy.sql
-- Permite que usuários CLIENT gerem signed URLs para documentos de fornecedores
-- que eles próprios convidaram (via invitations.client_id = user_roles.client_id)

DROP POLICY IF EXISTS "client_read_invited_supplier_docs" ON storage.objects;

CREATE POLICY "client_read_invited_supplier_docs"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'documents'
    AND EXISTS (
      SELECT 1
      FROM public.suppliers s
      JOIN public.invitations i  ON i.supplier_id = s.id
      JOIN public.user_roles  ur ON ur.user_id     = auth.uid()
                                 AND ur.role        = 'CLIENT'
                                 AND ur.client_id   = i.client_id
      WHERE s.user_id::text = (storage.foldername(name))[1]
    )
  );

DO $$
BEGIN
  RAISE NOTICE 'patch_015 aplicado: policy client_read_invited_supplier_docs criada';
END $$;
