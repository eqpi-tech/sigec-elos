// Conector: CND Federal (PGFN/RFB) via Infosimples — handoff §6/§7
// Nota: contrato do handoff em CommonJS (functions Netlify são CJS).
const { consulta, mapCode } = require('../infosimples.js')

// caminho validado 18/09 contra a API (os sufixos -nova/-2via do handoff não
// existem como serviço; 2ª via é o parâmetro preferencia_emissao)
const PATHS = ['receita-federal/pgfn']

module.exports = {
  slug: 'pgfn_cnd',
  route: 'infosimples',
  ttlDays: 30,
  inLight: true, inFull: true,
  costBase: 0.20, costExtra: 0.10,

  async fetch({ cnpj }) {
    // Emissão normal; 611 ('dados incompletos no site de origem') é o padrão
    // quando a empresa tem pendências — a 2ª via resolve (validado 18/09
    // com a Techocean: 611 → 2via → POSITIVA COM EFEITOS DE NEGATIVA)
    let r = await consulta(PATHS[0], { cnpj })
    if (r.code !== 200) {
      const r2 = await consulta(PATHS[0], { cnpj, preferencia_emissao: '2via' })
      if (r2.code === 200) r = { ...r2, via_2via: true }
      else if (mapCode(r2.code, r2.codeMessage) !== 'failed_soft') r = r2
    }
    return { ...r, path: PATHS[0] }
  },

  parse(raw) {
    // campos reais (validado 18/09): certidao (texto do tipo), certidao_codigo,
    // emissao_data, validade_data, debitos_pgfn/debitos_rfb (bool)
    const status = mapCode(raw.code, raw.codeMessage)
    const d = raw.data?.[0] || {}
    const situacao = String(d.certidao || d.mensagem || raw.codeMessage || '').toLowerCase()
    let result_flag = 'indisponivel', headline = 'CND Federal — fonte indisponível'
    if (status === 'ok') {
      if (/positiva com efeitos/.test(situacao)) { result_flag = 'verificar';   headline = 'CND Federal: POSITIVA com efeitos de negativa' }
      else if (/negativa/.test(situacao))        { result_flag = 'nada_consta'; headline = 'CND Federal: negativa (regular)' }
      else if (/positiva/.test(situacao))        { result_flag = 'apontamento'; headline = 'CND Federal: POSITIVA — débitos com a União' }
      else                                       { result_flag = 'verificar';   headline = `CND Federal: ${(d.certidao || raw.codeMessage || 'ver certidão').slice(0, 80)}` }
    } else if (status === 'not_found') {
      result_flag = 'verificar'; headline = 'CND Federal: emissão não disponível para o CNPJ (verificar manualmente)'
    }
    return {
      result_flag, headline,
      details: {
        situacao: d.certidao || null,
        codigo_controle: d.certidao_codigo || null,
        validade_oficial: d.validade_data || d.data_validade || null,  // §7: imprimir no PDF
        emissao: d.emissao_data || null,
        debitos_pgfn: d.debitos_pgfn ?? null,
        debitos_rfb: d.debitos_rfb ?? null,
        segunda_via: raw.via_2via === true,
      },
      evidence: (raw.receipts || []).map(url => ({ kind: 'site_receipt', url })),
      protocol: d.certidao_codigo || null,
    }
  },
}
