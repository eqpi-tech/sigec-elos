// Registro dos conectores implementados (handoff §6/§7).
// O plano de um relatório = catálogo bc_config (enabled + in_light/in_full)
// ∩ este registro — conector catalogado mas ainda não implementado fica de
// fora do plano (entra quando o módulo existir, sem mudança no orquestrador).
module.exports = {
  cnpj_base:        require('./cnpj_base.js'),
  ceis:             require('./ceis.js'),
  cnep:             require('./cnep.js'),
  cepim:            require('./cepim.js'),
  ceaf:             require('./ceaf.js'),
  renuncias:        require('./renuncias.js'),
  trabalho_escravo: require('./trabalho_escravo.js'),
  ofac:             require('./ofac.js'),
  onu:              require('./onu.js'),
  leniencia:        require('./leniencia.js'),
  pgfn_cnd:         require('./pgfn_cnd.js'),
  fgts_crf:         require('./fgts_crf.js'),
  cndt:             require('./cndt.js'),
  assertiva_pj:     require('./assertiva_pj.js'),
}

// dependem do QSA (company/socios do cnpj_base resolvido antes)
module.exports.QSA_DEPS = ['ceaf', 'ofac', 'onu']
