// netlify/functions/check-expiring-docs.js
// Verifica documentos vencendo em ≤30 dias e envia notificações por e-mail
// Chamado diariamente pelo GitHub Actions (.github/workflows/daily-notifications.yml)
// Também pode ser chamado manualmente: POST /.netlify/functions/check-expiring-docs
// com header Authorization: Bearer CRON_SECRET

const { createClient } = require('@supabase/supabase-js')

// send-email.js só exporta handler (HTTP endpoint), não funções reutilizáveis.
// Usamos fetch direto para a API do Resend.
async function sendEmailDirect({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) { console.warn('[check-expiring-docs] RESEND_API_KEY ausente — e-mail não enviado'); return }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${apiKey}` },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || 'noreply@eqpitech.com.br',
      to:   [to],
      subject,
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
        <a href="https://sigecelos.com.br/fornecedor/documentos" style="display:inline-block;background:#2E3192;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700">
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
    const in5d    = new Date(now.getTime() +  5 * 24 * 60 * 60 * 1000)
    const today   = now.toISOString().slice(0,10)
    const limit30 = in30d.toISOString().slice(0,10)

    // ── Auto-renovação: documentos AUTO vencendo em ≤5 dias ──────────────────
    const AUTO_DOC_TYPES = ['37','61','62','7'] // CNPJ, CNAEs, Simples Nacional, FGTS
    const { data: autoExpiring } = await supabase
      .from('documents')
      .select('id, type, supplier_id, suppliers(id, cnpj, user_id)')
      .in('type', AUTO_DOC_TYPES)
      .eq('source', 'AUTO')
      .in('status', ['VALID','EXPIRING'])
      .lte('expires_at', in5d.toISOString())
      .gte('expires_at', today)

    // Orçamento de tempo: a function é morta pelo Netlify em ~26s — o job
    // roda DIARIAMENTE, então processar parcial e devolver 200 é correto
    // (o restante entra amanhã). Era a causa do 'Failed in 33 seconds'.
    const startedAt = Date.now()
    const budgetLeft = () => 20000 - (Date.now() - startedAt)

    if (autoExpiring?.length) {
      // Teto por execução + chamadas em paralelo com timeout individual
      const batch = autoExpiring.slice(0, 15)
      console.log(`🔄 Auto-renovando ${batch.length}/${autoExpiring.length} documento(s) AUTO...`)
      const baseUrl = process.env.URL || process.env.FRONTEND_URL || 'https://sigecelos.com.br'
      const renew = async (doc) => {
        const cnpj = doc.suppliers?.cnpj?.replace(/\D/g,'')
        if (!cnpj) return
        const ctrl = new AbortController()
        const t = setTimeout(() => ctrl.abort(), 6000)
        try {
          const fn = doc.type === '7' ? 'fgts-crf-lookup' : 'collect-document'
          await fetch(`${baseUrl}/.netlify/functions/${fn}`, {
            method: 'POST', signal: ctrl.signal,
            headers: { 'Content-Type': 'application/json', 'x-cron-secret': process.env.CRON_SECRET || '' },
            body: JSON.stringify({ supplierId: doc.supplier_id, docType: doc.type, cnpj }),
          })
        } catch (e) {
          console.warn(`  ✗ renovação doc ${doc.type} supplier ${doc.supplier_id}:`, e.message)
        } finally { clearTimeout(t) }
      }
      for (let i = 0; i < batch.length && budgetLeft() > 8000; i += 5) {
        await Promise.allSettled(batch.slice(i, i + 5).map(renew))
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
      return { statusCode: 200, body: JSON.stringify({ message: 'Nenhum documento vencendo em 30 dias', count: 0 }) }
    }

    // Notifica só nos MARCOS (30/15/7/3/1/0 dias p/ vencer) — sem isso o
    // fornecedor receberia o MESMO aviso todos os dias por 30 dias
    const NOTIFY_DAYS = new Set([30, 15, 7, 3, 1, 0])
    const daysLeft = (d) => Math.ceil((new Date(d.expires_at) - now) / (24 * 60 * 60 * 1000))
    const docsToNotify = expiringDocs.filter(d => NOTIFY_DAYS.has(Math.max(0, daysLeft(d))))

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
    const urgentIds = expiringDocs.filter(d => new Date(d.expires_at) <= in7d).map(d => d.id)
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
        results,
      }),
    }
  } catch (err) {
    console.error('check-expiring-docs error:', err)
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}
