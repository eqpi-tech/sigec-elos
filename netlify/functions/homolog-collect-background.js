// homolog-collect-background.js — coletor da Rota A (homologação automática, fase 1)
// Background (até 15 min). Processa a fila auto_collect_jobs: consulta a fonte
// oficial pelo conector do BC Report, guarda o comprovante oficial como arquivo
// do documento e grava o documento como PENDING com a sugestão para o analista.
// Nada é aprovado nem reprovado aqui (princípio da fase 1). O estágio do
// processo é recalculado pelos gatilhos do banco (patch_098).
//
// Disparado ao fim do cadastro (create-supplier) e a cada 15 min pelo
// homolog-collect-cron para novas tentativas. POST com Bearer CRON_SECRET.

const { createClient } = require('@supabase/supabase-js')
const { downloadReceipt } = require('./lib/infosimples.js')
const { ROUTE_A, enabled, avaliar, custo, connectorFor, MAX_ATTEMPTS, RETRY_MIN } = require('./lib/route_a.js')
const { requiredDocsForSeal } = require('./lib/required_docs.js')
const { guardMail } = require('./lib/mail_guard.js')
const registry = require('./lib/connectors/index.js')

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } })

const CONCORRENCIA = 4
const TIMEOUT_FONTE_MS = 120000

// contexto p/ os conectores que dependem de UF/município (Sefaz, Sintegra,
// prefeitura): consulta de CNPJ do cadastro; sem ela, BrasilAPI na hora
const cacheCtx = new Map()
const consultasDaRodada = new Map()   // `${fornecedor}:${conector}` → Promise<{raw, parsed}>
async function contexto(supplierId) {
  if (cacheCtx.has(supplierId)) return cacheCtx.get(supplierId)
  const [{ data: sup }, { data: consulta }] = await Promise.all([
    sb.from('suppliers').select('id, cnpj, razao_social, user_id, email').eq('id', supplierId).single(),
    sb.from('cnpj_consultations').select('cnpj_data').eq('supplier_id', supplierId)
      .order('consulted_at', { ascending: false }).limit(1).maybeSingle(),
  ])
  let cd = consulta?.cnpj_data || {}
  if (sup && (!cd.uf || !cd.municipio)) {
    try { cd = await registry.cnpj_base.fetch({ cnpj: sup.cnpj }) } catch (e) { console.warn('[rota-a] BrasilAPI:', e.message) }
  }
  const ctx = {
    sup,
    company: { razao_social: sup?.razao_social || cd.razao_social, uf: cd.uf, municipio: cd.municipio },
  }
  cacheCtx.set(supplierId, ctx)
  return ctx
}

async function processar(job, catalogo, prefOverrides) {
  const { sup, company } = await contexto(job.supplier_id)
  if (!sup) return { status: 'fallback', last_error: 'fornecedor não encontrado' }

  // já tem documento válido deste tipo, com folga de validade: não paga a consulta
  const { data: atual } = await sb.from('documents')
    .select('id, status, expires_at, source, storage_path, metadata').eq('supplier_id', sup.id).eq('type', job.doc_type).maybeSingle()
  if (atual?.status === 'VALID' && atual.expires_at && new Date(atual.expires_at) > new Date(Date.now() + 30 * 864e5)) {
    return { status: 'done', last_error: 'documento válido já existente — reaproveitado' }
  }
  // o fornecedor foi mais rápido e já enviou o arquivo: nunca sobrescrever
  if (atual?.source === 'MANUAL' && atual.storage_path && ['PENDING', 'VALID', 'EXPIRING'].includes(atual.status)) {
    return { status: 'done', last_error: 'enviado pelo fornecedor antes da coleta' }
  }

  const c = connectorFor(job.doc_type)
  if (!c) return { status: 'fallback', last_error: `sem conector para o tipo ${job.doc_type}` }
  // a mesma fonte serve a mais de um tipo (ex.: CND municipal 6 e 10040) — paga uma vez
  const chave = `${sup.id}:${ROUTE_A[job.doc_type].connector}`
  if (!consultasDaRodada.has(chave)) {
    consultasDaRodada.set(chave, (async () => {
      try {
        const raw = await Promise.race([
          c.fetch({ cnpj: sup.cnpj, company, socios: [], tipo: 'full', prefOverrides, supplierId: sup.id }),
          new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout ${TIMEOUT_FONTE_MS}ms`)), TIMEOUT_FONTE_MS)),
        ])
        return { raw, parsed: c.parse(raw), primeira: true }
      } catch (e) {
        return { raw: null, parsed: { result_flag: 'indisponivel', headline: String(e.message || e).slice(0, 200) }, primeira: true }
      }
    })())
  }
  const consulta = await consultasDaRodada.get(chave)
  const { raw, parsed } = consulta
  const gasto = consulta.primeira ? custo(c, raw) : 0
  consulta.primeira = false
  const r = avaliar(job.doc_type, raw, parsed)

  if (r.indisponivel) {
    const tentativas = job.attempts + 1
    // nova coleta falhou: um documento de coleta anterior ainda em análise
    // sai da fila (senão o analista veria uma sugestão velha)
    if ((r.permanente || tentativas >= MAX_ATTEMPTS) && atual?.metadata?.route === 'A' && atual.status === 'PENDING') {
      await sb.from('documents').update({ status: 'MISSING', storage_path: null, expires_at: null,
        metadata: { ...atual.metadata, route: null, coleta_anterior: atual.metadata.consulta, consulta: null } }).eq('id', atual.id)
    }
    return r.permanente || tentativas >= MAX_ATTEMPTS
      ? { status: 'fallback', attempts: tentativas, last_error: r.motivo, cost_brl: gasto }
      : { status: 'retry', attempts: tentativas, last_error: r.motivo, cost_brl: gasto,
          next_attempt_at: new Date(Date.now() + RETRY_MIN * 60000).toISOString() }
  }

  // comprovante oficial vira o arquivo do documento (recibos da Infosimples expiram — baixar já)
  let storage_path = null, sha256 = null, comprovante_tipo = null
  if (r.comprovante) {
    try {
      const rec = await downloadReceipt(r.comprovante)
      storage_path = `${sup.user_id || sup.id}/${job.doc_type}_fonte_${Date.now()}.${rec.ext}`
      const { error: upErr } = await sb.storage.from('documents')
        .upload(storage_path, rec.buf, { contentType: rec.contentType, upsert: true })
      if (upErr) throw new Error(upErr.message)
      sha256 = rec.sha256
      comprovante_tipo = 'fonte'
    } catch (e) {
      console.warn(`[rota-a] comprovante ${job.doc_type}/${sup.cnpj}: ${e.message}`)
      storage_path = null
    }
  }
  // fonte sem comprovante próprio (ex.: Lista Suja, lista baixada do MTE):
  // o ELOS gera o registro da consulta, para o analista ter o que abrir
  if (!storage_path) {
    try {
      const html = registroConsulta({ sup, docNome: catalogo[job.doc_type] || job.doc_type, fonte: ROUTE_A[job.doc_type].connector, r })
      const buf = Buffer.from(html, 'utf8')
      storage_path = `${sup.user_id || sup.id}/${job.doc_type}_consulta_${Date.now()}.html`
      const { error: upErr } = await sb.storage.from('documents')
        .upload(storage_path, buf, { contentType: 'text/html; charset=utf-8', upsert: true })
      if (upErr) throw new Error(upErr.message)
      sha256 = require('crypto').createHash('sha256').update(buf).digest('hex')
      comprovante_tipo = 'registro_elos'
    } catch (e) {
      console.warn(`[rota-a] registro ${job.doc_type}/${sup.cnpj}: ${e.message}`)
      storage_path = null
    }
  }

  const agora = new Date().toISOString()
  const { error: docErr } = await sb.from('documents').upsert({
    supplier_id: sup.id,
    type: job.doc_type,
    label: catalogo[job.doc_type] || job.doc_type,
    source: 'AUTO',
    status: 'PENDING',                       // fase 1: o analista confirma
    storage_path,
    expires_at: r.validade ? r.validade.toISOString() : null,
    issued_at: r.emissao ? r.emissao.toISOString() : null,
    submitted_at: agora,
    metadata: {
      route: 'A',
      consulta: {
        fonte: ROUTE_A[job.doc_type].connector,
        resultado: r.resultado,
        sugestao: r.sugestao,
        motivo: r.motivo,
        codigo: r.codigo,
        emissao: r.emissao ? r.emissao.toISOString().slice(0, 10) : null,
        validade_fonte: r.validade ? r.validade.toISOString().slice(0, 10) : null,
        comprovante_sha256: sha256,
        comprovante_tipo,
        dados: r.dados,
        coletado_em: agora,
      },
    },
  }, { onConflict: 'supplier_id,type' })
  if (docErr) throw new Error(`documents: ${docErr.message}`)

  return { status: 'done', attempts: job.attempts + 1, cost_brl: gasto, last_error: null }
}

const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
function registroConsulta({ sup, docNome, fonte, r }) {
  const cnpj = String(sup.cnpj).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
  const linhas = Object.entries(r.dados || {}).slice(0, 40)
    .map(([k, v]) => `<tr><td style="color:#6b7280;padding:3px 10px 3px 0">${esc(k)}</td><td>${esc(typeof v === 'object' ? JSON.stringify(v) : v)}</td></tr>`).join('')
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Registro de consulta — ${esc(docNome)}</title>
<body style="font-family:Arial,sans-serif;max-width:760px;margin:24px auto;color:#1f2937;font-size:14px">
<div style="border-bottom:3px solid #2E3192;padding-bottom:8px;margin-bottom:14px"><strong style="color:#2E3192">SIGEC-ELOS</strong> · Registro de consulta automática</div>
<p style="background:#fef3c7;padding:8px 12px;border-radius:6px;font-size:12px">A fonte não emite comprovante próprio. Este registro foi gerado pelo ELOS no momento da consulta.</p>
<table style="font-size:13px;margin:10px 0">
<tr><td style="color:#6b7280;padding:3px 10px 3px 0">Documento</td><td><strong>${esc(docNome)}</strong></td></tr>
<tr><td style="color:#6b7280;padding:3px 10px 3px 0">Empresa</td><td>${esc(sup.razao_social)} — CNPJ ${esc(cnpj)}</td></tr>
<tr><td style="color:#6b7280;padding:3px 10px 3px 0">Fonte</td><td>${esc(fonte)}</td></tr>
<tr><td style="color:#6b7280;padding:3px 10px 3px 0">Consultado em</td><td>${esc(new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }))}</td></tr>
<tr><td style="color:#6b7280;padding:3px 10px 3px 0">Resultado</td><td><strong>${esc(r.motivo)}</strong></td></tr>
</table>
${linhas ? `<h4 style="margin:16px 0 6px">Dados devolvidos pela fonte</h4><table style="font-size:12px">${linhas}</table>` : ''}
</body></html>`
}

// Fim da coleta de um processo: avisa o fornecedor do que já foi obtido e do
// que falta (uma vez por processo — registrado em audit_log)
async function avisarFornecedor(sealId) {
  const { data: pend } = await sb.from('auto_collect_jobs').select('id')
    .eq('seal_id', sealId).in('status', ['queued', 'running', 'retry']).limit(1)
  if (pend?.length) return
  const { data: ja } = await sb.from('audit_log').select('id')
    .eq('action', 'AUTO_COLLECT_DONE').eq('entity_id', sealId).limit(1)
  if (ja?.length) return

  const { data: seal } = await sb.from('seals')
    .select('id, supplier_id, client_id, flow_id, clients(nome_fantasia, razao_social), suppliers(razao_social, email, user_id)')
    .eq('id', sealId).single()
  const exigidos = (await requiredDocsForSeal(sb, seal.supplier_id, seal)).map(String)
  const [{ data: docs }, { data: cat }] = await Promise.all([
    sb.from('documents').select('type, status, metadata').eq('supplier_id', seal.supplier_id).in('type', exigidos),
    sb.from('documents_catalog').select('id, name').in('id', exigidos.map(Number)),
  ])
  const nome = Object.fromEntries((cat || []).map((d) => [String(d.id), d.name]))
  const porTipo = Object.fromEntries((docs || []).map((d) => [d.type, d]))
  const obtidos = exigidos.filter((t) => porTipo[t]?.metadata?.route === 'A')
  const faltam = exigidos.filter((t) => !porTipo[t] || ['MISSING', 'REJECTED', 'EXPIRED'].includes(porTipo[t].status))

  let to = seal.suppliers?.email
  if (seal.suppliers?.user_id) {
    const { data: u } = await sb.auth.admin.getUserById(seal.suppliers.user_id)
    to = u?.user?.email || to
  }
  const cliente = seal.clients?.nome_fantasia || seal.clients?.razao_social
  const lis = (arr) => arr.map((t) => `<li style="margin-bottom:5px">${nome[t] || t}</li>`).join('')
  const html = `<div style="font-family:Arial,sans-serif;max-width:540px;margin:0 auto">
  <div style="background:#2E3192;padding:24px;border-radius:12px 12px 0 0;text-align:center">
    <h1 style="color:#fff;margin:0;font-size:20px">SIGEC-ELOS</h1></div>
  <div style="background:#fff;padding:26px;border:1px solid #e2e8f0;border-top:none;color:#374151;font-size:15px;line-height:1.6">
    <p>Consultamos as fontes oficiais para a sua homologação${cliente ? ` com a <strong>${cliente}</strong>` : ''}.</p>
    ${obtidos.length ? `<p><strong>✅ Já obtivemos automaticamente (${obtidos.length}):</strong></p><ul style="padding-left:18px">${lis(obtidos)}</ul>
    <p style="font-size:13px;color:#6b7280">Esses documentos você não precisa enviar — nossa equipe vai conferi-los.</p>` : ''}
    ${faltam.length ? `<p><strong>📄 Falta você enviar (${faltam.length}):</strong></p><ul style="padding-left:18px">${lis(faltam)}</ul>` : '<p>Não falta nenhum documento. 🎉</p>'}
    <p style="text-align:center;margin:24px 0 8px"><a href="https://elos.eqpitech.com.br/fornecedor/documentos" style="display:inline-block;background:#F47E2F;color:#fff;padding:13px 30px;border-radius:9px;text-decoration:none;font-weight:bold">${faltam.length ? 'Enviar documentos' : 'Ver meus documentos'}</a></p>
  </div>
  <div style="background:#f8fafc;padding:12px;border-radius:0 0 12px 12px;text-align:center;font-size:11px;color:#9aa1b5">EQPI Tech · SIGEC-ELOS · elos.eqpitech.com.br</div></div>`

  const subject = faltam.length
    ? `📋 Homologação: ${obtidos.length} documento(s) já obtidos, faltam ${faltam.length} — SIGEC-ELOS`
    : '✅ Homologação: documentos completos — SIGEC-ELOS'
  const g = guardMail(to, subject)
  if (!g.skip && process.env.RESEND_API_KEY) {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      body: JSON.stringify({ from: process.env.EMAIL_FROM || 'noreply@eqpitech.com.br', to: g.to, subject: g.subject, html }),
    }).catch((e) => console.warn('[rota-a] e-mail:', e.message))
  }
  await sb.from('audit_log').insert({
    action: 'AUTO_COLLECT_DONE', entity_type: 'seal', entity_id: sealId,
    metadata: { obtidos: obtidos.length, faltam: faltam.length, email_enviado: !g.skip },
  })
}

exports.handler = async (event) => {
  const bearer = (event.headers?.authorization || '').replace('Bearer ', '')
  if (!process.env.CRON_SECRET || bearer !== process.env.CRON_SECRET) return { statusCode: 401 }
  if (!enabled()) { console.log('[rota-a] ROUTE_A_ENABLED desligado — nada a fazer'); return { statusCode: 200 } }

  const deadline = Date.now() + 13 * 60 * 1000
  const { data: cat } = await sb.from('documents_catalog').select('id, name').in('id', Object.keys(ROUTE_A).map(Number))
  const catalogo = Object.fromEntries((cat || []).map((d) => [String(d.id), d.name]))
  const { data: ov } = await sb.from('bc_config').select('value').eq('key', 'pref_slug_overrides').maybeSingle()
  const prefOverrides = ov?.value || {}
  const tocados = new Set()
  let feitos = 0

  while (Date.now() < deadline - 60000) {
    const { data: jobs } = await sb.from('auto_collect_jobs').select('*')
      .in('status', ['queued', 'retry']).lte('next_attempt_at', new Date().toISOString())
      .order('next_attempt_at').limit(CONCORRENCIA * 3)
    if (!jobs?.length) break

    for (let i = 0; i < jobs.length && Date.now() < deadline - 60000; i += CONCORRENCIA) {
      await Promise.allSettled(jobs.slice(i, i + CONCORRENCIA).map(async (job) => {
        // claim atômico: dois workers nunca pagam a mesma consulta
        const { data: claimed } = await sb.from('auto_collect_jobs')
          .update({ status: 'running' }).eq('id', job.id).in('status', ['queued', 'retry']).select('id')
        if (!claimed?.length) return
        let fim
        try { fim = await processar(job, catalogo, prefOverrides) }
        catch (e) {
          const tentativas = job.attempts + 1
          fim = { status: tentativas >= MAX_ATTEMPTS ? 'fallback' : 'retry', attempts: tentativas,
                  last_error: String(e.message).slice(0, 300),
                  next_attempt_at: new Date(Date.now() + RETRY_MIN * 60000).toISOString() }
        }
        const terminal = ['done', 'fallback'].includes(fim.status)
        await sb.from('auto_collect_jobs').update({
          ...fim, ...(terminal ? { finished_at: new Date().toISOString() } : {}),
        }).eq('id', job.id)
        tocados.add(job.seal_id); feitos++
      }))
    }
  }

  for (const sealId of tocados) {
    try { await avisarFornecedor(sealId) } catch (e) { console.warn('[rota-a] aviso:', e.message) }
  }
  console.log(`[rota-a] ${feitos} consulta(s) processada(s) em ${tocados.size} processo(s)`)
  return { statusCode: 200 }
}
