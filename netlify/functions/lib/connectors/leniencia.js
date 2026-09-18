// Conector: Acordos de Leniência (CGU) — dump ingerido em ref_leniencia.
// Nota 18/09: o endpoint /acordos-leniencia SAIU da API da Transparência
// (conferido no swagger v3); a fonte agora é o download-de-dados. Por isso
// route mudou de 'free' para 'local_db' (bc_config atualizado no patch_080).
const { getAdminClient } = require('../bcdb.js')

module.exports = {
  slug: 'leniencia',
  route: 'local_db',
  ttlDays: 7,
  inLight: false, inFull: true,
  costBase: 0, costExtra: 0,

  async fetch({ cnpj }) {
    const sb = getAdminClient()
    const root = cnpj.slice(0, 8)
    const [{ data: hits, error }, { data: ver }] = await Promise.all([
      sb.from('ref_leniencia').select('cnpj_digits, nome, situacao, data_inicio, data_fim, meta').eq('cnpj_root', root),
      sb.from('ref_list_versions').select('list_date').eq('list', 'leniencia').maybeSingle(),
    ])
    if (error) throw new Error(`ref_leniencia: ${error.message}`)
    return { cnpj, hits: hits || [], versao: ver || null }
  },

  parse(raw) {
    if (!raw.versao) {
      return { result_flag: 'indisponivel', headline: 'Acordos de Leniência: base local ainda não ingerida', details: {}, evidence: [], protocol: null }
    }
    const exatos = raw.hits.filter((h) => h.cnpj_digits === raw.cnpj)
    const raiz = raw.hits.filter((h) => h.cnpj_digits !== raw.cnpj)
    return {
      result_flag: exatos.length ? 'apontamento' : raiz.length ? 'verificar' : 'nada_consta',
      headline: exatos.length
        ? `Acordos de Leniência: ${exatos.length} acordo(s) envolvendo o CNPJ`
        : raiz.length
          ? 'Acordos de Leniência: acordo no mesmo grupo (raiz do CNPJ) — verificar'
          : `Acordos de Leniência: nada consta (lista de ${raw.versao.list_date || 's/ data'})`,
      details: { exatos, mesma_raiz: raiz, lista_atualizada_em: raw.versao.list_date || null },
      evidence: [],
      protocol: null,
    }
  },
}
