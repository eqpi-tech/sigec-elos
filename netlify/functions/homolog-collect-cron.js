// netlify/functions/homolog-collect-cron.js — cron da Rota A (a cada 15 min).
// Só dispara o coletor background (novas tentativas de fontes instáveis).
// Mesmo padrão do bc-report-cron: agendada não aceita POST externo e é
// limitada a ~26s. Deploys de branch não executam schedules — no staging o
// coletor é disparado pelo cadastro ou manualmente (docs/STAGING.md).
const { enabled } = require('./lib/route_a.js')
const { env } = require('./lib/runtime_env.js')

exports.handler = async () => {
  if (!enabled()) return { statusCode: 200 }
  const site = env('ELOS_ENV') === 'production' ? env('URL') : (env('DEPLOY_PRIME_URL') || env('URL'))
  if (!site || !process.env.CRON_SECRET) {
    console.warn('[homolog-collect-cron] URL/CRON_SECRET ausentes — nada a fazer')
    return { statusCode: 200 }
  }
  try {
    const res = await fetch(`${site}/.netlify/functions/homolog-collect-background`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.CRON_SECRET}` },
      body: '{}',
    })
    console.log('[homolog-collect-cron] coletor disparado:', res.status)
  } catch (e) {
    console.error('[homolog-collect-cron]', e)
  }
  return { statusCode: 200 }
}
