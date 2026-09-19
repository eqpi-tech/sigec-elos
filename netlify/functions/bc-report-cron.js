// netlify/functions/bc-report-cron.js — wrapper AGENDADO do worker (1/min
// em produção via netlify.toml). Precisa ser função separada: quando uma
// function tem `schedule`, o Netlify bloqueia invocação HTTP externa (403),
// então o gatilho da tela usa bc-report-worker.js (HTTP) e este arquivo só
// existe para o cron.
const { processOpenRequests } = require('./lib/bc_orchestrator.js')

exports.handler = async () => {
  try {
    const out = await processOpenRequests({ budgetMs: 18000 })
    if (out.log.length) console.log('[bc-report-cron]', out.log.join(' · '))
    return { statusCode: 200 }
  } catch (e) {
    console.error('[bc-report-cron]', e)
    return { statusCode: 500 }
  }
}
