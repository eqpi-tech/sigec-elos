-- ============================================================
-- PATCH 042 — Cliente baixa documentos de fornecedores vinculados
-- por SELO (não só por convite).
-- Bug: patch_015 só cobria vínculo via invitations; fornecedores
-- migrados do HOC vinculam-se ao cliente via seals.client_id e o
-- cliente não conseguia gerar signed URL dos arquivos ELOS.
-- Regra: cliente vê documentos APENAS de fornecedores que passam ou
-- passaram por homologação com ele (convite OU selo).
-- ============================================================

DROP POLICY IF EXISTS "client_read_invited_supplier_docs" ON storage.objects;

CREATE POLICY "client_read_invited_supplier_docs"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'documents'
    AND EXISTS (
      SELECT 1
      FROM public.suppliers s
      JOIN public.user_roles ur ON ur.user_id = auth.uid() AND ur.role = 'CLIENT'
      WHERE s.user_id::text = (storage.foldername(name))[1]
        AND (
          EXISTS (SELECT 1 FROM public.invitations i
                  WHERE i.supplier_id = s.id AND i.client_id = ur.client_id)
          OR
          EXISTS (SELECT 1 FROM public.seals se
                  WHERE se.supplier_id = s.id AND se.client_id = ur.client_id)
        )
    )
  );
