// Permissões derivadas de role + access_profile (patch_030).
// Uso: can(user, 'manage_users') — retorna boolean.
//
// Perfis:
//   full     → tudo que o papel permite (padrão)
//   analyst  → ADMIN: análises sim; gestão de usuários/clientes/comunicados não
//   readonly → CLIENT: visualização apenas

const ADMIN_ANALYST_DENIED = new Set([
  'manage_users',        // /backoffice/usuarios, criar-usuario
  'manage_clients',      // /backoffice/clientes, criar-cliente, fluxo-documentos, landing-pages
  'manage_comunicados',  // /backoffice/comunicados
])

const CLIENT_READONLY_DENIED = new Set([
  'client_invite',       // enviar/reenviar convites
  'client_edit',         // termos, portal white-label, questionários, RFQ
  'client_inactivate',   // inativar/reativar fornecedor
])

export function can(user, action) {
  if (!user) return false
  const profile = user.accessProfile || 'full'
  if (profile === 'full') return true
  if (user.role === 'ADMIN' && profile === 'analyst') return !ADMIN_ANALYST_DENIED.has(action)
  if (user.role === 'CLIENT' && profile === 'readonly') return !CLIENT_READONLY_DENIED.has(action)
  return true
}
