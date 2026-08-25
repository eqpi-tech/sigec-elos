// ─── SIGEC-ELOS API Service — Supabase Real ───────────────────────────────
// Contrato idêntico ao mockApi.js anterior.
// Todas as páginas funcionam sem alteração.

import { supabase } from '../lib/supabase.js'
import { calculateScore, ELOS_VERIFICADO_DOCS } from '../lib/score.js'

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
      supabase.from('seals').select('id, seal_name, level, status, score, issued_at, expires_at, client_id, client_suspended_at, clients(razao_social)').eq('supplier_id', supplierId).order('issued_at', { ascending: false }),
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

  getProcess: async (sealId, supplierId) => {
    // 1. Busca o seal
    const sealRes = await supabase.from('seals')
      .select('id, seal_name, level, status, score, issued_at, expires_at, client_id, client_suspended_at, client_suspended_reason, clients(razao_social, cnpj)')
      .eq('id', sealId)
      .single()
    if (sealRes.error) throw new Error(sealRes.error.message)
    const seal = sealRes.data

    // 2. Docs do fornecedor + convite em paralelo
    const [docsRes, invRes] = await Promise.all([
      supabase.from('documents')
        .select('*')
        .eq('supplier_id', supplierId)
        .order('created_at', { ascending: false }),
      seal.client_id
        ? supabase.from('invitations')
            .select('escopo, contato, tipo_fornecedor, subsidiado, created_at, status')
            .eq('supplier_id', supplierId)
            .eq('client_id', seal.client_id)
            .maybeSingle()
        : { data: null },
    ])

    const uploadedDocs = docsRes.data || []
    let documents

    if (seal.client_id) {
      // Processo de cliente — fonte primária pós-migração v2: documentos
      // exigidos pelas CATEGORIAS DO CLIENTE selecionadas pelo fornecedor.
      // Fallback: client_document_flows (fluxo configurado manualmente).
      const { data: catRows } = await supabase
        .from('supplier_categories')
        .select('category_id, categories(client_id)')
        .eq('supplier_id', supplierId)
      const clientCatIds = (catRows || [])
        .filter(r => r.categories?.client_id === seal.client_id)
        .map(r => r.category_id)

      let reqRows = [] // [{ document_id, name }]
      if (clientCatIds.length) {
        for (let i = 0; i < clientCatIds.length; i += 200) {
          const { data: cdRows } = await supabase
            .from('category_documents')
            .select('document_id, documents_catalog(id, name)')
            .in('category_id', clientCatIds.slice(i, i + 200))
          for (const r of (cdRows || []))
            if (r.documents_catalog) reqRows.push({ document_id: r.document_id, name: r.documents_catalog.name })
        }
      }
      if (!reqRows.length) {
        // Fallback 1: categorias dos FLUXOS ATIVOS do cliente (patch_043)
        const { data: fcRows } = await supabase
          .from('client_flow_categories')
          .select('category_id, client_flows!inner(client_id, active)')
          .eq('client_flows.client_id', seal.client_id)
          .eq('client_flows.active', true)
        const flowCatIds = [...new Set((fcRows || []).map(r => r.category_id))]
        for (let i = 0; i < flowCatIds.length; i += 200) {
          const { data: cdRows } = await supabase
            .from('category_documents')
            .select('document_id, documents_catalog(id, name)')
            .in('category_id', flowCatIds.slice(i, i + 200))
          for (const r of (cdRows || []))
            if (r.documents_catalog) reqRows.push({ document_id: r.document_id, name: r.documents_catalog.name })
        }
      }
      if (!reqRows.length) {
        // Fallback 2 (legado): fluxo doc-a-doc (ex.: Fluxo Padrão pré-043)
        const { data: flowRows } = await supabase
          .from('client_document_flows')
          .select('catalog_id, documents_catalog(id, name), client_flows!inner(active)')
          .eq('client_id', seal.client_id)
          .eq('required', true)
          .eq('client_flows.active', true)
        reqRows = (flowRows || [])
          .filter(r => r.documents_catalog)
          .map(r => ({ document_id: r.catalog_id, name: r.documents_catalog.name }))
      }

      const requiredIds = new Set(reqRows.map(r => String(r.document_id)))

      // Uploaded que este processo exige
      documents = uploadedDocs.filter(d => requiredIds.has(String(d.type)))

      // MISSING para requisitos ainda não enviados (deduplicado)
      const uploadedTypes = new Set(documents.map(d => String(d.type)))
      const seen = new Set()
      reqRows.forEach(row => {
        const docId = String(row.document_id)
        if (!uploadedTypes.has(docId) && !seen.has(docId)) {
          seen.add(docId)
          documents.push({ id: `req-${docId}`, supplier_id: supplierId, type: docId, label: row.name, status: 'MISSING', source: 'REQUIRED', storage_path: null, created_at: null })
        }
      })
      documents.sort((a, b) => (a.label || '').localeCompare(b.label || '', 'pt-BR'))
    } else {
      // Processo ELOS (pré-homologação): SÓ os documentos simples/automáticos
      // do selo Verificado — as categorias valem p/ marketplace, não p/ exigência
      documents = [...uploadedDocs]
      const { data: catalogRows } = await supabase
        .from('documents_catalog')
        .select('id, name')
        .in('id', ELOS_VERIFICADO_DOCS.map(Number))
      const seen = new Set(uploadedDocs.map(d => String(d.type)))
      ;(catalogRows || []).forEach(row => {
        const docId = String(row.id)
        if (!seen.has(docId)) {
          seen.add(docId)
          documents.push({ id: `req-${docId}`, supplier_id: supplierId, type: docId, label: row.name, status: 'MISSING', source: 'REQUIRED', storage_path: null, created_at: null })
        }
      })
    }

    documents.sort((a, b) => {
      if (a.status === 'MISSING' && b.status !== 'MISSING') return 1
      if (a.status !== 'MISSING' && b.status === 'MISSING') return -1
      return (a.label || '').localeCompare(b.label || '', 'pt-BR')
    })

    return {
      seal,
      documents,
      invitation: invRes.data || null,
      isSigec: seal.client_id === null,
    }
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

  // Arquivos migrados do HOC (S3 privado) — URL pré-assinada via function
  getHocFileUrl: async (documentId) => {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`/.netlify/functions/get-hoc-file?documentId=${documentId}`, {
      headers: { Authorization: `Bearer ${session?.access_token}` },
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Erro ao abrir arquivo')
    return data.url
  },

  // Histórico de versões do documento (document_history, patch_029)
  // Filtra por fornecedor; opcionalmente por tipo de documento
  getHistory: async (supplierId, type) => {
    let q = supabase
      .from('document_history')
      .select('*')
      .eq('supplier_id', supplierId)
      .order('created_at', { ascending: false })
    if (type) q = q.eq('type', String(type))
    const { data, error } = await q
    if (error) throw new Error(error.message)
    return data || []
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

    // Recalcula os scores POR SELO (fluxo do cliente vs fluxo padrão)
    if (docData?.supplier_id) {
      await recalcSealScores(docData.supplier_id)
    }

    return { success: true }
  },
}

// ── Fluxos documentais por selo ──────────────────────────────────────────────
// Regra de produto: fornecedor espontâneo segue o fluxo padrão (categorias
// globais); fornecedor vinculado a cliente segue o fluxo do cliente
// (categorias com client_id, migradas do HOC). Cada selo tem seu denominador.

// Retorna { requiredBySeal: Map<sealId, number[]>, seals, allDocs }
export async function getRequiredTypesBySeal(supplierId) {
  const [{ data: seals }, { data: allDocs }, { data: catRows }] = await Promise.all([
    supabase.from('seals').select('id, client_id, status, seal_name, clients(razao_social)').eq('supplier_id', supplierId),
    supabase.from('documents').select('type, status').eq('supplier_id', supplierId),
    supabase.from('supplier_categories')
      .select('category_id, categories(id, client_id)')
      .eq('supplier_id', supplierId),
  ])

  // Agrupa as categorias do fornecedor por dono: cliente ou global
  const catsByOwner = {} // 'global' | client_id → [category_id]
  for (const r of (catRows || [])) {
    const owner = r.categories?.client_id || 'global'
    ;(catsByOwner[owner] = catsByOwner[owner] || []).push(r.category_id)
  }

  // Documentos exigidos por grupo de categorias (uma query para todas)
  const allCatIds = (catRows || []).map(r => r.category_id)
  const catToOwner = {}
  for (const [owner, ids] of Object.entries(catsByOwner))
    for (const id of ids) catToOwner[id] = owner

  const reqByOwner = {} // owner → Set<document_id>
  if (allCatIds.length) {
    for (let i = 0; i < allCatIds.length; i += 200) {
      const { data: catDocRows } = await supabase
        .from('category_documents')
        .select('category_id, document_id')
        .in('category_id', allCatIds.slice(i, i + 200))
      for (const r of (catDocRows || [])) {
        const owner = catToOwner[r.category_id] || 'global'
        ;(reqByOwner[owner] = reqByOwner[owner] || new Set()).add(r.document_id)
      }
    }
  }

  const requiredBySeal = new Map()
  for (const seal of (seals || [])) {
    const owner = seal.client_id || 'global'
    let req = [...(reqByOwner[owner] || [])]
    // Fallback 1: categorias dos fluxos ATIVOS do cliente (patch_043)
    if (!req.length && seal.client_id) {
      const { data: fcRows } = await supabase
        .from('client_flow_categories')
        .select('category_id, client_flows!inner(client_id, active)')
        .eq('client_flows.client_id', seal.client_id)
        .eq('client_flows.active', true)
      const flowCatIds = [...new Set((fcRows || []).map(r => r.category_id))]
      const docSet = new Set()
      for (let i = 0; i < flowCatIds.length; i += 200) {
        const { data: cdRows } = await supabase
          .from('category_documents')
          .select('document_id')
          .in('category_id', flowCatIds.slice(i, i + 200))
        for (const r of (cdRows || [])) docSet.add(r.document_id)
      }
      req = [...docSet]
    }
    // Fallback 2 (legado): fluxo doc-a-doc
    if (!req.length && seal.client_id) {
      const { data: flowRows } = await supabase
        .from('client_document_flows')
        .select('catalog_id, client_flows!inner(active)')
        .eq('client_id', seal.client_id)
        .eq('required', true)
        .eq('client_flows.active', true)
      req = (flowRows || []).map(r => r.catalog_id)
    }
    // Selo ELOS (sem cliente): denominador fixo da pré-homologação
    if (!seal.client_id) req = ELOS_VERIFICADO_DOCS.map(Number)
    // Fallback final: nada específico → fluxo padrão por categorias globais
    if (!req.length) req = [...(reqByOwner['global'] || [])]
    requiredBySeal.set(seal.id, req)
  }

  return { requiredBySeal, seals: seals || [], allDocs: allDocs || [] }
}

// Recalcula seals.score individualmente, cada selo contra o seu fluxo
export async function recalcSealScores(supplierId) {
  const { requiredBySeal, seals, allDocs } = await getRequiredTypesBySeal(supplierId)
  await Promise.all(seals.map(seal => {
    const req = (requiredBySeal.get(seal.id) || []).map(id => ({ id }))
    const score = calculateScore(allDocs, req)
    return supabase.from('seals').update({ score }).eq('id', seal.id)
  }))
}

// ── Marketplace ───────────────────────────────────────────────────────────────
export const marketplaceApi = {
  search: async (filters = {}) => {
    // Usa Netlify Function com service_role para contornar RLS
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token || ''
    const base = import.meta.env.DEV ? 'http://localhost:8888' : ''
    const res = await fetch(`${base}/.netlify/functions/marketplace-search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(filters),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }))
      throw new Error(err.error || 'Erro na busca do marketplace')
    }
    return res.json()
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

// RFQ para CLIENT
export const clientRfqApi = {
  // Cria RFQ + insere respostas para todos os fornecedores elegíveis da categoria
  create: async ({ clientId, title, description, categoryId, deadline }) => {
    const { data: rfq, error } = await supabase
      .from('rfqs')
      .insert({ client_id: clientId, title, description, category_id: categoryId, deadline, requester_role: 'CLIENT', status: 'SENT' })
      .select().single()
    if (error) throw new Error(error.message)

    // Busca fornecedores com selo ACTIVE que atuam nessa categoria
    const { data: catSuppliers } = await supabase
      .from('supplier_categories')
      .select('supplier_id')
      .eq('category_id', categoryId)

    const supplierIds = [...new Set((catSuppliers || []).map(r => r.supplier_id))]
    if (supplierIds.length > 0) {
      const { data: activeSeals } = await supabase
        .from('seals').select('supplier_id').eq('status','ACTIVE').in('supplier_id', supplierIds)
      const eligible = [...new Set((activeSeals || []).map(s => s.supplier_id))]
      if (eligible.length > 0) {
        const responses = eligible.map(sid => ({ rfq_id: rfq.id, supplier_id: sid, status: 'SENT' }))
        await supabase.from('rfq_responses').insert(responses)
      }
      rfq._eligibleCount = eligible.length
    }
    return rfq
  },

  list: async (clientId) => {
    const { data } = await supabase
      .from('rfqs')
      .select('id, title, description, category_id, deadline, status, created_at, categories(name)')
      .eq('client_id', clientId)
      .eq('requester_role', 'CLIENT')
      .order('created_at', { ascending: false })
    return data || []
  },

  getResponses: async (rfqId) => {
    const { data } = await supabase
      .from('rfq_responses')
      .select('id, status, message, price, created_at, updated_at, supplier_id, suppliers(id, razao_social, cnpj, city, state)')
      .eq('rfq_id', rfqId)
      .order('created_at')
    return data || []
  },

  updateResponseStatus: async (responseId, status) => {
    const { error } = await supabase.from('rfq_responses').update({ status, updated_at: new Date().toISOString() }).eq('id', responseId)
    if (error) throw new Error(error.message)
  },

  getEligibleCount: async (categoryId) => {
    const { data: catSuppliers } = await supabase.from('supplier_categories').select('supplier_id').eq('category_id', categoryId)
    const ids = [...new Set((catSuppliers || []).map(r => r.supplier_id))]
    if (!ids.length) return 0
    const { count } = await supabase.from('seals').select('*', { count:'exact', head:true }).eq('status','ACTIVE').in('supplier_id', ids)
    return count || 0
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

    // Deduplicar por supplier_id — um fornecedor pode ter vários selos PENDING (um por cliente)
    const _seen = new Set()
    const deduped = sealsData.filter(s => {
      if (!s.supplier_id || _seen.has(s.supplier_id)) return false
      _seen.add(s.supplier_id)
      return true
    })
    if (!deduped.length) return []

    // Passo 2: documentos em lotes de 150 — IN clause com centenas de UUIDs estoura o limite de URL do PostgREST
    const supplierIds = deduped.map(s => s.supplier_id)
    let docsData = []
    for (let i = 0; i < supplierIds.length; i += 150) {
      const { data: batch } = await supabase
        .from('documents')
        .select('supplier_id, type, label, status')
        .in('supplier_id', supplierIds.slice(i, i + 150))
      if (batch) docsData = docsData.concat(batch)
    }

    const docsBySupplier = (docsData || []).reduce((acc, d) => {
      acc[d.supplier_id] = acc[d.supplier_id] || []
      acc[d.supplier_id].push(d)
      return acc
    }, {})

    return deduped.map(s => ({
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
      supabase.from('seals').select('*, clients(razao_social)').eq('supplier_id', supplierId),
      supabase.from('documents').select('*').eq('supplier_id', supplierId).order('created_at', { ascending: false }),
      supabase.from('cnpj_consultations')
        .select('id, supplier_id, cnpj, cnpj_data, sanctions_data, has_sanctions, consulted_at')
        .eq('supplier_id', supplierId)
        .order('consulted_at', { ascending: false })
        .limit(1),
      // Busca categorias do fornecedor com nomes para exibição na ficha
      supabase.from('supplier_categories')
        .select('category_id, categories(id, name, parent_id)')
        .eq('supplier_id', supplierId),
    ])

    const supplier = supplierRes.status === 'fulfilled' ? supplierRes.value.data : null
    if (!supplier) throw new Error('Fornecedor não encontrado')

    // Guarda o user_id para que a notificação de e-mail seja buscada server-side
    // (auth.admin.getUserById não está disponível no cliente — send-email faz o lookup)
    const supplierEmail = null  // send-email receberá user_id e buscará o e-mail

    const uploadedDocs = docsRes.status === 'fulfilled' ? (docsRes.value.data || []) : []
    const uploadedByType = {}
    uploadedDocs.forEach(d => { uploadedByType[String(d.type)] = d })

    // Constrói lista completa: exigidos + já enviados.
    // Fornecedor SÓ-ELOS (sem processo de cliente): exigência é a PRÉ-
    // homologação (6 docs simples) — categorias NÃO entram na análise.
    let fullDocList = [...uploadedDocs]
    const hasClientSeal = sealsRes.status === 'fulfilled'
      && (sealsRes.value.data || []).some(x => x.client_id)
    if (!hasClientSeal) {
      const { data: elosCat } = await supabase
        .from('documents_catalog').select('id, name')
        .in('id', ELOS_VERIFICADO_DOCS.map(Number))
      const seen = new Set(uploadedDocs.map(d => String(d.type)))
      ;(elosCat || []).forEach(row => {
        const docId = String(row.id)
        if (!seen.has(docId)) {
          seen.add(docId)
          fullDocList.push({
            id: `req-${docId}`, supplier_id: supplierId, type: docId,
            label: row.name, status: 'MISSING', source: 'REQUIRED',
            storage_path: null, created_at: null,
          })
        }
      })
    } else if (catRes.status === 'fulfilled' && catRes.value.data?.length) {
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

    const categories = catRes.status === 'fulfilled'
      ? (catRes.value.data || []).map(r => r.categories).filter(Boolean)
      : []

    return {
      ...supplier,
      email:             supplierEmail,
      seals:             sealsRes.status === 'fulfilled' ? (sealsRes.value.data || []) : [],
      documents:         fullDocList,
      cnpj_consultation: cnpjRes.status  === 'fulfilled' ? (cnpjRes.value.data?.[0] || null) : null,
      categories,
    }
  },

  approveSeal: async (supplierId, level, sealId) => {
    // Mundo multi-selo: aprova APENAS o selo em análise quando informado;
    // sem sealId (legado), atualiza todos os selos do fornecedor
    let q = supabase
      .from('seals')
      .update({ level, status: 'ACTIVE', issued_at: new Date().toISOString() })
      .eq('supplier_id', supplierId)
    if (sealId) q = q.eq('id', sealId)
    const { error: sealErr } = await q
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

  // Tela de Análise em Lote — retorna documentos com filtros dinâmicos
  listDocumentsForAnalysis: async ({ docType, supplierSearch, clientName, status: statusFilter, expiresUntil, sortBy = 'expires_asc', page = 0, pageSize = 50 } = {}) => {
    const today      = new Date(); today.setHours(0, 0, 0, 0)
    const todayEnd   = new Date(); todayEnd.setHours(23, 59, 59, 999)
    const in5days    = new Date(today); in5days.setDate(in5days.getDate() + 5); in5days.setHours(23, 59, 59, 999)

    let q = supabase
      .from('documents')
      .select('id, type, label, status, source, expires_at, review_note, supplier_id, storage_path, hoc_arquivo_id, created_at, updated_at, suppliers(id, razao_social, cnpj)', { count: 'exact' })
      .not('label', 'is', null)

    // Filtro tipo de documento
    if (docType) q = q.eq('type', String(docType))

    // Filtro status
    if (statusFilter === 'vencido')     q = q.eq('status', 'EXPIRED').not('expires_at','is',null).lt('expires_at', today.toISOString())
    else if (statusFilter === 'hoje')   q = q.not('expires_at','is',null).gte('expires_at', today.toISOString()).lte('expires_at', todayEnd.toISOString())
    else if (statusFilter === '5dias')  q = q.not('expires_at','is',null).gt('expires_at', todayEnd.toISOString()).lte('expires_at', in5days.toISOString())
    else if (statusFilter === 'pendente') q = q.eq('status','PENDING')
    else if (statusFilter === 'analise')  q = q.in('status',['PENDING','MISSING'])
    else if (statusFilter && statusFilter !== 'todos') q = q.eq('status', statusFilter)

    // Filtro vencimento até (date string YYYY-MM-DD)
    if (expiresUntil) q = q.not('expires_at','is',null).lte('expires_at', new Date(expiresUntil + 'T23:59:59').toISOString())

    // Ordenação
    if (sortBy === 'expires_asc')   q = q.order('expires_at', { ascending: true,  nullsFirst: false })
    else if (sortBy === 'expires_desc') q = q.order('expires_at', { ascending: false, nullsFirst: false })
    else if (sortBy === 'status')   q = q.order('status', { ascending: true })
    else                            q = q.order('created_at', { ascending: false })

    // Paginação
    q = q.range(page * pageSize, (page + 1) * pageSize - 1)

    const { data, error, count } = await q
    if (error) throw new Error(error.message)

    let rows = data || []

    // Filtro por nome/CNPJ do fornecedor (client-side — PostgREST não faz ilike em join)
    if (supplierSearch?.trim()) {
      const s = supplierSearch.trim().toLowerCase()
      rows = rows.filter(d =>
        d.suppliers?.razao_social?.toLowerCase().includes(s) ||
        d.suppliers?.cnpj?.replace(/\D/g,'').includes(s.replace(/\D/g,''))
      )
    }

    // Filtro por nome do cliente (via subquery: supplier → invitations → clients)
    // Implementado na camada de componente (join complexo, baixo volume na prática)

    return { rows, total: count || 0, page, pageSize }
  },

  getRejectionReasons: async () => {
    const { data } = await supabase
      .from('rejection_reasons')
      .select('id, code, label, applies_to')
      .eq('active', true)
      .order('id')
    return data || []
  },

  getProcessLog: async (supplierId, { dateFrom, dateTo, description } = {}) => {
    let q = supabase
      .from('audit_log')
      .select('id, action, metadata, created_at, user_id')
      .eq('entity_id', supplierId)
      .order('created_at', { ascending: false })
      .limit(200)
    if (dateFrom) q = q.gte('created_at', new Date(dateFrom).toISOString())
    if (dateTo)   q = q.lte('created_at', new Date(dateTo + 'T23:59:59').toISOString())
    const { data } = await q
    let rows = data || []
    if (description) {
      const lower = description.toLowerCase()
      rows = rows.filter(r =>
        (r.action || '').toLowerCase().includes(lower) ||
        JSON.stringify(r.metadata || '').toLowerCase().includes(lower)
      )
    }
    return rows
  },

  getSupplierInvitations: async (supplierId) => {
    const { data } = await supabase
      .from('invitations')
      .select('id, status, created_at, client_id, clients(razao_social)')
      .eq('supplier_id', supplierId)
      .order('created_at', { ascending: false })
    return data || []
  },

  getDocumentFarol: async () => {
    // Janela: vencidos + hoje + próximos 5 dias (reduz volume e foco operacional)
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
    const todayEnd   = new Date(); todayEnd.setHours(23, 59, 59, 999)
    const in5days    = new Date(todayStart); in5days.setDate(in5days.getDate() + 5); in5days.setHours(23, 59, 59, 999)
    const isoStart   = todayStart.toISOString()
    const isoEnd     = todayEnd.toISOString()
    const iso5days   = in5days.toISOString()

    const docFields = 'id, label, expires_at, status, supplier_id, suppliers(razao_social, cnpj)'
    const [vencRes, hojeRes, futuroRes] = await Promise.allSettled([
      supabase.from('documents').select(docFields)
        .not('expires_at', 'is', null).lt('expires_at', isoStart)
        .order('expires_at', { ascending: true }).range(0, 4999),
      supabase.from('documents').select(docFields)
        .not('expires_at', 'is', null).gte('expires_at', isoStart).lte('expires_at', isoEnd)
        .order('expires_at', { ascending: true }).range(0, 4999),
      // futuro = apenas próximos 5 dias (janela operacional definida)
      supabase.from('documents').select(docFields)
        .not('expires_at', 'is', null).gt('expires_at', isoEnd).lte('expires_at', iso5days)
        .order('expires_at', { ascending: true }).range(0, 4999),
    ])

    const vencidos = vencRes.status    === 'fulfilled' ? (vencRes.value.data    || []) : []
    const hoje     = hojeRes.status    === 'fulfilled' ? (hojeRes.value.data    || []) : []
    const futuro   = futuroRes.status  === 'fulfilled' ? (futuroRes.value.data  || []) : []

    return { vencidos, hoje, futuro, all: [...vencidos, ...hoje, ...futuro] }
  },

  getMetrics: async () => {
    // Queries independentes com tratamento de erro individual
    // Selos: busca supplier_ids e deduplica — um fornecedor pode ter N selos (um por cliente HOC)
    // count estimado (exato sob RLS estoura timeout → KPI zerado e tela lenta);
    // selos paginados COM ORDER (range sem order é capado/instável no PostgREST)
    const fetchSealSuppliers = async (status) => {
      let out = [], from = 0
      for (;;) {
        const { data } = await supabase.from('seals').select('id, supplier_id')
          .eq('status', status).order('id').range(from, from + 999)
        out = out.concat(data || [])
        if (!data || data.length < 1000) return out
        from += 1000
      }
    }
    const [suppliersRes, activeSealsRes, pendingSealsRes, planRes] = await Promise.allSettled([
      supabase.from('suppliers').select('id', { count: 'estimated', head: true }),
      fetchSealSuppliers('ACTIVE'),
      fetchSealSuppliers('PENDING'),
      supabase.from('plans').select('type, price_yearly').eq('status', 'ACTIVE'),
    ])

    const totalSuppliers  = suppliersRes.status === 'fulfilled'  ? (suppliersRes.value.count  || 0) : 0
    const activeSeals     = activeSealsRes.status === 'fulfilled'
      ? new Set((activeSealsRes.value || []).map(s => s.supplier_id)).size : 0
    const pendingAnalysis = pendingSealsRes.status === 'fulfilled'
      ? new Set((pendingSealsRes.value || []).map(s => s.supplier_id)).size : 0
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

  listClients: async () => {
    const { data, error } = await supabase
      .from('clients')
      .select('id, razao_social, nome_fantasia')
      .order('razao_social')
    if (error) throw new Error(error.message)
    return data || []
  },

  getClientLandingPage: async (clientId) => {
    const { data } = await supabase
      .from('client_landing_pages')
      .select('*')
      .eq('client_id', clientId)
      .maybeSingle()
    return data || null
  },

  saveClientLandingPage: async (clientId, fields) => {
    const { id, ...rest } = fields
    if (id) {
      const { data, error } = await supabase
        .from('client_landing_pages')
        .update(rest)
        .eq('id', id)
        .select().single()
      if (error) throw new Error(error.message)
      return data
    }
    const { data, error } = await supabase
      .from('client_landing_pages')
      .insert({ client_id: clientId, ...rest })
      .select().single()
    if (error) throw new Error(error.message)
    return data
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
  // Categorias híbridas (patch_032): client_id NULL = global; preenchido = custom do cliente.
  // clientIds (opcional): inclui as categorias custom desses clientes além das globais.
  // Filtro SERVER-SIDE obrigatório: com 10k+ categorias de cliente na base, o
  // limite de 1.000 linhas do PostgREST devolveria só categorias de outros
  // clientes e o filtro em JS zeraria o resultado.
  _ownerFilter: (q, clientIds) =>
    clientIds?.length
      ? q.or(`client_id.is.null,client_id.in.(${clientIds.join(',')})`)
      : q.is('client_id', null),

  _visibleTo: (rows, clientIds) => (rows || []).filter(c =>
    !c.client_id || (clientIds || []).includes(c.client_id)
  ),

  // Busca todas as categorias pai
  getParents: async (clientIds) => {
    let q = supabase
      .from('categories')
      .select('*')
      .is('parent_id', null)
      .eq('active', true)
      .order('name')
    q = categoriesApi._ownerFilter(q, clientIds)
    const { data, error } = await q
    if (error) throw new Error(error.message)
    return categoriesApi._visibleTo(data, clientIds)
  },

  // Busca filhas de uma categoria pai
  getChildren: async (parentId, clientIds) => {
    let q = supabase
      .from('categories')
      .select('*')
      .eq('parent_id', parentId)
      .eq('active', true)
      .order('name')
    q = categoriesApi._ownerFilter(q, clientIds)
    const { data, error } = await q
    if (error) throw new Error(error.message)
    return categoriesApi._visibleTo(data, clientIds)
  },

  // Busca todos os nós filhos e netos de um pai (para expandir a árvore)
  getTree: async (parentId, clientIds) => {
    // Busca nível 2 (filhos diretos)
    let q1 = supabase
      .from('categories')
      .select('*')
      .eq('parent_id', parentId)
      .eq('active', true)
      .order('name')
    q1 = categoriesApi._ownerFilter(q1, clientIds)
    const { data: rawChildren } = await q1
    const children = categoriesApi._visibleTo(rawChildren, clientIds)
    // Sempre retorna a mesma forma — retornar [] aqui quebrava tree.children nos callers
    if (!children.length) return { children: [], grandchildren: [] }
    // Busca nível 3 (netos) para cada filho — em lotes p/ URL segura
    let grandchildren = []
    const childIds = children.map(c => c.id)
    for (let i = 0; i < childIds.length; i += 150) {
      let q2 = supabase
        .from('categories')
        .select('*')
        .in('parent_id', childIds.slice(i, i + 150))
        .eq('active', true)
        .order('name')
      q2 = categoriesApi._ownerFilter(q2, clientIds)
      const { data: gc } = await q2
      grandchildren = grandchildren.concat(categoriesApi._visibleTo(gc, clientIds))
    }
    return { children, grandchildren }
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
    // Passo 1: busca via seals — inclui fornecedores migrados do HOC (seals.client_id)
    // e fornecedores do fluxo novo (também têm seal.client_id após aceite do convite)
    const { data: sealsData, error: sealsErr } = await supabase
      .from('seals')
      .select('supplier_id, level, status, score, seal_name, client_suspended_at, suppliers(id, razao_social, cnpj, city, state, status, employee_range)')
      .eq('client_id', clientId)
    if (sealsErr) throw new Error(sealsErr.message)

    const sealMap = {}
    const supplierFromSeal = {}
    for (const seal of (sealsData || [])) {
      sealMap[seal.supplier_id] = {
        supplier_id: seal.supplier_id, level: seal.level, status: seal.status,
        score: seal.score, seal_name: seal.seal_name, client_suspended_at: seal.client_suspended_at,
      }
      if (seal.suppliers) supplierFromSeal[seal.supplier_id] = seal.suppliers
    }

    // Passo 2: convites para dados extras (subsidiado, tipo, escopo, data)
    const { data: invites } = await supabase
      .from('invitations')
      .select('id, supplier_id, status, subsidiado, tipo_fornecedor, escopo, created_at, supplier_razao_social, supplier_cnpj')
      .eq('client_id', clientId)
    const inviteMap = {}
    for (const inv of (invites || [])) {
      // Mantém o convite REGISTERED quando há múltiplos
      if (!inviteMap[inv.supplier_id] || inv.status === 'REGISTERED') {
        inviteMap[inv.supplier_id] = inv
      }
    }

    // Passo 3: todos os supplier_ids únicos (via seal ou convite REGISTERED)
    const registeredViaInvite = new Set(
      (invites || []).filter(i => i.status === 'REGISTERED' && i.supplier_id).map(i => i.supplier_id)
    )
    const allIds = new Set([...Object.keys(sealMap), ...registeredViaInvite])

    return [...allIds].map(sid => {
      const seal   = sealMap[sid]
      const invite = inviteMap[sid]
      const sup    = supplierFromSeal[sid] || null
      return {
        inviteId:          invite?.id || null,
        supplierId:        sid,
        subsidiado:        invite?.subsidiado || false,
        tipo:              invite?.tipo_fornecedor || null,
        escopo:            invite?.escopo || null,
        invitedAt:         invite?.created_at || null,
        inviteRazaoSocial: invite?.supplier_razao_social || null,
        inviteCnpj:        invite?.supplier_cnpj || null,
        supplier:          sup,
        seal:              seal || { status: 'PENDING', score: 0 },
      }
    })
  },

  // Todos os fornecedores — usa Netlify function com service_role para bypassar RLS.
  // Requer search (≥2 chars) ou state para retornar resultados (evita varredura de 60k+ linhas).
  getVendorList: async (_clientId, { search = '', state = '' } = {}) => {
    const cleanSearch = search.trim()
    if (cleanSearch.length < 2 && !state) return []

    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token || ''

    const params = new URLSearchParams()
    if (cleanSearch) params.set('search', cleanSearch)
    if (state)       params.set('state', state)

    const res = await fetch(`/.netlify/functions/client-vendor-search?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new Error(`Erro ao buscar fornecedores: ${res.status}`)
    return res.json()
  },

  // Termos de uso personalizados
  getTerms: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/.netlify/functions/client-terms', {
      headers: { Authorization: `Bearer ${session?.access_token}` },
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error)
    return json.terms ?? ''
  },

  saveTerms: async (terms) => {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/.netlify/functions/client-terms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ terms }),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error)
    return json
  },

  // Inativar / reativar fornecedor (contexto do cliente)
  inactivateSupplier: async (supplierId, reason) => {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/.netlify/functions/client-inactivate-supplier', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ supplierId, action: 'suspend', reason }),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error)
    return json
  },

  reactivateSupplier: async (supplierId) => {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/.netlify/functions/client-inactivate-supplier', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ supplierId, action: 'reactivate' }),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error)
    return json
  },

  getLandingPage: async (clientId) => {
    const { data } = await supabase
      .from('client_landing_pages')
      .select('*')
      .eq('client_id', clientId)
      .maybeSingle()
    return data || null
  },

  saveLandingPage: async (clientId, fields) => {
    const { id, ...rest } = fields
    if (id) {
      const { data, error } = await supabase
        .from('client_landing_pages')
        .update(rest)
        .eq('id', id)
        .select().single()
      if (error) throw new Error(error.message)
      return data
    }
    const { data, error } = await supabase
      .from('client_landing_pages')
      .insert({ client_id: clientId, ...rest })
      .select().single()
    if (error) throw new Error(error.message)
    return data
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
