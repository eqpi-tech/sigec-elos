// netlify/functions/create-checkout.js
// Cria Stripe Checkout Session e retorna a URL
//
// Casos atendidos:
//  1. Fornecedor espontâneo (Verificado/Homologado)  → subscription Stripe com priceId fixo
//  2. Fornecedor convidado / tagueado (convite, portal do cliente ou processo
//     de cliente pendente — resolveClientDeal) → preço COMBINADO com o cliente
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
      refSlug,       // portal do cliente (/portal/:slug)
      refFlowId,     // pacote escolhido no portal
      action,        // 'quote' = só a cotação
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
    // Regra comercial (01/10): valores ELOS são SÓ para quem entra direto no
    // sistema, sem convite (inclusive por e-mail marketing). Convite e portal
    // do cliente são tagueados justamente para valer o PREÇO COMBINADO com o
    // cliente — o do nível/pacote escolhido ou o do fluxo padrão do cliente.
    // O preço é decidido AQUI, no servidor (o navegador não manda no valor).
    let defaultHomologado = 690
    let elosPrices = {}
    try {
      const { data: st } = await supabaseAdmin.from('app_settings')
        .select('value').eq('key', 'elos_prices').maybeSingle()
      elosPrices = st?.value || {}
      if (elosPrices.homologado_anual != null) defaultHomologado = Number(elosPrices.homologado_anual)
    } catch { /* mantém fallback */ }
    // valor ELOS (entrada direta): Preços ELOS do backoffice, nunca o do navegador
    const elosPrice = Number(elosPrices[planType] ?? (String(planType).startsWith('verificado') ? elosPrices.verificado_anual : defaultHomologado) ?? defaultHomologado)

    const deal = await resolveClientDeal({ inviteToken, refSlug, refFlowId, supplierId })

    // cotação: o que a tela deve mostrar antes de pagar (sem criar sessão)
    if (action === 'quote') {
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify(deal
        ? { modo: 'cliente', cliente: deal.clientName, fluxo: deal.flowName, preco: deal.price, pagador: deal.payer, erro: deal.erro || null }
        : { modo: 'elos' }) }
    }
    if (deal?.erro) return { statusCode: 422, headers: HEADERS, body: JSON.stringify({ error: deal.erro }) }

    const isInvitedSupplier = !!deal
    const clientId     = deal?.clientId || null
    const clientPayer  = deal?.payer || 'supplier'
    const effectivePrice = deal?.price ?? defaultHomologado
    // CASO 2a: Cliente subsidia — sem Stripe, ativa plano direto e libera o
    // processo (patch_112: subsidiado não espera pagamento — quem paga é o cliente)
    if (isInvitedSupplier && clientPayer === 'client') {
      await supabaseAdmin.from('seals').update({ released_at: new Date().toISOString() })
        .eq('supplier_id', supplierId).eq('client_id', clientId).is('released_at', null)
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
              name:        `Homologação ${deal?.clientName || 'SIGEC-ELOS'}${deal?.flowName ? ` — ${deal.flowName}` : ''}`,
              description: 'Processo de homologação anual — valor combinado com o cliente',
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
          flowId:      deal?.flowId || '',
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
        priceYearly: String(elosPrice),
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
            unit_amount:  Math.round(elosPrice * 100),
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

// Acordo comercial com o cliente para este fornecedor, ou null (= valores ELOS).
// Ordem: convite (token) → portal do cliente (slug + pacote) → processo do
// cliente ainda não pago do fornecedor (convite sem token, portal já cadastrado
// e quem volta para pagar depois). Preço de quem paga: o do fluxo; sem preço no
// fluxo, o do fluxo padrão do cliente; depois o preço legado do cliente.
async function resolveClientDeal({ inviteToken, refSlug, refFlowId, supplierId }) {
  let clientId = null, flowId = null, payer = null
  if (inviteToken) {
    const { data: inv } = await supabaseAdmin.from('invitations')
      .select('client_id, subsidiado, flow_id, status').eq('token', inviteToken).maybeSingle()
    if (inv?.client_id && inv.status !== 'CANCELLED') {
      clientId = inv.client_id; flowId = inv.flow_id || null
      payer = inv.subsidiado === true ? 'client' : inv.subsidiado === false ? 'supplier' : null
    }
  }
  if (!clientId && refSlug) {
    const { data: lp } = await supabaseAdmin.from('client_landing_pages')
      .select('client_id').eq('slug', refSlug).eq('is_active', true).maybeSingle()
    if (lp?.client_id) {
      clientId = lp.client_id
      if (refFlowId) {
        const { data: fl } = await supabaseAdmin.from('client_flows').select('id')
          .eq('id', refFlowId).eq('client_id', clientId).eq('active', true).maybeSingle()
        flowId = fl?.id || null
      }
      payer = 'supplier'
    }
  }
  if (!clientId && supplierId) {
    const { data: seal } = await supabaseAdmin.from('seals')
      .select('client_id, flow_id').eq('supplier_id', supplierId).not('client_id', 'is', null)
      .eq('status', 'PENDING').is('released_at', null)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (seal?.client_id) {
      clientId = seal.client_id; flowId = seal.flow_id || null
      const { data: inv } = await supabaseAdmin.from('invitations').select('subsidiado')
        .eq('supplier_id', supplierId).eq('client_id', clientId).not('status', 'in', '(CANCELLED,SUPERSEDED)').is('hoc_id', null)
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      payer = inv?.subsidiado === true ? 'client' : 'supplier'
    }
  }
  if (!clientId) return null

  const { data: cli } = await supabaseAdmin.from('clients')
    .select('razao_social, nome_fantasia, homologation_price, homologation_payer').eq('id', clientId).maybeSingle()
  if (!payer) payer = cli?.homologation_payer === 'client' ? 'client' : 'supplier'
  let flow = null
  if (flowId) {
    const { data } = await supabaseAdmin.from('client_flows').select('id, name, price, price_subsidized').eq('id', flowId).maybeSingle()
    flow = data
  }
  const { data: def } = await supabaseAdmin.from('client_flows').select('id, name, price, price_subsidized')
    .eq('client_id', clientId).eq('is_default', true).eq('active', true).maybeSingle()
  if (!flow) flow = def || null
  // subsidiado: registra o preço subsidiado (relatório ao cliente); quem paga
  // no Stripe paga o preço NÃO subsidiado do fluxo
  const price = payer === 'client'
    ? (flow?.price_subsidized ?? flow?.price ?? def?.price_subsidized ?? def?.price ?? cli?.homologation_price ?? null)
    : (flow?.price ?? def?.price ?? cli?.homologation_price ?? null)
  const deal = {
    clientId, flowId: flow?.id || null, flowName: flow?.name || null, payer,
    clientName: cli?.nome_fantasia || cli?.razao_social || 'Cliente',
    price: price != null ? Number(price) : null,
  }
  if (payer === 'supplier' && !(deal.price > 0)) {
    deal.erro = `O valor da homologação com ${deal.clientName} não está configurado. Fale com o cliente ou com a EQPI.`
  }
  return deal
}
