// Conector: Polícia Federal — situação e regularidade de empresa de segurança
// privada (doc 166). Login gov.br com o e-CNPJ A1 da EQPI: o collector passa
// em ctx.pfCert os parâmetros JÁ CIFRADOS {pkcs12_cert, pkcs12_pass}
// (integration_secrets — patch_105). Sonda 28/09: vale para qualquer CNPJ;
// devolve alvará (número/validade/válido), situação e atividades autorizadas.
const { makeCertConnector } = require('./_cert_base.js')

module.exports = makeCertConnector({
  slug: 'pf_seguranca', nome: 'Polícia Federal — Segurança Privada',
  inLight: false, inFull: false, costExtra: 0,
  // sem credencial configurada não há consulta (vira "indisponível" permanente)
  pathFor: (ctx) => (ctx?.pfCert?.pkcs12_cert ? 'pf/regularidade-empresa' : null),
  params: (ctx) => ({ cnpj: ctx.cnpj, ...ctx.pfCert, timeout: '600' }),
  unsupportedNote: 'credencial gov.br (e-CNPJ) não configurada',
  // não consta na PF = não é empresa autorizada; pode ser normal (não presta
  // segurança privada), mas quem decide é o analista
  notFoundFlag: 'verificar',
  classify: (nome, d) => {
    const ativa = String(d.situacao || '').toUpperCase() === 'ATIVA'
    if (ativa && d.alvara_valido === true)
      return { result_flag: 'nada_consta', headline: `${nome}: ATIVA · alvará nº ${d.alvara_numero || '—'} válido até ${d.alvara_validade || '—'}` }
    if (!ativa || d.alvara_valido === false)
      return { result_flag: 'apontamento', headline: `${nome}: situação ${d.situacao || 'não informada'} · alvará ${d.alvara_valido === false ? 'VENCIDO/INVÁLIDO' : 'não confirmado'}` }
    return { result_flag: 'verificar', headline: `${nome}: situação não identificada — ver comprovante` }
  },
  details: (d) => ({ situacao: d.situacao, alvara_numero: d.alvara_numero, alvara_validade: d.alvara_validade,
                     alvara_valido: d.alvara_valido, atividades: d.atividades_autorizadas, tipo: d.tipo_empresa }),
})
