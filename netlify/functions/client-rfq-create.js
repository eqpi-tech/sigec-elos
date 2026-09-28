// netlify/functions/client-rfq-create.js — cliente cria uma RFQ (patch_102).
// Grava a RFQ, gera uma resposta 'SENT' por fornecedor candidato e avisa cada
// um por e-mail (remetente = empresa do cliente, resolvida aqui — CLAUDE.md §14).
// POST { title, description?, categoryId, deadline? 'AAAA-MM-DD', scope 'own'|'elos' }
const { createClient } = require('@supabase/supabase-js')
const { guardMail } = require('./lib/mail_guard.js')

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const HEADERS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' }
const res = (code, body) => ({ statusCode: code, headers: HEADERS, body: JSON.stringify(body) })
const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return res(200, {})
  if (event.httpMethod !== 'POST') return res(405, { error: 'Method not allowed' })
  const token = (event.headers.authorization || '').replace('Bearer ', '')
  const { data: { user } = {}, error: authErr } = await sb.auth.getUser(token)
  if (authErr || !user) return res(401, { error: 'Sessão expirada — saia e entre novamente na plataforma' })

  let body
  try { body = JSON.parse(event.body || '{}') } catch { return res(400, { error: 'JSON inválido' }) }
  const title = String(body.title || '').trim()
  const categoryId = Number(body.categoryId)
  const scope = body.scope === 'elos' ? 'elos' : 'own'
  if (!title || !categoryId) return res(400, { error: 'Preencha o título e a categoria.' })
  if (body.deadline && !/^\d{4}-\d{2}-\d{2}$/.test(body.deadline)) return res(400, { error: 'Prazo inválido' })

  try {
    const { data: role } = await sb.from('user_roles').select('client_id')
      .eq('user_id', user.id).eq('role', 'CLIENT').not('client_id', 'is', null).limit(1).maybeSingle()
    if (!role?.client_id) return res(403, { error: 'Apenas usuários de cliente criam cotações' })
    const clientId = role.client_id
    const { data: cat } = await sb.from('categories').select('id, name, client_id').eq('id', categoryId).maybeSingle()
    if (!cat || cat.client_id !== clientId) return res(400, { error: 'Categoria não pertence ao seu cadastro' })
    const { data: cli } = await sb.from('clients').select('razao_social, nome_fantasia').eq('id', clientId).single()
    const empresa = cli?.nome_fantasia || cli?.razao_social || 'Cliente ELOS'

    const { data: cands, error: cErr } = await sb.rpc('rfq_candidates', { p_client: clientId, p_category: categoryId, p_scope: scope })
    if (cErr) throw new Error(cErr.message)
    if (!cands?.length) return res(400, { error: 'Nenhum fornecedor homologado nesta categoria para o alcance escolhido' })

    const { data: rfq, error: rErr } = await sb.from('rfqs').insert({
      client_id: clientId, title, description: String(body.description || '').trim() || null,
      category_id: categoryId, category: cat.name, deadline: body.deadline || null,
      requester_role: 'CLIENT', status: 'SENT', scope,
    }).select('id').single()
    if (rErr) throw new Error(rErr.message)

    const ids = [...new Set(cands.map((c) => c.supplier_id))]
    for (let i = 0; i < ids.length; i += 500) {
      const { error } = await sb.from('rfq_responses')
        .insert(ids.slice(i, i + 500).map((sid) => ({ rfq_id: rfq.id, supplier_id: sid, status: 'SENT' })))
      if (error) throw new Error(error.message)
    }

    // e-mail: usuário de login do fornecedor, senão o e-mail do cadastro (§14)
    let enviados = 0
    if (process.env.RESEND_API_KEY) {
      const { data: sups } = await sb.from('suppliers').select('id, razao_social, email, user_id').in('id', ids)
      const site = process.env.FRONTEND_URL || 'https://elos.eqpitech.com.br'
      const prazo = body.deadline ? body.deadline.split('-').reverse().join('/') : null
      const msgs = []
      for (const s of sups || []) {
        let to = s.email
        if (s.user_id) { const { data: u } = await sb.auth.admin.getUserById(s.user_id); to = u?.user?.email || to }
        const g = guardMail(to, `💬 Nova solicitação de cotação de ${empresa} — ${title}`)
        if (g.skip) continue
        msgs.push({ from: process.env.EMAIL_FROM || 'noreply@eqpitech.com.br', to: g.to, subject: g.subject, html: `<div style="font-family:Arial,sans-serif;max-width:540px;margin:0 auto">
  <div style="background:#2E3192;padding:24px;border-radius:12px 12px 0 0;text-align:center"><h1 style="color:#fff;margin:0;font-size:20px">SIGEC-ELOS</h1></div>
  <div style="background:#fff;padding:26px;border:1px solid #e2e8f0;border-top:none;color:#374151;font-size:15px;line-height:1.6">
    <p>A <strong>${esc(empresa)}</strong> enviou uma solicitação de cotação para a <strong>${esc(s.razao_social)}</strong>, na categoria <strong>${esc(cat.name)}</strong>.</p>
    <p style="font-size:16px"><strong>${esc(title)}</strong></p>
    ${body.description ? `<div style="background:#f4f5fa;border-radius:8px;padding:12px 14px;font-size:14px;white-space:pre-wrap">${esc(body.description)}</div>` : ''}
    ${prazo ? `<p>Prazo para resposta: <strong>${prazo}</strong></p>` : ''}
    <p style="text-align:center;margin:24px 0 8px"><a href="${site}/fornecedor/cotacoes" style="display:inline-block;background:#F47E2F;color:#fff;padding:13px 30px;border-radius:9px;text-decoration:none;font-weight:bold">Responder cotação</a></p>
  </div></div>` })
      }
      for (let i = 0; i < msgs.length; i += 100) {            // API de lote da Resend: até 100 por chamada
        const r = await fetch('https://api.resend.com/emails/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
          body: JSON.stringify(msgs.slice(i, i + 100)),
        }).catch((e) => ({ ok: false, statusText: e.message }))
        if (r.ok) enviados += Math.min(100, msgs.length - i)
        else console.warn('[client-rfq-create] lote de e-mails:', r.status || '', r.statusText)
      }
    }

    await sb.from('audit_log').insert({ user_id: user.id, action: 'RFQ_CREATED', entity_type: 'rfq', entity_id: rfq.id,
      metadata: { client_id: clientId, category_id: categoryId, scope, fornecedores: ids.length, emails: enviados } })
    return res(200, { rfq_id: rfq.id, fornecedores: ids.length, proprios: cands.filter((c) => c.own).length, emails: enviados })
  } catch (e) {
    console.error('[client-rfq-create]', e)
    return res(500, { error: e.message })
  }
}
