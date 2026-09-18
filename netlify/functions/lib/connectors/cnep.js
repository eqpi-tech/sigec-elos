// Conector: CNEP — Empresas Punidas / Lei Anticorrupção (Portal da Transparência)
const { consultaTransparencia, filterActiveSanctions, onlyExactCnpj } = require('../transparencia.js')

module.exports = {
  slug: 'cnep',
  route: 'free',
  ttlDays: 1,
  inLight: true, inFull: true,
  costBase: 0, costExtra: 0,

  async fetch({ cnpj }) {
    const registros = await consultaTransparencia('cnep', { codigoSancionado: cnpj })
    return { registros: onlyExactCnpj(registros, cnpj) }
  },

  parse(raw) {
    const todos = raw.registros || []
    const ativos = filterActiveSanctions(todos)
    return {
      result_flag: ativos.length ? 'apontamento' : 'nada_consta',
      headline: ativos.length
        ? `CNEP: ${ativos.length} punição(ões) ATIVA(s) — Lei Anticorrupção`
        : todos.length
          ? `CNEP: nada consta ativo (${todos.length} registro(s) histórico(s))`
          : 'CNEP: nada consta',
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
    valorMulta: s.valorMulta || null,
  }
}
