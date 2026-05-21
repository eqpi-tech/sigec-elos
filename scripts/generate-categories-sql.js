import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const csvPath   = process.argv[2] || join(__dirname, '../documentos e categorias elos.csv')
const outPath   = join(__dirname, '../supabase/patch_017_categories.sql')

// Lê como UTF-8 (arquivo pode ter BOM)
const content = readFileSync(csvPath, 'utf-8').replace(/^﻿/, '')
const lines   = content.split(/\r?\n/).filter(l => l.trim())

function parseLine(line) {
  const cols = []
  let cur = '', inQ = false
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ }
    else if (ch === ';' && !inQ) { cols.push(cur.trim()); cur = '' }
    else cur += ch
  }
  cols.push(cur.trim())
  return cols
}

const esc = s => (s || '').replace(/'/g, "''")

const categories = new Map() // catId (int) -> { name, parentId }
const documents  = new Map() // docId (int) -> name
const catDocs    = new Set() // `${catId}:${docId}`

for (let i = 1; i < lines.length; i++) {
  const [catIdStr, catName, parIdStr, docIdStr, docName] = parseLine(lines[i])

  if (!catIdStr || !catName) continue

  const catId    = parseInt(catIdStr, 10)
  const parentId = parIdStr ? parseInt(parIdStr, 10) : null
  const docId    = docIdStr ? parseInt(docIdStr, 10) : null

  if (isNaN(catId)) continue

  if (!categories.has(catId)) {
    categories.set(catId, {
      name:     catName.trim(),
      parentId: parentId && !isNaN(parentId) ? parentId : null,
    })
  }

  if (docId && !isNaN(docId) && docName) {
    if (!documents.has(docId)) documents.set(docId, docName.trim())
    catDocs.add(`${catId}:${docId}`)
  }
}

// Ordena por ID numérico — garante que pais sejam inseridos antes dos filhos
const sortedCats    = [...categories.entries()].sort((a, b) => a[0] - b[0])
const sortedDocs    = [...documents.entries()].sort((a, b) => a[0] - b[0])
const sortedCatDocs = [...catDocs].sort((a, b) => {
  const [ac, ad] = a.split(':').map(Number)
  const [bc, bd] = b.split(':').map(Number)
  return ac !== bc ? ac - bc : ad - bd
})

const catRows    = sortedCats.map(([id, { name, parentId }]) =>
  `  (${id}, '${esc(name)}', ${parentId !== null ? parentId : 'NULL'})`
)
const docRows    = sortedDocs.map(([id, name]) => `  (${id}, '${esc(name)}')`)
const catDocRows = sortedCatDocs.map(k => { const [c, d] = k.split(':'); return `  (${c}, ${d})` })

const sql = `-- patch_017_categories.sql
-- Categorias, catálogo de documentos, mapeamento padrão EQPI e fluxo por cliente
-- Gerado de "documentos e categorias elos.csv" em ${new Date().toISOString().slice(0, 10)}

-- ── 1. Categorias ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.categories (
  id        INTEGER PRIMARY KEY,
  name      TEXT    NOT NULL,
  parent_id INTEGER REFERENCES public.categories(id) ON DELETE SET NULL
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "categories_read" ON public.categories;
CREATE POLICY "categories_read" ON public.categories
  FOR SELECT USING (auth.role() = 'authenticated');

-- ── 2. Catálogo de documentos ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.documents_catalog (
  id   INTEGER PRIMARY KEY,
  name TEXT    NOT NULL
);

ALTER TABLE public.documents_catalog ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "documents_catalog_read" ON public.documents_catalog;
CREATE POLICY "documents_catalog_read" ON public.documents_catalog
  FOR SELECT USING (auth.role() = 'authenticated');

-- ── 3. Documentos exigidos por categoria (padrão EQPI) ────────────────────
CREATE TABLE IF NOT EXISTS public.category_documents (
  category_id INTEGER NOT NULL REFERENCES public.categories(id)        ON DELETE CASCADE,
  document_id INTEGER NOT NULL REFERENCES public.documents_catalog(id) ON DELETE CASCADE,
  PRIMARY KEY (category_id, document_id)
);

ALTER TABLE public.category_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "category_documents_read" ON public.category_documents;
CREATE POLICY "category_documents_read" ON public.category_documents
  FOR SELECT USING (auth.role() = 'authenticated');

-- ── 4. Fluxo de documentos personalizado por cliente ─────────────────────
--  Cópia do padrão que o CLIENT pode customizar (adicionar / remover docs).
--  required = false  → cliente removeu o documento do seu processo
--  Registro sem equivalente no padrão → cliente adicionou documento extra
CREATE TABLE IF NOT EXISTS public.client_document_flows (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID    NOT NULL REFERENCES public.clients(id)           ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES public.categories(id)        ON DELETE CASCADE,
  catalog_id  INTEGER NOT NULL REFERENCES public.documents_catalog(id) ON DELETE CASCADE,
  required    BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (client_id, category_id, catalog_id)
);

ALTER TABLE public.client_document_flows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "client_flows_own" ON public.client_document_flows;
CREATE POLICY "client_flows_own" ON public.client_document_flows
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id   = auth.uid()
        AND ur.role      = 'CLIENT'
        AND ur.client_id = client_document_flows.client_id
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'ADMIN'
    )
  );

-- ── 5. Categorias (id crescente: pais antes dos filhos) ───────────────────
INSERT INTO public.categories (id, name, parent_id) VALUES
${catRows.join(',\n')}
ON CONFLICT (id) DO UPDATE SET
  name      = EXCLUDED.name,
  parent_id = EXCLUDED.parent_id;

-- ── 6. Catálogo de documentos ──────────────────────────────────────────────
INSERT INTO public.documents_catalog (id, name) VALUES
${docRows.join(',\n')}
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name;

-- ── 7. Mapeamento categoria → documento ──────────────────────────────────
INSERT INTO public.category_documents (category_id, document_id) VALUES
${catDocRows.join(',\n')}
ON CONFLICT (category_id, document_id) DO NOTHING;

-- ── 8. Índices ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_categories_parent   ON public.categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_catdocs_category    ON public.category_documents(category_id);
CREATE INDEX IF NOT EXISTS idx_clientflows_client  ON public.client_document_flows(client_id);
CREATE INDEX IF NOT EXISTS idx_clientflows_catcat  ON public.client_document_flows(category_id, catalog_id);

DO $$
BEGIN
  RAISE NOTICE 'patch_017 aplicado: % categorias, % documentos, % vínculos cat→doc',
    (SELECT COUNT(*) FROM public.categories),
    (SELECT COUNT(*) FROM public.documents_catalog),
    (SELECT COUNT(*) FROM public.category_documents);
END $$;
`

writeFileSync(outPath, sql, 'utf-8')
console.log([
  `✓ ${categories.size} categorias`,
  `${documents.size} documentos`,
  `${catDocs.size} vínculos`,
  `→ ${outPath}`,
].join(' · '))
