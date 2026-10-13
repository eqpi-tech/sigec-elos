// Situação do processo na visão do cliente — regra ÚNICA para "Meus
// Fornecedores" e o Dashboard (05/10: antes o dashboard contava só convites).
import { isSealRejected } from './sealStatus.js'

export const SITUACAO = [
  { value: 'ACTIVE',    label: 'Homologado',           color: '#15803d' },
  { value: 'PENDING',   label: 'Em análise',           color: '#b45309' },
  { value: 'PAGAMENTO', label: 'Aguardando pagamento', color: '#ea580c' },
  { value: 'REPROVADO', label: 'Reprovado',            color: '#9f1239' },
  { value: 'SUSPENDED', label: 'Suspenso / inativado', color: '#dc2626' },
  { value: 'EXPIRED',   label: 'Vencido',              color: '#64748b' },
]

// recebe o selo do processo (seal) — suspenso pelo cliente conta como suspenso;
// reprovado (rejection_reason, patch_130/132) ≠ suspenso;
// PENDING sem liberação (patch_112) e que não veio do HOC = aguardando pagamento
export const clientSealStatus = (s) => {
  if (s?.client_suspended_at) return 'SUSPENDED'   // inativado pelo próprio cliente
  if (isSealRejected(s)) return 'REPROVADO'
  if (s?.status === 'SUSPENDED') return 'SUSPENDED'
  if (s?.status === 'PENDING' && s?.id && !s.released_at && !s.hoc_process_id) return 'PAGAMENTO'
  return s?.status || 'PENDING'
}
