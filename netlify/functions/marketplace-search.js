const { createClient } = require('@supabase/supabase-js')

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  try {
    const body = JSON.parse(event.body || '{}')
    const {
      q = '', cnae = '', city = '', states = [], categoryIds = [],
      sizes = [], certs = [], sealType, capitalMin, capitalMax,
      simples, clientSealMin = 0,
    } = body

    // ── Passo 1: filtrar por categoria ─────────────────────────────────
    let allowedSupplierIds = null
    if (categoryIds.length > 0) {
      const { data: catRows } = await supabase
        .from('supplier_categories').select('supplier_id').in('category_id', categoryIds)
      allowedSupplierIds = [...new Set((catRows || []).map(r => r.supplier_id))]
      if (allowedSupplierIds.length === 0) return { statusCode: 200, headers, body: JSON.stringify({ data: [], total: 0 }) }
    }

    // ── Passo 2: query principal (service_role, sem RLS) ───────────────
    let query = supabase
      .from('suppliers')
      .select('id, razao_social, cnpj, cnae_main, state, city, services, certifications, employee_range, capital_social, simples_nacional, latitude, longitude, status')
      .in('status', ['ACTIVE', 'PENDING'])
      .limit(200)

    if (allowedSupplierIds) query = query.in('id', allowedSupplierIds)
    if (states.length > 0)  query = query.in('state', states)
    if (city)               query = query.ilike('city', `%${city}%`)
    if (cnae)               query = query.ilike('cnae_main', `%${cnae}%`)
    if (simples === true)   query = query.eq('simples_nacional', true)
    if (simples === false)  query = query.eq('simples_nacional', false)
    if (capitalMin != null) query = query.gte('capital_social', capitalMin)
    if (capitalMax != null) query = query.lte('capital_social', capitalMax)
    if (q) {
      const qNums = q.replace(/\D/g, '')
      if (qNums.length >= 8) query = query.ilike('cnpj', `%${qNums}%`)
      else                   query = query.ilike('razao_social', `%${q}%`)
    }

    const { data: suppliers, error } = await query
    if (error) throw new Error(error.message)
    if (!suppliers?.length) return { statusCode: 200, headers, body: JSON.stringify({ data: [], total: 0 }) }

    // ── Passo 3: filtro de porte em JS ─────────────────────────────────
    let filtered = suppliers
    if (sizes.length > 0) {
      filtered = suppliers.filter(s => {
        const er = (s.employee_range || '').toUpperCase()
        return sizes.some(sz => {
          if (sz === 'MEI')    return er.includes('MEI')
          if (sz === 'ME')     return er.includes('MICRO EMPRESA') || er === 'ME'
          if (sz === 'EPP')    return er.includes('PEQUENO PORTE') || er === 'EPP'
          if (sz === 'Médio')  return er.includes('DEMAIS') || er.includes('MEDIO')
          if (sz === 'Grande') return er.includes('GRANDE')
          return false
        })
      })
      if (!filtered.length) return { statusCode: 200, headers, body: JSON.stringify({ data: [], total: 0 }) }
    }

    // ── Passo 4: selos (ELOS own + client homologations) ───────────────
    const supplierIds = filtered.map(s => s.id)
    let sealsRaw = []
    for (let i = 0; i < supplierIds.length; i += 150) {
      const { data: batch } = await supabase
        .from('seals')
        .select('supplier_id, level, seal_type, status, score, client_id')
        .in('supplier_id', supplierIds.slice(i, i + 150))
        .eq('status', 'ACTIVE')
      if (batch) sealsRaw = sealsRaw.concat(batch)
    }

    // Melhor selo ELOS por supplier + contagem de selos de clientes
    const sealAgg = {}
    sealsRaw.forEach(sl => {
      if (!sealAgg[sl.supplier_id]) sealAgg[sl.supplier_id] = { elos: null, clientCount: 0 }
      if (sl.client_id) {
        sealAgg[sl.supplier_id].clientCount++
      } else {
        const cur = sealAgg[sl.supplier_id].elos
        if (!cur || (sl.score || 0) > (cur.score || 0)) sealAgg[sl.supplier_id].elos = sl
      }
    })

    // ── Passo 5: montar resultados ──────────────────────────────────────
    let results = filtered.map(s => {
      const agg = sealAgg[s.id] || { elos: null, clientCount: 0 }
      return {
        ...s,
        sealType:        agg.elos?.seal_type || null,
        sealStatus:      agg.elos ? 'ACTIVE' : null,
        score:           agg.elos?.score || 0,
        clientSealCount: agg.clientCount,
      }
    })

    // Filtro de tipo de selo (só quando explicitamente selecionado)
    if (sealType && sealType !== 'Todos') {
      results = results.filter(s => s.sealType === sealType)
    }
    if (certs.length > 0) {
      results = results.filter(s => certs.every(c => (s.certifications || []).includes(c)))
    }
    if (clientSealMin > 0) {
      results = results.filter(s => s.clientSealCount >= clientSealMin)
    }

    // Prioriza ACTIVE, depois por score
    results.sort((a, b) => {
      const statusOrder = v => v === 'ACTIVE' ? 0 : 1
      const sd = statusOrder(a.status) - statusOrder(b.status)
      if (sd !== 0) return sd
      return (b.score || 0) - (a.score || 0)
    })

    const sliced = results.slice(0, 50)
    return { statusCode: 200, headers, body: JSON.stringify({ data: sliced, total: results.length }) }

  } catch (err) {
    console.error('marketplace-search error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) }
  }
}
