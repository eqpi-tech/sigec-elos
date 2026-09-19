// netlify/functions/bc-report-cron.js — cron 1/min (produção; netlify.toml).
// Só dispara o worker background (que roda até 15 min) e retorna: scheduled
// functions são limitadas a ~26s e não aceitam POST externo, por isso o
// trabalho pesado vive em bc-report-worker-background.js.
exports.handler = async () => {
  const site = process.env.URL || process.env.DEPLOY_PRIME_URL
  if (!site || !process.env.CRON_SECRET) {
    console.warn('[bc-report-cron] URL/CRON_SECRET ausentes — nada a fazer')
    return { statusCode: 200 }
  }
  try {
    const res = await fetch(`${site}/.netlify/functions/bc-report-worker-background`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.CRON_SECRET}` },
      body: '{}',
    })
    console.log('[bc-report-cron] worker background disparado:', res.status)
  } catch (e) {
    console.error('[bc-report-cron]', e)
  }
  return { statusCode: 200 }
}
