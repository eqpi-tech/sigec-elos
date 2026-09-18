// Conector: CNDT — Certidão Negativa de Débitos Trabalhistas (TST) — handoff §7
const { consulta, mapCode } = require('../infosimples.js')

module.exports = {
  slug: 'cndt',
  route: 'infosimples',
  ttlDays: 30,
  inLight: true, inFull: true,
  costBase: 0.20, costExtra: 0.08,

  async fetch({ cnpj }) {
    // caminho validado 18/09: tribunal/tst/cndt (código 200 com cnpj).
    // O 'mte/certidao-debitos' do handoff é outro serviço (606 sem params).
    return consulta('tribunal/tst/cndt', { cnpj })
  },

  parse(raw) {
    // campos reais (validado 18/09): consta(bool) · certidao(nº) · mensagem
    // ('CERTIDÃO NEGATIVA/POSITIVA...') · validade · expedicao
    const status = mapCode(raw.code, raw.codeMessage)
    const d = raw.data?.[0] || {}
    const msg = String(d.mensagem || '').toLowerCase()
    let result_flag = 'indisponivel', headline = 'CNDT — fonte indisponível'
    if (status === 'ok') {
      if (d.consta === false || /negativa/.test(msg)) { result_flag = 'nada_consta'; headline = 'CNDT: negativa — sem débitos trabalhistas' }
      else if (/positiva com efeito/.test(msg))       { result_flag = 'verificar';   headline = 'CNDT: POSITIVA com efeitos de negativa' }
      else if (d.consta === true || /positiva/.test(msg)) { result_flag = 'apontamento'; headline = 'CNDT: POSITIVA — consta no BNDT (débitos trabalhistas)' }
      else { result_flag = 'verificar'; headline = `CNDT: ${d.mensagem || 'ver certidão'}` }
    } else if (status === 'not_found') {
      result_flag = 'verificar'; headline = 'CNDT: não emitida para o CNPJ (verificar manualmente)'
    }
    return {
      result_flag, headline,
      details: {
        consta: d.consta ?? null,
        mensagem: d.mensagem || null,
        numero: d.certidao || null,
        validade_oficial: d.validade || d.validade_data || null,
        emissao: d.emissao_data || d.expedicao || null,
      },
      evidence: (raw.receipts || []).map(url => ({ kind: 'site_receipt', url })),
      protocol: d.certidao || null,
    }
  },
}
