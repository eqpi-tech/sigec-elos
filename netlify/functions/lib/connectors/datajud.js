// Conector: DataJud (CNJ, API pública) — processos por CNPJ nos tribunais
// configurados em bc_config 'datajud_tribunais' (aliases api_publica_*).
// COBERTURA PARCIAL por natureza (handoff §7): a API pública não expõe
// partes em todos os tribunais; resultado sempre carrega essa nota.
const { getAdminClient } = require('../bcdb.js')

const DEFAULT_TRIBUNAIS = ['api_publica_tjrj', 'api_publica_tjsp', 'api_publica_tjes', 'api_publica_trf2']

module.exports = {
  slug: 'datajud', route: 'free', ttlDays: 7,
  inLight: false, inFull: true, costBase: 0, costExtra: 0,
  async fetch({ cnpj }) {
    const key = process.env.DATAJUD_API_KEY
    if (!key) return { semChave: true }
    const sb = getAdminClient()
    const { data: cfg } = await sb.from('bc_config').select('value').eq('key', 'datajud_tribunais').maybeSingle()
    const tribunais = Array.isArray(cfg?.value) ? cfg.value : DEFAULT_TRIBUNAIS
    const out = []
    for (const t of tribunais) {
      try {
        const res = await fetch(`https://api-publica.datajud.cnj.jus.br/${t}/_search`, {
          method: 'POST',
          headers: { Authorization: `APIKey ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            size: 10,
            query: { match: { 'numeroDocumentoPrincipal': cnpj } },
          }),
        })
        const j = await res.json().catch(() => ({}))
        out.push({ tribunal: t, http: res.status, total: j?.hits?.total?.value ?? null,
                   amostra: (j?.hits?.hits || []).slice(0, 3).map((h) => h?._source?.numeroProcesso).filter(Boolean) })
      } catch (e) { out.push({ tribunal: t, erro: String(e.message).slice(0, 80) }) }
    }
    return { tribunais: out }
  },
  parse(raw) {
    if (raw?.semChave) return { result_flag: 'indisponivel', headline: 'DataJud: DATAJUD_API_KEY não configurada', details: {}, evidence: [], protocol: null }
    const consultados = raw.tribunais || []
    const comTotal = consultados.filter((t) => typeof t.total === 'number')
    const total = comTotal.reduce((s, t) => s + t.total, 0)
    return {
      result_flag: total > 0 ? 'verificar' : 'nada_consta',
      headline: total > 0
        ? `DataJud: ${total} processo(s) localizados (cobertura parcial — ${comTotal.length}/${consultados.length} tribunais)`
        : `DataJud: nada localizado (cobertura parcial — ${comTotal.length}/${consultados.length} tribunais)`,
      details: { nota: 'Cobertura parcial: a API pública do CNJ não expõe partes em todos os tribunais.', tribunais: consultados },
      evidence: [], protocol: null,
    }
  },
}
