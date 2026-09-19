// Conector: Comprovante CNPJ + QSA oficial (Receita via Infosimples).
// Validado por sonda 19/09: receita-federal/cnpj.
const { makeCertConnector } = require('./_cert_base.js')
module.exports = makeCertConnector({
  slug: 'cartao_cnpj', nome: 'Comprovante CNPJ', path: 'receita-federal/cnpj',
  inLight: true, costExtra: 0.04,
  classify: (nome, d) => {
    const sit = String(d.situacao_cadastral || d.situacao || '').toUpperCase()
    if (sit.includes('ATIVA')) return { result_flag: 'nada_consta', headline: 'Comprovante CNPJ: situação ATIVA (cartão oficial anexado)' }
    if (sit) return { result_flag: 'apontamento', headline: `Comprovante CNPJ: situação ${sit}` }
    return { result_flag: 'verificar', headline: 'Comprovante CNPJ: ver documento' }
  },
})
