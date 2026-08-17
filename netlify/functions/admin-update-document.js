// netlify/functions/admin-update-document.js
// Ações do backoffice sobre documentos já enviados (paridade com o HOC):
//   action 'set_expiry'    — altera a data de vencimento (renova doc vencido)
//   action 'replace_file'  — substitui o arquivo (base64) e opcionalmente a data
// Ambas recalculam o score dos selos. O trigger de document_history registra
// o snapshot automaticamente.
//
// POST body:
//   documentId  string  UUID do documento
//   action      string  'set_expiry' | 'replace_file'
//   expiresAt   string  ISO date (obrigatório p/ set_expiry, opcional p/ replace_file)
//   note        string  observação do analista
//   file        { name, mime, base64 }  (obrigatório p/ replace_file, máx ~4MB)

const { createClient } = require('@supabase/supabase-js')

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: HEADERS, body: '' }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) }

  const token = (event.headers.authorization || '').replace('Bearer ', '')
  if (!token) return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: 'Token ausente' }) }

  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token)
  if (authErr || !user) return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: 'Token inválido' }) }

  const { data: roleRow } = await supabaseAdmin
    .from('user_roles').select('role').eq('user_id', user.id).eq('role', 'ADMIN').maybeSingle()
  if (!roleRow) return { statusCode: 403, headers: HEADERS, body: JSON.stringify({ error: 'Acesso negado' }) }

  let body
  try { body = JSON.parse(event.body) } catch {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'JSON inválido' }) }
  }
  const { documentId, action, expiresAt, note, file } = body
  if (!documentId || !['set_expiry', 'replace_file'].includes(action))
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: "documentId e action ('set_expiry'|'replace_file') são obrigatórios" }) }
  if (action === 'set_expiry' && !expiresAt)
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'expiresAt é obrigatório para set_expiry' }) }
  if (action === 'replace_file' && !file?.base64)
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'file { name, mime, base64 } é obrigatório para replace_file' }) }

  try {
    const { data: doc, error: docErr } = await supabaseAdmin
      .from('documents')
      .select('id, supplier_id, type, label, status, storage_path, suppliers(user_id)')
      .eq('id', documentId).single()
    if (docErr || !doc) throw new Error(docErr?.message || 'Documento não encontrado')

    const nowIso = new Date().toISOString()
    const updatePayload = {
      reviewed_by: user.id,
      reviewed_at: nowIso,
    }
    if (note) updatePayload.review_note = note

    if (action === 'replace_file') {
      const buffer = Buffer.from(file.base64, 'base64')
      if (buffer.length > 4.5 * 1024 * 1024)
        return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Arquivo acima de 4,5MB — reduza o tamanho' }) }

      // Mantém o arquivo na pasta do usuário do fornecedor, preservando a
      // política de leitura do próprio fornecedor no bucket
      const ext    = (file.name || 'documento.pdf').split('.').pop().toLowerCase()
      const folder = doc.suppliers?.user_id || doc.supplier_id
      const path   = `${folder}/${doc.type}_${Date.now()}.${ext}`

      const { error: upErr } = await supabaseAdmin.storage
        .from('documents')
        .upload(path, buffer, { upsert: true, contentType: file.mime || 'application/pdf' })
      if (upErr) throw new Error('Erro no storage: ' + upErr.message)

      const { data: urlData } = await supabaseAdmin.storage
        .from('documents').createSignedUrl(path, 3600)

      updatePayload.storage_path = path
      updatePayload.public_url   = urlData?.signedUrl || ''
      updatePayload.source       = 'MANUAL'
      updatePayload.metadata     = { originalName: file.name, size: buffer.length, mime: file.mime, replacedBy: user.id, replacedAt: nowIso }
      if (!note) updatePayload.review_note = 'Documento substituído pelo backoffice'
      // Substituição pelo analista já é verificada → documento válido
      updatePayload.status = 'VALID'
      if (expiresAt) updatePayload.expires_at = expiresAt
    }

    if (action === 'set_expiry') {
      updatePayload.expires_at = expiresAt
      // Nova data no futuro revalida doc vencido/a vencer; no passado, vence
      const future = new Date(expiresAt) > new Date()
      if (['EXPIRED', 'EXPIRING'].includes(doc.status) || (doc.status === 'VALID' && !future))
        updatePayload.status = future ? 'VALID' : 'EXPIRED'
    }

    const { data: updated, error: updErr } = await supabaseAdmin
      .from('documents')
      .update(updatePayload)
      .eq('id', documentId)
      .select('id, status, expires_at, storage_path')
      .single()
    if (updErr) throw new Error(updErr.message)

    await recalcSealScores(supabaseAdmin, doc.supplier_id).catch(e =>
      console.warn('[admin-update-document] recalc scores:', e.message))

    await supabaseAdmin.from('audit_log').insert({
      actor_id: user.id,
      action:   action === 'replace_file' ? 'DOCUMENT_REPLACED' : 'DOCUMENT_EXPIRY_CHANGED',
      target_type: 'document',
      target_id: documentId,
      details: { supplier_id: doc.supplier_id, label: doc.label, expiresAt: expiresAt || null, note: note || null },
    }).catch(() => {})

    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ updated: true, document: updated }) }
  } catch (err) {
    console.error('[admin-update-document]', err)
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) }
  }
}

// Mesmo cálculo do admin-approve-document: denominador por selo
// (categorias do cliente → fluxos ativos do cliente → global)
async function recalcSealScores(sb, supplierId) {
  const [{ data: seals }, { data: allDocs }, { data: catRows }] = await Promise.all([
    sb.from('seals').select('id, client_id').eq('supplier_id', supplierId),
    sb.from('documents').select('type, status').eq('supplier_id', supplierId),
    sb.from('supplier_categories').select('category_id, categories(id, client_id)').eq('supplier_id', supplierId),
  ])
  if (!seals?.length) return

  const catToOwner = {}
  for (const r of (catRows || []))
    catToOwner[r.category_id] = r.categories?.client_id || 'global'

  const allCatIds = Object.keys(catToOwner).map(Number)
  const reqByOwner = {}
  for (let i = 0; i < allCatIds.length; i += 200) {
    const { data: cdRows } = await sb
      .from('category_documents')
      .select('category_id, document_id')
      .in('category_id', allCatIds.slice(i, i + 200))
    for (const r of (cdRows || [])) {
      const owner = catToOwner[r.category_id] || 'global'
      ;(reqByOwner[owner] = reqByOwner[owner] || new Set()).add(r.document_id)
    }
  }

  const validTypes = new Set((allDocs || []).filter(d => d.status === 'VALID' || d.status === 'NOT_APPLICABLE').map(d => String(d.type)))

  for (const seal of seals) {
    const owner = seal.client_id || 'global'
    let req = [...(reqByOwner[owner] || [])]
    if (!req.length && seal.client_id) {
      // Fallback 1: categorias dos fluxos ATIVOS do cliente (patch_043)
      const { data: fcRows } = await sb
        .from('client_flow_categories')
        .select('category_id, client_flows!inner(client_id, active)')
        .eq('client_flows.client_id', seal.client_id)
        .eq('client_flows.active', true)
      const flowCatIds = [...new Set((fcRows || []).map(r => r.category_id))]
      const docSet = new Set()
      for (let i = 0; i < flowCatIds.length; i += 200) {
        const { data: cdRows } = await sb
          .from('category_documents')
          .select('document_id')
          .in('category_id', flowCatIds.slice(i, i + 200))
        for (const r of (cdRows || [])) docSet.add(r.document_id)
      }
      req = [...docSet]
    }
    if (!req.length && seal.client_id) {
      // Fallback 2 (legado): fluxo doc-a-doc
      const { data: flowRows } = await sb
        .from('client_document_flows')
        .select('catalog_id, client_flows!inner(active)')
        .eq('client_id', seal.client_id).eq('required', true)
        .eq('client_flows.active', true)
      req = (flowRows || []).map(r => r.catalog_id)
    }
    if (!req.length) req = [...(reqByOwner['global'] || [])]
    if (!req.length) continue
    const valid = req.filter(id => validTypes.has(String(id))).length
    const score = Math.round((valid / req.length) * 100)
    await sb.from('seals').update({ score }).eq('id', seal.id)
  }
}
