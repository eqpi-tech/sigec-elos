// netlify/functions/invitation-subsidize.js — o cliente (ou o backoffice, em
// nome dele) passa um convite de "fornecedor paga" para SUBSIDIADO (26/10/2026,
// pedido de cliente da migração de novembro). Só nesse sentido, e só enquanto o
// fornecedor NÃO pagou. Regra completa em lib/subsidy.js:
//   · sem pagamento → troca na hora (processo liberado, coleta, e-mail);
//   · boleto do ELOS em aberto → troca AGENDADA para o vencimento (a Stripe não
//     cancela boleto emitido; boleto pago não tem estorno) — patch_160;
//   · pago, boleto do HOC, convite do HOC → recusa.
// POST { inviteId }   (?check=1 só confere, sem trocar — usado pela tela)
const { createClient } = require('@supabase/supabase-js')
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const subsidy = require('./lib/subsidy.js')

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const HEADERS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' }
const res = (code, body) => ({ statusCode: code, headers: HEADERS, body: JSON.stringify(body) })

// mesma regra do hasAction (src/lib/modules.js): perfil sem chaves 'acao:'
// libera tudo; com chaves, só o que estiver na lista
const permite = (modules, key) => !Array.isArray(modules) || modules.includes('*')
  || !modules.some((k) => String(k).startsWith('acao:')) || modules.includes(key)

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return res(200, {})
  if (event.httpMethod !== 'POST') return res(405, { error: 'Method not allowed' })
  const token = (event.headers.authorization || '').replace('Bearer ', '')
  const { data: { user } = {}, error: authErr } = await sb.auth.getUser(token)
  if (authErr || !user) return res(401, { error: 'Sessão expirada — saia e entre novamente na plataforma' })

  let body
  try { body = JSON.parse(event.body || '{}') } catch { return res(400, { error: 'JSON inválido' }) }
  if (!body.inviteId) return res(400, { error: 'inviteId obrigatório' })
  const soConferir = event.queryStringParameters?.check === '1'

  const { data: inv } = await sb.from('invitations').select(subsidy.SEL_INV).eq('id', body.inviteId).maybeSingle()
  if (!inv) return res(404, { error: 'Convite não encontrado' })

  const { data: roles } = await sb.from('user_roles').select('role, client_id, access_profile, access_profile_id, is_active').eq('user_id', user.id)
  const isAdmin = (roles || []).some((r) => r.role === 'ADMIN' && r.is_active !== false)
  const doCliente = (roles || []).find((r) => r.role === 'CLIENT' && r.client_id === inv.client_id && r.is_active !== false)
  if (!isAdmin && !doCliente) return res(403, { error: 'Convite de outro cliente' })
  if (!isAdmin) {
    if (doCliente.access_profile === 'readonly') return res(403, { error: 'Seu perfil de acesso é somente leitura' })
    if (doCliente.access_profile_id) {
      const { data: perfil } = await sb.from('access_profiles').select('modules').eq('id', doCliente.access_profile_id).maybeSingle()
      if (!permite(perfil?.modules, 'acao:subsidiar_convite')) return res(403, { error: 'Seu perfil não permite tornar convites subsidiados — fale com o administrador da sua empresa' })
    }
  }

  const a = await subsidy.avaliar(sb, stripe, inv)
  if (a.erro) return res(409, { error: a.erro })
  if (soConferir) {
    return res(200, { ok: true, valor: Number(a.flow.price_subsidized), fluxo: a.flow.name,
                      agendar: a.modo === 'agendar', vence: a.boleto?.vence || null, cadastrado: !!a.supplierId })
  }

  const porEqpi = isAdmin && !doCliente
  const quem = { userId: user.id, feitoPor: porEqpi ? 'ADMIN' : 'CLIENT',
                 autor: porEqpi ? 'EQPI (a pedido do cliente)' : (user.user_metadata?.full_name || user.user_metadata?.name || user.email) }
  try {
    const r = a.modo === 'agendar' ? await subsidy.agendar(sb, inv, a, quem) : await subsidy.efetivar(sb, inv, a, quem)
    if (r.erro) return res(409, { error: r.erro })
    return res(200, r)
  } catch (e) {
    console.error('[subsidio]', e)
    return res(500, { error: e.message })
  }
}
