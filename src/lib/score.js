// ─── SIGEC-ELOS Score Engine v2 ──────────────────────────────────────────────
// Score calculado sobre os documentos VÁLIDOS do fornecedor.
// Agora os documentos são dinâmicos (por categoria), então o score é relativo:
//   score = (documentos VALID / total exigidos) × 100
// Documentos automáticos (CNPJ) têm peso extra por não exigirem esforço do fornecedor.

export const SCORE_WEIGHTS = {
  // Documentos de identidade/fiscal — peso alto (obrigatórios universais)
  37: 8,   // Cartão CNPJ
  39: 8,   // Contrato Social
  42: 8,   // CND Federal
  7:  8,   // CRF FGTS
  8:  7,   // CNDT Trabalhista
  40: 6,   // Alvará de Funcionamento
  151: 5,  // Certidão Simplificada Junta Comercial
  161: 5,  // Dados bancários
  // Documentos financeiros
  79: 6,   // Balanço + DRE
  // Ambientais / regulatórios
  18: 5,   // IBAMA CTF
  19: 5,   // Licença de Operação
  // Outros — peso padrão
  DEFAULT: 3,
}

export const MAX_SCORE = 100

/**
 * Calcula score baseado nos documentos válidos vs total exigido.
 * @param {Array} uploadedDocs - [{type, status}] — documentos salvos no banco
 * @param {Array} requiredDocs - [{id}] — documentos exigidos pelas categorias
 * @returns {number} 0-100
 */
export function calculateScore(uploadedDocs = [], requiredDocs = []) {
  if (!requiredDocs.length) {
    // Fallback: usa pesos fixos sobre os documentos enviados (comportamento anterior)
    return calculateScoreLegacy(uploadedDocs)
  }

  const validTypes = new Set(
    uploadedDocs
      .filter(d => d.status === 'VALID')
      .map(d => String(d.type))
  )

  // Peso total dos documentos exigidos
  const totalWeight = requiredDocs.reduce((acc, doc) => {
    return acc + (SCORE_WEIGHTS[doc.id] || SCORE_WEIGHTS.DEFAULT)
  }, 0)

  if (totalWeight === 0) return 0

  // Peso dos documentos válidos
  const validWeight = requiredDocs.reduce((acc, doc) => {
    if (validTypes.has(String(doc.id))) {
      return acc + (SCORE_WEIGHTS[doc.id] || SCORE_WEIGHTS.DEFAULT)
    }
    return acc
  }, 0)

  return Math.min(Math.round((validWeight / totalWeight) * 100), 100)
}

/**
 * Cálculo legado (sem categorias configuradas — usa tipos string antigos)
 */
function calculateScoreLegacy(uploadedDocs = []) {
  const LEGACY = {
    CNPJ_CARD: 10, CND_FEDERAL: 20, CRF_FGTS: 20, CNDT: 15,
    ALVARA: 15, CONTRACT: 10, ISO9001: 4, ISO14001: 2, ISO45001: 2, BALANCE: 2,
  }
  const validTypes = new Set(uploadedDocs.filter(d => d.status === 'VALID').map(d => d.type))
  return Math.min(
    Object.entries(LEGACY).reduce((acc, [type, pts]) => acc + (validTypes.has(type) ? pts : 0), 0),
    100
  )
}

export function scoreLabel(score) {
  if (score >= 90) return { label: 'Excelente', color: '#22c55e' }
  if (score >= 70) return { label: 'Bom',       color: '#84cc16' }
  if (score >= 50) return { label: 'Regular',   color: '#f59e0b' }
  return                  { label: 'Baixo',     color: '#ef4444' }
}
