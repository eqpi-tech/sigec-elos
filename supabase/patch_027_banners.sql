-- patch_027_banners.sql
-- Sistema de banners de comunicação para a tela de login

CREATE TABLE IF NOT EXISTS banners (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Modo imagem (principal)
  image_url  TEXT,                   -- URL pública do Supabase Storage (bucket 'banners')
  image_alt  TEXT,                   -- Texto alternativo / acessibilidade

  -- Modo texto (fallback ou aviso rápido)
  title      TEXT,
  body       TEXT,
  tipo       TEXT DEFAULT 'novidade'
             CHECK (tipo IN ('novidade','manutencao','lancamento','produto','feriado')),

  -- CTA — funciona nos dois modos
  cta_label  TEXT,
  cta_url    TEXT,

  -- Agendamento
  starts_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at    TIMESTAMPTZ,            -- NULL = sem prazo de fim

  -- Controle
  active     BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,

  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE banners ENABLE ROW LEVEL SECURITY;

-- Qualquer pessoa (inclusive visitantes sem login) pode ler — necessário para o embed público
CREATE POLICY "banners_read_all" ON banners
  FOR SELECT USING (true);

-- Apenas ADMIN pode criar, editar e excluir
CREATE POLICY "banners_admin_write" ON banners
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'ADMIN')
  );

-- ─── Bucket de storage ────────────────────────────────────────────────────────
-- Execute no Supabase Dashboard → Storage → New bucket:
--   Name: banners
--   Public: true
--   Allowed MIME types: image/png
--   Max file size: 5MB
--
-- Policy de upload (somente ADMIN):
-- CREATE POLICY "banners_upload" ON storage.objects FOR INSERT
--   WITH CHECK (bucket_id = 'banners' AND
--     EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'ADMIN'));
--
-- Policy de leitura pública:
-- CREATE POLICY "banners_public_read" ON storage.objects FOR SELECT
--   USING (bucket_id = 'banners');
