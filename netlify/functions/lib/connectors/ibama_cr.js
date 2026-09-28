// Conector: IBAMA — Certificado de Regularidade do CTF/APP (doc 18 da matriz).
// Só o certificado (o conector 'ibama' do BC Report junta embargos +
// regularidade). Sonda 28/09: validade_data vem da fonte (~3 meses); sem
// cadastro no CTF a fonte devolve 612 — isso NÃO é "nada consta": muitas
// atividades nem exigem CTF, e quem decide é o analista.
const { makeCertConnector } = require('./_cert_base.js')

module.exports = makeCertConnector({
  slug: 'ibama_cr', nome: 'IBAMA — Certificado de Regularidade (CTF/APP)',
  path: 'ibama/certificado-regularidade',
  inLight: false, inFull: false, costExtra: 0,
  notFoundFlag: 'verificar',
  classify: (nome, d) => {
    const msg = String(d.mensagem || '').toLowerCase()
    if (/possui certificado de regularidade em conformidade/.test(msg))
      return { result_flag: 'nada_consta', headline: `${nome}: certificado VÁLIDO${d.validade_data ? ` até ${d.validade_data}` : ''}` }
    if (/n[aã]o possui|irregular|pend[eê]ncia|suspens|cancelad/.test(msg))
      return { result_flag: 'apontamento', headline: `${nome}: SEM certificado de regularidade — ver pendências` }
    return { result_flag: 'verificar', headline: `${nome}: situação não identificada — ver comprovante` }
  },
  details: (d) => ({ registro: d.registro, emissao: d.emissao_data, validade: d.validade_data, categorias: d.categorias }),
})
