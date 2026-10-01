// Filtros em chips (visão cliente, 01/10): grupo de múltipla escolha com
// contagem por opção. Nada marcado = sem filtro naquele grupo.
// Usado em Meus Fornecedores e Convites para as duas telas se comportarem igual.

const M = 'Montserrat,sans-serif'
const D = 'DM Sans,sans-serif'

export function chipStyle(on, color = '#2E3192') {
  return {
    padding: '5px 11px', borderRadius: 20, cursor: 'pointer', whiteSpace: 'nowrap',
    border: `1.5px solid ${on ? color : '#e2e4ef'}`, background: on ? `${color}14` : '#fff',
    color: on ? color : '#64748b', fontFamily: D, fontSize: 12, fontWeight: on ? 700 : 500,
  }
}

// options: [{ value, label, count?, color? }] · value: array dos marcados
export function MultiChips({ label, options, value, onChange, single = false }) {
  const marcado = (v) => value.includes(v)
  const alternar = (v) => {
    if (single) return onChange(marcado(v) ? [] : [v])
    onChange(marcado(v) ? value.filter((x) => x !== v) : [...value, v])
  }
  if (!options.length) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <span style={{ fontFamily: M, fontWeight: 700, fontSize: 10, color: '#9B9B9B', letterSpacing: 0.5, textTransform: 'uppercase', minWidth: 74 }}>{label}</span>
      {options.map((o) => (
        <button key={o.value} onClick={() => alternar(o.value)} style={chipStyle(marcado(o.value), o.color)}>
          {o.label}{o.count != null ? <span style={{ opacity: 0.65, marginLeft: 4 }}>{o.count}</span> : null}
        </button>
      ))}
    </div>
  )
}

export function FilterPanel({ children, total, shown, onClear, active }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #eef0f6', borderRadius: 14, padding: '14px 16px', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {children}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f4f5f9', paddingTop: 8 }}>
        <span style={{ fontFamily: D, fontSize: 12, color: '#64748b' }}>Mostrando <strong>{shown}</strong> de {total}</span>
        {active && <button onClick={onClear} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: D, fontSize: 12, color: '#2E3192', fontWeight: 700 }}>Limpar filtros</button>}
      </div>
    </div>
  )
}
