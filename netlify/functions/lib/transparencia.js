// lib/transparencia.js — cliente único da API do Portal da Transparência
// GET https://api.portaldatransparencia.gov.br/api-de-dados/<recurso>
// header chave-api-dados (env TRANSPARENCY_API_KEY — mesmo nome já usado em
// produção pelo cnpj-lookup.js; aceita TRANSPARENCIA_API_KEY como alias).
// NUNCA logar a chave.

async function consultaTransparencia(recurso, params = {}, { maxPaginas = 3 } = {}) {
  const key = process.env.TRANSPARENCY_API_KEY || process.env.TRANSPARENCIA_API_KEY
  if (!key) throw new Error('TRANSPARENCY_API_KEY não configurada')
  const all = []
  for (let pagina = 1; pagina <= maxPaginas; pagina++) {
    const qs = new URLSearchParams({ ...params, pagina: String(pagina) })
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 30000)
    let res
    try {
      res = await fetch(`https://api.portaldatransparencia.gov.br/api-de-dados/${recurso}?${qs}`, {
        headers: { 'chave-api-dados': key, Accept: 'application/json' },
        signal: ctrl.signal,
      })
    } finally { clearTimeout(timer) }
    if (!res.ok) {
      const err = new Error(`Transparência ${recurso} HTTP ${res.status}`)
      err.httpStatus = res.status
      throw err
    }
    const page = await res.json().catch(() => [])
    if (!Array.isArray(page) || page.length === 0) break
    all.push(...page)
    if (page.length < 15) break // tamanho de página da API
  }
  return all
}

// Regra conservadora de sanção ATIVA (mesma do cnpj-lookup.js em produção):
// ativa só com situação explícita 'Ativo'/'Vigente' OU dataFimSancao futura.
// Registros sem nenhum dos dois = histórico.
function filterActiveSanctions(list) {
  if (!Array.isArray(list)) return []
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return list.filter((s) => {
    const situacao = (s.situacaoDoSancionado || '').toLowerCase().trim()
    if (situacao === 'ativo' || situacao === 'vigente') return true
    const rawFim = s.dataFimSancao
    if (!rawFim) return false
    try {
      let end
      if (String(rawFim).includes('/')) {
        const [d, m, y] = String(rawFim).split('/')
        end = new Date(Number(y), Number(m) - 1, Number(d))
      } else end = new Date(rawFim)
      return !isNaN(end.getTime()) && end >= today
    } catch { return false }
  })
}

// garante que o registro é do CNPJ consultado (a API pode devolver o grupo
// econômico inteiro na busca pela raiz) — camada extra do cnpj-lookup.js
function onlyExactCnpj(list, cnpj14) {
  return (list || []).filter((r) => {
    const doc = (r.sancionado?.codigoFormatado || r.pessoa?.cnpjFormatado || '').replace(/\D/g, '')
    return !doc || doc === cnpj14
  })
}

module.exports = { consultaTransparencia, filterActiveSanctions, onlyExactCnpj }
