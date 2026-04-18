// netlify/functions/admin-create-user.js
// Cria usuário (ADMIN ou BUYER) com geração de senha e envio de e-mail com credenciais
// POST body: { name, email, role, organization? }

const { createClient } = require('@supabase/supabase-js')

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#$!'
  let pwd = ''
  for (let i = 0; i < 12; i++) pwd += chars[Math.floor(Math.random() * chars.length)]
  return pwd
}

exports.handler = async (event) => {
  const headers = { 'Content-Type':'application/json','Access-Control-Allow-Origin':'*' }
  if (event.httpMethod === 'OPTIONS') return { statusCode:200, headers, body:'' }

  // Verifica que o chamador é ADMIN
  const token = (event.headers.authorization||'').replace('Bearer ','')
  if (!token) return { statusCode:401, headers, body: JSON.stringify({ error:'Token ausente' }) }
  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token)
  if (authErr || !user) return { statusCode:401, headers, body: JSON.stringify({ error:'Token inválido' }) }

  const { data: callerRole } = await supabaseAdmin
    .from('user_roles').select('role').eq('user_id', user.id).eq('role','ADMIN').maybeSingle()
  if (!callerRole) return { statusCode:403, headers, body: JSON.stringify({ error:'Sem permissão' }) }

  let body
  try { body = JSON.parse(event.body) } catch { return { statusCode:400, headers, body: JSON.stringify({ error:'JSON inválido' }) } }

  const { name, email, role, organization } = body
  if (!name || !email || !role) return { statusCode:400, headers, body: JSON.stringify({ error:'name, email e role são obrigatórios' }) }
  if (!['ADMIN','BUYER'].includes(role)) return { statusCode:400, headers, body: JSON.stringify({ error:'role deve ser ADMIN ou BUYER' }) }

  const password = generatePassword()

  try {
    // 1. Cria o usuário no Supabase Auth
    const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { name, role }
    })
    if (createErr) throw new Error(createErr.message)

    // 2. Cria/atualiza profile
    await supabaseAdmin.from('profiles').upsert({
      id: newUser.user.id, role, name
    }, { onConflict: 'id' })

    // 3. Insere em user_roles
    await supabaseAdmin.from('user_roles').insert({
      user_id: newUser.user.id, role, is_primary: true
    })

    // 4. Se BUYER, cria registro na tabela buyers
    if (role === 'BUYER') {
      await supabaseAdmin.from('buyers').insert({
        user_id: newUser.user.id,
        razao_social: organization || name,
      })
    }

    // 5. Envia e-mail com credenciais via Resend
    const emailHtml = `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto">
        <div style="background:#2E3192;padding:32px;border-radius:12px 12px 0 0;text-align:center">
          <h1 style="color:#fff;margin:0;font-size:24px">SIGEC-ELOS</h1>
          <p style="color:#C7D2FE;margin:8px 0 0">Sua conta foi criada</p>
        </div>
        <div style="background:#fff;padding:32px;border:1px solid #e2e8f0;border-top:none">
          <p>Olá, <strong>${name}</strong>!</p>
          <p>Uma conta foi criada para você na plataforma <strong>SIGEC-ELOS</strong> da EQPI Tech.</p>
          <table style="width:100%;border-collapse:collapse;margin:24px 0">
            <tr>
              <td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:bold;width:40%">Perfil</td>
              <td style="padding:10px;border:1px solid #e2e8f0">${role === 'ADMIN' ? 'Analista Backoffice' : 'Comprador'}</td>
            </tr>
            <tr>
              <td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:bold">E-mail</td>
              <td style="padding:10px;border:1px solid #e2e8f0">${email}</td>
            </tr>
            <tr>
              <td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:bold">Senha inicial</td>
              <td style="padding:10px;border:1px solid #e2e8f0;font-family:monospace;font-size:16px;color:#2E3192"><strong>${password}</strong></td>
            </tr>
          </table>
          <div style="background:#FFF3E8;border:1px solid #F47E2F;border-radius:8px;padding:16px;margin-bottom:24px">
            <strong>⚠️ Altere sua senha no primeiro acesso.</strong> Esta senha é temporária.
          </div>
          <a href="${process.env.FRONTEND_URL}/login"
             style="display:inline-block;background:#F47E2F;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold">
            Acessar Plataforma →
          </a>
        </div>
        <div style="background:#f8fafc;padding:16px;border-radius:0 0 12px 12px;text-align:center;font-size:12px;color:#9B9B9B">
          EQPI Tech · SIGEC-ELOS · elos.eqpitech.com.br
        </div>
      </div>
    `

    if (process.env.RESEND_API_KEY) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${process.env.RESEND_API_KEY}` },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM || 'noreply@eqpitech.com.br',
          to: [email],
          subject: 'SIGEC-ELOS — Suas credenciais de acesso',
          html: emailHtml,
        })
      })
    }

    return {
      statusCode: 201, headers,
      body: JSON.stringify({
        success: true,
        userId: newUser.user.id,
        password, // retorna para exibir na tela
        message: `Usuário ${role} criado com sucesso. Credenciais enviadas para ${email}.`
      })
    }
  } catch (err) {
    console.error('[admin-create-user]', err)
    return { statusCode:500, headers, body: JSON.stringify({ error: err.message }) }
  }
}
