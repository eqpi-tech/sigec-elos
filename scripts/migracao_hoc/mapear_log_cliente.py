"""Carga de hoc_log_cliente (patch_144): registro do log do HOC → cliente do HOC.

  python3 scripts/migracao_hoc/mapear_log_cliente.py           # carga dos clientes da migração

A importação do log (HOC_LOG no audit_log) não guardou o processo; esta tabela
liga cada registro ao cliente, para o cliente ver no ELOS só o log do processo
DELE (client_process_log). Os registros novos já chegam com hoc_cliente_id no
metadata (sync_hoc_daily.py). HOC: SOMENTE LEITURA. Idempotente.
"""
import csv, json, os, subprocess, sys, tempfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from migrate_hoc_v2 import connect_mysql

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
ENV = {l.split('=', 1)[0]: l.split('=', 1)[1].strip().strip('"') for l in open(os.path.join(ROOT, '.env')) if '=' in l and not l.startswith('#')}
DB = ENV['SUPABASE_DB_URL']
PSQL = '/usr/local/opt/libpq/bin/psql'
HOC_CLIENT_IDS = [int(x) for x in os.environ.get('HOC_MIGRACAO_CLIENTES', '20,21,33,34').split(',')]
# mesmo filtro da importação do log (só ações humanas)
HUMAN = """l.created_by NOT LIKE '%batch%' AND l.created_by <> 'sys' AND l.created_by NOT LIKE 'consulta.automatica%'"""

cfg = json.load(open(os.path.join(ROOT, 'scripts/hoc_migration_config.json')))
my = connect_mysql(cfg['hoc_mysql']); cur = my.cursor()
cur.execute("SET SESSION transaction_read_only = 1")
cur.execute("SELECT @@session.transaction_read_only"); assert cur.fetchone()[0] == 1, 'HOC não está em modo leitura'

ids = ','.join(map(str, HOC_CLIENT_IDS))
cur.execute(f"""SELECT l.id, fl.id_cliente FROM log_processo l
    JOIN processo p ON p.id = l.id_processo JOIN fluxo fl ON fl.id = p.id_fluxo
    WHERE fl.id_cliente IN ({ids}) AND {HUMAN}""")
tmp = tempfile.NamedTemporaryFile('w', suffix='.csv', delete=False, newline='')
w = csv.writer(tmp); n = 0
for row in cur:
    w.writerow(row); n += 1
tmp.close(); my.close()
print(f'{n} registros lidos do HOC (clientes {ids})')

sql = f"""\\set ON_ERROR_STOP 1
BEGIN;
CREATE TEMP TABLE _m (hoc_log_id integer, hoc_cliente_id integer);
\\copy _m FROM '{tmp.name}' WITH (FORMAT csv)
INSERT INTO hoc_log_cliente SELECT DISTINCT ON (hoc_log_id) hoc_log_id, hoc_cliente_id FROM _m ON CONFLICT (hoc_log_id) DO NOTHING;
SELECT count(*) FROM hoc_log_cliente;
COMMIT;
"""
r = subprocess.run([PSQL, DB, '-X', '-q', '-At'], input=sql, capture_output=True, text=True, env={**os.environ, 'PGGSSENCMODE': 'disable'})
os.unlink(tmp.name)
if r.returncode: raise SystemExit(r.stderr)
print('hoc_log_cliente agora com', r.stdout.strip().splitlines()[-1], 'linhas')
