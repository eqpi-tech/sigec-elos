import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const csvPath   = process.argv[2] || join(__dirname, '../tabela_cnae.csv')
const outPath   = join(__dirname, '../supabase/patch_014_cnaes.sql')

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

const rows = []
for (let i = 1; i < lines.length; i++) {
  const [codigo, descricao, codigo_setor, setor] = parseLine(lines[i])
  if (!codigo || !descricao) continue
  rows.push(`  ('${esc(codigo)}', '${esc(descricao)}', '${esc(codigo_setor)}', '${esc(setor)}')`)
}

const sql = `-- patch_014_cnaes.sql
-- Tabela de referência de CNAEs (gerada automaticamente de tabela_cnae.csv)

CREATE TABLE IF NOT EXISTS public.cnaes (
  codigo       TEXT PRIMARY KEY,
  descricao    TEXT NOT NULL,
  codigo_setor TEXT,
  setor        TEXT
);

ALTER TABLE public.cnaes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cnaes_read" ON public.cnaes;
CREATE POLICY "cnaes_read" ON public.cnaes
  FOR SELECT USING (auth.role() = 'authenticated');

INSERT INTO public.cnaes (codigo, descricao, codigo_setor, setor)
VALUES
${rows.join(',\n')}
ON CONFLICT (codigo) DO UPDATE SET
  descricao    = EXCLUDED.descricao,
  codigo_setor = EXCLUDED.codigo_setor,
  setor        = EXCLUDED.setor;

DO $$
BEGIN
  RAISE NOTICE 'patch_014 aplicado: % CNAEs importados', (SELECT COUNT(*) FROM public.cnaes);
END $$;
`

writeFileSync(outPath, sql, 'utf-8')
console.log(`✓ ${rows.length} CNAEs → ${outPath}`)
