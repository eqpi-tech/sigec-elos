// netlify/functions/client-upload-document.js
// CLIENTE anexa documento de responsabilidade DELE no processo do fornecedor
// (documents_catalog.responsibility = 'cliente' — ex.: Laudo Técnico da
// GETEC no fluxo VIX, doc #10015 "Pode ser anexado por nós?").
// POST { supplierId, docTypeId, file { name, mime, base64 } }
// Quem: CLIENT com processo (selo) com o fornecedor, ou ADMIN.
// O documento entra PENDING — o backoffice valida como os demais.

const { createClient } = require('@supabase/supabase-js')

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)
const HEADERS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' }

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: HEADERS, body: '' }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) }

  const token = (event.headers.authorization || '').replace('Bearer ', '')
  if (!token) return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: 'Token ausente' }) }
  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token)
  if (authErr || !user) return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: 'Token inválido' }) }

  let body
  try { body = JSON.parse(event.body) } catch { return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'JSON inválido' }) } }
  const { supplierId, docTypeId, file } = body
  if (!supplierId || !docTypeId || !file?.base64)
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'supplierId, docTypeId e file são obrigatórios' }) }

  try {
    // Papel: ADMIN ou CLIENT com processo com o fornecedor
    const { data: roles } = await supabaseAdmin
      .from('user_roles').select('role, client_id').eq('user_id', user.id)
    const isAdmin   = (roles || []).some(r => r.role === 'ADMIN')
    const clientIds = (roles || []).filter(r => r.role === 'CLIENT' && r.client_id).map(r => r.client_id)

    if (!isAdmin) {
      if (!clientIds.length)
        return { statusCode: 403, headers: HEADERS, body: JSON.stringify({ error: 'Apenas clientes do processo podem anexar' }) }
      const { data: procSeal } = await supabaseAdmin
        .from('seals').select('id').eq('supplier_id', supplierId).in('client_id', clientIds).limit(1)
      if (!procSeal?.length)
        return { statusCode: 403, headers: HEADERS, body: JSON.stringify({ error: 'Sua empresa não tem processo com este fornecedor' }) }
    }

    // Só documentos de responsabilidade do CLIENTE
    const { data: cat } = await supabaseAdmin
      .from('documents_catalog').select('id, name, responsibility').eq('id', docTypeId).maybeSingle()
    if (!cat) throw new Error('Tipo de documento não encontrado')
    if (cat.responsibility !== 'cliente' && !isAdmin)
      return { statusCode: 403, headers: HEADERS, body: JSON.stringify({ error: 'Este documento não é de responsabilidade do cliente' }) }

    const buffer = Buffer.from(file.base64, 'base64')
    if (buffer.length > 4.5 * 1024 * 1024)
      return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Arquivo acima de 4,5MB' }) }

    const ext  = (file.name || 'doc.pdf').split('.').pop().toLowerCase()
    const path = `client-docs/${supplierId}/${docTypeId}_${Date.now()}.${ext}`
    const { error: upErr } = await supabaseAdmin.storage
      .from('documents')
      .upload(path, buffer, { upsert: true, contentType: file.mime || 'application/pdf' })
    if (upErr) throw new Error('Erro no storage: ' + upErr.message)

    const { error: docErr } = await supabaseAdmin.from('documents').upsert({
      supplier_id:  supplierId,
      type:         String(docTypeId),
      label:        cat.name,
      source:       'MANUAL',
      status:       'PENDING',
      storage_path: path,
      review_note:  null,
    }, { onConflict: 'supplier_id,type' })
    if (docErr) throw new Error(docErr.message)

    await supabaseAdmin.from('audit_log').insert({
      user_id: user.id, action: 'CLIENT_DOC_UPLOADED',
      entity_type: 'supplier', entity_id: supplierId,
      metadata: { doc_type: docTypeId, doc_name: cat.name, file: file.name },
    }).catch(() => {})

    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: true, storage_path: path }) }
  } catch (err) {
    console.error('[client-upload-document]', err)
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) }
  }
}
