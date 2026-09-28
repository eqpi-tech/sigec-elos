// Conector: Sintegra da UF da sede. Sonda 19/09: sintegra/{uf} (MG fora).
const { makeCertConnector } = require('./_cert_base.js')
module.exports = makeCertConnector({
  slug: 'sintegra', nome: 'Sintegra', costExtra: 0.20,
  pathFor: ({ company }) => company?.uf ? `sintegra/${company.uf.toLowerCase()}` : null,
  unsupportedNote: 'UF da sede desconhecida (base CNPJ indisponível)',
  // sem registro = sem inscrição estadual: pode ser normal (serviço/isenta),
  // mas quem decide é o analista — nunca "nada consta" (RRC, 28/09)
  notFoundFlag: 'verificar',
  // Classifica pelos VALORES dos campos de situação — nunca pelo JSON inteiro:
  // o nome de campo vazio "inatividade_data" casava com /inativ/ e toda
  // inscrição de SP saía como "não habilitada" (achado nos testes de 28/09)
  classify: (nome, d) => {
    const t = Object.entries(d || {})
      .filter(([k, v]) => typeof v === 'string' && v && /situa|ocorr|status/.test(k) && !/data|observ/.test(k))
      .map(([, v]) => v.toLowerCase()).join(' | ')
    if (/n[aã]o habilitad|baixad|inativ|suspens|cancelad|inapt|nul[oa]/.test(t)) return { result_flag: 'verificar', headline: `Sintegra: inscrição ${t.split(' | ')[0]} — verificar` }
    if (/habilitad|ativ|regular/.test(t)) return { result_flag: 'nada_consta', headline: 'Sintegra: inscrição estadual habilitada' }
    return { result_flag: 'verificar', headline: 'Sintegra: situação da inscrição não identificada — ver comprovante' }
  },
})
