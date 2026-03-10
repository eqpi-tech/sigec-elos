import { useState } from 'react'
import Navbar from './components/Navbar.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Planos from './pages/Planos.jsx'
import Marketplace from './pages/Marketplace.jsx'
import { PerfilFornecedor, Admin, Onboarding } from './pages/OtherPages.jsx'

const SCREEN_DEFAULT = {
  fornecedor: 'dashboard',
  comprador:  'marketplace',
  admin:      'admin',
}

export default function App() {
  const [profile, setProfile]               = useState('fornecedor')
  const [screen, setScreen]                 = useState('dashboard')
  const [selectedSupplier, setSelectedSupplier] = useState(null)

  const handleSetProfile = (p) => {
    setProfile(p)
    setScreen(SCREEN_DEFAULT[p])
  }

  const renderPage = () => {
    switch (screen) {
      case 'dashboard':  return <Dashboard setScreen={setScreen} />
      case 'planos':     return <Planos />
      case 'cadastro':   return <Onboarding setScreen={setScreen} />
      case 'marketplace':
        return <Marketplace setScreen={setScreen} setSelectedSupplier={setSelectedSupplier} />
      case 'perfil':
        return <PerfilFornecedor supplier={selectedSupplier} setScreen={setScreen} />
      case 'admin':      return <Admin />
      default:           return <Dashboard setScreen={setScreen} />
    }
  }

  const isFullHeight = screen === 'marketplace' || screen === 'cadastro'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Navbar
        profile={profile}
        setProfile={handleSetProfile}
        currentScreen={screen}
        setScreen={setScreen}
      />

      {/* Demo banner */}
      <div style={{
        background: 'linear-gradient(90deg, #1a1c5e, #2E3192)',
        padding: '6px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontFamily: 'Montserrat, sans-serif', fontWeight: 700, letterSpacing: 2 }}>
          ✦ PROTÓTIPO DE VALIDAÇÃO · SIGEC-ELOS v1.0 ·
        </span>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontFamily: 'DM Sans, sans-serif' }}>
          Use o seletor DEMO na navbar para alternar entre perfis
        </span>
        <button
          onClick={() => setScreen('cadastro')}
          style={{
            background: 'rgba(244,126,47,0.25)', border: '1px solid rgba(244,126,47,0.4)',
            color: '#F47E2F', fontSize: 10, fontFamily: 'Montserrat, sans-serif',
            fontWeight: 700, padding: '3px 12px', borderRadius: 20, cursor: 'pointer',
          }}
        >Ver Onboarding →</button>
      </div>

      <main style={{
        flex: isFullHeight ? 1 : 'unset',
        overflow: isFullHeight ? 'hidden' : 'auto',
        background: screen === 'cadastro' ? '#fff' : '#f4f5f9',
      }}>
        {renderPage()}
      </main>
    </div>
  )
}
