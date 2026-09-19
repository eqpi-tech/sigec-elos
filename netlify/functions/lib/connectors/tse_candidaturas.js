// Conector: TSE — candidaturas de sócios (dados abertos ingeridos em
// ref_tse; opt-in por URL em bc_config 'ingest:tse'). Informativo.
const { makeListConnector } = require('./_list_match_base.js')
module.exports = makeListConnector({ slug: 'tse_candidaturas', list: 'tse', nome: 'TSE Candidaturas', soSocios: true, simMin: 0.8, ttlDays: 9999 })
