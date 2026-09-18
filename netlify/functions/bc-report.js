// netlify/functions/bc-report.js — BC Report Automatizado (handoff §4/§10)
// POST { cnpj, tipo: 'light'|'full', force_refresh_bureau? } → cria request na
//   fila report_requests (idempotência: mesmo cnpj+tipo com request não-final
//   < 10 min retorna o existente). ADMIN only; force_refresh_bureau idem (L2).
// GET  ?cnpj=...  → histórico do CNPJ  ·  GET sem cnpj → últimos 30 requests.
// A COLETA é feita pelo orquestrador (estágio 5) — aqui é só o starter/fila.

const { createClient } = require('@supabase/supabase-js')

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: HEADERS, body: '' }

  const token = (event.headers.authorization || '').replace('Bearer ', '')
  if (!token) return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: 'Token ausente' }) }

  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const { data: { user }, error: authErr } = await sb.auth.getUser(token)
  if (authErr || !user) return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: 'Token inválido' }) }
  const { data: roleRow } = await sb
    .from('user_roles').select('role').eq('user_id', user.id).eq('role', 'ADMIN').maybeSingle()
  if (!roleRow) return { statusCode: 403, headers: HEADERS, body: JSON.stringify({ error: 'Acesso negado' }) }

  if (event.httpMethod === 'GET') {
    const cnpj = (event.queryStringParameters?.cnpj || '').replace(/\D/g, '')
    let q = sb.from('report_requests')
      .select('id, cnpj, tipo, status, score_eqpi, risk_band, cost_brl, price_brl, pdf_path, error, created_at, finished_at, supplier_id')
      .order('created_at', { ascending: false }).limit(30)
    if (cnpj) q = q.eq('cnpj', cnpj)
    const { data, error } = await q
    if (error) return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: error.message }) }
    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ rows: data || [] }) }
  }

  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) }

  let body
  try { body = JSON.parse(event.body) } catch {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'JSON inválido' }) }
  }
  const cnpj = String(body.cnpj || '').replace(/\D/g, '')
  const tipo = body.tipo
  if (cnpj.length !== 14) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'CNPJ deve ter 14 dígitos' }) }
  if (!['light', 'full'].includes(tipo)) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: "tipo deve ser 'light' ou 'full'" }) }

  // Idempotência (§4): request não-final do mesmo cnpj+tipo < 10 min → retorna o existente
  const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  const { data: dupe } = await sb.from('report_requests')
    .select('id, status, created_at')
    .eq('cnpj', cnpj).eq('tipo', tipo)
    .in('status', ['pending', 'collecting', 'rendering'])
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (dupe) return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ request: dupe, duplicated: true }) }

  // Preço da config (L5) — conversão Full ≤30d pós-Light
  const { data: cfg } = await sb.from('bc_config').select('key, value')
    .in('key', ['price_light', 'price_full', 'price_full_conv'])
  const prices = Object.fromEntries((cfg || []).map(r => [r.key, r.value?.brl]))
  let price = tipo === 'light' ? prices.price_light : prices.price_full
  if (tipo === 'full') {
    const d30 = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
    const { data: lightPrev } = await sb.from('report_requests').select('id')
      .eq('cnpj', cnpj).eq('tipo', 'light').eq('status', 'done')
      .gte('created_at', d30).limit(1).maybeSingle()
    if (lightPrev) price = prices.price_full_conv ?? price
  }

  // vincula fornecedor da base quando existir (mostra situação ELOS no Light)
  const { data: sup } = await sb.from('suppliers').select('id').eq('cnpj', cnpj).maybeSingle()

  const { data: reqRow, error: insErr } = await sb.from('report_requests').insert({
    cnpj, tipo,
    supplier_id: sup?.id || null,
    requested_by: user.id,
    requested_channel: 'backoffice',
    force_refresh_bureau: body.force_refresh_bureau === true,
    price_brl: price ?? null,
  }).select('id, cnpj, tipo, status, price_brl, created_at').single()
  if (insErr) return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: insErr.message }) }

  await sb.from('audit_log').insert({
    user_id: user.id, action: 'BC_REPORT_REQUESTED', entity_type: 'report_request',
    metadata: { request_id: reqRow.id, cnpj, tipo, price_brl: price },
  })

  // Estágio 5 ligará o orquestrador aqui (invocação imediata + fila agendada)
  return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ request: reqRow }) }
}
