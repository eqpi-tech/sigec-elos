// CNPJ — numérico (atual) e ALFANUMÉRICO (Receita Federal, emitido desde
// jul/2026): 12 caracteres [0-9A-Z] + 2 dígitos verificadores numéricos.
// Ex.: 12.ABC.345/01DE-35. O DV usa o valor (código ASCII − 48) de cada
// caractere com os mesmos pesos de sempre — para CNPJ só com números o
// resultado é idêntico ao cálculo antigo.
// Armazenamento: sempre os 14 caracteres em MAIÚSCULAS, sem pontuação.
// Espelho no servidor: netlify/functions/lib/cnpj.js (manter os dois iguais).

// só letras e números, em maiúsculas (até 14)
export function normalizeCnpj(v) {
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

export function isValidCnpj(v) {
  const c = normalizeCnpj(v)
  if (!/^[0-9A-Z]{12}\d{2}$/.test(c) || /^(.)\1{13}$/.test(c)) return false
  const d1 = dv(c.slice(0, 12))
  const d2 = dv(c.slice(0, 12) + d1)
  return c.endsWith(`${d1}${d2}`)
}

// 14 caracteres preenchidos (formato completo, sem checar DV)
export const isCnpjComplete = (v) => /^[0-9A-Z]{12}\d{2}$/.test(normalizeCnpj(v))

// máscara para exibição e para o campo enquanto digita: XX.XXX.XXX/XXXX-DD
export function formatCnpj(v) {
  const c = normalizeCnpj(v)
  let out = c.slice(0, 2)
  if (c.length > 2)  out += '.' + c.slice(2, 5)
  if (c.length > 5)  out += '.' + c.slice(5, 8)
  if (c.length > 8)  out += '/' + c.slice(8, 12)
  if (c.length > 12) out += '-' + c.slice(12, 14)
  return out
}

// a busca digitada é um CNPJ (ou parte)? 8+ caracteres de CNPJ com ao menos
// 2 números — "ABCDEFGH" segue como busca por nome
export function looksLikeCnpj(q) {
  const raw = String(q ?? '').trim()
  if (!/^[0-9A-Za-z.\-/\s]+$/.test(raw)) return false
  const c = normalizeCnpj(raw)
  return c.length >= 8 && (c.match(/\d/g) || []).length >= 2
}
