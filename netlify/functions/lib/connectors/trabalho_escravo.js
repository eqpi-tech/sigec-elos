// Conector: Lista Suja do Trabalho Escravo (MTE) — dump ingerido em
// ref_trabalho_escravo (scripts/bc_ingest_lists.py). Match determinístico
// por documento: CNPJ exato = apontamento; mesma RAIZ (outra filial) idem.
const { getAdminClient } = require('../bcdb.js')

module.exports = {
  slug: 'trabalho_escravo',
  route: 'local_db',
  ttlDays: 7,
  inLight: true, inFull: true,
  costBase: 0, costExtra: 0,

  async fetch({ cnpj }) {
    const sb = getAdminClient()
    const root = cnpj.slice(0, 8)
    const [{ data: hits, error }, { data: ver }] = await Promise.all([
      sb.from('ref_trabalho_escravo').select('doc_digits, nome, uf, ano_acao, meta').eq('cnpj_root', root),
      sb.from('ref_list_versions').select('list_date, ingested_at').eq('list', 'trabalho_escravo').maybeSingle(),
    ])
    if (error) throw new Error(`ref_trabalho_escravo: ${error.message}`)
    return { cnpj, hits: hits || [], versao: ver || null }
  },

  parse(raw) {
    if (!raw.versao) {
      return { result_flag: 'indisponivel', headline: 'Lista Suja (MTE): base local ainda não ingerida', details: {}, evidence: [], protocol: null }
    }
    const exatos = raw.hits.filter((h) => h.doc_digits === raw.cnpj)
    const raiz = raw.hits.filter((h) => h.doc_digits !== raw.cnpj)
    const flag = exatos.length ? 'apontamento' : raiz.length ? 'verificar' : 'nada_consta'
    return {
      result_flag: flag,
      headline: exatos.length
        ? 'Lista Suja (MTE): CNPJ CONSTA no Cadastro de Empregadores — trabalho escravo'
        : raiz.length
          ? `Lista Suja (MTE): outra unidade do mesmo grupo (raiz do CNPJ) consta — verificar`
          : `Lista Suja (MTE): nada consta (lista de ${raw.versao.list_date || 's/ data'})`,
      details: { exatos, mesma_raiz: raiz, lista_atualizada_em: raw.versao.list_date || null },
      evidence: [],
      protocol: null,
    }
  },
}
