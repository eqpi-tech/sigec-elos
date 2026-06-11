import { KpiCard, Card, ScoreBar, PageHeader, Button } from '../../components/ui.jsx'
import { DEMO_CLIENT, DEMO_CLIENT_SUPPLIERS } from './demoData.js'

const sealColor = s => ({ ACTIVE:'#22c55e', PENDING:'#f59e0b', SUSPENDED:'#ef4444', EXPIRED:'#9B9B9B' }[s]||'#9B9B9B')
const sealLabel = s => ({ ACTIVE:'Homologado', PENDING:'Em análise', SUSPENDED:'Suspenso', EXPIRED:'Expirado' }[s]||s)

export default function DemoClientDashboard({ navigate }) {
  const c = DEMO_CLIENT
  const recentes = DEMO_CLIENT_SUPPLIERS.slice(0, 5)

  return (
    <div style={{ padding:'28px 32px', maxWidth:1100, margin:'0 auto' }}>
      <PageHeader
        title="Olá, Rafael! 👋"
        subtitle="Acompanhe o processo de homologação dos seus fornecedores"
        action={{ label:'Convidar Fornecedor', onClick: () => {} }}
      />

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16, marginBottom:28 }}>
        <KpiCard label="Fornecedores Convidados" value={c.totalFornecedores} icon="🤝" />
        <KpiCard label="Homologados"             value={c.homologados}       icon="✅" subtext="Selo ELOS ativo" subColor="#22c55e" iconBg="rgba(34,197,94,.1)" />
        <KpiCard label="Em Análise"              value={c.emAnalise}         icon="⏳" subtext="Aguardando revisão EQPI" subColor="#f59e0b" iconBg="rgba(139,92,246,.1)" />
        <KpiCard label="Subsidiados"             value={c.subsidiados}       icon="💰" subtext="Custo assumido por você" subColor="#2E3192" iconBg="rgba(46,49,146,.1)" />
      </div>

      {/* Saúde da cadeia */}
      <Card style={{ borderRadius:14, padding:'18px 24px', marginBottom:24, display:'flex', alignItems:'center', gap:16 }}>
        <div style={{ width:52, height:52, borderRadius:14, background:'rgba(34,197,94,.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, flexShrink:0 }}>🛡️</div>
        <div style={{ flex:1 }}>
          <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:16, color:'#1a1c5e', marginBottom:2 }}>
            Saúde da cadeia: {c.saudeGeral}%
          </div>
          <div style={{ fontSize:13, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', marginBottom:8 }}>
            Baseada em documentos válidos e conformidade regulatória
          </div>
          <ScoreBar score={c.saudeGeral}/>
        </div>
        <Button variant="neutral" size="sm">Ver relatório completo →</Button>
      </Card>

      {/* Lista de fornecedores recentes */}
      <Card style={{ borderRadius:16, padding:'20px 24px', marginBottom:20 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:15, color:'#1a1c5e' }}>
            Fornecedores Recentes
          </div>
          <button onClick={() => navigate('fornecedores')} style={{ background:'none', border:'none', color:'#2E3192', fontFamily:'DM Sans,sans-serif', fontSize:13, fontWeight:600, cursor:'pointer' }}>
            Ver todos →
          </button>
        </div>
        <div style={{ display:'grid', gap:10 }}>
          {recentes.map(inv => (
            <div key={inv.id} onClick={() => navigate('processo')} style={{ display:'flex', alignItems:'center', gap:14, padding:'12px 16px', background:'#f8faff', borderRadius:12, border:'1px solid #e2e4ef', cursor:'pointer', transition:'background .15s' }}
              onMouseOver={e => e.currentTarget.style.background='#f0f3ff'}
              onMouseOut={e  => e.currentTarget.style.background='#f8faff'}>
              <div style={{ width:40, height:40, borderRadius:10, background:'#EEF0FF', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:14, color:'#2E3192', flexShrink:0, fontFamily:'Montserrat,sans-serif' }}>
                {inv.initials}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, color:'#1a1c5e', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{inv.razao_social}</div>
                <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:11, color:'#9B9B9B' }}>{inv.city} / {inv.state}</div>
              </div>
              {inv.subsidiado && (
                <span style={{ fontSize:10, background:'#d1fae5', color:'#065f46', borderRadius:20, padding:'2px 8px', fontFamily:'Montserrat,sans-serif', fontWeight:700, flexShrink:0 }}>SUBSIDIADO</span>
              )}
              <div style={{ textAlign:'right', flexShrink:0 }}>
                <div style={{ fontSize:11, fontWeight:700, color:sealColor(inv.sealStatus), fontFamily:'DM Sans,sans-serif' }}>{sealLabel(inv.sealStatus)}</div>
                {inv.sealStatus === 'ACTIVE' && inv.score && <div style={{ fontSize:11, color:'#9B9B9B' }}>Score {inv.score}%</div>}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Ações rápidas */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:12 }}>
        {[
          { label:'Meus Fornecedores', icon:'🏭', path:'fornecedores', desc:'Ver lista completa' },
          { label:'Enviar Convite',    icon:'📨', path:'convites',     desc:'Convidar novo fornecedor' },
          { label:'Cotações (RFQ)',    icon:'💬', path:'rfq',          desc:'Solicitar propostas' },
          { label:'Questionários',     icon:'📋', path:'questionarios', desc:'Formulários de compliance' },
        ].map(a => (
          <Card key={a.path} hover style={{ borderRadius:14, padding:'18px 20px', cursor:'pointer' }} onClick={() => navigate(a.path)}>
            <div style={{ fontSize:24, marginBottom:6 }}>{a.icon}</div>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:14, color:'#1a1c5e' }}>{a.label}</div>
            <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:12, color:'#9B9B9B', marginTop:2 }}>{a.desc}</div>
          </Card>
        ))}
      </div>
    </div>
  )
}
