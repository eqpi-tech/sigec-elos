// Conector: CND Municipal — prefeitura da sede. Sonda 19/09 confirmou o
// padrão pref/{uf}/{municipio}/cnd (ex.: pref/rj/rio-janeiro/cnd). O slug
// do município sai da base CNPJ (normalizado); exceções de grafia ficam em
// bc_config 'pref_slug_overrides'. Município fora da cobertura → o 602
// vira 'indisponivel' + nota (handoff §7).
const { makeCertConnector } = require('./_cert_base.js')

function slugify(m) {
  return String(m || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\bde\b|\bda\b|\bdo\b|\bdas\b|\bdos\b/g, ' ')  // 'rio-janeiro', padrão do catálogo
    .replace(/[^a-z0-9 ]/g, '').trim().replace(/ +/g, '-')
}

module.exports = makeCertConnector({
  slug: 'pref_cnd', nome: 'CND Municipal', costExtra: 0.20,
  pathFor: ({ company, prefOverrides = {} }) => {
    if (!company?.uf || !company?.municipio) return null
    const uf = company.uf.toLowerCase()
    const slug = prefOverrides[`${uf}:${company.municipio}`] || slugify(company.municipio)
    return `pref/${uf}/${slug}/cnd`
  },
  unsupportedNote: 'UF/município da sede desconhecidos (base CNPJ indisponível)',
})
