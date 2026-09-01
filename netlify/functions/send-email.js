// netlify/functions/send-email.js
// Envia e-mail via Resend. Aceita 'to' direto OU 'userId' para lookup server-side.
// POST body: { to?, userId?, subject, html }

const { createClient } = require('@supabase/supabase-js')

exports.handler = async (event) => {
  const headers = { 'Content-Type':'application/json','Access-Control-Allow-Origin':'*' }
  if (event.httpMethod === 'OPTIONS') return { statusCode:200, headers, body:'' }

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

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || 'noreply@eqpitech.com.br',
        to: [recipient],
        subject,
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
