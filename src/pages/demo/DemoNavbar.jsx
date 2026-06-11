import { useState } from 'react'
import { DEMO_USER } from './demoData.js'

const NAVS = {
  SUPPLIER: [
    { key:'dashboard',   label:'Dashboard',   icon:'⊞' },
    { key:'documentos',  label:'Documentos',  icon:'📋' },
    { key:'processo',    label:'Processo',    icon:'🔄' },
    { key:'planos',      label:'Meu Plano',   icon:'⭐' },
  ],
  BUYER: [
    { key:'marketplace', label:'Marketplace', icon:'🔍' },
    { key:'convites',    label:'Convites',    icon:'🤝' },
  ],
  CLIENT: [
    { key:'dashboard',      label:'Dashboard',     icon:'⊞' },
    { key:'fornecedores',   label:'Fornecedores',  icon:'🏭' },
    { key:'convites',       label:'Convites',      icon:'🤝' },
    { key:'rfq',            label:'Cotações (RFQ)', icon:'💬' },
    { key:'configuracoes',  label:'Configurações', icon:'⚙️' },
  ],
}

const ROLE_LABEL = { SUPPLIER:'Fornecedor', BUYER:'Comprador', CLIENT:'Cliente' }
const ROLE_COLOR = { SUPPLIER:'#2563eb',    BUYER:'#ea580c',   CLIENT:'#059669' }

export default function DemoNavbar({ role, screen, navigate, onExit }) {
  const [open, setOpen] = useState(false)
  const user  = DEMO_USER[role]
  const items = NAVS[role] || []

  return (
    <nav style={{ background:'#2E3192', position:'sticky', top:0, zIndex:100, boxShadow:'0 2px 12px rgba(46,49,146,.4)', flexShrink:0 }}>
      <div style={{ display:'flex', alignItems:'center', padding:'0 16px', height:58, gap:12 }}>
        {/* Logo */}
        <div style={{ cursor:'pointer', flexShrink:0 }} onClick={() => navigate(items[0]?.key)}>
          <img src="/logo.png" alt="SIGEC-ELOS" style={{ height:36, width:'auto', objectFit:'contain', display:'block' }} />
        </div>

        {/* Nav links */}
        <div style={{ display:'flex', gap:2, flex:1 }}>
          {items.map(item => {
            const active = screen === item.key || screen?.startsWith(item.key + '_')
            return (
              <button key={item.key} onClick={() => navigate(item.key)}
                style={{ background:active?'rgba(255,255,255,.12)':'transparent', border:active?'1px solid rgba(255,255,255,.2)':'1px solid transparent', color:active?'#fff':'rgba(255,255,255,.6)', padding:'6px 12px', borderRadius:8, cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontSize:12, fontWeight:500, display:'flex', alignItems:'center', gap:5, whiteSpace:'nowrap' }}>
                {item.icon} {item.label}
              </button>
            )
          })}
        </div>

        {/* User info */}
        <div style={{ display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:12, fontWeight:700, color:'#fff', fontFamily:'Montserrat,sans-serif', lineHeight:1.2 }}>{user.name}</div>
            <div style={{ fontSize:10, color:ROLE_COLOR[role], background:`${ROLE_COLOR[role]}22`, padding:'1px 8px', borderRadius:20, fontFamily:'Montserrat,sans-serif', fontWeight:700, display:'inline-block' }}>{ROLE_LABEL[role]}</div>
          </div>
          <div style={{ width:34, height:34, borderRadius:10, background:'rgba(255,255,255,.12)', border:'1px solid rgba(255,255,255,.2)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:800, fontSize:12, flexShrink:0 }}>
            {user.initials}
          </div>
          <button onClick={onExit}
            style={{ background:'rgba(255,255,255,.08)', border:'1px solid rgba(255,255,255,.15)', color:'rgba(255,255,255,.6)', borderRadius:8, padding:'5px 12px', fontSize:11, fontFamily:'DM Sans,sans-serif', cursor:'pointer' }}>
            ← Perfis
          </button>
        </div>
      </div>
    </nav>
  )
}
