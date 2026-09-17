# -*- coding: utf-8 -*-
"""Campanha Primeiro Acesso — modo RECORRENTE (17/09).

Roda todo dia após o sync HOC→ELOS (workflow sync-hoc-elos.yml): quem se
homologou no HOC e ainda não participou da campanha recebe a conta ELOS +
e-mail com link de primeiro acesso. Mesmas regras da onda de 08/09
(campaign_first_access.py), até a migração completa do HOC:

  público    usuário HOC ativo, e-mail válido, login < 1 ano, vinculado a
             fornecedor HOMOLOGADO no ELOS (selo ACTIVE, hoc_id mapeado)
  idempotente e-mail já no auth → pula · fornecedor com login ORGÂNICO
             (não-campanha) → pula (colegas de contas da campanha entram)
  marca      user_metadata.campanha = 'primeiro_acesso_homologados'
             (o funil do backoffice lê exatamente essa marca)
  trava      --max N (padrão 150/dia): excedente fica para o dia seguinte

Credenciais: scripts/hoc_migration_config.json (CI: secret HOC_SYNC_CONFIG).
Uso: python campaign_daily.py [--dry-run] [--max N]
"""
import re, json, sys, time, secrets, urllib.request, urllib.error, os
import mysql.connector

DRY = '--dry-run' in sys.argv
MAX = int(sys.argv[sys.argv.index('--max') + 1]) if '--max' in sys.argv else 150

HERE = os.path.dirname(os.path.abspath(__file__))
cfg = json.load(open(os.path.join(HERE, 'hoc_migration_config.json')))
SB  = cfg['sigec_supabase']['url'].rstrip('/')
KEY = cfg['sigec_supabase']['service_role_key']
H   = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}
REDIRECT = ('https://elos.eqpitech.com.br/redefinir-senha?welcome=1'
            '&utm_source=email&utm_medium=crm&utm_campaign=primeiro_acesso_homologados')


def sb_req(method, path, data=None, prefer=None):
    h = dict(H)
    if prefer: h['Prefer'] = prefer
    req = urllib.request.Request(f"{SB}{path}", data=json.dumps(data).encode() if data is not None else None,
                                 headers=h, method=method)
    body = urllib.request.urlopen(req).read()
    return json.loads(body) if body else None


def sb_get_all(path_base, page=1000):
    out, off = [], 0
    while True:
        rows = sb_req('GET', f"{path_base}&offset={off}&limit={page}") or []
        out += rows
        if len(rows) < page: return out
        off += page


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


# ── ELOS: mapas (via REST, roda no runner do Actions) ─────────────────────
seal_rows = sb_get_all("/rest/v1/seals?select=supplier_id&status=eq.ACTIVE")
active_sup = {r['supplier_id'] for r in seal_rows}
sup_rows = sb_get_all("/rest/v1/suppliers?select=id,hoc_id,razao_social&hoc_id=not.is.null")
sup_map = {int(r['hoc_id']): (r['id'], r['razao_social']) for r in sup_rows if r['id'] in active_sup}

role_rows = sb_get_all("/rest/v1/user_roles?select=supplier_id,user_id&role=eq.SUPPLIER&supplier_id=not.is.null")
all_users, page = [], 1
while True:
    res = sb_req('GET', f"/auth/v1/admin/users?page={page}&per_page=1000")
    users = res.get('users', res if isinstance(res, list) else [])
    all_users += users
    if len(users) < 1000: break
    page += 1
auth_emails = {u['email'].lower() for u in all_users if u.get('email')}
# fornecedor com login ORGÂNICO (dono do vínculo fora da campanha) → pula;
# contas criadas pela própria campanha não bloqueiam os colegas
camp_users = {u['id'] for u in all_users if (u.get('user_metadata') or {}).get('campanha')}
organic_sup = {r['supplier_id'] for r in role_rows if r['user_id'] not in camp_users}

ap = sb_req('GET', "/rest/v1/access_profiles?select=id&role_type=eq.SUPPLIER&is_system=eq.true&limit=1")
APID = ap[0]['id'] if ap else None

# ── HOC: público elegível ─────────────────────────────────────────────────
mycfg = cfg['hoc_mysql']
my = mysql.connector.connect(host=mycfg['host'], user=mycfg['user'], password=mycfg['password'],
                             database=mycfg['database'], port=mycfg.get('port', 3306))
cur = my.cursor(dictionary=True)
cur.execute("SET SESSION transaction_read_only = 1")
ids = ','.join(map(str, sup_map.keys())) or '0'
cur.execute(f"""
  SELECT u.id uid, u.nome, u.email, uf.id_fornecedor
  FROM usuario u JOIN usuario_fornecedor uf ON uf.id_usuario = u.id
  WHERE u.ativo = 1 AND u.email LIKE '%@%' AND uf.id_fornecedor IN ({ids})
    AND EXISTS (SELECT 1 FROM log_login l WHERE l.id_usuario = u.id
                AND l.login_date >= DATE_SUB(NOW(), INTERVAL 1 YEAR))
  ORDER BY u.email""")
rows = cur.fetchall(); my.close()

by_email = {}
for r in rows:
    e = r['email'].strip().lower()
    if not re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', e): continue
    by_email.setdefault(e, {'nome': r['nome'], 'vinculos': []})
    if r['id_fornecedor'] in sup_map:
        by_email[e]['vinculos'].append(r['id_fornecedor'])

# elegíveis = e-mail novo com pelo menos um fornecedor sem login orgânico
todo = []
for email, info in by_email.items():
    if email in auth_emails: continue
    vincs, seen = [], set()
    for h in info['vinculos']:
        sid, rz = sup_map[h]
        if sid in seen or sid in organic_sup: continue
        seen.add(sid); vincs.append((sid, rz, h))
    if vincs: todo.append((email, info['nome'], vincs))

print(f"campanha diária: {len(todo)} elegíveis (teto {MAX}) · dry={DRY}", flush=True)
if len(todo) > MAX:
    print(f"⚠️ acima do teto — processando {MAX}, restante amanhã", flush=True)
    todo = todo[:MAX]

created = sent = errors = 0
for email, nome, vincs in todo:
    try:
        if DRY:
            print(f"[DRY] {email} → {vincs[0][1][:40]}"); continue
        u = sb_req('POST', '/auth/v1/admin/users', {
            "email": email, "password": secrets.token_urlsafe(24), "email_confirm": True,
            "user_metadata": {"name": nome, "campanha": "primeiro_acesso_homologados", "onda": "daily"}})
        uid = u['id']
        sid, rz, h = vincs[0]
        sb_req('POST', '/rest/v1/user_roles', {
            "user_id": uid, "role": "SUPPLIER", "supplier_id": sid,
            "is_primary": True, "is_active": True, "access_profile_id": APID},
            prefer='return=minimal')
        sb_req('PATCH', f"/rest/v1/profiles?id=eq.{uid}", {"supplier_id": sid}, prefer='return=minimal')
        sb_req('POST', '/rest/v1/audit_log', {
            "user_id": uid, "action": "CAMPAIGN_FIRST_ACCESS", "entity_type": "supplier",
            "entity_id": sid, "metadata": {"campanha": "primeiro_acesso_homologados",
                                           "onda": "daily", "email": email,
                                           "vinculos": [v[2] for v in vincs]}},
            prefer='return=minimal')
        created += 1
        link = sb_req('POST', '/auth/v1/admin/generate_link',
                      {"type": "recovery", "email": email, "redirect_to": REDIRECT})
        action_link = link.get('action_link') or link.get('properties', {}).get('action_link')
        if not action_link: raise RuntimeError('sem action_link')
        req = urllib.request.Request(
            'https://elos.eqpitech.com.br/.netlify/functions/send-email',
            data=json.dumps({"to": email,
                             "subject": f"Parabéns, {rz} — sua vaga na Vendor List ELOS está garantida",
                             "html": email_html(action_link)}).encode(),
            headers={"Content-Type": "application/json"}, method="POST")
        res = json.load(urllib.request.urlopen(req))
        if res.get('sent'): sent += 1
        time.sleep(0.55)  # Resend ~2/s
    except Exception as ex:
        errors += 1
        print(f"erro {email}: {str(ex)[:140]}", flush=True)

print(f"FIM · contas={created} · e-mails={sent} · erros={errors}", flush=True)
if not DRY and (created or errors):
    sb_req('POST', '/rest/v1/audit_log', {
        "action": "CAMPAIGN_DAILY", "entity_type": "campaign", "metadata":
        {"elegiveis": len(todo), "contas": created, "emails": sent, "erros": errors}},
        prefer='return=minimal')
sys.exit(1 if errors and not created else 0)
