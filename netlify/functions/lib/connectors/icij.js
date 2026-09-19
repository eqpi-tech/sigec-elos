// Conector: ICIJ Offshore Leaks (ref_icij; opt-in por URL em bc_config
// 'ingest:icij'). Match empresa + sócios; sempre 'verificar' no máximo.
const { makeListConnector } = require('./_list_match_base.js')
module.exports = makeListConnector({ slug: 'icij', list: 'icij', nome: 'ICIJ Offshore Leaks', simMin: 0.7, ttlDays: 9999 })
