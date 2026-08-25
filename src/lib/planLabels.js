// Nomes comerciais dos planos — NUNCA exibir o tipo interno na UI.
// Tipos internos: verificado_mensal/anual · homologado_anual ·
// comprador_pro_mensal/anual · legados (homologado, verificado, Simples, Premium)

export const PLAN_NAMES = {
  verificado_mensal:    'ELOS Verificado',
  verificado_anual:     'ELOS Verificado',
  verificado:           'ELOS Verificado',
  Simples:              'ELOS Verificado',
  homologado_anual:     'ELOS Homologado',
  homologado:           'ELOS Homologado',
  Premium:              'ELOS Homologado',
  HOC:                  'ELOS Homologado',
  comprador_pro_mensal: 'ELOS Comprador Pro',
  comprador_pro_anual:  'ELOS Comprador Pro',
}

export function planName(type) {
  return PLAN_NAMES[type] || type || '—'
}

export function planCycle(type) {
  if (!type) return null
  if (String(type).includes('mensal')) return 'Mensal'
  if (String(type).includes('anual'))  return 'Anual'
  return null
}

// Nome completo: "ELOS Verificado · Mensal"
export function planLabel(type) {
  const cycle = planCycle(type)
  return cycle ? `${planName(type)} · ${cycle}` : planName(type)
}
