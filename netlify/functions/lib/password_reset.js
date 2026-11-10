// lib/password_reset.js — link de redefinição de senha do próprio ELOS (patch_171).
// Usado pelo "Esqueci minha senha" (password-reset.js) e pelo reset do
// backoffice (admin-manage-users.js). Abrir o link não consome nada — os filtros
// de e-mail corporativos podem abrir à vontade; a senha só muda no POST com a
// senha nova. Uso único, 24 h; um pedido novo invalida os anteriores.
const crypto = require('crypto')
const { frontendUrl } = require('./runtime_env.js')
const { guardedResend } = require('./mail_guard.js')

const VALIDADE_H = 24
const hash = (t) => crypto.createHash('sha256').update(String(t)).digest('hex')

async function criarLink(admin, userId, origem = 'esqueci') {
  const agora = new Date().toISOString()
  // pedido novo invalida os links anteriores ainda abertos
  await admin.from('password_reset_tokens').update({ used_at: agora })
    .eq('user_id', userId).is('used_at', null)
  const token = crypto.randomBytes(32).toString('base64url')
  const { error } = await admin.from('password_reset_tokens').insert({
    user_id: userId, token_hash: hash(token), origem,
    expires_at: new Date(Date.now() + VALIDADE_H * 3600e3).toISOString(),
  })
  if (error) throw new Error(`token de redefinição: ${error.message}`)
  return `${frontendUrl()}/redefinir-senha?t=${token}`
}

// token válido → linha; senão null
async function validar(admin, token) {
  if (!token || typeof token !== 'string' || token.length < 30) return null
  const { data } = await admin.from('password_reset_tokens').select('id, user_id, expires_at, used_at')
    .eq('token_hash', hash(token)).maybeSingle()
  if (!data || data.used_at || new Date(data.expires_at) < new Date()) return null
  return data
}

async function enviarEmail(to, link, { backoffice = false } = {}) {
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#374151">
  <div style="background:#2E3192;padding:24px;border-radius:12px 12px 0 0;text-align:center"><div style="color:#fff;font-size:22px;font-weight:bold">SIGEC-ELOS</div></div>
  <div style="background:#fff;padding:26px;border:1px solid #e2e8f0;border-top:none;font-size:15px;line-height:1.65">
    <p>Olá!</p>
    <p>${backoffice ? 'A equipe do SIGEC-ELOS gerou um link para você redefinir a sua senha.' : 'Recebemos o seu pedido de redefinição de senha do SIGEC-ELOS.'} Clique no botão abaixo e defina a sua nova senha.</p>
    <p style="text-align:center;margin:24px 0"><a href="${link}" style="display:inline-block;background:#F47E2F;color:#fff;padding:14px 34px;border-radius:9px;text-decoration:none;font-weight:bold">Definir nova senha</a></p>
    <p style="font-size:13px;color:#6b7280">O link vale por ${VALIDADE_H} horas e pode ser usado uma vez. Se você não pediu a redefinição, ignore este e-mail — a sua senha continua a mesma.</p>
    <p style="margin-top:20px">Equipe SIGEC-ELOS · EQPI Tech</p></div>
  <div style="background:#f8fafc;padding:14px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;text-align:center;font-size:12px;color:#6b7280">Dúvidas? suporte@eqpitech.com.br · WhatsApp (11) 5039-6769</div></div>`
  const r = await guardedResend('https://api.resend.com/emails', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    body: JSON.stringify({ from: 'SIGEC-ELOS <noreply@eqpitech.com.br>', reply_to: 'suporte@eqpitech.com.br', to: [to], subject: 'SIGEC-ELOS — Redefinição de senha', html }),
  })
  if (!r.ok) throw new Error(`e-mail de redefinição: HTTP ${r.status}`)
}

module.exports = { criarLink, validar, enviarEmail, hash }
