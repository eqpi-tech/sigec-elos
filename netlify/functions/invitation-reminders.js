// netlify/functions/invitation-reminders.js
// Cron diário (GitHub Actions, Bearer CRON_SECRET): lembra fornecedores
// convidados por CLIENTES que ainda não se cadastraram.
// Regra: 1 lembrete a cada 3 dias, por até 15 dias após o convite.
// Depois disso, para de lembrar. Convites de "contato" não recebem lembrete.

const { createClient } = require('@supabase/supabase-js')

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const HEADERS = { 'Content-Type': 'application/json' }
const DAY = 24 * 60 * 60 * 1000
const REMINDER_INTERVAL_DAYS = 3
const REMINDER_WINDOW_DAYS   = 15

exports.handler = async (event) => {
  // Autorização por CRON_SECRET (mesmo padrão do check-expiring-docs)
  const auth = event.headers.authorization || ''
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`)
    return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: 'Não autorizado' }) }

  const now = Date.now()
  const windowStart  = new Date(now - REMINDER_WINDOW_DAYS * DAY).toISOString()
  const intervalCut  = new Date(now - REMINDER_INTERVAL_DAYS * DAY).toISOString()

  try {
    // Convites de cliente, não cadastrados, dentro da janela de 15 dias,
    // criados há 3+ dias, sem lembrete recente
    const { data: invites, error } = await supabaseAdmin
      .from('invitations')
      .select('id, token, supplier_razao_social, supplier_email, client_id, buyer_name, created_at, last_reminder_at, reminder_count, objetivo, clients(razao_social)')
      .eq('invited_by_role', 'CLIENT')
      .in('status', ['SENT', 'VIEWED'])
      .gte('created_at', windowStart)
      .lte('created_at', intervalCut)
    if (error) throw new Error(error.message)

    const due = (invites || []).filter(inv =>
      (inv.objetivo || 'homologacao') === 'homologacao' &&
      inv.supplier_email &&
      (!inv.last_reminder_at || inv.last_reminder_at <= intervalCut)
    )

    let sent = 0
    const frontendUrl = process.env.FRONTEND_URL || 'https://elos.eqpitech.com.br'

    for (const inv of due) {
      const clientName = inv.clients?.razao_social || inv.buyer_name || 'a empresa contratante'
      // Link de cadastro: portal do cliente quando houver LP ativa
      let cadastroLink = `${frontendUrl}/cadastro?token=${inv.token}`
      try {
        const { data: lp } = await supabaseAdmin
          .from('client_landing_pages').select('slug')
          .eq('client_id', inv.client_id).eq('is_active', true).maybeSingle()
        if (lp?.slug) cadastroLink = `${frontendUrl}/${lp.slug}?token=${inv.token}`
      } catch { /* segue com link padrão */ }

      const daysAgo = Math.round((now - new Date(inv.created_at).getTime()) / DAY)

      if (process.env.RESEND_API_KEY) {
        const resp = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.RESEND_API_KEY}` },
          body: JSON.stringify({
            from: process.env.EMAIL_FROM || 'noreply@eqpitech.com.br',
            // supplier_email pode vir com múltiplos endereços separados por vírgula
            to: inv.supplier_email.split(/[;,]/).map(e => e.trim()).filter(e => /@/.test(e)).slice(0, 5),
            subject: `Lembrete: ${clientName} aguarda seu cadastro — SIGEC-ELOS`,
            html: `
              <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
                <div style="background:#2E3192;padding:32px;border-radius:12px 12px 0 0;text-align:center">
                  <h1 style="color:#fff;margin:0;font-size:24px">SIGEC-ELOS</h1>
                  <p style="color:#C7D2FE;margin:8px 0 0">Lembrete de Convite</p>
                </div>
                <div style="background:#fff;padding:32px;border:1px solid #e2e8f0;border-top:none">
                  <p>Olá, <strong>${inv.supplier_razao_social || 'fornecedor'}</strong>!</p>
                  <p>Há ${daysAgo} dias a empresa <strong>${clientName}</strong> convidou sua empresa para o processo de
                  homologação de fornecedores na plataforma SIGEC-ELOS — e o cadastro ainda não foi concluído.</p>
                  <p>Completar a homologação garante que sua empresa esteja apta a fornecer para ${clientName}.</p>
                  <div style="text-align:center;margin:24px 0">
                    <a href="${cadastroLink}" style="display:inline-block;background:#F47E2F;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px">
                      Concluir meu Cadastro →
                    </a>
                  </div>
                  <p style="color:#9B9B9B;font-size:12px">Dúvidas? <a href="mailto:comercial@eqpitech.com.br" style="color:#2E3192">comercial@eqpitech.com.br</a></p>
                </div>
                <div style="background:#f8fafc;padding:16px;border-radius:0 0 12px 12px;text-align:center;font-size:12px;color:#9B9B9B">
                  EQPI Tech · SIGEC-ELOS · elos.eqpitech.com.br
                </div>
              </div>`,
          }),
        }).catch(e => { console.warn('[invitation-reminders] email:', e.message); return null })
        if (!resp?.ok) continue
      }

      await supabaseAdmin.from('invitations')
        .update({ last_reminder_at: new Date().toISOString(), reminder_count: (inv.reminder_count || 0) + 1 })
        .eq('id', inv.id)
      sent++
    }

    console.log(`[invitation-reminders] ${due.length} elegíveis, ${sent} lembretes enviados`)
    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ eligible: due.length, sent }) }
  } catch (err) {
    console.error('[invitation-reminders]', err)
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) }
  }
}
