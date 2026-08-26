// netlify/functions/stripe-webhook.js
// Processa webhooks do Stripe
// Configure em: Stripe Dashboard → Developers → Webhooks
// Endpoint URL: https://elos.eqpitech.com.br/.netlify/functions/stripe-webhook
// Eventos: checkout.session.completed, invoice.payment_succeeded (fila NFSe),
//          customer.subscription.deleted, invoice.payment_failed

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
      const { supplierId, planType, cnaeCount, priceYearly, planFor, buyerUserId } = session.metadata

      // ── CASO: Comprador Pro ──────────────────────────────────────
      if (planFor === 'buyer' && buyerUserId) {
        const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
        const cycle     = planType?.includes('mensal') ? 'mensal' : 'anual'
        const expires   = cycle === 'mensal'
          ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
          : expiresAt

        const { error: buyerErr } = await supabase
          .from('user_roles')
          .update({
            buyer_plan:               'pro',
            buyer_plan_expires_at:    expires,
            buyer_stripe_sub_id:      session.subscription || null,
            buyer_stripe_customer_id: session.customer     || null,
          })
          .eq('user_id', buyerUserId)
          .eq('role', 'BUYER')

        if (buyerErr) console.error('Buyer plan update error:', buyerErr)
        else console.log(`✅ Comprador Pro ativado: ${buyerUserId} (${cycle})`)

        return { statusCode: 200, body: JSON.stringify({ received: true }) }
      }

      if (!supplierId) {
        console.warn('Webhook: supplierId não encontrado na session metadata')
        return { statusCode: 200, body: 'ok' }
      }

      // Mensal = 30 dias; anual = 365 (renovações estendem via webhook/Stripe)
      const isMensal = (planType || '').includes('mensal')
      // Pagamento AVULSO (homologação de convidado, mode=payment): NFSe
      if (session.mode === 'payment' && (session.amount_total ?? 0) > 0) {
        await supabase.from('nfe_invoices').upsert({
          supplier_id: supplierId, source: 'STRIPE',
          stripe_session_id: session.id,
          amount_cents: session.amount_total, currency: session.currency || 'brl',
          plan_type: planType || 'homologado',
          description: 'Serviço de Análise Cadastral — Homologação SIGEC-ELOS',
          paid_at: new Date().toISOString(), status: 'PENDING',
        }, { onConflict: 'stripe_session_id', ignoreDuplicates: true })
          .then(({ error: e2 }) => e2 && console.error('[nfe-queue]', e2.message))
      }

      const endsAt = new Date(Date.now() + (isMensal ? 30 : 365) * 24 * 60 * 60 * 1000).toISOString()

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

      // Mapear planType para seal_type
      // verificado_anual / verificado_mensal → 'verificado' (ativa automaticamente)
      // homologado_anual → 'homologado' (entra na fila, PENDING)
      // legado Simples → verificado, Premium/HOC → homologado
      const sealTypeMap = {
        verificado_anual:  'verificado',
        verificado_mensal: 'verificado',
        homologado_anual:  'homologado',
        Simples:           'verificado',
        Premium:           'homologado',
        HOC:               'homologado',
      }
      const sealType   = sealTypeMap[planType] || 'homologado'
      // Regra (25/08): NENHUM selo ativa direto no pagamento. O Verificado
      // exige os 6 docs da pré-homologação + análise do backoffice — a
      // auto-finalização (admin-approve-document) ativa quando tudo é revisado
      const sealStatus = 'PENDING'
      const billingCycle = planType.includes('mensal') ? 'mensal' : 'anual'

      // Cria/atualiza o Selo ELOS (client_id NULL). Sem upsert onConflict:
      // o índice único de seals é parcial e o upsert falha (42P10) no mundo
      // multi-selo — select→update/insert é o caminho seguro
      const sealPayload = {
        level:          sealType === 'verificado' ? 'Simples' : 'Premium', // compatibilidade legada
        seal_type:      sealType,
        seal_name:      sealType === 'verificado' ? 'ELOS Verificado' : 'ELOS Homologado',
        billing_cycle:  billingCycle,
        status:         sealStatus,
        ...(sealStatus === 'ACTIVE' ? { issued_at: new Date().toISOString(), expires_at: endsAt } : {}),
      }
      const { data: existingSeal } = await supabase.from('seals')
        .select('id').eq('supplier_id', supplierId).is('client_id', null).limit(1).maybeSingle()
      const { error: sealErr } = existingSeal
        ? await supabase.from('seals').update(sealPayload).eq('id', existingSeal.id)
        : await supabase.from('seals').insert({ ...sealPayload, supplier_id: supplierId, score: 0 })

      if (sealErr) console.error('Seal upsert error:', sealErr)

      // Verificado: atualizar status do supplier diretamente
      if (sealType === 'verificado') {
        await supabase.from('suppliers').update({ status: 'ACTIVE' }).eq('id', supplierId)
      }

      console.log(`✅ Plano ativado: ${supplierId} → ${planType} (${sealType}, ${sealStatus})`)

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
    // ── Fatura de assinatura PAGA → fila de NFSe (patch_049) ────────
    // Cobre 1ª cobrança e RENOVAÇÕES. Só pagamento EFETIVO entra como
    // PENDING; cupom 100% (amount_paid=0) registra como SKIPPED_ZERO.
    if (type === 'invoice.payment_succeeded') {
      const invoice = data.object
      try {
        // resolve o fornecedor via assinatura → plans.stripe_sub_id
        const subId = invoice.subscription
        let supplierId = null, planType = null
        if (subId) {
          const { data: plan } = await supabase
            .from('plans').select('supplier_id, type').eq('stripe_sub_id', subId).maybeSingle()
          supplierId = plan?.supplier_id || null
          planType   = plan?.type || null
        }
        const amount = invoice.amount_paid ?? 0
        const desc   = `Serviço de Análise Cadastral — Assinatura SIGEC-ELOS${planType ? ` (${planType})` : ''}`
        const { error: qErr } = await supabase.from('nfe_invoices').upsert({
          supplier_id:       supplierId,
          source:            'STRIPE',
          stripe_invoice_id: invoice.id,
          amount_cents:      amount,
          currency:          invoice.currency || 'brl',
          plan_type:         planType,
          description:       desc,
          paid_at:           new Date((invoice.status_transitions?.paid_at || invoice.created) * 1000).toISOString(),
          status:            amount > 0 ? 'PENDING' : 'SKIPPED_ZERO',
        }, { onConflict: 'stripe_invoice_id', ignoreDuplicates: true })
        if (qErr) console.error('[nfe-queue]', qErr.message)
        else if (amount > 0) {
          // tentativa imediata de emissão (o cron diário é a rede de segurança)
          fetch(`${process.env.URL}/.netlify/functions/nfe-emit-pending`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
          }).catch(() => {})
        }
        console.log(`🧾 NFSe enfileirada: invoice ${invoice.id} · R$ ${(amount/100).toFixed(2)} · ${amount > 0 ? 'PENDING' : 'SKIPPED_ZERO (cupom)'}`)
      } catch (e) { console.error('[nfe-queue]', e.message) }
      return { statusCode: 200, body: JSON.stringify({ received: true }) }
    }

    if (type === 'customer.subscription.deleted') {
      const sub = data.object

      // Verificar se é assinatura de Comprador Pro
      const { data: buyerRole } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('buyer_stripe_sub_id', sub.id)
        .eq('role', 'BUYER')
        .maybeSingle()

      if (buyerRole) {
        await supabase
          .from('user_roles')
          .update({ buyer_plan: 'free', buyer_plan_expires_at: null, buyer_stripe_sub_id: null })
          .eq('user_id', buyerRole.user_id)
          .eq('role', 'BUYER')
        console.log(`❌ Comprador Pro cancelado: ${buyerRole.user_id}`)
      } else {
        // É assinatura de fornecedor
        const { data: plan } = await supabase
          .from('plans').select('supplier_id').eq('stripe_sub_id', sub.id).single()
        if (plan) {
          await supabase.from('plans').update({ status: 'CANCELED' }).eq('stripe_sub_id', sub.id)
          await supabase.from('seals').update({ status: 'SUSPENDED', suspended_reason: 'Assinatura cancelada' }).eq('supplier_id', plan.supplier_id)
          console.log(`❌ Plano fornecedor cancelado: ${plan.supplier_id}`)
        }
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
