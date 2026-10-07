// netlify/functions/send-email.js
// Envia e-mail via Resend. Aceita 'to' direto OU 'userId' para lookup server-side.
// POST body: { to?, userId?, subject, html }

const { createClient } = require('@supabase/supabase-js')
const { guardMail } = require('./lib/mail_guard.js')

exports.handler = async (event) => {
  const headers = { 'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type, Authorization' }
  if (event.httpMethod === 'OPTIONS') return { statusCode:200, headers, body:'' }
  if (event.httpMethod !== 'POST') return { statusCode:405, headers, body: JSON.stringify({ error:'Method not allowed' }) }

  // Autenticação (07/10/2026): a função era aberta — qualquer um enviava e-mail
  // em nome do SIGEC-ELOS (domínio eqpitech) para qualquer destinatário.
  // Aceita só: chamada interna de outra function (Bearer CRON_SECRET) ou o
  // backoffice logado (JWT de usuário ADMIN — fila de análise no navegador).
  const tokenAuth = (event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i, '')
  if (!tokenAuth) return { statusCode:401, headers, body: JSON.stringify({ error:'Não autorizado' }) }
  const interno = !!process.env.CRON_SECRET && tokenAuth === process.env.CRON_SECRET
  if (!interno) {
    const sbAuth = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    const { data: { user } = {}, error: authErr } = await sbAuth.auth.getUser(tokenAuth)
    if (authErr || !user) return { statusCode:401, headers, body: JSON.stringify({ error:'Não autorizado' }) }
    const { data: adm } = await sbAuth.from('user_roles').select('user_id').eq('user_id', user.id).eq('role', 'ADMIN').maybeSingle()
    if (!adm) return { statusCode:403, headers, body: JSON.stringify({ error:'Sem permissão para enviar e-mail' }) }
  }

  let body
  try { body = JSON.parse(event.body) } catch {
    return { statusCode:400, headers, body: JSON.stringify({ error:'JSON inválido' }) }
  }

  const { to, userId, supplierId, subject, html } = body
  if (!subject || !html) return { statusCode:400, headers, body: JSON.stringify({ error:'subject e html são obrigatórios' }) }

  // Resolve o destinatário: to → e-mail do usuário → e-mail do CADASTRO do
  // fornecedor (migrados do HOC não têm login; sem o fallback o envio falhava)
  let recipient = to
  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
  if (!recipient && userId) {
    try {
      const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(userId)
      recipient = user?.email
    } catch (e) {
      console.warn('Lookup userId falhou:', e.message)
    }
  }
  if (!recipient && supplierId) {
    try {
      const { data: sup } = await supabaseAdmin.from('suppliers')
        .select('email').eq('id', supplierId).maybeSingle()
      const cand = String(sup?.email || '').split(/[;,]/)[0].trim()
      if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cand)) recipient = cand
    } catch (e) {
      console.warn('Lookup supplierId falhou:', e.message)
    }
  }

  if (!recipient) return { statusCode:400, headers, body: JSON.stringify({ error:'Destinatário não encontrado' }) }

  if (!process.env.RESEND_API_KEY) {
    console.warn('[send-email] RESEND_API_KEY não configurada — e-mail não enviado')
    return { statusCode:200, headers, body: JSON.stringify({ sent: false, reason:'no_api_key' }) }
  }

  // trava de ambiente: fora de produção nada chega ao destinatário real
  const g = guardMail(recipient, subject)
  if (g.skip) {
    console.log('[send-email] descartado (ambiente não-produção):', subject)
    return { statusCode:200, headers, body: JSON.stringify({ sent: false, reason:'non_production' }) }
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || 'noreply@eqpitech.com.br',
        to: g.to,
        subject: g.subject,
        html,
      }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.message || JSON.stringify(data))
    return { statusCode:200, headers, body: JSON.stringify({ sent: true, id: data.id }) }
  } catch (err) {
    console.error('[send-email] Erro:', err.message)
    return { statusCode:500, headers, body: JSON.stringify({ error: err.message }) }
  }
}
