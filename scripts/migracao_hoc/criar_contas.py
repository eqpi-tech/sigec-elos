"""Contas do ELOS para os contatos da migração HOC → ELOS (13/10/2026).

  python3 scripts/migracao_hoc/criar_contas.py --campanha A             # simulação: mostra o que faria
  python3 scripts/migracao_hoc/criar_contas.py --campanha A --aplicar   # cria/vincula de verdade (produção)

Para cada contato da onda (hoc_migration_contacts, patch_134):
  · conta: reaproveita o login que já existe com o e-mail; senão cria (senha
    aleatória, e-mail confirmado) — ninguém recebe e-mail aqui
  · fornecedor: vínculo SUPPLIER (Acesso Total) com a empresa da onda; quem
    está em várias empresas fica com a principal (multiempresa: pendente)
  · cliente: vínculo CLIENT com o perfil do de/para do grupo do HOC (patch_136)
  · senha: quem já entrou no ELOS alguma vez fica com senha_criada_em; os
    demais ganham o token do link "Criar minha senha" (patch_135)
Idempotente: rodar de novo só completa o que falta. Nunca envia e-mail.
"""
import argparse, json, os, secrets, subprocess, sys, time, urllib.request, urllib.error

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
ENV = {l.split('=', 1)[0]: l.split('=', 1)[1].strip().strip('"') for l in open(os.path.join(ROOT, '.env')) if '=' in l and not l.startswith('#')}
DB, SB, KEY = ENV['SUPABASE_DB_URL'], ENV['SUPABASE_URL'].rstrip('/'), ENV['SUPABASE_SERVICE_ROLE_KEY']
PSQL = '/usr/local/opt/libpq/bin/psql'

CAMPANHAS = {'A': {'ids': [20, 33], 'expira': '2026-10-21 23:59:59-03'},
             'B': {'ids': [21, 34], 'expira': '2026-11-25 23:59:59-03'}}
# de/para dos grupos de cliente do HOC → perfil do ELOS (patch_136)
GRUPO_PERFIL = {11: 'Gestão de Fornecedores', 31: 'Gestão de Fornecedores', 35: 'Gerencial',
                12: 'Comprador', 36: 'Comprador', 15: 'Consulta'}

def q(v):
    if v is None: return 'NULL'
    return "'" + str(v).replace("'", "''") + "'"

def psql(sql):
    r = subprocess.run([PSQL, DB, '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql], capture_output=True, text=True,
                       env={**os.environ, 'PGGSSENCMODE': 'disable'})
    if r.returncode: raise SystemExit(r.stderr)
    return r.stdout

def rows(sql):
    return json.loads(psql(f'SELECT coalesce(json_agg(row_to_json(x)), \'[]\') FROM ({sql}) x') or '[]')

def criar_usuario(email, nome, papel, camp):
    body = {'email': email, 'password': secrets.token_urlsafe(24), 'email_confirm': True,
            'user_metadata': {'name': nome or email.split('@')[0], 'role': papel, 'migracao_hoc': camp}}
    req = urllib.request.Request(f'{SB}/auth/v1/admin/users', data=json.dumps(body).encode(), method='POST',
                                 headers={'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json'})
    for tentativa in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as r: return json.loads(r.read())['id']
        except urllib.error.HTTPError as e:
            if e.code < 500 or tentativa == 2: raise RuntimeError(f'auth {e.code}: {e.read().decode()[:200]}')
            time.sleep(3 * (tentativa + 1))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--campanha', required=True, choices=list(CAMPANHAS))
    ap.add_argument('--aplicar', action='store_true')
    a = ap.parse_args()
    camp = CAMPANHAS[a.campanha]; ids = '{' + ','.join(map(str, camp['ids'])) + '}'

    contatos = rows(f"""SELECT id, lower(trim(email)) email, nome, tipo, hoc_client_ids, supplier_hoc_ids, hoc_group_id,
        elos_user_id, senha_criada_em, senha_token, senha_token_expira > now() token_ok
        FROM hoc_migration_contacts WHERE hoc_client_ids && '{ids}' ORDER BY tipo, email""")
    emails = '{' + ','.join('"' + c['email'].replace('"', '') + '"' for c in contatos) + '}'
    auth = {u['email']: u for u in rows(f"SELECT id, lower(email) email, last_sign_in_at FROM auth.users WHERE lower(email) = ANY({q(emails)}::text[])")}
    uids = '{' + ','.join(u['id'] for u in auth.values()) + '}'
    papeis = {}
    for r in rows(f"SELECT user_id, role, supplier_id, client_id FROM user_roles WHERE user_id = ANY({q(uids)}::uuid[])"):
        papeis.setdefault(r['user_id'], {})[r['role']] = r
    sup = {s['hoc_id']: s for s in rows(f"""SELECT s.id, s.hoc_id, s.user_id,
        EXISTS (SELECT 1 FROM seals se JOIN clients c ON c.id = se.client_id WHERE se.supplier_id = s.id AND c.hoc_id = ANY('{ids}')) da_onda
        FROM suppliers s WHERE s.hoc_id = ANY(ARRAY(SELECT unnest(supplier_hoc_ids) FROM hoc_migration_contacts WHERE hoc_client_ids && '{ids}'))""")}
    cli = {c['hoc_id']: c['id'] for c in rows(f"SELECT id, hoc_id FROM clients WHERE hoc_id = ANY('{ids}')")}
    perfis = {p['name']: p['id'] for p in rows("""SELECT id, name FROM access_profiles WHERE
        (role_type = 'CLIENT' AND name IN ('Gestão de Fornecedores','Gerencial','Comprador','Consulta'))""")}
    total_sup = rows("SELECT id FROM access_profiles WHERE role_type = 'SUPPLIER' AND is_system AND name = 'Acesso Total' LIMIT 1")[0]['id']

    n = dict(novos=0, existentes=0, vinc_sup=0, vinc_cli=0, ja_vinculado=0, outra_empresa=0, multi=0,
             sem_empresa=0, grupo_desconhecido=0, token=0, tem_senha=0, erros=0)
    pend = []   # observações para o relatório
    for c in contatos:
        sql = []
        try:
            u = auth.get(c['email'])
            if u: uid = u['id']; n['existentes'] += 1
            else:
                n['novos'] += 1
                uid = criar_usuario(c['email'], c['nome'], 'SUPPLIER' if c['tipo'] == 'SUPPLIER' else 'CLIENT', a.campanha) if a.aplicar else None
            meus = papeis.get(uid, {}) if uid else {}

            if c['tipo'] == 'SUPPLIER':
                cands = [sup[h] for h in c['supplier_hoc_ids'] if h in sup]
                if not cands: n['sem_empresa'] += 1; pend.append(f"sem empresa no ELOS: {c['email']}"); continue
                if len(cands) > 1: n['multi'] += 1
                principal = next((s for s in cands if s['da_onda']), cands[0])
                atual = meus.get('SUPPLIER')
                if atual and atual['supplier_id'] in {s['id'] for s in cands}: n['ja_vinculado'] += 1; principal = next(s for s in cands if s['id'] == atual['supplier_id'])
                elif atual: n['outra_empresa'] += 1; pend.append(f"já é de outra empresa no ELOS (multiempresa): {c['email']}")
                else:
                    n['vinc_sup'] += 1
                    sql.append(f"""INSERT INTO user_roles (user_id, role, supplier_id, is_primary, is_active, access_profile_id)
                        VALUES ({q(uid)}, 'SUPPLIER', {q(principal['id'])}, true, true, {q(total_sup)}) ON CONFLICT (user_id, role) DO NOTHING""")
                    sql.append(f"UPDATE profiles SET supplier_id = {q(principal['id'])} WHERE id = {q(uid)} AND supplier_id IS NULL")
                    sql.append(f"UPDATE suppliers SET user_id = {q(uid)} WHERE id = {q(principal['id'])} AND user_id IS NULL")
            else:
                hc = next((h for h in c['hoc_client_ids'] if h in cli), None)
                perfil = GRUPO_PERFIL.get(c['hoc_group_id'])
                if not perfil: n['grupo_desconhecido'] += 1; perfil = 'Consulta'; pend.append(f"grupo {c['hoc_group_id']} sem de/para → Consulta: {c['email']}")
                atual = meus.get('CLIENT')
                if atual and atual['client_id'] == cli[hc]: n['ja_vinculado'] += 1
                elif atual: n['outra_empresa'] += 1; pend.append(f"já é usuário de outro cliente: {c['email']}")
                else:
                    n['vinc_cli'] += 1
                    sql.append(f"""INSERT INTO user_roles (user_id, role, client_id, is_primary, is_active, access_profile_id)
                        VALUES ({q(uid)}, 'CLIENT', {q(cli[hc])}, true, true, {q(perfis[perfil])}) ON CONFLICT (user_id, role) DO NOTHING""")
                    if not u: sql.append(f"UPDATE profiles SET role = 'CLIENT' WHERE id = {q(uid)}")

            # senha: quem já entrou no ELOS tem senha; os demais recebem o link pessoal
            if u and u.get('last_sign_in_at'):
                n['tem_senha'] += 1
                sql.append(f"UPDATE hoc_migration_contacts SET senha_criada_em = coalesce(senha_criada_em, {q(u['last_sign_in_at'])}::timestamptz) WHERE id = {q(c['id'])}")
            elif not c['senha_criada_em']:
                n['token'] += 1
                if not c['token_ok']:
                    sql.append(f"UPDATE hoc_migration_contacts SET senha_token = {q(secrets.token_urlsafe(32))}, senha_token_expira = {q(camp['expira'])} WHERE id = {q(c['id'])}")
            sql.append(f"UPDATE hoc_migration_contacts SET elos_user_id = {q(uid)}, updated_at = now() WHERE id = {q(c['id'])}")
            sql.append(f"""INSERT INTO audit_log (user_id, action, entity_type, metadata) VALUES ({q(uid)}, 'MIGRACAO_HOC_CONTA', 'user',
                jsonb_build_object('campanha', {q(a.campanha)}, 'tipo', {q(c['tipo'])}, 'conta_nova', {'true' if not u else 'false'}))""")
            if a.aplicar: psql('BEGIN; ' + '; '.join(sql) + '; COMMIT;')
        except Exception as e:
            n['erros'] += 1; pend.append(f"ERRO {c['email']}: {str(e)[:160]}")

    print(f"campanha {a.campanha} · {len(contatos)} contatos · {'APLICADO' if a.aplicar else 'SIMULAÇÃO (nada gravado)'}")
    for k, v in n.items(): print(f'  {k:20s} {v}')
    for p in pend[:60]: print('  ·', p)
    if len(pend) > 60: print(f'  … +{len(pend) - 60}')

if __name__ == '__main__':
    main()
