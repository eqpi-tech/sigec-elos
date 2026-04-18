import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useState } from 'react'

const NAVS = {
  SUPPLIER: [
    { path:'/fornecedor',             label:'Dashboard',      icon:'⊞' },
    { path:'/fornecedor/documentos',  label:'Documentos',     icon:'📋' },
    { path:'/fornecedor/planos',      label:'Meu Plano',      icon:'⭐' },
    { path:'/fornecedor/categorias',  label:'Categorias',     icon:'📦' },
  ],
  BUYER: [
    { path:'/comprador',              label:'Marketplace',    icon:'🔍' },
    { path:'/comprador/cotacoes',     label:'Cotações',       icon:'📝' },
  ],
  ADMIN: [
    { path:'/backoffice',                label:'Visão Geral',    icon:'⊞' },
    { path:'/backoffice/fila',           label:'Fila de Análise',icon:'⏳' },
    { path:'/backoffice/homologados',    label:'Homologados',    icon:'✅' },
    { path:'/backoffice/metricas',       label:'Métricas',       icon:'📊' },
    { path:'/backoffice/criar-usuario',  label:'+ Usuário',      icon:'👤' },
  ],
}
const ROLE_LABEL = { SUPPLIER:'Fornecedor', BUYER:'Comprador', ADMIN:'Backoffice EQPI' }
const ROLE_COLOR = { SUPPLIER:'#2563eb',    BUYER:'#ea580c',   ADMIN:'#7c3aed' }

export default function Navbar() {
  const { user, logout, roleOptions, activeRole, switchRole } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  if (!user) return null

  const items = NAVS[user.role] || []
  const handleLogout = async () => { await logout(); navigate('/login') }

  return (
    <nav style={{ background:'#2E3192',display:'flex',alignItems:'center',padding:'0 24px',height:58,boxShadow:'0 2px 12px rgba(46,49,146,.4)',position:'sticky',top:0,zIndex:100,flexShrink:0 }}>
      <div style={{ display:'flex',alignItems:'center',marginRight:32,cursor:'pointer' }} onClick={()=>navigate(items[0]?.path||'/')}>
        <img src="/logo.png" alt="SIGEC-ELOS" style={{ height:40,width:'auto',objectFit:'contain' }} />
      </div>

      <div style={{ display:'flex',gap:4,flex:1 }}>
        {items.map(item => {
          const active = pathname === item.path || (item.path.length > 10 && pathname.startsWith(item.path))
          return (
            <button key={item.path} onClick={()=>navigate(item.path)}
              style={{ background:active?'rgba(255,255,255,.12)':'transparent',border:active?'1px solid rgba(255,255,255,.2)':'1px solid transparent',color:active?'#fff':'rgba(255,255,255,.6)',padding:'6px 14px',borderRadius:8,cursor:'pointer',fontFamily:'DM Sans,sans-serif',fontSize:13,fontWeight:500,display:'flex',alignItems:'center',gap:6,transition:'all .15s' }}>
              {item.icon} {item.label}
            </button>
          )
        })}
      </div>

      <div style={{ display:'flex',alignItems:'center',gap:12 }}>
        <div style={{ textAlign:'right' }}>
          <div style={{ fontSize:12,fontWeight:700,color:'#fff',fontFamily:'Montserrat,sans-serif' }}>{user.name}</div>
          <div style={{ fontSize:10,color:ROLE_COLOR[user.role],background:`${ROLE_COLOR[user.role]}22`,padding:'1px 8px',borderRadius:20,fontFamily:'Montserrat,sans-serif',fontWeight:700,display:'inline-block',marginTop:1 }}>{ROLE_LABEL[user.role]}</div>
        </div>
        <div style={{ width:36,height:36,borderRadius:10,background:'rgba(255,255,255,.12)',border:'1px solid rgba(255,255,255,.2)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:800,fontSize:13,fontFamily:'Montserrat,sans-serif' }}>
          {user.name?.slice(0,2).toUpperCase()}
        </div>
        {roleOptions?.length > 1 && (
          <select value={activeRole||''} onChange={e=>switchRole(e.target.value)}
            style={{ padding:'5px 10px', borderRadius:8, border:'1px solid rgba(255,255,255,.2)',
              background:'rgba(255,255,255,.1)', color:'#fff', fontFamily:'Montserrat,sans-serif',
              fontWeight:700, fontSize:11, cursor:'pointer', outline:'none' }}>
            {roleOptions.map(r=>(
              <option key={r.role} value={r.role} style={{ color:'#1a1c5e', background:'#fff' }}>
                {r.role==='SUPPLIER'?'🏭 Fornecedor':r.role==='BUYER'?'🏢 Comprador':'⚙️ Backoffice'}
              </option>
            ))}
          </select>
        )}
        <button onClick={handleLogout} style={{ background:'rgba(255,255,255,.08)',border:'1px solid rgba(255,255,255,.15)',color:'rgba(255,255,255,.6)',borderRadius:8,padding:'5px 12px',fontSize:11,fontFamily:'DM Sans,sans-serif',cursor:'pointer',transition:'all .15s' }}>Sair</button>
      </div>
    </nav>
  )
}
