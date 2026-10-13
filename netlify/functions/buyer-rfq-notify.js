// netlify/functions/buyer-rfq-notify.js — avisa por e-mail os fornecedores de
// uma cotação do COMPRADOR Pro (patch_131). A cotação é gravada pela RPC
// buyer_rfq_send (que valida o plano); em seguida o front chama esta função.
// Só o dono da cotação dispara, e uma única vez (audit_log RFQ_NOTIFIED).
// POST { rfqId }  ·  Authorization: Bearer <JWT do comprador>
const { createClient } = require('@supabase/supabase-js')
const { avisarFornecedores } = require('./lib/rfq_mail.js')

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const HEADERS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' }
const res = (code, body) => ({ statusCode: code, headers: HEADERS, body: JSON.stringify(body) })

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return res(200, {})
  if (event.httpMethod !== 'POST') return res(405, { error: 'Method not allowed' })
  const token = (event.headers.authorization || '').replace('Bearer ', '')
  const { data: { user } = {}, error: authErr } = await sb.auth.getUser(token)
  if (authErr || !user) return res(401, { error: 'Sessão expirada — saia e entre novamente na plataforma' })

  let body
  try { body = JSON.parse(event.body || '{}') } catch { return res(400, { error: 'JSON inválido' }) }
  if (!body.rfqId) return res(400, { error: 'rfqId obrigatório' })

  try {
    const { data: rfq } = await sb.from('rfqs').select('id, buyer_id, requester_role, title, description, category, deadline, created_at')
      .eq('id', body.rfqId).maybeSingle()
    if (!rfq || rfq.requester_role !== 'BUYER') return res(404, { error: 'Cotação não encontrada' })
    const { data: role } = await sb.from('user_roles').select('buyer_id')
      .eq('user_id', user.id).eq('role', 'BUYER').eq('buyer_id', rfq.buyer_id).maybeSingle()
    if (!role) return res(403, { error: 'Esta cotação não é sua' })
    // uma vez só, e só logo após o envio (evita reenvio em massa por chamada repetida)
    const { data: ja } = await sb.from('audit_log').select('id').eq('action', 'RFQ_NOTIFIED').eq('entity_id', rfq.id).limit(1)
    if (ja?.length) return res(200, { emails: 0, ja_avisado: true })
    if (Date.now() - new Date(rfq.created_at).getTime() > 60 * 60 * 1000) return res(409, { error: 'Cotação antiga — aviso não reenviado' })

    const [{ data: resp }, { data: buyer }] = await Promise.all([
      sb.from('rfq_responses').select('supplier_id').eq('rfq_id', rfq.id),
      sb.from('buyers').select('razao_social').eq('id', rfq.buyer_id).maybeSingle(),
    ])
    const empresa = buyer?.razao_social || 'Comprador ELOS'
    const ids = [...new Set((resp || []).map((r) => r.supplier_id))]
    const enviados = await avisarFornecedores(sb, { supplierIds: ids, empresa, title: rfq.title,
      description: rfq.description, categoria: rfq.category && rfq.category !== 'Marketplace' ? rfq.category : null, deadline: rfq.deadline })
    await sb.from('audit_log').insert({ user_id: user.id, action: 'RFQ_NOTIFIED', entity_type: 'rfq', entity_id: rfq.id,
      metadata: { requester_role: 'BUYER', fornecedores: ids.length, emails: enviados } })
    return res(200, { emails: enviados, fornecedores: ids.length })
  } catch (e) {
    console.error('[buyer-rfq-notify]', e)
    return res(500, { error: e.message })
  }
}
