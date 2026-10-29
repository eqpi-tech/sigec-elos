// netlify/functions/golive-run-background.js — execução do go-live de um cliente
// (29/10/2026; 1º uso: VIXPAR em 04/11). Lê a fila golive_suppliers (patch_169)
// e, para cada empresa PENDENTE:
//   · modo 'convite'     → convite do cliente (o MESMO do botão "Novo convite"),
//                           subsidiado, com os e-mails Operacional no convite
//                           (viram usuários quando a empresa se cadastra);
//   · modo 'precadastro' → por pessoa (Acesso Total): cria/reaproveita o login e
//                           cadastra cada empresa pelo MESMO create-supplier da
//                           tela (dados da Receita, documentos automáticos,
//                           categoria da planilha, processo liberado, coleta);
//                           depois inclui os Operacionais e manda UM e-mail de
//                           acesso por pessoa, com a lista das empresas.
// Idempotente e retomável (status por empresa; e-mail de acesso registrado em
// audit_log GOLIVE_ACESSO_ENVIADO): o workflow dispara de novo até zerar.
// POST Bearer CRON_SECRET { campanha, dryRun? }  ·  configuração em
// app_settings 'golive_campanhas' → { "VIX": { "client_id": "…", "cliente": "…" } }
const { createClient } = require('@supabase/supabase-js')
const { handleClientInvitation } = require('./send-invitation.js')
const team = require('./lib/supplier_team.js')
const { env } = require('./lib/runtime_env.js')

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const PRAZO_MS = 13 * 60 * 1000
const pausa = (ms) => new Promise((r) => setTimeout(r, ms))
const norm = (s) => String(s || '').normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const site = () => (env('ELOS_ENV') === 'production' ? env('URL') : (env('DEPLOY_PRIME_URL') || env('URL')))

async function marcar(id, patch) {
  await sb.from('golive_suppliers').update({ ...patch, processado_em: new Date().toISOString() }).eq('id', id)
}

async function categoriaDe(cats, sub) {
  const k = norm(sub)
  if (!k) return null
  if (k.startsWith('clinica credenciada')) return cats.get('clinica credenciada') || null
  if (k.startsWith('manutecao de ar')) return cats.get('manutencao de ar condicionado') || null
  return cats.get(k) || null
}

async function acessoJaEnviado(email, campanha) {
  const { data } = await sb.from('audit_log').select('id').eq('action', 'GOLIVE_ACESSO_ENVIADO')
    .eq('metadata->>email', email).eq('metadata->>campanha', campanha).limit(1)
  return !!data?.length
}

exports.handler = async (event) => {
  const auth = (event.headers?.authorization || '').replace('Bearer ', '')
  if (!process.env.CRON_SECRET || auth !== process.env.CRON_SECRET) return { statusCode: 401, body: 'unauthorized' }
  const inicio = Date.now()
  const { campanha = 'VIX', dryRun = false } = JSON.parse(event.body || '{}')
  const resumo = { campanha, convites: 0, cadastradas: 0, erros: [], acessos: 0, operacionais: 0, pendentes: 0 }
  try {
    const { data: cfgRow } = await sb.from('app_settings').select('value').eq('key', 'golive_campanhas').maybeSingle()
    const cfg = cfgRow?.value?.[campanha]
    if (!cfg?.client_id) throw new Error(`campanha ${campanha} sem configuração em app_settings 'golive_campanhas'`)
    const [{ data: flows }, { data: catRows }] = await Promise.all([
      sb.from('client_flows').select('id, name').eq('client_id', cfg.client_id).eq('active', true),
      sb.from('categories').select('id, name').eq('client_id', cfg.client_id),
    ])
    const flowId = new Map((flows || []).map((f) => [f.name, f.id]))
    const cats = new Map((catRows || []).map((c) => [norm(c.name), c.id]))
    const caller = { id: null, email: 'suporte@eqpitech.com.br' }

    const { data: fila } = await sb.from('golive_suppliers').select('*').eq('campanha', campanha).order('master_email').order('nome')
    const pend = (fila || []).filter((r) => r.status === 'PENDENTE')

    // ── 1) convites ───────────────────────────────────────────────────────
    for (const r of pend.filter((x) => x.modo === 'convite')) {
      if (Date.now() - inicio > PRAZO_MS) break
      const fid = flowId.get(r.flow_name)
      if (!fid) { await marcar(r.id, { status: 'ERRO', erro: `fluxo "${r.flow_name}" não encontrado` }); resumo.erros.push(r.nome); continue }
      if (dryRun) { resumo.convites++; continue }
      const res = await handleClientInvitation({
        razao_social: r.razao_social || r.nome, cnpj: r.cnpj, email: r.master_email, client_id: cfg.client_id,
        flow_id: fid, subsidiado: true, invited_by_role: 'CLIENT', objetivo: 'homologacao', operational_emails: r.operacionais,
      }, caller, {}, { sendEmail: true })
      const out = JSON.parse(res.body || '{}')
      if (res.statusCode >= 300) { await marcar(r.id, { status: 'ERRO', erro: out.error || `HTTP ${res.statusCode}` }); resumo.erros.push(`${r.nome}: ${out.error}`); continue }
      await marcar(r.id, { status: 'ENVIADO', invitation_id: out.inviteId, erro: null })
      resumo.convites++
      await pausa(700)                                  // limite da Resend
    }

    // ── 2) pré-cadastro, por pessoa (Acesso Total) ────────────────────────
    const grupos = new Map()
    for (const r of (fila || []).filter((x) => x.modo === 'precadastro' && x.status !== 'SUSPENSO')) {
      if (!grupos.has(r.master_email)) grupos.set(r.master_email, [])
      grupos.get(r.master_email).push(r)
    }
    for (const [master, rows] of grupos) {
      if (Date.now() - inicio > PRAZO_MS) break
      const u = dryRun ? { id: null } : await team.ensureUser(sb, master, null)
      for (const r of rows.filter((x) => x.status === 'PENDENTE')) {
        if (Date.now() - inicio > PRAZO_MS) break
        const fid = flowId.get(r.flow_name)
        const catId = await categoriaDe(cats, r.subcategoria)
        if (!fid || !catId) { await marcar(r.id, { status: 'ERRO', erro: !fid ? `fluxo "${r.flow_name}" não encontrado` : `categoria "${r.subcategoria}" não encontrada` }); resumo.erros.push(r.nome); continue }
        if (dryRun) { resumo.cadastradas++; continue }
        try {
          // convite do cliente sem e-mail (o vínculo e o processo nascem dele)
          const inv = await handleClientInvitation({
            razao_social: r.razao_social || r.nome, cnpj: r.cnpj, email: master, client_id: cfg.client_id,
            flow_id: fid, subsidiado: true, invited_by_role: 'CLIENT', objetivo: 'homologacao',
          }, caller, {}, { sendEmail: false })
          const invOut = JSON.parse(inv.body || '{}')
          if (inv.statusCode >= 300 || !invOut.token) throw new Error(invOut.error || `convite HTTP ${inv.statusCode}`)
          // dados da Receita pela mesma consulta da tela
          const lk = await fetch(`${site()}/.netlify/functions/cnpj-lookup?cnpj=${r.cnpj}`, { signal: AbortSignal.timeout(25000) }).then((x) => x.json())
          const d = lk?.cnpj || null
          const cs = await fetch(`${site()}/.netlify/functions/create-supplier`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.CRON_SECRET}` },
            signal: AbortSignal.timeout(28000),
            body: JSON.stringify({
              as_user_id: u.id, skip_welcome: true,
              cnpj: r.cnpj, razao_social: d?.razao_social || r.razao_social || r.nome,
              nome_fantasia: d?.nome_fantasia || null, cnae_main: d?.cnae_fiscal_descricao || '',
              cnae_list: d?.cnaes_secundarios?.map((c) => c.codigo) || [], state: d?.uf || '', city: d?.municipio || '',
              phone: d?.ddd_telefone_1 || null, sanctions_checked: true, sanctions_result: lk?.sanctions || null,
              cnpj_full_data: d, category_ids: [catId], invitation_token: invOut.token, marketplace_optin: true,
            }),
          })
          const csOut = await cs.json().catch(() => ({}))
          if (cs.status >= 300) throw new Error(csOut.error || `cadastro HTTP ${cs.status}`)
          await marcar(r.id, { status: 'CADASTRADO', supplier_id: csOut.supplier?.id || null, invitation_id: invOut.inviteId, user_id: u.id, erro: null })
          r.status = 'CADASTRADO'; r.supplier_id = csOut.supplier?.id
          resumo.cadastradas++
        } catch (e) {
          await marcar(r.id, { status: 'ERRO', erro: String(e.message).slice(0, 500) })
          r.status = 'ERRO'; resumo.erros.push(`${r.nome}: ${e.message}`)
        }
      }
      // grupo concluído (nenhuma empresa pendente): Operacionais + e-mails de acesso
      if (dryRun || rows.some((x) => x.status === 'PENDENTE')) continue
      const feitas = rows.filter((x) => x.status === 'CADASTRADO' && x.supplier_id)
      if (!feitas.length) continue
      const porOp = new Map()
      for (const r of feitas) for (const e of r.operacionais || []) {
        if (!porOp.has(e)) porOp.set(e, [])
        porOp.get(e).push(r)
      }
      try {
        if (!(await acessoJaEnviado(master, campanha))) {
          const { data: au } = await sb.auth.admin.getUserById(u.id)
          const link = (u.novo || !au?.user?.last_sign_in_at) ? await team.linkSenha(sb, u.id, master, null) : null
          await team.emailAcesso({ to: master, cliente: cfg.cliente, empresas: feitas.map((x) => x.razao_social || x.nome), link, papel: 'Acesso Total' })
          await sb.from('audit_log').insert({ user_id: u.id, action: 'GOLIVE_ACESSO_ENVIADO', entity_type: 'user', entity_id: u.id,
            metadata: { email: master, campanha, papel: 'Acesso Total', empresas: feitas.length, link_senha: !!link } })
          resumo.acessos++
          await pausa(700)
        }
        for (const [e, emps] of porOp) {
          if (await acessoJaEnviado(e, campanha)) continue
          const op = await team.ensureUser(sb, e, null)
          for (const r of emps) {
            const v = await team.vincular(sb, op.id, r.supplier_id, 'Operacional')
            if (!v.ok) resumo.erros.push(`Operacional ${e} em ${r.nome}: ${v.erro}`)
          }
          const { data: ou } = await sb.auth.admin.getUserById(op.id)
          const link = (op.novo || !ou?.user?.last_sign_in_at) ? await team.linkSenha(sb, op.id, e, null) : null
          await team.emailAcesso({ to: e, cliente: cfg.cliente, empresas: emps.map((x) => x.razao_social || x.nome), link, papel: 'Operacional' })
          await sb.from('audit_log').insert({ user_id: op.id, action: 'GOLIVE_ACESSO_ENVIADO', entity_type: 'user', entity_id: op.id,
            metadata: { email: e, campanha, papel: 'Operacional', empresas: emps.length, link_senha: !!link } })
          resumo.operacionais++
          await pausa(700)
        }
      } catch (e) { resumo.erros.push(`acesso ${master}: ${e.message}`) }
    }
    const { count } = await sb.from('golive_suppliers').select('id', { count: 'exact', head: true }).eq('campanha', campanha).eq('status', 'PENDENTE')
    resumo.pendentes = count || 0
  } catch (e) { resumo.erros.push(`geral: ${e.message}`) }
  console.log('[golive-run]', JSON.stringify(resumo))
  await sb.from('audit_log').insert({ action: 'GOLIVE_RUN', entity_type: 'campanha', metadata: { ...resumo, dryRun: !!JSON.parse(event.body || '{}').dryRun } })
  return { statusCode: 200, body: JSON.stringify(resumo) }
}
