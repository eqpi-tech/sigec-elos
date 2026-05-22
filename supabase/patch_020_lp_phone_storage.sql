-- patch_020_lp_phone_storage.sql
-- Adiciona campo phone à client_landing_pages
-- Cria bucket público de storage para imagens de LP

ALTER TABLE public.client_landing_pages
  ADD COLUMN IF NOT EXISTS phone VARCHAR(30);

-- Bucket público para logo e imagem de capa (máx. 5 MB, somente imagens)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'client-lp',
  'client-lp',
  true,
  5242880,
  ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

-- Políticas de storage: qualquer usuário autenticado pode fazer upload / gerenciar
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects' AND schemaname = 'storage'
    AND policyname = 'client_lp_auth_insert'
  ) THEN
    CREATE POLICY "client_lp_auth_insert" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'client-lp');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects' AND schemaname = 'storage'
    AND policyname = 'client_lp_auth_manage'
  ) THEN
    CREATE POLICY "client_lp_auth_manage" ON storage.objects
      FOR ALL TO authenticated
      USING (bucket_id = 'client-lp');
  END IF;
END $$;

DO $$
BEGIN
  RAISE NOTICE 'patch_020 aplicado: coluna phone adicionada, bucket client-lp criado';
END $$;
