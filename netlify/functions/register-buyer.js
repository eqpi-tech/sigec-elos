// register-buyer.js — auto-cadastro de compradores
// Não requer auth (é o fluxo de onboarding público)
const { createClient } = require('@supabase/supabase-js')

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
}

function generatePassword(len = 12) {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$'
  let p = ''
  for (let i = 0; i < len; i++) p += chars[Math.floor(Math.random() * chars.length)]
  return p
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' }
  if (event.httpMethod !== 'POST')   return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  try {
    const { cnpj, razaoSocial, email, name, phone } = JSON.parse(event.body || '{}')
    if (!cnpj || !email || !name) return { statusCode: 400, headers, body: JSON.stringify({ error: 'cnpj, email e name são obrigatórios' }) }

    const cleanCnpj = cnpj.replace(/\D/g, '')

    // Verifica se e-mail já existe
    const { data: existingUsers } = await supabase.auth.admin.listUsers()
    const emailExists = existingUsers?.users?.some(u => u.email?.toLowerCase() === email.toLowerCase())
    if (emailExists) return { statusCode: 409, headers, body: JSON.stringify({ error: 'Este e-mail já está cadastrado. Faça login ou recupere sua senha.' }) }

    // Verifica se CNPJ já existe como comprador
    const { data: existingBuyer } = await supabase
      .from('buyers').select('id').eq('cnpj', cleanCnpj).maybeSingle()
    if (existingBuyer) return { statusCode: 409, headers, body: JSON.stringify({ error: 'Este CNPJ já está cadastrado como comprador.' }) }

    const password = generatePassword()

    // Cria usuário no Auth
    const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
      email, password,
      email_confirm: true,
      user_metadata: { name, role: 'BUYER' },
    })
    if (createErr) throw new Error(createErr.message)

    const userId = newUser.user.id

    // Cria perfil
    await supabase.from('profiles').upsert({ id: userId, role: 'BUYER', name }, { onConflict: 'id' })

    // Cria registro buyer
    const { data: buyer, error: buyerErr } = await supabase.from('buyers').insert({
      user_id: userId,
      razao_social: razaoSocial || name,
      cnpj: cleanCnpj,
      phone: phone || null,
    }).select('id').single()
    if (buyerErr) throw new Error(buyerErr.message)

    // Cria user_role
    await supabase.from('user_roles').insert({
      user_id: userId, role: 'BUYER', is_primary: true,
      buyer_id: buyer.id, buyer_plan: 'free',
    })

    // Envia e-mail com credenciais
    if (process.env.RESEND_API_KEY) {
      const frontendUrl = process.env.FRONTEND_URL || 'https://elos.eqpitech.com.br'
      const html = `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
          <div style="background:#2E3192;padding:28px;border-radius:12px 12px 0 0;text-align:center">
            <h1 style="color:#fff;margin:0;font-size:22px">SIGEC-ELOS</h1>
            <p style="color:#C7D2FE;margin:6px 0 0;font-size:13px">Marketplace de Fornecedores Homologados</p>
          </div>
          <div style="background:#fff;padding:28px;border:1px solid #e2e8f0;border-top:none">
            <p>Olá, <strong>${name}</strong>!</p>
            <p>Sua conta de <strong>Comprador</strong> foi criada com sucesso no SIGEC-ELOS. Use as credenciais abaixo para acessar a plataforma:</p>
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:16px 0">
              <p style="margin:0 0 8px"><strong>E-mail:</strong> ${email}</p>
              <p style="margin:0"><strong>Senha provisória:</strong> <code style="background:#eef2ff;padding:2px 8px;border-radius:4px;font-size:14px">${password}</code></p>
            </div>
            <p style="color:#9B9B9B;font-size:13px">Recomendamos que você altere sua senha após o primeiro acesso.</p>
            <a href="${frontendUrl}/login" style="display:inline-block;background:#F47E2F;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;margin-top:8px">
              Acessar o Marketplace →
            </a>
            <p style="color:#9B9B9B;font-size:12px;margin-top:24px">Dúvidas? <a href="mailto:comercial@eqpitech.com.br" style="color:#2E3192">comercial@eqpitech.com.br</a></p>
          </div>
          <div style="background:#f8fafc;padding:14px;border-radius:0 0 12px 12px;text-align:center;font-size:12px;color:#9B9B9B">
            EQPI Tech · SIGEC-ELOS · elos.eqpitech.com.br
          </div>
        </div>`

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM || 'noreply@eqpitech.com.br',
          to: [email],
          subject: 'Bem-vindo ao SIGEC-ELOS — suas credenciais de acesso',
          html,
        }),
      }).catch(e => console.warn('Email falhou:', e.message))
    }

    return { statusCode: 201, headers, body: JSON.stringify({ success: true, message: 'Conta criada! Verifique seu e-mail com as credenciais de acesso.' }) }

  } catch (err) {
    console.error('register-buyer error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) }
  }
}
