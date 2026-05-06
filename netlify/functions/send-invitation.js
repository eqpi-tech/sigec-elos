// send-invitation.js
// Dois modos de operação:
//   MODO A (BUYER → supplier existente): { supplierId, supplierRazaoSocial, supplierCnpj, buyerName, buyerEmail, buyerId }
//   MODO B (CLIENT → empresa nova):      { razao_social, cnpj?, email, telefone?, contato?, tipo_fornecedor?,
//                                           subsidiado?, escopo?, client_id, invited_by_role:'CLIENT' }

const { createClient } = require('@supabase/supabase-js')

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// ── MODO A: Buyer convida supplier já cadastrado ────────────────────────────
async function handleBuyerInvitation(body, h) {
  const { supplierId, supplierRazaoSocial, supplierCnpj, buyerName, buyerEmail, buyerId } = body
  if (!supplierId) return { statusCode:400, headers:h, body: JSON.stringify({ error:'supplierId obrigatório no modo BUYER' }) }

  // Busca todos os user_ids vinculados ao supplier
  const { data: userRoles, error: rolesErr } = await supabaseAdmin
    .from('user_roles').select('user_id').eq('supplier_id', supplierId).eq('role', 'SUPPLIER')
  if (rolesErr) return { statusCode:500, headers:h, body: JSON.stringify({ error: rolesErr.message }) }

  let userIds = (userRoles||[]).map(r => r.user_id).filter(Boolean)
  if (!userIds.length) {
    const { data: profiles } = await supabaseAdmin.from('profiles').select('id').eq('supplier_id', supplierId)
    userIds = (profiles||[]).map(p => p.id).filter(Boolean)
  }

  const emails = []
  for (const uid of userIds) {
    try {
      const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(uid)
      if (user?.email) emails.push(user.email)
    } catch (e) { console.warn('[send-invitation] getUserById failed for', uid, e.message) }
  }

  const { data: invite, error: invErr } = await supabaseAdmin.from('invitations').insert({
    buyer_id:              buyerId             || null,
    supplier_id:           supplierId,
    buyer_name:            buyerName           || '',
    buyer_email:           buyerEmail          || '',
    supplier_razao_social: supplierRazaoSocial || '',
    supplier_cnpj:         supplierCnpj        || '',
    supplier_email:        emails.join(', '),
    status:                'SENT',
    invited_by_role:       'BUYER',
  }).select('id, token').single()
  if (invErr) return { statusCode:500, headers:h, body: JSON.stringify({ error: invErr.message }) }

  if (emails.length > 0 && process.env.RESEND_API_KEY) {
    const HOC_LINK = process.env.FRONTEND_URL || 'https://sigec-elos.netlify.app'
    const cadastroLink = `${HOC_LINK}/cadastro?token=${invite.token}`
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto">
        <div style="background:#2E3192;padding:32px;border-radius:12px 12px 0 0;text-align:center">
          <h1 style="color:#fff;margin:0 0 4px;font-size:24px">SIGEC-ELOS</h1>
          <p style="color:#C7D2FE;margin:0;font-size:13px">Plataforma de Homologação de Fornecedores</p>
        </div>
        <div style="background:#fff;padding:32px;border:1px solid #e2e8f0;border-top:none">
          <h2 style="color:#1a1c5e;margin:0 0 16px">Você recebeu um convite!</h2>
          <p>A empresa <strong>${buyerName}</strong> quer iniciar uma homologação com <strong>${supplierRazaoSocial}</strong>.</p>
          <a href="${cadastroLink}" style="display:inline-block;background:#F47E2F;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold">
            Acessar Plataforma →
          </a>
        </div>
        <div style="background:#f8fafc;padding:16px;border-radius:0 0 12px 12px;text-align:center;font-size:12px;color:#9B9B9B">
          EQPI Tech · SIGEC-ELOS · elos.eqpitech.com.br
        </div>
      </div>`

    await Promise.allSettled(emails.map(to =>
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${process.env.RESEND_API_KEY}` },
        body: JSON.stringify({ from: process.env.EMAIL_FROM || 'noreply@eqpitech.com.br', to:[to], reply_to: buyerEmail||undefined, subject:`Convite de ${buyerName} — SIGEC-ELOS`, html })
      }).catch(e => ({ error: e.message }))
    ))
  }

  return { statusCode:200, headers:h, body: JSON.stringify({ ok:true, invitation: invite, emailsSent: emails.length }) }
}

// ── MODO B: Client/Admin convida empresa ainda não cadastrada ──────────────
async function handleClientInvitation(body, callerUser, h) {
  const { razao_social, cnpj, email, telefone, contato, tipo_fornecedor, subsidiado, escopo, client_id, buyer_id, invited_by_role = 'CLIENT' } = body
  if (!razao_social || !email) return { statusCode:400, headers:h, body: JSON.stringify({ error:'razao_social e email são obrigatórios' }) }

  // Busca nome do convidante
  let senderName = callerUser.email
  if (client_id) {
    const { data: client } = await supabaseAdmin.from('clients').select('razao_social').eq('id', client_id).maybeSingle()
    if (client) senderName = client.razao_social
  } else if (buyer_id) {
    const { data: buyer } = await supabaseAdmin.from('buyers').select('razao_social').eq('id', buyer_id).maybeSingle()
    if (buyer) senderName = buyer.razao_social
  }

  // Evita convite duplicado (mesmo client + mesmo email)
  if (client_id) {
    const { data: existing } = await supabaseAdmin.from('invitations').select('id').eq('client_id', client_id).eq('supplier_email', email).maybeSingle()
    if (existing) return { statusCode:409, headers:h, body: JSON.stringify({ error:'Já existe um convite enviado para este e-mail.' }) }
  }

  const invitePayload = {
    buyer_name:            senderName,
    buyer_email:           callerUser.email,
    supplier_razao_social: razao_social,
    supplier_cnpj:         cnpj || '',
    supplier_email:        email,
    status:                'SENT',
    invited_by_role,
  }
  if (client_id)        invitePayload.client_id       = client_id
  if (buyer_id)         invitePayload.buyer_id         = buyer_id
  if (tipo_fornecedor)  invitePayload.tipo_fornecedor  = tipo_fornecedor
  if (subsidiado != null) invitePayload.subsidiado     = subsidiado
  if (telefone)         invitePayload.telefone         = telefone
  if (contato)          invitePayload.contato          = contato
  if (escopo)           invitePayload.escopo           = escopo

  const { data: invite, error: insertErr } = await supabaseAdmin.from('invitations').insert(invitePayload).select('id, token').single()
  if (insertErr) return { statusCode:500, headers:h, body: JSON.stringify({ error: insertErr.message }) }

  await sendClientEmail({ invite, email, senderName, razao_social, tipo_fornecedor, subsidiado, escopo, contato, h })

  return { statusCode:201, headers:h, body: JSON.stringify({ success:true, inviteId: invite.id, message:`Convite enviado para ${email}` }) }
}

async function sendClientEmail({ invite, email, senderName, razao_social, tipo_fornecedor, subsidiado, escopo, contato }) {
  if (!process.env.RESEND_API_KEY) return
  const frontendUrl = process.env.FRONTEND_URL || 'https://sigec-elos.netlify.app'
  const cadastroLink = `${frontendUrl}/cadastro?token=${invite.token}`
  const tipoLabel = tipo_fornecedor === 'produto' ? 'Produto' : tipo_fornecedor === 'ambos' ? 'Produto & Serviço' : 'Serviço'
  const emailHtml = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
      <div style="background:#2E3192;padding:32px;border-radius:12px 12px 0 0;text-align:center">
        <h1 style="color:#fff;margin:0;font-size:24px">SIGEC-ELOS</h1>
        <p style="color:#C7D2FE;margin:8px 0 0">Convite de Homologação</p>
      </div>
      <div style="background:#fff;padding:32px;border:1px solid #e2e8f0;border-top:none">
        <p>Olá, <strong>${razao_social}</strong>!</p>
        <p>A empresa <strong>${senderName}</strong> convidou você para participar do processo de homologação de fornecedores através do <strong>SIGEC-ELOS</strong> da EQPI Tech.</p>
        ${escopo ? `<div style="background:#f8fafc;border-left:4px solid #2E3192;padding:12px 16px;margin:16px 0;border-radius:0 8px 8px 0"><strong>Escopo:</strong> ${escopo}</div>` : ''}
        <table style="width:100%;border-collapse:collapse;margin:20px 0">
          ${tipo_fornecedor ? `<tr><td style="padding:8px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:bold;width:40%">Tipo</td><td style="padding:8px;border:1px solid #e2e8f0">${tipoLabel}</td></tr>` : ''}
          ${subsidiado ? `<tr><td style="padding:8px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:bold">Custeio</td><td style="padding:8px;border:1px solid #e2e8f0">🟢 Subsidiado por ${senderName}</td></tr>` : ''}
          ${contato ? `<tr><td style="padding:8px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:bold">Contato</td><td style="padding:8px;border:1px solid #e2e8f0">${contato}</td></tr>` : ''}
        </table>
        <a href="${cadastroLink}" style="display:inline-block;background:#F47E2F;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px">
          Iniciar Cadastro →
        </a>
        <p style="color:#9B9B9B;font-size:12px;margin-top:24px">Em caso de dúvidas: <a href="mailto:comercial@eqpitech.com.br" style="color:#2E3192">comercial@eqpitech.com.br</a></p>
      </div>
      <div style="background:#f8fafc;padding:16px;border-radius:0 0 12px 12px;text-align:center;font-size:12px;color:#9B9B9B">
        EQPI Tech · SIGEC-ELOS · elos.eqpitech.com.br
      </div>
    </div>`

  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${process.env.RESEND_API_KEY}` },
      body: JSON.stringify({ from: process.env.EMAIL_FROM || 'noreply@eqpitech.com.br', to:[email], subject:`${senderName} convidou você para homologação no SIGEC-ELOS`, html: emailHtml })
    })
  } catch (e) { console.warn('[send-invitation] e-mail falhou (convite salvo):', e.message) }
}

// ── Handler principal ──────────────────────────────────────────────────────
exports.handler = async (event) => {
  const h = { 'Content-Type':'application/json', 'Access-Control-Allow-Origin':'*' }
  if (event.httpMethod === 'OPTIONS') return { statusCode:200, headers:h, body:'' }

  const token = (event.headers.authorization||'').replace('Bearer ','')
  if (!token) return { statusCode:401, headers:h, body: JSON.stringify({ error:'Não autorizado' }) }

  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token)
  if (authErr || !user) return { statusCode:401, headers:h, body: JSON.stringify({ error:'Token inválido' }) }

  let body
  try { body = JSON.parse(event.body) } catch {
    return { statusCode:400, headers:h, body: JSON.stringify({ error:'JSON inválido' }) }
  }

  // MODO RESEND: reenvia e-mail do convite existente sem criar novo
  if (body.resendId) {
    // Primeiro fetch com campos básicos (sempre existem)
    const { data: inv, error: invErr } = await supabaseAdmin
      .from('invitations')
      .select('id, supplier_razao_social, supplier_email, supplier_cnpj, buyer_name, status')
      .eq('id', body.resendId)
      .maybeSingle()
    if (invErr || !inv) return { statusCode:404, headers:h, body: JSON.stringify({ error:'Convite não encontrado' }) }

    // Fetch dos campos opcionais (adicionados pelos patches — podem não existir ainda)
    let token = null, senderName = inv.buyer_name || user.email
    let tipo_fornecedor = null, subsidiado = false, escopo = null, contato = null
    try {
      const { data: extra } = await supabaseAdmin
        .from('invitations')
        .select('token, subsidiado, tipo_fornecedor, escopo, contato, clients(razao_social), buyers(razao_social)')
        .eq('id', body.resendId)
        .maybeSingle()
      if (extra) {
        token           = extra.token           ?? null
        tipo_fornecedor = extra.tipo_fornecedor  ?? null
        subsidiado      = extra.subsidiado       ?? false
        escopo          = extra.escopo           ?? null
        contato         = extra.contato          ?? null
        senderName      = extra.clients?.razao_social || extra.buyers?.razao_social || senderName
      }
    } catch (_) { /* campos ainda não existem no schema — ignora */ }

    await sendClientEmail({
      invite:         { ...inv, token },
      email:          inv.supplier_email,
      senderName,
      razao_social:   inv.supplier_razao_social,
      tipo_fornecedor,
      subsidiado,
      escopo,
      contato,
    })

    // Reseta status para SENT se ainda não se cadastrou
    // viewed_at pode não existir ainda (patch_006) — ignora erro silenciosamente
    try {
      await supabaseAdmin.from('invitations')
        .update({ status: 'SENT', viewed_at: null })
        .eq('id', inv.id).neq('status', 'REGISTERED')
    } catch (_) {
      await supabaseAdmin.from('invitations')
        .update({ status: 'SENT' })
        .eq('id', inv.id).neq('status', 'REGISTERED')
    }

    return { statusCode:200, headers:h, body: JSON.stringify({ success:true, message:'Convite reenviado' }) }
  }

  // Roteamento: se tem supplierId → MODO A (buyer→supplier existente), senão → MODO B (client→empresa nova)
  if (body.supplierId) return handleBuyerInvitation(body, h)
  return handleClientInvitation(body, user, h)
}
