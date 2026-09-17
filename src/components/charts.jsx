// Componentes de gráfico leves (SVG/CSS) dos Relatórios — usados no
// backoffice e na visão cliente. Convenções (17/09):
//   · magnitude = barras de UM matiz com rótulo direto
//   · status/estado = sempre rótulo+ícone junto da cor (nunca só cor)
//   · série temporal única = linha 2px com marcadores e tooltip nativo
import { Card } from './ui.jsx'

export const BRAND = '#2E3192'
const fmt = (n) => (n ?? 0).toLocaleString('pt-BR')

export function Tile({ label, value, sub, accent }) {
  return (
    <Card style={{ borderRadius: 14, padding: '16px 20px' }}>
      <div style={{ fontSize: 11, fontFamily: 'Montserrat,sans-serif', fontWeight: 700, color: '#9B9B9B', textTransform: 'uppercase', letterSpacing: .5 }}>{label}</div>
      <div style={{ fontSize: 28, fontFamily: 'Montserrat,sans-serif', fontWeight: 800, color: accent || '#1a1c5e', marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, fontFamily: 'DM Sans,sans-serif', color: '#9B9B9B', marginTop: 2 }}>{sub}</div>}
    </Card>
  )
}

// Barras horizontais (job: magnitude) com rótulo direto
export function HBars({ rows, color = BRAND, labelWidth = 170 }) {
  const max = Math.max(...rows.map(r => r.n), 1)
  return (
    <div>
      {rows.map(r => (
        <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{ width: labelWidth, fontSize: 12, fontFamily: 'DM Sans,sans-serif', color: '#1a1c5e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.label}>{r.label}</div>
          <div style={{ flex: 1, height: 14, background: '#f1f3f9', borderRadius: 4, overflow: 'hidden' }}
            title={`${r.label}: ${fmt(r.n)}`}>
            <div style={{ width: `${Math.max((r.n / max) * 100, 1)}%`, height: '100%', background: r.color || color, borderRadius: 4 }} />
          </div>
          <div style={{ width: 56, textAlign: 'right', fontSize: 12, fontFamily: 'Montserrat,sans-serif', fontWeight: 700, color: '#1a1c5e' }}>{fmt(r.n)}</div>
        </div>
      ))}
    </div>
  )
}

// Linha de série única (SVG) com marcadores e tooltip nativo por ponto
export function LineChart({ points, height = 130, color = BRAND, fmtX = (x) => x }) {
  if (!points?.length) return <div style={{ fontSize: 12, color: '#9B9B9B', fontStyle: 'italic' }}>Sem dados.</div>
  const W = 560, H = height, PX = 8, PY = 14
  const max = Math.max(...points.map(p => p.n), 1)
  const x = (i) => PX + (i * (W - 2 * PX)) / Math.max(points.length - 1, 1)
  const y = (n) => H - PY - (n / max) * (H - 2 * PY)
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.n).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img">
      {[0.25, 0.5, 0.75].map(f => (
        <line key={f} x1={PX} x2={W - PX} y1={H - PY - f * (H - 2 * PY)} y2={H - PY - f * (H - 2 * PY)} stroke="#eef0f6" strokeWidth="1" />
      ))}
      <path d={`${path} L${x(points.length - 1)},${H - PY} L${x(0)},${H - PY} Z`} fill={color} opacity="0.07" />
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.n)} r="4" fill="#fff" stroke={color} strokeWidth="2">
          <title>{`${fmtX(p.x)}: ${fmt(p.n)}`}</title>
        </circle>
      ))}
      <text x={x(points.length - 1)} y={y(points[points.length - 1].n) - 8} textAnchor="end"
        style={{ fontSize: 11, fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fill: '#1a1c5e' }}>
        {fmt(points[points.length - 1].n)}
      </text>
    </svg>
  )
}
