// Conector: CGU — Certidão Negativa Correcional (CNC tipo 1: ePAD + CEIS +
// CNEP + CEPIM consolidados — evidência oficial). Sonda 19/09: cgu/cnc-tipo1.
const { makeCertConnector } = require('./_cert_base.js')
module.exports = makeCertConnector({
  slug: 'cgu_correcional', nome: 'CGU Correcional (CNC)', path: 'cgu/cnc-tipo1', costExtra: 0.04,
})
