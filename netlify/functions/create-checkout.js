// netlify/functions/create-checkout.js
// Cria Stripe Checkout Session e retorna a URL
//
// Casos atendidos:
//  1. Fornecedor espontâneo (Verificado/Homologado)  → subscription Stripe com priceId fixo
//  2. Fornecedor convidado / tagueado (inviteToken)  → one-time payment com preço do cliente
//     2a. homologation_payer = 'client'             → sem Stripe, plano ativado direto
//     2b. homologation_payer = 'supplier'           → Stripe one-time com effectivePrice
//  3. Comprador Pro (planFor = 'buyer')             → subscription Stripe com priceId comprador

const stripe       = require('stripe')(process.env.STRIPE_SECRET_KEY)
const { createClient } = require('@supabase/supabase-js')

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const PRICES = {
  // Fornecedores espontâneos
  verificado_anual:      process.env.STRIPE_PRICE_VERIFICADO_ANUAL,
  verificado_mensal:     process.env.STRIPE_PRICE_VERIFICADO_MENSAL,
  homologado_anual:      process.env.STRIPE_PRICE_HOMOLOGADO_ANUAL,
  // Compradores Pro
  comprador_pro_anual:   process.env.STRIPE_PRICE_COMPRADOR_PRO_ANUAL,
  comprador_pro_mensal:  process.env.STRIPE_PRICE_COMPRADOR_PRO_MENSAL,
  // Legado
  Simples: process.env.STRIPE_PRICE_VERIFICADO_ANUAL,
  Premium: process.env.STRIPE_PRICE_HOMOLOGADO_ANUAL,
}

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: HEADERS, body: '' }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) }

  try {
    const {
      planType,
      cnaeCount,
      supplierId,
      userEmail,
      priceYearly,
      inviteToken,
      // Para comprador Pro:
      planFor,       // 'buyer'
      buyerUserId,   // auth user UUID
    } = JSON.parse(event.body)

    const frontendUrl = process.env.FRONTEND_URL || 'https://elos.eqpitech.com.br'

    if (!process.env.STRIPE_SECRET_KEY) {
      return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: 'STRIPE_SECRET_KEY não configurado' }) }
    }

    // ── CASO 3: Comprador Pro ─────────────────────────────────────────────────
    if (planFor === 'buyer') {
      const priceId = PRICES[planType] // comprador_pro_anual ou comprador_pro_mensal
      if (!priceId) {
        return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: `Price ID não configurado para ${planType}. Defina STRIPE_PRICE_COMPRADOR_PRO_ANUAL/MENSAL nas env vars.` }) }
      }

      const session = await stripe.checkout.sessions.create({
        customer_email: userEmail,
        mode: 'subscription',
        allow_promotion_codes: true,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${frontendUrl}/comprador/plano?activated=true`,
        cancel_url:  `${frontendUrl}/comprador/plano`,
        metadata: {
          planFor:     'buyer',
          buyerUserId: buyerUserId,
          planType,
        },
      })

      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ url: session.url, sessionId: session.id }) }
    }

    // ── CASOS 1 e 2: Fornecedor ───────────────────────────────────────────────

    // Resolver preço e pagador via inviteToken (fornecedor convidado ou tagueado)
    let effectivePrice = priceYearly || 390
    let clientPayer    = 'supplier'
    let clientId       = null
    let isInvitedSupplier = false

    if (inviteToken) {
      const { data: inv } = await supabaseAdmin
        .from('invitations')
        .select('client_id, clients(homologation_price, homologation_payer)')
        .eq('token', inviteToken)
        .maybeSingle()

      if (inv?.client_id) {
        isInvitedSupplier = true
        clientId    = inv.client_id
        clientPayer = inv.clients?.homologation_payer || 'supplier'
        if (inv.clients?.homologation_price) {
          effectivePrice = Number(inv.clients.homologation_price)
        }
      }
    }

    // CASO 2a: Cliente subsidia — sem Stripe, ativa plano direto
    if (isInvitedSupplier && clientPayer === 'client') {
      await supabaseAdmin.from('plans').upsert({
        supplier_id:  supplierId,
        type:         'homologado',
        price_yearly: effectivePrice,
        status:       'ACTIVE',
        starts_at:    new Date().toISOString(),
        ends_at:      new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      }, { onConflict: 'supplier_id' })

      return {
        statusCode: 200,
        headers: HEADERS,
        body: JSON.stringify({ url: `${frontendUrl}/fornecedor/plano-ativo?supplier=${supplierId}&subsidiado=true` }),
      }
    }

    // CASO 2b: Fornecedor convidado PAGA — one-time com preço do cliente
    // Nunca usa subscription/priceId fixo: o preço é definido pelo cliente, é sempre anual
    if (isInvitedSupplier && clientPayer === 'supplier') {
      const session = await stripe.checkout.sessions.create({
        customer_email:      userEmail,
        client_reference_id: supplierId,
        mode: 'payment',
        line_items: [{
          price_data: {
            currency:     'brl',
            unit_amount:  Math.round(effectivePrice * 100),
            product_data: {
              name:        'SIGEC-ELOS Homologação',
              description: 'Processo de homologação anual',
            },
          },
          quantity: 1,
        }],
        success_url: `${frontendUrl}/fornecedor/plano-ativo?session_id={CHECKOUT_SESSION_ID}&supplier=${supplierId}`,
        cancel_url:  `${frontendUrl}/cadastro`,
        metadata: {
          supplierId,
          planType:    'homologado',
          cnaeCount:   String(cnaeCount || 1),
          priceYearly: String(effectivePrice),
          clientId:    clientId || '',
        },
      })

      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ url: session.url, sessionId: session.id }) }
    }

    // CASO 1: Fornecedor espontâneo — subscription com priceId fixo do Stripe
    const priceId = PRICES[planType]

    let sessionConfig = {
      customer_email:      userEmail,
      client_reference_id: supplierId,
      // Campo de cupom SÓ no Verificado mensal (campanha FREETRIALELOS).
      // Cupom do Stripe não distingue preço mensal/anual do mesmo produto —
      // a restrição real é esta: o campo só existe no checkout do mensal.
      allow_promotion_codes: planType === 'verificado_mensal' || undefined,
      success_url: `${frontendUrl}/fornecedor/plano-ativo?session_id={CHECKOUT_SESSION_ID}&supplier=${supplierId}`,
      cancel_url:  `${frontendUrl}/cadastro`,
      metadata: {
        supplierId,
        planType,
        cnaeCount:   String(cnaeCount || 1),
        priceYearly: String(priceYearly || effectivePrice),
      },
    }

    if (priceId) {
      sessionConfig = { ...sessionConfig, mode: 'subscription', line_items: [{ price: priceId, quantity: 1 }] }
    } else {
      // Fallback one-time se price ID não estiver configurado ainda
      sessionConfig = {
        ...sessionConfig,
        mode: 'payment',
        line_items: [{
          price_data: {
            currency:     'brl',
            unit_amount:  Math.round((priceYearly || effectivePrice) * 100),
            product_data: { name: `SIGEC-ELOS ${planType}`, description: `Plano anual · ${cnaeCount} CNAEs` },
          },
          quantity: 1,
        }],
      }
    }

    const session = await stripe.checkout.sessions.create(sessionConfig)
    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ url: session.url, sessionId: session.id }) }

  } catch (err) {
    console.error('create-checkout error:', err)
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) }
  }
}
