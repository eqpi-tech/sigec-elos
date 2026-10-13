// lib/hoc_claim.js — trava de reivindicação de empresa migrada do HOC (13/10)
//
// Fornecedor que veio do HOC e ainda não tem login no ELOS podia ser
// "reivindicado" por qualquer e-mail que digitasse o CNPJ no cadastro. Para as
// empresas da migração (lista hoc_migration_contacts, patch_134) só os e-mails
// que estão ativos no HOC para aquela empresa podem fazer o primeiro acesso;
// qualquer outro é orientado a falar com o suporte.
// Empresa do HOC fora da lista segue como antes (primeiro acesso livre).

const mask = (em) => {
  const [loc, dom] = String(em || '').split('@')
  return dom ? `${loc.slice(0, 2)}***@${dom}` : null
}

// Retorna { locked, emails } — emails = e-mails liberados (minúsculos)
async function claimRule(admin, supplier) {
  if (!supplier?.hoc_id) return { locked: false, emails: [] }
  const { data, error } = await admin.from('hoc_migration_contacts')
    .select('email').eq('tipo', 'SUPPLIER').contains('supplier_hoc_ids', [supplier.hoc_id])
  if (error) { console.warn('[hoc_claim]', error.message); return { locked: false, emails: [] } }
  const emails = (data || []).map(r => String(r.email).trim().toLowerCase()).filter(Boolean)
  return { locked: emails.length > 0, emails }
}

const canClaim = (rule, email) =>
  !rule.locked || rule.emails.includes(String(email || '').trim().toLowerCase())

const SUPORTE = 'suporte@eqpitech.com.br · WhatsApp (11) 5039-6769'
const msgRefused = (rule) =>
  `Esta empresa veio do HOC e o acesso ao ELOS é liberado para os e-mails cadastrados lá` +
  `${rule.emails.length ? ` (${rule.emails.slice(0, 3).map(mask).join(', ')})` : ''}. ` +
  `Use um desses e-mails para criar o seu acesso. ` +
  `Precisa de acesso com outro e-mail? Fale com o suporte: ${SUPORTE}.`

module.exports = { claimRule, canClaim, msgRefused, mask }
