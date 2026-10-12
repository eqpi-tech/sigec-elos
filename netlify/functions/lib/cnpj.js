// CNPJ — numérico (atual) e ALFANUMÉRICO (Receita Federal, emitido desde
// jul/2026): 12 caracteres [0-9A-Z] + 2 dígitos verificadores numéricos.
// Ex.: 12.ABC.345/01DE-35. DV com (código ASCII − 48) e os pesos de sempre.
// Armazenamento: 14 caracteres em MAIÚSCULAS, sem pontuação.
// Espelho do front: src/lib/cnpj.js (manter os dois iguais).

function normalizeCnpj(v) {
  return String(v ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 14)
}

function dv(base) {
  let soma = 0, peso = 2
  for (let i = base.length - 1; i >= 0; i--) {
    soma += (base.charCodeAt(i) - 48) * peso
    peso = peso === 9 ? 2 : peso + 1
  }
  const r = soma % 11
  return r < 2 ? 0 : 11 - r
}

function isValidCnpj(v) {
  const c = normalizeCnpj(v)
  if (!/^[0-9A-Z]{12}\d{2}$/.test(c) || /^(.)\1{13}$/.test(c)) return false
  const d1 = dv(c.slice(0, 12))
  const d2 = dv(c.slice(0, 12) + d1)
  return c.endsWith(`${d1}${d2}`)
}

const isCnpjComplete = (v) => /^[0-9A-Z]{12}\d{2}$/.test(normalizeCnpj(v))

function formatCnpj(v) {
  const c = normalizeCnpj(v)
  let out = c.slice(0, 2)
  if (c.length > 2)  out += '.' + c.slice(2, 5)
  if (c.length > 5)  out += '.' + c.slice(5, 8)
  if (c.length > 8)  out += '/' + c.slice(8, 12)
  if (c.length > 12) out += '-' + c.slice(12, 14)
  return out
}

function looksLikeCnpj(q) {
  const raw = String(q ?? '').trim()
  if (!/^[0-9A-Za-z.\-/\s]+$/.test(raw)) return false
  const c = normalizeCnpj(raw)
  return c.length >= 8 && (c.match(/\d/g) || []).length >= 2
}

module.exports = { normalizeCnpj, isValidCnpj, isCnpjComplete, formatCnpj, looksLikeCnpj }
