// lib/required_docs.js — conjunto de documentos EXIGIDOS de um processo
// (extraído de admin-approve-document.js em 21/09 p/ reuso no lembrete
// automático de pendências — sem mudança de comportamento).

async function flowRequiredDocs(sb, flowId) {
  if (!flowId) return []
  const { data: fcRows } = await sb
    .from('client_flow_categories').select('category_id').eq('flow_id', flowId)
  const catIds = [...new Set((fcRows || []).map(r => r.category_id))]
  const docSet = new Set()
  for (let i = 0; i < catIds.length; i += 200) {
    const { data: cdRows } = await sb
      .from('category_documents')
      .select('document_id')
      .eq('required', true)
      .in('category_id', catIds.slice(i, i + 200))
    for (const r of (cdRows || [])) docSet.add(r.document_id)
  }
  return [...docSet]
}

// Conjunto EXIGIDO do processo (denominador da auto-finalização, 16/09):
// fluxo do selo → matriz das categorias do cliente → fluxos ativos do
// cliente → 6 docs do ELOS Verificado (processo próprio/sem cliente)
async function requiredDocsForSeal(sb, supplierId, seal) {
  const ELOS_VERIFICADO = [37, 61, 62, 7, 42, 8]
  if (!seal) return ELOS_VERIFICADO
  if (!seal.client_id) return ELOS_VERIFICADO
  // 1º: categorias que o fornecedor escolheu DENTRO do cliente (o contrato
  // real dele — VIX Nível N cobra só a matriz das categorias escolhidas);
  // 2º: matriz do fluxo do selo; 3º: fluxos ativos do cliente (18/09)
  const { data: catRows } = await sb
    .from('supplier_categories')
    .select('category_id, categories!inner(client_id)')
    .eq('supplier_id', supplierId)
    .eq('categories.client_id', seal.client_id)
  const catIds = [...new Set((catRows || []).map(r => r.category_id))]
  const docSet = new Set()
  for (let i = 0; i < catIds.length; i += 200) {
    const { data: cdRows } = await sb
      .from('category_documents')
      .select('document_id')
      .eq('required', true)
      .in('category_id', catIds.slice(i, i + 200))
    for (const r of (cdRows || [])) docSet.add(r.document_id)
  }
  if (docSet.size) return [...docSet]
  const fromFlow = await flowRequiredDocs(sb, seal.flow_id)
  if (fromFlow.length) return fromFlow
  // fallback: união dos fluxos ATIVOS do cliente
  const { data: flows } = await sb
    .from('client_flows').select('id')
    .eq('client_id', seal.client_id).eq('active', true)
  const union = new Set()
  for (const f of (flows || [])) {
    for (const d of await flowRequiredDocs(sb, f.id)) union.add(d)
  }
  return [...union]
}

module.exports = { requiredDocsForSeal, flowRequiredDocs }
