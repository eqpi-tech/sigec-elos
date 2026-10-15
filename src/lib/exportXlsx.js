// Exportar uma lista para Excel (pedido dos clientes, 15/10): as telas passam
// as linhas JÁ FILTRADAS (o que está na tela) e os títulos das colunas.
import * as XLSX from 'xlsx'

const dataBR = (v) => (v ? new Date(v).toLocaleDateString('pt-BR') : '')
export { dataBR }

export function exportXlsx(fileBase, sheetName, rows) {
  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Aviso: 'Nenhum registro com os filtros aplicados' }])
  // largura das colunas pelo maior conteúdo (limite 60)
  const cols = Object.keys(rows[0] || { Aviso: '' })
  ws['!cols'] = cols.map(c => ({ wch: Math.min(60, Math.max(c.length, ...rows.map(r => String(r[c] ?? '').length)) + 2) }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31))
  XLSX.writeFile(wb, `${fileBase}_${new Date().toISOString().slice(0, 10)}.xlsx`)
}
