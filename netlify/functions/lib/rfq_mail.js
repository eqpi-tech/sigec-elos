// E-mail "Nova solicitação de cotação" para os fornecedores de uma RFQ —
// usado pela cotação do CLIENTE (client-rfq-create) e do COMPRADOR
// (buyer-rfq-notify). Destinatário: usuário de login do fornecedor, senão o
// e-mail do cadastro (CLAUDE.md §16); remetente = nome da EMPRESA que pediu.
const { guardMail } = require('./mail_guard.js')
const { frontendUrl } = require('./runtime_env.js')

const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

// → quantidade de e-mails aceitos pela Resend
async function avisarFornecedores(sb, { supplierIds, empresa, title, description, categoria, deadline }) {
  if (!process.env.RESEND_API_KEY || !supplierIds?.length) return 0
  const { data: sups } = await sb.from('suppliers').select('id, razao_social, email, user_id').in('id', supplierIds)
  const site = frontendUrl()
  const prazo = deadline ? String(deadline).slice(0, 10).split('-').reverse().join('/') : null
  const msgs = []
  for (const s of sups || []) {
    let to = s.email
    if (s.user_id) { const { data: u } = await sb.auth.admin.getUserById(s.user_id); to = u?.user?.email || to }
    const g = guardMail(to, `💬 Nova solicitação de cotação de ${empresa} — ${title}`)
    if (g.skip) continue
    msgs.push({ from: process.env.EMAIL_FROM || 'noreply@eqpitech.com.br', to: g.to, subject: g.subject, html: `<div style="font-family:Arial,sans-serif;max-width:540px;margin:0 auto">
  <div style="background:#2E3192;padding:24px;border-radius:12px 12px 0 0;text-align:center"><h1 style="color:#fff;margin:0;font-size:20px">SIGEC-ELOS</h1></div>
  <div style="background:#fff;padding:26px;border:1px solid #e2e8f0;border-top:none;color:#374151;font-size:15px;line-height:1.6">
    <p>A <strong>${esc(empresa)}</strong> enviou uma solicitação de cotação para a <strong>${esc(s.razao_social)}</strong>${categoria ? `, na categoria <strong>${esc(categoria)}</strong>` : ''}.</p>
    <p style="font-size:16px"><strong>${esc(title)}</strong></p>
    ${description ? `<div style="background:#f4f5fa;border-radius:8px;padding:12px 14px;font-size:14px;white-space:pre-wrap">${esc(description)}</div>` : ''}
    ${prazo ? `<p>Prazo para resposta: <strong>${prazo}</strong></p>` : ''}
    <p style="text-align:center;margin:24px 0 8px"><a href="${site}/fornecedor/cotacoes" style="display:inline-block;background:#F47E2F;color:#fff;padding:13px 30px;border-radius:9px;text-decoration:none;font-weight:bold">Responder cotação</a></p>
  </div></div>` })
  }
  let enviados = 0
  for (let i = 0; i < msgs.length; i += 100) {            // API de lote da Resend: até 100 por chamada
    const r = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      body: JSON.stringify(msgs.slice(i, i + 100)),
    }).catch((e) => ({ ok: false, statusText: e.message }))
    if (r.ok) enviados += Math.min(100, msgs.length - i)
    else console.warn('[rfq_mail] lote de e-mails:', r.status || '', r.statusText)
  }
  return enviados
}

module.exports = { avisarFornecedores }
