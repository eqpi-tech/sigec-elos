// netlify/functions/bc-report-worker-background.js — processamento PESADO da
// fila do BC Report. O sufixo "-background" faz o Netlify responder 202 na
// hora e deixar o handler rodar por até 15 min — é o que permite consultas
// Infosimples lentas (PGFN pode passar de 60s; o cliente aborta em 320s).
//
// Gatilhos: a tela (ADMIN autenticado) e o cron bc-report-cron.js (que só
// dispara este endpoint com CRON_SECRET e devolve). A guarda de concorrência
// de 90s do orquestrador evita passadas sobrepostas.

const { createClient } = require('@supabase/supabase-js')
const { processOpenRequests } = require('./lib/bc_orchestrator.js')

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

exports.handler = async (event) => {
  const auth = event.headers?.authorization || ''
  const bearer = auth.replace('Bearer ', '')

  let authorized = !!(process.env.CRON_SECRET && bearer === process.env.CRON_SECRET)
  if (!authorized && bearer) {
    const { data: { user } } = await supabaseAdmin.auth.getUser(bearer)
    if (user) {
      const { data: role } = await supabaseAdmin
        .from('user_roles').select('role').eq('user_id', user.id).eq('role', 'ADMIN').limit(1).maybeSingle()
      authorized = !!role
    }
  }
  if (!authorized) { console.warn('[bc-worker-bg] chamada não autorizada'); return { statusCode: 401 } }

  let requestId = null
  try { requestId = JSON.parse(event.body || '{}').requestId || null } catch { /* vazio */ }

  try {
    // orçamento longo: 10 min de coleta + 3 de render (Netlify corta em 15)
    const out = await processOpenRequests({ budgetMs: 10 * 60 * 1000, requestId })
    if (out.log.length) console.log('[bc-worker-bg]', out.log.join(' · '))
    const { renderOpenReports } = require('./lib/bc_render.js')
    const r = await renderOpenReports({ budgetMs: 3 * 60 * 1000 })
    if (r.log.length) console.log('[bc-worker-bg render]', r.log.join(' · '))
    return { statusCode: 200 }
  } catch (e) {
    console.error('[bc-worker-bg]', e)
    return { statusCode: 500 }
  }
}
