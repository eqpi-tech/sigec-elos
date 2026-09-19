// lib/bc_render.js — etapa de render do BC Report (handoff §9).
// Pega requests em 'rendering', monta o HTML (light.js), gera o PDF com
// Playwright + @sparticuz/chromium (binário lambda; local usa o Chrome do
// sistema via BC_CHROME_PATH) e sobe ao bucket bc-reports. Fecha o request:
// done (todas as fontes ok/not_found) ou done_partial (alguma failed_*),
// com finished_at. Roda dentro do worker background (até 15 min).

const { createClient } = require('@supabase/supabase-js')
const { buildLightHtml } = require('./render/light.js')

const BUCKET = 'bc-reports'

function admin() {
  return createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
}

let _browser = null
async function getBrowser() {
  if (_browser) return _browser
  const { chromium: pw } = require('playwright-core')
  if (process.env.BC_CHROME_PATH) {
    _browser = await pw.launch({ executablePath: process.env.BC_CHROME_PATH, headless: true })
  } else {
    const chromium = require('@sparticuz/chromium')
    _browser = await pw.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    })
  }
  return _browser
}

async function htmlToPdf(html) {
  const browser = await getBrowser()
  const page = await browser.newPage()
  try {
    await page.setContent(html, { waitUntil: 'networkidle', timeout: 60000 })
    return await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true })
  } finally { await page.close() }
}

// situação documental na base ELOS (§9) — só quando o CNPJ é fornecedor
async function elosDocStats(sb, supplierId) {
  if (!supplierId) return null
  const { data } = await sb.from('documents').select('status').eq('supplier_id', supplierId)
  if (!data?.length) return null
  const analisados = data.filter((d) => ['VALID', 'APPROVED'].includes(d.status)).length
  return { docsAnalisados: analisados, docsPendentes: data.length - analisados }
}

async function renderOpenReports({ budgetMs = 120000 } = {}) {
  const sb = admin()
  const deadline = Date.now() + budgetMs
  const log = []
  const { data: reqs, error } = await sb
    .from('report_requests')
    .select('id, cnpj, supplier_id, tipo, status, score_eqpi, risk_band, parecer, cost_brl, finished_at')
    .eq('status', 'rendering')
    .order('created_at', { ascending: true })
    .limit(5)
  if (error) throw new Error(`report_requests: ${error.message}`)

  for (const req of reqs || []) {
    if (deadline - Date.now() < 15000) break
    try {
      const { data: rows } = await sb
        .from('source_results')
        .select('connector, status, result_flag, parsed, created_at')
        .eq('request_id', req.id)
        .order('created_at', { ascending: true })
      const sources = {}
      let partial = false
      const seen = {}
      for (const r of rows || []) (seen[r.connector] = seen[r.connector] || []).push(r)
      for (const [slug, list] of Object.entries(seen)) {
        const terminalOk = [...list].reverse().find((r) => r.status === 'ok' || r.status === 'not_found')
        sources[slug] = terminalOk || list[list.length - 1]
        if (!terminalOk) partial = true
      }

      // v1: template Light também para o Full (o multi-página é o Estágio 9)
      const html = buildLightHtml({ req, sources, elos: await elosDocStats(sb, req.supplier_id) })
      const pdf = await htmlToPdf(html)

      const path = `reports/${req.cnpj}/${req.tipo}-${req.id}.pdf`
      const { error: upErr } = await sb.storage.from(BUCKET)
        .upload(path, Buffer.from(pdf), { contentType: 'application/pdf', upsert: true })
      if (upErr) throw new Error(`upload: ${upErr.message}`)

      await sb.from('report_requests').update({
        status: partial ? 'done_partial' : 'done',
        pdf_path: path,
        finished_at: new Date().toISOString(),
      }).eq('id', req.id).eq('status', 'rendering')
      log.push(`${req.cnpj}:${req.tipo}=render ok (${(pdf.length / 1024).toFixed(0)}KB${partial ? ', parcial' : ''})`)
    } catch (e) {
      log.push(`${req.cnpj}: render ERRO ${e.message}`)
      console.error('[bc-render]', req.id, e)
      await sb.from('report_requests').update({ error: `render: ${String(e.message).slice(0, 300)}` }).eq('id', req.id)
    }
  }
  if (_browser) { try { await _browser.close() } catch { /* já fechado */ } _browser = null }
  return { rendered: (reqs || []).length, log }
}

module.exports = { renderOpenReports, buildLightHtml, htmlToPdf }
