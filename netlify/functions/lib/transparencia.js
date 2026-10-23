// lib/transparencia.js — cliente único da API do Portal da Transparência
// GET https://api.portaldatransparencia.gov.br/api-de-dados/<recurso>
// header chave-api-dados (env TRANSPARENCY_API_KEY — mesmo nome já usado em
// produção pelo cnpj-lookup.js; aceita TRANSPARENCIA_API_KEY como alias).
// NUNCA logar a chave.

const { normalizeCnpj } = require('./cnpj.js')

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

// Sanção ATIVA (23/10): situação 'Ativo'/'Vigente', OU data de fim futura, OU
// SEM data de fim ("Sem informação" — ex.: Declaração de Inidoneidade sem
// prazo determinado, que vale até a reabilitação). Antes, sem data de fim era
// tratado como histórico e uma inidônea passava como "nada consta". Amostra
// do CEIS (23/10): os únicos registros sem fim eram inidoneidade sem prazo.
function parseFimSancao(raw) {
  const s = String(raw || '').trim()
  let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return null                                   // vazio, "Sem informação"…
}
function sancaoAtiva(s, today = new Date()) {
  const hoje = new Date(today); hoje.setHours(0, 0, 0, 0)
  const situacao = (s?.situacaoDoSancionado || '').toLowerCase().trim()
  if (situacao === 'ativo' || situacao === 'vigente') return true
  const fim = parseFimSancao(s?.dataFimSancao)
  return !fim || fim >= hoje
}
function filterActiveSanctions(list) {
  if (!Array.isArray(list)) return []
  return list.filter((s) => sancaoAtiva(s))
}

// garante que o registro é do CNPJ consultado (a API pode devolver o grupo
// econômico inteiro na busca pela raiz) — camada extra do cnpj-lookup.js
function onlyExactCnpj(list, cnpj14) {
  return (list || []).filter((r) => {
    // compara normalizado dos dois lados (CNPJ numérico ou alfanumérico)
    const doc = normalizeCnpj(r.sancionado?.codigoFormatado || r.pessoa?.cnpjFormatado || '')
    return !doc || doc === normalizeCnpj(cnpj14)
  })
}

module.exports = { consultaTransparencia, filterActiveSanctions, sancaoAtiva, onlyExactCnpj }
