// lib/subsidy.js — convite passa de "fornecedor paga" para SUBSIDIADO depois de
// enviado (patch_159/160, 26/10/2026). Regra única usada pela tela
// (invitation-subsidize), pelo webhook da Stripe e pela conciliação diária.
//
// · só nesse sentido, e só enquanto o fornecedor NÃO pagou (cartão, PIX ou
//   boleto compensado = irreversível: estorno e cancelamento de nota fiscal);
// · boleto do ELOS em aberto: a Stripe NÃO cancela boleto emitido (testado
//   26/10: "cannot be canceled when it has a requires_action status") e boleto
//   pago não tem estorno → o pedido fica AGENDADO: vence sem pagamento → a
//   troca vale sozinha; o fornecedor pagou → vale o pagamento dele e o pedido
//   é anulado (o cliente não é cobrado);
// · boleto do HOC (antes da virada) e convite do HOC (hoc_id) nunca mudam.
const routeA = require('./route_a.js')
const { env, frontendUrl } = require('./runtime_env.js')
const { guardedResend } = require('./mail_guard.js')
const { normalizeCnpj } = require('./cnpj.js')

const dataBR = (d) => d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : ''

// O que a troca encontra (erro = não pode). modo: 'agora' | 'agendar'
async function avaliar(sb, stripe, inv) {
  if (inv.hoc_id) return { erro: 'Convite do HOC — é gerenciado no HOC e não pode ser alterado pelo ELOS' }
  if (inv.subsidiado === true) return { erro: 'Este convite já é subsidiado' }
  if (inv.subsidy_requested_at && !inv.subsidy_voided_at) {
    return { erro: `A troca já está agendada: vale assim que o boleto do fornecedor vencer sem pagamento${inv.subsidy_boleto_due ? ` (${dataBR(inv.subsidy_boleto_due)})` : ''}` }
  }
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

  let supplierId = inv.supplier_id || null
  if (!supplierId && inv.supplier_cnpj) {
    supplierId = (await sb.from('suppliers').select('id').eq('cnpj', normalizeCnpj(inv.supplier_cnpj)).maybeSingle()).data?.id || null
  }
  const out = { flow, supplierId, seal: null, modo: 'agora', boleto: null }
  if (!supplierId) return out                    // ainda não se cadastrou: não há pagamento

  const { data: seal } = await sb.from('seals')
    .select('id, status, released_at, hoc_process_id, hoc_boleto_status')
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

  // boleto do ELOS: plano PENDENTE com sessão da Stripe DESTE cliente
  const { data: plan } = await sb.from('plans').select('status, stripe_session_id').eq('supplier_id', supplierId).maybeSingle()
  if (plan?.status === 'PENDING' && plan.stripe_session_id) {
    let s
    try { s = await stripe.checkout.sessions.retrieve(plan.stripe_session_id, { expand: ['payment_intent'] }) }
    catch (e) { return { erro: `Não foi possível conferir o pagamento na Stripe (${e.message}). Tente de novo em instantes.` } }
    if (!s.metadata?.clientId || s.metadata.clientId === inv.client_id) {
      const pi = s.payment_intent
      if (s.payment_status === 'paid' || pi?.status === 'succeeded' || pi?.status === 'processing') {
        return { erro: 'O pagamento do fornecedor já foi feito ou está sendo compensado — a troca não é possível' }
      }
      if (pi?.status === 'requires_action') {
        // boleto emitido e válido: agenda (a Stripe não cancela)
        const exp = pi.next_action?.boleto_display_details?.expires_at
        out.modo = 'agendar'
        out.boleto = { sessionId: s.id, vence: exp ? new Date(exp * 1000).toISOString() : null }
      } else {
        out.boletoVencido = s.id                 // venceu/expirou sem pagamento: troca agora
      }
    }
  }
  return out
}

async function enviarEmail(to, subject, corpo, botao) {
  if (!to || !process.env.RESEND_API_KEY) return false
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#374151">
  <div style="background:#2E3192;padding:24px;border-radius:12px 12px 0 0;text-align:center"><div style="color:#fff;font-size:21px;font-weight:bold">SIGEC-ELOS</div></div>
  <div style="background:#fff;padding:26px;border:1px solid #e2e8f0;border-top:none;font-size:15px;line-height:1.6">${corpo}
    ${botao ? `<p style="text-align:center;margin:24px 0"><a href="${botao.href}" style="display:inline-block;background:#F47E2F;color:#fff;padding:13px 30px;border-radius:9px;text-decoration:none;font-weight:bold">${botao.txt}</a></p>` : ''}
    <p>Conte com a gente,<br><strong>Equipe EQPI Tech</strong></p>
  </div>
  <div style="background:#f8fafc;padding:14px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;text-align:center;font-size:12px;color:#6b7280">Dúvidas? suporte@eqpitech.com.br · EQPI Tech · elos.eqpitech.com.br</div></div>`
  const r = await guardedResend('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    body: JSON.stringify({ from: process.env.EMAIL_FROM || 'SIGEC-ELOS <noreply@eqpitech.com.br>', to: [to],
      reply_to: 'suporte@eqpitech.com.br', subject, html }),
  }).catch((e) => { console.warn('[subsidio] e-mail:', e.message); return null })
  return !!r?.ok
}

// destinatário: e-mail do login, senão o do cadastro, senão o do convite (regra 16)
async function contato(sb, inv, supplierId) {
  let to = inv.supplier_email || null, nome = inv.supplier_razao_social || ''
  if (supplierId) {
    const { data: sup } = await sb.from('suppliers').select('razao_social, email, user_id').eq('id', supplierId).maybeSingle()
    nome = sup?.razao_social || nome
    to = sup?.email || to
    if (sup?.user_id) {
      const { data: u } = await sb.auth.admin.getUserById(sup.user_id).catch(() => ({ data: null }))
      to = u?.user?.email || to
    }
  }
  return { to, nome }
}

async function nomeCliente(sb, clientId) {
  const { data: cli } = await sb.from('clients').select('razao_social, nome_fantasia').eq('id', clientId).maybeSingle()
  return cli?.nome_fantasia || cli?.razao_social || 'o cliente'
}

// Efetiva a troca (o gatilho trg_invitation_subsidy_release libera o processo)
async function efetivar(sb, inv, a, { userId = null, autor, feitoPor, agendado = false } = {}) {
  const patch = { subsidiado: true }
  if (!inv.flow_id) patch.flow_id = a.flow.id
  const { data: upd, error: upErr } = await sb.from('invitations').update(patch)
    .eq('id', inv.id).eq('subsidiado', false).is('hoc_id', null).select('id')
  if (upErr) throw new Error(upErr.message)
  if (!upd?.length) return { erro: 'O convite foi alterado por outra pessoa — atualize a tela' }
  if (a.boletoVencido) {
    await sb.from('plans').update({ status: 'CANCELED' })
      .eq('supplier_id', a.supplierId).eq('stripe_session_id', a.boletoVencido).eq('status', 'PENDING')
  }

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
    // coleta automática começa na liberação (como no pagamento confirmado)
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

  const clienteNome = await nomeCliente(sb, inv.client_id)
  await sb.from('audit_log').insert({
    user_id: userId, action: 'INVITATION_SUBSIDIZED',
    entity_type: a.seal ? 'seal' : 'invitation', entity_id: a.seal ? a.seal.id : inv.id,
    metadata: {
      client_id: inv.client_id, invitation_id: inv.id, supplier_id: a.supplierId, seal_id: a.seal?.id || null,
      fluxo: a.flow.name, valor: Number(a.flow.price_subsidized), feito_por: feitoPor, agendado, autor,
      label: `Convite passou a ser subsidiado por ${clienteNome}${agendado ? ' · boleto do fornecedor venceu sem pagamento' : ''}`,
    },
  })

  const { to, nome } = await contato(sb, inv, a.supplierId)
  const emailEnviado = await enviarEmail(to, `${clienteNome} vai custear a sua homologação — SIGEC-ELOS`,
    `<p>Olá${nome ? `, <strong>${nome}</strong>` : ''}!</p>
    <p>Boa notícia: a <strong>${clienteNome}</strong> vai custear a sua homologação no SIGEC-ELOS. <strong>Você não precisa pagar nada.</strong></p>
    ${agendado ? '<p>O boleto que havia sido emitido para você venceu e não deve mais ser pago.</p>' : ''}
    <p>${a.supplierId ? 'O seu processo já está liberado: entre no SIGEC-ELOS e envie os documentos pedidos.' : 'Para começar, finalize o seu cadastro pelo link do convite.'}</p>`,
    a.supplierId ? { href: `${frontendUrl()}/fornecedor/documentos`, txt: 'Enviar documentos' }
      : { href: inv.token ? `${frontendUrl()}/cadastro?token=${inv.token}` : frontendUrl(), txt: 'Finalizar cadastro' })
  return { ok: true, valor: Number(a.flow.price_subsidized), liberado: !!a.seal, emailEnviado }
}

// Agenda a troca: boleto do ELOS em aberto (a Stripe não cancela)
async function agendar(sb, inv, a, { userId = null, autor, feitoPor } = {}) {
  const { data: upd, error } = await sb.from('invitations').update({
    subsidy_requested_at: new Date().toISOString(), subsidy_requested_by: userId,
    subsidy_stripe_session: a.boleto.sessionId, subsidy_boleto_due: a.boleto.vence, subsidy_voided_at: null,
  }).eq('id', inv.id).eq('subsidiado', false).is('hoc_id', null).select('id')
  if (error) throw new Error(error.message)
  if (!upd?.length) return { erro: 'O convite foi alterado por outra pessoa — atualize a tela' }

  const clienteNome = await nomeCliente(sb, inv.client_id)
  await sb.from('audit_log').insert({
    user_id: userId, action: 'INVITATION_SUBSIDY_SCHEDULED',
    entity_type: a.seal ? 'seal' : 'invitation', entity_id: a.seal ? a.seal.id : inv.id,
    metadata: {
      client_id: inv.client_id, invitation_id: inv.id, supplier_id: a.supplierId, seal_id: a.seal?.id || null,
      fluxo: a.flow.name, valor: Number(a.flow.price_subsidized), feito_por: feitoPor, autor,
      stripe_session_id: a.boleto.sessionId, boleto_vence: a.boleto.vence,
      label: `${clienteNome} vai custear a homologação — vale quando o boleto emitido vencer sem pagamento${a.boleto.vence ? ` (${dataBR(a.boleto.vence)})` : ''}`,
    },
  })
  const { to, nome } = await contato(sb, inv, a.supplierId)
  const emailEnviado = await enviarEmail(to, `${clienteNome} vai custear a sua homologação — não pague o boleto`,
    `<p>Olá${nome ? `, <strong>${nome}</strong>` : ''}!</p>
    <p>Boa notícia: a <strong>${clienteNome}</strong> vai custear a sua homologação no SIGEC-ELOS.</p>
    <p style="background:#fff7ed;border-left:4px solid #F47E2F;padding:10px 14px;border-radius:0 8px 8px 0"><strong>Não pague o boleto que foi emitido para você.</strong>
    Ele vence${a.boleto.vence ? ` em <strong>${dataBR(a.boleto.vence)}</strong>` : ' em poucos dias'} e, logo depois, o seu processo é liberado automaticamente, sem custo para você — avisamos por e-mail.</p>`,
    null)
  return { ok: true, agendado: true, vence: a.boleto.vence, valor: Number(a.flow.price_subsidized), emailEnviado }
}

const SEL_INV = 'id, client_id, supplier_id, supplier_cnpj, supplier_email, supplier_razao_social, status, subsidiado, flow_id, hoc_id, token, objetivo, subsidy_requested_at, subsidy_requested_by, subsidy_stripe_session, subsidy_boleto_due, subsidy_voided_at'

// Boleto venceu sem pagamento (webhook async_payment_failed / conciliação):
// aplica as trocas agendadas para aquela sessão
async function aplicarAgendados(sb, stripe, sessionId) {
  const { data: invs } = await sb.from('invitations').select(SEL_INV)
    .eq('subsidy_stripe_session', sessionId).eq('subsidiado', false).is('subsidy_voided_at', null).not('subsidy_requested_at', 'is', null)
  const out = []
  for (const inv of invs || []) {
    const pend = { ...inv, subsidy_requested_at: null }        // reavalia como pedido novo
    const a = await avaliar(sb, stripe, pend)
    if (a.erro || a.modo === 'agendar') { out.push({ inv: inv.id, erro: a.erro || 'boleto ainda em aberto' }); continue }
    const r = await efetivar(sb, inv, a, { userId: inv.subsidy_requested_by, autor: 'troca agendada pelo cliente', feitoPor: 'AGENDADO', agendado: true })
    out.push({ inv: inv.id, ...r })
  }
  return out
}

// Boleto COMPENSOU: vale o pagamento do fornecedor — anula o pedido (cliente não é cobrado)
async function anularAgendados(sb, sessionId) {
  const { data: invs } = await sb.from('invitations').update({ subsidy_voided_at: new Date().toISOString() })
    .eq('subsidy_stripe_session', sessionId).eq('subsidiado', false).is('subsidy_voided_at', null)
    .not('subsidy_requested_at', 'is', null).select('id, client_id, supplier_id')
  for (const inv of invs || []) {
    const { data: seal } = await sb.from('seals').select('id').eq('supplier_id', inv.supplier_id).eq('client_id', inv.client_id).maybeSingle()
    await sb.from('audit_log').insert({ action: 'INVITATION_SUBSIDY_VOIDED', entity_type: seal ? 'seal' : 'invitation', entity_id: seal?.id || inv.id,
      metadata: { client_id: inv.client_id, invitation_id: inv.id, stripe_session_id: sessionId,
                  label: 'O fornecedor pagou o boleto antes do vencimento — vale o pagamento dele; o cliente não é cobrado' } })
  }
  return (invs || []).length
}

module.exports = { avaliar, efetivar, agendar, aplicarAgendados, anularAgendados, SEL_INV, dataBR }
