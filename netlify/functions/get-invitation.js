// get-invitation.js
// Endpoint público (sem auth): busca convite por token e registra visualização
// GET /.netlify/functions/get-invitation?token=xxx

const { createClient } = require('@supabase/supabase-js')

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

exports.handler = async (event) => {
  const h = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: h, body: '' }

  const token = event.queryStringParameters?.token
  if (!token) return { statusCode: 400, headers: h, body: JSON.stringify({ error: 'token obrigatório' }) }

  const { data: inv, error } = await supabaseAdmin
    .from('invitations')
    .select('id, status, supplier_razao_social, supplier_email, supplier_cnpj, subsidiado, tipo_fornecedor, escopo, client_id, buyer_id, viewed_at, clients(razao_social), buyers(razao_social)')
    .eq('token', token)
    .maybeSingle()

  if (error) return { statusCode: 500, headers: h, body: JSON.stringify({ error: error.message }) }
  if (!inv)  return { statusCode: 404, headers: h, body: JSON.stringify({ error: 'Convite não encontrado' }) }

  // Registra primeira visualização e muda status SENT → VIEWED
  if (!inv.viewed_at) {
    await supabaseAdmin
      .from('invitations')
      .update({
        viewed_at: new Date().toISOString(),
        status: inv.status === 'SENT' ? 'VIEWED' : inv.status,
      })
      .eq('id', inv.id)
  }

  const senderName = inv.clients?.razao_social || inv.buyers?.razao_social || null

  return {
    statusCode: 200,
    headers: h,
    body: JSON.stringify({
      id:                  inv.id,
      status:              inv.status,
      supplier_razao_social: inv.supplier_razao_social,
      supplier_email:      inv.supplier_email,
      supplier_cnpj:       inv.supplier_cnpj,
      subsidiado:          inv.subsidiado,
      tipo_fornecedor:     inv.tipo_fornecedor,
      escopo:              inv.escopo,
      sender_name:         senderName,
    }),
  }
}
