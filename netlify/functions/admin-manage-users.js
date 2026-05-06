// netlify/functions/admin-manage-users.js
// Gestão de usuários (list, block, unblock, reset-password, update-name)
// POST body: { action, ...params }
//   action='list'           → retorna lista de usuários
//   action='block'          → { userId } bloqueia acesso
//   action='unblock'        → { userId } desbloqueia acesso
//   action='reset-password' → { userId } envia e-mail de redefinição de senha
//   action='update'         → { userId, name } atualiza nome

const { createClient } = require('@supabase/supabase-js')

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

exports.handler = async (event) => {
  const headers = { 'Content-Type':'application/json', 'Access-Control-Allow-Origin':'*' }
  if (event.httpMethod === 'OPTIONS') return { statusCode:200, headers, body:'' }

  // Verifica caller é ADMIN
  const token = (event.headers.authorization || '').replace('Bearer ', '')
  if (!token) return { statusCode:401, headers, body: JSON.stringify({ error:'Token ausente' }) }

  const { data: { user: caller }, error: authErr } = await supabaseAdmin.auth.getUser(token)
  if (authErr || !caller) return { statusCode:401, headers, body: JSON.stringify({ error:'Token inválido' }) }

  const { data: callerRole } = await supabaseAdmin
    .from('user_roles').select('role').eq('user_id', caller.id).eq('role', 'ADMIN').maybeSingle()
  if (!callerRole) return { statusCode:403, headers, body: JSON.stringify({ error:'Sem permissão' }) }

  let body
  try { body = JSON.parse(event.body || '{}') } catch { return { statusCode:400, headers, body: JSON.stringify({ error:'JSON inválido' }) } }

  const { action, userId, name } = body

  try {
    // ── LIST ──────────────────────────────────────────────────────────────────
    if (action === 'list') {
      const [{ data: authUsers }, rolesRes, profilesRes] = await Promise.all([
        supabaseAdmin.auth.admin.listUsers({ perPage: 1000 }),
        supabaseAdmin.from('user_roles').select('user_id, role, is_primary'),
        supabaseAdmin.from('profiles').select('id, name'),
      ])

      const roleMap    = {}
      const primaryMap = {}
      ;(rolesRes.data || []).forEach(r => {
        if (!roleMap[r.user_id]) roleMap[r.user_id] = []
        roleMap[r.user_id].push(r.role)
        if (r.is_primary) primaryMap[r.user_id] = r.role
      })

      const nameMap = {}
      ;(profilesRes.data || []).forEach(p => { nameMap[p.id] = p.name })

      const users = (authUsers?.users || []).map(u => ({
        id:         u.id,
        email:      u.email,
        name:       nameMap[u.id] || u.user_metadata?.name || '—',
        roles:      roleMap[u.id]    || [],
        primaryRole:primaryMap[u.id] || (roleMap[u.id]?.[0]) || 'SUPPLIER',
        banned:     u.banned_until ? new Date(u.banned_until) > new Date() : false,
        bannedUntil:u.banned_until || null,
        createdAt:  u.created_at,
        lastSignIn: u.last_sign_in_at || null,
      }))

      return { statusCode:200, headers, body: JSON.stringify({ users }) }
    }

    // ── BLOCK ─────────────────────────────────────────────────────────────────
    if (action === 'block') {
      if (!userId) return { statusCode:400, headers, body: JSON.stringify({ error:'userId obrigatório' }) }
      // ban por 100 anos = bloqueio permanente até ser desfeito
      const bannedUntil = new Date()
      bannedUntil.setFullYear(bannedUntil.getFullYear() + 100)
      const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        ban_duration: '876000h'  // ~100 anos
      })
      if (error) throw new Error(error.message)
      return { statusCode:200, headers, body: JSON.stringify({ success:true }) }
    }

    // ── UNBLOCK ───────────────────────────────────────────────────────────────
    if (action === 'unblock') {
      if (!userId) return { statusCode:400, headers, body: JSON.stringify({ error:'userId obrigatório' }) }
      const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        ban_duration: 'none'
      })
      if (error) throw new Error(error.message)
      return { statusCode:200, headers, body: JSON.stringify({ success:true }) }
    }

    // ── RESET PASSWORD ────────────────────────────────────────────────────────
    if (action === 'reset-password') {
      if (!userId) return { statusCode:400, headers, body: JSON.stringify({ error:'userId obrigatório' }) }

      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId)
      if (!authUser?.user?.email) return { statusCode:404, headers, body: JSON.stringify({ error:'Usuário não encontrado' }) }

      const frontendUrl = process.env.FRONTEND_URL || 'https://elos.eqpitech.com.br'

      // Gera link de reset de senha (válido por 24h)
      const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
        type:  'recovery',
        email: authUser.user.email,
        options: { redirectTo: `${frontendUrl}/redefinir-senha` }
      })
      if (linkErr) throw new Error(linkErr.message)

      const resetLink = linkData?.properties?.action_link || linkData?.action_link

      if (process.env.RESEND_API_KEY && resetLink) {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${process.env.RESEND_API_KEY}` },
          body: JSON.stringify({
            from: process.env.EMAIL_FROM || 'noreply@eqpitech.com.br',
            to:   [authUser.user.email],
            subject: 'SIGEC-ELOS — Redefinição de senha',
            html: `
              <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto">
                <div style="background:#2E3192;padding:32px;border-radius:12px 12px 0 0;text-align:center">
                  <h1 style="color:#fff;margin:0;font-size:24px">SIGEC-ELOS</h1>
                </div>
                <div style="background:#fff;padding:32px;border:1px solid #e2e8f0;border-top:none">
                  <p>Olá!</p>
                  <p>O administrador da plataforma solicitou a redefinição da sua senha.</p>
                  <p>Clique no link abaixo para definir uma nova senha. O link expira em 24 horas.</p>
                  <div style="text-align:center;margin:24px 0">
                    <a href="${resetLink}" style="display:inline-block;background:#F47E2F;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold">
                      Redefinir minha senha →
                    </a>
                  </div>
                  <p style="font-size:12px;color:#9B9B9B">Se você não solicitou esta redefinição, ignore este e-mail.</p>
                </div>
                <div style="background:#f8fafc;padding:16px;border-radius:0 0 12px 12px;text-align:center;font-size:12px;color:#9B9B9B">
                  EQPI Tech · SIGEC-ELOS · elos.eqpitech.com.br
                </div>
              </div>
            `,
          })
        })
      }

      return { statusCode:200, headers, body: JSON.stringify({ success:true, resetLink }) }
    }

    // ── UPDATE NAME ───────────────────────────────────────────────────────────
    if (action === 'update') {
      if (!userId || !name) return { statusCode:400, headers, body: JSON.stringify({ error:'userId e name obrigatórios' }) }

      await Promise.all([
        supabaseAdmin.auth.admin.updateUserById(userId, { user_metadata: { name } }),
        supabaseAdmin.from('profiles').update({ name }).eq('id', userId),
      ])

      return { statusCode:200, headers, body: JSON.stringify({ success:true }) }
    }

    return { statusCode:400, headers, body: JSON.stringify({ error:'action inválida' }) }

  } catch(err) {
    console.error('[admin-manage-users]', err)
    return { statusCode:500, headers, body: JSON.stringify({ error: err.message }) }
  }
}
