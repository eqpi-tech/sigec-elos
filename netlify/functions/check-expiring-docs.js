// netlify/functions/check-expiring-docs.js
// Verifica documentos vencendo em ≤30 dias e envia notificações por e-mail
// Chamado diariamente pelo GitHub Actions (.github/workflows/daily-notifications.yml)
// Também pode ser chamado manualmente: POST /.netlify/functions/check-expiring-docs
// com header Authorization: Bearer CRON_SECRET

const { createClient } = require('@supabase/supabase-js')
const { frontendUrl, env } = require('./lib/runtime_env.js')
const { guardMail } = require('./lib/mail_guard.js')
const routeA = require('./lib/route_a.js')
const { requiredDocsForSeal } = require('./lib/required_docs.js')

// send-email.js só exporta handler (HTTP endpoint), não funções reutilizáveis.
// Usamos fetch direto para a API do Resend.
async function sendEmailDirect({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) { console.warn('[check-expiring-docs] RESEND_API_KEY ausente — e-mail não enviado'); return }
  const g = guardMail(to, subject)   // trava: fora de produção não sai para o real
  if (g.skip) { console.log('[check-expiring] descartado (não-produção):', subject); return }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${apiKey}` },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || 'noreply@eqpitech.com.br',
      to:   g.to,
      subject: g.subject,
      html,
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Resend error ${res.status}: ${err.slice(0,200)}`)
  }
}

function buildExpiringEmail(razaoSocial, documents) {
  const rows = documents.map(d =>
    `<tr><td style="padding:6px 12px;border-bottom:1px solid #eee">${d.label}</td><td style="padding:6px 12px;border-bottom:1px solid #eee;color:#dc2626">${d.expires_at?.slice(0,10) || '—'}</td></tr>`
  ).join('')
  return {
    subject: `[SIGEC-ELOS] Documentos vencendo — ${razaoSocial}`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
        <h2 style="color:#2E3192">Documentos próximos ao vencimento</h2>
        <p>Olá, <strong>${razaoSocial}</strong>.</p>
        <p>Os seguintes documentos vencem em breve e precisam ser renovados para manter seu Selo ELOS ativo:</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <thead><tr style="background:#f4f5f9">
            <th style="padding:8px 12px;text-align:left;font-size:12px">Documento</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px">Vencimento</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <a href="${frontendUrl()}/fornecedor/documentos" style="display:inline-block;background:#2E3192;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700">
          Atualizar documentos →
        </a>
        <p style="color:#9B9B9B;font-size:12px;margin-top:24px">SIGEC-ELOS · EQPI Tech</p>
      </div>
    `,
  }
}

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

exports.handler = async (event) => {
  // Segurança: valida o secret para evitar chamadas não autorizadas
  const secret    = process.env.CRON_SECRET
  const authHeader = event.headers.authorization || event.headers.Authorization || ''
  if (secret && authHeader !== `Bearer ${secret}`) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) }
  }

  try {
    const now     = new Date()
    const in30d   = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    const in7d    = new Date(now.getTime() +  7 * 24 * 60 * 60 * 1000)
    const today   = now.toISOString().slice(0,10)
    const limit30 = in30d.toISOString().slice(0,10)

    // Mesma regra do Farol/Análise (patch_069): só processos OPERÁVEIS —
    // fornecedor suspenso ou de cliente inativo não recebe aviso/renovação
    const { data: eligibleRows } = await supabase.rpc('analysable_supplier_ids')
    const eligible = new Set((eligibleRows || []).map(r =>
      typeof r === 'string' ? r : r.analysable_supplier_ids || Object.values(r)[0]))

    // ── Esteira de renovação automática (Rota A) ─────────────────────────────
    // 12/10: o bloco antigo nunca renovou nada (mandava o tipo num campo que a
    // coleta não lia e chamava o FGTS sem o CNPJ). Agora o documento coletado
    // pela fonte oficial que vence em ≤7 dias volta para a fila da Rota A: o
    // coletor consulta de novo e deixa o novo documento "Em análise" com a
    // sugestão para o analista (nada é aprovado sozinho).
    // REGRA DO LUIZ (12/10): só ORIGEM ELOS entra na esteira — documento
    // espelhado do HOC (hoc_arquivo_id) e processo do HOC (hoc_process_id)
    // ficam fora até a migração de todos os clientes. Processo precisa estar
    // liberado (pago ou subsidiado) e operável (ativo ou em análise).
    const startedAt = Date.now()
    const budgetLeft = () => 20000 - (Date.now() - startedAt)
    let renovacoes = 0
    // REGRA DO LUIZ (16/10): só fornecedor NASCIDO NO ELOS (suppliers.hoc_id
    // nulo) — fornecedor do HOC, mesmo com processo no ELOS, fica fora até a
    // migração oficial do cliente (nenhum migrado ainda)
    const nascidosNoElos = async (ids) => {
      const set = new Set(); const uniq = [...new Set(ids)]
      for (let i = 0; i < uniq.length; i += 200) {
        const { data } = await supabase.from('suppliers').select('id').in('id', uniq.slice(i, i + 200)).is('hoc_id', null)
        for (const r of data || []) set.add(r.id)
      }
      return set
    }

    // 16/10 (caso LITUR): documento que JÁ venceu vira EXPIRED — antes ninguém
    // marcava e ele ficava "vence em breve" para sempre
    {
      const { data: venc } = await supabase.from('documents').select('id, supplier_id')
        .is('hoc_arquivo_id', null).in('status', ['VALID', 'EXPIRING']).lt('expires_at', today)
      const elosSet = await nascidosNoElos((venc || []).map(d => d.supplier_id))
      const ids = (venc || []).filter(d => elosSet.has(d.supplier_id) && (!eligible.size || eligible.has(d.supplier_id))).map(d => d.id)
      for (let i = 0; i < ids.length; i += 200)
        await supabase.from('documents').update({ status: 'EXPIRED' }).in('id', ids.slice(i, i + 200)).in('status', ['VALID', 'EXPIRING'])
      if (ids.length) console.log(`⌛ ${ids.length} documento(s) de origem ELOS marcados como vencidos`)
    }

    if (routeA.enabled()) {
      const in7d = new Date(now.getTime() + 7 * 864e5)
      // 16/10: também o que JÁ venceu (até 90 dias) e o enviado à mão — a Rota A
      // busca de novo qualquer documento que ela sabe obter na fonte oficial
      const desde = new Date(now.getTime() - 90 * 864e5).toISOString()
      const { data: vencendo } = await supabase
        .from('documents')
        .select('type, supplier_id')
        .in('type', Object.keys(routeA.ROUTE_A))
        .is('hoc_arquivo_id', null)
        .in('status', ['VALID', 'EXPIRING', 'EXPIRED'])
        .lte('expires_at', in7d.toISOString())
        .gte('expires_at', desde)
      const porFornecedor = new Map()
      const elosRenov = await nascidosNoElos((vencendo || []).map(d => d.supplier_id))
      for (const d of vencendo || []) {
        if (!elosRenov.has(d.supplier_id)) continue   // só nascido no ELOS (regra 16/10)
        if (eligible.size && !eligible.has(d.supplier_id)) continue
        if (!porFornecedor.has(d.supplier_id)) porFornecedor.set(d.supplier_id, new Set())
        porFornecedor.get(d.supplier_id).add(d.type)
      }
      const MAX_RENOVACOES = 40   // teto por execução (o job é diário)
      for (const [supplierId, tipos] of porFornecedor) {
        if (renovacoes >= MAX_RENOVACOES || budgetLeft() < 8000) break
        const { data: selos } = await supabase.from('seals')
          .select('id, client_id, flow_id')
          .eq('supplier_id', supplierId).is('hoc_process_id', null)
          .not('released_at', 'is', null).in('status', ['ACTIVE', 'PENDING'])
          .order('created_at')
        const pendentes = new Set(tipos)
        for (const selo of selos || []) {
          if (!pendentes.size) break
          const exigidos = new Set((await requiredDocsForSeal(supabase, supplierId, selo)).map(String))
          for (const tipo of [...pendentes]) {
            if (!exigidos.has(tipo)) continue
            pendentes.delete(tipo)   // um job por fornecedor+documento (a consulta é paga uma vez)
            const { data: job } = await supabase.from('auto_collect_jobs')
              .select('id, status').eq('seal_id', selo.id).eq('doc_type', tipo).maybeSingle()
            if (job && !['done', 'fallback'].includes(job.status)) continue   // já na fila
            const { error: jErr } = job
              ? await supabase.from('auto_collect_jobs').update({
                  status: 'queued', attempts: 0, next_attempt_at: new Date().toISOString(),
                  last_error: 'renovação automática (vencido ou vence em até 7 dias)', finished_at: null,
                }).eq('id', job.id)
              : await supabase.from('auto_collect_jobs').insert({ supplier_id: supplierId, seal_id: selo.id, doc_type: tipo })
            if (jErr) console.warn(`  ✗ renovação ${tipo} fornecedor ${supplierId}:`, jErr.message)
            else renovacoes++
          }
        }
      }
      if (renovacoes) {
        console.log(`🔄 ${renovacoes} documento(s) de origem ELOS na esteira de renovação (Rota A)`)
        // o cron da Rota A (15 min) processa a fila; o disparo só adianta
        const site = env('ELOS_ENV') === 'production' ? env('URL') : (env('DEPLOY_PRIME_URL') || env('URL'))
        if (site && process.env.CRON_SECRET) {
          const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 4000)
          await fetch(`${site}/.netlify/functions/homolog-collect-background`, {
            method: 'POST', signal: ctrl.signal, headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` }, body: '{}',
          }).catch(() => {}).finally(() => clearTimeout(t))
        }
      }
    }

    // Busca documentos VÁLIDOS que vencem nos próximos 30 dias
    // Nota: NÃO tentamos fazer join com auth.users via PostgREST — buscamos e-mails
    // separadamente via auth.admin.getUserById (mais confiável)
    const { data: expiringDocs, error } = await supabase
      .from('documents')
      .select('id, type, label, expires_at, status, supplier_id, suppliers(id, razao_social, user_id, email)')
      .in('status', ['VALID', 'EXPIRING'])   // EXPIRING continua nos marcos 3/1/0
      .gte('expires_at', today)
      .lte('expires_at', limit30)
      .order('expires_at', { ascending: true })

    if (error) throw new Error(error.message)
    if (!expiringDocs?.length) {
      return { statusCode: 200, body: JSON.stringify({ message: 'Nenhum documento vencendo em 30 dias', count: 0, renovacoes }) }
    }

    // Notifica só nos MARCOS (30/15/7/3/1/0 dias p/ vencer) — sem isso o
    // fornecedor receberia o MESMO aviso todos os dias por 30 dias
    const NOTIFY_DAYS = new Set([30, 15, 7, 3, 1, 0])
    const daysLeft = (d) => Math.ceil((new Date(d.expires_at) - now) / (24 * 60 * 60 * 1000))
    const docsToNotify = expiringDocs.filter(d => NOTIFY_DAYS.has(Math.max(0, daysLeft(d))) && (!eligible.size || eligible.has(d.supplier_id)))

    // Agrupa por supplier_id (apenas quem tem marco hoje)
    const bySupplier = docsToNotify.reduce((acc, doc) => {
      const sid = doc.supplier_id
      acc[sid] = acc[sid] || { supplier: doc.suppliers, docs: [] }
      acc[sid].docs.push(doc)
      return acc
    }, {})

    // Busca e-mails dos fornecedores via auth.users
    const supplierUserIds = Object.values(bySupplier)
      .map(s => s.supplier?.user_id)
      .filter(Boolean)

    let usersData = null
    try {
      const { data } = await supabase
        .rpc('get_user_emails_by_ids', { user_ids: supplierUserIds })
      usersData = data
    } catch { usersData = [] }

    // Fallback: busca direto via auth admin
    const emailMap = {}
    for (const uid of supplierUserIds) {
      try {
        const { data: { user } } = await supabase.auth.admin.getUserById(uid)
        if (user?.email) emailMap[uid] = user.email
      } catch {}
    }

    const results = []
    let sent = 0, urgent = 0

    // Marca EXPIRING em lote (todos os ≤7d, não só os do marco de hoje)
    const urgentIds = expiringDocs.filter(d => new Date(d.expires_at) <= in7d && (!eligible.size || eligible.has(d.supplier_id))).map(d => d.id)
    for (let i = 0; i < urgentIds.length; i += 200) {
      await supabase.from('documents').update({ status: 'EXPIRING' })
        .in('id', urgentIds.slice(i, i + 200)).eq('status', 'VALID')
    }
    urgent = urgentIds.length

    for (const [supplierId, { supplier, docs }] of Object.entries(bySupplier)) {
      if (budgetLeft() < 3000) { results.push({ supplierId, status: 'deferred_budget' }); continue }
      // e-mail do usuário → fallback: e-mail do CADASTRO (migrados sem login)
      let email = emailMap[supplier.user_id]
      if (!email) {
        const cand = String(supplier?.email || '').split(/[;,]/)[0].trim()
        if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cand)) email = cand
      }
      if (!email) {
        results.push({ supplierId, status: 'no_email' })
        continue
      }

      // Envia e-mail de notificação
      try {
        const { subject, html } = buildExpiringEmail(
          supplier.razao_social,
          docs.map(d => ({ label: d.label, expires_at: d.expires_at }))
        )
        await sendEmailDirect({ to: email, subject, html })
        sent++
        results.push({ supplierId, email, docs: docs.length, status: 'sent' })
      } catch (emailErr) {
        results.push({ supplierId, email, status: 'email_error', error: emailErr.message })
      }
    }

    // Log de auditoria no banco
    try {
      await supabase.from('audit_log').insert({
        action:    'EXPIRING_DOCS_CHECK',
        metadata:  { total: expiringDocs.length, emails_sent: sent, urgent_marked: urgent, date: today },
      })
    } catch { /* non-critical */ }

    console.log(`📧 Notificações: ${sent} enviadas | ${urgent} urgentes marcados`)
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        total_docs: expiringDocs.length,
        suppliers_notified: sent,
        urgent_marked: urgent,
        renovacoes,          // documentos de origem ELOS reenviados à Rota A
        results,
      }),
    }
  } catch (err) {
    console.error('check-expiring-docs error:', err)
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}
