-- patch_137 — Bucket PRIVADO dos manuais da página Ajuda (13/10/2026)
-- Sem políticas para anon/authenticated: só o servidor (help-docs, service_role)
-- lê e gera links temporários para quem está logado. PDFs publicados por
-- scripts/manuais/publicar_pdfs.py (a partir de docs/manuais/pdf/).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('manuais', 'manuais', false, 20971520, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;
