// netlify/functions/pending-docs-reminders-background.js — lembrete
// AUTOMÁTICO de pendências (21/09, pedido pós-demo VIX): fornecedor
// cadastrado com processo ELOS em aberto recebe, A CADA 3 DIAS, a lista
// do que falta (documentos exigidos + questionário), até completar ou
// atingir 5 lembretes (depois a cobrança volta a ser manual do analista).
//
// Escopo deliberado: SÓ processos nativos do ELOS (hoc_process_id IS NULL)
// de clientes ativos — os espelhados do HOC já são cobrados por lá e
// disparar e-mail em massa para migrados confundiria.
//
// Disparo: workflow daily-notifications (Bearer CRON_SECRET). Background
// function (15 min) com teto de e-mails por execução.

const { createClient } = require('@supabase/supabase-js')
const { requiredDocsForSeal } = require('./lib/required_docs.js')

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

const INTERVAL_DAYS = 3
const MAX_REMINDERS = 5
const MAX_EMAILS_PER_RUN = 100
const SENT_STATUSES = ['PENDING', 'VALID', 'EXPIRING', 'NOT_APPLICABLE'] // já enviado/atendido

async function sendEmail(to, subject, html) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    body: JSON.stringify({ from: process.env.EMAIL_FROM || 'noreply@eqpitech.com.br', to: [to], subject, html }),
  })
  if (!res.ok) throw new Error(`Resend ${res.status}`)
}

function buildHtml(clientName, missingDocs, questPending) {
  const docsLis = missingDocs.map((d) => `<li style="margin-bottom:6px">📄 ${d}</li>`).join('')
  return `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto">
  <div style="background:#2E3192;padding:24px;border-radius:12px 12px 0 0;text-align:center">
    <h1 style="color:#fff;margin:0;font-size:20px">SIGEC-ELOS</h1></div>
  <div style="background:#fff;padding:26px;border:1px solid #e2e8f0;border-top:none;color:#374151;font-size:15px;line-height:1.6">
    <p>Sua homologação${clientName ? ` com <strong>${clientName}</strong>` : ''} está quase lá — falta pouco para o processo entrar em análise:</p>
    ${missingDocs.length ? `<p><strong>Documentos pendentes:</strong></p><ul style="padding-left:18px">${docsLis}</ul>` : ''}
    ${questPending ? `<p>❓ <strong>Questionário do cliente</strong> aguardando suas respostas.</p>` : ''}
    <p>Assim que tudo estiver enviado, o processo entra automaticamente na fila de análise.</p>
    <p style="text-align:center;margin:24px 0 8px"><a href="https://elos.eqpitech.com.br/fornecedor/documentos" style="display:inline-block;background:#F47E2F;color:#fff;padding:13px 30px;border-radius:9px;text-decoration:none;font-weight:bold">Completar agora</a></p>
  </div>
  <div style="background:#f8fafc;padding:12px;border-radius:0 0 12px 12px;text-align:center;font-size:11px;color:#9aa1b5">EQPI Tech · SIGEC-ELOS · elos.eqpitech.com.br</div></div>`
}

exports.handler = async (event) => {
  const bearer = (event.headers?.authorization || '').replace('Bearer ', '')
  if (!process.env.CRON_SECRET || bearer !== process.env.CRON_SECRET) return { statusCode: 401 }

  const deadline = Date.now() + 12 * 60 * 1000
  let sent = 0, skipped = 0
  try {
    // processos ELOS em aberto de clientes ativos
    const { data: seals } = await supabase
      .from('seals')
      .select('id, supplier_id, client_id, flow_id, clients(active, nome_fantasia, razao_social), suppliers(razao_social, email, user_id)')
      .eq('status', 'PENDING')
      .is('hoc_process_id', null)
      .limit(500)

    // e-mails de login em lote (fallback: e-mail de cadastro — regra nº 14)
    const userIds = [...new Set((seals || []).map((s) => s.suppliers?.user_id).filter(Boolean))]
    const emailMap = {}
    for (let i = 0; i < userIds.length; i += 100) {
      const { data: users } = await supabase.rpc('get_user_emails_by_ids', { user_ids: userIds.slice(i, i + 100) })
      for (const u of users || []) if (u.email) emailMap[u.id] = u.email
    }

    for (const seal of seals || []) {
      if (Date.now() > deadline - 20000 || sent >= MAX_EMAILS_PER_RUN) break
      if (seal.clients && seal.clients.active === false) { skipped++; continue }
      const to = emailMap[seal.suppliers?.user_id] || seal.suppliers?.email
      if (!to) { skipped++; continue }

      // cadência: ≥3 dias desde o último, máx. 5 por processo (audit_log)
      const { data: hist } = await supabase
        .from('audit_log').select('created_at')
        .eq('action', 'DOC_PENDING_REMINDER').eq('entity_id', seal.id)
        .order('created_at', { ascending: false }).limit(MAX_REMINDERS)
      if (hist?.length >= MAX_REMINDERS) { skipped++; continue }
      if (hist?.[0] && Date.now() - new Date(hist[0].created_at).getTime() < INTERVAL_DAYS * 86400000) { skipped++; continue }

      // pendências de documentos: exigidos sem envio (REJECTED/EXPIRED contam
      // como pendente — o fornecedor precisa reenviar)
      const reqTypes = (await requiredDocsForSeal(supabase, seal.supplier_id, seal)).map(String)
      if (!reqTypes.length) { skipped++; continue }
      const { data: docs } = await supabase
        .from('documents').select('type, status')
        .eq('supplier_id', seal.supplier_id).in('type', reqTypes)
      const okTypes = new Set((docs || []).filter((d) => SENT_STATUSES.includes(d.status)).map((d) => String(d.type)))
      const missingTypes = reqTypes.filter((t) => !okTypes.has(t))

      // questionário do cliente: perguntas obrigatórias sem resposta
      let questPending = false
      if (seal.client_id) {
        const { data: qs } = await supabase
          .from('questionnaires').select('id, questionnaire_questions(id, required)')
          .eq('client_id', seal.client_id)
        const reqQ = (qs || []).flatMap((q) => (q.questionnaire_questions || []).filter((x) => x.required).map((x) => x.id))
        if (reqQ.length) {
          const { data: ans } = await supabase
            .from('questionnaire_answers').select('question_id')
            .eq('supplier_id', seal.supplier_id).in('question_id', reqQ)
          questPending = new Set((ans || []).map((a) => a.question_id)).size < reqQ.length
        }
      }

      if (!missingTypes.length && !questPending) { skipped++; continue } // completo → fila cuida

      const { data: cat } = await supabase
        .from('documents_catalog').select('id, name').in('id', missingTypes.map(Number).filter((n) => !isNaN(n)))
      const nameMap = Object.fromEntries((cat || []).map((c) => [String(c.id), c.name]))
      const missingNames = missingTypes.map((t) => nameMap[t] || `Documento #${t}`).slice(0, 15)
      const clientName = seal.clients?.nome_fantasia || seal.clients?.razao_social || null

      try {
        await sendEmail(to, `📋 Faltam ${missingTypes.length + (questPending ? 1 : 0)} pendência(s) na sua homologação — SIGEC-ELOS`,
          buildHtml(clientName, missingNames, questPending))
        await supabase.from('audit_log').insert({
          action: 'DOC_PENDING_REMINDER', entity_type: 'seal', entity_id: seal.id,
          metadata: { to, missing_docs: missingTypes.length, quest_pendente: questPending, lembrete_n: (hist?.length || 0) + 1 },
        })
        sent++
      } catch (e) { console.warn(`[pending-reminders] ${seal.id}: ${e.message}`) }
    }

    console.log(`[pending-reminders] enviados=${sent} pulados=${skipped}`)
    return { statusCode: 200, body: JSON.stringify({ sent, skipped }) }
  } catch (e) {
    console.error('[pending-reminders]', e)
    return { statusCode: 500 }
  }
}
