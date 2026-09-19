// Conector: Simples Nacional (situação de opção). Sonda 19/09:
// receita-federal/simples. Informativo — não penaliza score.
const { makeCertConnector } = require('./_cert_base.js')
module.exports = makeCertConnector({
  slug: 'simples', nome: 'Simples Nacional', path: 'receita-federal/simples', costExtra: 0.08,
  classify: (nome, d) => {
    const t = JSON.stringify(d).toLowerCase()
    const opt = /optante/.test(t) && !/n[aã]o optante/.test(t)
    return { result_flag: 'nada_consta', headline: `Simples Nacional: ${opt ? 'OPTANTE' : 'não optante'}` }
  },
})
