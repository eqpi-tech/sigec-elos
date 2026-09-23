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

// ── Mobilidade (SPEC_MOBILIDADE.md §7 — bloqueia o selo) ──────────────────
// Pendências de mobilidade do fornecedor no cliente do selo:
// · pessoas cadastradas < qty_people em algum posto ativo → processo aberto
// · slot exigido (doc por pessoa ativa / por posto) sem linha VALID/N.A.
// O doc de mobilidade é um `documents` comum com type
// 'mob:<docId>:p:<personId>' | 'mob:<docId>:s:<postId>'.
async function mobilityPending(sb, supplierId, clientId) {
  const empty = { peopleShortfall: 0, missingOrUnreviewed: 0, rejected: 0, slots: 0 }
  if (!clientId) return empty
  const { data: sup } = await sb.from('suppliers').select('cnpj').eq('id', supplierId).single()
  if (!sup) return empty
  const { data: posts } = await sb
    .from('mobility_posts')
    .select('id, category_id, armado, qty_people')
    .eq('client_id', clientId).eq('supplier_cnpj', sup.cnpj).eq('active', true)
  if (!posts?.length) return empty

  const catIds = [...new Set(posts.map(p => p.category_id))]
  const { data: matrix } = await sb
    .from('category_mobility_documents')
    .select('category_id, document_id, escopo')
    .eq('required', true).in('category_id', catIds)
  const { data: people } = await sb
    .from('mobility_people')
    .select('id, post_id').eq('supplier_id', supplierId).eq('active', true)
    .in('post_id', posts.map(p => p.id))

  const REGISTRO_ARMA = 10017
  const slotKeys = []
  let peopleShortfall = 0
  for (const post of posts) {
    const pPeople = (people || []).filter(p => p.post_id === post.id)
    peopleShortfall += Math.max(0, post.qty_people - pPeople.length)
    for (const m of (matrix || []).filter(x => x.category_id === post.category_id)) {
      if (m.escopo === 'posto') {
        if (m.document_id === REGISTRO_ARMA && !post.armado) continue
        slotKeys.push(`mob:${m.document_id}:s:${post.id}`)
      } else {
        for (const p of pPeople) slotKeys.push(`mob:${m.document_id}:p:${p.id}`)
      }
    }
  }
  if (!slotKeys.length && !peopleShortfall) return empty

  const byType = {}
  for (let i = 0; i < slotKeys.length; i += 200) {
    const { data: docs } = await sb
      .from('documents').select('type, status')
      .eq('supplier_id', supplierId).in('type', slotKeys.slice(i, i + 200))
    for (const d of (docs || [])) byType[d.type] = d.status
  }
  let missingOrUnreviewed = 0, rejected = 0
  for (const k of slotKeys) {
    const st = byType[k]
    if (st === 'REJECTED') rejected++
    else if (!['VALID', 'NOT_APPLICABLE'].includes(st)) missingOrUnreviewed++
  }
  return { peopleShortfall, missingOrUnreviewed, rejected, slots: slotKeys.length }
}

module.exports = { requiredDocsForSeal, flowRequiredDocs, mobilityPending }
