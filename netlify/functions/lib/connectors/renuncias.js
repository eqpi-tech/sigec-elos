// Conector: Renúncias fiscais — panorama da relação com o Governo Federal
// (Portal da Transparência). Informativo: benefício fiscal não é apontamento;
// hits saem como 'verificar' só para o analista contextualizar no parecer.
// Rotas reais (swagger v3, 18/09): renuncias-valor ·
// renuncias-fiscais-empresas-imunes-isentas ·
// renuncias-fiscais-empresas-habilitadas-beneficios-fiscais — todas por ?cnpj=
const { consultaTransparencia } = require('../transparencia.js')

module.exports = {
  slug: 'renuncias',
  route: 'free',
  ttlDays: 7,
  inLight: false, inFull: true,
  costBase: 0, costExtra: 0,

  async fetch({ cnpj }) {
    const [valores, imunes, habilitadas] = await Promise.allSettled([
      consultaTransparencia('renuncias-valor', { cnpj }, { maxPaginas: 1 }),
      consultaTransparencia('renuncias-fiscais-empresas-imunes-isentas', { cnpj }, { maxPaginas: 1 }),
      consultaTransparencia('renuncias-fiscais-empresas-habilitadas-beneficios-fiscais', { cnpj }, { maxPaginas: 1 }),
    ])
    const val = (r) => (r.status === 'fulfilled' && Array.isArray(r.value) ? r.value : [])
    return { valores: val(valores), imunes: val(imunes), habilitadas: val(habilitadas) }
  },

  parse(raw) {
    const total = (raw.valores?.length || 0) + (raw.imunes?.length || 0) + (raw.habilitadas?.length || 0)
    return {
      result_flag: total ? 'verificar' : 'nada_consta',
      headline: total
        ? `Renúncias fiscais: ${total} registro(s) de benefício/imunidade junto ao Gov. Federal (informativo)`
        : 'Renúncias fiscais: nada consta',
      details: {
        valores: (raw.valores || []).slice(0, 10),
        imunes_isentas: (raw.imunes || []).slice(0, 10),
        habilitadas: (raw.habilitadas || []).slice(0, 10),
      },
      evidence: [],
      protocol: null,
    }
  },
}
