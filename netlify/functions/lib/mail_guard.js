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

const isProd = () => (process.env.ELOS_ENV || 'production') === 'production'

// Retorna { to: [...], subject, skip } — 'skip' verdadeiro significa
// "não envie" (quem chama deve apenas registrar e seguir).
function guardMail(to, subject) {
  const list = (Array.isArray(to) ? to : [to]).filter(Boolean)
  if (isProd()) return { to: list, subject, skip: list.length === 0 }
  const inbox = process.env.MAIL_TEST_INBOX
  if (!inbox) return { to: [], subject, skip: true }
  const originais = list.join(', ') || 'sem destinatário'
  return { to: [inbox], subject: `[${process.env.ELOS_ENV || 'nao-producao'} → ${originais}] ${subject}`, skip: false }
}

module.exports = { guardMail, isProd }
