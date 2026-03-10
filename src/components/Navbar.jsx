import { Avatar } from './ui.jsx'

const NAV_ITEMS = {
  fornecedor: [
    { id: 'dashboard',  label: 'Dashboard',  icon: '⊞' },
    { id: 'documentos', label: 'Documentos', icon: '📋' },
    { id: 'planos',     label: 'Meu Plano',  icon: '⭐' },
  ],
  comprador: [
    { id: 'marketplace', label: 'Marketplace', icon: '🔍' },
    { id: 'cotacoes',    label: 'Cotações',    icon: '📝' },
  ],
  admin: [
    { id: 'admin',      label: 'Visão Geral',  icon: '⊞' },
    { id: 'aprovacoes', label: 'Aprovações',   icon: '✓' },
    { id: 'financeiro', label: 'Financeiro',   icon: '💰' },
  ],
}

const PROFILE_LABELS = {
  fornecedor: 'Metalúrgica Souza Ltda',
  comprador:  'Vale S.A. · Comprador',
  admin:      'Admin · EQPI Tech',
}

const PROFILE_AVATARS = {
  fornecedor: { name: 'JS', gradient: 'linear-gradient(135deg, rgba(244,126,47,0.8), #3d40b5)' },
  comprador:  { name: 'VA', gradient: 'linear-gradient(135deg, #F47E2F, #c2410c)' },
  admin:      { name: 'AD', gradient: 'linear-gradient(135deg, #8b5cf6, #4c1d95)' },
}

export default function Navbar({ profile, setProfile, currentScreen, setScreen }) {
  const items = NAV_ITEMS[profile] || []
  const av = PROFILE_AVATARS[profile]

  return (
    <nav style={{
      background: '#2E3192',
      display: 'flex', alignItems: 'center',
      padding: '0 24px', height: 58,
      boxShadow: '0 2px 12px rgba(46,49,146,0.4)',
      position: 'sticky', top: 0, zIndex: 100,
      flexShrink: 0,
    }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginRight: 40 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: 'linear-gradient(135deg, #F47E2F, #ff9a52)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18, fontWeight: 900, color: '#fff', fontFamily: 'Montserrat, sans-serif',
        }}>∞</div>
        <div>
          <div style={{ color: '#fff', fontWeight: 800, fontSize: 14, fontFamily: 'Montserrat, sans-serif', lineHeight: 1 }}>SIGEC</div>
          <div style={{ color: '#F47E2F', fontWeight: 700, fontSize: 10, fontFamily: 'Montserrat, sans-serif', letterSpacing: 2 }}>ELOS</div>
        </div>
      </div>

      {/* Nav items */}
      <div style={{ display: 'flex', gap: 4, flex: 1 }}>
        {items.map(item => (
          <button
            key={item.id}
            onClick={() => setScreen(item.id)}
            style={{
              background: currentScreen === item.id ? 'rgba(255,255,255,0.12)' : 'transparent',
              border: currentScreen === item.id ? '1px solid rgba(255,255,255,0.2)' : '1px solid transparent',
              color: currentScreen === item.id ? '#fff' : 'rgba(255,255,255,0.6)',
              padding: '6px 14px', borderRadius: 8, cursor: 'pointer',
              fontFamily: 'DM Sans, sans-serif', fontSize: 13, fontWeight: 500,
              display: 'flex', alignItems: 'center', gap: 6,
              transition: 'all 0.15s',
            }}
          >
            <span>{item.icon}</span> {item.label}
          </button>
        ))}
      </div>

      {/* Demo profile switcher */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <span style={{
          color: 'rgba(255,255,255,0.35)', fontSize: 10,
          fontFamily: 'Montserrat, sans-serif', fontWeight: 600, marginRight: 4,
          background: 'rgba(255,255,255,0.08)', padding: '3px 8px', borderRadius: 6,
        }}>DEMO</span>
        {['fornecedor', 'comprador', 'admin'].map(p => (
          <button
            key={p}
            onClick={() => {
              setProfile(p)
              const screens = { fornecedor: 'dashboard', comprador: 'marketplace', admin: 'admin' }
              setScreen(screens[p])
            }}
            style={{
              background: profile === p ? '#F47E2F' : 'rgba(255,255,255,0.08)',
              color: profile === p ? '#fff' : 'rgba(255,255,255,0.5)',
              border: 'none', borderRadius: 6, padding: '4px 10px',
              fontSize: 11, fontWeight: 600, cursor: 'pointer',
              fontFamily: 'Montserrat, sans-serif', textTransform: 'capitalize',
              transition: 'all 0.15s',
            }}
          >{p}</button>
        ))}

        <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.15)', margin: '0 8px' }} />
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', fontFamily: 'DM Sans, sans-serif' }}>
          {PROFILE_LABELS[profile]}
        </span>
        <Avatar name={av.name} gradient={av.gradient} />
      </div>
    </nav>
  )
}
