// lib/supplier_ctx.js — empresa fornecedora do pedido (multiempresa, patch_138)
//
// O mesmo login pode ter vínculo SUPPLIER com várias empresas. O navegador
// manda a empresa ativa no cabeçalho X-Supplier-Id; aqui só vale se o usuário
// tiver vínculo ATIVO com ela. Sem cabeçalho (ou inválido): a principal.
// Retorna o supplier_id ou null (sem vínculo de fornecedor).

const headerSupplier = (event) =>
  event?.headers?.['x-supplier-id'] || event?.headers?.['X-Supplier-Id'] || null

async function resolveSupplierId(admin, userId, event, requested = null) {
  const { data: rows } = await admin.from('user_roles')
    .select('supplier_id, is_primary, is_active, created_at')
    .eq('user_id', userId).eq('role', 'SUPPLIER').not('supplier_id', 'is', null)
  const ativos = (rows || []).filter(r => r.is_active !== false)
  if (!ativos.length) return null
  const pedido = requested || headerSupplier(event)
  if (pedido && ativos.some(r => r.supplier_id === pedido)) return pedido
  ativos.sort((a, b) => (b.is_primary === true) - (a.is_primary === true) || String(a.created_at).localeCompare(String(b.created_at)))
  return ativos[0].supplier_id
}

module.exports = { resolveSupplierId, headerSupplier }
