import { useState } from 'react'
import FornecedorView from './demo/FornecedorView.jsx'
import CompradorView  from './demo/CompradorView.jsx'
import ClienteView    from './demo/ClienteView.jsx'

const C = {
  navy: '#1B1F3B', blue: '#2E3192', orange: '#F47E2F',
  grey: '#9B9B9B', light: '#F5F7FA', lightBlue: '#EEF0FF',
  border: '#E2E6F0',
}

const TABS = [
  { id: 'fornecedor', label: '🏭  Fornecedor', desc: 'Painel do fornecedor' },
  { id: 'comprador',  label: '🔍  Comprador',  desc: 'Marketplace' },
  { id: 'cliente',    label: '🏢  Cliente',    desc: 'Portal corporativo' },
]

export default function DemoPage() {
  const [perfil,   setPerfil]   = useState('fornecedor')
  const [resetKey, setResetKey] = useState(0)

  const switchPerfil = (p) => {
    setPerfil(p)
    setResetKey(k => k + 1)
  }

  const handleReset = () => {
    setPerfil('fornecedor')
    setResetKey(k => k + 1)
  }

  const ActiveView = perfil === 'fornecedor' ? FornecedorView
                   : perfil === 'comprador'  ? CompradorView
                   : ClienteView

  return (
    <div style={{ minHeight: '100vh', background: C.light, fontFamily: 'DM Sans,sans-serif' }}>

      {/* ── Navbar ────────────────────────────────────────────────── */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 50, background: C.navy, padding: '0 16px', display: 'flex', flexDirection: 'column' }}>
        {/* Linha 1: logo + badge + reset */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 52 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src="/logo.png" alt="ELOS" style={{ height: 32, objectFit: 'contain', objectPosition: 'left' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.orange, display: 'inline-block', animation: '_pulse 1.5s ease-in-out infinite' }} />
              <span style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 10, color: 'rgba(255,255,255,.55)', letterSpacing: 1.5, textTransform: 'uppercase' }}>Demo · Live</span>
            </div>
          </div>
          <button onClick={handleReset}
            style={{ padding: '5px 12px', borderRadius: 7, background: 'rgba(255,255,255,.07)', color: 'rgba(255,255,255,.4)', fontFamily: 'Montserrat,sans-serif', fontWeight: 600, fontSize: 11, border: '1px solid rgba(255,255,255,.1)', cursor: 'pointer' }}>
            Reset
          </button>
        </div>

        {/* Linha 2: tabs */}
        <div style={{ display: 'flex', gap: 3, paddingBottom: 10 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => switchPerfil(t.id)}
              style={{ flex: 1, padding: '9px 4px', borderRadius: 10, fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 12, cursor: 'pointer', transition: 'all .2s', border: 'none',
                background: perfil === t.id ? '#fff' : 'rgba(255,255,255,.08)',
                color:      perfil === t.id ? C.navy  : 'rgba(255,255,255,.6)',
                boxShadow:  perfil === t.id ? `0 2px 10px rgba(0,0,0,.2)` : 'none' }}>
              {t.label}
            </button>
          ))}
        </div>

        <style>{`@keyframes _pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(1.3)} }`}</style>
      </nav>

      {/* ── Conteúdo ─────────────────────────────────────────────── */}
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '20px 16px 40px' }}>
        {/* Subtítulo do perfil ativo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18, paddingBottom: 14, borderBottom: `1px solid ${C.border}` }}>
          <div style={{ width: 7, height: 20, background: C.orange, borderRadius: 4 }} />
          <div style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 11, color: C.grey, letterSpacing: 1.2, textTransform: 'uppercase' }}>
            {TABS.find(t => t.id === perfil)?.desc}
          </div>
        </div>

        <ActiveView key={resetKey} />
      </div>
    </div>
  )
}
