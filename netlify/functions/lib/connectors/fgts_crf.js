// Conector: CRF FGTS (Caixa — regularidade do empregador) — handoff §7
const { consulta, mapCode } = require('../infosimples.js')

module.exports = {
  slug: 'fgts_crf',
  route: 'infosimples',
  ttlDays: 30,
  inLight: true, inFull: true,
  costBase: 0.20, costExtra: 0.06,

  async fetch({ cnpj }) {
    return consulta('caixa/regularidade', { cnpj })
  },

  parse(raw) {
    const status = mapCode(raw.code, raw.codeMessage)
    const d = raw.data?.[0] || {}
    const sit = String(d.situacao || d.situacao_regularidade || raw.codeMessage || '').toLowerCase()
    let result_flag = 'indisponivel', headline = 'CRF FGTS — fonte indisponível'
    if (status === 'ok') {
      if (/regular/.test(sit) && !/irregular/.test(sit)) { result_flag = 'nada_consta'; headline = 'FGTS: empregador REGULAR (CRF vigente)' }
      else                                               { result_flag = 'apontamento'; headline = 'FGTS: situação IRREGULAR' }
    } else if (status === 'not_found') {
      result_flag = 'verificar'; headline = 'FGTS: CRF não localizado para o CNPJ (verificar manualmente)'
    }
    return {
      result_flag, headline,
      details: {
        // campos reais da API caixa/regularidade (validado 18/09 vs raw):
        // crf = nº do certificado; historico_lista = [emissão, início, fim, nº]
        situacao: d.situacao || null,
        numero_crf: d.crf || null,
        validade_oficial: d.historico_lista?.[0]?.[2] || null,
        validade_inicio: d.historico_lista?.[0]?.[1] || null,
        razao_social: d.razao_social || null,
      },
      evidence: (raw.receipts || []).map(url => ({ kind: 'site_receipt', url })),
      protocol: d.crf || null,
    }
  },
}
