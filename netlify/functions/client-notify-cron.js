// netlify/functions/client-notify-cron.js — a cada 5 min (produção): dispara o
// envio dos avisos "Acompanhar fornecedor" (client-notify.js). Mesmo padrão do
// homolog-collect-cron: agendada não aceita POST externo; deploys de branch não
// executam schedules (no staging, chame client-notify com o CRON_SECRET).
const { env } = require('./lib/runtime_env.js')
exports.handler = async () => {
  const site = env('ELOS_ENV') === 'production' ? env('URL') : (env('DEPLOY_PRIME_URL') || env('URL'))
  if (!site || !process.env.CRON_SECRET) return { statusCode: 200 }
  try {
    const res = await fetch(`${site}/.netlify/functions/client-notify`, {
      method: 'POST', headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` }, body: '{}', signal: AbortSignal.timeout(25000),
    })
    console.log('[client-notify-cron]', res.status, await res.text().catch(() => ''))
  } catch (e) { console.error('[client-notify-cron]', e.message) }
  return { statusCode: 200 }
}
