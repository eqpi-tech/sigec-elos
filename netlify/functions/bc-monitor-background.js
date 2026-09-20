// netlify/functions/bc-monitor-background.js — monitoramento mensal do BC
// Report (handoff §12, Estágio 10). Disparado pelo workflow bc-monitor.yml
// (1º dia do mês) com Bearer CRON_SECRET. Background function (até 15 min).
//
// O que faz:
//  1. Revalida a ROTA A (listas grátis) dos CNPJs com relatório concluído
//     nos últimos 60 dias e detecta MUDANÇA de resultado (ex.: empresa
//     entrou no CEIS depois do relatório emitido) — custo zero.
//  2. Lista certidões Infosimples com validade vencendo em até 15 dias.
//  3. Grava o resumo no audit_log (BC_MONITOR_RUN) e, se bc_config
//     'monitor_alert_email' estiver configurado, envia alerta via Resend.

const { createClient } = require('@supabase/supabase-js')
const registry = require('./lib/connectors/index.js')

const sb = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

const REVALIDA = ['ceis', 'cnep', 'cepim', 'trabalho_escravo', 'ofac', 'onu']

async function sendAlert(to, subject, html) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey || !to) return false
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ from: process.env.EMAIL_FROM || 'noreply@eqpitech.com.br', to: [to], subject, html }),
  })
  return res.ok
}

exports.handler = async (event) => {
  const bearer = (event.headers?.authorization || '').replace('Bearer ', '')
  if (!process.env.CRON_SECRET || bearer !== process.env.CRON_SECRET) return { statusCode: 401 }

  const t0 = Date.now()
  const deadline = t0 + 12 * 60 * 1000
  try {
    // CNPJs com relatório concluído nos últimos 60 dias
    const { data: reqs } = await sb
      .from('report_requests')
      .select('cnpj, tipo, finished_at')
      .in('status', ['done', 'done_partial'])
      .gte('finished_at', new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString())
    const cnpjs = [...new Set((reqs || []).map((r) => r.cnpj))]

    // último flag registrado por cnpj+conector (base de comparação)
    const mudancas = []
    for (const cnpj of cnpjs) {
      if (Date.now() > deadline - 60000) break
      const { data: prev } = await sb
        .from('source_results')
        .select('connector, result_flag, created_at')
        .eq('cnpj', cnpj).in('connector', REVALIDA).eq('status', 'ok')
        .order('created_at', { ascending: false })
      const lastFlag = {}
      for (const r of prev || []) if (!lastFlag[r.connector]) lastFlag[r.connector] = r.result_flag

      // contexto p/ OFAC/ONU (nomes) — cnpj_base grátis
      let ctx = { cnpj, company: {}, socios: [] }
      try {
        const base = registry.cnpj_base
        const parsed = base.parse(await base.fetch({ cnpj }))
        ctx = { cnpj, ...base.extractContext(parsed) }
      } catch { /* segue sem QSA */ }

      for (const slug of REVALIDA) {
        try {
          const c = registry[slug]
          const parsed = c.parse(await c.fetch(ctx))
          const antes = lastFlag[slug] || 'nada_consta'
          if (parsed.result_flag !== antes && parsed.result_flag !== 'indisponivel') {
            mudancas.push({ cnpj, fonte: slug, antes, agora: parsed.result_flag, headline: parsed.headline })
          }
        } catch (e) { console.warn(`[bc-monitor] ${cnpj}/${slug}: ${e.message}`) }
      }
    }

    // certidões vencendo em até 15 dias
    const { data: vencendo } = await sb
      .from('source_results')
      .select('cnpj, connector, valid_until')
      .eq('status', 'ok').eq('route', 'infosimples')
      .gte('valid_until', new Date().toISOString())
      .lte('valid_until', new Date(Date.now() + 15 * 24 * 3600 * 1000).toISOString())
      .order('valid_until', { ascending: true })

    const resumo = {
      cnpjs_monitorados: cnpjs.length,
      mudancas_rota_a: mudancas,
      certidoes_vencendo: (vencendo || []).slice(0, 50),
      duracao_s: Math.round((Date.now() - t0) / 1000),
    }
    await sb.from('audit_log').insert({ action: 'BC_MONITOR_RUN', entity_type: 'bc_report', metadata: resumo })

    // alerta por e-mail quando houver algo relevante
    const { data: cfg } = await sb.from('bc_config').select('value').eq('key', 'monitor_alert_email').maybeSingle()
    const to = cfg?.value?.email || null
    if (to && (mudancas.length || (vencendo || []).length)) {
      const html = `<h3>BC Report — monitoramento mensal</h3>
        <p>${cnpjs.length} CNPJ(s) monitorado(s).</p>
        ${mudancas.length ? `<h4>⚠️ Mudanças nas listas restritivas</h4><ul>${mudancas.map((m) => `<li><b>${m.cnpj}</b> · ${m.fonte}: ${m.antes} → <b>${m.agora}</b> — ${m.headline}</li>`).join('')}</ul>` : ''}
        ${(vencendo || []).length ? `<h4>Certidões vencendo em 15 dias</h4><ul>${(vencendo || []).slice(0, 20).map((v) => `<li>${v.cnpj} · ${v.connector} · até ${String(v.valid_until).slice(0, 10)}</li>`).join('')}</ul>` : ''}`
      await sendAlert(to, `BC Report: ${mudancas.length} mudança(s) · ${(vencendo || []).length} certidão(ões) vencendo`, html)
    }

    console.log('[bc-monitor]', JSON.stringify({ ...resumo, mudancas_rota_a: mudancas.length }))
    return { statusCode: 200 }
  } catch (e) {
    console.error('[bc-monitor]', e)
    return { statusCode: 500 }
  }
}
