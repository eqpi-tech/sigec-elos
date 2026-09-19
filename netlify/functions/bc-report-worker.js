// netlify/functions/bc-report-worker.js — worker da fila do BC Report.
//
// Gatilhos:
//  - produção: scheduled function 1/min (netlify.toml) — branch deploys NÃO
//    executam schedules, por isso o preview usa o gatilho HTTP abaixo
//  - HTTP POST: ADMIN autenticado (a tela chama junto com o polling) ou
//    Authorization: Bearer CRON_SECRET (GitHub Actions/diagnóstico)
//
// Cada execução é uma passada com orçamento de ~18s (limite Netlify ~26s);
// o estado fica no banco e a próxima passada continua de onde parou.

const { createClient } = require('@supabase/supabase-js')
const { processOpenRequests } = require('./lib/bc_orchestrator.js')

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' }

  // invocação agendada (Netlify) não traz Authorization
  const auth = event.headers?.authorization || ''
  const isCron = !auth && !event.httpMethod // scheduled invoke
  const bearer = auth.replace('Bearer ', '')

  let authorized = isCron || (process.env.CRON_SECRET && bearer === process.env.CRON_SECRET)
  if (!authorized && bearer) {
    const { data: { user } } = await supabaseAdmin.auth.getUser(bearer)
    if (user) {
      const { data: role } = await supabaseAdmin
        .from('user_roles').select('role').eq('user_id', user.id).eq('role', 'ADMIN').limit(1).maybeSingle()
      authorized = !!role
    }
  }
  if (!authorized) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Não autorizado' }) }

  let requestId = null
  try { requestId = JSON.parse(event.body || '{}').requestId || null } catch { /* vazio */ }

  try {
    const out = await processOpenRequests({ budgetMs: 18000, requestId })
    if (out.log.length) console.log('[bc-report-worker]', out.log.join(' · '))
    return { statusCode: 200, headers, body: JSON.stringify(out) }
  } catch (e) {
    console.error('[bc-report-worker]', e)
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) }
  }
}
