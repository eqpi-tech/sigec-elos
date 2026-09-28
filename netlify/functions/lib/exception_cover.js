// lib/exception_cover.js — Carta de Exceção (patch_101): quais documentos de
// um fornecedor estão cobertos por carta VIGENTE do cliente. Documento
// coberto não revoga o selo ao ser reprovado nem conta como reprovado/
// pendente na finalização automática da análise.

// "hoje" no fuso de Brasília (a validade da carta é uma data, não um instante)
const hojeBR = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10)

async function coveredTypes(sb, supplierId) {
  const { data } = await sb.from('supplier_category_approvals')
    .select('covered_docs, letter_valid_until')
    .eq('supplier_id', supplierId).eq('status', 'EXCEPTION_APPROVED')
    .gte('letter_valid_until', hojeBR())
  const set = new Set()
  for (const r of data || []) for (const t of r.covered_docs || []) set.add(String(t))
  return set
}

// documentos exigidos da categoria que NÃO estão em dia agora
async function pendingOfCategory(sb, supplierId, categoryId) {
  const { data: req } = await sb.from('category_documents')
    .select('document_id, documents_catalog(name)').eq('category_id', categoryId).eq('required', true)
  const tipos = (req || []).map((r) => String(r.document_id))
  if (!tipos.length) return []
  const { data: docs } = await sb.from('documents').select('type, status, label')
    .eq('supplier_id', supplierId).in('type', tipos)
  const st = Object.fromEntries((docs || []).map((d) => [d.type, d]))
  return (req || [])
    .filter((r) => !['VALID', 'NOT_APPLICABLE', 'EXPIRING'].includes(st[String(r.document_id)]?.status))
    .map((r) => ({ type: String(r.document_id), label: st[String(r.document_id)]?.label || r.documents_catalog?.name || `Documento ${r.document_id}` }))
}

const fmtBR = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '')

module.exports = { coveredTypes, pendingOfCategory, hojeBR, fmtBR }
