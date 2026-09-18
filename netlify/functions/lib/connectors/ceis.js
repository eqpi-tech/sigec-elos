// Conector: CEIS — Empresas Inidôneas e Suspensas (Portal da Transparência)
const { consultaTransparencia, filterActiveSanctions, onlyExactCnpj } = require('../transparencia.js')

module.exports = {
  slug: 'ceis',
  route: 'free',
  ttlDays: 1,
  inLight: true, inFull: true,
  costBase: 0, costExtra: 0,

  async fetch({ cnpj }) {
    const registros = await consultaTransparencia('ceis', { codigoSancionado: cnpj })
    return { registros: onlyExactCnpj(registros, cnpj) }
  },

  parse(raw) {
    const todos = raw.registros || []
    const ativos = filterActiveSanctions(todos)
    const result_flag = ativos.length ? 'apontamento' : 'nada_consta'
    return {
      result_flag,
      headline: ativos.length
        ? `CEIS: ${ativos.length} sanção(ões) ATIVA(s) — empresa inidônea/suspensa`
        : todos.length
          ? `CEIS: nada consta ativo (${todos.length} registro(s) histórico(s))`
          : 'CEIS: nada consta',
      details: {
        ativos: ativos.map(resumo),
        historico: todos.filter((t) => !ativos.includes(t)).map(resumo),
      },
      evidence: [],
      protocol: null,
    }
  },
}

function resumo(s) {
  return {
    tipo: s.tipoSancao?.descricaoResumida || null,
    orgao: s.orgaoSancionador?.nome || null,
    inicio: s.dataInicioSancao || null,
    fim: s.dataFimSancao || null,
    situacao: s.situacaoDoSancionado || null,
    fundamentacao: (s.fundamentacao || []).map((f) => f.descricao).join('; ') || null,
  }
}
