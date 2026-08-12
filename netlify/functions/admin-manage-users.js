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
    .from('user_roles').select('role, access_profile').eq('user_id', caller.id).eq('role', 'ADMIN').maybeSingle()
  if (!callerRole) return { statusCode:403, headers, body: JSON.stringify({ error:'Sem permissão' }) }
  // Perfil analyst não gerencia usuários (patch_030)
  if (callerRole.access_profile === 'analyst')
    return { statusCode:403, headers, body: JSON.stringify({ error:'Seu perfil de acesso não permite gerenciar usuários' }) }

  let body
  try { body = JSON.parse(event.body || '{}') } catch { return { statusCode:400, headers, body: JSON.stringify({ error:'JSON inválido' }) } }

  const { action, userId, name, profile } = body

  try {
    // ── LIST ──────────────────────────────────────────────────────────────────
    if (action === 'list') {
      const [{ data: authUsers }, rolesRes, profilesRes, suppliersRes, clientsRes, buyersRes] = await Promise.all([
        supabaseAdmin.auth.admin.listUsers({ perPage: 1000 }),
        supabaseAdmin.from('user_roles').select('user_id, role, is_primary, client_id, supplier_id, buyer_id, access_profile'),
        supabaseAdmin.from('profiles').select('id, name'),
        supabaseAdmin.from('suppliers').select('id, cnpj, razao_social'),
        supabaseAdmin.from('clients').select('id, cnpj, razao_social'),
        supabaseAdmin.from('buyers').select('id, cnpj, razao_social'),
      ])

      const roleMap     = {}
      const primaryMap  = {}
      const clientIdMap = {}
      const supplierMap = {}  // userId → supplier_id
      const buyerIdMap  = {}
      const profileMap  = {}  // userId → access_profile mais restritivo entre os papéis
      ;(rolesRes.data || []).forEach(r => {
        if (!roleMap[r.user_id]) roleMap[r.user_id] = []
        roleMap[r.user_id].push(r.role)
        if (r.is_primary) primaryMap[r.user_id] = r.role
        if (r.role === 'CLIENT' && r.client_id) clientIdMap[r.user_id] = r.client_id
        if (r.role === 'SUPPLIER' && r.supplier_id) supplierMap[r.user_id] = r.supplier_id
        if (r.role === 'BUYER' && r.buyer_id) buyerIdMap[r.user_id] = r.buyer_id
        if (r.access_profile && r.access_profile !== 'full') profileMap[r.user_id] = r.access_profile
      })

      const nameMap     = {}
      ;(profilesRes.data || []).forEach(p => { nameMap[p.id] = p.name })

      const entityMap = {}  // 'supplier:<id>' | 'client:<id>' | 'buyer:<id>' → { cnpj, razao }
      ;(suppliersRes.data || []).forEach(s => { entityMap[`supplier:${s.id}`] = { cnpj: s.cnpj, razao: s.razao_social } })
      ;(clientsRes.data   || []).forEach(c => { entityMap[`client:${c.id}`]   = { cnpj: c.cnpj, razao: c.razao_social } })
      ;(buyersRes.data    || []).forEach(b => { entityMap[`buyer:${b.id}`]    = { cnpj: b.cnpj, razao: b.razao_social } })

      const users = (authUsers?.users || []).map(u => {
        const suppId   = supplierMap[u.id]
        const clientId = clientIdMap[u.id]
        const buyerId  = buyerIdMap[u.id]
        const supplier = suppId   ? entityMap[`supplier:${suppId}`] : null
        const client   = clientId ? entityMap[`client:${clientId}`] : null
        const buyer    = buyerId  ? entityMap[`buyer:${buyerId}`]   : null
        // Todas as organizações (CNPJ + razão) vinculadas ao usuário, em qualquer papel
        const orgs = [
          supplier && { role: 'SUPPLIER', cnpj: supplier.cnpj || '', razao: supplier.razao || '' },
          client   && { role: 'CLIENT',   cnpj: client.cnpj   || '', razao: client.razao   || '' },
          buyer    && { role: 'BUYER',    cnpj: buyer.cnpj    || '', razao: buyer.razao    || '' },
        ].filter(Boolean)
        return {
          id:             u.id,
          email:          u.email,
          name:           nameMap[u.id] || u.user_metadata?.name || '—',
          roles:          roleMap[u.id]    || [],
          primaryRole:    primaryMap[u.id] || (roleMap[u.id]?.[0]) || 'SUPPLIER',
          clientId:       clientId || null,
          supplierId:     suppId || null,
          buyerId:        buyerId || null,
          supplierCnpj:   supplier?.cnpj  || '',
          supplierRazao:  supplier?.razao || '',
          orgs,
          accessProfile:  profileMap[u.id] || 'full',
          banned:         u.banned_until ? new Date(u.banned_until) > new Date() : false,
          bannedUntil:    u.banned_until || null,
          createdAt:      u.created_at,
          lastSignIn:     u.last_sign_in_at || null,
        }
      })

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

    // ── SET ACCESS PROFILE ────────────────────────────────────────────────────
    if (action === 'set-profile') {
      if (!userId || !profile) return { statusCode:400, headers, body: JSON.stringify({ error:'userId e profile obrigatórios' }) }
      if (!['full','analyst','readonly'].includes(profile))
        return { statusCode:400, headers, body: JSON.stringify({ error:'profile inválido' }) }
      if (userId === caller.id && profile !== 'full')
        return { statusCode:400, headers, body: JSON.stringify({ error:'Você não pode restringir o próprio perfil de acesso' }) }

      // analyst só se aplica a ADMIN; readonly só a CLIENT — atualiza o papel compatível
      const targetRole = profile === 'analyst' ? 'ADMIN' : profile === 'readonly' ? 'CLIENT' : null
      let q = supabaseAdmin.from('user_roles').update({ access_profile: profile }).eq('user_id', userId)
      if (targetRole) q = q.eq('role', targetRole)
      const { error, count } = await q.select('id', { count: 'exact' })
      if (error) throw new Error(error.message)
      if (targetRole && count === 0)
        return { statusCode:400, headers, body: JSON.stringify({ error:`Perfil "${profile}" só se aplica a usuários ${targetRole}` }) }

      return { statusCode:200, headers, body: JSON.stringify({ success:true }) }
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
