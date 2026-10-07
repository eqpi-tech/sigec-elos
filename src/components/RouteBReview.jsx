// Rota B (pré-análise por IA, SPEC_ROTA_B.md): sugestão da IA para um
// documento enviado pelo fornecedor — veredito, motivo e checklist da regra
// do cliente com a evidência de cada item. Quem decide é o analista.
// Compartilhado entre a tela do processo (Queue) e a fila de análise.
import { useState } from 'react'

export const SUG_IA = {
  aprovar:  { icon: '✓', label: 'IA sugere aprovar',  color: '#15803d', bg: '#dcfce7' },
  reprovar: { icon: '✕', label: 'IA sugere reprovar', color: '#b91c1c', bg: '#fee2e2' },
  revisar:  { icon: '?', label: 'IA: revisar',        color: '#b45309', bg: '#fef3c7' },
}
const pill = (color, bg) => ({ fontSize: 9, fontWeight: 700, color, background: bg, padding: '1px 6px', borderRadius: 20, whiteSpace: 'nowrap' })
const dataBR = (v) => (v && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10).split('-').reverse().join('/') : v || '—')
const sim = (v) => (v === true ? '✓' : v === false ? '✕' : '—')

export function Checklist({ r }) {
  if (!r) return null
  const fatos = [
    ['Documento solicitado', sim(r.documento_solicitado) + (r.documento_identificado ? ` (${r.documento_identificado})` : '')],
    ['CNPJ confere', sim(r.cnpj_confere) + (r.cnpj_encontrado ? ` (${r.cnpj_encontrado})` : '')],
    ['Razão social confere', sim(r.razao_social_confere)],
    ['Emissão / validade', `${dataBR(r.data_emissao)} / ${dataBR(r.data_validade)}${r.vencido_na_data_de_referencia ? ' — vencido' : ''}`],
    ['Legível', sim(r.legivel)],
  ]
  return (
    <div style={{ marginTop: 6, padding: '8px 10px', background: '#fff', border: '1px solid #eef0f6', borderRadius: 8, fontSize: 11.5, fontFamily: 'DM Sans,sans-serif', color: '#374151' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '2px 10px', marginBottom: 6 }}>
        {fatos.map(([k, v]) => [<span key={k} style={{ color: '#9B9B9B' }}>{k}</span>, <span key={`${k}v`}>{v}</span>])}
      </div>
      {(r.checklist || []).map((c, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, padding: '3px 0', borderTop: '1px solid #f4f5f9' }}>
          <span style={{ fontWeight: 800, color: c.atende === true ? '#15803d' : c.atende === false ? '#b91c1c' : '#b45309', minWidth: 12 }}>
            {c.atende === true ? '✓' : c.atende === false ? '✕' : '?'}
          </span>
          <div style={{ flex: 1 }}>
            <div>{c.item}</div>
            {c.evidencia && (
              <div style={{ color: '#6b7280', fontStyle: 'italic' }}>
                “{c.evidencia}”{c.pagina ? ` — pág. ${c.pagina}` : ''}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// review = linha de ai_review_jobs (a mais recente do documento)
export default function RouteBReview({ review, compact = false, onReanalyze }) {
  const [aberto, setAberto] = useState(false)
  const [pedindo, setPedindo] = useState(false)
  if (!review) return null
  const reanalisar = onReanalyze && (async (e) => {
    e.stopPropagation(); setPedindo(true)
    try { await onReanalyze(review) } finally { setPedindo(false) }
  })
  const botao = reanalisar && !compact && (
    <button onClick={reanalisar} disabled={pedindo}
      style={{ fontSize: 9.5, border: '1px solid #c7c9e2', background: '#fff', color: '#2E3192', borderRadius: 20, padding: '1px 7px', cursor: 'pointer' }}>
      {pedindo ? '…' : '↻ reanalisar'}
    </button>
  )

  if (['queued', 'running', 'retry'].includes(review.status)) {
    return (
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 3 }}>
        <span style={pill('#2E3192', 'rgba(46,49,146,.08)')}>🤖 {review.status === 'running' ? 'IA analisando…' : 'pré-análise da IA na fila'}</span>
        {review.status === 'retry' && !compact && <span style={{ fontSize: 10, color: '#6b7280' }}>nova tentativa: {review.last_error}</span>}
      </div>
    )
  }
  if (review.status !== 'done') {
    return (
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 3 }}>
        <span style={pill('#6b7280', '#f3f4f6')}>🤖 IA não analisou</span>
        {!compact && review.last_error && <span style={{ fontSize: 10, color: '#6b7280' }}>{review.last_error}</span>}
        {botao}
      </div>
    )
  }

  const r = review.result || {}
  const s = SUG_IA[review.verdict] || SUG_IA.revisar
  const itens = r.checklist || []
  const atendidos = itens.filter((c) => c.atende === true).length
  return (
    <div style={{ marginTop: 3 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', cursor: compact ? 'default' : 'pointer' }}
        onClick={() => !compact && setAberto((a) => !a)}
        title={`Pré-análise por IA (${review.model || ''} · ${review.prompt_version || ''}) — sugestão; quem decide é o analista`}>
        <span style={pill(s.color, s.bg)}>🤖 {s.icon} {s.label}</span>
        {review.confidence != null && <span style={{ fontSize: 9.5, color: '#9B9B9B' }}>confiança {Math.round(review.confidence * 100)}%</span>}
        {!compact && r.motivo_texto && <span style={{ fontSize: 10, color: '#6b7280' }}>{r.motivo_texto}</span>}
        {!compact && itens.length > 0 && (
          <span style={{ fontSize: 10, color: '#2E3192', fontWeight: 600 }}>
            {aberto ? '▲' : '▼'} checklist ({atendidos}/{itens.length} atendidos)
          </span>
        )}
        {botao}
      </div>
      {aberto && <Checklist r={r}/>}
    </div>
  )
}
