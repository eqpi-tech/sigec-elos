// netlify/functions/supplier-interest.js
// Convite reverso: fornecedor homologado declara intenção de prestar
// serviços para clientes ELOS.
//
// GET  → { eligible, clients: [...], interests: [...] }
//        clients = todos os clientes ELOS (nome + visual da LP quando houver)
// POST { action:'declare', clientId, message? } → cria/reativa intenção
// POST { action:'withdraw', clientId }          → retira intenção
//
// Elegibilidade: pelo menos 1 selo ACTIVE (homologação HOC migrada ou ELOS).

const { createClient } = require('@supabase/supabase-js')

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: HEADERS, body: '' }

  const token = (event.headers.authorization || '').replace('Bearer ', '')
  if (!token) return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: 'Token ausente' }) }

  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const { data: { user }, error: authErr } = await sb.auth.getUser(token)
  if (authErr || !user) return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: 'Token inválido' }) }

  const { data: roleRow } = await sb
    .from('user_roles').select('supplier_id')
    .eq('user_id', user.id).eq('role', 'SUPPLIER').maybeSingle()
  if (!roleRow?.supplier_id)
    return { statusCode: 403, headers: HEADERS, body: JSON.stringify({ error: 'Acesso restrito a fornecedores' }) }
  const supplierId = roleRow.supplier_id

  // Elegibilidade: algum selo ACTIVE
  const { data: activeSeal } = await sb
    .from('seals').select('id').eq('supplier_id', supplierId).eq('status', 'ACTIVE').limit(1)
  const eligible = !!activeSeal?.length

  try {
    if (event.httpMethod === 'GET') {
      const [{ data: clients }, { data: lps }, { data: interests }] = await Promise.all([
        sb.from('clients').select('id, razao_social, nome_fantasia, sigla').order('razao_social'),
        sb.from('client_landing_pages').select('client_id, slug, logo_url, accent_color, is_active'),
        sb.from('supplier_interests').select('client_id, status, message, created_at').eq('supplier_id', supplierId),
      ])
      const lpByClient = {}
      ;(lps || []).forEach(l => { lpByClient[l.client_id] = l })
      const list = (clients || []).map(c => ({
        id: c.id,
        razao_social: c.razao_social,
        nome_fantasia: c.nome_fantasia,
        logo_url: lpByClient[c.id]?.logo_url || null,
        accent_color: lpByClient[c.id]?.accent_color || null,
        portal_slug: lpByClient[c.id]?.is_active ? lpByClient[c.id].slug : null,
      }))
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ eligible, clients: list, interests: interests || [] }) }
    }

    if (event.httpMethod !== 'POST')
      return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Método não suportado' }) }

    let body
    try { body = JSON.parse(event.body || '{}') } catch {
      return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'JSON inválido' }) }
    }
    const { action, clientId, message } = body
    if (!clientId) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'clientId obrigatório' }) }

    if (action === 'declare') {
      if (!eligible)
        return { statusCode: 403, headers: HEADERS, body: JSON.stringify({ error: 'Disponível apenas para fornecedores com homologação ativa' }) }
      const { error } = await sb.from('supplier_interests').upsert({
        supplier_id: supplierId,
        client_id: clientId,
        message: (message || '').trim() || null,
        status: 'PENDING',           // reativa caso o cliente tenha descartado antes
        created_by: user.id,
      }, { onConflict: 'supplier_id,client_id' })
      if (error) throw new Error(error.message)
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ success: true }) }
    }

    if (action === 'withdraw') {
      const { error } = await sb.from('supplier_interests').delete()
        .eq('supplier_id', supplierId).eq('client_id', clientId)
      if (error) throw new Error(error.message)
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ success: true }) }
    }

    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'action inválida' }) }
  } catch (err) {
    console.error('[supplier-interest]', err)
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) }
  }
}
