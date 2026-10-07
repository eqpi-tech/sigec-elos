// homolog-ai-review-request.js — Rota B: o analista pede a pré-análise por IA
// de um documento (primeira vez ou reanálise) e o processador é disparado na
// hora, em vez de esperar o ciclo de 15 min.
//
// POST body: { documentId }   Authorization: Bearer <JWT de ADMIN>

const { createClient } = require('@supabase/supabase-js')
const { env, functionsUrl } = require('./lib/runtime_env.js')

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}
const res = (statusCode, body) => ({ statusCode, headers: HEADERS, body: JSON.stringify(body) })

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: HEADERS, body: '' }
  if (event.httpMethod !== 'POST') return res(405, { error: 'Method not allowed' })
  if (env('ROUTE_B_ENABLED') !== 'true') return res(409, { error: 'Pré-análise por IA desligada neste ambiente' })

  const token = (event.headers.authorization || '').replace('Bearer ', '')
  if (!token) return res(401, { error: 'Token ausente' })
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  const { data: { user }, error: authErr } = await sb.auth.getUser(token)
  if (authErr || !user) return res(401, { error: 'Token inválido' })
  const { data: roleRow } = await sb.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'ADMIN').maybeSingle()
  if (!roleRow) return res(403, { error: 'Acesso negado' })

  let body
  try { body = JSON.parse(event.body || '{}') } catch { return res(400, { error: 'JSON inválido' }) }
  const { data: doc } = await sb.from('documents').select('id, supplier_id, type, storage_path, hoc_arquivo_id').eq('id', body.documentId).maybeSingle()
  if (!doc) return res(404, { error: 'Documento não encontrado' })
  // automação só em processo originado no ELOS (patch_121)
  if (doc.hoc_arquivo_id) return res(422, { error: 'Documento do HOC — a pré-análise por IA vale só para processos do ELOS' })
  const { data: elos } = await sb.rpc('supplier_has_open_elos_process', { p_supplier: doc.supplier_id })
  if (!elos) return res(422, { error: 'Fornecedor sem processo do ELOS aberto e liberado' })
  if (!doc.storage_path) return res(422, { error: 'Documento sem arquivo enviado' })
  const { data: tipo } = /^\d+$/.test(doc.type)
    ? await sb.from('documents_catalog').select('route, validation_rule').eq('id', Number(doc.type)).maybeSingle()
    : { data: null }
  if (tipo?.route !== 'B') return res(422, { error: 'Este tipo de documento não está na pré-análise por IA' })
  if (!tipo.validation_rule) return res(422, { error: 'Este tipo de documento não tem regra de validação cadastrada' })

  // mesma versão do arquivo: volta para a fila (reanálise); nova versão: novo job
  const { error } = await sb.from('ai_review_jobs').upsert({
    supplier_id: doc.supplier_id, document_id: doc.id, doc_type: doc.type, storage_path: doc.storage_path,
    status: 'queued', attempts: 0, next_attempt_at: new Date().toISOString(), last_error: null,
    verdict: null, confidence: null, result: null, finished_at: null, requested_by: user.id,
    batch_id: null, submitted_at: null,
  }, { onConflict: 'document_id,storage_path' })
  if (error) return res(500, { error: error.message })

  try {
    await fetch(`${functionsUrl()}/.netlify/functions/homolog-ai-review-background`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.CRON_SECRET}` },
      body: '{}',
    })
  } catch (e) { console.warn('[rota-b] disparo:', e.message) }
  return res(200, { ok: true })
}
