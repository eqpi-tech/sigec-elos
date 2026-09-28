// netlify/functions/invitation-cancel.js — cliente (ou backoffice) cancela um
// convite ainda não cadastrado (patch_103). Não apaga: status CANCELLED +
// quando/quem/motivo. O token é mantido (rastreabilidade) — quem abre o link
// vê "convite cancelado": get-invitation e create-supplier recusam CANCELLED.
// POST { inviteId, reason }
const { createClient } = require('@supabase/supabase-js')

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
  const reason = String(body.reason || '').trim()
  if (!body.inviteId) return res(400, { error: 'inviteId obrigatório' })
  if (reason.length < 3) return res(400, { error: 'Informe o motivo do cancelamento' })

  const { data: inv } = await sb.from('invitations')
    .select('id, client_id, status, token, supplier_email, supplier_cnpj, supplier_razao_social').eq('id', body.inviteId).maybeSingle()
  if (!inv) return res(404, { error: 'Convite não encontrado' })

  const { data: roles } = await sb.from('user_roles').select('role, client_id, access_profile').eq('user_id', user.id)
  const isAdmin = (roles || []).some((r) => r.role === 'ADMIN')
  const doCliente = (roles || []).find((r) => r.role === 'CLIENT' && r.client_id && r.client_id === inv.client_id)
  if (!isAdmin && !doCliente) return res(403, { error: 'Convite de outro cliente' })
  if (!isAdmin && doCliente.access_profile === 'readonly') return res(403, { error: 'Seu perfil de acesso é somente leitura' })
  if (inv.status === 'REGISTERED') return res(409, { error: 'O fornecedor já se cadastrou por este convite — não é possível cancelar' })
  if (inv.status === 'CANCELLED') return res(409, { error: 'Este convite já está cancelado' })

  const { error } = await sb.from('invitations').update({
    status: 'CANCELLED', cancelled_at: new Date().toISOString(), cancelled_by: user.id, cancel_reason: reason,
  }).eq('id', inv.id).neq('status', 'REGISTERED')
  if (error) return res(500, { error: error.message })

  await sb.from('audit_log').insert({
    user_id: user.id, action: 'INVITATION_CANCELLED', entity_type: 'invitation', entity_id: inv.id,
    metadata: { client_id: inv.client_id, status_anterior: inv.status,
                supplier_email: inv.supplier_email, supplier_cnpj: inv.supplier_cnpj, razao_social: inv.supplier_razao_social, motivo: reason },
  })
  return res(200, { ok: true })
}
