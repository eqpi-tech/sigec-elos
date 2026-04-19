import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useIsMobile } from '../hooks/useIsMobile.js'

const NAVS = {
  SUPPLIER: [
    { path:'/fornecedor',            label:'Dashboard',       icon:'⊞' },
    { path:'/fornecedor/documentos', label:'Documentos',      icon:'📋' },
    { path:'/fornecedor/planos',     label:'Meu Plano',       icon:'⭐' },
    { path:'/fornecedor/categorias', label:'Categorias',      icon:'📦' },
  ],
  BUYER: [
    { path:'/comprador',             label:'Marketplace',     icon:'🔍' },
    { path:'/comprador/convites',    label:'Convites',        icon:'🤝' },
  ],
  ADMIN: [
    { path:'/backoffice',                 label:'Visão Geral',     icon:'⊞' },
    { path:'/backoffice/fila',            label:'Fila',            icon:'⏳' },
    { path:'/backoffice/homologados',     label:'Homologados',     icon:'✅' },
    { path:'/backoffice/metricas',        label:'Métricas',        icon:'📊' },
    { path:'/backoffice/criar-usuario',   label:'+ Usuário',       icon:'👤' },
  ],
}
const ROLE_LABEL = { SUPPLIER:'Fornecedor', BUYER:'Comprador', ADMIN:'Backoffice' }
const ROLE_COLOR = { SUPPLIER:'#2563eb',    BUYER:'#ea580c',   ADMIN:'#7c3aed' }

export default function Navbar() {
  const { user, logout, roleOptions, activeRole, switchRole } = useAuth()
  const navigate   = useNavigate()
  const { pathname } = useLocation()
  const mobile     = useIsMobile()
  const [open, setOpen] = useState(false)

  if (!user) return null

  const items = NAVS[user.role] || []
  const handleLogout = async () => { await logout(); navigate('/login') }
  const go = (path) => { navigate(path); setOpen(false) }

  return (
    <nav style={{ background:'#2E3192', position:'sticky', top:0, zIndex:100, boxShadow:'0 2px 12px rgba(46,49,146,.4)', flexShrink:0 }}>
      <div style={{ display:'flex', alignItems:'center', padding:'0 16px', height:58, gap:12 }}>
        {/* Logo */}
        <div style={{ cursor:'pointer', flexShrink:0 }} onClick={() => go(items[0]?.path || '/')}>
          <img src="/logo.png" alt="SIGEC-ELOS" style={{ height:36, width:'auto', objectFit:'contain', display:'block' }} />
        </div>

        {/* Desktop nav links */}
        {!mobile && (
          <div style={{ display:'flex', gap:2, flex:1 }}>
            {items.map(item => {
              const active = pathname === item.path || (item.path.length > 10 && pathname.startsWith(item.path))
              return (
                <button key={item.path} onClick={() => go(item.path)}
                  style={{ background:active?'rgba(255,255,255,.12)':'transparent', border:active?'1px solid rgba(255,255,255,.2)':'1px solid transparent', color:active?'#fff':'rgba(255,255,255,.6)', padding:'6px 12px', borderRadius:8, cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontSize:12, fontWeight:500, display:'flex', alignItems:'center', gap:5, whiteSpace:'nowrap' }}>
                  {item.icon} {item.label}
                </button>
              )
            })}
          </div>
        )}

        {/* Spacer on mobile */}
        {mobile && <div style={{ flex:1 }}/>}

        {/* Desktop right area */}
        {!mobile && (
          <div style={{ display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
            <div style={{ textAlign:'right' }}>
              <div style={{ fontSize:12, fontWeight:700, color:'#fff', fontFamily:'Montserrat,sans-serif', lineHeight:1.2 }}>{user.name}</div>
              <div style={{ fontSize:10, color:ROLE_COLOR[user.role], background:`${ROLE_COLOR[user.role]}22`, padding:'1px 8px', borderRadius:20, fontFamily:'Montserrat,sans-serif', fontWeight:700, display:'inline-block' }}>{ROLE_LABEL[user.role]}</div>
            </div>
            <div style={{ width:34, height:34, borderRadius:10, background:'rgba(255,255,255,.12)', border:'1px solid rgba(255,255,255,.2)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:800, fontSize:12, flexShrink:0 }}>
              {user.name?.slice(0,2).toUpperCase()}
            </div>
            {roleOptions?.length > 1 && (
              <select value={activeRole||''} onChange={e=>switchRole(e.target.value)}
                style={{ padding:'5px 8px', borderRadius:8, border:'1px solid rgba(255,255,255,.2)', background:'rgba(255,255,255,.1)', color:'#fff', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:11, cursor:'pointer', outline:'none' }}>
                {roleOptions.map(r=>(
                  <option key={r.role} value={r.role} style={{ color:'#1a1c5e', background:'#fff' }}>
                    {r.role==='SUPPLIER'?'🏭 Fornecedor':r.role==='BUYER'?'🏢 Comprador':'⚙️ Backoffice'}
                  </option>
                ))}
              </select>
            )}
            <button onClick={handleLogout} style={{ background:'rgba(255,255,255,.08)', border:'1px solid rgba(255,255,255,.15)', color:'rgba(255,255,255,.6)', borderRadius:8, padding:'5px 12px', fontSize:11, fontFamily:'DM Sans,sans-serif', cursor:'pointer' }}>Sair</button>
          </div>
        )}

        {/* Mobile hamburger */}
        {mobile && (
          <button onClick={() => setOpen(o => !o)}
            style={{ background:'rgba(255,255,255,.08)', border:'1px solid rgba(255,255,255,.15)', borderRadius:8, padding:'7px 10px', cursor:'pointer', color:'#fff', fontSize:18, lineHeight:1, flexShrink:0 }}>
            {open ? '✕' : '☰'}
          </button>
        )}
      </div>

      {/* Mobile drawer */}
      {mobile && open && (
        <div style={{ background:'#1a1f6e', borderTop:'1px solid rgba(255,255,255,.1)', padding:'12px 16px 20px' }}>
          {/* User info */}
          <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 0 16px', borderBottom:'1px solid rgba(255,255,255,.1)', marginBottom:10 }}>
            <div style={{ width:36, height:36, borderRadius:10, background:'rgba(255,255,255,.12)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:800, fontSize:13, flexShrink:0 }}>
              {user.name?.slice(0,2).toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:'#fff', fontFamily:'Montserrat,sans-serif' }}>{user.name}</div>
              <div style={{ fontSize:11, color:ROLE_COLOR[user.role], fontFamily:'DM Sans,sans-serif' }}>{ROLE_LABEL[user.role]}</div>
            </div>
          </div>

          {/* Nav items */}
          {items.map(item => {
            const active = pathname === item.path || (item.path.length > 10 && pathname.startsWith(item.path))
            return (
              <button key={item.path} onClick={() => go(item.path)}
                style={{ width:'100%', display:'flex', alignItems:'center', gap:12, padding:'12px 10px', borderRadius:10, border:'none', cursor:'pointer', marginBottom:4, textAlign:'left', fontFamily:'DM Sans,sans-serif', fontSize:14, fontWeight:500,
                  background: active ? 'rgba(255,255,255,.12)' : 'transparent',
                  color: active ? '#fff' : 'rgba(255,255,255,.7)' }}>
                <span style={{ fontSize:18 }}>{item.icon}</span> {item.label}
              </button>
            )
          })}

          {/* Role switcher */}
          {roleOptions?.length > 1 && (
            <div style={{ padding:'10px 0', borderTop:'1px solid rgba(255,255,255,.1)', marginTop:8 }}>
              <div style={{ fontSize:11, color:'rgba(255,255,255,.4)', fontFamily:'DM Sans,sans-serif', marginBottom:6 }}>Trocar perfil</div>
              {roleOptions.map(r => (
                <button key={r.role} onClick={() => { switchRole(r.role); setOpen(false) }}
                  style={{ width:'100%', padding:'10px', borderRadius:8, marginBottom:4, border:`1px solid ${r.role===activeRole?'rgba(255,255,255,.3)':'rgba(255,255,255,.1)'}`, background: r.role===activeRole?'rgba(255,255,255,.12)':'transparent', color:'rgba(255,255,255,.8)', fontFamily:'DM Sans,sans-serif', fontSize:13, cursor:'pointer', textAlign:'left' }}>
                  {r.role==='SUPPLIER'?'🏭 Fornecedor':r.role==='BUYER'?'🏢 Comprador':'⚙️ Backoffice'}
                </button>
              ))}
            </div>
          )}

          {/* Logout */}
          <button onClick={handleLogout}
            style={{ width:'100%', marginTop:8, padding:'12px', borderRadius:10, background:'rgba(239,68,68,.15)', border:'1px solid rgba(239,68,68,.3)', color:'#fca5a5', fontFamily:'DM Sans,sans-serif', fontSize:14, cursor:'pointer' }}>
            Sair da conta
          </button>
        </div>
      )}
    </nav>
  )
}
