// netlify/functions/password-reset.js — "Esqueci minha senha" com link do ELOS
// (10/11/2026, patch_171 + lib/password_reset.js). Substitui o link de
// recuperação do Supabase, consumido pelos filtros de e-mail corporativos.
//   POST { email }              → sempre { ok: true } (não revela se o e-mail existe)
//   POST { token }              → { ok, email } se o link vale; 410 se não
//   POST { token, password }    → grava a senha nova; o link deixa de valer
const { createClient } = require('@supabase/supabase-js')
const pr = require('./lib/password_reset.js')

const H = { 'Content-Type': 'application/json' }
const res = (c, b) => ({ statusCode: c, headers: H, body: JSON.stringify(b) })
const INTERVALO_S = 60     // um pedido por minuto por usuário

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return res(405, { error: 'Method not allowed' })
  const admin = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  let body
  try { body = JSON.parse(event.body || '{}') } catch { return res(400, { error: 'invalido' }) }

  try {
    // ── pedido de link ──────────────────────────────────────────────────────
    if (body.email && !body.token) {
      const email = String(body.email).trim().toLowerCase()
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res(200, { ok: true })
      const { data: uid } = await admin.rpc('admin_user_id_by_email', { p_email: email })
      if (!uid) return res(200, { ok: true })
      const { data: u } = await admin.auth.admin.getUserById(uid)
      if (!u?.user || (u.user.banned_until && new Date(u.user.banned_until) > new Date())) return res(200, { ok: true })
      const { data: ult } = await admin.from('password_reset_tokens').select('created_at')
        .eq('user_id', uid).order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (ult && Date.now() - new Date(ult.created_at).getTime() < INTERVALO_S * 1000) return res(200, { ok: true })
      const link = await pr.criarLink(admin, uid, 'esqueci')
      await pr.enviarEmail(u.user.email, link)
      await admin.from('audit_log').insert({ user_id: uid, action: 'SENHA_LINK_ENVIADO', entity_type: 'user', entity_id: uid, metadata: { origem: 'esqueci' } })
      return res(200, { ok: true })
    }

    // ── conferir / gravar ───────────────────────────────────────────────────
    const t = await pr.validar(admin, body.token)
    if (!t) return res(410, { error: 'expirado' })
    const { data: u } = await admin.auth.admin.getUserById(t.user_id)
    if (!u?.user) return res(410, { error: 'expirado' })
    if (body.password === undefined) return res(200, { ok: true, email: u.user.email })

    if (typeof body.password !== 'string' || body.password.length < 8) return res(400, { error: 'A senha precisa ter pelo menos 8 caracteres.' })
    const { error } = await admin.auth.admin.updateUserById(t.user_id, { password: body.password })
    if (error) return res(400, { error: error.message })
    await admin.from('password_reset_tokens').update({ used_at: new Date().toISOString() }).eq('id', t.id)
    await admin.from('audit_log').insert({ user_id: t.user_id, action: 'SENHA_REDEFINIDA', entity_type: 'user', entity_id: t.user_id, metadata: {} })
    return res(200, { ok: true, email: u.user.email })
  } catch (e) {
    console.error('password-reset:', e)
    return res(500, { error: 'Não foi possível concluir agora. Tente de novo em instantes.' })
  }
}
