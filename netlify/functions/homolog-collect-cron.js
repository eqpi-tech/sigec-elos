// netlify/functions/homolog-collect-cron.js — cron das Rotas A e B (a cada 15 min).
// Só dispara os processadores background: coletor da Rota A (novas
// tentativas de fontes instáveis) e pré-análise por IA da Rota B.
// Mesmo padrão do bc-report-cron: agendada não aceita POST externo e é
// limitada a ~26s. Deploys de branch não executam schedules — no staging o
// coletor é disparado pelo cadastro ou manualmente (docs/STAGING.md).
const { enabled } = require('./lib/route_a.js')
const { env } = require('./lib/runtime_env.js')

exports.handler = async () => {
  const alvos = [
    enabled() && 'homolog-collect-background',
    env('ROUTE_B_ENABLED') === 'true' && 'homolog-ai-review-background',
  ].filter(Boolean)
  if (!alvos.length) return { statusCode: 200 }
  const site = env('ELOS_ENV') === 'production' ? env('URL') : (env('DEPLOY_PRIME_URL') || env('URL'))
  if (!site || !process.env.CRON_SECRET) {
    console.warn('[homolog-collect-cron] URL/CRON_SECRET ausentes — nada a fazer')
    return { statusCode: 200 }
  }
  await Promise.all(alvos.map(async (fn) => {
    try {
      const res = await fetch(`${site}/.netlify/functions/${fn}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.CRON_SECRET}` },
        body: '{}',
      })
      console.log(`[homolog-collect-cron] ${fn} disparado:`, res.status)
    } catch (e) {
      console.error(`[homolog-collect-cron] ${fn}:`, e)
    }
  }))
  return { statusCode: 200 }
}
