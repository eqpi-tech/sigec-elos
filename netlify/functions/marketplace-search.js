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

  const empty = () => ({ statusCode: 200, headers, body: JSON.stringify({ data: [], total: 0 }) })

  try {
    const body = JSON.parse(event.body || '{}')
    const {
      q = '', cnae = '', city = '', states = [], categoryIds = [],
      sizes = [], certs = [], sealType, capitalMin, capitalMax,
      simples, clientSealMin = 0,
    } = body

    const wantsSealFilter = clientSealMin > 0 || (sealType && sealType !== 'Todos')

    // ── Passo 1: filtrar por categoria ─────────────────────────────────
    // RPC expande p/ as categorias equivalentes DE CLIENTE (match por nome):
    // 99,9% dos vínculos migrados do HOC apontam p/ cópias por cliente —
    // o .in() direto na árvore global achava só 4 fornecedores (patch_060)
    let allowedSupplierIds = null
    if (categoryIds.length > 0) {
      const { data: rpcRows, error: rpcErr } = await supabase
        .rpc('marketplace_category_suppliers', { cat_ids: categoryIds.map(Number) })
      if (rpcErr) {
        console.error('[marketplace-search] rpc categorias:', rpcErr.message)
        // fallback: comportamento antigo (só árvore global)
        const { data: catRows } = await supabase
          .from('supplier_categories').select('supplier_id').in('category_id', categoryIds)
        allowedSupplierIds = [...new Set((catRows || []).map(r => r.supplier_id))]
      } else {
        allowedSupplierIds = [...new Set((rpcRows || []).map(r => r.supplier_id))]
      }
      if (allowedSupplierIds.length === 0) return empty()
    }

    // ── Passo 1.5: funil por selos ─────────────────────────────────────
    // Pós-migração há 55k+ fornecedores; amostrar 200 ANTES de olhar selos
    // zera qualquer busca por selo/cliente. Quando o filtro pede selos,
    // partimos DA TABELA DE SELOS: só fornecedores que atendem entram na
    // query principal. Selos de cliente contam como "homologado".
    if (wantsSealFilter) {
      const agg = {}
      let off = 0
      while (true) {
        const { data: batch } = await supabase
          .from('seals')
          .select('supplier_id, seal_type, client_id')
          .eq('status', 'ACTIVE')
          .range(off, off + 999)
        if (!batch?.length) break
        for (const sl of batch) {
          const a = agg[sl.supplier_id] || (agg[sl.supplier_id] = { clientCount: 0, types: new Set() })
          if (sl.client_id) {
            a.clientCount++
            a.types.add(sl.seal_type || 'homologado')  // selo de cliente = homologação
          } else if (sl.seal_type) {
            a.types.add(sl.seal_type)
          }
        }
        if (batch.length < 1000) break
        off += 1000
      }

      let preIds = Object.entries(agg)
        .filter(([, a]) => a.clientCount >= clientSealMin)
        .filter(([, a]) => !sealType || sealType === 'Todos' || a.types.has(sealType))
        .map(([id]) => id)

      if (allowedSupplierIds) {
        const set = new Set(allowedSupplierIds)
        preIds = preIds.filter(id => set.has(id))
      }
      if (!preIds.length) return empty()
      allowedSupplierIds = preIds
    }

    // ── Passo 2: query principal (service_role, sem RLS) ───────────────
    const applyFilters = (query) => {
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
      return query
    }

    const SELECT = 'id, razao_social, cnpj, cnae_main, state, city, services, certifications, employee_range, capital_social, simples_nacional, latitude, longitude, status'
    const MAX_POOL = 600  // pool de candidatos antes dos filtros JS

    let suppliers = []
    if (allowedSupplierIds) {
      // IN em lotes de 150 (URL segura) até encher o pool
      for (let i = 0; i < allowedSupplierIds.length && suppliers.length < MAX_POOL; i += 150) {
        const { data: batch, error } = await applyFilters(
          supabase.from('suppliers')
            .select(SELECT)
            .in('status', ['ACTIVE', 'PENDING'])
            .in('id', allowedSupplierIds.slice(i, i + 150))
        )
        if (error) throw new Error(error.message)
        if (batch) suppliers = suppliers.concat(batch)
      }
    } else {
      const { data, error } = await applyFilters(
        supabase.from('suppliers')
          .select(SELECT)
          .in('status', ['ACTIVE', 'PENDING'])
          .limit(200)
      )
      if (error) throw new Error(error.message)
      suppliers = data || []
    }
    if (!suppliers.length) return empty()

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
      if (!filtered.length) return empty()
    }

    // ── Passo 4: selos do conjunto final ───────────────────────────────
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

    // Agregação: melhor selo ELOS, contagem e melhor score de selos de cliente
    const sealAgg = {}
    sealsRaw.forEach(sl => {
      const a = sealAgg[sl.supplier_id] || (sealAgg[sl.supplier_id] = { elos: null, clientCount: 0, clientBest: 0, types: new Set() })
      if (sl.client_id) {
        a.clientCount++
        a.clientBest = Math.max(a.clientBest, sl.score || 0)
        a.types.add(sl.seal_type || 'homologado')
      } else {
        a.types.add(sl.seal_type || null)
        if (!a.elos || (sl.score || 0) > (a.elos.score || 0)) a.elos = sl
      }
    })

    // ── Passo 5: montar resultados ──────────────────────────────────────
    let results = filtered.map(s => {
      const agg = sealAgg[s.id] || { elos: null, clientCount: 0, clientBest: 0, types: new Set() }
      // Tipo exibido: selo ELOS próprio; senão, selo de cliente = homologado
      const displayType = agg.elos?.seal_type || (agg.clientCount > 0 ? 'homologado' : null)
      return {
        ...s,
        sealType:        displayType,
        sealStatus:      (agg.elos || agg.clientCount > 0) ? 'ACTIVE' : null,
        score:           agg.elos?.score || agg.clientBest || 0,
        clientSealCount: agg.clientCount,
        _types:          [...agg.types].filter(Boolean),
      }
    })

    // Filtro de tipo de selo — considera QUALQUER selo ativo (ELOS ou cliente)
    if (sealType && sealType !== 'Todos') {
      results = results.filter(s => s._types.includes(sealType))
    }
    if (certs.length > 0) {
      results = results.filter(s => certs.every(c => (s.certifications || []).includes(c)))
    }
    if (clientSealMin > 0) {
      results = results.filter(s => s.clientSealCount >= clientSealMin)
    }
    results.forEach(s => delete s._types)

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
