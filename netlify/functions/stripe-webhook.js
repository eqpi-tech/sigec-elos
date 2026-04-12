// netlify/functions/stripe-webhook.js
// Processa webhooks do Stripe
// Configure em: Stripe Dashboard → Developers → Webhooks
// Endpoint URL: https://elos.eqpitech.com.br/.netlify/functions/stripe-webhook
// Eventos: checkout.session.completed, customer.subscription.deleted, invoice.payment_failed

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // service_role para bypassar RLS
)

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  const sig           = event.headers['stripe-signature']
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  let stripeEvent
  try {
    stripeEvent = stripe.webhooks.constructEvent(event.body, sig, webhookSecret)
  } catch (err) {
    console.error('Webhook signature error:', err.message)
    return { statusCode: 400, body: `Webhook Error: ${err.message}` }
  }

  const { type, data } = stripeEvent

  try {
    // ── Pagamento efetuado com sucesso ──────────────────────────────
    if (type === 'checkout.session.completed') {
      const session = data.object
      const { supplierId, planType, cnaeCount, priceYearly } = session.metadata

      if (!supplierId) {
        console.warn('Webhook: supplierId não encontrado na session metadata')
        return { statusCode: 200, body: 'ok' }
      }

      const endsAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()

      // Ativa o plano
      const { error: planErr } = await supabase.from('plans').upsert({
        supplier_id:        supplierId,
        type:               planType,
        cnae_count:         Number(cnaeCount),
        price_yearly:       Number(priceYearly),
        stripe_sub_id:      session.subscription || null,
        stripe_customer_id: session.customer     || null,
        stripe_session_id:  session.id,
        status:             'ACTIVE',
        starts_at:          new Date().toISOString(),
        ends_at:            endsAt,
      }, { onConflict: 'supplier_id' })

      if (planErr) console.error('Plan upsert error:', planErr)

      // Cria/atualiza o Selo como PENDING (backoffice ainda precisa aprovar)
      const { error: sealErr } = await supabase.from('seals').upsert({
        supplier_id: supplierId,
        level:       planType,
        status:      'PENDING',
        score:       0,
      }, { onConflict: 'supplier_id' })

      if (sealErr) console.error('Seal upsert error:', sealErr)

      console.log(`✅ Plano ativado: ${supplierId} → ${planType}`)

    // Envia e-mail de boas-vindas via Netlify Function send-email
    try {
      const { data: supplierData } = await supabase
        .from('suppliers').select('razao_social').eq('id', supplierId).single()
      if (supplierData && session.customer_email) {
        await fetch(`${process.env.FRONTEND_URL}/.netlify/functions/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to:       session.customer_email,
            template: 'welcome',
            data: {
              razaoSocial: supplierData.razao_social,
              planType,
              userEmail:   session.customer_email,
            },
          }),
        })
        console.log(`📧 E-mail de boas-vindas enviado para ${session.customer_email}`)
      }
    } catch (emailErr) {
      console.warn('Welcome email error (não crítico):', emailErr.message)
    }
    }

    // ── Assinatura cancelada ────────────────────────────────────────
    if (type === 'customer.subscription.deleted') {
      const sub = data.object
      const { data: plan } = await supabase
        .from('plans').select('supplier_id').eq('stripe_sub_id', sub.id).single()

      if (plan) {
        await supabase.from('plans').update({ status: 'CANCELED' }).eq('stripe_sub_id', sub.id)
        await supabase.from('seals').update({ status: 'SUSPENDED', suspended_reason: 'Assinatura cancelada' }).eq('supplier_id', plan.supplier_id)
        console.log(`❌ Plano cancelado: ${plan.supplier_id}`)
      }
    }

    // ── Falha de pagamento ──────────────────────────────────────────
    if (type === 'invoice.payment_failed') {
      const invoice = data.object
      const { data: plan } = await supabase
        .from('plans').select('supplier_id').eq('stripe_sub_id', invoice.subscription).single()

      if (plan) {
        await supabase.from('plans').update({ status: 'PAST_DUE' }).eq('stripe_sub_id', invoice.subscription)
        console.log(`⚠️  Pagamento falhou: ${plan.supplier_id}`)
      }
    }

    return { statusCode: 200, body: JSON.stringify({ received: true }) }
  } catch (err) {
    console.error('Webhook handler error:', err)
    return { statusCode: 500, body: 'Internal error' }
  }
}
