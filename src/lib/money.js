// Valores em reais no formato brasileiro (vírgula = decimal — CLAUDE.md §7.11).
// '1.234.567,89' → 1234567.89 · '123.456' (ponto+3 díg. = MILHAR) → 123456
// · '1234567.8' → 1234567.80. Evita o ponto de milhar lido pela IA virar decimal.
export function parseMoneyBR(v) {
  if (v == null || v === '') return null
  if (typeof v === 'number') return Math.round(v * 100) / 100
  let s = String(v).replace(/[R$\s]/g, '')
  const neg = /^-|\(.*\)$/.test(s); s = s.replace(/[()\-]/g, '')
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.')          // formato BR completo
  } else if (/\.\d{3}(\.|$)/.test(s)) {
    s = s.replace(/\./g, '')                             // só pontos de milhar
  }                                                        // senão: ponto é decimal mesmo
  const n = parseFloat(s)
  if (isNaN(n)) return null
  return Math.round((neg ? -n : n) * 100) / 100
}
