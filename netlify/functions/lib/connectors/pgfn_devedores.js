// Conector: PGFN — Lista de Devedores (Dívida Ativa da União).
// Feedback de cliente 23/09: dívida ativa explícita no relatório.
// Slug validado por sonda: receita-federal/pgfn/devedores.
const { makeCertConnector } = require('./_cert_base.js')

module.exports = makeCertConnector({
  slug: 'pgfn_devedores', nome: 'Dívida Ativa da União (PGFN Devedores)',
  path: 'receita-federal/pgfn/devedores',
  inLight: false, inFull: true, costExtra: 0.06,
  notFoundFlag: 'nada_consta',
  classify: (nome, d) => {
    const t = JSON.stringify(d).toLowerCase()
    const qtd = Array.isArray(d.devedores) ? d.devedores.length : (Array.isArray(d.inscricoes) ? d.inscricoes.length : null)
    if (qtd === 0 || /n[aã]o consta|nada consta|nenhum/.test(t)) {
      return { result_flag: 'nada_consta', headline: 'Dívida Ativa da União: nada consta na lista de devedores da PGFN' }
    }
    if (qtd > 0 || /inscri|d[eé]bito|devedor/.test(t)) {
      return { result_flag: 'apontamento', headline: `Dívida Ativa da União: consta na lista de devedores da PGFN${qtd ? ` (${qtd} registro(s))` : ''}` }
    }
    return { result_flag: 'verificar', headline: 'Dívida Ativa da União: ver retorno da consulta' }
  },
})
