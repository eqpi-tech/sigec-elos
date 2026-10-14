// Multiempresa (patch_138, 14/10): o mesmo login pode ter vínculo com várias
// empresas fornecedoras. A empresa ATIVA é escolhida no menu e lembrada por
// usuário neste navegador; as funções do servidor recebem-na no cabeçalho
// X-Supplier-Id e conferem que o usuário é mesmo dessa empresa.
const key = (uid) => `elos_active_supplier:${uid || ''}`
let current = null

export function getActiveSupplierId() { return current }

export function setActiveSupplierId(uid, supplierId) {
  current = supplierId || null
  try { supplierId ? localStorage.setItem(key(uid), supplierId) : localStorage.removeItem(key(uid)) } catch { /* noop */ }
}

export function savedActiveSupplierId(uid) {
  try { return localStorage.getItem(key(uid)) } catch { return null }
}

// cabeçalho para as funções do servidor que trabalham "na empresa do usuário"
export const supplierHeader = () => (current ? { 'X-Supplier-Id': current } : {})
