// netlify/functions/stripe-reconcile.js — conciliação de pagamentos do Stripe (16/10)
//
// Caso GT: o boleto compensou, mas o webhook não era avisado da compensação
// (checkout.session.async_payment_succeeded não estava inscrito) e o processo
// ficou travado. Esta rotina olha os planos PENDENTES com sessão do Stripe,
// consulta o Stripe e:
//   · pago → ativa com a MESMA regra do webhook (activatePaidSession)
//   · sessão expirada / pagamento cancelado → encerra o plano provisório
// Roda no agendamento diário e pode ser chamada à mão. Protegida pelo CRON_SECRET.
//   POST { fixWebhook?: true, sessions?: ['cs_live_…'], dryRun?: true }
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const { createClient } = require('@supabase/supabase-js')
const { activatePaidSession, liberacaoStripe } = require('./stripe-webhook.js')

const supabase = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const EVENTOS_BOLETO = ['checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed']

exports.handler = async (event) => {
  const bearer = (event.headers?.authorization || '').replace('Bearer ', '')
  if (!process.env.CRON_SECRET || bearer !== process.env.CRON_SECRET) return { statusCode: 401, body: 'unauthorized' }
  const body = JSON.parse(event.body || '{}')
  const out = { webhook: null, conciliados: [] }
  try {
    // 1) webhook inscrito nos avisos do boleto (compensado / vencido)
    if (body.fixWebhook) {
      const eps = await stripe.webhookEndpoints.list({ limit: 20 })
      const ep = eps.data.find(e => e.url.includes('/.netlify/functions/stripe-webhook'))
      if (ep) {
        const faltam = EVENTOS_BOLETO.filter(e => !ep.enabled_events.includes(e))
        if (faltam.length && !body.dryRun) await stripe.webhookEndpoints.update(ep.id, { enabled_events: [...ep.enabled_events, ...faltam] })
        out.webhook = { url: ep.url, incluidos: faltam, antes: ep.enabled_events }
      }
    }
    // 2) planos pendentes com sessão do Stripe (+ as informadas)
    const { data: pend } = await supabase.from('plans').select('supplier_id, stripe_session_id')
      .eq('status', 'PENDING').not('stripe_session_id', 'is', null)
    const ids = [...new Set([...(pend || []).map(p => p.stripe_session_id), ...(body.sessions || [])])]
    for (const id of ids.slice(0, 50)) {
      const s = await stripe.checkout.sessions.retrieve(id, { expand: ['payment_intent'] })
      const r = { session: id, supplierId: s.metadata?.supplierId, payment_status: s.payment_status, status: s.status }
      if (s.payment_status === 'paid') {
        r.acao = 'ativado'
        if (!body.dryRun) await activatePaidSession(s)
      } else if (s.status === 'expired' || s.payment_intent?.status === 'canceled') {
        r.acao = 'encerrado (não pago)'
        if (!body.dryRun) await supabase.from('plans').update({ status: 'CANCELED' }).eq('stripe_session_id', id).eq('status', 'PENDING')
      } else r.acao = 'aguardando pagamento'
      out.conciliados.push(r)
    }
    // 3) 21/10: meio de pagamento e data de liberação dos pagamentos que ainda
    //    não têm (pagamentos anteriores e faturas em que o Stripe não informou)
    const { data: semLib } = await supabase.from('nfe_invoices')
      .select('id, stripe_session_id, stripe_invoice_id').eq('source', 'STRIPE').gt('amount_cents', 0)
      .is('stripe_available_on', null).order('created_at', { ascending: false }).limit(30)
    out.liberacoes = 0
    for (const n of semLib || []) {
      let lib = {}
      if (n.stripe_session_id) {
        const s = await stripe.checkout.sessions.retrieve(n.stripe_session_id)
        lib = await liberacaoStripe({ paymentIntent: s.payment_intent })
      } else if (n.stripe_invoice_id) {
        const inv = await stripe.invoices.retrieve(n.stripe_invoice_id)
        let pi = inv.payment_intent, ch = inv.charge
        if (!pi && !ch && stripe.invoicePayments) {   // API nova: pagamentos da fatura em invoice_payments
          const ps = await stripe.invoicePayments.list({ invoice: inv.id, limit: 1 }).catch(() => null)
          pi = ps?.data?.[0]?.payment?.payment_intent || null
          ch = ps?.data?.[0]?.payment?.charge || null
        }
        lib = await liberacaoStripe({ paymentIntent: pi, charge: ch })
      }
      if (lib.stripe_available_on || lib.payment_method) {
        if (!body.dryRun) await supabase.from('nfe_invoices').update(lib).eq('id', n.id)
        out.liberacoes++
      }
    }
    console.log('[stripe-reconcile]', JSON.stringify(out))
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(out) }
  } catch (e) {
    console.error('[stripe-reconcile]', e)
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) }
  }
}
