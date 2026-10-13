"""Extrai do HOC (SOMENTE LEITURA) os contatos da migração e grava em
hoc_migration_contacts (patch_134). Critério (decisão do Luiz, 13/10/2026):
  - usuários de CLIENTE ativos dos 4 clientes;
  - usuários de FORNECEDOR ativos com processo vigente ou aberto há < 1 ano
    (sem pré-cadastro/arquivado) com um dos 4 clientes;
  - fora: e-mails devolvidos (emails_bounced), status_envio_email = 0, e-mail inválido.
Uso: arch -x86_64 python3.12 scripts/migracao_hoc/extrair_contatos.py [--dry-run]
"""
import json, re, sys, os, csv, subprocess
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from migrate_hoc_v2 import connect_mysql

# ids dos clientes do HOC que migram (nomes lidos do próprio HOC — sem nomes no repositório)
HOC_CLIENT_IDS = [int(x) for x in os.environ.get('HOC_MIGRACAO_CLIENTES', '20,21,33,34').split(',')]
IDS = ','.join(map(str, HOC_CLIENT_IDS))
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
cfg = json.load(open(os.path.join(ROOT, 'scripts/hoc_migration_config.json')))
my = connect_mysql(cfg['hoc_mysql']); cur = my.cursor(dictionary=True)
cur.execute("SET SESSION transaction_read_only = 1")
cur.execute("SELECT @@session.transaction_read_only AS ro"); assert cur.fetchone()['ro'] == 1

cur.execute(f"SELECT id, COALESCE(NULLIF(TRIM(nome_fantasia), ''), razao_social) nome FROM cliente WHERE id IN ({IDS})")
CLIENTES = {r['id']: r['nome'].strip() for r in cur.fetchall()}

valido = re.compile(r'^[^@\s;,]+@[^@\s;,]+\.[^@\s;,]+$')
contatos = {}

cur.execute(f"""SELECT u.id, TRIM(LOWER(u.email)) email, u.nome, u.id_cliente, u.id_grupo FROM usuario u
  WHERE u.ativo = 1 AND u.tipo = 'C' AND u.id_cliente IN ({IDS}) AND COALESCE(u.status_envio_email, 1) <> 0
    AND NOT EXISTS (SELECT 1 FROM emails_bounced b WHERE LOWER(b.email) = LOWER(u.email))""")
for r in cur.fetchall():
    if not valido.match(r['email'] or ''): continue
    c = contatos.setdefault(r['email'], {'nome': r['nome'], 'tipo': 'CLIENT', 'users': set(), 'cli': set(), 'forn': set(), 'grupo': r['id_grupo']})
    c['users'].add(r['id']); c['cli'].add(r['id_cliente'])

cur.execute(f"""SELECT DISTINCT u.id, TRIM(LOWER(u.email)) email, u.nome, fl.id_cliente, p.id_fornecedor, u.id_grupo
  FROM processo p JOIN fluxo fl ON fl.id = p.id_fluxo
  JOIN usuario_fornecedor uf ON uf.id_fornecedor = p.id_fornecedor
  JOIN usuario u ON u.id = uf.id_usuario AND u.ativo = 1 AND u.tipo = 'F'
  WHERE fl.id_cliente IN ({IDS}) AND p.ativo = 1 AND p.data_arquivamento IS NULL AND p.pre_cadastro = 0
    AND (p.data_validade >= CURDATE() OR (p.data_fim IS NULL AND p.data_validade IS NULL AND p.data_inicio >= NOW() - INTERVAL 365 DAY))
    AND COALESCE(u.status_envio_email, 1) <> 0
    AND NOT EXISTS (SELECT 1 FROM emails_bounced b WHERE LOWER(b.email) = LOWER(u.email))""")
for r in cur.fetchall():
    if not valido.match(r['email'] or ''): continue
    c = contatos.setdefault(r['email'], {'nome': r['nome'], 'tipo': 'SUPPLIER', 'users': set(), 'cli': set(), 'forn': set(), 'grupo': r['id_grupo']})
    if c['tipo'] == 'CLIENT': continue          # quem é usuário de cliente recebe a versão de cliente
    c['users'].add(r['id']); c['cli'].add(r['id_cliente']); c['forn'].add(r['id_fornecedor'])
my.close()

arr = lambda xs: '{' + ','.join(str(x) for x in sorted(xs)) + '}'
arrt = lambda xs: '{' + ','.join('"' + x.replace('"', '') + '"' for x in xs) + '}'
out = os.path.join(ROOT, 'scripts/migracao_hoc/contatos.csv')   # gitignored (dados pessoais)
with open(out, 'w', newline='') as f:
    w = csv.writer(f)
    for email, c in contatos.items():
        w.writerow([email, (c['nome'] or '').strip(), c['tipo'], arr(c['users']), arr(c['cli']),
                    arrt([CLIENTES[i] for i in sorted(c['cli'])]), arr(c['forn']), c['grupo'] or ''])
print(f"contatos: {len(contatos)} · clientes: {sum(1 for c in contatos.values() if c['tipo']=='CLIENT')} · fornecedores: {sum(1 for c in contatos.values() if c['tipo']=='SUPPLIER')}")
if '--dry-run' in sys.argv: sys.exit(0)

db = [l.split('=', 1)[1].strip().strip('"') for l in open(os.path.join(ROOT, '.env')) if l.startswith('SUPABASE_DB_URL=')][0]
sql = f"""CREATE TEMP TABLE t (email text, nome text, tipo text, hoc_user_ids int[], hoc_client_ids int[], clientes text[], supplier_hoc_ids int[], hoc_group_id text);
\\copy t FROM '{out}' csv
INSERT INTO hoc_migration_contacts (email, nome, tipo, hoc_user_ids, hoc_client_ids, clientes, supplier_hoc_ids, hoc_group_id)
SELECT email, nome, tipo, hoc_user_ids, hoc_client_ids, clientes, supplier_hoc_ids, nullif(hoc_group_id,'')::int FROM t
ON CONFLICT (email) DO UPDATE SET nome = excluded.nome, tipo = excluded.tipo, hoc_user_ids = excluded.hoc_user_ids,
  hoc_client_ids = excluded.hoc_client_ids, clientes = excluded.clientes, supplier_hoc_ids = excluded.supplier_hoc_ids,
  hoc_group_id = excluded.hoc_group_id, updated_at = now();
SELECT tipo, count(*) FROM hoc_migration_contacts GROUP BY 1;"""
subprocess.run(['/usr/local/opt/libpq/bin/psql', db, '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-1', '-c', 'select 1'], check=True,
               env={**os.environ, 'PGGSSENCMODE': 'disable'}, capture_output=True)
r = subprocess.run(['/usr/local/opt/libpq/bin/psql', db, '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-1'], input=sql, text=True,
                   env={**os.environ, 'PGGSSENCMODE': 'disable'}, capture_output=True)
print(r.stdout, r.stderr)
