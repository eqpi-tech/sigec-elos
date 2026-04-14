// ─── SIGEC-ELOS API Service — Supabase Real ───────────────────────────────
// Contrato idêntico ao mockApi.js anterior.
// Todas as páginas funcionam sem alteração.

import { supabase } from '../lib/supabase.js'
import { calculateScore } from '../lib/score.js'

// ── Helpers ──────────────────────────────────────────────────────────────────
const DOC_LABELS = {
  CNPJ_CARD:'Cartão CNPJ', CND_FEDERAL:'CND Federal', CRF_FGTS:'CRF (FGTS)',
  CNDT:'CNDT Trabalhista', ALVARA:'Alvará de Funcionamento', CONTRACT:'Contrato Social',
  ISO9001:'Certificado ISO 9001', ISO14001:'Certificado ISO 14001',
  ISO45001:'Certificado ISO 45001', BALANCE:'Balanço Patrimonial',
  INSURANCE:'Apólice de Seguro', OTHER:'Documento',
}

// ── CNPJ Lookup (via Netlify Function → BrasilAPI + Portal Transparência) ───
export const cnpjApi = {
  lookup: async (cnpj) => {
    const clean = cnpj.replace(/\D/g, '')
    if (clean.length !== 14) throw new Error('CNPJ deve ter 14 dígitos')

    const res = await fetch(`/.netlify/functions/cnpj-lookup?cnpj=${clean}`)
    if (!res.ok) throw new Error('Erro ao consultar CNPJ')
    return res.json()
  },
}

// ── Auth (usado pelo AuthContext) ────────────────────────────────────────────
export const authApi = {
  signup: async ({ email, password, role, name }) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { role, name } },
    })
    if (error) throw new Error(error.message)
    return data.user
  },

  login: async ({ email, password }) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new Error(error.message)
    return data.user
  },

  logout: async () => supabase.auth.signOut(),

  getSession: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return session
  },
}

// ── Supplier ─────────────────────────────────────────────────────────────────
export const supplierApi = {
  create: async (supplierData) => {
    const { data, error } = await supabase
      .from('suppliers')
      .insert(supplierData)
      .select()
      .single()
    if (error) throw new Error(error.message)

    // Cria perfil de seal pendente
    await supabase.from('seals').insert({ supplier_id: data.id })

    // Vincula supplier_id ao profile do usuário
    await supabase
      .from('profiles')
      .update({ supplier_id: data.id })
      .eq('id', supplierData.user_id)

    return data
  },

  me: async (supplierId) => {
    // Queries separadas para evitar problema de RLS em joins embutidos
    const [supplierRes, sealsRes, plansRes, docsRes] = await Promise.all([
      supabase.from('suppliers').select('*').eq('id', supplierId).single(),
      supabase.from('seals').select('*').eq('supplier_id', supplierId),
      supabase.from('plans').select('*').eq('supplier_id', supplierId),
      supabase.from('documents').select('*').eq('supplier_id', supplierId).order('created_at', { ascending: false }),
    ])

    if (supplierRes.error) throw new Error(supplierRes.error.message)
    const data = supplierRes.data

    const seal = sealsRes.data?.[0]
    const plan = plansRes.data?.[0]

    return {
      ...data,
      seals:      sealsRes.data  || [],
      plans:      plansRes.data  || [],
      documents:  docsRes.data   || [],
      sealLevel:  seal?.level  || 'Simples',
      sealStatus: seal?.status || 'PENDING',
      score:      seal?.score  || 0,
      activePlan: plan?.status === 'ACTIVE' ? plan : null,
    }
  },

  update: async (supplierId, updates) => {
    const { data, error } = await supabase
      .from('suppliers')
      .update(updates)
      .eq('id', supplierId)
      .select()
      .single()
    if (error) throw new Error(error.message)
    return data
  },
}

// ── Documents ────────────────────────────────────────────────────────────────
export const documentApi = {
  list: async (supplierId) => {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('supplier_id', supplierId)
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    return data || []
  },

  upload: async (supplierId, userId, file, docType) => {
    if (!supplierId) throw new Error('supplier_id ausente — recarregue a página e tente novamente.')

    const ext  = file.name.split('.').pop().toLowerCase()
    const path = `${userId}/${docType}_${Date.now()}.${ext}`

    // 1. Upload para Supabase Storage
    const { error: storageError } = await supabase.storage
      .from('documents')
      .upload(path, file, { upsert: true, contentType: file.type })
    if (storageError) throw new Error('Erro no storage: ' + storageError.message)

    // 2. Gera signed URL (1 hora)
    const { data: urlData } = await supabase.storage
      .from('documents')
      .createSignedUrl(path, 3600)

    const payload = {
      supplier_id:  supplierId,
      type:         docType,
      label:        DOC_LABELS[docType] || file.name,
      source:       'MANUAL',
      status:       'PENDING',
      storage_path: path,
      public_url:   urlData?.signedUrl || '',
      metadata:     { originalName: file.name, size: file.size, mime: file.type },
    }

    // 3. INSERT ou UPDATE — evita depender do UPSERT com onConflict
    //    (que requer constraint UNIQUE — garantida pelo patch SQL)
    const { data: existing } = await supabase
      .from('documents')
      .select('id')
      .eq('supplier_id', supplierId)
      .eq('type', docType)
      .maybeSingle()

    let data, error
    if (existing?.id) {
      // Atualiza registro existente
      ;({ data, error } = await supabase
        .from('documents')
        .update(payload)
        .eq('id', existing.id)
        .select()
        .single())
    } else {
      // Insere novo registro
      ;({ data, error } = await supabase
        .from('documents')
        .insert(payload)
        .select()
        .single())
    }

    if (error) throw new Error('Erro ao salvar documento: ' + error.message)
    return data
  },

  getSignedUrl: async (storagePath) => {
    const { data, error } = await supabase.storage
      .from('documents')
      .createSignedUrl(storagePath, 3600)
    if (error) throw new Error(error.message)
    return data.signedUrl
  },

  updateStatus: async (docId, status, note) => {
    const { data: { user } } = await supabase.auth.getUser()

    // Busca o supplier_id antes de atualizar
    const { data: docData } = await supabase
      .from('documents').select('supplier_id').eq('id', docId).single()

    const { error } = await supabase
      .from('documents')
      .update({ status, review_note: note, reviewed_by: user?.id })
      .eq('id', docId)
    if (error) throw new Error(error.message)

    // Recalcula score após mudança de status
    if (docData?.supplier_id) {
      const { data: allDocs } = await supabase
        .from('documents').select('type, status').eq('supplier_id', docData.supplier_id)
      const newScore = calculateScore(allDocs || [])
      await supabase.from('seals')
        .update({ score: newScore })
        .eq('supplier_id', docData.supplier_id)
    }

    return { success: true }
  },
}

// ── Marketplace ───────────────────────────────────────────────────────────────
export const marketplaceApi = {
  search: async ({ level, state, category, q } = {}) => {
    // Query 1: fornecedores ativos
    let query = supabase
      .from('suppliers')
      .select('id, razao_social, cnae_main, state, city, services, certifications, employee_range, revenue_range, status')
      .eq('status', 'ACTIVE')

    if (state && state !== 'Todos') query = query.eq('state', state)
    if (q) query = query.ilike('razao_social', `%${q}%`)

    const { data: suppliers, error } = await query
    if (error) throw new Error(error.message)
    if (!suppliers?.length) return { data: [], total: 0 }

    // Query 2: selos ativos (separado — evita problema de RLS em join embutido)
    const supplierIds = suppliers.map(s => s.id)
    const { data: seals } = await supabase
      .from('seals')
      .select('supplier_id, level, status, score')
      .in('supplier_id', supplierIds)
      .eq('status', 'ACTIVE')

    const sealMap = (seals || []).reduce((acc, sl) => {
      acc[sl.supplier_id] = sl
      return acc
    }, {})

    let results = suppliers
      .map(s => ({
        ...s,
        sealLevel:  sealMap[s.id]?.level  || 'Simples',
        sealStatus: sealMap[s.id]?.status || 'PENDING',
        score:      sealMap[s.id]?.score  || 0,
      }))
      .filter(s => s.sealStatus === 'ACTIVE') // só exibe quem tem selo ativo

    if (level && level !== 'Todos') results = results.filter(s => s.sealLevel === level)

    return { data: results, total: results.length }
  },

  getById: async (id) => {
    const { data, error } = await supabase
      .from('suppliers')
      .select(`*, seals(*), documents(status, label, type, expires_at, source)`)
      .eq('id', id)
      .single()
    if (error) throw new Error(error.message)
    return {
      ...data,
      sealLevel:  data.seals?.[0]?.level  || 'Simples',
      sealStatus: data.seals?.[0]?.status || 'PENDING',
      score:      data.seals?.[0]?.score  || 0,
    }
  },
}

// ── Payments (Stripe via Netlify Function) ───────────────────────────────────
export const paymentsApi = {
  createCheckout: async ({ planType, cnaeCount, supplierId, userEmail, priceYearly }) => {
    const res = await fetch('/.netlify/functions/create-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planType, cnaeCount, supplierId, userEmail, priceYearly }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Erro ao criar sessão de pagamento')
    }
    return res.json() // { url: 'https://checkout.stripe.com/...' }
  },
}

// ── RFQ ──────────────────────────────────────────────────────────────────────
export const rfqApi = {
  send: async ({ supplierIds, category, message, buyerId }) => {
    const rfqs = supplierIds.map(sid => ({
      buyer_id: buyerId, supplier_id: sid, category, message, status: 'SENT',
    }))
    const { data, error } = await supabase.from('rfqs').insert(rfqs).select()
    if (error) throw new Error(error.message)
    return data
  },

  list: async (userId, role) => {
    if (role === 'BUYER') {
      const { data: buyer } = await supabase.from('buyers').select('id').eq('user_id', userId).single()
      if (!buyer) return []
      const { data } = await supabase.from('rfqs').select(`*, suppliers(razao_social)`).eq('buyer_id', buyer.id)
      return data || []
    }
    if (role === 'SUPPLIER') {
      const { data: profile } = await supabase.from('profiles').select('supplier_id').eq('id', userId).single()
      if (!profile?.supplier_id) return []
      const { data } = await supabase.from('rfqs').select(`*, buyers(razao_social)`).eq('supplier_id', profile.supplier_id)
      return data || []
    }
    const { data } = await supabase.from('rfqs').select('*')
    return data || []
  },
}

// ── Admin / Backoffice ────────────────────────────────────────────────────────
export const adminApi = {
  getQueue: async () => {
    // Passo 1: selos PENDING com supplier (FK válida: seals.supplier_id → suppliers.id)
    const { data: sealsData, error: sealsErr } = await supabase
      .from('seals')
      .select('supplier_id, level, status, score, suppliers(id, razao_social, cnpj, city, state, employee_range, created_at)')
      .eq('status', 'PENDING')
    if (sealsErr) throw new Error(sealsErr.message)
    if (!sealsData?.length) return []

    // Passo 2: documentos separado (não existe FK seals→documents, só suppliers→documents)
    const supplierIds = sealsData.map(s => s.supplier_id).filter(Boolean)
    const { data: docsData } = await supabase
      .from('documents')
      .select('supplier_id, type, label, status')
      .in('supplier_id', supplierIds)

    const docsBySupplier = (docsData || []).reduce((acc, d) => {
      acc[d.supplier_id] = acc[d.supplier_id] || []
      acc[d.supplier_id].push(d)
      return acc
    }, {})

    return sealsData.map(s => ({
      id:          s.suppliers?.id,
      razaoSocial: s.suppliers?.razao_social,
      cnpj:        s.suppliers?.cnpj,
      city:        s.suppliers?.city,
      state:       s.suppliers?.state,
      documents:   docsBySupplier[s.supplier_id] || [],
      score:       s.score || 0,
      sealStatus:  s.status,
      riskLevel:   (s.score||0) < 30 ? 'Alto' : (s.score||0) < 60 ? 'Médio' : 'Baixo',
      requestedAt: s.suppliers?.created_at?.slice(0,10) || '—',
    }))
  },

  getSealAnalysis: async (supplierId) => {
    const [supplierRes, sealsRes, docsRes, cnpjRes] = await Promise.all([
      supabase.from('suppliers').select('*').eq('id', supplierId).single(),
      supabase.from('seals').select('*').eq('supplier_id', supplierId),
      supabase.from('documents').select('*').eq('supplier_id', supplierId).order('created_at', { ascending: false }),
      supabase.from('cnpj_consultations').select('*').eq('supplier_id', supplierId).order('consulted_at', { ascending: false }).limit(1),
    ])
    if (supplierRes.error) throw new Error(supplierRes.error.message)
    return {
      ...supplierRes.data,
      seals:           sealsRes.data   || [],
      documents:       docsRes.data    || [],
      cnpj_consultation: cnpjRes.data?.[0] || null,
    }
  },

  approveSeal: async (supplierId, level) => {
    const { error: sealErr } = await supabase
      .from('seals')
      .update({ level, status: 'ACTIVE', issued_at: new Date().toISOString() })
      .eq('supplier_id', supplierId)
    if (sealErr) throw new Error(sealErr.message)

    await supabase.from('suppliers').update({ status: 'ACTIVE' }).eq('id', supplierId)

    // Recalcula score final no momento da aprovação
    const { data: allDocs } = await supabase
      .from('documents').select('type, status').eq('supplier_id', supplierId)
    const finalScore = calculateScore(allDocs || [])
    await supabase.from('seals')
      .update({ score: finalScore, issued_at: new Date().toISOString() })
      .eq('supplier_id', supplierId)

    // Log de auditoria
    await supabase.from('audit_log').insert({
      user_id: (await supabase.auth.getUser()).data.user?.id,
      action: 'SEAL_APPROVED', entity_type: 'supplier', entity_id: supplierId,
      metadata: { level, score: finalScore },
    })
    return { success: true }
  },

  rejectSeal: async (supplierId, reason) => {
    const { error } = await supabase
      .from('seals')
      .update({ status: 'SUSPENDED', suspended_reason: reason })
      .eq('supplier_id', supplierId)
    if (error) throw new Error(error.message)

    await supabase.from('audit_log').insert({
      user_id: (await supabase.auth.getUser()).data.user?.id,
      action: 'SEAL_REJECTED', entity_type: 'supplier', entity_id: supplierId,
      metadata: { reason },
    })
    return { success: true }
  },

  updateDocStatus: async (docId, status, note) => documentApi.updateStatus(docId, status, note),

  getMetrics: async () => {
    // Queries independentes com tratamento de erro individual
    const [suppliersRes, activeSealsRes, pendingSealsRes, planRes] = await Promise.allSettled([
      supabase.from('suppliers').select('*', { count: 'exact', head: true }),
      supabase.from('seals').select('*', { count: 'exact', head: true }).eq('status', 'ACTIVE'),
      supabase.from('seals').select('*', { count: 'exact', head: true }).eq('status', 'PENDING'),
      supabase.from('plans').select('type, price_yearly').eq('status', 'ACTIVE'),
    ])

    const totalSuppliers  = suppliersRes.status === 'fulfilled'  ? (suppliersRes.value.count  || 0) : 0
    const activeSeals     = activeSealsRes.status === 'fulfilled' ? (activeSealsRes.value.count || 0) : 0
    const pendingAnalysis = pendingSealsRes.status === 'fulfilled'? (pendingSealsRes.value.count|| 0) : 0
    const planData        = planRes.status === 'fulfilled' ? (planRes.value.data || []) : []

    const mrrBrl = planData.reduce((acc, p) => acc + (Number(p.price_yearly) / 12), 0)
    const simples = planData.filter(p => p.type === 'Simples')
    const premium = planData.filter(p => p.type === 'Premium')

    return {
      totalSuppliers: totalSuppliers || 0,
      activeSeals:    activeSeals    || 0,
      pendingAnalysis: pendingAnalysis || 0,
      mrrBrl: Math.round(mrrBrl),
      mrrGrowth: 18,
      byPlan: {
        Simples: { count: simples.length, rev: Math.round(simples.reduce((a,p) => a + Number(p.price_yearly)/12, 0)) },
        Premium: { count: premium.length, rev: Math.round(premium.reduce((a,p) => a + Number(p.price_yearly)/12, 0)) },
      },
      newThisMonth: 12,
      churnRate: 2.1,
    }
  },

  createUser: async ({ email, role, name, password }) => {
    const res = await fetch('/.netlify/functions/admin-create-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, role, name, password }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Erro ao criar usuário')
    }
    return res.json()
  },
}

// ── Categorias e Documentos EQPI ─────────────────────────────────────────────
export const categoriesApi = {
  // Busca todas as categorias pai
  getParents: async () => {
    const { data, error } = await supabase
      .from('categories')
      .select('id, name')
      .is('parent_id', null)
      .eq('active', true)
      .order('name')
    if (error) throw new Error(error.message)
    return data || []
  },

  // Busca filhas de uma categoria pai
  getChildren: async (parentId) => {
    const { data, error } = await supabase
      .from('categories')
      .select('id, name, parent_id')
      .eq('parent_id', parentId)
      .eq('active', true)
      .order('name')
    if (error) throw new Error(error.message)
    return data || []
  },

  // Busca todos os nós filhos e netos de um pai (para expandir a árvore)
  getTree: async (parentId) => {
    // Busca nível 2 (filhos diretos)
    const { data: children } = await supabase
      .from('categories')
      .select('id, name, parent_id')
      .eq('parent_id', parentId)
      .eq('active', true)
      .order('name')
    if (!children?.length) return []
    // Busca nível 3 (netos) para cada filho
    const childIds = children.map(c => c.id)
    const { data: grandchildren } = await supabase
      .from('categories')
      .select('id, name, parent_id')
      .in('parent_id', childIds)
      .eq('active', true)
      .order('name')
    return { children: children || [], grandchildren: grandchildren || [] }
  },

  // Calcula documentos exigidos pela união das categorias selecionadas (sem duplicatas)
  getRequiredDocuments: async (categoryIds) => {
    if (!categoryIds?.length) return []
    const { data, error } = await supabase
      .from('category_documents')
      .select('document_id, documents_catalog(id, name, auto_collect)')
      .in('category_id', categoryIds)
    if (error) throw new Error(error.message)
    // Union: deduplica por document_id
    const seen = new Set()
    return (data || [])
      .filter(r => r.documents_catalog)
      .map(r => r.documents_catalog)
      .filter(d => { if (seen.has(d.id)) return false; seen.add(d.id); return true })
      .sort((a, b) => a.id - b.id)
  },

  // Salva categorias do fornecedor
  saveSupplierCategories: async (supplierId, categoryIds) => {
    // Remove as antigas
    await supabase.from('supplier_categories').delete().eq('supplier_id', supplierId)
    if (!categoryIds.length) return []
    const rows = categoryIds.map(cid => ({ supplier_id: supplierId, category_id: cid }))
    const { data, error } = await supabase.from('supplier_categories').insert(rows).select()
    if (error) throw new Error(error.message)
    return data
  },

  // Busca categorias salvas de um fornecedor
  getSupplierCategories: async (supplierId) => {
    const { data, error } = await supabase
      .from('supplier_categories')
      .select('category_id, categories(id, name, parent_id)')
      .eq('supplier_id', supplierId)
    if (error) throw new Error(error.message)
    return (data || []).map(r => r.categories).filter(Boolean)
  },
}
