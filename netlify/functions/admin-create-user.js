// netlify/functions/admin-create-user.js
// Backoffice cria logins para compradores ou fornecedores
// Requer SUPABASE_SERVICE_ROLE_KEY nas env vars do Netlify

const { createClient } = require('@supabase/supabase-js')

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' }
  if (event.httpMethod !== 'POST')   return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }

  // Só admins podem chamar esta função (verifica o token do usuário)
  const authHeader = event.headers.authorization || event.headers.Authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Não autorizado' }) }
  }

  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  // Verifica se o solicitante é admin
  const token = authHeader.slice(7)
  const { data: { user: caller } } = await supabaseAdmin.auth.getUser(token)
  if (!caller) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Token inválido' }) }

  const { data: callerProfile } = await supabaseAdmin
    .from('profiles').select('role').eq('id', caller.id).single()
  if (callerProfile?.role !== 'ADMIN') {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Acesso negado — somente admins' }) }
  }

  try {
    const { email, role, name, password } = JSON.parse(event.body)

    if (!email || !role || !name) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'email, role e name são obrigatórios' }) }
    }

    // Cria o usuário via admin API (não envia email de confirmação)
    const tempPassword = password || Math.random().toString(36).slice(-10) + 'A1!'

    const { data: newUser, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { role, name },
    })

    if (error) throw new Error(error.message)

    // Se for BUYER, cria o registro na tabela buyers
    if (role === 'BUYER') {
      await supabaseAdmin.from('buyers').insert({
        user_id:     newUser.user.id,
        razao_social: name,
      })
      await supabaseAdmin.from('profiles').update({ buyer_id: newUser.user.id }).eq('id', newUser.user.id)
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        userId: newUser.user.id,
        email,
        tempPassword: password ? null : tempPassword, // Retorna apenas se foi gerada automaticamente
        message: `Usuário ${role} criado com sucesso`,
      }),
    }
  } catch (err) {
    console.error('admin-create-user error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) }
  }
}
