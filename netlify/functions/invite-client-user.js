// netlify/functions/invite-client-user.js
// POST { email, name, accessProfileId? } — convida usuário adicional para a
// conta de um CLIENTE. Sem limite de usuários (diferente do fornecedor).
// O caller precisa ser usuário CLIENT ativo; o novo usuário entra vinculado
// ao mesmo client_id, com o perfil de módulos escolhido (default: Acesso Total).

const { createClient } = require('@supabase/supabase-js')

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const BLOCKED_DOMAINS = [
  'gmail.com','googlemail.com','hotmail.com','hotmail.com.br','outlook.com','outlook.com.br',
  'yahoo.com','yahoo.com.br','icloud.com','me.com','mac.com','live.com','live.com.br',
  'msn.com','bol.com.br','uol.com.br','terra.com.br','ig.com.br','globo.com',
  'protonmail.com','proton.me','tutanota.com','yandex.com','aol.com',
]
const isPersonalEmail = (email) => {
  const domain = (email || '').split('@')[1]?.toLowerCase()
  return !domain || BLOCKED_DOMAINS.includes(domain)
}
const generatePassword = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#$!'
  let pwd = ''
  for (let i = 0; i < 12; i++) pwd += chars[Math.floor(Math.random() * chars.length)]
  return pwd
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: HEADERS, body: '' }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) }

  const token = (event.headers.authorization || '').replace('Bearer ', '')
  if (!token) return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: 'Não autorizado' }) }

  const { data: { user: caller }, error: authErr } = await supabaseAdmin.auth.getUser(token)
  if (authErr || !caller) return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: 'Token inválido' }) }

  let body
  try { body = JSON.parse(event.body) } catch { return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Body inválido' }) } }
  const { email, name, accessProfileId } = body
  if (!email || !name) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'email e name são obrigatórios' }) }
  if (isPersonalEmail(email))
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Use um e-mail corporativo (domínios pessoais não são permitidos).' }) }

  // Caller precisa ser CLIENT ativo — vincula o novo usuário ao mesmo cliente
  const { data: callerRole } = await supabaseAdmin
    .from('user_roles')
    .select('client_id, is_active, access_profile')
    .eq('user_id', caller.id).eq('role', 'CLIENT').maybeSingle()
  if (!callerRole?.client_id || callerRole.is_active === false)
    return { statusCode: 403, headers: HEADERS, body: JSON.stringify({ error: 'Acesso restrito a usuários do cliente' }) }
  if (callerRole.access_profile === 'readonly')
    return { statusCode: 403, headers: HEADERS, body: JSON.stringify({ error: 'Seu perfil de acesso é somente leitura' }) }
  const clientId = callerRole.client_id

  try {
    // Perfil de módulos: informado ou "Acesso Total" de CLIENT
    let profileId = accessProfileId || null
    if (profileId) {
      const { data: ap } = await supabaseAdmin.from('access_profiles')
        .select('id').eq('id', profileId).eq('role_type', 'CLIENT').maybeSingle()
      if (!ap) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Perfil de acesso inválido para usuários de cliente' }) }
    } else {
      const { data: total } = await supabaseAdmin.from('access_profiles')
        .select('id').eq('role_type', 'CLIENT').eq('is_system', true).maybeSingle()
      profileId = total?.id || null
    }

    // Usuário já existe no Auth?
    let newUserId = null
    let tempPassword = null
    const { data: list } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })
    const existing = (list?.users || []).find(u => u.email?.toLowerCase() === email.toLowerCase())

    if (existing) {
      newUserId = existing.id
      const { data: dupRole } = await supabaseAdmin
        .from('user_roles').select('id').eq('user_id', newUserId).eq('role', 'CLIENT').maybeSingle()
      if (dupRole) return { statusCode: 409, headers: HEADERS, body: JSON.stringify({ error: 'Este e-mail já é usuário de um cliente.' }) }
    } else {
      tempPassword = generatePassword()
      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email, password: tempPassword, email_confirm: true,
        user_metadata: { name, role: 'CLIENT' },
      })
      if (createErr) throw new Error(createErr.message)
      newUserId = created.user.id
      await supabaseAdmin.from('profiles').upsert({ id: newUserId, name, role: 'CLIENT' }, { onConflict: 'id' })
    }

    const { error: roleErr } = await supabaseAdmin.from('user_roles').insert({
      user_id: newUserId,
      role: 'CLIENT',
      client_id: clientId,
      is_primary: false,
      invited_by: caller.id,
      is_active: true,
      access_profile_id: profileId,
    })
    if (roleErr) throw new Error(roleErr.message)

    // E-mail com credenciais
    const { data: clientRow } = await supabaseAdmin.from('clients').select('razao_social').eq('id', clientId).maybeSingle()
    const clientName = clientRow?.razao_social || 'sua empresa'
    if (process.env.RESEND_API_KEY) {
      const frontendUrl = process.env.FRONTEND_URL || 'https://elos.eqpitech.com.br'
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.RESEND_API_KEY}` },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM || 'noreply@eqpitech.com.br',
          to: [email],
          subject: `Acesso à plataforma SIGEC-ELOS — ${clientName}`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto">
              <div style="background:#2E3192;padding:32px;border-radius:12px 12px 0 0;text-align:center">
                <h1 style="color:#fff;margin:0;font-size:24px">SIGEC-ELOS</h1>
              </div>
              <div style="background:#fff;padding:32px;border:1px solid #e2e8f0;border-top:none">
                <p>Olá, <strong>${name}</strong>!</p>
                <p>Você foi convidado para acessar a plataforma SIGEC-ELOS como usuário de <strong>${clientName}</strong>.</p>
                ${tempPassword ? `
                <table style="width:100%;border-collapse:collapse;margin:20px 0">
                  <tr><td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:bold;width:35%">Login</td><td style="padding:10px;border:1px solid #e2e8f0;font-family:monospace">${email}</td></tr>
                  <tr><td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:bold">Senha inicial</td><td style="padding:10px;border:1px solid #e2e8f0;font-family:monospace">${tempPassword}</td></tr>
                </table>
                <p style="font-size:13px;color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 14px">⚠ Altere sua senha no primeiro acesso.</p>
                ` : `<p>Use sua senha atual da plataforma para entrar — sua conta agora também acessa ${clientName}.</p>`}
                <div style="text-align:center;margin-top:20px">
                  <a href="${frontendUrl}/login" style="display:inline-block;background:#F47E2F;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold">Acessar a Plataforma →</a>
                </div>
              </div>
              <div style="background:#f8fafc;padding:16px;border-radius:0 0 12px 12px;text-align:center;font-size:12px;color:#9B9B9B">EQPI Tech · SIGEC-ELOS</div>
            </div>`,
        }),
      }).catch(e => console.warn('[invite-client-user] email:', e.message))
    }

    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ success: true }) }
  } catch (err) {
    console.error('[invite-client-user]', err)
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) }
  }
}
