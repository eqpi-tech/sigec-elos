import { useState, lazy, Suspense } from 'react'
import DemoNavbar               from './demo/DemoNavbar.jsx'
import DemoSupplierOnboarding   from './demo/DemoSupplierOnboarding.jsx'
import DemoSupplierDashboard    from './demo/DemoSupplierDashboard.jsx'
import DemoBuyerMarketplace     from './demo/DemoBuyerMarketplace.jsx'
import DemoClientDashboard      from './demo/DemoClientDashboard.jsx'
import DemoClientFornecedores   from './demo/DemoClientFornecedores.jsx'
import DemoRFQ                  from './demo/DemoRFQ.jsx'
import DemoConvites             from './demo/DemoConvites.jsx'
import DemoClientQuestionarios  from './demo/DemoClientQuestionarios.jsx'
import {
  DemoSupplierQuestionario, DemoSupplierCategorias, DemoSupplierMeusDados,
  DemoSupplierClientesElos, DemoTeam, DemoPlano, DemoClientConfig,
  DemoSupplierCertificado, DemoPortalLanding, DemoPortalLogin,
} from './demo/DemoExtraScreens.jsx'
import { DemoClientRelatorios, DemoClientCompliance } from './demo/DemoNewScreens.jsx'
import { DemoSupplierProcessoFicha, DemoSupplierDocumentosFicha, DemoClientProcesso, DemoBuyerFicha } from './demo/DemoFichas.jsx'
// Backoffice EQPI: acesso restrito por código (validado em demo-unlock) e
// carregado sob demanda — não vai no pacote principal do /demo, que é público
const DemoBackofficeScreen = lazy(() => import('./demo/DemoBackoffice.jsx'))
const UNLOCK_KEY = 'demo_backoffice_ok'
const lerLiberado = () => { try { return sessionStorage.getItem(UNLOCK_KEY) === '1' } catch { return false } }
import { Button } from '../components/ui.jsx'

// ── Profile cards data ────────────────────────────────────────────────────────
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
    id: 'NEW_SUPPLIER',
    label: 'Novo Fornecedor',
    icon: '✨',
    name: 'Cadastro Demo',
    company: 'Novo cadastro na plataforma',
    desc: 'Simule o processo completo de cadastro: CNPJ, categorias, conta, termos e pagamento.',
    color: '#F47E2F',
    bg: '#fff7ed',
  },
  {
    id: 'BUYER',
    label: 'Comprador',
    icon: '🔍',
    name: 'Ricardo Mendes',
    company: 'Horizonte Mineração S/A',
    desc: 'Busque fornecedores verificados no Marketplace, envie convites e cotações RFQ.',
    color: '#7c3aed',
    bg: '#f5f3ff',
  },
  {
    id: 'CLIENT',
    label: 'Cliente',
    icon: '🏢',
    name: 'Rafael Costa',
    company: 'Horizonte Mineração S/A',
    desc: 'Convide e acompanhe fornecedores, relatórios executivos, compliance, cotações e carta de exceção.',
    color: '#059669',
    bg: '#f0fdf4',
  },
  {
    id: 'ADMIN',
    label: 'Backoffice EQPI',
    icon: '🛠️',
    name: 'Ana Ribeiro',
    company: 'EQPI Tech',
    desc: 'A operação por trás do selo: farol e fila de análise, ficha do processo, convites, BC Report e financeiro.',
    color: '#7c3aed',
    bg: '#f5f3ff',
  },
]

// ── Profile selector screen ───────────────────────────────────────────────────
// Código de acesso ao perfil interno — conferido no servidor
function CodigoAcesso({ onOk, onClose }) {
  const [code, setCode] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const enviar = async (e) => {
    e.preventDefault()
    if (!code.trim()) return
    setEnviando(true); setErro('')
    try {
      const res = await fetch('/.netlify/functions/demo-unlock', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: code.trim() }),
      })
      if (res.ok) { try { sessionStorage.setItem(UNLOCK_KEY, '1') } catch { /* sem storage: vale só nesta tela */ } onOk(); return }
      setErro(res.status === 503 ? 'Acesso interno não configurado.' : 'Código inválido.')
    } catch { setErro('Não foi possível validar agora. Tente de novo.') }
    finally { setEnviando(false) }
  }
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <form onSubmit={enviar} style={{ background:'#fff', borderRadius:16, padding:26, maxWidth:380, width:'100%' }}>
        <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:16, color:'#1a1c5e', marginBottom:6 }}>🔒 Acesso interno EQPI</div>
        <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#64748b', marginBottom:14 }}>Informe o código de acesso da equipe.</div>
        <input autoFocus type="password" value={code} onChange={e => setCode(e.target.value)} placeholder="Código de acesso"
          style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:14, boxSizing:'border-box', marginBottom:8 }}/>
        {erro && <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:12, color:'#dc2626', marginBottom:8 }}>{erro}</div>}
        <div style={{ display:'flex', gap:8, marginTop:6 }}>
          <Button variant="neutral" full onClick={onClose}>Cancelar</Button>
          <Button variant="primary" full type="submit" disabled={enviando || !code.trim()}>{enviando ? 'Validando…' : 'Entrar'}</Button>
        </div>
      </form>
    </div>
  )
}

function ProfileSelector({ onSelect }) {
  const [liberado, setLiberado] = useState(lerLiberado)
  const [pedirCodigo, setPedirCodigo] = useState(false)
  const perfis = PROFILES.filter(p => p.id !== 'ADMIN' || liberado)
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
          <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:28, color:'#1a1c5e', marginBottom:8 }}>Bem-vindo ao SIGEC-ELOS</div>
          <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:15, color:'#9B9B9B', maxWidth:520 }}>
            Selecione um perfil para explorar a plataforma com dados de demonstração — sem login necessário.
          </div>
        </div>

        <div style={{ display:'flex', gap:18, flexWrap:'wrap', justifyContent:'center', maxWidth:1200 }}>
          {perfis.map(p => (
            <button key={p.id} onClick={() => onSelect(p.id)}
              style={{ width:220, padding:'24px 20px', borderRadius:20, background:'#fff', border:`2px solid ${p.bg}`, cursor:'pointer', textAlign:'left', transition:'all .2s', boxShadow:'0 2px 12px rgba(0,0,0,.06)', display:'flex', flexDirection:'column', gap:12 }}
              onMouseOver={e => { e.currentTarget.style.border=`2px solid ${p.color}`; e.currentTarget.style.boxShadow=`0 8px 24px ${p.color}22`; e.currentTarget.style.transform='translateY(-2px)' }}
              onMouseOut={e  => { e.currentTarget.style.border=`2px solid ${p.bg}`;    e.currentTarget.style.boxShadow='0 2px 12px rgba(0,0,0,.06)'; e.currentTarget.style.transform='none' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:48, height:48, borderRadius:12, background:p.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, flexShrink:0 }}>
                  {p.icon}
                </div>
                <div>
                  <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:14, color:'#1a1c5e' }}>{p.label}</div>
                  <div style={{ fontSize:10, fontWeight:700, color:p.color, fontFamily:'Montserrat,sans-serif' }}>{p.company}</div>
                </div>
              </div>
              <div style={{ fontSize:12, color:'#64748b', fontFamily:'DM Sans,sans-serif', lineHeight:1.6 }}>{p.desc}</div>
              <div style={{ padding:'7px 12px', borderRadius:10, background:p.bg, color:p.color, fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:11, textAlign:'center' }}>
                Acessar →
              </div>
            </button>
          ))}
        </div>

        <div style={{ marginTop:28, fontSize:12, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', textAlign:'center' }}>
          Dados de demonstração · Sem dados reais · Sem necessidade de login
        </div>
        {!liberado && (
          <button onClick={() => setPedirCodigo(true)}
            style={{ marginTop:10, background:'none', border:'none', cursor:'pointer', fontSize:11, color:'#b8bccf', fontFamily:'DM Sans,sans-serif' }}>
            🔒 Acesso interno EQPI
          </button>
        )}
        {pedirCodigo && <CodigoAcesso onOk={() => { setLiberado(true); setPedirCodigo(false) }} onClose={() => setPedirCodigo(false)}/>}
      </div>
    </div>
  )
}

// ── Screen routing ────────────────────────────────────────────────────────────
function renderScreen(profile, screen, navigate) {
  if (profile === 'SUPPLIER') {
    if (screen === 'documentos')   return <DemoSupplierDocumentosFicha/>
    if (screen === 'processo')     return <DemoSupplierProcessoFicha navigate={navigate}/>
    if (screen === 'certificado')  return <DemoSupplierCertificado navigate={navigate}/>
    if (screen === 'questionario') return <DemoSupplierQuestionario/>
    if (screen === 'planos')       return <DemoPlano role="SUPPLIER"/>
    if (screen === 'categorias')   return <DemoSupplierCategorias/>
    if (screen === 'dados')        return <DemoSupplierMeusDados/>
    if (screen === 'clientes')     return <DemoSupplierClientesElos/>
    if (screen === 'equipe')       return <DemoTeam role="SUPPLIER"/>
    return <DemoSupplierDashboard navigate={navigate}/>
  }
  if (profile === 'BUYER') {
    if (screen === 'convites') return <DemoConvites profile="BUYER" navigate={navigate}/>
    if (screen === 'perfil')   return <DemoBuyerFicha navigate={navigate}/>
    if (screen === 'rfq')      return <DemoRFQ profile="BUYER" navigate={navigate}/>
    if (screen === 'plano')    return <DemoPlano role="BUYER"/>
    return <DemoBuyerMarketplace navigate={navigate}/>
  }
  if (profile === 'CLIENT') {
    if (screen === 'fornecedores')  return <DemoClientFornecedores navigate={navigate}/>
    if (screen === 'convites')      return <DemoConvites profile="CLIENT" navigate={navigate}/>
    if (screen === 'rfq')           return <DemoRFQ profile="CLIENT" navigate={navigate}/>
    if (screen === 'questionarios')  return <DemoClientQuestionarios navigate={navigate}/>
    if (screen === 'relatorios')    return <DemoClientRelatorios/>
    if (screen === 'compliance')    return <DemoClientCompliance/>
    if (screen === 'configuracoes') return <DemoClientConfig navigate={navigate}/>
    if (screen === 'equipe')        return <DemoTeam role="CLIENT"/>
    if (screen === 'processo')      return <DemoClientProcesso navigate={navigate}/>
    return <DemoClientDashboard navigate={navigate}/>
  }
  if (profile === 'ADMIN') {
    // só chega aqui depois do código validado (o card nem aparece antes)
    if (!lerLiberado()) return null
    return (
      <Suspense fallback={<div style={{ padding:40, textAlign:'center', fontFamily:'DM Sans,sans-serif', color:'#9B9B9B' }}>Carregando…</div>}>
        <DemoBackofficeScreen screen={screen} navigate={navigate}/>
      </Suspense>
    )
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

  // Novo Fornecedor: onboarding full-screen, depois muda para SUPPLIER
  if (profile === 'NEW_SUPPLIER') {
    return (
      <DemoSupplierOnboarding
        onComplete={() => { setProfile('SUPPLIER'); setScreen('dashboard') }}
      />
    )
  }

  if (!profile) return <ProfileSelector onSelect={handleSelect}/>

  // Portal white-label fake: tela cheia, sem a navbar do demo (parece real)
  if (profile === 'CLIENT' && screen === 'portal_landing') return <DemoPortalLanding navigate={setScreen}/>
  if (profile === 'CLIENT' && screen === 'portal_login')   return <DemoPortalLogin   navigate={setScreen}/>

  return (
    <div style={{ minHeight:'100vh', background:'#f4f5f9' }}>
      <DemoNavbar role={profile} screen={screen} navigate={setScreen} onExit={handleExit}/>
      {renderScreen(profile, screen, setScreen)}
    </div>
  )
}
