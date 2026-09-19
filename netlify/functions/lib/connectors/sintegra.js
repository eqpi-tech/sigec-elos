// Conector: Sintegra da UF da sede. Sonda 19/09: sintegra/{uf} (MG fora).
const { makeCertConnector } = require('./_cert_base.js')
module.exports = makeCertConnector({
  slug: 'sintegra', nome: 'Sintegra', costExtra: 0.20,
  pathFor: ({ company }) => company?.uf ? `sintegra/${company.uf.toLowerCase()}` : null,
  unsupportedNote: 'UF da sede desconhecida (base CNPJ indisponível)',
  classify: (nome, d) => {
    const t = JSON.stringify(d).toLowerCase()
    if (/habilitad[oa]|ativ[oa]/.test(t) && !/n[aã]o habilitad|inativ/.test(t)) return { result_flag: 'nada_consta', headline: 'Sintegra: inscrição estadual habilitada' }
    if (/baixad|inativ|n[aã]o habilitad|suspens/.test(t)) return { result_flag: 'verificar', headline: 'Sintegra: inscrição não habilitada/baixada — verificar' }
    return { result_flag: 'nada_consta', headline: 'Sintegra: consulta realizada (ver detalhes)' }
  },
})
