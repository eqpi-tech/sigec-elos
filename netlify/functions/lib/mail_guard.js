// lib/mail_guard.js — trava de ambiente para e-mails (25/09, preparação do
// ambiente de staging).
//
// Fora de produção (ELOS_ENV diferente de 'production') NENHUM e-mail pode
// chegar ao destinatário real: um teste no staging não pode escrever para
// fornecedores, clientes ou compradores de verdade.
//   · MAIL_TEST_INBOX definida → tudo é redirecionado para essa caixa, com o
//     destinatário original no assunto (dá para testar conteúdo e gatilhos)
//   · sem MAIL_TEST_INBOX      → o envio é DESCARTADO com log
// Em produção o comportamento é exatamente o de antes.

const { env } = require('./runtime_env.js')

const isProd = () => (env('ELOS_ENV') || 'production') === 'production'

// Retorna { to: [...], subject, skip } — 'skip' verdadeiro significa
// "não envie" (quem chama deve apenas registrar e seguir).
function guardMail(to, subject) {
  const list = (Array.isArray(to) ? to : [to]).filter(Boolean)
  if (isProd()) return { to: list, subject, skip: list.length === 0 }
  const inbox = process.env.MAIL_TEST_INBOX
  if (!inbox) return { to: [], subject, skip: true }
  const originais = list.join(', ') || 'sem destinatário'
  return { to: [inbox], subject: `[${env('ELOS_ENV') || 'nao-producao'} → ${originais}] ${subject}`, skip: false }
}

// Substituto de fetch() para a API da Resend nos mailers que montam o payload
// na hora: aplica a trava ao `to`/`subject` do corpo e, se for para
// descartar, nem chama a Resend (devolve 200 com { skipped: true }).
async function guardedResend(url, init = {}) {
  let payload = null
  try { payload = JSON.parse(init.body || '') } catch { /* corpo não-JSON: segue igual */ }
  if (!payload) return fetch(url, init)
  const g = guardMail(payload.to, payload.subject)
  if (g.skip) {
    console.log(`[mail_guard] envio descartado (${env('ELOS_ENV') || 'production'}): ${payload.subject}`)
    return new Response(JSON.stringify({ skipped: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  const body = { ...payload, to: g.to, subject: g.subject }
  if (!isProd()) { delete body.cc; delete body.bcc }
  return fetch(url, { ...init, body: JSON.stringify(body) })
}

module.exports = { guardMail, isProd, guardedResend }
