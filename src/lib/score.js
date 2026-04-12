// ─── SIGEC-ELOS Score Engine ─────────────────────────────────────────────────
// Pontuação 0–100 baseada em documentos válidos.
// Usado no frontend (Dashboard) e no backend (Netlify Functions).

export const SCORE_WEIGHTS = {
  // Obrigatórios — 90pts
  CNPJ_CARD:   10,
  CND_FEDERAL: 20,
  CRF_FGTS:    20,
  CNDT:        15,
  ALVARA:      15,
  CONTRACT:    10,
  // Opcionais — 10pts
  ISO9001:      4,
  ISO14001:     2,
  ISO45001:     2,
  BALANCE:      2,
}

export const MAX_SCORE = 100

/**
 * Calcula o score baseado nos documentos do fornecedor.
 * @param {Array} documents - Array de { type, status }
 * @returns {number} Score 0-100
 */
export function calculateScore(documents = []) {
  const validTypes = new Set(
    documents
      .filter(d => d.status === 'VALID')
      .map(d => d.type)
  )
  const raw = Object.entries(SCORE_WEIGHTS)
    .reduce((acc, [type, pts]) => acc + (validTypes.has(type) ? pts : 0), 0)
  return Math.min(raw, MAX_SCORE)
}

/**
 * Rótulo e cor para o score.
 */
export function scoreLabel(score) {
  if (score >= 90) return { label: 'Excelente', color: '#22c55e' }
  if (score >= 70) return { label: 'Bom',       color: '#84cc16' }
  if (score >= 50) return { label: 'Regular',   color: '#f59e0b' }
  return                  { label: 'Baixo',     color: '#ef4444' }
}
