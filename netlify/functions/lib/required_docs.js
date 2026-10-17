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
// Exigência da EQPI em TODO processo (14/10, patch_140): Análise de CNAEs (61 —
// se pode prestar o serviço) e Simples Nacional (62 — captado pela EQPI)
const EQPI_SEMPRE = [61, 62]
async function requiredDocsForSeal(sb, supplierId, seal) {
  const base = await requiredDocsBase(sb, supplierId, seal)
  return [...new Set([...base, ...EQPI_SEMPRE])]
}
async function requiredDocsBase(sb, supplierId, seal) {
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
  const empty = { peopleShortfall: 0, missingOrUnreviewed: 0, rejected: 0, slots: 0, notSent: 0 }
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
  // notSent (14/10): o que o FORNECEDOR ainda precisa enviar — sem linha,
  // MISSING, vencido ou reprovado (em análise não conta); usado no lembrete
  let missingOrUnreviewed = 0, rejected = 0, notSent = 0
  for (const k of slotKeys) {
    const st = byType[k]
    if (st === 'REJECTED') rejected++
    else if (!['VALID', 'NOT_APPLICABLE'].includes(st)) missingOrUnreviewed++
    if (!st || ['MISSING', 'EXPIRED', 'REJECTED'].includes(st)) notSent++
  }
  return { peopleShortfall, missingOrUnreviewed, rejected, slots: slotKeys.length, notSent }
}

// Nome curto do documento para e-mail: "PCMSO (Programa de ...)" → "PCMSO",
// "ASO — Atestado de Saúde Ocupacional" → "ASO"
const shortDocName = (n) => String(n || '').split(/ \(| — /)[0].trim() || String(n || '')

// Pendências de mobilidade AGRUPADAS para os e-mails ao fornecedor (14/10):
// um item por posto (pessoas a cadastrar + docs do posto) e um por pessoa
// (docs dela). Só o que o fornecedor precisa fazer: sem envio, vencido ou
// reprovado — em análise não entra.
//   [{ kind:'posto', where:'Serra/ES', peopleMissing:8, docs:[{ name, status }] },
//    { kind:'pessoa', where:'Carlos Lima — Serra/ES', docs:[...] }]
async function mobilityTodo(sb, supplierId, clientId) {
  if (!clientId) return []
  const { data: sup } = await sb.from('suppliers').select('cnpj').eq('id', supplierId).single()
  if (!sup) return []
  const { data: posts } = await sb.from('mobility_posts')
    .select('id, category_id, armado, qty_people, site_city, site_uf')
    .eq('client_id', clientId).eq('supplier_cnpj', sup.cnpj).eq('active', true)
  if (!posts?.length) return []
  const { data: matrix } = await sb.from('category_mobility_documents')
    .select('category_id, document_id, escopo, documents_catalog(name)')
    .eq('required', true).in('category_id', [...new Set(posts.map(p => p.category_id))])
  const { data: people } = await sb.from('mobility_people')
    .select('id, post_id, nome').eq('supplier_id', supplierId).eq('active', true)
    .in('post_id', posts.map(p => p.id)).order('nome')
  const slots = []   // { key, name, group }
  const groups = []
  for (const post of posts) {
    const where = `${post.site_city}/${post.site_uf}`
    const pPeople = (people || []).filter(p => p.post_id === post.id)
    const g = { kind: 'posto', where, peopleMissing: Math.max(0, post.qty_people - pPeople.length), docs: [] }
    groups.push(g)
    const mx = (matrix || []).filter(m => m.category_id === post.category_id)
    for (const m of mx.filter(x => x.escopo === 'posto' && (x.document_id !== 10017 || post.armado)))
      slots.push({ key: `mob:${m.document_id}:s:${post.id}`, name: shortDocName(m.documents_catalog?.name), group: g })
    for (const pe of pPeople) {
      const gp = { kind: 'pessoa', where: `${pe.nome} — ${where}`, peopleMissing: 0, docs: [] }
      groups.push(gp)
      for (const m of mx.filter(x => x.escopo === 'pessoa'))
        slots.push({ key: `mob:${m.document_id}:p:${pe.id}`, name: shortDocName(m.documents_catalog?.name), group: gp })
    }
  }
  const byType = {}
  for (let i = 0; i < slots.length; i += 200) {
    const { data: docs } = await sb.from('documents').select('type, status')
      .eq('supplier_id', supplierId).in('type', slots.slice(i, i + 200).map(x => x.key))
    for (const d of (docs || [])) byType[d.type] = d.status
  }
  for (const sl of slots) {
    const st = byType[sl.key]
    if (!st || ['MISSING', 'EXPIRED', 'REJECTED'].includes(st)) sl.group.docs.push({ name: sl.name, status: st || 'MISSING' })
  }
  return groups.filter(g => g.peopleMissing || g.docs.length)
}

// Filas automáticas POR PROCESSO (regra do Luiz 16/10, patch_146): entra o
// processo nascido no ELOS e o do HOC cujo cliente já foi migrado oficialmente
// (clients.hoc_migrated_at — onda A 17/10, onda B 21/11). Devolve
// o filtro para .or() nas consultas de seals.
async function filtroAutomacao(sb) {
  // cliente inativado (patch_149) fica como histórico, mesmo migrado
  const { data } = await sb.from('clients').select('id').not('hoc_migrated_at', 'is', null).neq('active', false)
  const ids = (data || []).map((c) => c.id)
  return ids.length ? `hoc_process_id.is.null,client_id.in.(${ids.join(',')})` : 'hoc_process_id.is.null'
}

// Dos documentos informados, os exigidos por algum processo nas filas automáticas
async function docsNaAutomacao(sb, docIds) {
  const set = new Set(); const uniq = [...new Set(docIds)]
  for (let i = 0; i < uniq.length; i += 500) {
    const { data, error } = await sb.rpc('automation_doc_ids', { p_ids: uniq.slice(i, i + 500) })
    if (error) throw new Error(`automation_doc_ids: ${error.message}`)
    for (const r of data || []) set.add(typeof r === 'string' ? r : r.automation_doc_ids || Object.values(r)[0])
  }
  return set
}

// Seleção feita no banco (patch_146): documentos nas filas automáticas por
// status/validade — sem o teto de 1.000 linhas do PostgREST
async function docsDaAutomacao(sb, { statuses, from = null, to = null, before = null, types = null }) {
  const { data, error } = await sb.rpc('automation_docs', { p_statuses: statuses, p_from: from, p_to: to, p_before: before, p_types: types })
  if (error) throw new Error(`automation_docs: ${error.message}`)
  return (data || []).map((r) => (typeof r === 'string' ? r : r.automation_docs || Object.values(r)[0]))
}

module.exports = { requiredDocsForSeal, flowRequiredDocs, mobilityPending, mobilityTodo, shortDocName, filtroAutomacao, docsNaAutomacao, docsDaAutomacao }
