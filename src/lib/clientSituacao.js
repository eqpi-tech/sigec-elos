// Situação do processo na visão do cliente — regra ÚNICA para "Meus
// Fornecedores" e o Dashboard (05/10: antes o dashboard contava só convites).
export const SITUACAO = [
  { value: 'ACTIVE',    label: 'Homologado',           color: '#15803d' },
  { value: 'PENDING',   label: 'Em análise',           color: '#b45309' },
  { value: 'PAGAMENTO', label: 'Aguardando pagamento', color: '#ea580c' },
  { value: 'SUSPENDED', label: 'Suspenso / inativado', color: '#dc2626' },
  { value: 'EXPIRED',   label: 'Vencido',              color: '#64748b' },
]

// recebe o selo do processo (seal) — suspenso pelo cliente conta como suspenso;
// PENDING sem liberação (patch_112) e que não veio do HOC = aguardando pagamento
export const clientSealStatus = (s) => {
  if (s?.client_suspended_at || s?.status === 'SUSPENDED') return 'SUSPENDED'
  if (s?.status === 'PENDING' && s?.id && !s.released_at && !s.hoc_process_id) return 'PAGAMENTO'
  return s?.status || 'PENDING'
}
