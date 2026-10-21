// netlify/functions/stripe-diagnose.js — diagnóstico SOMENTE LEITURA do Stripe (16/10)
// Caso GT/HAVI: boleto pago sem liberação e fatura de assinatura sem fornecedor.
// Protegido pelo CRON_SECRET (mesmo dos agendamentos). Nada é alterado.
//   POST { sessions: ['cs_live_…'] } → situação de cada sessão, eventos e webhooks
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)

exports.handler = async (event) => {
  const bearer = (event.headers?.authorization || '').replace('Bearer ', '')
  if (!process.env.CRON_SECRET || bearer !== process.env.CRON_SECRET) return { statusCode: 401, body: 'unauthorized' }
  const { sessions = [], meios = false, repasses = false } = JSON.parse(event.body || '{}')
  const out = { webhooks: [], sessions: [] }
  try {
    // 21/10: datas reais de liberação (available_on) dos últimos pagamentos e o
    // calendário de repasse da conta — confere a previsão do relatório financeiro
    if (repasses) {
      const acc = await stripe.accounts.retrieve()
      out.calendario = acc.settings?.payouts?.schedule || null
      const bts = await stripe.balanceTransactions.list({ limit: 40, type: 'charge', expand: ['data.source'] })
      out.liberacoes = bts.data.map(b => ({
        criado: new Date(b.created * 1000).toISOString(), disponivel: new Date(b.available_on * 1000).toISOString(),
        dias: Math.round((b.available_on - b.created) / 86400), valor: b.amount / 100, liquido: b.net / 100, taxa: b.fee / 100,
        meio: b.source?.payment_method_details?.type || null,
        pais_cartao: b.source?.payment_method_details?.card?.country || null, status: b.status }))
      const pos = await stripe.payouts.list({ limit: 10 })
      out.repasses = pos.data.map(p => ({ valor: p.amount / 100, chegada: new Date(p.arrival_date * 1000).toISOString().slice(0, 10), status: p.status }))
    }
    // 19/10: meios de pagamento da conta (Pix habilitado? país da conta?)
    if (meios) {
      const acc = await stripe.accounts.retrieve()
      out.conta = { pais: acc.country, moeda: acc.default_currency,
        capacidades: Object.fromEntries(Object.entries(acc.capabilities || {}).filter(([k]) => /pix|boleto|card/.test(k))) }
      const cfgs = await stripe.paymentMethodConfigurations.list({ limit: 10 })
      out.configuracoes = cfgs.data.map(c => ({ nome: c.name, padrao: c.is_default, ativa: c.active,
        pix: c.pix ? { disponivel: c.pix.available, preferencia: c.pix.display_preference?.value } : null,
        boleto: c.boleto ? { disponivel: c.boleto.available, preferencia: c.boleto.display_preference?.value } : null,
        cartao: c.card ? { disponivel: c.card.available, preferencia: c.card.display_preference?.value } : null }))
    }
    const eps = await stripe.webhookEndpoints.list({ limit: 20 })
    out.webhooks = eps.data.map(e => ({ url: e.url, status: e.status, events: e.enabled_events }))
    for (const id of sessions.slice(0, 10)) {
      const s = await stripe.checkout.sessions.retrieve(id, { expand: ['payment_intent', 'payment_intent.latest_charge'] })
      const pi = s.payment_intent || {}
      const ch = pi.latest_charge || {}
      const evs = await stripe.events.list({ limit: 20, created: { gte: s.created }, types: [
        'checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed'] })
      out.sessions.push({
        id: s.id, mode: s.mode, status: s.status, meios_oferecidos: s.payment_method_types, payment_status: s.payment_status, amount: (s.amount_total || 0) / 100,
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
