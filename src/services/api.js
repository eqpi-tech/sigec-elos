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
      const [{ data: allDocs }, { data: catRows }] = await Promise.all([
        supabase.from('documents').select('type, status').eq('supplier_id', docData.supplier_id),
        supabase.from('supplier_categories').select('category_id').eq('supplier_id', docData.supplier_id),
      ])
      // Busca documentos exigidos pelas categorias
      let reqDocs = []
      if (catRows?.length) {
        const catIds = catRows.map(r => r.category_id)
        const { data: catDocRows } = await supabase
          .from('category_documents').select('document_id').in('category_id', catIds)
        const seen = new Set()
        reqDocs = (catDocRows || [])
          .map(r => ({ id: r.document_id }))
          .filter(d => { if (seen.has(d.id)) return false; seen.add(d.id); return true })
      }
      const newScore = calculateScore(allDocs || [], reqDocs)
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
    if (q) {
      // Detecta se é busca por CNPJ (apenas números, 8+ dígitos)
      const qNums = q.replace(/\D/g,'')
      if (qNums.length >= 8) {
        query = query.ilike('cnpj', `%${qNums}%`)
      } else {
        query = query.ilike('razao_social', `%${q}%`)
      }
    }

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
    // Usa Netlify Function com service_role para contornar RLS do buyer
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token || ''
    const res = await fetch(`/.netlify/functions/get-supplier-profile?id=${id}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    if (!res.ok) throw new Error(`Erro ao carregar fornecedor: ${res.status}`)
    return res.json()
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
    const [supplierRes, sealsRes, docsRes, cnpjRes, catRes] = await Promise.allSettled([
      supabase.from('suppliers').select('*').eq('id', supplierId).maybeSingle(),
      supabase.from('seals').select('*').eq('supplier_id', supplierId),
      supabase.from('documents').select('*').eq('supplier_id', supplierId).order('created_at', { ascending: false }),
      supabase.from('cnpj_consultations')
        .select('id, supplier_id, cnpj, cnpj_data, sanctions_data, has_sanctions, consulted_at')
        .eq('supplier_id', supplierId)
        .order('consulted_at', { ascending: false })
        .limit(1),
      // Busca categorias do fornecedor para calcular docs exigidos
      supabase.from('supplier_categories').select('category_id').eq('supplier_id', supplierId),
    ])

    const supplier = supplierRes.status === 'fulfilled' ? supplierRes.value.data : null
    if (!supplier) throw new Error('Fornecedor não encontrado')

    // Guarda o user_id para que a notificação de e-mail seja buscada server-side
    // (auth.admin.getUserById não está disponível no cliente — send-email faz o lookup)
    const supplierEmail = null  // send-email receberá user_id e buscará o e-mail

    const uploadedDocs = docsRes.status === 'fulfilled' ? (docsRes.value.data || []) : []
    const uploadedByType = {}
    uploadedDocs.forEach(d => { uploadedByType[String(d.type)] = d })

    // Constrói lista completa: docs exigidos pelas categorias + docs já enviados
    let fullDocList = [...uploadedDocs]
    if (catRes.status === 'fulfilled' && catRes.value.data?.length) {
      const catIds = catRes.value.data.map(r => r.category_id)
      const { data: catDocRows } = await supabase
        .from('category_documents')
        .select('document_id, documents_catalog(id, name)')
        .in('category_id', catIds)
      if (catDocRows) {
        const seen = new Set(uploadedDocs.map(d => String(d.type)))
        catDocRows.forEach(row => {
          const docId = String(row.document_id)
          if (!seen.has(docId) && row.documents_catalog) {
            seen.add(docId)
            // Documento exigido mas ainda não enviado → aparece como MISSING
            fullDocList.push({
              id:          `req-${docId}`,
              supplier_id: supplierId,
              type:        docId,
              label:       row.documents_catalog.name,
              status:      'MISSING',
              source:      'REQUIRED',
              storage_path: null,
              created_at:  null,
            })
          }
        })
      }
    }

    // Ordena: docs enviados primeiro, depois os faltantes; alfabético dentro de cada grupo
    fullDocList.sort((a, b) => {
      if (a.status === 'MISSING' && b.status !== 'MISSING') return 1
      if (a.status !== 'MISSING' && b.status === 'MISSING') return -1
      return (a.label||'').localeCompare(b.label||'', 'pt-BR')
    })

    return {
      ...supplier,
      email:             supplierEmail,
      seals:             sealsRes.status === 'fulfilled' ? (sealsRes.value.data || []) : [],
      documents:         fullDocList,
      cnpj_consultation: cnpjRes.status  === 'fulfilled' ? (cnpjRes.value.data?.[0] || null) : null,
    }
  },

  approveSeal: async (supplierId, level) => {
    const { error: sealErr } = await supabase
      .from('seals')
      .update({ level, status: 'ACTIVE', issued_at: new Date().toISOString() })
      .eq('supplier_id', supplierId)
    if (sealErr) throw new Error(sealErr.message)

    const { error: suppErr } = await supabase
      .from('suppliers').update({ status: 'ACTIVE' }).eq('id', supplierId)
    if (suppErr) console.warn('supplier status update (RLS?):', suppErr.message)

    // Recalcula score final no momento da aprovação
    const [{ data: allDocs }, { data: catRows }] = await Promise.all([
      supabase.from('documents').select('type, status').eq('supplier_id', supplierId),
      supabase.from('supplier_categories').select('category_id').eq('supplier_id', supplierId),
    ])
    let reqDocs = []
    if (catRows?.length) {
      const catIds = catRows.map(r => r.category_id)
      const { data: catDocRows } = await supabase
        .from('category_documents').select('document_id').in('category_id', catIds)
      const seen = new Set()
      reqDocs = (catDocRows || [])
        .map(r => ({ id: r.document_id }))
        .filter(d => { if (seen.has(d.id)) return false; seen.add(d.id); return true })
    }
    const finalScore = calculateScore(allDocs || [], reqDocs)
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

  revertSeal: async (supplierId, reason) => {
    const { error: sealErr } = await supabase
      .from('seals')
      .update({ status: 'PENDING', issued_at: null })
      .eq('supplier_id', supplierId)
    if (sealErr) throw new Error(sealErr.message)

    const { error: suppErr } = await supabase
      .from('suppliers').update({ status: 'PENDING' }).eq('id', supplierId)
    if (suppErr) console.warn('supplier status revert (RLS?):', suppErr.message)

    await supabase.from('audit_log').insert({
      user_id: (await supabase.auth.getUser()).data.user?.id,
      action: 'SEAL_REVERTED', entity_type: 'supplier', entity_id: supplierId,
      metadata: { reason },
    })
    return { success: true }
  },

  suspendSupplier: async (supplierId, reason) => {
    const { error: sealErr } = await supabase
      .from('seals')
      .update({ status: 'SUSPENDED', suspended_reason: reason })
      .eq('supplier_id', supplierId)
    if (sealErr) throw new Error(sealErr.message)

    const { error: suppErr } = await supabase
      .from('suppliers').update({ status: 'INACTIVE' }).eq('id', supplierId)
    if (suppErr) console.warn('supplier status suspend (RLS?):', suppErr.message)

    await supabase.from('audit_log').insert({
      user_id: (await supabase.auth.getUser()).data.user?.id,
      action: 'SUPPLIER_SUSPENDED', entity_type: 'supplier', entity_id: supplierId,
      metadata: { reason },
    })
    return { success: true }
  },

  reactivateSupplier: async (supplierId) => {
    const { error: sealErr } = await supabase
      .from('seals')
      .update({ status: 'ACTIVE', suspended_reason: null })
      .eq('supplier_id', supplierId)
    if (sealErr) throw new Error(sealErr.message)

    const { error: suppErr } = await supabase
      .from('suppliers').update({ status: 'ACTIVE' }).eq('id', supplierId)
    if (suppErr) console.warn('supplier status reactivate (RLS?):', suppErr.message)

    await supabase.from('audit_log').insert({
      user_id: (await supabase.auth.getUser()).data.user?.id,
      action: 'SUPPLIER_REACTIVATED', entity_type: 'supplier', entity_id: supplierId,
      metadata: {},
    })
    return { success: true }
  },

  updateDocStatus: async (docId, status, note) => documentApi.updateStatus(docId, status, note),

  getDocumentFarol: async () => {
    const { data, error } = await supabase
      .from('documents')
      .select('id, label, expires_at, status, supplier_id, suppliers(razao_social, cnpj)')
      .not('expires_at', 'is', null)
      .order('expires_at', { ascending: true })
    if (error) throw new Error(error.message)

    const docs   = data || []
    const today  = new Date(); today.setHours(0, 0, 0, 0)
    const todayE = new Date(); todayE.setHours(23, 59, 59, 999)

    const vencidos = docs.filter(d => new Date(d.expires_at) < today)
    const hoje     = docs.filter(d => { const dt = new Date(d.expires_at); return dt >= today && dt <= todayE })
    const futuro   = docs.filter(d => new Date(d.expires_at) > todayE)

    return { vencidos, hoje, futuro, all: docs }
  },

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

// ── Cliente (HOC) ─────────────────────────────────────────────────────────────
export const clientApi = {
  // Dashboard KPIs: fornecedores convidados por este cliente
  getDashboard: async (clientId) => {
    const { data: invites, error } = await supabase
      .from('invitations')
      .select('id, supplier_id, status, subsidiado, supplier_razao_social, supplier_cnpj, suppliers(id, razao_social, cnpj, city, state, status)')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)

    const all = invites || []
    const supplierIds = all.map(i => i.supplier_id).filter(Boolean)

    let seals = []
    if (supplierIds.length) {
      const { data: sealsData } = await supabase
        .from('seals')
        .select('supplier_id, level, status, score')
        .in('supplier_id', supplierIds)
      seals = sealsData || []
    }
    const sealMap = seals.reduce((acc, s) => { acc[s.supplier_id] = s; return acc }, {})

    const enriched = all.map(i => ({
      ...i,
      seal: sealMap[i.supplier_id] || null,
    }))

    const homologados = enriched.filter(i => i.seal?.status === 'ACTIVE').length
    // emAnalise: REGISTERED sem seal ACTIVE (fallback seguro se RLS bloquear seals)
    const emAnalise = enriched.filter(i =>
      i.status === 'REGISTERED' && i.seal?.status !== 'ACTIVE'
    ).length

    return {
      invites: enriched,
      total:       all.length,
      registered:  all.filter(i => i.status === 'REGISTERED').length,
      emAnalise,
      homologados,
      subsidiados: all.filter(i => i.subsidiado).length,
    }
  },

  // Lista fornecedores do cliente (via invitations)
  // Processo completo de um fornecedor (leitura — reutiliza lógica do adminApi)
  getSupplierProcess: async (supplierId, clientId) => {
    const [supplierRes, sealsRes, docsRes, cnpjRes, catRes, inviteRes] = await Promise.allSettled([
      supabase.from('suppliers').select('*').eq('id', supplierId).maybeSingle(),
      supabase.from('seals').select('*').eq('supplier_id', supplierId),
      supabase.from('documents').select('*').eq('supplier_id', supplierId).order('created_at', { ascending: false }),
      supabase.from('cnpj_consultations')
        .select('id, supplier_id, cnpj, cnpj_data, sanctions_data, has_sanctions, consulted_at')
        .eq('supplier_id', supplierId).order('consulted_at', { ascending: false }).limit(1),
      supabase.from('supplier_categories').select('category_id').eq('supplier_id', supplierId),
      supabase.from('invitations').select('escopo, tipo_fornecedor, subsidiado, contato, created_at')
        .eq('supplier_id', supplierId).eq('client_id', clientId).maybeSingle(),
    ])

    const supplier = supplierRes.status === 'fulfilled' ? supplierRes.value.data : null
    if (!supplier) throw new Error('Fornecedor não encontrado ou sem permissão de acesso')

    const uploadedDocs = docsRes.status === 'fulfilled' ? (docsRes.value.data || []) : []
    let fullDocList = [...uploadedDocs]

    if (catRes.status === 'fulfilled' && catRes.value.data?.length) {
      const catIds = catRes.value.data.map(r => r.category_id)
      const { data: catDocRows } = await supabase
        .from('category_documents')
        .select('document_id, documents_catalog(id, name)')
        .in('category_id', catIds)
      if (catDocRows) {
        const seen = new Set(uploadedDocs.map(d => String(d.type)))
        catDocRows.forEach(row => {
          const docId = String(row.document_id)
          if (!seen.has(docId) && row.documents_catalog) {
            seen.add(docId)
            fullDocList.push({ id: `req-${docId}`, supplier_id: supplierId, type: docId, label: row.documents_catalog.name, status: 'MISSING', source: 'REQUIRED', storage_path: null, created_at: null })
          }
        })
      }
    }

    fullDocList.sort((a, b) => {
      if (a.status === 'MISSING' && b.status !== 'MISSING') return 1
      if (a.status !== 'MISSING' && b.status === 'MISSING') return -1
      return (a.label || '').localeCompare(b.label || '', 'pt-BR')
    })

    return {
      ...supplier,
      seals:             sealsRes.status === 'fulfilled' ? (sealsRes.value.data || []) : [],
      documents:         fullDocList,
      cnpj_consultation: cnpjRes.status  === 'fulfilled' ? (cnpjRes.value.data?.[0] || null) : null,
      invitation:        inviteRes.status === 'fulfilled' ? inviteRes.value.data : null,
    }
  },

  getSuppliers: async (clientId) => {
    const { data, error } = await supabase
      .from('invitations')
      .select('id, supplier_id, status, subsidiado, tipo_fornecedor, escopo, created_at, supplier_razao_social, supplier_cnpj, suppliers(id, razao_social, cnpj, city, state, status, employee_range)')
      .eq('client_id', clientId)
      .eq('status', 'REGISTERED')
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)

    const all = data || []
    const supplierIds = all.map(i => i.supplier_id).filter(Boolean)
    if (!supplierIds.length) return []

    const { data: seals } = await supabase
      .from('seals')
      .select('supplier_id, level, status, score')
      .in('supplier_id', supplierIds)
    const sealMap = (seals || []).reduce((acc, s) => { acc[s.supplier_id] = s; return acc }, {})

    return all.map(i => ({
      inviteId:          i.id,
      supplierId:        i.supplier_id,
      subsidiado:        i.subsidiado,
      tipo:              i.tipo_fornecedor,
      escopo:            i.escopo,
      invitedAt:         i.created_at,
      // dados da invitation como fallback quando RLS bloqueia join com suppliers
      inviteRazaoSocial: i.supplier_razao_social,
      inviteCnpj:        i.supplier_cnpj,
      supplier:          i.suppliers,
      // se seal não carregou (RLS), assume PENDING (fornecedor registrado ainda não aprovado)
      seal:              sealMap[i.supplier_id] || { status: 'PENDING', score: 0 },
    }))
  },
}

// ── Assertiva ─────────────────────────────────────────────────────────────────
export const assertivaApi = {
  // Busca o último relatório salvo (GET)
  getLast: async (supplierId) => {
    const { data: { session } } = await supabase.auth.getSession()
    const url = supplierId
      ? `/.netlify/functions/assertiva-report?supplierId=${supplierId}`
      : '/.netlify/functions/assertiva-report'
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${session?.access_token}` },
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Erro ao buscar relatório')
    return data.report   // null se não existe
  },

  // Gera novo relatório (POST) — aceita supplierId para admin
  generate: async (supplierId) => {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/.netlify/functions/assertiva-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
      body: JSON.stringify(supplierId ? { supplierId } : {}),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Erro ao gerar relatório')
    return data
  },
}

// ── Questionários ────────────────────────────────────────────────────────────
export const questionnaireApi = {
  listByClient: async (clientId) => {
    const { data, error } = await supabase
      .from('questionnaires')
      .select('*, questionnaire_questions(id, text, type, options, required, order_index)')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    return data || []
  },

  listAll: async () => {
    const { data, error } = await supabase
      .from('questionnaires')
      .select('*, clients(razao_social), questionnaire_questions(id, text, type, options, required, order_index)')
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    return data || []
  },

  create: async ({ clientId, title, description }) => {
    const { data, error } = await supabase
      .from('questionnaires')
      .insert({ client_id: clientId, title, description })
      .select().single()
    if (error) throw new Error(error.message)
    return data
  },

  update: async (id, updates) => {
    const { error } = await supabase.from('questionnaires').update(updates).eq('id', id)
    if (error) throw new Error(error.message)
  },

  remove: async (id) => {
    const { error } = await supabase.from('questionnaires').delete().eq('id', id)
    if (error) throw new Error(error.message)
  },

  addQuestion: async (questionnaireId, { text, type, options, required, orderIndex }) => {
    const { data, error } = await supabase
      .from('questionnaire_questions')
      .insert({ questionnaire_id: questionnaireId, text, type, options: options || null, required: required ?? true, order_index: orderIndex || 0 })
      .select().single()
    if (error) throw new Error(error.message)
    return data
  },

  removeQuestion: async (id) => {
    const { error } = await supabase.from('questionnaire_questions').delete().eq('id', id)
    if (error) throw new Error(error.message)
  },

  // Supplier: busca questionários dos clientes que o convidaram
  getForSupplier: async (supplierId) => {
    const { data: invites } = await supabase
      .from('invitations')
      .select('client_id')
      .eq('supplier_id', supplierId)
    if (!invites?.length) return []

    const clientIds = [...new Set(invites.map(i => i.client_id).filter(Boolean))]
    const { data, error } = await supabase
      .from('questionnaires')
      .select('*, clients(razao_social), questionnaire_questions(id, text, type, options, required, order_index)')
      .in('client_id', clientIds)
      .eq('active', true)
    if (error) throw new Error(error.message)

    // Busca respostas existentes
    const questionIds = (data || []).flatMap(q => q.questionnaire_questions.map(qq => qq.id))
    const { data: answers } = questionIds.length ? await supabase
      .from('questionnaire_answers')
      .select('question_id, answer_boolean, answer_text')
      .eq('supplier_id', supplierId)
      .in('question_id', questionIds) : { data: [] }

    const answerMap = (answers || []).reduce((acc, a) => { acc[a.question_id] = a; return acc }, {})
    return (data || []).map(q => ({
      ...q,
      questionnaire_questions: q.questionnaire_questions
        .sort((a, b) => a.order_index - b.order_index)
        .map(qq => ({ ...qq, existingAnswer: answerMap[qq.id] || null })),
    }))
  },

  saveAnswer: async ({ questionId, supplierId, answerBoolean, answerText }) => {
    const { error } = await supabase
      .from('questionnaire_answers')
      .upsert({ question_id: questionId, supplier_id: supplierId, answer_boolean: answerBoolean ?? null, answer_text: answerText ?? null, updated_at: new Date().toISOString() },
        { onConflict: 'question_id,supplier_id' })
    if (error) throw new Error(error.message)
  },

  // Admin/Client: respostas de um fornecedor específico
  getAnswersForSupplier: async (supplierId) => {
    const { data, error } = await supabase
      .from('questionnaire_answers')
      .select('*, questionnaire_questions(id, text, type, questionnaires(id, title, clients(razao_social)))')
      .eq('supplier_id', supplierId)
    if (error) throw new Error(error.message)
    return data || []
  },
}

// ── Invitations ───────────────────────────────────────────────────────────────
export const invitationsApi = {
  // Lista convites de um comprador
  listByBuyer: async (buyerId) => {
    const { data, error } = await supabase
      .from('invitations')
      .select('*')
      .eq('buyer_id', buyerId)
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    return data || []
  },

  // Lista convites de um cliente
  listByClient: async (clientId) => {
    const { data, error } = await supabase
      .from('invitations')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    return data || []
  },

  // Envia convite (BUYER: simples | CLIENT/ADMIN: enriquecido)
  send: async (payload, token) => {
    const res = await fetch('/.netlify/functions/send-invitation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Erro ao enviar convite')
    return data
  },

  // Reenvia e-mail de convite existente
  resend: async (inviteId, token) => {
    const res = await fetch('/.netlify/functions/send-invitation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ resendId: inviteId }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Erro ao reenviar convite')
    return data
  },

  // Busca convite por token (sem auth — usado no onboarding)
  getByToken: async (token) => {
    const res = await fetch(`/.netlify/functions/get-invitation?token=${token}`)
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Convite inválido')
    return data
  },
}
