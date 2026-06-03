// netlify/functions/invite-supplier-user.js
// POST { email, name, supplierId } — convida um usuário adicional para uma conta de fornecedor
// Validações: domínio corporativo, limite de 4 usuários, email único

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

// Domínios pessoais bloqueados
const BLOCKED_DOMAINS = [
  'gmail.com','googlemail.com','hotmail.com','hotmail.com.br','outlook.com','outlook.com.br',
  'yahoo.com','yahoo.com.br','icloud.com','me.com','mac.com','live.com','live.com.br',
  'msn.com','bol.com.br','uol.com.br','terra.com.br','ig.com.br','globo.com',
  'protonmail.com','proton.me','tutanota.com','yandex.com','aol.com',
]

function isPersonalEmail(email) {
  const domain = (email || '').split('@')[1]?.toLowerCase()
  return !domain || BLOCKED_DOMAINS.includes(domain)
}

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#$!'
  let pwd = ''
  for (let i = 0; i < 12; i++) pwd += chars[Math.floor(Math.random() * chars.length)]
  return pwd
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: HEADERS, body: '' }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) }

  // Validar sessão do master
  const token = (event.headers.authorization || '').replace('Bearer ', '')
  if (!token) return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: 'Não autorizado' }) }

  const { data: { user: caller }, error: authErr } = await supabaseAdmin.auth.getUser(token)
  if (authErr || !caller) return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: 'Token inválido' }) }

  let body
  try { body = JSON.parse(event.body) } catch { return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Body inválido' }) } }

  const { email, name, supplierId } = body
  if (!email || !name || !supplierId) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'email, name e supplierId são obrigatórios' }) }

  // Verificar que quem chama é SUPPLIER master do mesmo fornecedor
  const { data: callerRole } = await supabaseAdmin
    .from('user_roles')
    .select('supplier_id, is_primary, role')
    .eq('user_id', caller.id)
    .eq('supplier_id', supplierId)
    .eq('role', 'SUPPLIER')
    .maybeSingle()

  if (!callerRole) return { statusCode: 403, headers: HEADERS, body: JSON.stringify({ error: 'Acesso negado — você não é membro deste fornecedor' }) }
  if (!callerRole.is_primary) return { statusCode: 403, headers: HEADERS, body: JSON.stringify({ error: 'Apenas o usuário master pode convidar membros adicionais' }) }

  // Bloquear e-mails pessoais
  if (isPersonalEmail(email)) {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'E-mails de domínios pessoais não são permitidos (gmail, hotmail, etc.). Use um e-mail corporativo.' }) }
  }

  // Verificar limite de 4 usuários ativos
  const { count } = await supabaseAdmin
    .from('user_roles')
    .select('*', { count: 'exact', head: true })
    .eq('supplier_id', supplierId)
    .eq('role', 'SUPPLIER')
    .eq('is_active', true)

  if (count >= 4) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Limite de 4 usuários por fornecedor atingido. Desative um usuário antes de convidar outro.' }) }

  // Verificar se e-mail já existe no sistema
  const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers()
  const existingUser = existingUsers?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase())

  let newUserId
  const tempPassword = generatePassword()

  if (existingUser) {
    // Usuário já existe — vincular ao fornecedor
    newUserId = existingUser.id
    // Verificar se já é membro deste fornecedor
    const { data: alreadyMember } = await supabaseAdmin
      .from('user_roles').select('id').eq('user_id', newUserId).eq('supplier_id', supplierId).maybeSingle()
    if (alreadyMember) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Este e-mail já é membro deste fornecedor.' }) }
  } else {
    // Criar novo usuário
    const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { name },
    })
    if (createErr) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: createErr.message }) }
    newUserId = newUser.user.id
  }

  // Inserir em user_roles como usuário adicional
  const { error: roleErr } = await supabaseAdmin.from('user_roles').insert({
    user_id:     newUserId,
    role:        'SUPPLIER',
    supplier_id: supplierId,
    is_primary:  false,
    is_active:   true,
    invited_by:  caller.id,
  })
  if (roleErr) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: roleErr.message }) }

  // Buscar razão social do fornecedor para o e-mail
  const { data: supplier } = await supabaseAdmin
    .from('suppliers').select('razao_social').eq('id', supplierId).maybeSingle()
  const supplierName = supplier?.razao_social || 'sua empresa'

  // Enviar e-mail com credenciais
  try {
    const baseUrl = process.env.URL || 'https://sigecelos.com.br'
    await fetch(`${baseUrl}/.netlify/functions/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: email,
        subject: `Você foi convidado para acessar o SIGEC-ELOS — ${supplierName}`,
        html: `
          <div style="font-family:sans-serif;max-width:520px;margin:0 auto">
            <h2 style="color:#2E3192">Bem-vindo ao SIGEC-ELOS!</h2>
            <p>Você foi convidado para acessar a conta da empresa <strong>${supplierName}</strong> na plataforma SIGEC-ELOS.</p>
            <div style="background:#f4f5ff;border-radius:10px;padding:16px;margin:20px 0">
              <p style="margin:0 0 8px"><strong>E-mail:</strong> ${email}</p>
              ${!existingUser ? `<p style="margin:0"><strong>Senha temporária:</strong> ${tempPassword}</p>` : ''}
            </div>
            ${!existingUser ? '<p style="color:#666;font-size:13px">Por segurança, altere sua senha após o primeiro acesso.</p>' : ''}
            <a href="${baseUrl}/login" style="display:inline-block;background:#2E3192;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700">
              Acessar a plataforma →
            </a>
          </div>
        `,
      }),
    })
  } catch (e) {
    console.warn('[invite-supplier-user] e-mail não enviado:', e.message)
  }

  return {
    statusCode: 200,
    headers: HEADERS,
    body: JSON.stringify({ success: true, isNewUser: !existingUser }),
  }
}
