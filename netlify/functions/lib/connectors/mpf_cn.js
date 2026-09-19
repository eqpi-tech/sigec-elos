// Conector: MPF — Certidão Negativa. Sonda 19/09: mpf/certidao-negativa.
const { makeCertConnector } = require('./_cert_base.js')
module.exports = makeCertConnector({
  slug: 'mpf_cn', nome: 'MPF Certidão Negativa', path: 'mpf/certidao-negativa', costExtra: 0.06,
})
