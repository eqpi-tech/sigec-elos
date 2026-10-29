"""Execução do go-live de cliente e acompanhamento diário (29/10/2026; 1º uso: VIXPAR, 04/11).

  python3 scripts/comunicados_golive/execucao.py --status VIX              # fila por modo/status + últimas rodadas
  python3 scripts/comunicados_golive/execucao.py --aprovar VIX             # trava: execução aprovada (sem isso nada roda)
  python3 scripts/comunicados_golive/execucao.py --pausar VIX              # desliga a trava (para rodadas e agendamentos)
  python3 scripts/comunicados_golive/execucao.py --executar VIX            # roda agora até zerar a fila
  python3 scripts/comunicados_golive/execucao.py --agendado                # dia de EXECUCAO: espera 09:00 BRT e executa
  python3 scripts/comunicados_golive/execucao.py --resumo-diario [--para x@y]  # resumo do dia agora (janela RESUMO)
  python3 scripts/comunicados_golive/execucao.py --resumo-agendado         # espera 18:00 BRT; 1 por dia (audit GOLIVE_RESUMO)

A execução em si é a função golive-run-background (convites, pré-cadastros,
Operacionais, e-mails de acesso). Ela é idempotente: cada rodada só pega o que
está PENDENTE, e quem já recebeu acesso não recebe de novo. Este script dispara
uma rodada, espera o registro GOLIVE_RUN dela no audit_log e dispara outra até
a fila zerar ou parar de andar (aí avisa por e-mail).
Configuração em app_settings 'golive_campanhas' → { "VIX": { client_id, cliente,
alertas: [e-mails do acompanhamento] } }. Trava em app_settings 'golive_execucao_<CAMP>'.
"""
import argparse, datetime, json, os, sys, time, urllib.request
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(__file__))
from enviar import ENV, psql, q, resend, moldura   # mesmo banco, mesma Resend, mesma moldura

CRON = os.environ.get('CRON_SECRET') or ENV.get('CRON_SECRET')
SITE = (os.environ.get('SITE_URL') or ENV.get('SITE_URL') or 'https://elos.eqpitech.com.br').rstrip('/')
BRT = ZoneInfo('America/Sao_Paulo')
EXECUCAO = {'2026-11-04': 'VIX'}                       # data em Brasília → campanha (workflow golive-execucao.yml)
RESUMO = {'VIX': ('2026-11-04', '2026-11-17')}        # janela do resumo diário das 18:00
RODADA_MAX_S = 17 * 60                                 # a função para sozinha aos 13 min
MAX_RODADAS = 12
T0 = time.time()
JOB_MAX_S = 335 * 60                                  # o job do GitHub morre aos 360 min

def cfg(camp):
    v = psql("select value::text from app_settings where key='golive_campanhas'").strip()
    c = (json.loads(v) if v else {}).get(camp)
    if not c or not c.get('client_id'): raise SystemExit(f"{camp}: sem configuração em app_settings 'golive_campanhas'")
    return c

def alertas(c): return c.get('alertas') or ['suporte@eqpitech.com.br']

def aprovada(camp):
    return psql(f"select coalesce((value->>'aprovada')::boolean, false) from app_settings where key={q('golive_execucao_' + camp)}").strip() == 't'

def contagem(camp):
    out = psql(f"select modo, status, count(*) from golive_suppliers where campanha={q(camp)} group by 1, 2 order by 1, 2")
    return [l.split('|') for l in out.strip().splitlines() if l]

def pendentes(camp):
    return int(psql(f"select count(*) from golive_suppliers where campanha={q(camp)} and status='PENDENTE'").strip())

def ultima_rodada(camp, depois):
    out = psql(f"select created_at, metadata::text from audit_log where action='GOLIVE_RUN' and metadata->>'campanha'={q(camp)} "
               f"and created_at > {q(depois)} order by created_at desc limit 1").strip()
    if not out: return None
    em, meta = out.split('|', 1)
    return json.loads(meta)

def disparar(camp):
    req = urllib.request.Request(f'{SITE}/.netlify/functions/golive-run-background', method='POST',
                                 data=json.dumps({'campanha': camp}).encode(),
                                 headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {CRON}'})
    with urllib.request.urlopen(req, timeout=30) as r: return r.status   # background → 202

def tabela(linhas, cab):
    th = ''.join(f'<th style="text-align:left;padding:6px 8px;border-bottom:2px solid #e2e8f0">{h}</th>' for h in cab)
    tr = ''.join('<tr>' + ''.join(f'<td style="padding:6px 8px;border-bottom:1px solid #f1f5f9">{x}</td>' for x in l) + '</tr>' for l in linhas)
    return f'<table style="border-collapse:collapse;font-size:13px;width:100%;margin:8px 0 16px">{th and "<tr>" + th + "</tr>"}{tr}</table>'

def avisar(c, assunto, corpo):
    for e in alertas(c):
        try: resend(e, assunto, moldura(None, 'Go-live · acompanhamento interno', corpo)); time.sleep(0.6)
        except Exception as ex: print('falha ao avisar', e, ex)

def erros(camp, limite=40):
    out = psql(f"select nome, cnpj, coalesce(erro,'') from golive_suppliers where campanha={q(camp)} and status='ERRO' order by nome limit {limite}")
    return [l.split('|') for l in out.strip().splitlines() if l]

def executar(camp):
    c = cfg(camp)
    if not aprovada(camp):
        avisar(c, f'[GO-LIVE {c["cliente"]}] NÃO executado — falta a aprovação', '<p>A execução de hoje não rodou porque a trava '
               f'<code>golive_execucao_{camp}</code> não está aprovada. Ninguém recebeu nada.</p>')
        print(f'{camp}: execução não aprovada (--aprovar {camp}). Nada feito.'); return
    inicio_pend, rodadas, travadas = pendentes(camp), 0, 0
    print(f'{camp}: {inicio_pend} pendentes no início', flush=True)
    if inicio_pend == 0: print('nada pendente — já executado'); return   # disparo de reserva
    while rodadas < MAX_RODADAS:
        if not aprovada(camp): print('pausado pela trava'); break
        if time.time() - T0 > JOB_MAX_S - RODADA_MAX_S: print('sem tempo para outra rodada neste job — a reserva continua'); break
        antes = pendentes(camp)
        marca = psql('select now()').strip()
        st = disparar(camp); rodadas += 1
        print(f'rodada {rodadas}: HTTP {st}, {antes} pendentes', flush=True)
        r, t0 = None, time.time()
        while time.time() - t0 < RODADA_MAX_S:
            time.sleep(30)
            r = ultima_rodada(camp, marca)
            if r: break
        if not r:
            travadas += 1; print('rodada sem registro no prazo', flush=True)
            if travadas >= 2: break
            continue
        print(' ', json.dumps(r, ensure_ascii=False)[:600], flush=True)
        depois = r.get('pendentes', pendentes(camp))
        if depois == 0: break
        if depois >= antes:                              # não andou
            travadas += 1
            if travadas >= 2: break
        else: travadas = 0
    fim = pendentes(camp)
    cont, errs = contagem(camp), erros(camp)
    ok = fim == 0
    corpo = (f'<p><strong>{"Concluído" if ok else "ATENÇÃO: a fila não zerou"}</strong> — {rodadas} rodada(s); '
             f'pendentes no início {inicio_pend}, agora {fim}.</p>' + tabela(cont, ['Modo', 'Status', 'Empresas']))
    if errs: corpo += '<p><strong>Empresas com erro</strong> (corrigir e voltar para PENDENTE — ver o runbook):</p>' + tabela(errs, ['Empresa', 'CNPJ', 'Erro'])
    avisar(c, f'[GO-LIVE {c["cliente"]}] {"executado" if ok and not errs else "executado com pendências" if ok else "ALERTA — fila parada"}', corpo)
    if not ok: raise SystemExit(f'{camp}: fila não zerou ({fim} pendentes)')

def resumo_diario(para=None, forcar=False, agendado=False):
    agora = datetime.datetime.now(BRT)
    hoje = agora.date().isoformat()
    for camp, (de, ate) in RESUMO.items():
        if not forcar and not (de <= hoje <= ate): continue
        chave = f'{camp}:{hoje}'
        if agendado:
            if psql(f"select 1 from audit_log where action='GOLIVE_RESUMO' and metadata->>'chave'={q(chave)} limit 1").strip():
                print('resumo de hoje já enviado'); continue
            alvo = agora.replace(hour=18, minute=0, second=0, microsecond=0)
            if agora < alvo:
                print(f'aguardando até {alvo:%H:%M} (Brasília)…', flush=True)
                time.sleep((alvo - agora).total_seconds())
        c = cfg(camp)
        sub = f"select supplier_id from golive_suppliers where campanha={q(camp)} and supplier_id is not null"
        n = lambda sql: int(psql(sql).strip() or 0)
        conv = psql(f"select i.status, count(*) from golive_suppliers g join invitations i on i.id=g.invitation_id "
                    f"where g.campanha={q(camp)} and g.modo='convite' group by 1 order by 1")
        conv = [l.split('|') for l in conv.strip().splitlines() if l]
        cadastr_conv = n(f"select count(*) from golive_suppliers g join invitations i on i.id=g.invitation_id where g.campanha={q(camp)} and g.modo='convite' and i.supplier_id is not null")
        pre = n(f"select count(*) from golive_suppliers where campanha={q(camp)} and modo='precadastro' and status='CADASTRADO'")
        logins = psql(f"select count(*) filter (where u.last_sign_in_at is not null), count(*) from (select distinct user_id from golive_suppliers where campanha={q(camp)} and user_id is not null) g join auth.users u on u.id=g.user_id").strip().split('|')
        termos = n(f"select count(distinct supplier_id) from client_term_acceptances where client_id={q(c['client_id'])} and supplier_id in ({sub})")
        selos = psql(f"select s.status, count(*) from seals s where s.client_id={q(c['client_id'])} and (s.supplier_id in ({sub}) "
                     f"or s.supplier_id in (select i.supplier_id from golive_suppliers g join invitations i on i.id=g.invitation_id where g.campanha={q(camp)})) group by 1 order by 1")
        selos = [l.split('|') for l in selos.strip().splitlines() if l]
        docs_hoje = n(f"select count(*) from documents d where d.created_at::date = (now() at time zone 'America/Sao_Paulo')::date and (d.supplier_id in ({sub}) "
                      f"or d.supplier_id in (select i.supplier_id from golive_suppliers g join invitations i on i.id=g.invitation_id where g.campanha={q(camp)}))")
        errs = erros(camp)
        corpo = (f'<p>Resumo do dia {datetime.date.fromisoformat(hoje):%d/%m} — go-live <strong>{c["cliente"]}</strong>.</p>'
                 '<p><strong>Convites</strong></p>' + tabela(conv or [['—', '0']], ['Status do convite', 'Empresas'])
                 + f'<p>Empresas convidadas que já concluíram o cadastro: <strong>{cadastr_conv}</strong></p>'
                 + '<p><strong>Pré-cadastro</strong></p>'
                 + tabela([['Empresas cadastradas pela EQPI', pre], ['Logins (Acesso Total) que já entraram', f'{logins[0]} de {logins[1]}'],
                           ['Empresas com os termos aceitos', termos]], ['', ''])
                 + '<p><strong>Processos</strong></p>' + tabela(selos or [['—', '0']], ['Status do selo', 'Processos'])
                 + f'<p>Documentos enviados hoje: <strong>{docs_hoje}</strong></p>')
        if errs: corpo += '<p><strong>Empresas com erro na execução</strong></p>' + tabela(errs, ['Empresa', 'CNPJ', 'Erro'])
        for e in ([para] if para else alertas(c)):
            print('resumo', camp, e, resend(e, f'[GO-LIVE {c["cliente"]}] Resumo do dia {datetime.date.fromisoformat(hoje):%d/%m}',
                                            moldura(None, 'Go-live · acompanhamento interno', corpo)))
            time.sleep(0.6)
        if agendado: psql(f"insert into audit_log (action, entity_type, metadata) values ('GOLIVE_RESUMO', 'campanha', jsonb_build_object('chave', {q(chave)}))")

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--status'); ap.add_argument('--aprovar'); ap.add_argument('--pausar'); ap.add_argument('--executar')
    ap.add_argument('--agendado', action='store_true'); ap.add_argument('--resumo-diario', action='store_true')
    ap.add_argument('--para'); ap.add_argument('--forcar', action='store_true'); ap.add_argument('--resumo-agendado', action='store_true')
    a = ap.parse_args()
    if a.status:
        for l in contagem(a.status): print(' | '.join(l))
        print('aprovada:', aprovada(a.status), '· pendentes:', pendentes(a.status))
        print(psql(f"select created_at, metadata::text from audit_log where action='GOLIVE_RUN' and metadata->>'campanha'={q(a.status)} order by created_at desc limit 5"))
    elif a.aprovar or a.pausar:
        camp, sim = (a.aprovar, True) if a.aprovar else (a.pausar, False)
        psql(f"insert into app_settings (key, value) values ({q('golive_execucao_' + camp)}, jsonb_build_object('aprovada', {str(sim).lower()}, 'em', now())) "
             f"on conflict (key) do update set value = excluded.value")
        print(camp, 'execução', 'APROVADA' if sim else 'PAUSADA')
    elif a.executar: executar(a.executar)
    elif a.agendado:
        agora = datetime.datetime.now(BRT)
        camp = EXECUCAO.get(agora.date().isoformat())
        if not camp: print('nada agendado para', agora.date())
        else:
            alvo = agora.replace(hour=9, minute=0, second=0, microsecond=0)
            if agora < alvo:
                print(f'aguardando até {alvo:%H:%M} (Brasília)…', flush=True)
                time.sleep((alvo - agora).total_seconds())
            executar(camp)
    elif a.resumo_diario: resumo_diario(a.para, a.forcar)
    elif a.resumo_agendado: resumo_diario(agendado=True)
    else: ap.print_help()
