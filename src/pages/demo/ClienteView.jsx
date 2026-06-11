import { DEMO_CLIENTE } from './demoData.js'

const C = {
  navy: '#1B1F3B', blue: '#2E3192', orange: '#F47E2F',
  grey: '#9B9B9B', light: '#F5F7FA', lightBlue: '#EEF0FF',
  success: '#16A34A', warning: '#D97706', border: '#E2E6F0',
}

const STATUS_STYLE = {
  'Homologado':    { bg: `${C.success}18`, color: C.success },
  'Em revisão':    { bg: '#fef9c3',        color: '#92400e' },
  'Doc. pendente': { bg: `${C.orange}18`,  color: C.orange  },
  'Em análise':    { bg: '#f1f5f9',        color: C.grey    },
}

export default function ClienteView() {
  const c = DEMO_CLIENTE

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: C.grey, fontFamily: 'Montserrat,sans-serif', fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4 }}>Painel do cliente</div>
        <div style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 900, fontSize: 22, color: C.navy, marginBottom: 3 }}>{c.nome}</div>
        <div style={{ fontSize: 13, color: C.grey, fontFamily: 'DM Sans,sans-serif' }}>Gestão de fornecedores ELOS</div>
      </div>

      {/* KPI grid 2×2 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
        {[
          { value: c.totalFornecedores, label: 'Total de fornecedores', bg: `${C.blue}10`,   color: C.blue,    icon: '🏭' },
          { value: c.verificados,       label: 'ELOS Verificados',       bg: `${C.success}10`, color: C.success, icon: '✅' },
          { value: c.emAnalise,         label: 'Em análise',             bg: '#fef9c3',        color: '#92400e', icon: '🔍' },
          { value: c.pendentes,         label: 'Pendências críticas',    bg: `${C.orange}10`,  color: C.orange,  icon: '⚠️' },
        ].map(({ value, label, bg, color, icon }) => (
          <div key={label} style={{ background: bg, border: `1px solid ${color}22`, borderRadius: 14, padding: '16px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{ fontSize: 18 }}>{icon}</span>
            </div>
            <div style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 900, fontSize: 28, color, lineHeight: 1 }}>{value}</div>
            <div style={{ fontSize: 12, color, marginTop: 5, fontFamily: 'DM Sans,sans-serif', opacity: 0.8, lineHeight: 1.3 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Saúde da cadeia */}
      <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 46, height: 46, borderRadius: 12, background: `${C.success}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>🛡️</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: 15, color: C.navy, marginBottom: 2 }}>Saúde da cadeia: {c.saudeGeral}%</div>
          <div style={{ fontSize: 12, color: C.grey, fontFamily: 'DM Sans,sans-serif' }}>Baseada em documentos válidos e conformidade</div>
          {/* Barra de progresso */}
          <div style={{ background: C.lightBlue, borderRadius: 20, height: 6, marginTop: 8, overflow: 'hidden' }}>
            <div style={{ background: C.success, width: `${c.saudeGeral}%`, height: '100%', borderRadius: 20, transition: 'width 1s ease' }} />
          </div>
        </div>
        <span style={{ background: C.lightBlue, color: C.blue, fontSize: 10, fontFamily: 'Montserrat,sans-serif', fontWeight: 700, padding: '4px 10px', borderRadius: 20, flexShrink: 0, cursor: 'default' }}>
          Ver relatório
        </span>
      </div>

      {/* Lista de processos */}
      <div style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: 14, color: C.navy, marginBottom: 12 }}>Processos em andamento</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {c.processos.map((p, i) => {
          const st = STATUS_STYLE[p.status] || STATUS_STYLE['Em análise']
          return (
            <div key={i} style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12, padding: '13px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: C.lightBlue, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Montserrat,sans-serif', fontWeight: 900, fontSize: 14, color: C.blue, flexShrink: 0 }}>
                {p.empresa[0]}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 13, color: C.navy, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.empresa}</div>
                <div style={{ fontSize: 11, color: C.grey, marginTop: 1, fontFamily: 'DM Sans,sans-serif' }}>{p.categoria}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                <span style={{ background: st.bg, color: st.color, fontSize: 10, fontFamily: 'Montserrat,sans-serif', fontWeight: 700, padding: '3px 9px', borderRadius: 20 }}>{p.status}</span>
                {p.score && <span style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: 14, color: C.orange }}>{p.score}</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
