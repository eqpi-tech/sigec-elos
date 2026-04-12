-- PATCH 001 — Fixes necessários para o MVP funcionar
-- Execute no SQL Editor do Supabase

-- 1. Unique constraint para o upsert de documentos funcionar
ALTER TABLE public.documents
  DROP CONSTRAINT IF EXISTS documents_supplier_type_unique;
ALTER TABLE public.documents
  ADD CONSTRAINT documents_supplier_type_unique UNIQUE (supplier_id, type);

-- 2. Policies de Storage para o bucket 'documents'
--    (execute após criar o bucket via dashboard)
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "supplier_upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'documents'
    AND (auth.uid()::text) = (storage.foldername(name))[1]
  );

CREATE POLICY "supplier_read_own"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'documents'
    AND (auth.uid()::text) = (storage.foldername(name))[1]
  );

CREATE POLICY "admin_read_all"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'documents'
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'ADMIN'
  );

CREATE POLICY "admin_update_all"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'documents'
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'ADMIN'
  );
