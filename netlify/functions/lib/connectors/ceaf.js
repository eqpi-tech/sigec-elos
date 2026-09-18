// Conector: CEAF — Expulsões da Administração Federal (Portal da Transparência)
// Busca é por PESSOA (cpfSancionado/nomeSancionado). O CPF dos sócios vem
// MASCARADO da Receita (LGPD), então o match é por NOME de cada sócio →
// qualquer hit sai como 'verificar' (homônimos existem; analista decide).
const { consultaTransparencia } = require('../transparencia.js')

module.exports = {
  slug: 'ceaf',
  route: 'free',
  ttlDays: 1,
  inLight: false, inFull: true,
  costBase: 0, costExtra: 0,

  async fetch({ socios = [] }) {
    const nomes = socios.map((s) => s.nome).filter(Boolean).slice(0, 10)
    const hits = []
    for (const nome of nomes) {
      try {
        const regs = await consultaTransparencia('ceaf', { nomeSancionado: nome }, { maxPaginas: 1 })
        for (const r of regs || []) hits.push({ socio: nome, registro: r })
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
        ? `CEAF: ${hits.length} possível(is) homônimo(s) de sócio em expulsões da Adm. Federal — verificar`
        : `CEAF: nada consta para os ${raw.consultados ?? 0} sócio(s) pesquisado(s)`,
      details: {
        socios_consultados: raw.consultados ?? 0,
        hits: hits.map((h) => ({
          socio: h.socio,
          punido: h.registro?.punicao?.nome || h.registro?.pessoa?.nome || null,
          tipo: h.registro?.tipoPunicao?.descricao || null,
          orgao: h.registro?.orgaoLotacao?.nome || null,
          publicacao: h.registro?.dataPublicacao || null,
        })),
      },
      evidence: [],
      protocol: null,
    }
  },
}
