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
  // Estágio 8 — Full
  cartao_cnpj:      require('./cartao_cnpj.js'),
  cgu_correcional:  require('./cgu_correcional.js'),
  cnj_improbidade:  require('./cnj_improbidade.js'),
  mpf_cn:           require('./mpf_cn.js'),
  mpt_cnf:          require('./mpt_cnf.js'),
  ibama:            require('./ibama.js'),
  simples:          require('./simples.js'),
  sefaz_cnd:        require('./sefaz_cnd.js'),
  sintegra:         require('./sintegra.js'),
  pref_cnd:         require('./pref_cnd.js'),
  midia_negativa:   require('./midia_negativa.js'),
  pep:              require('./pep.js'),
  tse_candidaturas: require('./tse_candidaturas.js'),
  icij:             require('./icij.js'),
  datajud:          require('./datajud.js'),
  // feedback de cliente 23/09
  gov_contratos:    require('./gov_contratos.js'),
  pgfn_devedores:   require('./pgfn_devedores.js'),
  falencia_rj:      require('./falencia_rj.js'),
}

// dependem do cnpj_base resolvido antes (QSA p/ nomes, UF/município p/ rota)
module.exports.QSA_DEPS = [
  'ceaf', 'ofac', 'onu', 'pep', 'tse_candidaturas', 'icij',
  'mpt_cnf', 'sefaz_cnd', 'sintegra', 'pref_cnd', 'midia_negativa',
]
