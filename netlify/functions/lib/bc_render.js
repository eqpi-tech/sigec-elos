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
    chromium.setGraphicsMode = false // menos memória no lambda (recomendação sparticuz)
    _browser = await pw.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    })
  }
  return _browser
}

async function dropBrowser() {
  const b = _browser
  _browser = null
  if (b) { try { await b.close() } catch { /* já morto */ } }
  // /tmp do lambda tem 512MB e o binário extraído ocupa ~250MB; cada launch
  // do playwright cria um diretório de perfil que fica órfão — acumulando,
  // o /tmp lota e o chromium morre no launch (visto no Full 19/09).
  // Limpa perfis/crashdumps SEM tocar no binário (/tmp/chromium, libs).
  try {
    const fs = require('fs')
    for (const entry of fs.readdirSync('/tmp')) {
      if (/^(playwright|\.org\.chromium|snap-|\.config)/.test(entry)) {
        fs.rmSync(`/tmp/${entry}`, { recursive: true, force: true })
      }
    }
  } catch { /* melhor-esforço */ }
}

// Nossos HTMLs são autocontidos (fontes/imagens em data:) → 'load' basta.
// O chromium pode MORRER no meio (OOM no lambda — visto no Full 19/09):
// nessa hipótese derruba a instância e relança UMA vez antes de desistir.
async function htmlToPdf(html, { offline = false } = {}) {
  for (let tentativa = 0; ; tentativa++) {
    try {
      const browser = await getBrowser()
      const page = await browser.newPage()
      try {
        // receipts de terceiros (ex.: página de resultados do Google) puxam
        // dezenas de recursos remotos e derrubavam o chromium — offline
        // bloqueia qualquer request externa; o snapshot local basta
        if (offline) await page.route('**/*', (r) => r.abort().catch(() => {}))
        await page.setContent(html, { waitUntil: offline ? 'domcontentloaded' : 'load', timeout: 45000 })
        return await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true })
      } finally { await page.close().catch(() => {}) }
    } catch (e) {
      await dropBrowser()
      if (tentativa >= 1) throw e
      console.warn('[bc-render] chromium caiu — relançando:', String(e.message).slice(0, 80))
    }
  }
}

// ── Apêndice de evidências (Full, §9) ────────────────────────────────────
// Baixa os receipts/certidões do bucket e converte cada um em páginas PDF:
// .pdf entra como está; .html renderiza no Playwright; .png embrulha em img.
// O merge final (pdf-lib) anexa tudo após o relatório, e as seções apontam
// "evidência anexa (página N)" — por isso o Full renderiza em 2 passadas.
const MAX_EVIDENCES = 20
const MAX_EVIDENCE_BYTES = 4 * 1024 * 1024 // por arquivo; maiores ficam só citados

async function buildEvidenceAppendix(sb, requestId) {
  // só evidências de tentativas TERMINAIS (retries antigos deixam receipts
  // duplicados — o Full da Techocean tinha 3 conjuntos da mídia negativa).
  // Resultado clonado do cache (reused_from) não tem evidência própria —
  // busca as do resultado ORIGINAL, senão um request 100% cacheado sai com
  // o apêndice vazio (visto no re-emit da Alianza, 23/09).
  const { data: terms, error: tErr } = await sb
    .from('source_results')
    .select('id, connector, reused_from')
    .eq('request_id', requestId)
    .in('status', ['ok', 'not_found'])
  if (tErr) { console.warn('[bc-render] evidências:', tErr.message); return [] }
  const connBySource = {}
  for (const t of terms || []) connBySource[t.reused_from || t.id] = t.connector
  const ids = Object.keys(connBySource)
  if (!ids.length) return []
  const { data: rawEvs, error } = await sb
    .from('report_evidences')
    .select('kind, storage_path, sha256, source_result_id')
    .in('source_result_id', ids)
    .order('created_at', { ascending: true })
  if (error) { console.warn('[bc-render] evidências:', error.message); return [] }
  const evs = (rawEvs || []).map((e) => ({ ...e, source_results: { connector: connBySource[e.source_result_id] } }))
  const out = []
  let converted = 0
  const porConector = {}
  for (const ev of (evs || []).slice(0, MAX_EVIDENCES)) {
    const conn = ev.source_results.connector
    porConector[conn] = (porConector[conn] || 0) + 1
    if (porConector[conn] > 2) continue // máx. 2 evidências por fonte
    try {
      // reinício preventivo do chromium: conversões seguidas acumulam
      // memória e derrubavam o browser no lambda (OOM, 19/09)
      if (converted > 0 && converted % 4 === 0) await dropBrowser()
      const { data: blob, error: dErr } = await sb.storage.from(BUCKET).download(ev.storage_path)
      if (dErr) throw new Error(dErr.message)
      const buf = Buffer.from(await blob.arrayBuffer())
      if (buf.length > MAX_EVIDENCE_BYTES) continue
      const ext = ev.storage_path.split('.').pop().toLowerCase()
      // 23/09 (feedback: 'tudo que puder printar a evidência, printe'):
      // HTML volta ao anexo via render OFFLINE sanitizado (sem <script>,
      // toda request externa abortada) — com as blindagens de /tmp e
      // reinício do chromium que estabilizaram o pipeline
      let pdf
      if (ext === 'pdf') pdf = buf
      else if (ext === 'html' || ext === 'htm') {
        const semScript = buf.toString('utf8').replace(/<script[\s\S]*?<\/script>/gi, '')
        pdf = await htmlToPdf(semScript, { offline: true })
      } else if (ext === 'png' || ext === 'jpg' || ext === 'jpeg') {
        pdf = await htmlToPdf(`<html><body style="margin:0"><img style="width:100%" src="data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${buf.toString('base64')}"></body></html>`, { offline: true })
      } else continue
      out.push({ slug: ev.source_results.connector, pdf })
      converted++
    } catch (e) { console.warn(`[bc-render] evidência ${ev.storage_path}: ${e.message}`) }
  }
  return out
}

async function mergePdfs(mainPdf, appendix) {
  const { PDFDocument } = require('pdf-lib')
  const doc = await PDFDocument.load(mainPdf)
  for (const item of appendix) {
    try {
      const src = await PDFDocument.load(item.pdf, { ignoreEncryption: true })
      const pages = await doc.copyPages(src, src.getPageIndices())
      for (const p of pages) doc.addPage(p)
    } catch (e) { console.warn(`[bc-render] merge evidência ${item.slug}: ${e.message}`) }
  }
  return Buffer.from(await doc.save())
}

async function countPages(pdf) {
  const { PDFDocument } = require('pdf-lib')
  return (await PDFDocument.load(pdf)).getPageCount()
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

      let pdf
      if (req.tipo === 'full') {
        // solicitante na capa (e-mail via admin API; falha não bloqueia)
        let solicitante = null
        if (req.requested_by) {
          try {
            const { data: u } = await sb.auth.admin.getUserById(req.requested_by)
            solicitante = u?.user?.email || null
          } catch { /* segue sem */ }
        }
        const { buildFullHtml, buildEvidenceIndexHtml } = require('./render/full.js')
        const appendix = await buildEvidenceAppendix(sb, req.id)
        // corpo em UMA passada (referência genérica ao índice) + página de
        // índice renderizada à parte com a numeração real → 2 impressões
        const marcado = Object.fromEntries(appendix.map((i) => [i.slug, true]))
        const body = await htmlToPdf(buildFullHtml({ req, sources, solicitante, evidenceIndex: marcado }))
        const bodyPages = await countPages(body)
        const entries = []
        let pageNo = bodyPages + 2 // corpo + página do índice
        for (const item of appendix) {
          entries.push({ slug: item.slug, protocol: sources[item.slug]?.parsed?.protocol || null, page: pageNo })
          pageNo += await countPages(item.pdf)
        }
        const indexPdf = entries.length ? await htmlToPdf(buildEvidenceIndexHtml(entries)) : null
        pdf = await mergePdfs(body, [...(indexPdf ? [{ slug: '_indice', pdf: indexPdf }] : []), ...appendix])
      } else {
        const html = buildLightHtml({ req, sources, elos: await elosDocStats(sb, req.supplier_id) })
        pdf = await htmlToPdf(html)
      }

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
  await dropBrowser()
  return { rendered: (reqs || []).length, log }
}

module.exports = { renderOpenReports, buildLightHtml, htmlToPdf }
