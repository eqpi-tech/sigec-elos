// homolog-collect-request.js — Rota A: refaz a fila de coleta automática de um
// fornecedor quando os documentos exigidos MUDAM (ex.: fornecedor ou backoffice
// acrescentou uma categoria depois do cadastro). Antes a coleta só era
// enfileirada no cadastro e na confirmação do pagamento — caso Presmet
// (07/10): a 2ª categoria passou a exigir FGTS/CNDT e eles caíram para envio
// manual.
//
// Sem custo duplicado: enqueueRouteA não repete (processo, documento) já
// enfileirado, e o coletor reaproveita documento válido e nunca sobrescreve
// envio manual. Trava de pagamento: só processo liberado (patch_112).
//
// POST body: { supplierId }   Authorization: Bearer <JWT do fornecedor ou ADMIN>

const { createClient } = require('@supabase/supabase-js')
const { functionsUrl } = require('./lib/runtime_env.js')
const routeA = require('./lib/route_a.js')

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}
const res = (statusCode, body) => ({ statusCode, headers: HEADERS, body: JSON.stringify(body) })

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: HEADERS, body: '' }
  if (event.httpMethod !== 'POST') return res(405, { error: 'Method not allowed' })
  // Rota A desligada neste ambiente: nada a fazer (não é erro para quem chama)
  if (!routeA.enabled()) return res(200, { ok: true, enqueued: 0, skipped: 'rota_a_desligada' })

  const token = (event.headers.authorization || '').replace('Bearer ', '')
  if (!token) return res(401, { error: 'Token ausente' })
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  const { data: { user }, error: authErr } = await sb.auth.getUser(token)
  if (authErr || !user) return res(401, { error: 'Token inválido' })

  let body
  try { body = JSON.parse(event.body || '{}') } catch { return res(400, { error: 'JSON inválido' }) }
  const supplierId = body.supplierId
  if (!supplierId) return res(400, { error: 'supplierId obrigatório' })

  // quem pode: backoffice ou usuário do próprio fornecedor
  const { data: papeis } = await sb.from('user_roles').select('role, supplier_id').eq('user_id', user.id)
  const pode = (papeis || []).some(r => r.role === 'ADMIN' || (r.role === 'SUPPLIER' && r.supplier_id === supplierId))
  if (!pode) return res(403, { error: 'Acesso negado' })

  let n = 0
  try {
    n = await routeA.enqueueRouteA(sb, supplierId)
  } catch (e) {
    console.warn('[rota-a] enfileirar após mudança de categoria:', e.message)
    return res(200, { ok: false, enqueued: 0 })   // melhor esforço: o fluxo manual segue
  }
  if (n && process.env.CRON_SECRET) {
    try {
      await fetch(`${functionsUrl()}/.netlify/functions/homolog-collect-background`, {
        method: 'POST', headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` }, body: '{}',
      })
    } catch (e) { console.warn('[rota-a] disparo do coletor:', e.message) }
  }
  console.log(`[rota-a] mudança de exigência: ${n} consulta(s) nova(s) para ${supplierId}`)
  return res(200, { ok: true, enqueued: n })
}
