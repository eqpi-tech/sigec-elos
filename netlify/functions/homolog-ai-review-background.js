// homolog-ai-review-background.js — Rota B: pré-análise por IA (SPEC_ROTA_B.md)
// Background (até 15 min). Processa a fila ai_review_jobs (patch_109/110):
// baixa o arquivo enviado pelo fornecedor, prepara (PDF com texto → texto com
// CPF/RG mascarados; escaneado → o PDF; imagem → imagem), aplica a regra do
// cliente e grava a sugestão NO JOB — o documento continua PENDING e quem
// decide é o analista. O estágio do processo é recalculado pelos gatilhos.
//
// Economia (28/09): por padrão usa o MODO LOTE da API (50% do preço; o prazo
// de análise é de dias, não segundos). Cada rodada (1) recolhe os lotes
// prontos e (2) envia os arquivos novos num lote só, esperando alguns minutos
// pelo resultado quando dá. ROUTE_B_MODE=sync volta à chamada direta.
// Teto de gasto diário: ROUTE_B_DAILY_LIMIT_BRL (padrão R$ 5).
//
// Disparado a cada 15 min (homolog-collect-cron / workflow do staging) e pelo
// botão "Pré-analisar" do backoffice (homolog-ai-review-request). POST com
// Bearer CRON_SECRET.

const { createClient } = require('@supabase/supabase-js')
const { env } = require('./lib/runtime_env.js')
const { Anthropic, montarRequisicao, lerResposta, revisar, prepararArquivo, MODEL, PROMPT_VERSION, EFFORT } = require('./lib/ai_review/index.js')

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } })

const enabled = () => env('ROUTE_B_ENABLED') === 'true'
const modoLote = () => (env('ROUTE_B_MODE') || 'batch') !== 'sync'
const LIMITE_DIA = () => Number(env('ROUTE_B_DAILY_LIMIT_BRL') || 5)
const CUSTO_ESTIMADO = 0.15        // R$ por arquivo ainda sem custo apurado (lote em andamento)
const POR_RODADA = 20              // arquivos por lote
const CONCORRENCIA = 3             // modo direto
const MAX_ATTEMPTS = 3
const RETRY_MIN = 15
const LOTE_VENCIDO_H = 25          // a API encerra o lote em até 24 h

const hojeSP = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })   // AAAA-MM-DD

// gasto do dia: custo apurado + estimativa do que está no lote em andamento
async function gastoHoje() {
  const inicio = new Date(`${hojeSP()}T00:00:00-03:00`).toISOString()
  const [{ data: fim }, { count: emLote }] = await Promise.all([
    sb.from('ai_review_jobs').select('cost_brl').gte('finished_at', inicio),
    sb.from('ai_review_jobs').select('id', { count: 'exact', head: true }).eq('status', 'running').not('batch_id', 'is', null),
  ])
  return (fim || []).reduce((a, j) => a + Number(j.cost_brl || 0), 0) + (emLote || 0) * CUSTO_ESTIMADO
}

// dados do cadastro + categorias dos processos abertos do fornecedor
const cacheForn = new Map()
async function fornecedor(supplierId) {
  if (cacheForn.has(supplierId)) return cacheForn.get(supplierId)
  const [{ data: sup }, { data: consulta }, { data: seals }] = await Promise.all([
    sb.from('suppliers').select('id, cnpj, razao_social, city, state, tipo_empresa, regime_tributario').eq('id', supplierId).single(),
    sb.from('cnpj_consultations').select('cnpj_data').eq('supplier_id', supplierId)
      .order('consulted_at', { ascending: false }).limit(1).maybeSingle(),
    sb.from('seals').select('client_id').eq('supplier_id', supplierId).in('status', ['PENDING', 'ACTIVE']),
  ])
  const cd = consulta?.cnpj_data || {}
  const clientes = [...new Set((seals || []).map((s) => s.client_id).filter(Boolean))]
  let categorias = []
  if (clientes.length) {
    const { data: sc } = await sb.from('supplier_categories')
      .select('categories!inner(name, client_id)').eq('supplier_id', supplierId).in('categories.client_id', clientes)
    categorias = [...new Set((sc || []).map((r) => r.categories?.name).filter(Boolean))]
  }
  const f = sup && {
    cnpj: sup.cnpj,
    razao_social: sup.razao_social || cd.razao_social,
    municipio: [sup.city || cd.municipio, sup.state || cd.uf].filter(Boolean).join('/') || null,
    tipo_empresa: sup.tipo_empresa || cd.natureza_juridica || null,
    regime_tributario: sup.regime_tributario || null,
    categorias,
  }
  cacheForn.set(supplierId, f)
  return f
}

// Prepara o job: confere se ainda vale analisar e monta os argumentos da IA.
// Devolve { args } ou { fim } (terminal, sem chamar a IA).
async function preparar(job, catalogo, motivos) {
  const { data: doc } = await sb.from('documents').select('id, status, storage_path, type').eq('id', job.document_id).maybeSingle()
  if (!doc) return { fim: { status: 'skipped', last_error: 'documento excluído' } }
  if (doc.storage_path !== job.storage_path) return { fim: { status: 'skipped', last_error: 'arquivo substituído pelo fornecedor' } }
  if (doc.status !== 'PENDING' && !job.requested_by) return { fim: { status: 'skipped', last_error: `documento já analisado (${doc.status})` } }

  const tipo = catalogo[job.doc_type]
  if (!tipo?.validation_rule) return { fim: { status: 'skipped', last_error: 'tipo sem regra de validação cadastrada' } }
  const forn = await fornecedor(job.supplier_id)
  if (!forn) return { fim: { status: 'skipped', last_error: 'fornecedor não encontrado' } }

  const { data: blob, error: dlErr } = await sb.storage.from('documents').download(job.storage_path)
  if (dlErr || !blob) throw new Error(`download: ${dlErr?.message || 'arquivo não encontrado'}`)
  const arquivo = await prepararArquivo(Buffer.from(await blob.arrayBuffer()))
  if (arquivo.modo === 'pular') return { fim: { status: 'skipped', last_error: arquivo.motivo, pages: arquivo.paginas || null } }

  return {
    args: { motivos, tipo: job.doc_type, tipoNome: tipo.name, regra: tipo.validation_rule, fornecedor: forn, dataReferencia: hojeSP(), arquivo },
    meta: { input_mode: arquivo.modo, pages: arquivo.paginas || null },
  }
}

// resposta da IA → campos do job
function concluir(r, meta) {
  if (!r.resultado) {
    // resposta cortada/recusada/fora do formato: não inventar sugestão
    return { status: 'error', last_error: `IA sem resultado estruturado (${r.stop_reason})`, cost_brl: r.custo_brl, model: r.model, prompt_version: r.prompt_version, ...meta }
  }
  return {
    status: 'done', last_error: null,
    verdict: r.resultado.veredito,
    confidence: Math.max(0, Math.min(1, Number(r.resultado.confianca) || 0)),
    result: { ...r.resultado, stop_reason: r.stop_reason, usage: r.usage, effort: r.effort, lote: !!r.lote, data_referencia: meta.data_referencia || hojeSP() },
    model: r.model, prompt_version: r.prompt_version, cost_brl: r.custo_brl, ...meta,
  }
}

function falha(job, e) {
  const tentativas = job.attempts + 1
  return { status: tentativas >= MAX_ATTEMPTS ? 'error' : 'retry', attempts: tentativas,
           last_error: String(e?.message || e).slice(0, 300), batch_id: null,
           next_attempt_at: new Date(Date.now() + RETRY_MIN * 60000).toISOString() }
}

// doLote: só grava se o job ainda espera ESTE lote — duas rodadas recolhendo
// o mesmo lote nunca somam o custo duas vezes
async function gravar(job, fim, { doLote = null } = {}) {
  const { data_referencia, ...campos } = fim   // data_referencia só vai dentro de result
  const terminal = ['done', 'skipped', 'error'].includes(campos.status)
  const upd = sb.from('ai_review_jobs').update({
    ...campos,
    attempts: campos.attempts ?? job.attempts + 1,
    cost_brl: Number(job.cost_brl || 0) + Number(campos.cost_brl || 0),   // acumula entre tentativas
    ...(terminal ? { finished_at: new Date().toISOString() } : {}),
  })
  let q = upd.eq('id', job.id)
  if (doLote) q = q.eq('status', 'running').eq('batch_id', doLote)
  await q
}

// claim atômico: dois workers nunca pagam a mesma análise
async function reivindicar(limite) {
  const { data: jobs } = await sb.from('ai_review_jobs').select('*')
    .in('status', ['queued', 'retry']).lte('next_attempt_at', new Date().toISOString())
    .order('doc_type').order('next_attempt_at').limit(limite)   // mesmo tipo junto: aproveita o cache da regra
  const meus = []
  for (const job of jobs || []) {
    const { data: ok } = await sb.from('ai_review_jobs')
      .update({ status: 'running', batch_id: null }).eq('id', job.id).in('status', ['queued', 'retry']).select('id')
    if (ok?.length) meus.push(job)
  }
  return meus
}

// ── modo lote ────────────────────────────────────────────────────────────
// Recolhe os lotes encerrados. Devolve quantos jobs ainda esperam.
async function recolherLotes(client) {
  const { data: esperando } = await sb.from('ai_review_jobs').select('*').eq('status', 'running').not('batch_id', 'is', null)
  if (!esperando?.length) return { pendentes: 0, feitos: 0, custo: 0 }
  const porLote = {}
  for (const j of esperando) (porLote[j.batch_id] ||= []).push(j)
  let pendentes = 0, feitos = 0, custo = 0
  for (const [batchId, jobs] of Object.entries(porLote)) {
    const lote = await client.messages.batches.retrieve(batchId)
    if (lote.processing_status !== 'ended') {
      const velho = jobs.every((j) => j.submitted_at && Date.now() - new Date(j.submitted_at) > LOTE_VENCIDO_H * 3600e3)
      if (velho) { for (const j of jobs) await gravar(j, falha(j, 'lote não encerrou em 24 h'), { doLote: batchId }) }
      else pendentes += jobs.length
      continue
    }
    const porId = Object.fromEntries(jobs.map((j) => [j.id, j]))
    for await (const item of await client.messages.batches.results(batchId)) {
      const job = porId[item.custom_id]
      if (!job) continue
      delete porId[item.custom_id]
      const meta = { input_mode: job.input_mode, pages: job.pages, data_referencia: job.submitted_at ? new Date(job.submitted_at).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) : hojeSP() }
      let fim
      if (item.result.type === 'succeeded') {
        fim = concluir({ ...lerResposta(item.result.message, { lote: true }), lote: true }, meta)
      } else {
        const tipoErro = item.result.type === 'errored' ? item.result.error?.error?.type || item.result.error?.type : item.result.type
        fim = falha(job, `lote: ${tipoErro}`)
        if (tipoErro === 'invalid_request_error' || tipoErro === 'invalid_request') fim.status = 'error'   // reenviar igual não resolve
      }
      await gravar(job, fim, { doLote: batchId })
      feitos++; custo += Number(fim.cost_brl || 0)
    }
    for (const j of Object.values(porId)) await gravar(j, falha(j, 'resultado ausente no lote'), { doLote: batchId })
  }
  return { pendentes, feitos, custo }
}

// Envia os arquivos da fila num lote. Devolve o batch_id (ou null).
async function enviarLote(client, catalogo, motivos, limite) {
  const jobs = await reivindicar(Math.min(POR_RODADA, limite))
  if (!jobs.length) return null
  const requests = [], enviados = []
  for (const job of jobs) {
    try {
      const p = await preparar(job, catalogo, motivos)
      if (p.fim) { await gravar(job, p.fim); continue }
      requests.push({ custom_id: job.id, params: montarRequisicao(p.args) })
      enviados.push({ job, meta: p.meta })
    } catch (e) { await gravar(job, falha(job, e)) }
  }
  if (!requests.length) return null
  try {
    const lote = await client.messages.batches.create({ requests })
    const agora = new Date().toISOString()
    for (const { job, meta } of enviados) {
      await sb.from('ai_review_jobs').update({ batch_id: lote.id, submitted_at: agora, model: MODEL, prompt_version: PROMPT_VERSION, ...meta }).eq('id', job.id)
    }
    console.log(`[rota-b] lote ${lote.id}: ${requests.length} arquivo(s)`)
    return lote.id
  } catch (e) {
    for (const { job } of enviados) await gravar(job, falha(job, e))
    throw e
  }
}

// ── modo direto ──────────────────────────────────────────────────────────
async function rodadaDireta(client, catalogo, motivos, deadline) {
  let feitos = 0, custo = 0, gasto = await gastoHoje()
  while (Date.now() < deadline - 90000 && gasto < LIMITE_DIA()) {
    const jobs = await reivindicar(CONCORRENCIA)
    if (!jobs.length) break
    await Promise.allSettled(jobs.map(async (job) => {
      let fim
      try {
        const p = await preparar(job, catalogo, motivos)
        fim = p.fim || concluir(await revisar({ client, ...p.args }), p.meta)
      } catch (e) { fim = falha(job, e) }
      await gravar(job, fim)
      feitos++; custo += Number(fim.cost_brl || 0); gasto += Number(fim.cost_brl || 0)
    }))
  }
  return { feitos, custo }
}

exports.handler = async (event) => {
  const bearer = (event.headers?.authorization || '').replace('Bearer ', '')
  if (!process.env.CRON_SECRET || bearer !== process.env.CRON_SECRET) return { statusCode: 401 }
  if (!enabled()) { console.log('[rota-b] ROUTE_B_ENABLED desligado — nada a fazer'); return { statusCode: 200 } }
  if (!process.env.ANTHROPIC_API_KEY) { console.warn('[rota-b] ANTHROPIC_API_KEY ausente'); return { statusCode: 200 } }

  const deadline = Date.now() + 13 * 60 * 1000
  const client = new Anthropic()
  const [{ data: cat }, { data: rr }] = await Promise.all([
    sb.from('documents_catalog').select('id, name, validation_rule').eq('route', 'B'),
    sb.from('rejection_reasons').select('code, label').eq('active', true).in('applies_to', ['document', 'both']).order('code'),
  ])
  const catalogo = Object.fromEntries((cat || []).map((d) => [String(d.id), d]))
  const motivos = rr || []

  if (!modoLote()) {
    const r = await rodadaDireta(client, catalogo, motivos, deadline)
    console.log(`[rota-b] direto: ${r.feitos} arquivo(s) · ${MODEL}/${PROMPT_VERSION}/${EFFORT} · R$ ${r.custo.toFixed(2)}`)
    return { statusCode: 200 }
  }

  // 1. recolhe o que já ficou pronto; 2. envia o novo (dentro do teto do dia);
  // 3. se enviou agora, espera alguns minutos — lotes pequenos costumam sair rápido
  let r = await recolherLotes(client)
  const gasto = await gastoHoje()
  const folga = Math.floor((LIMITE_DIA() - gasto) / CUSTO_ESTIMADO)
  let enviado = null
  if (folga > 0) enviado = await enviarLote(client, catalogo, motivos, folga)
  else console.warn(`[rota-b] teto diário atingido (≈ R$ ${gasto.toFixed(2)} de R$ ${LIMITE_DIA()}) — fila retomada amanhã`)
  let feitos = r.feitos, custo = r.custo
  if (enviado) {
    while (Date.now() < deadline - 60000) {
      await new Promise((ok) => setTimeout(ok, 30000))
      r = await recolherLotes(client)
      feitos += r.feitos; custo += r.custo
      if (!r.pendentes) break
    }
  }
  console.log(`[rota-b] lote: ${feitos} resultado(s) gravado(s) · ${r.pendentes} aguardando · ${MODEL}/${PROMPT_VERSION}/${EFFORT} · R$ ${custo.toFixed(2)}`)
  return { statusCode: 200 }
}
