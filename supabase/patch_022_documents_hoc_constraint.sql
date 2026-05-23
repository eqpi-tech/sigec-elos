-- patch_022_documents_hoc_constraint.sql
-- Corrige a constraint de documentos HOC para suportar ON CONFLICT via PostgREST.
-- patch_018 criou um índice parcial (WHERE hoc_arquivo_id IS NOT NULL) que o
-- PostgREST não consegue usar para resolução de conflito em upsert (erro 42P10).
-- Solução: substituir pelo constraint UNIQUE completo.
-- NULLs em hoc_arquivo_id são permitidos em múltiplas linhas (NULL ≠ NULL no PostgreSQL).

DROP INDEX IF EXISTS public.documents_hoc_arquivo_unique;

ALTER TABLE public.documents
  ADD CONSTRAINT documents_hoc_arquivo_unique
  UNIQUE (supplier_id, hoc_arquivo_id);

DO $$
BEGIN
  RAISE NOTICE 'patch_022 aplicado: constraint UNIQUE(supplier_id, hoc_arquivo_id) criada';
END $$;
