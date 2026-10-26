// netlify/functions/invitation-subsidize.js — o cliente (ou o backoffice, em
// nome dele) passa um convite de "fornecedor paga" para SUBSIDIADO (26/10/2026,
// pedido de cliente da migração de novembro). Só nesse sentido, e só enquanto o
// fornecedor NÃO pagou: boleto emitido e não pago pode; cartão, PIX ou boleto
// compensado é irreversível (estorno e cancelamento de nota fiscal).
//
// Boleto do ELOS em aberto: o pagamento é CANCELADO na Stripe antes da troca
// (boleto pago não tem estorno na Stripe) — se o cancelamento falhar, nada muda.
// Boleto do HOC (antes da virada) não pode ser cancelado daqui: recusa.
// Convite do HOC (hoc_id) nunca é tocado (patch_116).
//
// A liberação do processo vem do gatilho trg_invitation_subsidy_release; aqui:
// plano (como o subsidiado do create-checkout), coleta automática, registro no
// log do processo e e-mail ao fornecedor.
// POST { inviteId }   (?check=1 só valida, sem trocar — usado pela tela)
const { createClient } = require('@supabase/supabase-js')
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const routeA = require('./lib/route_a.js')
const { env, frontendUrl } = require('./lib/runtime_env.js')
const { guardedResend } = require('./lib/mail_guard.js')
const { normalizeCnpj } = require('./lib/cnpj.js')

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const HEADERS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' }
const res = (code, body) => ({ statusCode: code, headers: HEADERS, body: JSON.stringify(body) })
const brl = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// mesma regra do hasAction (src/lib/modules.js): perfil sem chaves 'acao:'
// libera tudo; com chaves, só o que estiver na lista
const permite = (modules, key) => !Array.isArray(modules) || modules.includes('*')
  || !modules.some((k) => String(k).startsWith('acao:')) || modules.includes(key)

// O que impede a troca (null = pode). Devolve também o que a troca vai fazer.
async function avaliar(inv) {
  if (inv.hoc_id) return { erro: 'Convite do HOC — é gerenciado no HOC e não pode ser alterado pelo ELOS' }
  if (inv.subsidiado === true) return { erro: 'Este convite já é subsidiado' }
  if (['CANCELLED', 'SUPERSEDED', 'EXPIRED'].includes(inv.status)) return { erro: 'Convite cancelado ou substituído — envie um novo convite, já como subsidiado' }
  if (!inv.client_id) return { erro: 'Convite sem cliente' }
  if (inv.objetivo === 'contato') return { erro: 'Convite de contato não tem processo de homologação' }

  // fluxo do convite (ou o padrão do cliente): precisa operar no modelo subsidiado
  let flow = null
  if (inv.flow_id) flow = (await sb.from('client_flows').select('id, name, price, price_subsidized').eq('id', inv.flow_id).maybeSingle()).data
  if (!flow) flow = (await sb.from('client_flows').select('id, name, price, price_subsidized')
    .eq('client_id', inv.client_id).eq('is_default', true).eq('active', true).maybeSingle()).data
  if (!flow || flow.price_subsidized == null) {
    return { erro: `O fluxo ${flow?.name ? `"${flow.name}" ` : ''}não tem valor subsidiado configurado — fale com a EQPI para incluir o valor` }
  }

  // fornecedor já cadastrado? (pelo convite ou pelo CNPJ)
  let supplierId = inv.supplier_id || null
  if (!supplierId && inv.supplier_cnpj) {
    supplierId = (await sb.from('suppliers').select('id').eq('cnpj', normalizeCnpj(inv.supplier_cnpj)).maybeSingle()).data?.id || null
  }
  const out = { flow, supplierId, seal: null, boleto: null }
  if (!supplierId) return out                    // ainda não se cadastrou: não há pagamento

  const { data: seal } = await sb.from('seals')
    .select('id, status, released_at, hoc_process_id, hoc_boleto_status, queued_at')
    .eq('supplier_id', supplierId).eq('client_id', inv.client_id).maybeSingle()
  out.seal = seal || null
  if (seal) {
    if (seal.hoc_process_id) return { erro: 'Processo do HOC — não pode ser alterado pelo ELOS' }
    if (seal.hoc_boleto_status === 'A_VENCER') {
      return { erro: 'O fornecedor tem um boleto emitido no SIGEC-HOC, que não pode ser cancelado pelo ELOS. Fale com a EQPI.' }
    }
    if (seal.released_at) return { erro: 'O fornecedor já pagou este processo — a troca não é possível (envolveria estorno e cancelamento de nota fiscal)' }
    if (seal.status !== 'PENDING') return { erro: 'O processo já não está aguardando pagamento' }
  }

  // boleto do ELOS emitido: plano PENDENTE com sessão da Stripe DESTE cliente
  const { data: plan } = await sb.from('plans').select('status, stripe_session_id').eq('supplier_id', supplierId).maybeSingle()
  if (plan?.status === 'PENDING' && plan.stripe_session_id) {
    let s
    try { s = await stripe.checkout.sessions.retrieve(plan.stripe_session_id, { expand: ['payment_intent'] }) }
    catch (e) { return { erro: `Não foi possível conferir o pagamento na Stripe (${e.message}). Tente de novo em instantes.` } }
    const doCliente = !s.metadata?.clientId || s.metadata.clientId === inv.client_id
    if (doCliente) {
      if (s.payment_status === 'paid' || s.payment_intent?.status === 'succeeded' || s.payment_intent?.status === 'processing') {
        return { erro: 'O pagamento do fornecedor já foi feito ou está sendo compensado — a troca não é possível' }
      }
      out.boleto = { sessionId: s.id, paymentIntent: s.payment_intent?.id || null, piStatus: s.payment_intent?.status || null }
    }
  }
  return out
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return res(200, {})
  if (event.httpMethod !== 'POST') return res(405, { error: 'Method not allowed' })
  const token = (event.headers.authorization || '').replace('Bearer ', '')
  const { data: { user } = {}, error: authErr } = await sb.auth.getUser(token)
  if (authErr || !user) return res(401, { error: 'Sessão expirada — saia e entre novamente na plataforma' })

  let body
  try { body = JSON.parse(event.body || '{}') } catch { return res(400, { error: 'JSON inválido' }) }
  if (!body.inviteId) return res(400, { error: 'inviteId obrigatório' })
  const soConferir = event.queryStringParameters?.check === '1'

  const { data: inv } = await sb.from('invitations')
    .select('id, client_id, supplier_id, supplier_cnpj, supplier_email, supplier_razao_social, status, subsidiado, flow_id, hoc_id, token, objetivo')
    .eq('id', body.inviteId).maybeSingle()
  if (!inv) return res(404, { error: 'Convite não encontrado' })

  const { data: roles } = await sb.from('user_roles').select('role, client_id, access_profile, access_profile_id, is_active').eq('user_id', user.id)
  const isAdmin = (roles || []).some((r) => r.role === 'ADMIN' && r.is_active !== false)
  const doCliente = (roles || []).find((r) => r.role === 'CLIENT' && r.client_id === inv.client_id && r.is_active !== false)
  if (!isAdmin && !doCliente) return res(403, { error: 'Convite de outro cliente' })
  if (!isAdmin) {
    if (doCliente.access_profile === 'readonly') return res(403, { error: 'Seu perfil de acesso é somente leitura' })
    if (doCliente.access_profile_id) {
      const { data: perfil } = await sb.from('access_profiles').select('modules').eq('id', doCliente.access_profile_id).maybeSingle()
      if (!permite(perfil?.modules, 'acao:subsidiar_convite')) return res(403, { error: 'Seu perfil não permite tornar convites subsidiados — fale com o administrador da sua empresa' })
    }
  }

  const a = await avaliar(inv)
  if (a.erro) return res(409, { error: a.erro })
  if (soConferir) {
    return res(200, { ok: true, valor: Number(a.flow.price_subsidized), fluxo: a.flow.name,
                      boleto: !!a.boleto, cadastrado: !!a.supplierId })
  }

  // 1) boleto em aberto: cancela na Stripe ANTES de trocar (boleto pago não tem estorno)
  let boletoCancelado = false
  if (a.boleto?.paymentIntent && a.boleto.piStatus !== 'canceled') {
    try {
      await stripe.paymentIntents.cancel(a.boleto.paymentIntent, { cancellation_reason: 'abandoned' })
      boletoCancelado = true
    } catch (e) {
      // corrida: compensou entre a conferência e o cancelamento
      const pi = await stripe.paymentIntents.retrieve(a.boleto.paymentIntent).catch(() => null)
      if (pi?.status === 'succeeded' || pi?.status === 'processing') {
        return res(409, { error: 'O pagamento do fornecedor acabou de ser compensado — a troca não é possível' })
      }
      return res(502, { error: `Não foi possível cancelar o boleto na Stripe (${e.message}). Nada foi alterado — tente de novo ou fale com a EQPI.` })
    }
  }
  if (a.boleto) {
    await sb.from('plans').update({ status: 'CANCELED' })
      .eq('supplier_id', a.supplierId).eq('stripe_session_id', a.boleto.sessionId).eq('status', 'PENDING')
  }

  // 2) a troca (o gatilho trg_invitation_subsidy_release libera o processo)
  const patch = { subsidiado: true }
  if (!inv.flow_id) patch.flow_id = a.flow.id
  const { data: upd, error: upErr } = await sb.from('invitations').update(patch)
    .eq('id', inv.id).eq('subsidiado', false).is('hoc_id', null).select('id')
  if (upErr) return res(500, { error: upErr.message })
  if (!upd?.length) return res(409, { error: 'O convite foi alterado por outra pessoa — atualize a tela' })

  if (a.supplierId) {
    // processo sem fluxo (o selo criado no cadastro não grava): assume o do
    // convite — é dele que sai o valor da cobrança ao cliente
    if (a.seal) await sb.from('seals').update({ flow_id: a.flow.id }).eq('id', a.seal.id).is('flow_id', null)
    // plano como no subsidiado do create-checkout — sem sobrescrever assinatura ativa
    const { data: plan } = await sb.from('plans').select('status').eq('supplier_id', a.supplierId).maybeSingle()
    if (!plan || plan.status !== 'ACTIVE') {
      await sb.from('plans').upsert({
        supplier_id: a.supplierId, type: 'homologado', price_yearly: Number(a.flow.price_subsidized), status: 'ACTIVE',
        starts_at: new Date().toISOString(), ends_at: new Date(Date.now() + 365 * 864e5).toISOString(),
      }, { onConflict: 'supplier_id' })
    }
    // 3) coleta automática começa na liberação (como no pagamento confirmado)
    if (routeA.enabled()) {
      try {
        const n = await routeA.enqueueRouteA(sb, a.supplierId)
        const site = env('ELOS_ENV') === 'production' ? env('URL') : (env('DEPLOY_PRIME_URL') || env('URL'))
        if (n && site && process.env.CRON_SECRET) {
          await fetch(`${site}/.netlify/functions/homolog-collect-background`, {
            method: 'POST', headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` }, body: '{}',
            signal: AbortSignal.timeout(4000),
          }).catch(() => {})
        }
      } catch (e) { console.warn('[subsidio] coleta:', e.message) }
    }
  }

  // 4) registro (aparece no log do processo para o cliente — patch_159)
  const { data: cli } = await sb.from('clients').select('razao_social, nome_fantasia').eq('id', inv.client_id).maybeSingle()
  const clienteNome = cli?.nome_fantasia || cli?.razao_social || 'o cliente'
  const autor = isAdmin && !doCliente ? 'EQPI (a pedido do cliente)'
    : (user.user_metadata?.full_name || user.user_metadata?.name || user.email)
  await sb.from('audit_log').insert({
    user_id: user.id, action: 'INVITATION_SUBSIDIZED',
    entity_type: a.seal ? 'seal' : 'invitation', entity_id: a.seal ? a.seal.id : inv.id,
    metadata: {
      client_id: inv.client_id, invitation_id: inv.id, supplier_id: a.supplierId, seal_id: a.seal?.id || null,
      fluxo: a.flow.name, valor: Number(a.flow.price_subsidized), feito_por: isAdmin && !doCliente ? 'ADMIN' : 'CLIENT',
      boleto_cancelado: boletoCancelado, stripe_session_id: a.boleto?.sessionId || null, autor,
      label: `Convite passou a ser subsidiado por ${clienteNome}${boletoCancelado ? ' · boleto do fornecedor cancelado' : ''}`,
    },
  })

  // 5) e-mail ao fornecedor (cadastrado: e-mail do login ou do cadastro; senão o do convite)
  let to = inv.supplier_email || null, nome = inv.supplier_razao_social || ''
  if (a.supplierId) {
    const { data: sup } = await sb.from('suppliers').select('razao_social, email, user_id').eq('id', a.supplierId).maybeSingle()
    nome = sup?.razao_social || nome
    to = sup?.email || to
    if (sup?.user_id) {
      const { data: u } = await sb.auth.admin.getUserById(sup.user_id).catch(() => ({ data: null }))
      to = u?.user?.email || to
    }
  }
  let emailEnviado = false
  if (to && process.env.RESEND_API_KEY) {
    const link = a.supplierId ? `${frontendUrl()}/fornecedor/documentos` : (inv.token ? `${frontendUrl()}/cadastro?token=${inv.token}` : frontendUrl())
    const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#374151">
  <div style="background:#2E3192;padding:24px;border-radius:12px 12px 0 0;text-align:center"><div style="color:#fff;font-size:21px;font-weight:bold">SIGEC-ELOS</div></div>
  <div style="background:#fff;padding:26px;border:1px solid #e2e8f0;border-top:none;font-size:15px;line-height:1.6">
    <p>Olá${nome ? `, <strong>${nome}</strong>` : ''}!</p>
    <p>Boa notícia: a <strong>${clienteNome}</strong> vai custear a sua homologação no SIGEC-ELOS. <strong>Você não precisa pagar nada.</strong></p>
    ${boletoCancelado ? '<p style="background:#fff7ed;border-left:4px solid #F47E2F;padding:10px 14px;border-radius:0 8px 8px 0"><strong>O boleto que foi emitido para você foi cancelado — não pague esse boleto.</strong></p>' : ''}
    <p>${a.supplierId ? 'O seu processo já está liberado: entre no SIGEC-ELOS e envie os documentos pedidos.' : 'Para começar, finalize o seu cadastro pelo link do convite.'}</p>
    <p style="text-align:center;margin:24px 0"><a href="${link}" style="display:inline-block;background:#F47E2F;color:#fff;padding:13px 30px;border-radius:9px;text-decoration:none;font-weight:bold">${a.supplierId ? 'Enviar documentos' : 'Finalizar cadastro'}</a></p>
    <p>Conte com a gente,<br><strong>Equipe EQPI Tech</strong></p>
  </div>
  <div style="background:#f8fafc;padding:14px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;text-align:center;font-size:12px;color:#6b7280">Dúvidas? suporte@eqpitech.com.br · EQPI Tech · elos.eqpitech.com.br</div></div>`
    const r = await guardedResend('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      body: JSON.stringify({ from: process.env.EMAIL_FROM || 'SIGEC-ELOS <noreply@eqpitech.com.br>', to: [to], reply_to: 'suporte@eqpitech.com.br',
        subject: `${clienteNome} vai custear a sua homologação — SIGEC-ELOS`, html }),
    }).catch((e) => { console.warn('[subsidio] e-mail:', e.message); return null })
    emailEnviado = !!r?.ok
  }

  return res(200, { ok: true, valor: Number(a.flow.price_subsidized), boletoCancelado, liberado: !!a.seal, emailEnviado })
}
