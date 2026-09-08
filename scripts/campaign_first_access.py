# -*- coding: utf-8 -*-
# Campanha "Primeiro Acesso" — homologados HOC → contas ELOS + e-mail com link
# Aprovada em 08/09/2026 (CEO): opção B (link de primeiro acesso, sem senha
# no e-mail), template "Parabéns! ... Agora é com você".
#
# Público: usuários HOC ativo=1, e-mail válido, login < 1 ano, vinculados a
# fornecedor HOMOLOGADO no ELOS (selo ACTIVE, hoc_id mapeado).
#
# Idempotente/reexecutável:
#   · e-mail já existe no auth  → pulado (skip_email_exists)
#   · fornecedor já tem login   → pulado (skip_supplier_has_login) — conservador
# Relatório: ~/Downloads/campanha_resultado.csv
#
# Uso: PYTHONPATH=<pylibs> arch -x86_64 python3 scripts/campaign_first_access.py [--limit N]
import re, json, csv, sys, time, secrets, urllib.request, urllib.error
import pg8000.native

LIMIT = None
if '--limit' in sys.argv:
    LIMIT = int(sys.argv[sys.argv.index('--limit') + 1])

REDIRECT = ('https://elos.eqpitech.com.br/redefinir-senha?welcome=1'
            '&utm_source=email&utm_medium=crm&utm_campaign=primeiro_acesso_homologados')

env = {}
for l in open('.env'):
    l = l.strip()
    if l and not l.startswith('#') and '=' in l:
        k, v = l.split('=', 1); env[k] = v.strip().strip('"')
SB, KEY = env['SUPABASE_URL'].rstrip('/'), env['SUPABASE_SERVICE_ROLE_KEY']
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}

def sb_post(path, data):
    req = urllib.request.Request(f"{SB}{path}", data=json.dumps(data).encode(), headers=H, method="POST")
    return json.load(urllib.request.urlopen(req))

def email_html(action_link):
    return f"""<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto">
  <div style="background:#2E3192;padding:28px;border-radius:12px 12px 0 0;text-align:center">
    <h1 style="color:#fff;margin:0;font-size:22px">SIGEC-ELOS</h1>
    <p style="color:#C7D2FE;margin:4px 0 0;font-size:13px">Vendor List do ecossistema SIGEC</p></div>
  <div style="background:#fff;padding:28px;border:1px solid #e2e8f0;border-top:none;color:#374151;font-size:15px;line-height:1.7">
    <p><strong>Parabéns!</strong> Sua empresa foi aprovada e faz parte da lista de fornecedores de confiança do Sistema SIGEC.</p>
    <p>Isso quer dizer que as grandes empresas de mineração, energia e indústria <strong>já podem encontrar você para fechar negócio</strong>.</p>
    <p>E o melhor: você entra na <strong>Vendor List ELOS de graça</strong> e vê os compradores do ecossistema que estão procurando fornecedores.</p>
    <p>É só entrar, olhar quem está comprando e oferecer o seu serviço.</p>
    <p style="text-align:center;margin:26px 0 10px"><a href="{action_link}" style="display:inline-block;background:#F47E2F;color:#fff;padding:15px 34px;border-radius:9px;text-decoration:none;font-weight:bold;font-size:15px">👉 Entrar na Vendor List ELOS</a></p>
    <p style="font-size:12px;color:#6b7280;text-align:center">O botão cria a sua senha e abre o seu painel — sem cadastro, sem reenviar documentos.<br>Link expirou? Use "Esqueci minha senha" em elos.eqpitech.com.br/login.</p>
    <p>Sua vaga já está garantida. <strong>Agora é com você.</strong></p>
    <p><strong>Equipe SIGEC — EQPI Tech</strong><br>comercial@eqpitech.com.br</p>
  </div>
  <div style="background:#f8fafc;padding:14px;border-radius:0 0 12px 12px;text-align:center;font-size:11px;color:#9aa1b5">EQPI Tech · SIGEC-ELOS · elos.eqpitech.com.br</div></div>"""

# ── ELOS: mapas ────────────────────────────────────────────────────────────
url = [l.split('=', 1)[1].strip().strip('"') for l in open('.env') if l.startswith('SUPABASE_DB_URL=')][0]
m = re.match(r'postgres(?:ql)?://([^:]+):([^@]+)@([^:/]+):?(\d+)?/(.+)', url)
pg = pg8000.native.Connection(m.group(1), host=m.group(3), port=int(m.group(4) or 5432),
                              database=m.group(5), password=m.group(2), ssl_context=True)
sup_map = {r[0]: (str(r[1]), r[2]) for r in pg.run("""
    select sup.hoc_id, sup.id, sup.razao_social from suppliers sup
    where sup.hoc_id is not null and exists
      (select 1 from seals s where s.supplier_id = sup.id and s.status = 'ACTIVE')""")}
auth_emails = {r[0].lower() for r in pg.run("select email from auth.users where email is not null")}
sup_with_login = {str(r[0]) for r in pg.run(
    "select distinct supplier_id from user_roles where role='SUPPLIER' and supplier_id is not null")}
ap = pg.run("select id from access_profiles where role_type='SUPPLIER' and is_system=true limit 1")
APID = str(ap[0][0]) if ap else None

# ── HOC: público ───────────────────────────────────────────────────────────
cfg = json.load(open('scripts/hoc_migration_config.json'))['hoc_mysql']
import mysql.connector
my = mysql.connector.connect(host=cfg['host'], user=cfg['user'], password=cfg['password'],
                             database=cfg['database'], port=cfg.get('port', 3306))
cur = my.cursor(dictionary=True)
ids = ','.join(map(str, sup_map.keys()))
cur.execute(f"""
  SELECT u.id uid, u.nome, u.email, uf.id_fornecedor
  FROM usuario u JOIN usuario_fornecedor uf ON uf.id_usuario = u.id
  WHERE u.ativo = 1 AND u.email LIKE '%@%' AND uf.id_fornecedor IN ({ids})
    AND EXISTS (SELECT 1 FROM log_login l WHERE l.id_usuario = u.id
                AND l.login_date >= DATE_SUB(NOW(), INTERVAL 1 YEAR))
  ORDER BY u.email""")
rows = cur.fetchall(); my.close()

# agrupa vínculos por e-mail (41 usuários atendem >1 fornecedor)
by_email = {}
for r in rows:
    e = r['email'].strip().lower()
    if not re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', e):
        continue
    by_email.setdefault(e, {'nome': r['nome'], 'vinculos': []})
    if r['id_fornecedor'] in sup_map:
        by_email[e]['vinculos'].append(r['id_fornecedor'])

report, created, sent, skipped, errors = [], 0, 0, 0, 0
items = list(by_email.items())
if LIMIT: items = items[:LIMIT]
print(f"campanha: {len(items)} e-mails no lote", flush=True)

for i, (email, info) in enumerate(items):
    status = ''
    try:
        if email in auth_emails:
            status = 'skip_email_exists'
        else:
            vincs = [(sup_map[h][0], sup_map[h][1], h) for h in info['vinculos']]
            vincs = [(sid, rz, h) for sid, rz, h in vincs if sid not in sup_with_login]
            if not vincs:
                status = 'skip_supplier_has_login'
            else:
                u = sb_post('/auth/v1/admin/users', {
                    "email": email, "password": secrets.token_urlsafe(24), "email_confirm": True,
                    "user_metadata": {"name": info['nome'], "campanha": "primeiro_acesso_homologados"}})
                uid = u['id']
                for j, (sid, rz, h) in enumerate(vincs):
                    pg.run("""insert into user_roles (user_id, role, supplier_id, is_primary, is_active, access_profile_id)
                              values (:u,'SUPPLIER',:s,:p,true,:a)""",
                           u=uid, s=sid, p=(j == 0), a=APID)
                    sup_with_login.add(sid)
                pg.run("update profiles set supplier_id=:s where id=:u", s=vincs[0][0], u=uid)
                pg.run("""insert into audit_log (user_id, action, entity_type, entity_id, metadata)
                          values (:u,'CAMPAIGN_FIRST_ACCESS','supplier',:s,:m::jsonb)""",
                       u=uid, s=vincs[0][0],
                       m=json.dumps({"campanha": "primeiro_acesso_homologados", "email": email,
                                     "vinculos": [v[2] for v in vincs]}))
                created += 1
                link = sb_post('/auth/v1/admin/generate_link',
                               {"type": "recovery", "email": email, "redirect_to": REDIRECT})
                action_link = link.get('action_link') or link.get('properties', {}).get('action_link')
                if not action_link:
                    raise RuntimeError('sem action_link')
                razao = vincs[0][1]
                req = urllib.request.Request(
                    'https://elos.eqpitech.com.br/.netlify/functions/send-email',
                    data=json.dumps({"to": email,
                                     "subject": f"Parabéns, {razao} — sua vaga na Vendor List ELOS está garantida",
                                     "html": email_html(action_link)}).encode(),
                    headers={"Content-Type": "application/json"}, method="POST")
                res = json.load(urllib.request.urlopen(req))
                if res.get('sent'):
                    sent += 1; status = 'sent'
                else:
                    status = f"email_fail:{res}"
                auth_emails.add(email)
                time.sleep(0.55)  # Resend ~2/s
        if status.startswith('skip'): skipped += 1
    except Exception as ex:
        errors += 1
        status = f'error:{str(ex)[:120]}'
    report.append([email, info['nome'], ';'.join(map(str, info['vinculos'])), status])
    if (i + 1) % 25 == 0:
        print(f"{i+1}/{len(items)} · criadas={created} enviadas={sent} puladas={skipped} erros={errors}", flush=True)

out = '/Users/luiz.panareli/Downloads/campanha_resultado.csv'
with open(out, 'w', newline='', encoding='utf-8-sig') as f:
    w = csv.writer(f, delimiter=';')
    w.writerow(['email', 'nome', 'hoc_fornecedor_ids', 'status'])
    w.writerows(report)
pg.close()
print(f"FIM · contas criadas={created} · e-mails enviados={sent} · pulados={skipped} · erros={errors}", flush=True)
print(f"relatório: {out}", flush=True)
