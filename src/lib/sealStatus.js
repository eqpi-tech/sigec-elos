// Situação do processo/selo para exibição (13/10, patch_130).
// Reprovado ≠ Suspenso: a reprovação grava seals.rejection_reason (automática
// pelo servidor ou manual pelo backoffice); "Suspenso" fica para suspensão de
// verdade (documento vencido, carta de exceção vencida, inativação).
// Telas que usam isto precisam trazer status, rejection_reason e suspended_reason.
export function isSealRejected(seal) {
  return seal?.status === 'SUSPENDED'
    && (!!seal.rejection_reason || /^Homologa[cç][aã]o reprovada/i.test(seal.suspended_reason || ''))
}

// motivo para mostrar ao usuário (reprovação ou suspensão)
export const sealStatusReason = (seal) => seal?.rejection_reason || seal?.suspended_reason || ''
