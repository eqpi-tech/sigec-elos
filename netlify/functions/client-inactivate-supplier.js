// netlify/functions/client-inactivate-supplier.js
// Permite que um CLIENT suspenda ou reative um fornecedor no contexto do seu processo.
// Isso afeta apenas o selo deste cliente, não outros selos do fornecedor.
//
// POST body:
//   supplierId  string  UUID do fornecedor
//   action      string  'suspend' | 'reactivate'
//   reason      string  Motivo (obrigatório para suspend)

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

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: 'Token inválido' }) }

  const { data: roleRow } = await supabase
    .from('user_roles').select('client_id, role').eq('user_id', user.id).eq('role', 'CLIENT').maybeSingle()
  if (!roleRow?.client_id) return { statusCode: 403, headers: HEADERS, body: JSON.stringify({ error: 'Acesso negado' }) }

  let body
  try { body = JSON.parse(event.body) } catch {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'JSON inválido' }) }
  }
  const { supplierId, action, reason } = body
  if (!supplierId || !['suspend', 'reactivate'].includes(action)) {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'supplierId e action (suspend|reactivate) são obrigatórios' }) }
  }
  if (action === 'suspend' && !reason?.trim()) {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Motivo obrigatório para suspensão' }) }
  }

  // Verifica se o fornecedor foi convidado por este cliente
  const { data: invite } = await supabase
    .from('invitations')
    .select('id')
    .eq('supplier_id', supplierId)
    .eq('client_id', roleRow.client_id)
    .maybeSingle()
  if (!invite) return { statusCode: 403, headers: HEADERS, body: JSON.stringify({ error: 'Fornecedor não vinculado a este cliente' }) }

  // Atualiza o selo deste cliente para este fornecedor
  const update = action === 'suspend'
    ? { client_suspended_at: new Date().toISOString(), client_suspended_reason: reason.trim() }
    : { client_suspended_at: null, client_suspended_reason: null }

  const { error } = await supabase
    .from('seals')
    .update(update)
    .eq('supplier_id', supplierId)
    .eq('client_id', roleRow.client_id)
  if (error) return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: error.message }) }

  // Audit log
  await supabase.from('audit_log').insert({
    user_id: user.id,
    action: action === 'suspend' ? 'CLIENT_SUSPEND_SUPPLIER' : 'CLIENT_REACTIVATE_SUPPLIER',
    entity_type: 'supplier', entity_id: supplierId,
    metadata: { reason, client_id: roleRow.client_id },
  })

  return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ success: true, action }) }
}
