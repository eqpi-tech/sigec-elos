// _cert_base.js — fábrica dos conectores de certidão via Infosimples
// (Estágio 8). Cada conector define caminho/params e, opcionalmente, um
// classificador próprio; o padrão classifica pelo texto da certidão
// (negativa/regular → nada_consta · positiva c/ efeitos → verificar ·
// positiva/consta/irregular → apontamento). 602 (serviço inexistente,
// ex.: município fora da cobertura) → 'indisponivel' com nota, sem custo.
const { consulta, mapCode } = require('../infosimples.js')

function textOf(d) {
  return JSON.stringify(d || {}).toLowerCase()
}

function defaultClassify(nome, d) {
  const t = textOf(d)
  if (/positiva com efeitos? de negativa/.test(t)) return { result_flag: 'verificar', headline: `${nome}: POSITIVA com efeitos de negativa` }
  if (/negativa|regular(?!iza)|nada consta|n[aã]o consta/.test(t)) return { result_flag: 'nada_consta', headline: `${nome}: negativa / nada consta` }
  if (/positiva|consta|irregular|d[eé]bito/.test(t)) return { result_flag: 'apontamento', headline: `${nome}: POSITIVA — ver certidão` }
  return { result_flag: 'verificar', headline: `${nome}: resultado não classificado — ver certidão` }
}

function makeCertConnector(cfg) {
  return {
    slug: cfg.slug,
    route: 'infosimples',
    ttlDays: cfg.ttlDays ?? 30,
    inLight: cfg.inLight ?? false,
    inFull: cfg.inFull ?? true,
    costBase: 0.20,
    costExtra: cfg.costExtra ?? 0,
    needsCompany: !!cfg.pathFor, // caminho depende de UF/município → espera cnpj_base

    async fetch(ctx) {
      const path = cfg.pathFor ? cfg.pathFor(ctx) : cfg.path
      if (!path) return { unsupported: true, motivo: cfg.unsupportedNote || 'fora da cobertura' }
      const params = cfg.params ? cfg.params(ctx) : { cnpj: ctx.cnpj }
      const raw = await consulta(path, params)
      raw._path = path
      return raw
    },

    parse(raw) {
      if (raw?.unsupported) {
        return { result_flag: 'indisponivel', headline: `${cfg.nome}: ${raw.motivo}`, details: { nota: raw.motivo }, evidence: [], protocol: null }
      }
      if (raw.code === 602) { // rota inexistente p/ a praça (ex.: prefeitura não coberta)
        return { result_flag: 'indisponivel', headline: `${cfg.nome}: fonte não coberta para esta praça`, details: { nota: raw.codeMessage, path: raw._path }, evidence: [], protocol: null }
      }
      if (raw.code === 620) { // erro permanente do site de origem (ex.: Sefaz-RJ exige certificado digital)
        const nota = (raw.errors || [])[0] || raw.codeMessage
        return { result_flag: 'indisponivel', headline: `${cfg.nome}: emissão indisponível pela fonte — ver nota`, details: { nota, path: raw._path }, evidence: [], protocol: null }
      }
      const status = mapCode(raw.code, raw.codeMessage)
      const d = raw.data?.[0] || {}
      let core
      if (status === 'ok') core = (cfg.classify || defaultClassify)(cfg.nome, d)
      else if (status === 'not_found') core = { result_flag: cfg.notFoundFlag || 'nada_consta', headline: `${cfg.nome}: sem registros para o CNPJ` }
      else core = { result_flag: 'indisponivel', headline: `${cfg.nome}: fonte indisponível na data da consulta` }
      return {
        ...core,
        details: { ...(cfg.details ? cfg.details(d) : d), _path: raw._path },
        evidence: (raw.receipts || []).map((url) => ({ kind: 'site_receipt', url })),
        protocol: d.certidao || d.protocolo || d.numero || null,
      }
    },
  }
}

module.exports = { makeCertConnector, defaultClassify }
