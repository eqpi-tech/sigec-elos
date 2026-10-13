"""Comunicados da migração HOC → ELOS (13 a 16/10/2026).

  python3 scripts/migracao_hoc/enviar_comunicado.py --campanha A --onda 1 --teste fulano@empresa.com   # 1 de cada versão p/ revisar
  python3 scripts/migracao_hoc/enviar_comunicado.py --campanha A --onda 1 --previa                       # gera os HTML em /tmp
  python3 scripts/migracao_hoc/enviar_comunicado.py --campanha A --onda 1 --enviar                       # envio real (pede confirmação)

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

# Ondas da migração (decisão do Luiz, 13/10/2026). ids = clientes do HOC.
CAMPANHAS = {
    'A': {'ids': [20, 33], 'hoc_ate': 'sexta-feira, 16/10', 'inicio': 'segunda-feira, 19/10', 'inicio_curto': 'segunda, 19/10',
          'outros_ate': '20/11', 'link_ate': 'quarta-feira, 21/10'},
    'B': {'ids': [21, 34], 'hoc_ate': 'sexta-feira, 20/11', 'inicio': 'segunda-feira, 23/11', 'inicio_curto': 'segunda, 23/11',
          'outros_ate': None, 'link_ate': 'quarta-feira, 25/11', 'ja_usa_elos': True},
}
AJUDA = f'{SITE}/ajuda'

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
def onda1(c, k):
    ola = f"Olá, {primeiro_nome(c['nome'])}!" if primeiro_nome(c['nome']) else 'Olá!'
    if c['tipo'] == 'SUPPLIER':
        assunto = f"Sua homologação com {lista_clientes(c['clientes'], artigo=True)} vai para o SIGEC-ELOS"
        corpo = f"""<p>{ola}</p>
<p>Temos uma boa notícia: a homologação da sua empresa com {lista_clientes(['<strong>' + x + '</strong>' for x in c['clientes']], artigo=True)} vai passar para o
<strong>SIGEC-ELOS</strong>, a nova plataforma da EQPI — mais simples, mais rápida e com novidades que facilitam o seu dia a dia.</p>
<p style="margin:20px 0 8px"><strong>O que você precisa saber agora:</strong></p>
<ul style="padding-left:20px;margin:0 0 16px">
  <li><strong>Até {k['hoc_ate']}</strong>, nada muda: continue usando o SIGEC-HOC normalmente, inclusive para enviar documentos.</li>
  <li><strong>A partir de {k['inicio']}</strong>, a homologação com {lista_clientes(c['clientes'], artigo=True)} passa a ser feita no SIGEC-ELOS.</li>
  <li>Os <strong>dados da sua empresa, seus documentos e o histórico</strong> dos seus processos já estarão lá — você não precisa se cadastrar de novo.</li>
</ul>{(JA_USA if ja_usa(k, c) else OUTROS) if c.get('outros') else ''}
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
  <li><strong>Até {k['hoc_ate']}</strong>, nada muda: continue usando o SIGEC-HOC normalmente.</li>
  <li><strong>A partir de {k['inicio']}</strong>, tudo passa a ser feito no SIGEC-ELOS.</li>
  <li>Seus <strong>fornecedores, processos, documentos, convites e o histórico</strong> já estarão lá. Seu acesso será criado com o mesmo perfil que você tem hoje.</li>
  <li>Seus fornecedores também estão sendo avisados, com a mesma programação.</li>
</ul>
<p>Nos próximos dias você vai receber, por este e-mail, o passo a passo para acessar o SIGEC-ELOS e criar a sua senha.</p>
<p><strong>Por enquanto, não é preciso fazer nada.</strong></p>
<p style="margin-top:22px">Conte com a gente,<br><strong>Equipe EQPI Tech</strong></p>"""
    return assunto, moldura('Comunicado 1 de 4 · A sua homologação de casa nova', corpo)

def botao(txt, href):
    return f'''<p style="text-align:center;margin:26px 0"><a href="{href}" style="display:inline-block;background:#F47E2F;color:#fff;padding:14px 34px;border-radius:9px;text-decoration:none;font-weight:bold;font-size:15px">{txt}</a></p>'''

def assinatura():
    return '<p style="margin-top:22px">Conte com a gente,<br><strong>Equipe EQPI Tech</strong></p>'

def outros_docs(k):
    # fornecedor compartilhado com cliente que migra depois: documentos seguem pelo HOC até a 2ª virada
    if not k.get('outros_ate'): return ''
    return f'''<p style="background:#fff7ed;border-left:4px solid #F47E2F;padding:10px 14px;border-radius:0 8px 8px 0">
<strong>Sua empresa também atende outros clientes</strong>, que passam para o SIGEC-ELOS em novembro. Por isso, até <strong>{k['outros_ate']}</strong>,
continue enviando os documentos pelo SIGEC-HOC — eles aparecem automaticamente no SIGEC-ELOS e valem para todos os seus processos.</p>'''

def ja_usa(k, c): return k.get('ja_usa_elos') and c.get('outros')

# fornecedor da onda B que já usa o ELOS com cliente da onda A: mesmo login
JA_USA = """<p style="background:#eff6ff;border-left:4px solid #2E3192;padding:10px 14px;border-radius:0 8px 8px 0">
<strong>Você já usa o SIGEC-ELOS</strong> nos processos com outros clientes. Os novos processos vão aparecer <strong>no mesmo login</strong>
— não é preciso criar outra conta.</p>"""

# ── Comunicado 2 (quarta): o acesso está pronto ────────────────────────────
def onda2(c, k):
    ola = f"Olá, {primeiro_nome(c['nome'])}!" if primeiro_nome(c['nome']) else 'Olá!'
    link = c.get('link') or f'{SITE}/login'
    if c['tipo'] == 'SUPPLIER' and ja_usa(k, c):
        assunto = f"Seus processos com {lista_clientes(c['clientes'], artigo=True)} chegam ao seu SIGEC-ELOS"
        corpo = f"""<p>{ola}</p>
<p>A homologação da sua empresa com {lista_clientes(['<strong>' + x + '</strong>' for x in c['clientes']], artigo=True)} passa para o
<strong>SIGEC-ELOS</strong> em <strong>{k['inicio']}</strong>. Como você já usa a plataforma, <strong>é só entrar com o mesmo e-mail e senha</strong>
({c['email']}): os novos processos vão aparecer no seu painel.</p>
{botao('Acessar o SIGEC-ELOS', f'{SITE}/login')}
<p><strong>Importante:</strong> até {k['hoc_ate']}, continue enviando os documentos pelo SIGEC-HOC, como sempre.</p>{assinatura()}"""
        return assunto, moldura('Comunicado 2 de 4 · Seus novos processos no mesmo login', corpo)
    if c['tipo'] == 'SUPPLIER':
        assunto = 'Seu acesso ao SIGEC-ELOS está pronto — crie a sua senha'
        corpo = f"""<p>{ola}</p>
<p>Como avisamos, a homologação da sua empresa com {lista_clientes(['<strong>' + x + '</strong>' for x in c['clientes']], artigo=True)}
passa para o <strong>SIGEC-ELOS</strong> em <strong>{k['inicio']}</strong>. O seu acesso já está pronto, com o seu e-mail
<strong>{c['email']}</strong> e a sua empresa já vinculada.</p>
<p><strong>Falta só criar a sua senha:</strong></p>
{botao('Criar minha senha', link)}
<p style="font-size:13px;color:#6b7280">O link é pessoal e vale até {k['link_ate']}. Se ele expirar, entre em <strong>elos.eqpitech.com.br</strong>,
clique em <strong>"Esqueci minha senha"</strong> e informe este mesmo e-mail.</p>
<p>Depois de criar a senha, você já pode entrar e conhecer a plataforma: seus processos, seus documentos e o histórico estão lá.</p>
<p><strong>Importante:</strong> até {k['hoc_ate']}, continue enviando os documentos pelo SIGEC-HOC, como sempre.</p>
{outros_docs(k) if c.get('outros') else ''}{assinatura()}"""
    else:
        assunto = 'Seu acesso ao SIGEC-ELOS está pronto — crie a sua senha'
        corpo = f"""<p>{ola}</p>
<p>A gestão dos fornecedores da <strong>{lista_clientes(c['clientes'])}</strong> passa para o <strong>SIGEC-ELOS</strong> em
<strong>{k['inicio']}</strong>. O seu acesso já está pronto, com o e-mail <strong>{c['email']}</strong> e o mesmo perfil que você tem hoje no SIGEC-HOC.</p>
<p><strong>Falta só criar a sua senha:</strong></p>
{botao('Criar minha senha', link)}
<p style="font-size:13px;color:#6b7280">O link é pessoal e vale até {k['link_ate']}. Se ele expirar, entre em <strong>elos.eqpitech.com.br</strong>,
clique em <strong>"Esqueci minha senha"</strong> e informe este mesmo e-mail.</p>
<p>Depois de criar a senha, você já pode entrar e conhecer: seus fornecedores, os processos e os documentos estão lá. Até {k['hoc_ate']},
o SIGEC-HOC continua sendo o sistema oficial.</p>{assinatura()}"""
    return assunto, moldura('Comunicado 2 de 4 · Seu acesso está pronto', corpo)

# ── Comunicado 3 (quinta): o que melhora ────────────────────────────────────
def lista(itens): return '<ul style="padding-left:20px;margin:0 0 16px">' + ''.join(f'<li style="margin-bottom:6px">{i}</li>' for i in itens) + '</ul>'

def onda3(c, k):
    ola = f"Olá, {primeiro_nome(c['nome'])}!" if primeiro_nome(c['nome']) else 'Olá!'
    if c['tipo'] == 'SUPPLIER':
        assunto = 'O que melhora para a sua empresa no SIGEC-ELOS'
        corpo = f"""<p>{ola}</p>
<p>Faltam poucos dias para a sua homologação com {lista_clientes(['<strong>' + x + '</strong>' for x in c['clientes']], artigo=True)}
passar para o SIGEC-ELOS ({k['inicio_curto']}). Veja o que fica mais fácil:</p>
{lista([
  '<strong>Acompanhe cada processo em tempo real</strong> — o que já foi aprovado, o que está em análise e o que falta.',
  '<strong>Documentos que buscamos para você</strong> — várias certidões (CNPJ, FGTS, trabalhista, federal e outras) são obtidas automaticamente nas fontes oficiais.',
  '<strong>Renovação sem susto</strong> — avisos antes do vencimento e o botão <strong>Renovar</strong> direto no documento.',
  '<strong>Certificado com verificação pública</strong> — qualquer pessoa confere se ele é verdadeiro e está vigente.',
  '<strong>Cotações</strong> — receba e responda pedidos de cotação dos seus clientes.',
  '<strong>Sua equipe</strong> — inclua colegas com e-mail corporativo, cada um com o seu acesso.',
])}
<p>Preparamos um <strong>manual com o passo a passo e imagens das telas</strong>. Ele fica no menu <strong>Ajuda</strong> do SIGEC-ELOS:</p>
{botao('Abrir o manual do fornecedor', AJUDA)}
<p style="font-size:13px;color:#6b7280">Ainda não criou a sua senha? Use o link do e-mail anterior ou "Esqueci minha senha" em elos.eqpitech.com.br.</p>
<p>Até {k['hoc_ate']}, continue usando o SIGEC-HOC para enviar documentos.</p>
{outros_docs(k) if c.get('outros') else ''}{assinatura()}"""
    else:
        assunto = 'O que melhora para a sua equipe no SIGEC-ELOS'
        corpo = f"""<p>{ola}</p>
<p>Faltam poucos dias para a gestão dos fornecedores da <strong>{lista_clientes(c['clientes'])}</strong> passar para o SIGEC-ELOS
({k['inicio_curto']}). Veja o que a sua equipe ganha:</p>
{lista([
  '<strong>Painel e filtros</strong> — homologados, em análise, aguardando pagamento, reprovados e a vencer, em uma tela.',
  '<strong>Priorizar análise</strong> — peça prioridade para um fornecedor com urgência.',
  '<strong>Carta de exceção</strong> — aprove um fornecedor com pendência, por prazo determinado, direto na plataforma.',
  '<strong>Convites com lembretes automáticos</strong> e um <strong>portal de cadastro com a marca da sua empresa</strong>.',
  '<strong>Relatórios e Compliance</strong> — situação dos processos, funil de convites e alertas dos questionários.',
  '<strong>Equipe</strong> — inclua usuários e defina o que cada um pode ver e fazer.',
])}
<p>Preparamos um <strong>manual com o passo a passo e imagens das telas</strong>. Ele fica no menu <strong>Ajuda</strong> do SIGEC-ELOS:</p>
{botao('Abrir o manual do cliente', AJUDA)}
<p style="font-size:13px;color:#6b7280">Ainda não criou a sua senha? Use o link do e-mail anterior ou "Esqueci minha senha" em elos.eqpitech.com.br.</p>{assinatura()}"""
    return assunto, moldura('Comunicado 3 de 4 · O que melhora para você', corpo)

# ── Comunicado 4 (sexta): segunda é no ELOS ─────────────────────────────────
def onda4(c, k):
    ola = f"Olá, {primeiro_nome(c['nome'])}!" if primeiro_nome(c['nome']) else 'Olá!'
    passos = [
        'Acesse <strong>elos.eqpitech.com.br</strong> (os endereços do SIGEC-HOC também vão levar você para lá).',
        f'Entre com o seu e-mail <strong>{c["email"]}</strong> e a senha que você criou. Ainda não criou? Clique em <strong>"Esqueci minha senha"</strong>.',
        'Por segurança, a plataforma vai pedir para você ativar a <strong>verificação em duas etapas</strong> (um código no celular) — você tem 30 dias para isso.',
    ]
    if c['tipo'] == 'SUPPLIER':
        assunto = f"{k['inicio_curto'].capitalize()}: sua homologação passa para o SIGEC-ELOS"
        passos.append('Pronto: seus processos, documentos e pendências estão no painel. A partir de agora, envie e renove documentos por lá.')
        corpo = f"""<p>{ola}</p>
<p>Chegou a hora: a partir de <strong>{k['inicio']}</strong>, a homologação com {lista_clientes(['<strong>' + x + '</strong>' for x in c['clientes']], artigo=True)}
é feita no <strong>SIGEC-ELOS</strong>. Hoje é o último dia de uso do SIGEC-HOC para ela.</p>
<p><strong>Como acessar na segunda:</strong></p>
<ol style="padding-left:20px;margin:0 0 16px">{''.join(f'<li style="margin-bottom:6px">{x}</li>' for x in passos)}</ol>
{botao('Acessar o SIGEC-ELOS', f'{SITE}/login')}
<p>Dúvidas? O <strong>manual do fornecedor</strong> está no menu <strong>Ajuda</strong>, e a nossa equipe de suporte está à disposição nos canais abaixo.</p>
{outros_docs(k) if c.get('outros') else ''}{assinatura()}"""
    else:
        assunto = f"{k['inicio_curto'].capitalize()}: a gestão dos seus fornecedores passa para o SIGEC-ELOS"
        passos.append('Pronto: o painel mostra seus fornecedores e processos. Convites, cotações e acompanhamento passam a ser feitos por lá.')
        corpo = f"""<p>{ola}</p>
<p>Chegou a hora: a partir de <strong>{k['inicio']}</strong>, a gestão dos fornecedores da <strong>{lista_clientes(c['clientes'])}</strong>
é feita no <strong>SIGEC-ELOS</strong>. Hoje é o último dia de uso do SIGEC-HOC.</p>
<p><strong>Como acessar na segunda:</strong></p>
<ol style="padding-left:20px;margin:0 0 16px">{''.join(f'<li style="margin-bottom:6px">{x}</li>' for x in passos)}</ol>
{botao('Acessar o SIGEC-ELOS', f'{SITE}/login')}
<p>Dúvidas? O <strong>manual do cliente</strong> está no menu <strong>Ajuda</strong>, e a nossa equipe de suporte está à disposição nos canais abaixo.</p>{assinatura()}"""
    return assunto, moldura('Comunicado 4 de 4 · Segunda é no SIGEC-ELOS', corpo)

# fornecedor que também atende cliente de outra onda: esses processos seguem no HOC por enquanto
OUTROS = """<p style="background:#fff7ed;border-left:4px solid #F47E2F;padding:10px 14px;border-radius:0 8px 8px 0">
Sua empresa também tem processos com <strong>outros clientes</strong>, que <strong>continuam no SIGEC-HOC por enquanto</strong>.
Nos próximos comunicados explicamos como fica cada um — não se preocupe.</p>"""

ONDAS = {1: onda1, 2: onda2, 3: onda3, 4: onda4}

def campo(camp, onda): return f'{camp}{onda}'          # chave em envios: 'A1', 'B2'…

# só os clientes da campanha entram no texto; 'outros' = também atende cliente de outra onda
SEL = """SELECT id, email, nome, tipo,
  ARRAY(SELECT n FROM unnest(hoc_client_ids, clientes) AS u(i, n) WHERE i = ANY('{ids}')) clientes,
  hoc_client_ids && '{outros}' outros FROM hoc_migration_contacts"""

def sel(camp):
    ids = CAMPANHAS[camp]['ids']; outros = [i for k, v in CAMPANHAS.items() if k != camp for i in v['ids']]
    return SEL.format(ids='{' + ','.join(map(str, ids)) + '}', outros='{' + ','.join(map(str, outros)) + '}')

def contatos(camp, onda, limite=None):
    ids = '{' + ','.join(map(str, CAMPANHAS[camp]['ids'])) + '}'
    lim = f"LIMIT {int(limite)}" if limite else ''
    out = psql(f"SELECT json_agg(row_to_json(x)) FROM ({sel(camp)} WHERE hoc_client_ids && '{ids}' AND NOT (envios ? '{campo(camp, onda)}') ORDER BY tipo, email {lim}) x")
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
    ap.add_argument('--campanha', required=True, choices=list(CAMPANHAS))
    ap.add_argument('--onda', type=int, required=True, choices=list(ONDAS))
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument('--teste', help='envia 1 exemplo de cada versão (fornecedor e cliente) para este e-mail')
    g.add_argument('--previa', action='store_true')
    g.add_argument('--enviar', action='store_true')
    ap.add_argument('--limite', type=int)
    a = ap.parse_args()
    k = CAMPANHAS[a.campanha]
    fn = lambda c: ONDAS[a.onda](c, k)

    if a.teste or a.previa:
        # exemplos reais: um fornecedor com 2 clientes e um usuário de cliente
        ids = '{' + ','.join(map(str, k['ids'])) + '}'
        ex = json.loads(psql(f"""SELECT json_agg(row_to_json(x)) FROM (
          (SELECT * FROM ({sel(a.campanha)}) s WHERE tipo='SUPPLIER' AND cardinality(clientes) > 0 AND NOT outros LIMIT 1)
          UNION ALL (SELECT * FROM ({sel(a.campanha)}) s WHERE tipo='SUPPLIER' AND cardinality(clientes) > 0 AND outros LIMIT 1)
          UNION ALL (SELECT * FROM ({sel(a.campanha)}) s WHERE tipo='CLIENT' AND cardinality(clientes) > 0 LIMIT 1)) x"""))
        for c in ex:
            assunto, html = fn(c)
            if a.previa:
                p = f"/tmp/comunicado{a.campanha}{a.onda}_{c['tipo'].lower()}{'_outros' if c.get('outros') else ''}.html"; open(p, 'w').write(html); print(p, '·', assunto)
            else:
                enviar_lote([{'from': FROM, 'reply_to': REPLY_TO, 'to': [a.teste], 'subject': f"[TESTE {c['tipo']}{' +outros' if c.get('outros') else ''}] {assunto}", 'html': html}])
                print('teste enviado:', c['tipo'], '·', assunto)
        return

    lista = contatos(a.campanha, a.onda, a.limite)
    print(f"campanha {a.campanha} · comunicado {a.onda}: {len(lista)} destinatários pendentes "
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
        psql(f"""UPDATE hoc_migration_contacts h SET envios = envios || jsonb_build_object('{campo(a.campanha, a.onda)}', jsonb_build_object('em', now(), 'id', v.rid)), updated_at = now()
                 FROM (VALUES {vals}) v(id, rid) WHERE h.id = v.id::uuid""")
        ok += len(lote); print(f'  {ok}/{len(lista)}'); time.sleep(0.6)   # limite da Resend: 2 req/s
    print('concluído:', ok)

if __name__ == '__main__':
    main()
