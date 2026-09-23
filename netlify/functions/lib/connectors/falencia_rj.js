// Conector: Falências e Recuperações Judiciais — Banco Nacional (TST).
// Feedback de cliente 23/09: certidão de recuperação judicial não estava
// clara. Cobertura NACIONAL num único serviço (sem TJ por UF).
// Slug validado por sonda: tribunal/tst/banco-falencias.
const { makeCertConnector } = require('./_cert_base.js')

module.exports = makeCertConnector({
  slug: 'falencia_rj', nome: 'Falência / Recuperação Judicial (Banco Nacional TST)',
  path: 'tribunal/tst/banco-falencias',
  inLight: false, inFull: true, costExtra: 0.06,
  notFoundFlag: 'nada_consta',
  classify: (nome, d) => {
    const t = JSON.stringify(d).toLowerCase()
    const lista = Array.isArray(d.processos) ? d.processos : (Array.isArray(d.registros) ? d.registros : null)
    if ((lista && lista.length === 0) || /n[aã]o consta|nada consta|nenhum registro/.test(t)) {
      return { result_flag: 'nada_consta', headline: 'Falência/Recuperação Judicial: nada consta no banco nacional' }
    }
    if ((lista && lista.length > 0) || /recupera[cç][aã]o|fal[eê]ncia decretada|deferid/.test(t)) {
      return { result_flag: 'apontamento', headline: `Falência/Recuperação Judicial: CONSTA registro no banco nacional${lista?.length ? ` (${lista.length})` : ''}` }
    }
    return { result_flag: 'verificar', headline: 'Falência/Recuperação Judicial: ver retorno da consulta' }
  },
})
