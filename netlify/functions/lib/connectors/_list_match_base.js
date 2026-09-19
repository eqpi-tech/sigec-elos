// _list_match_base.js — fábrica dos conectores de lista local com match
// FUZZY por nome (bc_match_names/pg_trgm). Regra fixa: nome nunca gera
// 'apontamento' automático — hit forte sai 'verificar' (analista decide).
const { getAdminClient } = require('../bcdb.js')

function makeListConnector({ slug, list, nome, simMin = 0.65, inLight = false, ttlDays = 30, soSocios = false }) {
  return {
    slug, route: 'local_db', ttlDays, inLight, inFull: true, costBase: 0, costExtra: 0,
    async fetch({ company = {}, socios = [] }) {
      const sb = getAdminClient()
      const nomes = [...(soSocios ? [] : [company.razao_social]), ...socios.map((s) => s.nome)]
        .filter(Boolean).slice(0, 12)
      const [{ data, error }, { data: ver }] = await Promise.all([
        sb.rpc('bc_match_names', { p_list: list, p_names: nomes }),
        sb.from('ref_list_versions').select('list_date').eq('list', list).maybeSingle(),
      ])
      if (error) throw new Error(`bc_match_names(${list}): ${error.message}`)
      return { consultados: nomes, matches: data || [], versao: ver || null }
    },
    parse(raw) {
      if (!raw.versao) {
        return { result_flag: 'indisponivel', headline: `${nome}: base local ainda não ingerida`, details: {}, evidence: [], protocol: null }
      }
      const fortes = (raw.matches || []).filter((m) => (m.sim ?? 0) >= simMin)
      return {
        result_flag: fortes.length ? 'verificar' : 'nada_consta',
        headline: fortes.length
          ? `${nome}: ${fortes.length} correspondência(s) de nome — verificar`
          : `${nome}: nada consta (lista de ${raw.versao.list_date || 's/ data'})`,
        details: {
          pesquisados: raw.consultados,
          matches: fortes.map((m) => ({ pesquisado: m.query_name, listado: m.nome, info: m.tipo, extra: m.extra, similaridade: m.sim })),
          lista_atualizada_em: raw.versao.list_date || null,
        },
        evidence: [], protocol: null,
      }
    },
  }
}
module.exports = { makeListConnector }
