import { KpiCard, Card, ScoreBar, Button } from '../../components/ui.jsx'
import { DEMO_CLIENTE } from './demoData.js'

const sealColor = s => s === 'ACTIVE' ? '#22c55e' : s === 'PENDING' ? '#f59e0b' : '#9B9B9B'
const sealLabel = s => s === 'ACTIVE' ? 'Homologado' : s === 'PENDING' ? 'Em análise' : 'Pendente'

export default function ClienteView() {
  const c = DEMO_CLIENTE

  return (
    <div>
      {/* Header — estilo PageHeader real */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:24 }}>
        <div>
          <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:20, color:'#1a1c5e' }}>
            Olá, Rafael! 👋
          </div>
          <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#9B9B9B', marginTop:4 }}>
            Acompanhe o processo de homologação dos seus fornecedores
          </div>
        </div>
        <Button variant="primary" size="sm" style={{ flexShrink:0 }}>
          📨 Convidar
        </Button>
      </div>

      {/* KPIs 2×2 */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:22 }}>
        <KpiCard label="Fornecedores"  value={c.totalFornecedores} sub="Convidados"     icon="🤝" />
        <KpiCard label="Homologados"   value={c.verificados}       sub="Selo ELOS ativo" subColor="#22c55e" icon="✅" iconBg="rgba(34,197,94,.1)" />
        <KpiCard label="Em Análise"    value={c.emAnalise}         sub="Aguardando EQPI" subColor="#f59e0b" icon="⏳" iconBg="rgba(139,92,246,.1)" />
        <KpiCard label="Subsidiados"   value={c.subsidiados}       sub="Custo assumido"  subColor="#2E3192" icon="💰" iconBg="rgba(46,49,146,.1)" />
      </div>

      {/* Saúde da cadeia */}
      <Card style={{ borderRadius:14, padding:'16px 18px', marginBottom:18, display:'flex', alignItems:'center', gap:14 }}>
        <div style={{ width:46, height:46, borderRadius:12, background:'rgba(34,197,94,.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0 }}>🛡️</div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:15, color:'#1a1c5e', marginBottom:2 }}>Saúde da cadeia: {c.saudeGeral}%</div>
          <div style={{ fontSize:12, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', marginBottom:6 }}>Baseada em documentos válidos e conformidade</div>
          <ScoreBar score={c.saudeGeral} />
        </div>
        <span style={{ background:'#EEF0FF', color:'#2E3192', fontSize:10, fontFamily:'Montserrat,sans-serif', fontWeight:700, padding:'4px 10px', borderRadius:20, flexShrink:0, cursor:'default' }}>
          Ver relatório
        </span>
      </Card>

      {/* Fornecedores Recentes */}
      <Card style={{ borderRadius:16, padding:'18px 20px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:15, color:'#1a1c5e' }}>
            Fornecedores Recentes
          </div>
          <button style={{ background:'none', border:'none', color:'#2E3192', fontFamily:'DM Sans,sans-serif', fontSize:13, fontWeight:600, cursor:'pointer' }}>
            Ver todos →
          </button>
        </div>

        <div style={{ display:'grid', gap:10 }}>
          {c.fornecedoresRecentes.map((s, i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:14, padding:'12px 16px', background:'#f8faff', borderRadius:12, border:'1px solid #e2e4ef' }}>
              {/* Avatar 2-letter */}
              <div style={{ width:40, height:40, borderRadius:10, background:'#EEF0FF', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:14, color:'#2E3192', flexShrink:0, fontFamily:'Montserrat,sans-serif' }}>
                {s.initials}
              </div>

              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, color:'#1a1c5e', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                  {s.empresa}
                </div>
                <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:11, color:'#9B9B9B' }}>
                  {s.cidade} / {s.uf}
                </div>
              </div>

              {s.subsidiado && (
                <span style={{ fontSize:10, background:'#d1fae5', color:'#065f46', borderRadius:20, padding:'2px 8px', fontFamily:'Montserrat,sans-serif', fontWeight:700, flexShrink:0 }}>
                  SUBSIDIADO
                </span>
              )}

              <div style={{ textAlign:'right', flexShrink:0 }}>
                <div style={{ fontSize:11, fontWeight:700, color:sealColor(s.sealStatus), fontFamily:'DM Sans,sans-serif' }}>
                  {sealLabel(s.sealStatus)}
                </div>
                {s.sealStatus === 'ACTIVE' && s.score && (
                  <div style={{ fontSize:11, color:'#9B9B9B' }}>Score {s.score}%</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Ações rápidas */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop:16 }}>
        {[
          { label:'Meus Fornecedores', icon:'🏭', desc:'Ver lista completa' },
          { label:'Enviar Convite',    icon:'📨', desc:'Convidar fornecedor' },
        ].map(a => (
          <Card key={a.label} hover onClick={() => {}} style={{ borderRadius:14, padding:'18px 16px', cursor:'pointer' }}>
            <div style={{ fontSize:24, marginBottom:6 }}>{a.icon}</div>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, color:'#1a1c5e' }}>{a.label}</div>
            <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:12, color:'#9B9B9B', marginTop:2 }}>{a.desc}</div>
          </Card>
        ))}
      </div>
    </div>
  )
}
