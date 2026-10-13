"""Publica os manuais em PDF no bucket privado "manuais" (patch_137) — produção.

  python3 scripts/manuais/publicar_pdfs.py          (os 4 de docs/manuais/pdf/)

A página Ajuda (help-docs) entrega links temporários só para quem está logado.
Rode de novo sempre que regerar os PDFs (scripts/manuais/gerar_pdf.cjs).
"""
import os, urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
ENV = {l.split('=', 1)[0]: l.split('=', 1)[1].strip().strip('"') for l in open(os.path.join(ROOT, '.env')) if '=' in l and not l.startswith('#')}
SB, KEY = ENV['SUPABASE_URL'].rstrip('/'), ENV['SUPABASE_SERVICE_ROLE_KEY']
PDF = os.path.join(ROOT, 'docs/manuais/pdf')

for nome in sorted(os.listdir(PDF)):
    if not nome.endswith('.pdf'): continue
    req = urllib.request.Request(f'{SB}/storage/v1/object/manuais/{nome}', data=open(os.path.join(PDF, nome), 'rb').read(), method='POST',
                                 headers={'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/pdf', 'x-upsert': 'true'})
    with urllib.request.urlopen(req, timeout=120) as r: print('✓', nome, r.status)
