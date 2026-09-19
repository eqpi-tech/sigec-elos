// Conector: CND Estadual — Sefaz da UF da sede. Sonda 19/09 confirmou o
// padrão sefaz/{uf}/certidao-debitos (RJ/SP/ES/MG). UF sem o padrão → o
// 602 vira 'indisponivel' com nota (cobertura por praça).
const { makeCertConnector } = require('./_cert_base.js')
module.exports = makeCertConnector({
  slug: 'sefaz_cnd', nome: 'CND Estadual (Sefaz)', costExtra: 0.20,
  pathFor: ({ company }) => company?.uf ? `sefaz/${company.uf.toLowerCase()}/certidao-debitos` : null,
  unsupportedNote: 'UF da sede desconhecida (base CNPJ indisponível)',
})
