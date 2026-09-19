// lib/bc_orchestrator.js — orquestrador do BC Report (handoff §4 + L10).
//
// Incremental por design: cada passada tem um ORÇAMENTO DE TEMPO (Netlify
// corta em ~26s — armadilha nº 7 do CLAUDE.md) e resolve o que couber; a
// próxima passada (cron 1/min em produção, polling da tela no preview)
// continua de onde parou. Estado vive em report_requests + source_results.
//
// Regras:
// - cache: source_results ok do mesmo cnpj+connector dentro do TTL → clona
//   com cost 0 e reused_from (auditoria); force_refresh_bureau ignora o
//   cache SÓ da rota assertiva (flag restrita a admin)
// - lote paralelo (Promise.allSettled) de até 6 conectores
// - failed_soft não bloqueia: até MAX_ATTEMPTS por conector, com backoff
//   RETRY_BACKOFF_MIN entre tentativas; esgotado → conta como terminal
// - conectores QSA_DEPS só rodam depois do cnpj_base terminal
// - coleta completa → status 'rendering' (score/render = estágios 6-7) e
//   cost_brl = soma real dos source_results do request

const { createClient } = require('@supabase/supabase-js')
const registry = require('./connectors/index.js')
const { mapCode, downloadReceipt } = require('./infosimples.js')

const MAX_ATTEMPTS = 3
const RETRY_BACKOFF_MIN = 15
const BATCH_SIZE = 6
const EVIDENCE_BUCKET = 'bc-reports'

function admin() {
  return createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
}

// plano = catálogo (enabled + escopo do tipo) ∩ registro implementado
async function planFor(sb, tipo) {
  const { data: cfg, error } = await sb.from('bc_config').select('key, value').like('key', 'connector:%')
  if (error) throw new Error(`bc_config: ${error.message}`)
  const plan = []
  for (const row of cfg || []) {
    const slug = row.key.slice('connector:'.length)
    const v = row.value || {}
    if (v.enabled === false) continue
    if (tipo === 'light' && !v.in_light) continue
    if (tipo === 'full' && !v.in_full) continue
    if (!registry[slug]) continue // catalogado mas ainda não implementado
    plan.push(slug)
  }
  // cnpj_base primeiro (alimenta os demais), QSA_DEPS por último
  plan.sort((a, b) => rank(a) - rank(b))
  return plan
}
function rank(slug) {
  if (slug === 'cnpj_base') return 0
  return registry.QSA_DEPS.includes(slug) ? 2 : 1
}

function isTerminal(rows) {
  const okRow = rows.find((r) => r.status === 'ok' || r.status === 'not_found')
  if (okRow) return true
  return rows.filter((r) => r.status === 'failed_soft' || r.status === 'failed').length >= MAX_ATTEMPTS
}

function canRetry(rows) {
  const fails = rows.filter((r) => r.status === 'failed_soft' || r.status === 'failed')
  if (!fails.length) return true
  const last = fails.map((r) => new Date(r.created_at).getTime()).sort((a, b) => b - a)[0]
  return Date.now() - last >= RETRY_BACKOFF_MIN * 60 * 1000
}

function contextFrom(existing) {
  const base = (existing.cnpj_base || []).find((r) => r.status === 'ok')
  if (!base?.parsed) return { company: {}, socios: [] }
  const d = base.parsed.details || {}
  return {
    company: { razao_social: d.razao_social, uf: d.endereco?.uf, municipio: d.endereco?.municipio },
    socios: d.socios || [],
  }
}

async function runConnector(sb, req, slug, ctx, remainingMs) {
  const c = registry[slug]
  const t0 = Date.now()

  // guarda de concorrência (cron + gatilho da tela): se este request+conector
  // teve tentativa nos últimos 90s, outra passada está (ou esteve) nele —
  // pula; o backoff de retry é de 15 min, então não atrasa nada legítimo
  const { data: recent } = await sb
    .from('source_results').select('id')
    .eq('request_id', req.id).eq('connector', slug)
    .gte('created_at', new Date(Date.now() - 90 * 1000).toISOString())
    .limit(1)
  if (recent?.length) return { slug, outcome: 'em_andamento', ms: 0 }

  // cache por cnpj+connector dentro do TTL (clona com custo 0)
  const skipCache = req.force_refresh_bureau && c.route === 'assertiva'
  if (!skipCache) {
    const { data: cached } = await sb
      .from('source_results')
      .select('id, parsed, raw, result_flag, valid_until, protocol, status, route')
      .eq('cnpj', req.cnpj).eq('connector', slug).eq('status', 'ok')
      .gt('valid_until', new Date().toISOString())
      .neq('request_id', req.id)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (cached) {
      await sb.from('source_results').insert({
        request_id: req.id, cnpj: req.cnpj, connector: slug, route: cached.route,
        status: 'ok', parsed: cached.parsed, raw: null, result_flag: cached.result_flag,
        cost_brl: 0, valid_until: cached.valid_until, protocol: cached.protocol,
        reused_from: cached.id,
      })
      return { slug, outcome: 'cache', ms: Date.now() - t0 }
    }
  }

  let raw, parsed, status
  try {
    const timeoutMs = Math.max(5000, remainingMs)
    raw = await Promise.race([
      c.fetch({
        cnpj: req.cnpj, company: ctx.company, socios: ctx.socios,
        tipo: req.tipo, prefOverrides: ctx.prefOverrides || {},
        supplierId: req.supplier_id, forceRefresh: req.force_refresh_bureau,
        requestedBy: req.requested_by,
      }),
      new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout ${timeoutMs}ms`)), timeoutMs)),
    ])
    if (c.route === 'infosimples') status = mapCode(raw.code, raw.codeMessage)
    else if (raw?.notFound) status = 'not_found'
    else if (raw?.duplicated) status = 'failed_soft' // Assertiva 429: retry depois
    else status = 'ok'
    parsed = c.parse(raw)
  } catch (e) {
    raw = { error: String(e.message || e).slice(0, 500) }
    status = 'failed_soft'
    parsed = { result_flag: 'indisponivel', headline: `${slug}: fonte indisponível — ${raw.error.slice(0, 120)}`, details: {}, evidence: [], protocol: null }
  }

  const cost = typeof c.costOf === 'function'
    ? c.costOf(raw)
    : (status === 'ok' || status === 'not_found' ? (c.costBase || 0) + (c.costExtra || 0) : 0)
  const validUntil = new Date(Date.now() + c.ttlDays * 24 * 3600 * 1000).toISOString()

  const { data: sr, error: srErr } = await sb.from('source_results').insert({
    request_id: req.id, cnpj: req.cnpj, connector: slug, route: c.route, status,
    parsed, raw, result_flag: parsed.result_flag, cost_brl: cost,
    valid_until: status === 'ok' ? validUntil : null, protocol: parsed.protocol || null,
  }).select('id').single()
  if (srErr) throw new Error(`source_results(${slug}): ${srErr.message}`)

  // evidências: baixar JÁ (receipts Infosimples expiram — L6)
  let i = 0
  for (const ev of parsed.evidence || []) {
    if (!ev.url) continue
    try {
      const { buf, sha256, contentType, ext } = await downloadReceipt(ev.url)
      const path = `evidences/${req.cnpj}/${slug}-${Date.now()}-${i++}.${ext}`
      const { error: upErr } = await sb.storage.from(EVIDENCE_BUCKET)
        .upload(path, buf, { contentType, upsert: true })
      if (upErr) throw new Error(upErr.message)
      await sb.from('report_evidences').insert({ source_result_id: sr.id, kind: ev.kind, storage_path: path, sha256 })
    } catch (e) { console.warn(`[bc-orq] receipt ${slug}: ${e.message}`) }
  }
  return { slug, outcome: status, ms: Date.now() - t0 }
}

async function processRequest(sb, req, deadline, log) {
  if (req.status === 'pending') {
    await sb.from('report_requests').update({ status: 'collecting' }).eq('id', req.id).eq('status', 'pending')
  }
  const plan = await planFor(sb, req.tipo)
  const { data: existingRows } = await sb
    .from('source_results').select('connector, status, parsed, created_at')
    .eq('request_id', req.id)
  const existing = {}
  for (const r of existingRows || []) (existing[r.connector] = existing[r.connector] || []).push(r)

  const baseTerminal = existing.cnpj_base && isTerminal(existing.cnpj_base)
  const runnable = plan.filter((slug) => {
    const rows = existing[slug] || []
    if (isTerminal(rows)) return false
    if (!canRetry(rows)) return false
    if (registry.QSA_DEPS.includes(slug) && plan.includes('cnpj_base') && !baseTerminal) return false
    return true
  })

  const ctx = contextFrom(existing)
  if (runnable.includes('pref_cnd')) {
    const { data: ov } = await sb.from('bc_config').select('value').eq('key', 'pref_slug_overrides').maybeSingle()
    ctx.prefOverrides = ov?.value || {}
  }
  for (let i = 0; i < runnable.length; i += BATCH_SIZE) {
    const remaining = deadline - Date.now()
    if (remaining < 4000) break
    const batch = runnable.slice(i, i + BATCH_SIZE)
    const results = await Promise.allSettled(batch.map((slug) => runConnector(sb, req, slug, ctx, remaining - 1500)))
    results.forEach((r, j) => log.push(r.status === 'fulfilled'
      ? `${req.cnpj}:${r.value.slug}=${r.value.outcome}(${r.value.ms}ms)`
      : `${req.cnpj}:${batch[j]}=ERRO ${r.reason?.message || r.reason}`))
    // cnpj_base acabou de resolver? contexto pode destravar QSA_DEPS na próxima passada
  }

  // recompleta o estado e fecha a coleta se tudo terminal
  const { data: after } = await sb
    .from('source_results').select('connector, status, result_flag, parsed, cost_brl, created_at')
    .eq('request_id', req.id)
  const byConn = {}
  for (const r of after || []) (byConn[r.connector] = byConn[r.connector] || []).push(r)
  const allTerminal = plan.every((slug) => isTerminal(byConn[slug] || []))
  const cost = (after || []).reduce((s, r) => s + Number(r.cost_brl || 0), 0)
  const upd = { cost_brl: Math.round(cost * 100) / 100 }
  if (allTerminal) {
    // Score EQPI + parecer (§8) na virada p/ rendering (PDF = estágio 7)
    const sources = {}
    for (const slug of plan) {
      const rows = (byConn[slug] || []).slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      sources[slug] = rows.find((r) => r.status === 'ok' || r.status === 'not_found') || rows[0] || null
    }
    const { data: wRow } = await sb.from('bc_config').select('value').eq('key', 'score_weights').maybeSingle()
    const { computeScore } = require('./score.js')
    const { score, band, parecer } = computeScore(sources, wRow?.value || {})
    upd.status = 'rendering'
    upd.score_eqpi = score
    upd.risk_band = band
    upd.parecer = parecer
  }
  await sb.from('report_requests').update(upd).eq('id', req.id).in('status', ['collecting'])
  return allTerminal
}

// passada do worker: processa os requests abertos dentro do orçamento
async function processOpenRequests({ budgetMs = 18000, requestId = null } = {}) {
  const sb = admin()
  const deadline = Date.now() + budgetMs
  const log = []
  let q = sb.from('report_requests')
    .select('id, cnpj, supplier_id, tipo, status, force_refresh_bureau, requested_by, created_at')
    .in('status', ['pending', 'collecting'])
    .order('created_at', { ascending: true }).limit(5)
  if (requestId) q = q.eq('id', requestId)
  const { data: reqs, error } = await q
  if (error) throw new Error(`report_requests: ${error.message}`)
  const done = []
  for (const req of reqs || []) {
    if (deadline - Date.now() < 4000) break
    try {
      const finished = await processRequest(sb, req, deadline, log)
      done.push({ id: req.id, cnpj: req.cnpj, collected: finished })
    } catch (e) {
      log.push(`${req.cnpj}: ERRO ${e.message}`)
      console.error('[bc-orq]', req.id, e)
    }
  }
  return { processed: done, log }
}

module.exports = { processOpenRequests, planFor, MAX_ATTEMPTS, RETRY_BACKOFF_MIN }
