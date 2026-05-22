-- patch_018_hoc_migration.sql
-- Adiciona colunas de rastreamento para migração do sistema legado HOC
-- Executar ANTES de rodar scripts/migrate_hoc.py

-- ── suppliers ────────────────────────────────────────────────────────────────
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS hoc_id           INTEGER UNIQUE;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS email            TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS contact_name     TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS regime_tributario TEXT;

-- ── clients ──────────────────────────────────────────────────────────────────
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS hoc_id INTEGER UNIQUE;

-- clients.user_id pode ser NULL para clientes importados sem usuário Supabase ainda
ALTER TABLE public.clients ALTER COLUMN user_id DROP NOT NULL;

-- ── seals ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.seals ADD COLUMN IF NOT EXISTS hoc_process_id  INTEGER;
ALTER TABLE public.seals ADD COLUMN IF NOT EXISTS hoc_expiry_date DATE;
ALTER TABLE public.seals ADD COLUMN IF NOT EXISTS hoc_resultado   TEXT;

-- ── documents ────────────────────────────────────────────────────────────────
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS hoc_arquivo_id INTEGER;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS hoc_s3_url     TEXT;

-- Índice único para evitar duplicação de arquivos HOC
CREATE UNIQUE INDEX IF NOT EXISTS documents_hoc_arquivo_unique
  ON public.documents(supplier_id, hoc_arquivo_id)
  WHERE hoc_arquivo_id IS NOT NULL;

-- ── plans ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS hoc_process_id INTEGER;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS source         TEXT DEFAULT 'STRIPE';

-- ── supplier_categories (tabela de vínculo fornecedor ↔ categoria) ────────────
-- Criada se não existir (patch_017 pode já ter criado)
CREATE TABLE IF NOT EXISTS public.supplier_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (supplier_id, category_id)
);

ALTER TABLE public.supplier_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sc_admin" ON public.supplier_categories;
CREATE POLICY "sc_admin" ON public.supplier_categories
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'ADMIN')
  );

DROP POLICY IF EXISTS "sc_supplier_read" ON public.supplier_categories;
CREATE POLICY "sc_supplier_read" ON public.supplier_categories
  FOR SELECT USING (
    supplier_id IN (
      SELECT supplier_id FROM public.user_roles WHERE user_id = auth.uid() AND role = 'SUPPLIER'
    )
  );

DO $$
BEGIN
  RAISE NOTICE 'patch_018 aplicado: colunas HOC adicionadas, clients.user_id agora nullable';
END $$;
