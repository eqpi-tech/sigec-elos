// homolog-ai-review-background.js — Rota B: pré-análise por IA (SPEC_ROTA_B.md)
// Background (até 15 min). Processa a fila ai_review_jobs (patch_109): baixa o
// arquivo enviado pelo fornecedor, prepara (PDF com texto → texto com CPF/RG
// mascarados; escaneado → o PDF; imagem → imagem), aplica a regra do cliente
// e grava a sugestão NO JOB — o documento continua PENDING e quem decide é o
// analista. O estágio do processo é recalculado pelos gatilhos do banco.
//
// Disparado a cada 15 min (homolog-collect-cron / workflow do staging) e pelo
// botão "Pré-analisar" do backoffice (homolog-ai-review-request). POST com
// Bearer CRON_SECRET.

const { createClient } = require('@supabase/supabase-js')
const { env } = require('./lib/runtime_env.js')
const { Anthropic, revisar, prepararArquivo, MODEL, PROMPT_VERSION } = require('./lib/ai_review/index.js')

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } })

const enabled = () => env('ROUTE_B_ENABLED') === 'true'
// teto de gasto por dia (R$) — protege o saldo da API: atingido, a fila espera o dia seguinte
const LIMITE_DIA = () => Number(env('ROUTE_B_DAILY_LIMIT_BRL') || 5)
async function gastoHoje() {
  const inicio = new Date(`${hojeSP()}T00:00:00-03:00`).toISOString()
  const { data } = await sb.from('ai_review_jobs').select('cost_brl').gte('finished_at', inicio)
  return (data || []).reduce((a, j) => a + Number(j.cost_brl || 0), 0)
}
const CONCORRENCIA = 3
const MAX_ATTEMPTS = 3
const RETRY_MIN = 15

const hojeSP = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })   // AAAA-MM-DD

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

async function processar(job, catalogo, motivos, client) {
  // o documento ainda está esperando análise, com ESTE arquivo?
  const { data: doc } = await sb.from('documents').select('id, status, storage_path, type').eq('id', job.document_id).maybeSingle()
  if (!doc) return { status: 'skipped', last_error: 'documento excluído' }
  if (doc.storage_path !== job.storage_path) return { status: 'skipped', last_error: 'arquivo substituído pelo fornecedor' }
  if (doc.status !== 'PENDING' && !job.requested_by) return { status: 'skipped', last_error: `documento já analisado (${doc.status})` }

  const tipo = catalogo[job.doc_type]
  if (!tipo?.validation_rule) return { status: 'skipped', last_error: 'tipo sem regra de validação cadastrada' }
  const forn = await fornecedor(job.supplier_id)
  if (!forn) return { status: 'skipped', last_error: 'fornecedor não encontrado' }

  const { data: blob, error: dlErr } = await sb.storage.from('documents').download(job.storage_path)
  if (dlErr || !blob) throw new Error(`download: ${dlErr?.message || 'arquivo não encontrado'}`)
  const arquivo = await prepararArquivo(Buffer.from(await blob.arrayBuffer()))
  if (arquivo.modo === 'pular') return { status: 'skipped', last_error: arquivo.motivo, pages: arquivo.paginas || null }

  const r = await revisar({
    client, motivos, tipo: job.doc_type, tipoNome: tipo.name, regra: tipo.validation_rule,
    fornecedor: forn, dataReferencia: hojeSP(), arquivo,
  })
  if (!r.resultado) {
    // resposta cortada/recusada: não inventar sugestão
    return { status: 'error', last_error: `IA sem resultado estruturado (${r.stop_reason})`, cost_brl: r.custo_brl, model: r.model, prompt_version: r.prompt_version }
  }
  return {
    status: 'done', last_error: null,
    verdict: r.resultado.veredito,
    confidence: Math.max(0, Math.min(1, Number(r.resultado.confianca) || 0)),
    result: { ...r.resultado, stop_reason: r.stop_reason, ms: r.ms, usage: r.usage, data_referencia: hojeSP() },
    input_mode: arquivo.modo, pages: arquivo.paginas || null,
    model: r.model, prompt_version: r.prompt_version, cost_brl: r.custo_brl,
  }
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
  let feitos = 0, custo = 0

  let gasto = await gastoHoje()
  while (Date.now() < deadline - 90000) {
    if (gasto >= LIMITE_DIA()) {
      console.warn(`[rota-b] teto diário atingido (R$ ${gasto.toFixed(2)} de R$ ${LIMITE_DIA()}) — fila retomada amanhã`)
      break
    }
    const { data: jobs } = await sb.from('ai_review_jobs').select('*')
      .in('status', ['queued', 'retry']).lte('next_attempt_at', new Date().toISOString())
      .order('next_attempt_at').limit(CONCORRENCIA * 3)
    if (!jobs?.length) break

    for (let i = 0; i < jobs.length && Date.now() < deadline - 90000; i += CONCORRENCIA) {
      await Promise.allSettled(jobs.slice(i, i + CONCORRENCIA).map(async (job) => {
        // claim atômico: dois workers nunca pagam a mesma análise
        const { data: claimed } = await sb.from('ai_review_jobs')
          .update({ status: 'running' }).eq('id', job.id).in('status', ['queued', 'retry']).select('id')
        if (!claimed?.length) return
        let fim
        try { fim = await processar(job, catalogo, motivos, client) }
        catch (e) {
          const tentativas = job.attempts + 1
          fim = { status: tentativas >= MAX_ATTEMPTS ? 'error' : 'retry', attempts: tentativas,
                  last_error: String(e.message || e).slice(0, 300),
                  next_attempt_at: new Date(Date.now() + RETRY_MIN * 60000).toISOString() }
          console.warn(`[rota-b] ${job.doc_type}/${job.document_id}: ${fim.last_error}`)
        }
        const terminal = ['done', 'skipped', 'error'].includes(fim.status)
        await sb.from('ai_review_jobs').update({
          ...fim,
          attempts: fim.attempts ?? job.attempts + 1,
          cost_brl: Number(job.cost_brl || 0) + Number(fim.cost_brl || 0),   // acumula entre tentativas
          ...(terminal ? { finished_at: new Date().toISOString() } : {}),
        }).eq('id', job.id)
        feitos++; custo += Number(fim.cost_brl || 0); gasto += Number(fim.cost_brl || 0)
      }))
    }
  }
  console.log(`[rota-b] ${feitos} arquivo(s) pré-analisado(s) · ${MODEL}/${PROMPT_VERSION} · R$ ${custo.toFixed(2)}`)
  return { statusCode: 200 }
}
