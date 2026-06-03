// netlify/functions/create-checkout.js
// Cria Stripe Checkout Session e retorna a URL
// STRIPE_SECRET_KEY deve estar nas env vars do Netlify

const stripe       = require('stripe')(process.env.STRIPE_SECRET_KEY)
const { createClient } = require('@supabase/supabase-js')

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const PRICES = {
  // Mapeamento sealType → price_id do Stripe (novos SKUs)
  verificado_anual:  process.env.STRIPE_PRICE_VERIFICADO_ANUAL,
  verificado_mensal: process.env.STRIPE_PRICE_VERIFICADO_MENSAL,
  homologado_anual:  process.env.STRIPE_PRICE_HOMOLOGADO_ANUAL,
  // Legado (mantido para compatibilidade)
  Simples: process.env.STRIPE_PRICE_SIMPLES || process.env.STRIPE_PRICE_VERIFICADO_ANUAL,
  Premium: process.env.STRIPE_PRICE_PREMIUM || process.env.STRIPE_PRICE_HOMOLOGADO_ANUAL,
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
    const { planType, cnaeCount, supplierId, userEmail, priceYearly, inviteToken } = JSON.parse(event.body)

    const frontendUrl = process.env.FRONTEND_URL || 'https://elos.eqpitech.com.br'
    const stripeKey   = process.env.STRIPE_SECRET_KEY

    if (!stripeKey) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'STRIPE_SECRET_KEY não configurado' }) }
    }

    // ── Preço dinâmico por cliente (fornecedor convidado) ──────────────────────
    let effectivePrice = priceYearly
    let clientPayer    = 'supplier'
    let clientId       = null

    if (inviteToken) {
      const { data: inv } = await supabaseAdmin
        .from('invitations')
        .select('client_id, clients(homologation_price, homologation_payer)')
        .eq('token', inviteToken)
        .maybeSingle()

      if (inv?.client_id) {
        clientId    = inv.client_id
        clientPayer = inv.clients?.homologation_payer || 'supplier'
        if (inv.clients?.homologation_price) effectivePrice = Number(inv.clients.homologation_price)
      }
    }

    // Se o cliente subsidia → não cobrar o fornecedor, retornar URL de sucesso direta
    if (clientPayer === 'client') {
      // Marcar plano como subsidiado sem Stripe
      await supabaseAdmin.from('plans').upsert({
        supplier_id: supplierId,
        type: planType,
        price_yearly: effectivePrice,
        status: 'ACTIVE',
        starts_at: new Date().toISOString(),
        ends_at: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString(),
      }, { onConflict: 'supplier_id' })
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ url: `${frontendUrl}/fornecedor/plano-ativo?supplier=${supplierId}&subsidiado=true` }),
      }
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
            unit_amount: Math.round(effectivePrice * 100), // em centavos
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
