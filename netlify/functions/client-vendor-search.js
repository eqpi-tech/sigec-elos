// netlify/functions/client-vendor-search.js
// Busca fornecedores para o perfil Cliente usando service_role (bypassa RLS).
// O cliente vê toda a base — não apenas os vinculados a ele.
// GET ?search=texto&state=SP

const { createClient } = require('@supabase/supabase-js')

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' }

  const token = (event.headers.authorization || '').replace('Bearer ', '')
  if (!token) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Token ausente' }) }

  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  // Valida JWT e extrai user
  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token)
  if (authErr || !user) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Token inválido' }) }

  // Confirma que é CLIENT e obtém client_id
  const { data: roleRow } = await supabaseAdmin
    .from('user_roles')
    .select('client_id, role')
    .eq('user_id', user.id)
    .eq('role', 'CLIENT')
    .maybeSingle()
  if (!roleRow) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Sem permissão' }) }

  const clientId    = roleRow.client_id
  const { search = '', state = '' } = event.queryStringParameters || {}
  const cleanSearch = (search || '').trim()
  const hasSearch   = cleanSearch.length >= 2
  const hasState    = !!state

  if (!hasSearch && !hasState) return { statusCode: 200, headers, body: JSON.stringify([]) }

  try {
    let query = supabaseAdmin
      .from('suppliers')
      .select('id, razao_social, cnpj, city, state, status')
      .order('razao_social')
      .range(0, 149)

    if (hasSearch) {
      const digits = cleanSearch.replace(/\D/g, '')
      if (digits.length >= 8) {
        query = query.ilike('cnpj', `%${digits}%`)
      } else {
        query = query.ilike('razao_social', `%${cleanSearch}%`)
      }
    }
    if (hasState) query = query.eq('state', state)

    const { data: suppliers, error: supErr } = await query
    if (supErr) throw new Error(supErr.message)
    if (!suppliers?.length) return { statusCode: 200, headers, body: JSON.stringify([]) }

    const supplierIds = suppliers.map(s => s.id)

    // Selos em lotes de 150 para não estourar URL do PostgREST
    let sealsRaw = []
    for (let i = 0; i < supplierIds.length; i += 150) {
      const { data: batch } = await supabaseAdmin
        .from('seals')
        .select('supplier_id, status, level, seal_name, client_id')
        .in('supplier_id', supplierIds.slice(i, i + 150))
      if (batch) sealsRaw = sealsRaw.concat(batch)
    }

    const mySealMap  = {}
    const bestSealMap = {}
    for (const s of sealsRaw) {
      if (s.client_id === clientId) mySealMap[s.supplier_id] = s
      if (!bestSealMap[s.supplier_id] || s.status === 'ACTIVE') bestSealMap[s.supplier_id] = s
    }

    const result = suppliers.map(s => ({
      ...s,
      seal:         bestSealMap[s.id] || null,
      mySeal:       mySealMap[s.id]   || null,
      isMySupplier: !!mySealMap[s.id],
    }))

    return { statusCode: 200, headers, body: JSON.stringify(result) }
  } catch (err) {
    console.error('[client-vendor-search]', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) }
  }
}
