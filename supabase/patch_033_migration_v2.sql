-- ============================================================
-- PATCH 033 — Preparação da Migração HOC v2
-- Executar ANTES de scripts/migrate_hoc_v2.py
--
-- Convenção de IDs: categorias de cliente migradas recebem
-- id = 1.000.000 + id_hoc (determinístico, sem colisão com a
-- árvore global que usa o namespace original do HOC < 1M).
-- ============================================================

-- ── categories: rastreio HOC + metadados do cliente ─────────
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS hoc_id   INTEGER;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS codigo   TEXT;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS name_en  TEXT;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS active   BOOLEAN NOT NULL DEFAULT TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS categories_hoc_client_unique
  ON public.categories(hoc_id) WHERE hoc_id IS NOT NULL;

-- ── category_documents: flags que podem faltar ──────────────
ALTER TABLE public.category_documents ADD COLUMN IF NOT EXISTS required BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.category_documents ADD COLUMN IF NOT EXISTS blocking BOOLEAN NOT NULL DEFAULT FALSE;

-- ── documents_catalog: config vinda do HOC ──────────────────
-- responsibility e analysis_sla_days já existem (patch_031)
ALTER TABLE public.documents_catalog ADD COLUMN IF NOT EXISTS auto_collect BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.documents_catalog ADD COLUMN IF NOT EXISTS hoc_tipo     TEXT;
ALTER TABLE public.documents_catalog ADD COLUMN IF NOT EXISTS active       BOOLEAN NOT NULL DEFAULT TRUE;

-- ── clients: sigla do HOC (usada em seal_name e relatórios) ──
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS sigla TEXT;

-- ── documents: garantir rastreio v1 presente ─────────────────
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS hoc_arquivo_id INTEGER;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS hoc_s3_url     TEXT;
