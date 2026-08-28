// netlify/functions/exception-letter.js
// Carta de Exceção: o CLIENTE anexa uma carta aprovando uma CATEGORIA
// específica do processo, mesmo com documento reprovado/faltante.
// O backoffice então pode "Homologar com Exceção" — selo ativo com a
// marca de exceção; outras categorias podem seguir não homologadas.
//
// POST body:
//   action 'upload'  { sealId, categoryId, file {name, mime, base64}, note? }
//       → quem: CLIENT dono do processo (ou ADMIN em nome dele)
//   action 'approve' { sealId, note? }
//       → quem: ADMIN — ativa o selo com exceção (categorias com carta
//         viram EXCEPTION_APPROVED); requer ao menos 1 carta anexada

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
  const { action, sealId, categoryId, file, note } = body
  if (!sealId || !['upload', 'approve'].includes(action))
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: "sealId e action ('upload'|'approve') são obrigatórios" }) }

  try {
    const { data: seal } = await supabaseAdmin
      .from('seals').select('id, supplier_id, client_id, status, seal_name, clients(razao_social)')
      .eq('id', sealId).maybeSingle()
    if (!seal) throw new Error('Processo (selo) não encontrado')

    const { data: roles } = await supabaseAdmin
      .from('user_roles').select('role, client_id').eq('user_id', user.id)
    const isAdmin  = (roles || []).some(r => r.role === 'ADMIN')
    const isOwnerClient = seal.client_id &&
      (roles || []).some(r => r.role === 'CLIENT' && r.client_id === seal.client_id)

    // ── upload da carta (cliente do processo, ou admin em nome dele) ──
    if (action === 'upload') {
      if (!isAdmin && !isOwnerClient)
        return { statusCode: 403, headers: HEADERS, body: JSON.stringify({ error: 'Apenas o cliente do processo pode anexar a carta de exceção' }) }
      if (!categoryId || !file?.base64)
        return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'categoryId e file são obrigatórios' }) }

      const buffer = Buffer.from(file.base64, 'base64')
      if (buffer.length > 4.5 * 1024 * 1024)
        return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Arquivo acima de 4,5MB' }) }

      const ext  = (file.name || 'carta.pdf').split('.').pop().toLowerCase()
      const path = `exception-letters/${sealId}/${categoryId}_${Date.now()}.${ext}`
      const { error: upErr } = await supabaseAdmin.storage
        .from('documents')
        .upload(path, buffer, { upsert: true, contentType: file.mime || 'application/pdf' })
      if (upErr) throw new Error('Erro no storage: ' + upErr.message)

      const { error: rowErr } = await supabaseAdmin.from('supplier_category_approvals').upsert({
        supplier_id:  seal.supplier_id,
        seal_id:      sealId,
        category_id:  categoryId,
        client_id:    seal.client_id,
        status:       'EXCEPTION_REQUESTED',
        letter_path:  path,
        letter_name:  file.name || 'carta.pdf',
        client_note:  note || null,
        requested_by: user.id,
      }, { onConflict: 'seal_id,category_id' })
      if (rowErr) throw new Error(rowErr.message)

      await supabaseAdmin.from('audit_log').insert({
        user_id: user.id, action: 'EXCEPTION_LETTER_UPLOADED',
        entity_type: 'supplier', entity_id: seal.supplier_id,
        metadata: { seal_id: sealId, category_id: categoryId, letter: file.name, note: note || null },
      }).catch(() => {})

      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: true, letter_path: path }) }
    }

    // ── homologar com exceção (só backoffice) ─────────────────────────
    if (!isAdmin)
      return { statusCode: 403, headers: HEADERS, body: JSON.stringify({ error: 'Apenas o backoffice homologa com exceção' }) }

    const { data: letters } = await supabaseAdmin
      .from('supplier_category_approvals')
      .select('id, category_id, categories(name)')
      .eq('seal_id', sealId).eq('status', 'EXCEPTION_REQUESTED')
    if (!letters?.length)
      return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Nenhuma carta de exceção anexada para este processo' }) }

    const catNames = letters.map(l => l.categories?.name || `#${l.category_id}`)
    await supabaseAdmin.from('supplier_category_approvals')
      .update({ status: 'EXCEPTION_APPROVED', approved_by: user.id, approved_at: new Date().toISOString() })
      .in('id', letters.map(l => l.id))

    const endsAt = new Date(); endsAt.setFullYear(endsAt.getFullYear() + 1)
    const { error: sealErr } = await supabaseAdmin.from('seals').update({
      status: 'ACTIVE',
      exception: true,
      exception_note: `Homologado com Exceção a pedido do cliente${seal.clients?.razao_social ? ` ${seal.clients.razao_social}` : ''} — categorias: ${catNames.join(', ')}${note ? ` · ${note}` : ''}`,
      issued_at: new Date().toISOString(),
      expires_at: endsAt.toISOString(),
      issued_by: user.id,
    }).eq('id', sealId)
    if (sealErr) throw new Error(sealErr.message)

    await supabaseAdmin.from('suppliers').update({ status: 'ACTIVE' })
      .eq('id', seal.supplier_id).neq('status', 'SUSPENDED')

    await supabaseAdmin.from('audit_log').insert({
      user_id: user.id, action: 'SEAL_APPROVED_EXCEPTION',
      entity_type: 'supplier', entity_id: seal.supplier_id,
      metadata: { seal_id: sealId, categorias: catNames, note: note || null },
    }).catch(() => {})

    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: true, categorias: catNames }) }
  } catch (err) {
    console.error('[exception-letter]', err)
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) }
  }
}
