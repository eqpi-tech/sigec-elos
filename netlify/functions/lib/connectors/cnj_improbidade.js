// Conector: CNJ — Cadastro de Improbidade Administrativa e Inelegibilidade.
// Sonda 19/09: cnj/improbidade. Condenação listada = apontamento.
const { makeCertConnector } = require('./_cert_base.js')
module.exports = makeCertConnector({
  slug: 'cnj_improbidade', nome: 'CNJ Improbidade', path: 'cnj/improbidade',
  ttlDays: 7, costExtra: 0.04, notFoundFlag: 'nada_consta',
})
