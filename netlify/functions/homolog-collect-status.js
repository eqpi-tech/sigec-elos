// homolog-collect-status.js — diagnóstico da Rota A (Bearer CRON_SECRET).
// Devolve só booleanos/contagens: se o ambiente enxerga as variáveis de que o
// coletor precisa (nunca os valores) e o tamanho da fila.
const { createClient } = require('@supabase/supabase-js')
const { enabled } = require('./lib/route_a.js')

exports.handler = async (event) => {
  const bearer = (event.headers?.authorization || '').replace('Bearer ', '')
  if (!process.env.CRON_SECRET || bearer !== process.env.CRON_SECRET) return { statusCode: 401, body: '{}' }
  const out = {
    elos_env: process.env.ELOS_ENV || null,
    route_a_enabled: enabled(),
    has: Object.fromEntries(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'INFOSIMPLES_TOKEN', 'RESEND_API_KEY', 'MAIL_TEST_INBOX', 'DEPLOY_PRIME_URL']
      .map((k) => [k, !!process.env[k]])),
  }
  try {
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    const { data, error } = await sb.from('auto_collect_jobs').select('status')
    out.fila = error ? `erro: ${error.message}` : (data || []).reduce((a, j) => ({ ...a, [j.status]: (a[j.status] || 0) + 1 }), {})
  } catch (e) { out.fila = `erro: ${e.message}` }
  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(out) }
}
