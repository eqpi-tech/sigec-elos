// Conector: PEP — Pessoas Politicamente Expostas.
// 19/09: trocado de dump local para a API da Transparência (/api-de-dados/
// peps?nome=), que existe no swagger v3 e não passa pelo captcha do host de
// downloads da CGU. Match por NOME de cada sócio (CPF vem mascarado da
// Receita) → homônimos possíveis: flag amarela 'verificar' (score -10, §8).
const { consultaTransparencia } = require('../transparencia.js')

function norm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim()
}

module.exports = {
  slug: 'pep',
  route: 'free',
  ttlDays: 7,
  inLight: false, inFull: true,
  costBase: 0, costExtra: 0,

  async fetch({ socios = [] }) {
    const nomes = socios.map((s) => s.nome).filter(Boolean).slice(0, 10)
    const hits = []
    for (const nome of nomes) {
      try {
        const regs = await consultaTransparencia('peps', { nome }, { maxPaginas: 1 })
        for (const r of regs || []) {
          // a API busca por substring — só interessa igualdade de nome normalizado
          if (norm(r.nome) === norm(nome)) hits.push({ socio: nome, registro: r })
        }
      } catch (e) {
        if (e.httpStatus && e.httpStatus >= 500) throw e
      }
    }
    return { consultados: nomes.length, hits }
  },

  parse(raw) {
    const hits = raw.hits || []
    return {
      result_flag: hits.length ? 'verificar' : 'nada_consta',
      headline: hits.length
        ? `PEP: ${hits.length} sócio(s) com homônimo em função politicamente exposta — verificar`
        : `PEP: nada consta para os ${raw.consultados ?? 0} sócio(s) pesquisado(s)`,
      details: {
        socios_consultados: raw.consultados ?? 0,
        hits: hits.map((h) => ({
          socio: h.socio,
          nome_pep: h.registro?.nome || null,
          cpf_parcial: h.registro?.cpf || null,
          funcao: h.registro?.descricaoFuncao || h.registro?.siglaFuncao || null,
          orgao: h.registro?.orgaoServidorLotacao?.nome || h.registro?.orgao || null,
          exercicio: h.registro?.dataInicioExercicio || null,
        })),
      },
      evidence: [],
      protocol: null,
    }
  },
}
