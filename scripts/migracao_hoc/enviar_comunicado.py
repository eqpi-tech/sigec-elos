"""Comunicados da migração HOC → ELOS (13 a 16/10/2026).

  python3 scripts/migracao_hoc/enviar_comunicado.py --onda 1 --teste fulano@empresa.com   # 1 de cada versão p/ revisar
  python3 scripts/migracao_hoc/enviar_comunicado.py --onda 1 --previa                       # gera os HTML em /tmp
  python3 scripts/migracao_hoc/enviar_comunicado.py --onda 1 --enviar                       # envio real (pede confirmação)

Destinatários: hoc_migration_contacts (patch_134). Cada envio fica registrado em
envios->'<onda>' (data + id da Resend) — reexecutar não reenvia para quem já recebeu.
Remetente = SIGEC-ELOS; responder vai para o suporte.
"""
import argparse, json, os, subprocess, sys, time, urllib.request, urllib.error

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
ENV = {l.split('=', 1)[0]: l.split('=', 1)[1].strip().strip('"') for l in open(os.path.join(ROOT, '.env')) if '=' in l and not l.startswith('#')}
DB = ENV['SUPABASE_DB_URL']
RESEND = ENV['RESEND_API_KEY']
FROM = 'SIGEC-ELOS <noreply@eqpitech.com.br>'
REPLY_TO = 'suporte@eqpitech.com.br'
SITE = 'https://elos.eqpitech.com.br'
SUPORTE = ('<strong>E-mail:</strong> suporte@eqpitech.com.br · <strong>WhatsApp:</strong> (11) 5039-6769 · '
           '<strong>Telefone:</strong> (11) 2305-3881')

def psql(sql):
    r = subprocess.run(['/usr/local/opt/libpq/bin/psql', DB, '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql],
                       capture_output=True, text=True, env={**os.environ, 'PGGSSENCMODE': 'disable'})
    if r.returncode: raise SystemExit(r.stderr)
    return r.stdout

def lista_clientes(cs, artigo=False):
    cs = [('a ' if artigo else '') + c for c in cs if c]
    if not cs: return 'seus clientes'
    return cs[0] if len(cs) == 1 else ', '.join(cs[:-1]) + ' e ' + cs[-1]

def primeiro_nome(n):
    n = (n or '').strip()
    return n.split()[0].capitalize() if n and not '@' in n else ''

def moldura(titulo, corpo):
    return f"""<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#374151">
  <div style="background:#2E3192;padding:26px 24px;border-radius:12px 12px 0 0;text-align:center">
    <div style="color:#fff;font-size:22px;font-weight:bold;letter-spacing:.5px">SIGEC-ELOS</div>
    <div style="color:#F47E2F;font-size:13px;margin-top:4px">{titulo}</div></div>
  <div style="background:#fff;padding:28px 26px;border:1px solid #e2e8f0;border-top:none;font-size:15px;line-height:1.65">{corpo}</div>
  <div style="background:#f8fafc;padding:16px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;text-align:center;font-size:12px;color:#6b7280;line-height:1.6">
    Dúvidas? Fale com o suporte EQPI — {SUPORTE}<br>EQPI Tech · elos.eqpitech.com.br</div></div>"""

# ── Comunicado 1 (terça, 13/10): o aviso ───────────────────────────────────
def onda1(c):
    ola = f"Olá, {primeiro_nome(c['nome'])}!" if primeiro_nome(c['nome']) else 'Olá!'
    if c['tipo'] == 'SUPPLIER':
        assunto = f"Sua homologação com {lista_clientes(c['clientes'], artigo=True)} vai para o SIGEC-ELOS"
        corpo = f"""<p>{ola}</p>
<p>Temos uma boa notícia: a homologação da sua empresa com {lista_clientes(['<strong>' + x + '</strong>' for x in c['clientes']], artigo=True)} vai passar para o
<strong>SIGEC-ELOS</strong>, a nova plataforma da EQPI — mais simples, mais rápida e com novidades que facilitam o seu dia a dia.</p>
<p style="margin:20px 0 8px"><strong>O que você precisa saber agora:</strong></p>
<ul style="padding-left:20px;margin:0 0 16px">
  <li><strong>Até sexta-feira, 16/10</strong>, nada muda: continue usando o SIGEC-HOC normalmente, inclusive para enviar documentos.</li>
  <li><strong>A partir de segunda-feira, 19/10</strong>, tudo passa a ser feito no SIGEC-ELOS.</li>
  <li>Os <strong>dados da sua empresa, seus documentos e o histórico</strong> dos seus processos já estarão lá — você não precisa se cadastrar de novo.</li>
</ul>
<p>Nos próximos dias você vai receber, por este e-mail, o passo a passo para acessar o SIGEC-ELOS e criar a sua senha.</p>
<p><strong>Por enquanto, não é preciso fazer nada.</strong></p>
<p style="margin-top:22px">Conte com a gente,<br><strong>Equipe EQPI Tech</strong></p>"""
    else:
        assunto = 'A homologação dos seus fornecedores vai para o SIGEC-ELOS'
        corpo = f"""<p>{ola}</p>
<p>A gestão e a homologação dos fornecedores da <strong>{lista_clientes(c['clientes'])}</strong> vão passar para o
<strong>SIGEC-ELOS</strong>, a nova plataforma da EQPI — com acompanhamento dos processos em tempo real, relatórios e novos recursos para a sua equipe.</p>
<p style="margin:20px 0 8px"><strong>O que você precisa saber agora:</strong></p>
<ul style="padding-left:20px;margin:0 0 16px">
  <li><strong>Até sexta-feira, 16/10</strong>, nada muda: continue usando o SIGEC-HOC normalmente.</li>
  <li><strong>A partir de segunda-feira, 19/10</strong>, tudo passa a ser feito no SIGEC-ELOS.</li>
  <li>Seus <strong>fornecedores, processos, documentos, convites e o histórico</strong> já estarão lá. Seu acesso será criado com o mesmo perfil que você tem hoje.</li>
  <li>Seus fornecedores também estão sendo avisados, com a mesma programação.</li>
</ul>
<p>Nos próximos dias você vai receber, por este e-mail, o passo a passo para acessar o SIGEC-ELOS e criar a sua senha.</p>
<p><strong>Por enquanto, não é preciso fazer nada.</strong></p>
<p style="margin-top:22px">Conte com a gente,<br><strong>Equipe EQPI Tech</strong></p>"""
    return assunto, moldura('Comunicado 1 de 4 · A sua homologação de casa nova', corpo)

ONDAS = {1: onda1}

def contatos(onda, limite=None, so_email=None):
    filtro = f"AND email = '{so_email}'" if so_email else f"AND NOT (envios ? '{onda}')"
    lim = f"LIMIT {int(limite)}" if limite else ''
    out = psql(f"SELECT json_agg(row_to_json(x)) FROM (SELECT id, email, nome, tipo, clientes FROM hoc_migration_contacts WHERE true {filtro} ORDER BY tipo, email {lim}) x")
    return json.loads(out or 'null') or []

def enviar_lote(msgs):
    req = urllib.request.Request('https://api.resend.com/emails/batch', data=json.dumps(msgs).encode(),
                                 headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {RESEND}',
                                          'User-Agent': 'sigec-elos-comunicados/1.0'})   # sem UA o Cloudflare da Resend devolve 403
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read()).get('data', [])
    except urllib.error.HTTPError as e:
        raise RuntimeError(f'Resend {e.code}: {e.read().decode()[:300]}')

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--onda', type=int, required=True, choices=list(ONDAS))
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument('--teste', help='envia 1 exemplo de cada versão (fornecedor e cliente) para este e-mail')
    g.add_argument('--previa', action='store_true')
    g.add_argument('--enviar', action='store_true')
    ap.add_argument('--limite', type=int)
    a = ap.parse_args()
    fn = ONDAS[a.onda]

    if a.teste or a.previa:
        # exemplos reais: um fornecedor com 2 clientes e um usuário de cliente
        ex = json.loads(psql("""SELECT json_agg(row_to_json(x)) FROM (
          (SELECT email, nome, tipo, clientes FROM hoc_migration_contacts WHERE tipo='SUPPLIER' AND cardinality(clientes) > 1 LIMIT 1)
          UNION ALL (SELECT email, nome, tipo, clientes FROM hoc_migration_contacts WHERE tipo='CLIENT' LIMIT 1)) x"""))
        for c in ex:
            assunto, html = fn(c)
            if a.previa:
                p = f"/tmp/comunicado{a.onda}_{c['tipo'].lower()}.html"; open(p, 'w').write(html); print(p, '·', assunto)
            else:
                enviar_lote([{'from': FROM, 'reply_to': REPLY_TO, 'to': [a.teste], 'subject': f"[TESTE {c['tipo']}] {assunto}", 'html': html}])
                print('teste enviado:', c['tipo'], '·', assunto)
        return

    lista = contatos(a.onda, a.limite)
    print(f"comunicado {a.onda}: {len(lista)} destinatários pendentes "
          f"({sum(1 for c in lista if c['tipo']=='CLIENT')} cliente, {sum(1 for c in lista if c['tipo']=='SUPPLIER')} fornecedor)")
    if not lista: return
    if input('Confirmar envio REAL? digite ENVIAR: ').strip() != 'ENVIAR': return print('cancelado')
    ok = 0
    for i in range(0, len(lista), 100):
        lote = lista[i:i + 100]
        msgs = []
        for c in lote:
            assunto, html = fn(c)
            msgs.append({'from': FROM, 'reply_to': REPLY_TO, 'to': [c['email']], 'subject': assunto, 'html': html})
        try:
            ids = enviar_lote(msgs)
        except Exception as e:
            print(f'  lote {i // 100 + 1}: falhou ({e}) — rode de novo para continuar'); break
        vals = ','.join(f"('{c['id']}','{(ids[k] or {}).get('id', '') if k < len(ids) else ''}')" for k, c in enumerate(lote))
        psql(f"""UPDATE hoc_migration_contacts h SET envios = envios || jsonb_build_object('{a.onda}', jsonb_build_object('em', now(), 'id', v.rid)), updated_at = now()
                 FROM (VALUES {vals}) v(id, rid) WHERE h.id = v.id::uuid""")
        ok += len(lote); print(f'  {ok}/{len(lista)}'); time.sleep(0.6)   # limite da Resend: 2 req/s
    print('concluído:', ok)

if __name__ == '__main__':
    main()
