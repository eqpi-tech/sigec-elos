// send-invitation.js
// Registra convite + envia email para TODOS os usuários vinculados ao supplier
// via user_roles → auth.users (email real de login, não cnpjData.email)

const { createClient } = require('@supabase/supabase-js')

const HOC_LINK = 'https://www.sistemas-equipo.com.br/hoc-portal-fornecedor/pages/login.jsf'

exports.handler = async (event) => {
  const h = { 'Content-Type':'application/json', 'Access-Control-Allow-Origin':'*' }
  if (event.httpMethod === 'OPTIONS') return { statusCode:200, headers:h, body:'' }

  const token = (event.headers.authorization||'').replace('Bearer ','')
  if (!token) return { statusCode:401, headers:h, body: JSON.stringify({ error:'Não autorizado' }) }

  let body
  try { body = JSON.parse(event.body) } catch {
    return { statusCode:400, headers:h, body: JSON.stringify({ error:'JSON inválido' }) }
  }

  const { supplierId, supplierRazaoSocial, supplierCnpj, buyerName, buyerEmail, buyerId } = body
  if (!supplierId) return { statusCode:400, headers:h, body: JSON.stringify({ error:'supplierId obrigatório' }) }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  // 1. Busca todos os user_ids vinculados ao supplier (pode ter mais de um)
  const { data: userRoles, error: rolesErr } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('supplier_id', supplierId)
    .eq('role', 'SUPPLIER')

  if (rolesErr) {
    console.error('[send-invitation] user_roles error:', rolesErr.message)
    return { statusCode:500, headers:h, body: JSON.stringify({ error: rolesErr.message }) }
  }

  // Fallback: se user_roles vazio, tenta via profiles
  let userIds = (userRoles||[]).map(r => r.user_id).filter(Boolean)
  if (!userIds.length) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id')
      .eq('supplier_id', supplierId)
    userIds = (profiles||[]).map(p => p.id).filter(Boolean)
  }

  // 2. Busca o email de cada user_id via auth.admin
  const emails = []
  for (const uid of userIds) {
    try {
      const { data: { user } } = await supabase.auth.admin.getUserById(uid)
      if (user?.email) emails.push(user.email)
    } catch (e) {
      console.warn('[send-invitation] getUserById failed for', uid, e.message)
    }
  }

  console.log('[send-invitation] supplier:', supplierId, '| users:', userIds.length, '| emails:', emails)

  // 3. Registra o convite no banco (1 registro por supplier, independente de quantos emails)
  const { data: invite, error: invErr } = await supabase
    .from('invitations')
    .insert({
      buyer_id:              buyerId             || null,
      supplier_id:           supplierId,
      buyer_name:            buyerName           || '',
      buyer_email:           buyerEmail          || '',
      supplier_razao_social: supplierRazaoSocial || '',
      supplier_cnpj:         supplierCnpj        || '',
      supplier_email:        emails.join(', '),   // armazena todos os emails
      status:                'SENT',
    })
    .select()
    .single()

  if (invErr) {
    console.error('[send-invitation] insert error:', invErr.message)
    return { statusCode:500, headers:h, body: JSON.stringify({ error: invErr.message }) }
  }

  // 4. Envia email para cada endereço encontrado
  if (emails.length > 0 && process.env.RESEND_API_KEY) {
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto">
        <div style="background:#2E3192;padding:32px;border-radius:12px 12px 0 0;text-align:center">
          <h1 style="color:#fff;margin:0 0 4px;font-size:24px">SIGEC-ELOS</h1>
          <p style="color:#C7D2FE;margin:0;font-size:13px">Plataforma de Homologação de Fornecedores · EQPI Tech</p>
        </div>
        <div style="background:#fff;padding:32px;border:1px solid #e2e8f0;border-top:none">
          <div style="text-align:center;margin-bottom:24px">
            <div style="font-size:48px">🤝</div>
            <h2 style="color:#1a1c5e;margin:8px 0 4px;font-size:20px">Você recebeu um convite!</h2>
            <p style="color:#9B9B9B;margin:0;font-size:13px">Uma empresa compradora deseja te cadastrar como fornecedor</p>
          </div>
          <p style="color:#374151;margin:0 0 16px">Olá, <strong>${supplierRazaoSocial}</strong>!</p>
          <p style="color:#374151;margin:0 0 20px">
            A empresa <strong>${buyerName}</strong> identificou sua empresa na plataforma SIGEC-ELOS
            e gostaria de iniciar o processo de homologação formal no sistema <strong>HOC (Portal do Fornecedor)</strong>.
          </p>
          <table style="width:100%;border-collapse:collapse;margin:0 0 24px">
            <tr>
              <td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:bold;width:40%;font-size:13px">Empresa Compradora</td>
              <td style="padding:10px;border:1px solid #e2e8f0;font-size:13px">${buyerName}</td>
            </tr>
            <tr>
              <td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:bold;font-size:13px">Seu CNPJ</td>
              <td style="padding:10px;border:1px solid #e2e8f0;font-size:13px;font-family:monospace">${supplierCnpj}</td>
            </tr>
          </table>
          <div style="background:#f0f2ff;border:1px solid #c7d2fe;border-radius:8px;padding:16px;margin-bottom:24px">
            <p style="margin:0 0 8px;font-size:13px;color:#1a1c5e;font-weight:bold">📋 Próximos passos:</p>
            <ol style="margin:0;padding-left:20px;font-size:13px;color:#374151;line-height:1.8">
              <li>Acesse o Portal HOC do Fornecedor pelo botão abaixo</li>
              <li>Faça o pré-cadastro com seus dados empresariais</li>
              <li>Aguarde o contato da equipe de suprimentos de <strong>${buyerName}</strong></li>
            </ol>
          </div>
          <div style="text-align:center">
            <a href="${HOC_LINK}"
              style="display:inline-block;background:#F47E2F;color:#fff;padding:16px 36px;border-radius:10px;text-decoration:none;font-weight:bold;font-size:15px;letter-spacing:.3px">
              Acessar Portal HOC →
            </a>
          </div>
          <p style="margin:24px 0 0;font-size:12px;color:#9B9B9B;text-align:center">
            Em caso de dúvidas: <a href="mailto:comercial@eqpitech.com.br" style="color:#2E3192">comercial@eqpitech.com.br</a>
          </p>
        </div>
        <div style="background:#f8fafc;padding:16px;border-radius:0 0 12px 12px;text-align:center;font-size:12px;color:#9B9B9B">
          EQPI Tech · SIGEC-ELOS · elos.eqpitech.com.br
        </div>
      </div>`

    // Envia para todos os emails do supplier
    const emailPromises = emails.map(to =>
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${process.env.RESEND_API_KEY}` },
        body: JSON.stringify({
          from:     process.env.EMAIL_FROM || 'noreply@eqpitech.com.br',
          to:       [to],
          reply_to: buyerEmail || undefined,
          subject:  `🤝 Convite de ${buyerName} — Acesse o Portal HOC`,
          html,
        })
      }).then(r => r.json()).catch(e => ({ error: e.message }))
    )

    const results = await Promise.allSettled(emailPromises)
    results.forEach((r,i) => console.log('[send-invitation] email to', emails[i], ':', r.status, r.value?.id||r.value?.error))
  } else if (emails.length === 0) {
    console.warn('[send-invitation] Nenhum email encontrado para supplier:', supplierId)
  }

  return {
    statusCode: 200,
    headers: h,
    body: JSON.stringify({
      ok: true,
      invitation: invite,
      emailsSent: emails.length,
      emails,       // retorna para debug — remover em produção se desejado
    })
  }
}
