// Conector: IBAMA — Certidão de Embargos + Certificado de Regularidade.
// Sonda 19/09: ibama/certidao-embargos e ibama/certificado-regularidade.
const { consulta, mapCode } = require('../infosimples.js')
module.exports = {
  slug: 'ibama', route: 'infosimples', ttlDays: 30,
  inLight: false, inFull: true, costBase: 0.20, costExtra: 0.06,
  async fetch({ cnpj }) {
    const [emb, reg] = await Promise.allSettled([
      consulta('ibama/certidao-embargos', { cnpj }),
      consulta('ibama/certificado-regularidade', { cnpj }),
    ])
    return {
      embargos: emb.status === 'fulfilled' ? emb.value : { code: 0, codeMessage: emb.reason?.message },
      regularidade: reg.status === 'fulfilled' ? reg.value : { code: 0, codeMessage: reg.reason?.message },
    }
  },
  parse(raw) {
    const se = mapCode(raw.embargos.code, raw.embargos.codeMessage)
    const sr = mapCode(raw.regularidade.code, raw.regularidade.codeMessage)
    const de = raw.embargos.data?.[0] || {}
    const dr = raw.regularidade.data?.[0] || {}
    // campo explícito do payload (19/09): conseguiu_emitir_certidao_negativa
    const temEmbargo = se === 'ok' && de.conseguiu_emitir_certidao_negativa === false
    let result_flag, headline
    if (se === 'failed_soft' && sr === 'failed_soft') { result_flag = 'indisponivel'; headline = 'IBAMA: fontes indisponíveis na data' }
    else if (temEmbargo) { result_flag = 'apontamento'; headline = 'IBAMA: consta EMBARGO ambiental' }
    else { result_flag = 'nada_consta'; headline = 'IBAMA: sem embargos' + (sr === 'ok' ? ' · regularidade verificada' : '') }
    return {
      result_flag, headline,
      details: { embargos: de, regularidade: dr },
      evidence: [...(raw.embargos.receipts || []), ...(raw.regularidade.receipts || [])].map((url) => ({ kind: 'site_receipt', url })),
      protocol: de.certidao || dr.numero_certificado || null,
    }
  },
}
