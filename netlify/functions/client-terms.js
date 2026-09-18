// netlify/functions/client-terms.js
// GET  → retorna o terms_content do cliente autenticado
// POST → salva terms_content para o cliente autenticado

const { createClient } = require('@supabase/supabase-js')

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const DEFAULT_TERMS = `TERMOS DE USO E CONDIÇÕES DE HOMOLOGAÇÃO

Ao aceitar este convite e iniciar o processo de homologação na plataforma SIGEC-ELOS, o fornecedor declara estar ciente e de acordo com as seguintes condições:

1. DOCUMENTAÇÃO
O fornecedor compromete-se a enviar documentos verdadeiros, atualizados e em conformidade com a legislação vigente. A falsidade de qualquer informação implica cancelamento imediato da homologação.

2. ATUALIZAÇÃO
O fornecedor é responsável por manter seus documentos atualizados. Documentos vencidos resultarão em suspensão do Selo ELOS até regularização.

3. CONFIDENCIALIDADE
As informações fornecidas serão utilizadas exclusivamente para fins de homologação e não serão divulgadas a terceiros sem consentimento prévio.

4. COMPLIANCE
O fornecedor declara não constar em cadastros de empresas sancionadas (CEIS, CNEP) e não possuir impedimentos legais para prestação de serviços.

5. VALIDADE
A homologação tem validade de 12 (doze) meses, podendo ser renovada mediante atualização dos documentos e nova análise.

Ao continuar, você confirma que leu, compreendeu e concorda com todos os termos acima.`

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: HEADERS, body: '' }

  const token = (event.headers.authorization || '').replace('Bearer ', '')
  if (!token) return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: 'Token ausente' }) }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: 'Token inválido' }) }

  // Busca o client_id do usuário
  const { data: roleRow } = await supabase
    .from('user_roles').select('client_id, role, access_profile').eq('user_id', user.id)
    .in('role', ['CLIENT', 'ADMIN']).maybeSingle()
  if (!roleRow) return { statusCode: 403, headers: HEADERS, body: JSON.stringify({ error: 'Acesso negado' }) }
  // Perfil readonly (patch_030) não altera termos
  if (event.httpMethod === 'POST' && roleRow.role === 'CLIENT' && roleRow.access_profile === 'readonly')
    return { statusCode: 403, headers: HEADERS, body: JSON.stringify({ error: 'Seu perfil de acesso é somente leitura' }) }

  if (event.httpMethod === 'GET') {
    // ADMIN pode consultar os termos de qualquer cliente (?clientId=...)
    const qcid = roleRow.role === 'ADMIN'
      ? (event.queryStringParameters?.clientId || roleRow.client_id)
      : roleRow.client_id
    if (!qcid) {
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ terms: DEFAULT_TERMS, isDefault: true }) }
    }
    const { data: client } = await supabase
      .from('clients').select('terms_content').eq('id', qcid).single()
    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({ terms: client?.terms_content || DEFAULT_TERMS, isDefault: !client?.terms_content }),
    }
  }

  if (event.httpMethod === 'POST') {
    let body
    try { body = JSON.parse(event.body) } catch {
      return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'JSON inválido' }) }
    }

    // ── Coleção de itens de aceite (18/09) ────────────────────────────
    // ADMIN pode operar em nome de qualquer cliente (body.clientId);
    // CLIENT sempre no próprio. Ações: items_list · item_save (TEXT) ·
    // item_upload (DOCUMENT base64→storage) · item_toggle · item_delete ·
    // item_view (URL assinada p/ conferir o PDF)
    if (body.action) {
      const cid = roleRow.role === 'ADMIN' ? (body.clientId || roleRow.client_id) : roleRow.client_id
      if (!cid) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Cliente não encontrado' }) }

      if (body.action === 'items_list') {
        const { data: items } = await supabase
          .from('client_terms_items')
          .select('id, title, kind, content, storage_path, file_name, version, required, active, sort, created_at')
          .eq('client_id', cid).order('sort').order('created_at')
        // contagem de aceites por item
        const { data: accs } = await supabase
          .from('client_term_acceptances').select('item_id').eq('client_id', cid)
        const counts = {}
        for (const a of (accs || [])) counts[a.item_id] = (counts[a.item_id] || 0) + 1
        return { statusCode: 200, headers: HEADERS, body: JSON.stringify({
          items: (items || []).map(i => ({ ...i, acceptances: counts[i.id] || 0 })) }) }
      }

      if (body.action === 'item_save') {  // cria/edita item TEXT
        const { id, title, content, required } = body
        if (!title) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Título obrigatório' }) }
        if (id) {
          const { data: cur } = await supabase.from('client_terms_items')
            .select('content, version').eq('id', id).eq('client_id', cid).single()
          if (!cur) return { statusCode: 404, headers: HEADERS, body: JSON.stringify({ error: 'Item não encontrado' }) }
          const bump = cur.content !== content ? cur.version + 1 : cur.version
          const { error } = await supabase.from('client_terms_items')
            .update({ title, content, required: required !== false, version: bump, updated_at: new Date().toISOString() })
            .eq('id', id).eq('client_id', cid)
          if (error) return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: error.message }) }
        } else {
          const { error } = await supabase.from('client_terms_items')
            .insert({ client_id: cid, title, kind: 'TEXT', content, required: required !== false })
          if (error) return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: error.message }) }
        }
        return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ saved: true }) }
      }

      if (body.action === 'item_upload') {  // novo item DOCUMENT (PDF base64)
        const { title, file, required } = body   // file: { name, base64 }
        if (!title || !file?.base64) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Título e arquivo obrigatórios' }) }
        const buf = Buffer.from(file.base64, 'base64')
        if (buf.length > 8 * 1024 * 1024) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Arquivo acima de 8MB' }) }
        const path = `${cid}/${Date.now()}-${(file.name || 'documento.pdf').replace(/[^a-zA-Z0-9._-]/g, '_')}`
        const { error: upErr } = await supabase.storage.from('client-terms')
          .upload(path, buf, { contentType: 'application/pdf', upsert: false })
        if (upErr) return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: upErr.message }) }
        const { error } = await supabase.from('client_terms_items')
          .insert({ client_id: cid, title, kind: 'DOCUMENT', storage_path: path,
                    file_name: file.name || 'documento.pdf', required: required !== false })
        if (error) return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: error.message }) }
        return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ saved: true }) }
      }

      if (body.action === 'item_toggle') {
        const { error } = await supabase.from('client_terms_items')
          .update({ active: !!body.active, updated_at: new Date().toISOString() })
          .eq('id', body.id).eq('client_id', cid)
        if (error) return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: error.message }) }
        return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ saved: true }) }
      }

      if (body.action === 'item_delete') {
        // com aceites registrados o item nunca é apagado — desativa
        const { count } = await supabase.from('client_term_acceptances')
          .select('id', { count: 'exact', head: true }).eq('item_id', body.id)
        if (count > 0) {
          await supabase.from('client_terms_items').update({ active: false }).eq('id', body.id).eq('client_id', cid)
          return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ saved: true, deactivated: true }) }
        }
        const { data: item } = await supabase.from('client_terms_items')
          .select('storage_path').eq('id', body.id).eq('client_id', cid).single()
        await supabase.from('client_terms_items').delete().eq('id', body.id).eq('client_id', cid)
        if (item?.storage_path) await supabase.storage.from('client-terms').remove([item.storage_path])
        return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ saved: true, deleted: true }) }
      }

      if (body.action === 'item_view') {
        const { data: item } = await supabase.from('client_terms_items')
          .select('storage_path').eq('id', body.id).eq('client_id', cid).single()
        if (!item?.storage_path) return { statusCode: 404, headers: HEADERS, body: JSON.stringify({ error: 'Documento não encontrado' }) }
        const { data: signed } = await supabase.storage.from('client-terms')
          .createSignedUrl(item.storage_path, 3600)
        return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ url: signed?.signedUrl }) }
      }

      return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Ação desconhecida' }) }
    }

    // legado: texto único de termos (ADMIN pode editar de qualquer cliente)
    const legacyCid = roleRow.role === 'ADMIN' ? (body.clientId || roleRow.client_id) : roleRow.client_id
    if (!legacyCid) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Cliente não encontrado' }) }
    const { terms } = body
    if (typeof terms !== 'string') return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Campo terms obrigatório' }) }

    const { error } = await supabase
      .from('clients')
      .update({ terms_content: terms || null, terms_updated_at: new Date().toISOString() })
      .eq('id', legacyCid)
    if (error) return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: error.message }) }

    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ saved: true }) }
  }

  return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) }
}
