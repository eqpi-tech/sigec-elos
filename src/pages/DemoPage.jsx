import { useState } from 'react'
import DemoNavbar               from './demo/DemoNavbar.jsx'
import DemoSupplierDashboard    from './demo/DemoSupplierDashboard.jsx'
import DemoSupplierDocumentos   from './demo/DemoSupplierDocumentos.jsx'
import DemoBuyerMarketplace     from './demo/DemoBuyerMarketplace.jsx'
import DemoBuyerPerfil          from './demo/DemoBuyerPerfil.jsx'
import DemoClientDashboard      from './demo/DemoClientDashboard.jsx'
import DemoClientFornecedores   from './demo/DemoClientFornecedores.jsx'
import { DEMO_PROCESSO }        from './demo/demoData.js'
import { Card, Button, ScoreBar, StatusDot } from '../components/ui.jsx'

// ── Profile selector data ─────────────────────────────────────────────────────
const PROFILES = [
  {
    id: 'SUPPLIER',
    label: 'Fornecedor',
    icon: '🏭',
    name: 'Lucas Andrade',
    company: 'Primatus Serviços Técnicos',
    desc: 'Gerencie documentos, acompanhe seu processo de homologação e seu Selo ELOS.',
    color: '#2E3192',
    bg: '#EEF0FF',
  },
  {
    id: 'BUYER',
    label: 'Comprador',
    icon: '🔍',
    name: 'Ricardo Mendes',
    company: 'Horizonte Mineração S/A',
    desc: 'Busque fornecedores verificados no Marketplace e envie cotações (RFQ).',
    color: '#F47E2F',
    bg: '#fff7ed',
  },
  {
    id: 'CLIENT',
    label: 'Cliente',
    icon: '🏢',
    name: 'Rafael Costa',
    company: 'Horizonte Mineração S/A',
    desc: 'Gerencie sua cadeia de fornecedores homologados e acompanhe indicadores.',
    color: '#059669',
    bg: '#f0fdf4',
  },
]

// ── Profile selector screen ───────────────────────────────────────────────────
function ProfileSelector({ onSelect }) {
  return (
    <div style={{ minHeight:'100vh', background:'#f4f5f9', display:'flex', flexDirection:'column', fontFamily:'DM Sans,sans-serif' }}>
      <div style={{ background:'#2E3192', height:58, display:'flex', alignItems:'center', padding:'0 32px', gap:12, boxShadow:'0 2px 12px rgba(46,49,146,.4)' }}>
        <img src="/logo.png" alt="SIGEC-ELOS" style={{ height:36, objectFit:'contain' }}/>
        <div style={{ display:'flex', alignItems:'center', gap:6, marginLeft:4 }}>
          <span style={{ width:7, height:7, borderRadius:'50%', background:'#F47E2F', display:'inline-block' }}/>
          <span style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:10, color:'rgba(255,255,255,.55)', letterSpacing:1.5, textTransform:'uppercase' }}>Demo Interativo</span>
        </div>
      </div>

      <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'40px 20px' }}>
        <div style={{ textAlign:'center', marginBottom:40 }}>
          <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:28, color:'#1a1c5e', marginBottom:8 }}>
            Bem-vindo ao SIGEC-ELOS
          </div>
          <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:15, color:'#9B9B9B', maxWidth:480 }}>
            Selecione um perfil para explorar a plataforma com dados de demonstração.
          </div>
        </div>

        <div style={{ display:'flex', gap:20, flexWrap:'wrap', justifyContent:'center', maxWidth:900 }}>
          {PROFILES.map(p => (
            <button key={p.id} onClick={() => onSelect(p.id)}
              style={{ width:260, padding:'28px 24px', borderRadius:20, background:'#fff', border:`2px solid ${p.bg}`, cursor:'pointer', textAlign:'left', transition:'all .2s', boxShadow:'0 2px 12px rgba(0,0,0,.06)', display:'flex', flexDirection:'column', gap:14 }}
              onMouseOver={e => { e.currentTarget.style.border=`2px solid ${p.color}`; e.currentTarget.style.boxShadow=`0 8px 24px ${p.color}22`; e.currentTarget.style.transform='translateY(-2px)' }}
              onMouseOut={e  => { e.currentTarget.style.border=`2px solid ${p.bg}`;    e.currentTarget.style.boxShadow='0 2px 12px rgba(0,0,0,.06)'; e.currentTarget.style.transform='none' }}>
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ width:52, height:52, borderRadius:14, background:p.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:26, flexShrink:0 }}>
                  {p.icon}
                </div>
                <div>
                  <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:16, color:'#1a1c5e' }}>{p.label}</div>
                  <div style={{ fontSize:11, fontWeight:700, color:p.color, fontFamily:'Montserrat,sans-serif' }}>{p.company}</div>
                </div>
              </div>
              <div style={{ fontSize:13, color:'#64748b', fontFamily:'DM Sans,sans-serif', lineHeight:1.6 }}>{p.desc}</div>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <div style={{ width:28, height:28, borderRadius:8, background:p.bg, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:11, color:p.color, flexShrink:0 }}>
                  {p.name.split(' ').map(w=>w[0]).join('').slice(0,2)}
                </div>
                <span style={{ fontSize:12, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>Entrar como {p.name}</span>
              </div>
              <div style={{ padding:'8px 14px', borderRadius:10, background:p.bg, color:p.color, fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:12, textAlign:'center' }}>
                Acessar →
              </div>
            </button>
          ))}
        </div>

        <div style={{ marginTop:32, fontSize:12, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', textAlign:'center' }}>
          Dados de demonstração · Sem dados reais · Sem necessidade de login
        </div>
      </div>
    </div>
  )
}

// ── Generic placeholder ───────────────────────────────────────────────────────
function ComingSoon({ title, icon, navigate, backTo, backLabel }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'calc(100vh - 58px)', padding:40, textAlign:'center' }}>
      <div style={{ fontSize:56, marginBottom:16 }}>{icon}</div>
      <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:20, color:'#1a1c5e', marginBottom:8 }}>{title}</div>
      <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#9B9B9B', marginBottom:24 }}>Esta tela está disponível na versão completa da plataforma.</div>
      {backTo && (
        <button onClick={() => navigate(backTo)} style={{ padding:'10px 24px', borderRadius:10, background:'#EEF0FF', color:'#2E3192', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, border:'none', cursor:'pointer' }}>
          ← {backLabel || 'Voltar'}
        </button>
      )}
    </div>
  )
}

// ── Supplier process detail ───────────────────────────────────────────────────
function DemoSupplierProcesso({ navigate }) {
  const p = DEMO_PROCESSO
  const STATUS_C  = { VALID:'#22c55e', EXPIRING:'#f59e0b', MISSING:'#ef4444', PENDING:'#f59e0b', REJECTED:'#ef4444' }
  const STATUS_L  = { VALID:'Válido', EXPIRING:'Vencendo', MISSING:'Pendente', PENDING:'Em análise', REJECTED:'Rejeitado' }
  const STATUS_BG = { VALID:'#f0fdf4', EXPIRING:'#fffbeb', MISSING:'#fff5f5', PENDING:'#fff7ed', REJECTED:'#fff5f5' }
  const scoreC = p.score >= 90 ? '#22c55e' : p.score >= 70 ? '#f59e0b' : '#ef4444'

  return (
    <div style={{ padding:'28px 32px', maxWidth:1000, margin:'0 auto' }}>
      <button onClick={() => navigate('dashboard')} style={{ display:'flex', alignItems:'center', gap:6, background:'none', border:'none', color:'#2E3192', fontFamily:'DM Sans,sans-serif', fontWeight:600, fontSize:13, cursor:'pointer', marginBottom:20 }}>
        ← Voltar ao Dashboard
      </button>

      <Card style={{ borderRadius:16, padding:'24px 28px', marginBottom:24 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:12 }}>
          <div>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:20, color:'#1a1c5e' }}>{p.sealName}</div>
            <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#9B9B9B', marginTop:2 }}>Cliente: {p.clientName}</div>
            <div style={{ marginTop:10 }}>
              <span style={{ fontSize:11, fontWeight:700, background:'rgba(245,158,11,.15)', color:'#f59e0b', padding:'3px 12px', borderRadius:20, fontFamily:'Montserrat,sans-serif' }}>Em análise</span>
            </div>
          </div>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:11, color:'#9B9B9B', marginBottom:2 }}>Score do processo</div>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:32, color:scoreC, lineHeight:1 }}>
              {p.score}<span style={{ fontSize:14, color:'#9B9B9B', fontWeight:400 }}>/100</span>
            </div>
            <div style={{ width:120, marginLeft:'auto', marginTop:4 }}><ScoreBar score={p.score}/></div>
          </div>
        </div>
        <div style={{ background:'rgba(245,158,11,.08)', border:'1px solid rgba(245,158,11,.2)', borderRadius:10, padding:'10px 14px', marginTop:16, fontSize:12, color:'#b45309', fontFamily:'DM Sans,sans-serif' }}>
          ⏳ Análise em andamento — equipe EQPI revisando documentos. Prazo estimado: 3 dias úteis.
        </div>
      </Card>

      <Card style={{ borderRadius:16, padding:'20px 24px' }}>
        <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:15, color:'#1a1c5e', marginBottom:16 }}>Documentos do Processo</div>
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {p.docs.map((doc, i) => {
            const sc = STATUS_C[doc.status] || '#9B9B9B'
            const sl = STATUS_L[doc.status] || doc.status
            const bg = STATUS_BG[doc.status] || '#f8fffe'
            return (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', borderRadius:12, background:bg, border:`1px solid ${sc}25` }}>
                <StatusDot status={doc.status}/>
                <div style={{ flex:1 }}>
                  <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, color:'#1a1c5e' }}>{doc.label}</div>
                  <div style={{ fontSize:11, color:'#9B9B9B', marginTop:2 }}>{doc.source === 'AUTO' ? '🤖 automático' : '📎 manual'}</div>
                </div>
                <span style={{ fontSize:11, fontWeight:700, color:sc, background:`${sc}18`, padding:'3px 10px', borderRadius:20, fontFamily:'Montserrat,sans-serif' }}>{sl}</span>
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}

// ── Screen routing ────────────────────────────────────────────────────────────
function renderScreen(profile, screen, navigate) {
  if (profile === 'SUPPLIER') {
    if (screen === 'documentos') return <DemoSupplierDocumentos navigate={navigate}/>
    if (screen === 'processo')   return <DemoSupplierProcesso   navigate={navigate}/>
    if (screen === 'planos')     return <ComingSoon title="Meu Plano" icon="⭐" navigate={navigate} backTo="dashboard" backLabel="Dashboard"/>
    return <DemoSupplierDashboard navigate={navigate}/>
  }
  if (profile === 'BUYER') {
    if (screen === 'convites') return <ComingSoon title="Enviar Convites" icon="📨" navigate={navigate} backTo="marketplace" backLabel="Marketplace"/>
    if (screen === 'perfil')   return <DemoBuyerPerfil navigate={navigate}/>
    return <DemoBuyerMarketplace navigate={navigate}/>
  }
  if (profile === 'CLIENT') {
    if (screen === 'fornecedores')  return <DemoClientFornecedores navigate={navigate}/>
    if (screen === 'convites')      return <ComingSoon title="Enviar Convites"    icon="📨" navigate={navigate} backTo="dashboard" backLabel="Dashboard"/>
    if (screen === 'rfq')           return <ComingSoon title="Cotações (RFQ)"     icon="💬" navigate={navigate} backTo="dashboard" backLabel="Dashboard"/>
    if (screen === 'configuracoes') return <ComingSoon title="Configurações"      icon="⚙️" navigate={navigate} backTo="dashboard" backLabel="Dashboard"/>
    if (screen === 'processo')      return <DemoBuyerPerfil navigate={navigate}/>
    return <DemoClientDashboard navigate={navigate}/>
  }
  return null
}

// ── Root component ────────────────────────────────────────────────────────────
export default function DemoPage() {
  const [profile, setProfile] = useState(null)
  const [screen,  setScreen]  = useState('dashboard')

  const handleSelect = (p) => {
    setProfile(p)
    setScreen(p === 'BUYER' ? 'marketplace' : 'dashboard')
  }

  const handleExit = () => {
    setProfile(null)
    setScreen('dashboard')
  }

  if (!profile) return <ProfileSelector onSelect={handleSelect}/>

  return (
    <div style={{ minHeight:'100vh', background:'#f4f5f9' }}>
      <DemoNavbar role={profile} screen={screen} navigate={setScreen} onExit={handleExit}/>
      {renderScreen(profile, screen, setScreen)}
    </div>
  )
}
