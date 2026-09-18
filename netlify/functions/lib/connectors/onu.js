// Conector: ONU — Consolidated Sanctions List, dump ingerido em ref_onu.
// Mesmo desenho do OFAC: match fuzzy por nome → no máximo 'verificar'.
const { getAdminClient } = require('../bcdb.js')

const SIM_MIN = 0.65

module.exports = {
  slug: 'onu',
  route: 'local_db',
  ttlDays: 7,
  inLight: true, inFull: true,
  costBase: 0, costExtra: 0,

  async fetch({ company = {}, socios = [] }) {
    const sb = getAdminClient()
    const nomes = [company.razao_social, ...socios.map((s) => s.nome)].filter(Boolean).slice(0, 12)
    const [{ data, error }, { data: ver }] = await Promise.all([
      sb.rpc('bc_match_names', { p_list: 'onu', p_names: nomes }),
      sb.from('ref_list_versions').select('list_date').eq('list', 'onu').maybeSingle(),
    ])
    if (error) throw new Error(`bc_match_names(onu): ${error.message}`)
    return { consultados: nomes, matches: data || [], versao: ver || null }
  },

  parse(raw) {
    if (!raw.versao) {
      return { result_flag: 'indisponivel', headline: 'ONU (sanções): base local ainda não ingerida', details: {}, evidence: [], protocol: null }
    }
    const fortes = (raw.matches || []).filter((m) => (m.sim ?? 0) >= SIM_MIN)
    return {
      result_flag: fortes.length ? 'verificar' : 'nada_consta',
      headline: fortes.length
        ? `ONU (sanções): ${fortes.length} correspondência(s) de nome — verificar manualmente`
        : `ONU (sanções): nada consta (lista de ${raw.versao.list_date || 's/ data'})`,
      details: {
        pesquisados: raw.consultados,
        matches: fortes.map((m) => ({ pesquisado: m.query_name, listado: m.nome, tipo: m.tipo, listado_em: m.extra, similaridade: m.sim })),
        lista_atualizada_em: raw.versao.list_date || null,
      },
      evidence: [],
      protocol: null,
    }
  },
}
