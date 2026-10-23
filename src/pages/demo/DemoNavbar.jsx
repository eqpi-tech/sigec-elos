import { useState, useEffect } from 'react'
import { DEMO_USER } from './demoData.js'

// Mesmos itens/ordem da Navbar real (src/components/Navbar.jsx) — o demo
// deve espelhar a versão atual do ELOS apresentada pelo comercial.
// "match": outras telas que deixam o item aceso (ex.: ficha do processo).
const NAVS = {
  SUPPLIER: [
    { key:'dashboard',    label:'Dashboard',     icon:'⊞', match:['processo','certificado'] },
    { key:'documentos',   label:'Documentos',    icon:'📋' },
    { key:'questionario', label:'Questionários', icon:'❓' },
    { key:'categorias',   label:'Categorias',    icon:'📦' },
    { key:'dados',        label:'Meus Dados',    icon:'🏢' },
    { key:'equipe',       label:'Equipe',        icon:'👥' },
    { key:'clientes',     label:'Clientes ELOS', icon:'🤝' },
    { key:'cotacoes',     label:'Cotações',      icon:'💬' },
    { key:'planos',       label:'Meu Plano',     icon:'⭐' },
  ],
  // comprador da demo é Comprador Pro (cotações liberadas, sem cadeado)
  BUYER: [
    { key:'marketplace', label:'Marketplace', icon:'🔍', match:['perfil'] },
    { key:'convites',    label:'Convites',    icon:'🤝' },
    { key:'cotacoes',    label:'Cotações',    icon:'💬' },
    { key:'plano',       label:'Meu Plano',   icon:'⭐' },
  ],
  CLIENT: [
    { key:'dashboard',      label:'Dashboard',      icon:'⊞' },
    { key:'relatorios',     label:'Relatórios',     icon:'📈' },
    { key:'fornecedores',   label:'Fornecedores',   icon:'🏭', match:['processo','perfil_fornecedor'] },
    { key:'questionarios',  label:'Questionários',  icon:'📋' },
    { key:'compliance',     label:'Compliance',     icon:'🛡️' },
    { key:'convites',       label:'Convites',       icon:'🤝' },
    { key:'rfq',            label:'Cotações (RFQ)', icon:'💬' },
    { key:'equipe',         label:'Equipe',         icon:'👥' },
    { group:'config', label:'Configurações', icon:'⚙️', children:[
      { key:'configuracoes', label:'Portal de Fornecedores', icon:'🌐', desc:'Página pública de cadastro (white-label)' },
      { key:'termos',        label:'Termos e Aceites',       icon:'📜', desc:'Textos e documentos que o fornecedor aceita' },
    ] },
  ],
  // Backoffice EQPI: menu reduzido com os itens que o comercial apresenta
  ADMIN: [
    { key:'dashboard',  label:'Início',           icon:'⊞' },
    { key:'analise',    label:'Análise de Docs',  icon:'📋' },
    { key:'processo',   label:'Processo',         icon:'🔍' },
    { key:'convites',   label:'Convites',         icon:'✉️' },
    { key:'bc',         label:'BC Report',        icon:'🕵️' },
    { key:'financeiro', label:'Financeiro',       icon:'💰' },
  ],
}

const ROLE_LABEL = { SUPPLIER:'Fornecedor', BUYER:'Comprador', CLIENT:'Cliente', ADMIN:'Backoffice' }
const ROLE_COLOR = { SUPPLIER:'#2563eb',    BUYER:'#ea580c',   CLIENT:'#059669', ADMIN:'#7c3aed' }

function useCompact(limit = 1500) {
  const get = () => (typeof window !== 'undefined' ? window.innerWidth < limit : false)
  const [c, setC] = useState(get)
  useEffect(() => {
    const on = () => setC(get())
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])   // eslint-disable-line react-hooks/exhaustive-deps
  return c
}

export default function DemoNavbar({ role, screen, navigate, onExit }) {
  const [openGroup, setOpenGroup] = useState(null)
  const compact = useCompact()
  const user  = DEMO_USER[role]
  const items = NAVS[role] || []
  const isActive = (it) => screen === it.key || (it.match || []).includes(screen)
  const btn = (active) => ({ background:active?'rgba(255,255,255,.12)':'transparent', border:active?'1px solid rgba(255,255,255,.2)':'1px solid transparent', color:active?'#fff':'rgba(255,255,255,.6)', padding:'6px 9px', borderRadius:8, cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontSize:12, fontWeight:500, display:'flex', alignItems:'center', gap:5, whiteSpace:'nowrap' })
  const go = (k) => { setOpenGroup(null); navigate(k) }

  return (
    <nav style={{ background:'#2E3192', position:'sticky', top:0, zIndex:200, boxShadow:'0 2px 12px rgba(46,49,146,.4)', flexShrink:0 }}
      onMouseLeave={() => setOpenGroup(null)}>
      <div style={{ display:'flex', alignItems:'center', padding:'0 16px', height:58, gap:12 }}>
        {/* Logo */}
        <div style={{ cursor:'pointer', flexShrink:0 }} onClick={() => go(items[0]?.key)}>
          <img src="/logo.png" alt="SIGEC-ELOS" style={{ height:36, width:'auto', objectFit:'contain', display:'block' }} />
        </div>

        {/* Nav links */}
        <div style={{ display:'flex', gap:2, flex:1, minWidth:0, alignItems:'center' }}>
          {items.map(item => {
            if (item.children) {
              const groupActive = item.children.some(isActive)
              const isOpen = openGroup === item.group
              return (
                <div key={item.group} style={{ position:'relative' }} onMouseEnter={() => setOpenGroup(item.group)}>
                  <button onClick={() => setOpenGroup(isOpen ? null : item.group)} style={btn(groupActive || isOpen)}>
                    {!compact && item.icon} {item.label} <span style={{ fontSize:9, opacity:.7, marginLeft:2 }}>▾</span>
                  </button>
                  {isOpen && (
                    <div style={{ position:'absolute', top:'calc(100% + 6px)', left:0, background:'#fff', borderRadius:12, boxShadow:'0 8px 32px rgba(0,0,0,.18)', padding:8, minWidth:240, zIndex:300 }}>
                      {item.children.map(child => {
                        const active = isActive(child)
                        return (
                          <button key={child.key} onClick={() => go(child.key)}
                            style={{ width:'100%', display:'flex', alignItems:'flex-start', gap:10, padding:'10px 12px', borderRadius:8, border:'none', cursor:'pointer', textAlign:'left', marginBottom:2, background: active ? 'rgba(46,49,146,.08)' : 'transparent' }}>
                            <span style={{ fontSize:16, flexShrink:0, marginTop:1 }}>{child.icon}</span>
                            <div>
                              <div style={{ fontSize:13, fontWeight:700, color: active ? '#2E3192' : '#1a1c5e', fontFamily:'Montserrat,sans-serif', lineHeight:1.2, marginBottom:2 }}>{child.label}</div>
                              <div style={{ fontSize:11, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', lineHeight:1.3 }}>{child.desc}</div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            }
            return (
              <button key={item.key} onClick={() => go(item.key)} style={btn(isActive(item))}>
                {!compact && item.icon} {item.label}
              </button>
            )
          })}
        </div>

        {/* Ajuda + usuário */}
        <div style={{ display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
          <button onClick={() => go('ajuda')} title="Ajuda e suporte" aria-label="Ajuda e suporte"
            style={{ width:34, height:34, borderRadius:10, border:'1px solid rgba(255,255,255,.2)', background: screen === 'ajuda' ? 'rgba(255,255,255,.22)' : 'rgba(255,255,255,.08)', color:'#fff', fontFamily:'Montserrat,sans-serif', fontSize:15, fontWeight:800, cursor:'pointer', flexShrink:0, padding:0 }}>
            ?
          </button>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:12, fontWeight:700, color:'#fff', fontFamily:'Montserrat,sans-serif', lineHeight:1.2 }}>{user.name}</div>
            <div style={{ fontSize:10, color:ROLE_COLOR[role], background:`${ROLE_COLOR[role]}22`, padding:'1px 8px', borderRadius:20, fontFamily:'Montserrat,sans-serif', fontWeight:700, display:'inline-block' }}>{ROLE_LABEL[role]}{role === 'BUYER' ? ' Pro' : ''}</div>
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
