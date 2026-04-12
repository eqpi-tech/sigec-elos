// netlify/functions/create-checkout.js
// Cria Stripe Checkout Session e retorna a URL
// STRIPE_SECRET_KEY deve estar nas env vars do Netlify

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)

const PRICES = {
  // Mapeamento planType → price_id do Stripe
  // Configure os price IDs no Stripe Dashboard e adicione nas env vars
  Simples: process.env.STRIPE_PRICE_SIMPLES,
  Premium: process.env.STRIPE_PRICE_PREMIUM,
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' }
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  try {
    const { planType, cnaeCount, supplierId, userEmail, priceYearly } = JSON.parse(event.body)

    const frontendUrl = process.env.FRONTEND_URL || 'https://elos.eqpitech.com.br'
    const stripeKey   = process.env.STRIPE_SECRET_KEY

    if (!stripeKey) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'STRIPE_SECRET_KEY não configurado' }) }
    }

    // Se não houver price ID configurado, usa one-time payment
    const priceId = PRICES[planType]

    let sessionConfig = {
      customer_email: userEmail,
      client_reference_id: supplierId,
      success_url: `${frontendUrl}/fornecedor/plano-ativo?session_id={CHECKOUT_SESSION_ID}&supplier=${supplierId}`,
      cancel_url:  `${frontendUrl}/cadastro`,
      metadata: { supplierId, planType, cnaeCount: String(cnaeCount), priceYearly: String(priceYearly) },
    }

    if (priceId) {
      // Usa price pré-configurado no Stripe (modo subscription)
      sessionConfig = {
        ...sessionConfig,
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
      }
    } else {
      // Cria o produto/preço dinâmico (mode one-time)
      sessionConfig = {
        ...sessionConfig,
        mode: 'payment',
        line_items: [{
          price_data: {
            currency: 'brl',
            unit_amount: priceYearly * 100, // em centavos
            product_data: {
              name: `SIGEC-ELOS ${planType}`,
              description: `Plano anual · ${cnaeCount} CNAEs`,
            },
          },
          quantity: 1,
        }],
      }
    }

    const session = await stripe.checkout.sessions.create(sessionConfig)

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ url: session.url, sessionId: session.id }),
    }
  } catch (err) {
    console.error('create-checkout error:', err)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    }
  }
}
