// ─── SIGEC-ELOS API Service — Supabase Real ───────────────────────────────
// Contrato idêntico ao mockApi.js anterior.
// Todas as páginas funcionam sem alteração.

import { supabase } from '../lib/supabase.js'
import { calculateScore, ELOS_VERIFICADO_DOCS } from '../lib/score.js'
import { planLabel } from '../lib/planLabels.js'
import { authFetch } from '../lib/authFetch.js'
import { clientSealStatus } from '../lib/clientSituacao.js'

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
      supabase.from('seals').select('id, seal_name, level, status, score, issued_at, expires_at, client_id, client_suspended_at, released_at, hoc_process_id, clients(razao_social)').eq('supplier_id', supplierId).order('issued_at', { ascending: false }),
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
            // vários convites (histórico do HOC, reconvites): o mais recente
            .order('created_at', { ascending: false }).limit(1)
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

  // Abre o arquivo de um documento numa aba nova — Storage do ELOS ou S3
  // legado do HOC. Comprovante oficial em HTML (Rota A: FGTS, Sintegra…): o
  // Storage o entrega como texto puro (mostrava o código); aqui ele é exibido
  // dentro de um iframe SANDBOX — sem scripts e sem acesso à sessão do ELOS.
  view: async (doc) => {
    const path = doc?.storage_path || doc?.letter_path || null
    const isHtml = /\.html?$/i.test(path || '')
    const w = isHtml ? window.open('', '_blank') : null   // abre já no clique (bloqueio de pop-up)
    try {
      if (!path) { window.open(await documentApi.getHocFileUrl(doc.id), '_blank'); return }
      const url = await documentApi.getSignedUrl(path)
      if (!isHtml) { window.open(url, '_blank'); return }
      const html = await (await fetch(url)).text()
      const titulo = String(doc.label || 'Comprovante').replace(/[<>&"]/g, '')
      const srcdoc = html.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      if (!w) throw new Error('O navegador bloqueou a nova aba — permita pop-ups para este site')
      w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${titulo}</title>
<style>html,body{margin:0;height:100%;background:#f4f5fa;font-family:Arial,sans-serif}
.bar{background:#2E3192;color:#fff;padding:8px 14px;font-size:13px}
iframe{border:0;width:100%;height:calc(100% - 34px);background:#fff}</style></head>
<body><div class="bar">SIGEC-ELOS · ${titulo} · comprovante oficial (visualização segura)</div>
<iframe sandbox="" referrerpolicy="no-referrer" srcdoc="${srcdoc}"></iframe></body></html>`)
      w.document.close()
    } catch (e) {
      if (w) w.close()
      throw e
    }
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
// Matriz exigida pelo FLUXO de um selo (categorias do fluxo → docs required).
// Vazio quando o selo não tem fluxo vinculado.
async function flowRequiredDocIds(flowId) {
  if (!flowId) return []
  const { data: fcRows } = await supabase
    .from('client_flow_categories').select('category_id').eq('flow_id', flowId)
  const catIds = [...new Set((fcRows || []).map(r => r.category_id))]
  const docSet = new Set()
  for (let i = 0; i < catIds.length; i += 200) {
    const { data: cdRows } = await supabase
      .from('category_documents')
      .select('document_id')
      .eq('required', true)
      .in('category_id', catIds.slice(i, i + 200))
    for (const r of (cdRows || [])) docSet.add(r.document_id)
  }
  return [...docSet]
}

export async function getRequiredTypesBySeal(supplierId) {
  const [{ data: seals }, { data: allDocs }, { data: catRows }] = await Promise.all([
    supabase.from('seals').select('id, client_id, flow_id, status, seal_name, clients(razao_social)').eq('supplier_id', supplierId),
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
    // Precedência (18/09): 1º as categorias que o FORNECEDOR escolheu dentro
    // do cliente (ex.: VIX Nível 2 — só a matriz de 'Aquisição de Baterias',
    // não do nível inteiro); 2º o fluxo do selo (EQPI Verificado: fornecedor
    // não tem categorias do cliente, o contrato do fluxo define os 6 docs).
    let req = [...(reqByOwner[owner] || [])]
    if (!req.length) req = await flowRequiredDocIds(seal.flow_id)
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
  // Trava de pagamento (patch_112): situação de liberação do fornecedor —
  // released = algum processo liberado (pago, subsidiado, HOC ou homologado);
  // pendentes = processos ainda sem pagamento confirmado; boleto = plano
  // PENDING (boleto emitido, aguardando compensação)
  // cotação: { modo: 'cliente', cliente, fluxo, preco, pagador } ou { modo: 'elos' }
  quote: async ({ supplierId, inviteToken, refSlug, refFlowId } = {}) => {
    const res = await fetch('/.netlify/functions/create-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'quote', supplierId, inviteToken, refSlug, refFlowId }),
    })
    if (!res.ok) return { modo: 'elos' }
    return res.json()
  },

  paymentStatus: async (supplierId) => {
    if (!supplierId) return { released: true, pendentes: [], boleto: false }
    const [{ data: seals }, { data: plan }] = await Promise.all([
      supabase.from('seals').select('id, status, released_at, hoc_process_id, client_id, seal_name, clients(razao_social, nome_fantasia)').eq('supplier_id', supplierId),
      supabase.from('plans').select('status, type').eq('supplier_id', supplierId).maybeSingle(),
    ])
    const lista = seals || []
    return {
      released: lista.some(x => x.released_at),
      pendentes: lista.filter(x => !x.released_at && x.status === 'PENDING'),
      boleto: plan?.status === 'PENDING',
      plan: plan || null,
    }
  },

  // convite (inviteToken) e portal (refSlug/refFlowId) são tagueados: o
  // servidor aplica o PREÇO COMBINADO com o cliente (01/10 — antes o token se
  // perdia aqui e o convidado pagava o valor ELOS)
  createCheckout: async ({ planType, cnaeCount, supplierId, userEmail, priceYearly, inviteToken, refSlug, refFlowId }) => {
    const res = await fetch('/.netlify/functions/create-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planType, cnaeCount, supplierId, userEmail, priceYearly, inviteToken, refSlug, refFlowId }),
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
  // RFQ do cliente (patch_102): gravação e envio no servidor
  // (client-rfq-create); leituras/decisões por RPCs que validam quem chama
  create: async ({ title, description, categoryId, deadline, scope }) => {
    const res = await authFetch('/.netlify/functions/client-rfq-create', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description, categoryId, deadline, scope }),
    })
    const out = await res.json()
    if (!res.ok) throw new Error(out.error || 'Erro ao enviar a cotação')
    return out
  },

  // categorias do PRÓPRIO cliente (o menu listava as de todos os clientes)
  categories: async (clientId) => {
    const { data } = await supabase.from('categories').select('id, name')
      .eq('client_id', clientId).eq('active', true).order('name')
    return data || []
  },

  list: async (clientId) => {
    const { data } = await supabase
      .from('rfqs')
      .select('id, title, description, category_id, deadline, status, scope, created_at, categories(name)')
      .eq('client_id', clientId)
      .eq('requester_role', 'CLIENT')
      .order('created_at', { ascending: false })
    return data || []
  },

  getResponses: async (rfqId) => {
    const { data, error } = await supabase.rpc('client_rfq_responses', { p_rfq: rfqId })
    if (error) throw new Error(error.message)
    return data || []
  },

  updateResponseStatus: async (responseId, status) => {
    const { error } = await supabase.rpc('client_rfq_decide', { p_response: responseId, p_status: status })
    if (error) throw new Error(error.message)
  },

  // { own, elos } — alcance "minha base" e "minha base + homologados ELOS"
  getEligibleCount: async (categoryId) => {
    const { data, error } = await supabase.rpc('client_rfq_counts', { p_category: categoryId })
    if (error) { console.warn('client_rfq_counts:', error.message); return { own: 0, elos: 0 } }
    return data || { own: 0, elos: 0 }
  },
}

// Caixa de entrada de cotações do fornecedor (patch_102)
export const supplierRfqApi = {
  inbox: async () => {
    const { data, error } = await supabase.rpc('supplier_rfq_inbox')
    if (error) throw new Error(error.message)
    return data || []
  },
  markRead: async (responseId) => {
    await supabase.rpc('supplier_rfq_respond', { p_response: responseId, p_message: null, p_price: null, p_only_read: true })
  },
  respond: async (responseId, message, price) => {
    const { error } = await supabase.rpc('supplier_rfq_respond', { p_response: responseId, p_message: message, p_price: price, p_only_read: false })
    if (error) throw new Error(error.message)
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
        .select('category_id, categories(id, name, parent_id, codigo, client_id)')
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
      // categoria → cliente dono ('__ELOS__' quando global), p/ separar as
      // exigências por processo na ficha (fornecedor multi-cliente)
      const catClient = {}
      catRes.value.data.forEach(r => { catClient[r.category_id] = r.categories?.client_id || '__ELOS__' })
      const { data: catDocRows } = await supabase
        .from('category_documents')
        .select('category_id, document_id, documents_catalog(id, name)')
        .in('category_id', catIds)
      if (catDocRows) {
        // doc → conjunto de clientes cujas matrizes o exigem
        const reqBy = {}
        catDocRows.forEach(row => {
          const docId = String(row.document_id)
          ;(reqBy[docId] = reqBy[docId] || new Set()).add(catClient[row.category_id] || '__ELOS__')
        })
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
        fullDocList = fullDocList.map(d =>
          reqBy[String(d.type)] ? { ...d, required_by: [...reqBy[String(d.type)]] } : d)
      }
    }

    // Exigências do FLUXO de cada processo (16/09): o contrato do fluxo
    // (ex.: ELOS Verificado da EQPI = 6 docs) entra na ficha etiquetado pelo
    // cliente do selo, mesmo quando o fornecedor não tem categorias daquele
    // cliente — é o que o seletor de processo da ficha usa para filtrar
    const sealsData = sealsRes.status === 'fulfilled' ? (sealsRes.value.data || []) : []
    // clientes p/ os quais o fornecedor JÁ tem categorias próprias — nesses,
    // a exigência vem das categorias (acima), não do fluxo inteiro (18/09)
    const ownerKeys = new Set(
      (catRes.status === 'fulfilled' ? (catRes.value.data || []) : [])
        .map(r => r.categories?.client_id || '__ELOS__'))
    for (const seal of sealsData) {
      if (!seal.flow_id) continue
      if (ownerKeys.has(seal.client_id || '__ELOS__')) continue
      const req = await flowRequiredDocIds(seal.flow_id)
      if (!req.length) continue
      const key = seal.client_id || '__ELOS__'
      const idxByType = {}
      fullDocList.forEach((d, i) => { idxByType[String(d.type)] = i })
      const missing = req.map(String).filter(t => idxByType[t] === undefined)
      let names = {}
      if (missing.length) {
        const { data: cat } = await supabase
          .from('documents_catalog').select('id, name').in('id', missing.map(Number))
        names = Object.fromEntries((cat || []).map(r => [String(r.id), r.name]))
      }
      for (const idNum of req) {
        const t = String(idNum)
        if (idxByType[t] !== undefined) {
          const d = fullDocList[idxByType[t]]
          const rb = new Set(d.required_by || [])
          rb.add(key)
          fullDocList[idxByType[t]] = { ...d, required_by: [...rb] }
        } else {
          fullDocList.push({
            id: `req-${t}`, supplier_id: supplierId, type: t,
            label: names[t] || `Documento ${t}`, status: 'MISSING', source: 'REQUIRED',
            storage_path: null, created_at: null, required_by: [key],
          })
        }
      }
    }

    // Ordena: docs enviados primeiro, depois os faltantes; alfabético dentro de cada grupo
    fullDocList.sort((a, b) => {
      if (a.status === 'MISSING' && b.status !== 'MISSING') return 1
      if (a.status !== 'MISSING' && b.status === 'MISSING') return -1
      return (a.label||'').localeCompare(b.label||'', 'pt-BR')
    })

    let categories = catRes.status === 'fulfilled'
      ? (catRes.value.data || []).map(r => r.categories).filter(Boolean)
      : []
    // CNAE vinculado à categoria (item 8, 09/09): cópias por cliente não têm
    // código — resolve pela categoria GLOBAL homônima
    const semCodigo = categories.filter(c => !c.codigo && c.client_id)
    if (semCodigo.length) {
      const { data: globs } = await supabase.from('categories')
        .select('name, codigo').is('client_id', null).not('codigo', 'is', null)
        .in('name', [...new Set(semCodigo.map(c => c.name))])
      const byName = Object.fromEntries((globs || []).map(g => [g.name.trim().toLowerCase(), g.codigo]))
      categories = categories.map(c => c.codigo ? c : { ...c, codigo: byName[(c.name || '').trim().toLowerCase()] || null })
    }

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

  // Reverter a decisão de UM documento (aprovado/reprovado/não se aplica) —
  // volta para análise; só o backoffice (admin-update-document valida ADMIN)
  revertDocumentDecision: async (documentId, motivo) => {
    const res = await authFetch('/.netlify/functions/admin-update-document', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId, action: 'revert_decision', note: motivo }),
    })
    const out = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(out.error || `Erro ${res.status}`)
    return out
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
  listDocumentsForAnalysis: async ({ docType, supplierSearch, clientName, status: statusFilter, queue, expiresUntil, sugestao, prioritario, sortBy = 'due_asc', page = 0, pageSize = 50 } = {}) => {
    // RPC admin_list_documents (patch_069): a fila só traz documentos de
    // fornecedores com processo OPERÁVEL (selo ACTIVE/PENDING de cliente
    // ATIVO ou selo ELOS) — suspensos e clientes inativos do HOC ficam
    // fora. Também elimina o custo de RLS por linha (ilike não-leakproof).
    const { data, error } = await supabase.rpc('admin_list_documents', {
      p_doc_type:      docType ? String(docType) : null,
      p_status:        statusFilter || 'todos',
      p_queue:         queue || 'todos',
      p_expires_until: expiresUntil || null,
      p_search:        supplierSearch?.trim() || null,
      p_sort:          sortBy,
      p_page:          page,
      p_size:          pageSize,
      // filtro por sugestão da automação (patch_111) — só enviado quando usado,
      // para não quebrar a RPC onde o patch ainda não foi aplicado
      ...(sugestao ? { p_sugestao: sugestao } : {}),
      ...(prioritario ? { p_prioritario: true } : {}),   // patch_113
    })
    if (error) throw new Error(error.message)
    return { rows: data?.rows || [], total: data?.total || 0, page, pageSize }
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

  // Pendências de MOBILIDADE (documentos de PF): documento que o fornecedor
  // ainda não enviou não tem linha em documents, então não aparece na esteira
  // — este RPC revela os processos operáveis com pessoas/documentos de PF
  // faltando, para nada parecer pronto sem estar (patch_097)
  getMobilityPending: async () => {
    const { data, error } = await supabase.rpc('admin_mobility_pending')
    if (error) throw new Error(error.message)
    if (data && data.error) throw new Error(data.error)
    return Array.isArray(data) ? data : []
  },

  getDocumentFarol: async () => {
    // RPC admin_document_farol (patch_074): FILA DO ANALISTA fiel ao HOC —
    // docs AGUARDANDO ANÁLISE de fornecedor que completou a parte dele,
    // em buckets pela DATA-LIMITE de análise (envio + 3 dias úteis)
    const { data, error } = await supabase.rpc('admin_document_farol')
    if (error) throw new Error(error.message)
    const passados = data?.passados || [], hoje = data?.hoje || [], futuros = data?.futuros || []
    return { passados, hoje, futuros, all: [...passados, ...hoje, ...futuros] }
  },

  // Relatórios (patch_071): funil da Campanha Primeiro Acesso e dashboard
  // executivo — agregados server-side (auth.users não é alcançável via RLS)
  getCampaignFunnel: async () => {
    const { data, error } = await supabase.rpc('admin_campaign_funnel')
    if (error) throw new Error(error.message)
    return data
  },
  getExecDashboard: async () => {
    const { data, error } = await supabase.rpc('admin_exec_dashboard')
    if (error) throw new Error(error.message)
    return data
  },

  getMetrics: async () => {
    // Contagens EXATAS via RPC admin_metrics (patch_057) — o count 'estimated'
    // do PostgREST usava estatísticas defasadas (37k vs 55,8k reais).
    // MRR/receita: só assinaturas Stripe (planos HOC migrados não têm receita).
    const [rpcRes, planRes] = await Promise.allSettled([
      supabase.rpc('admin_metrics'),
      supabase.from('plans').select('type, price_yearly').eq('status', 'ACTIVE').eq('source', 'STRIPE'),
    ])
    const m     = rpcRes.status === 'fulfilled' ? (rpcRes.value.data || {}) : {}
    const seals = m.seals_by_status || {}
    const planData = planRes.status === 'fulfilled' ? (planRes.value.data || []) : []

    const mrrOf = p => p.type?.includes('mensal')
      ? Number(p.price_yearly || 0)
      : Number(p.price_yearly || 0) / 12
    const mrrBrl = planData.reduce((acc, p) => acc + mrrOf(p), 0)
    const byPlan = {}
    for (const p of planData) {
      const k = planLabel(p.type) || p.type || '—'
      byPlan[k] = byPlan[k] || { count: 0, rev: 0 }
      byPlan[k].count++
      byPlan[k].rev += mrrOf(p)
    }

    return {
      totalSuppliers:  m.suppliers_total || 0,
      newThisMonth:    m.suppliers_new_month || 0,
      activeSeals:     seals.ACTIVE?.fornecedores || 0,   // fornecedores homologados (distintos)
      activeProcesses: seals.ACTIVE?.processos    || 0,   // processos (1 por cliente)
      pendingAnalysis: seals.PENDING?.fornecedores || 0,
      sealsByStatus:   seals,
      mrrBrl,
      byPlan,
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
    // categoria GERAL (raiz com subcategorias) não é gravada — só agrupa
    // (05/10, ver create-supplier); raiz sem subcategorias é escolha válida
    const { data: raizes } = await supabase.from('categories').select('id').in('id', categoryIds).is('parent_id', null)
    const ids = (raizes || []).map(r => r.id)
    const { data: filhos } = ids.length
      ? await supabase.from('categories').select('parent_id').in('parent_id', ids)
      : { data: [] }
    const fora = new Set((filhos || []).map(f => f.parent_id))
    categoryIds = categoryIds.filter(c => !fora.has(Number(c)) && !fora.has(c))
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

// ── Mobilidade (SPEC_MOBILIDADE.md) ──────────────────────────────────────────
// Documentos de PF por posto/pessoa. O upload é um `documents` comum com
// type composto: 'mob:<docId>:p:<personId>' (escopo pessoa) ou
// 'mob:<docId>:s:<postId>' (escopo posto) — respeita o UNIQUE(supplier,type).
export const mobilityApi = {
  docTypeKey: (docId, escopo, targetId) =>
    `mob:${docId}:${escopo === 'pessoa' ? 'p' : 's'}:${targetId}`,

  maskCpf: (digits) => {
    const d = String(digits || '').replace(/\D/g, '')
    return d.length === 11 ? `***.***.*${d.slice(8, 9)}-${d.slice(9)}` : '***'
  },

  validCpf: (value) => {
    const d = String(value || '').replace(/\D/g, '')
    if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
    for (const len of [9, 10]) {
      let sum = 0
      for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i)
      const dv = ((sum * 10) % 11) % 10
      if (dv !== Number(d[len])) return false
    }
    return true
  },

  // Postos abertos para o fornecedor (RLS: match por supplier_id ou CNPJ)
  myPosts: async (supplierCnpj) => {
    const { data, error } = await supabase
      .from('mobility_posts')
      .select('id, client_id, category_id, site_city, site_uf, armado, qty_posts, qty_people, funcao_label, clients(razao_social, nome_fantasia), categories(id, name)')
      .eq('supplier_cnpj', supplierCnpj)
      .eq('active', true)
      .order('site_city')
    if (error) throw new Error(error.message)
    return data || []
  },

  // Matriz de mobilidade das categorias dos postos
  matrixFor: async (categoryIds) => {
    if (!categoryIds.length) return []
    const { data, error } = await supabase
      .from('category_mobility_documents')
      .select('category_id, document_id, escopo, required, blocking, documents_catalog(id, name)')
      .in('category_id', categoryIds)
    if (error) throw new Error(error.message)
    return data || []
  },

  listPeople: async (postIds) => {
    if (!postIds.length) return []
    const { data, error } = await supabase
      .from('mobility_people')
      .select('id, post_id, nome, cpf_digits, active')
      .in('post_id', postIds)
      .eq('active', true)
      .order('nome')
    if (error) throw new Error(error.message)
    return data || []
  },

  addPerson: async ({ postId, supplierId, nome, cpf }) => {
    const cpfDigits = String(cpf || '').replace(/\D/g, '')
    if (!mobilityApi.validCpf(cpfDigits)) throw new Error('CPF inválido — confira os dígitos.')
    const { data, error } = await supabase
      .from('mobility_people')
      .insert({ post_id: postId, supplier_id: supplierId, nome: nome.trim(), cpf_digits: cpfDigits })
      .select('id, post_id, nome, cpf_digits, active').single()
    if (error) throw new Error(error.code === '23505'
      ? 'Este CPF já está cadastrado neste posto.' : error.message)
    return data
  },

  removePerson: async (personId) => {
    // inativa (substituição de colaborador) — docs ficam no histórico
    const { error } = await supabase
      .from('mobility_people').update({ active: false }).eq('id', personId)
    if (error) throw new Error(error.message)
  },

  // Completude da mobilidade do fornecedor — mesma regra do servidor
  // (lib/required_docs.js mobilityPending): pessoas cadastradas >= vagas e
  // todos os docs exigidos (pessoa/posto) aprovados. Fornecedor sem posto
  // aberto é 'completo' por definição. Usado nos avisos das telas.
  pendingFor: async (supplierCnpj, supplierId) => {
    const vazio = { posts: 0, peopleShortfall: 0, docsMissing: 0, complete: true }
    if (!supplierCnpj || !supplierId) return vazio
    const posts = await mobilityApi.myPosts(supplierCnpj)
    if (!posts.length) return vazio
    const [matrix, people] = await Promise.all([
      mobilityApi.matrixFor([...new Set(posts.map(p => p.category_id))]),
      mobilityApi.listPeople(posts.map(p => p.id)),
    ])
    const REGISTRO_ARMA = 10017
    const keys = []
    let peopleShortfall = 0
    for (const post of posts) {
      const pPeople = people.filter(p => p.post_id === post.id)
      peopleShortfall += Math.max(0, post.qty_people - pPeople.length)
      for (const m of matrix.filter(x => x.category_id === post.category_id && x.required)) {
        if (m.escopo === 'posto') {
          if (m.document_id === REGISTRO_ARMA && !post.armado) continue
          keys.push(mobilityApi.docTypeKey(m.document_id, 'posto', post.id))
        } else {
          for (const p of pPeople) keys.push(mobilityApi.docTypeKey(m.document_id, 'pessoa', p.id))
        }
      }
    }
    const byType = {}
    for (let i = 0; i < keys.length; i += 200) {
      const { data } = await supabase.from('documents').select('type, status')
        .eq('supplier_id', supplierId).in('type', keys.slice(i, i + 200))
      for (const d of (data || [])) byType[d.type] = d.status
    }
    const docsMissing = keys.filter(k => !['VALID', 'NOT_APPLICABLE'].includes(byType[k])).length
    return {
      posts: posts.length, peopleShortfall, docsMissing,
      complete: peopleShortfall === 0 && docsMissing === 0,
    }
  },
}

// ── Homologação automática — Rota A (SPEC_HOMOLOGACAO_AUTOMATICA.md) ─────────
// Fila da coleta nas fontes oficiais. Só leitura no browser: quem enfileira e
// processa é o servidor (create-supplier + homolog-collect-background).
export const ROUTE_A_ENABLED = import.meta.env.VITE_ROUTE_A_ENABLED === 'true'

export const routeAApi = {
  // doc_type → { status, attempts, last_error } (o job mais recente por tipo)
  jobsFor: async (supplierId) => {
    if (!ROUTE_A_ENABLED || !supplierId) return {}
    const { data, error } = await supabase.from('auto_collect_jobs')
      .select('doc_type, status, attempts, last_error, created_at')
      .eq('supplier_id', supplierId).order('created_at', { ascending: true })
    if (error) { console.warn('auto_collect_jobs:', error.message); return {} }
    return Object.fromEntries((data || []).map(j => [j.doc_type, j]))
  },

  // Backoffice: fila completa da coleta de um fornecedor (quadro "Coleta
  // automática" — evidência da Rota A: fonte, situação, tentativas, custo)
  collectJobs: async (supplierId) => {
    if (!ROUTE_A_ENABLED || !supplierId) return []
    const { data, error } = await supabase.from('auto_collect_jobs')
      .select('id, seal_id, doc_type, fonte, status, attempts, next_attempt_at, last_error, cost_brl, history, created_at, finished_at')
      .eq('supplier_id', supplierId).order('doc_type')
    if (error) { console.warn('auto_collect_jobs:', error.message); return [] }
    const ids = [...new Set((data || []).map(j => Number(j.doc_type)).filter(Boolean))]
    const { data: cat } = ids.length ? await supabase.from('documents_catalog').select('id, name').in('id', ids) : { data: [] }
    const nome = Object.fromEntries((cat || []).map(c => [String(c.id), c.name]))
    return (data || []).map(j => ({ ...j, doc_name: nome[j.doc_type] || null }))
  },
}

// ── Rota B — pré-análise por IA (SPEC_ROTA_B.md, patch_109) ─────────────────
// Só o backoffice lê (RLS: is_admin). O fornecedor não vê a sugestão da IA.
export const ROUTE_B_ENABLED = import.meta.env.VITE_ROUTE_B_ENABLED === 'true'

export const routeBApi = {
  // todas as pré-análises do fornecedor (a mais recente primeiro), com o nome do tipo
  reviews: async (supplierId) => {
    if (!ROUTE_B_ENABLED || !supplierId) return []
    const { data, error } = await supabase.from('ai_review_jobs')
      .select('id, document_id, doc_type, storage_path, status, attempts, last_error, verdict, confidence, result, input_mode, pages, model, prompt_version, cost_brl, requested_by, created_at, finished_at, analyst_decision, analyst_note, decided_at')
      .eq('supplier_id', supplierId).order('created_at', { ascending: false })
    if (error) { console.warn('ai_review_jobs:', error.message); return [] }
    const ids = [...new Set((data || []).map(j => Number(j.doc_type)).filter(Boolean))]
    const { data: cat } = ids.length ? await supabase.from('documents_catalog').select('id, name').in('id', ids) : { data: [] }
    const nome = Object.fromEntries((cat || []).map(c => [String(c.id), c.name]))
    return (data || []).map(j => ({ ...j, doc_name: nome[j.doc_type] || null }))
  },

  // pré-análise mais recente de cada documento (fila de análise)
  latestByDocument: async (documentIds) => {
    if (!ROUTE_B_ENABLED || !documentIds?.length) return {}
    const { data, error } = await supabase.from('ai_review_jobs')
      .select('id, document_id, storage_path, status, verdict, confidence, result, last_error, created_at')
      .in('document_id', documentIds).order('created_at', { ascending: true })
    if (error) { console.warn('ai_review_jobs:', error.message); return {} }
    return Object.fromEntries((data || []).map(j => [j.document_id, j]))
  },

  // tipos de documento com pré-análise ligada (route B e fora do modo manual)
  enabledTypes: async () => {
    if (!ROUTE_B_ENABLED) return new Set()
    const { data } = await supabase.from('documents_catalog').select('id')
      .eq('route', 'B').neq('validation_mode', 'manual')
    return new Set((data || []).map(d => String(d.id)))
  },

  // analista pede (re)análise de um documento — dispara o processador na hora
  request: async (documentId) => {
    const res = await authFetch('/.netlify/functions/homolog-ai-review-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId }),
    })
    const out = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(out.error || `Erro ${res.status}`)
    return out
  },
}

// ── Cliente (HOC) ─────────────────────────────────────────────────────────────
export const clientApi = {
  // Dashboard KPIs (05/10): mesma base de "Meus Fornecedores" — processos
  // (selos do cliente, inclusive os migrados do HOC, que não têm convite) +
  // convites. Antes contava só convites: MVV/Appian, com 500+ homologados
  // vindos do HOC, viam tudo zerado.
  getDashboard: async (clientId) => {
    // em paralelo: lista (RPC, patch_118) e convites ainda sem cadastro
    const [items, { data: abertos, error }] = await Promise.all([
      clientApi.getSuppliers(clientId),
      supabase.from('invitations')
        .select('id, status, subsidiado, supplier_razao_social, supplier_cnpj, created_at')
        .eq('client_id', clientId)
        .in('status', ['SENT', 'VIEWED'])
        .order('created_at', { ascending: false }),
    ])
    if (error) throw new Error(error.message)

    const situacao = clientSealStatus
    const conta = st => items.filter(i => situacao(i.seal) === st).length

    // recentes: convites abertos e processos, do mais novo para o mais antigo
    const recentes = [
      ...(abertos || []).map(inv => ({
        key: `inv-${inv.id}`, name: inv.supplier_razao_social, cnpj: inv.supplier_cnpj,
        subsidiado: !!inv.subsidiado, quando: inv.created_at,
        status: inv.status === 'VIEWED' ? 'VIEWED' : 'SENT',
      })),
      ...items.map(i => ({
        key: `sup-${i.supplierId}`, name: i.supplier?.razao_social || i.inviteRazaoSocial,
        cnpj: i.supplier?.cnpj || i.inviteCnpj, city: i.supplier?.city, state: i.supplier?.state,
        subsidiado: i.subsidiado, quando: i.invitedAt || i.seal?.issued_at || null,
        status: situacao(i.seal), score: i.seal?.score,
      })),
    ].sort((a, b) => String(b.quando || '').localeCompare(String(a.quando || ''))).slice(0, 5)

    return {
      recentes,
      total:          items.length,
      convitesAbertos: (abertos || []).length,
      homologados:    conta('ACTIVE'),
      emAnalise:      conta('PENDING'),
      aguardandoPagamento: conta('PAGAMENTO'),
      subsidiados:    items.filter(i => i.subsidiado).length + (abertos || []).filter(i => i.subsidiado).length,
      cartasExcecao:  items.filter(i => i.cartaExcecao).length,
    }
  },

  // Análise prioritária (patch_113): o cliente pede urgência num processo em
  // análise — antes era chamado no HOC. Fica no log do processo.
  requestPriority: async (sealId, note) => {
    const { data, error } = await supabase.rpc('request_priority_analysis', { p_seal: sealId, p_note: note || null })
    if (error) throw new Error(error.message)
    return data
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
        .eq('supplier_id', supplierId).eq('client_id', clientId)
        .order('created_at', { ascending: false }).limit(1).maybeSingle(),   // vários convites (histórico do HOC)
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
    // Uma chamada (patch_118, 05/10): a RPC client_suppliers_overview cruza no
    // banco selos do cliente (inclui os migrados do HOC) + convite de referência
    // + carta de exceção. Antes a lista era montada aqui baixando TODOS os
    // convites em páginas de 1.000 em série — com o histórico do HOC a Appian
    // tem 10,8 mil convites e a tela levava segundos. O cliente vem da sessão
    // (auth.uid()); clientId fica na assinatura por compatibilidade.
    void clientId
    const { data, error } = await supabase.rpc('client_suppliers_overview')
    if (error) throw new Error(error.message)
    return (data || []).map(r => {
      const seal = r.seal, invite = r.invite
      return {
        inviteId:          invite?.id || null,
        supplierId:        r.supplier_id,
        subsidiado:        invite?.subsidiado || false,
        tipo:              invite?.tipo_fornecedor || null,
        escopo:            invite?.escopo || null,
        invitedAt:         invite?.created_at || null,
        inviteRazaoSocial: invite?.supplier_razao_social || null,
        inviteCnpj:        invite?.supplier_cnpj || null,
        supplier:          r.supplier || null,
        seal:              seal || { status: 'PENDING', score: 0 },
        flowId:            seal?.flow_id || invite?.flow_id || null,   // nível/pacote do cliente
        cartaExcecao:      !!r.carta,
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
      .select('*, clients(razao_social), questionnaire_questions(id, text, type, options, required, order_index, compliance_alert)')
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

  addQuestion: async (questionnaireId, { text, type, options, required, orderIndex, complianceAlert }) => {
    const { data, error } = await supabase
      .from('questionnaire_questions')
      .insert({ questionnaire_id: questionnaireId, text, type, options: options || null,
                required: required ?? true, order_index: orderIndex || 0,
                compliance_alert: complianceAlert?.length ? complianceAlert : null })
      .select().single()
    if (error) throw new Error(error.message)
    return data
  },

  // Edição de pergunta (18/09) — inclui a regra de alerta de compliance
  updateQuestion: async (id, { text, type, options, required, complianceAlert }) => {
    const { error } = await supabase
      .from('questionnaire_questions')
      .update({ text, type, options: options || null, required: required ?? true,
                compliance_alert: complianceAlert?.length ? complianceAlert : null })
      .eq('id', id)
    if (error) throw new Error(error.message)
  },

  removeQuestion: async (id) => {
    const { error } = await supabase.from('questionnaire_questions').delete().eq('id', id)
    if (error) throw new Error(error.message)
  },

  // Supplier: busca questionários dos clientes que o convidaram
  getForSupplier: async (supplierId) => {
    // clientes do fornecedor = convites + PROCESSOS (06/10): quem entra pelo
    // portal do cliente não tem convite e não via o questionário — e sem ele
    // respondido o processo nunca entra na fila de análise
    const [{ data: invites }, { data: procs }] = await Promise.all([
      supabase.from('invitations').select('client_id')
        .eq('supplier_id', supplierId)
        .or('hoc_id.is.null,status.eq.REGISTERED'),   // do HOC, só o que virou processo (patch_116)
      supabase.from('seals').select('client_id')
        .eq('supplier_id', supplierId).not('client_id', 'is', null),
    ])
    const clientIds = [...new Set([...(invites || []), ...(procs || [])].map(i => i.client_id).filter(Boolean))]
    if (!clientIds.length) return []
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
    // paginado (01/10): sem isso a lista parava em 1000 convites. 05/10: com o
    // histórico do HOC (Appian 10,8 mil) as páginas vêm EM PARALELO — a 1ª traz
    // o total; desempate por id deixa a paginação estável (sem repetir/omitir)
    const pagina = (from, count) => supabase
      .from('invitations')
      .select('*', count ? { count: 'exact' } : undefined)
      .eq('client_id', clientId)
      .neq('status', 'SUPERSEDED')   // reconvite substitui o anterior (21/09)
      .order('created_at', { ascending: false }).order('id')
      .range(from, from + 999)
    const { data: primeira, count, error } = await pagina(0, true)
    if (error) throw new Error(error.message)
    const resto = []
    for (let from = 1000; from < (count || 0); from += 1000) resto.push(pagina(from))
    const out = [...(primeira || [])]
    for (const { data, error: e } of await Promise.all(resto)) {
      if (e) throw new Error(e.message)
      out.push(...(data || []))
    }
    return out
  },

  // Envia convite (BUYER: simples | CLIENT/ADMIN: enriquecido)
  send: async (payload, token) => {
    // authFetch (05/10): renova a sessão antes e repete 1x se o servidor recusar
    // (401, nada foi gravado) — tela aberta há mais de 1 h mandava token vencido
    // e o convite falhava com "Token inválido" sem deixar rastro. `token` fica
    // na assinatura só por compatibilidade com quem chama.
    void token
    const res = await authFetch('/.netlify/functions/send-invitation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Erro ao enviar convite')
    return data
  },

  // Reenvia e-mail de convite existente
  resend: async (inviteId, token) => {
    // authFetch (05/10): renova a sessão antes e repete 1x se o servidor recusar
    // (401, nada foi gravado) — tela aberta há mais de 1 h mandava token vencido
    // e o convite falhava com "Token inválido" sem deixar rastro. `token` fica
    // na assinatura só por compatibilidade com quem chama.
    void token
    const res = await authFetch('/.netlify/functions/send-invitation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resendId: inviteId }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Erro ao reenviar convite')
    return data
  },

  // Cancela convite enviado errado (patch_103) — não apaga, fica CANCELLED
  cancel: async (inviteId, reason) => {
    const res = await authFetch('/.netlify/functions/invitation-cancel', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inviteId, reason }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Erro ao cancelar convite')
    return data
  },

  // Padrão do campo "Subsidiado?" (28/09): SIM quando o cliente opera no
  // modelo subsidiado (algum fluxo ativo com preço subsidiado)
  subsidyDefault: async (clientId) => {
    if (!clientId) return false
    const { data } = await supabase.from('client_flows').select('id')
      .eq('client_id', clientId).eq('active', true).not('price_subsidized', 'is', null).limit(1)
    return (data || []).length > 0
  },

  // Busca convite por token (sem auth — usado no onboarding)
  getByToken: async (token) => {
    const res = await fetch(`/.netlify/functions/get-invitation?token=${token}`)
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Convite inválido')
    return data
  },
}
