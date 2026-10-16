// netlify/functions/stripe-diagnose.js — diagnóstico SOMENTE LEITURA do Stripe (16/10)
// Caso GT/HAVI: boleto pago sem liberação e fatura de assinatura sem fornecedor.
// Protegido pelo CRON_SECRET (mesmo dos agendamentos). Nada é alterado.
//   POST { sessions: ['cs_live_…'] } → situação de cada sessão, eventos e webhooks
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)

exports.handler = async (event) => {
  const bearer = (event.headers?.authorization || '').replace('Bearer ', '')
  if (!process.env.CRON_SECRET || bearer !== process.env.CRON_SECRET) return { statusCode: 401, body: 'unauthorized' }
  const { sessions = [] } = JSON.parse(event.body || '{}')
  const out = { webhooks: [], sessions: [] }
  try {
    const eps = await stripe.webhookEndpoints.list({ limit: 20 })
    out.webhooks = eps.data.map(e => ({ url: e.url, status: e.status, events: e.enabled_events }))
    for (const id of sessions.slice(0, 10)) {
      const s = await stripe.checkout.sessions.retrieve(id, { expand: ['payment_intent', 'payment_intent.latest_charge'] })
      const pi = s.payment_intent || {}
      const ch = pi.latest_charge || {}
      const evs = await stripe.events.list({ limit: 20, created: { gte: s.created }, types: [
        'checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed'] })
      out.sessions.push({
        id: s.id, mode: s.mode, status: s.status, payment_status: s.payment_status, amount: (s.amount_total || 0) / 100,
        created: new Date(s.created * 1000).toISOString(), email: s.customer_details?.email || s.customer_email,
        metadata: s.metadata, subscription: s.subscription || null,
        payment_intent: { status: pi.status, methods: pi.payment_method_types, charge_paid: !!ch.paid,
          charge_type: ch.payment_method_details?.type || null, charge_at: ch.created ? new Date(ch.created * 1000).toISOString() : null },
        events: evs.data.filter(e => e.data?.object?.id === s.id).map(e => ({
          type: e.type, created: new Date(e.created * 1000).toISOString(), pending_webhooks: e.pending_webhooks })),
      })
    }
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(out) }
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) }
  }
}
