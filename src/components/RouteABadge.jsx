// Rota A (homologação automática, fase 1): documento obtido na fonte oficial.
// Mostra ao analista a SUGESTÃO da regra do cliente — quem decide é ele.
// Compartilhado entre a tela do processo (Queue) e a fila de análise
// (DocumentAnalysis), para as duas nunca divergirem.
const SUG = {
  aprovar:  { icon: '✓', label: 'sugere aprovar',  color: '#15803d', bg: '#dcfce7' },
  reprovar: { icon: '✕', label: 'sugere reprovar', color: '#b91c1c', bg: '#fee2e2' },
  revisar:  { icon: '?', label: 'revisar',         color: '#b45309', bg: '#fef3c7' },
}

export default function RouteABadge({ doc, compact = false }) {
  const c = doc?.metadata?.route === 'A' ? doc.metadata.consulta : null
  if (!c) return null
  const s = SUG[c.sugestao] || SUG.revisar
  const quando = c.coletado_em ? new Date(c.coletado_em).toLocaleDateString('pt-BR') : ''
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 3 }}
      title={`Consulta automática à fonte oficial${quando ? ` em ${quando}` : ''}${c.codigo ? ` · código ${c.codigo}` : ''}`}>
      <span style={{ fontSize: 9, fontWeight: 700, color: '#2E3192', background: 'rgba(46,49,146,.08)', padding: '1px 6px', borderRadius: 20 }}>
        🏛 Fonte oficial
      </span>
      <span style={{ fontSize: 9, fontWeight: 700, color: s.color, background: s.bg, padding: '1px 6px', borderRadius: 20 }}>
        {s.icon} {s.label}
      </span>
      {!compact && c.motivo && (
        <span style={{ fontSize: 10, color: '#6b7280' }}>{c.motivo}</span>
      )}
      {!compact && !doc.storage_path && (
        <span style={{ fontSize: 10, color: '#b45309' }}>· sem comprovante da fonte</span>
      )}
    </div>
  )
}
