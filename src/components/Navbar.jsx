import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useIsMobile } from '../hooks/useIsMobile.js'
import { hasModule } from '../lib/modules.js'
import { supabase } from '../lib/supabase.js'

const NAVS = {
  SUPPLIER: [
    { path:'/fornecedor',               label:'Dashboard',   icon:'⊞',  module:'dashboard' },
    { path:'/fornecedor/documentos',    label:'Documentos',  icon:'📋', module:'documentos' },
    { path:'/fornecedor/questionario',  label:'Questionário',icon:'❓', module:'questionario' },
    { path:'/fornecedor/planos',        label:'Meu Plano',   icon:'⭐', module:'plano' },
    { path:'/fornecedor/categorias',    label:'Categorias',  icon:'📦', module:'categorias' },
    { path:'/fornecedor/dados',         label:'Meus Dados',  icon:'🏢', module:'meus_dados' },
    { path:'/fornecedor/clientes',      label:'Clientes ELOS', icon:'🤝', module:'clientes_elos' },
    { path:'/fornecedor/equipe',        label:'Equipe',      icon:'👥', module:'equipe' },
  ],
  BUYER: [
    { path:'/comprador',             label:'Marketplace',     icon:'🔍' },
    { path:'/comprador/convites',    label:'Convites',        icon:'🤝' },
    { path:'/comprador/plano',       label:'Meu Plano',       icon:'⭐' },
  ],
  CLIENT: [
    { path:'/cliente',                label:'Dashboard',       icon:'⊞',  module:'dashboard' },
    { path:'/cliente/fornecedores',   label:'Fornecedores',    icon:'🏭', module:'fornecedores' },
    { path:'/cliente/convites',       label:'Convites',        icon:'🤝', module:'convites' },
    { path:'/cliente/rfq',            label:'Cotações (RFQ)',  icon:'💬', module:'rfq' },
    { path:'/cliente/questionarios',  label:'Questionários',   icon:'📋', module:'questionarios' },
    { path:'/cliente/configuracoes',  label:'Configurações',   icon:'⚙️', module:'configuracoes' },
    { path:'/cliente/equipe',         label:'Equipe',          icon:'👥', module:'equipe' },
  ],
  ADMIN: [
    { path:'/backoffice', label:'Início', icon:'⊞' },
    {
      key:'analise', label:'Análise', icon:'📋',
      children: [
        { path:'/backoffice/analise-documentos', label:'Análise de Docs', icon:'📄', desc:'Revisar documentos em lote' },
        { path:'/backoffice/processos',          label:'Processos',       icon:'🔍', desc:'Buscar e abrir fichas de fornecedores' },
        { path:'/backoffice/homologados',        label:'Homologados',     icon:'✅', desc:'Fornecedores com selo ativo' },
        { path:'/backoffice/questionarios',      label:'Questionários',   icon:'❓', desc:'Gerenciar questionários dos clientes' },
      ],
    },
    { path:'/backoffice/metricas',    label:'Financeiro',  icon:'💰' },
    { path:'/backoffice/comunicados', label:'Comunicados', icon:'📢' },
    {
      key:'clientes', label:'Clientes', icon:'🏢',
      children: [
        { path:'/backoffice/clientes',          label:'Lista de Clientes',    icon:'🏛️', desc:'Ver e gerenciar todos os clientes' },
        { path:'/backoffice/criar-cliente',     label:'Novo Cliente',         icon:'➕',  desc:'Wizard completo de cadastro' },
        { path:'/backoffice/fluxo-documentos',  label:'Fluxo de Homologação', icon:'📂', desc:'Documentos exigidos por categoria/cliente' },
        { path:'/backoffice/landing-pages',     label:'Portais White-label',  icon:'🌐', desc:'Páginas de convite personalizadas' },
      ],
    },
    {
      key:'usuarios', label:'Usuários', icon:'👥',
      children: [
        { path:'/backoffice/usuarios',      label:'Lista de Usuários', icon:'👤', desc:'Bloquear, redefinir senha, editar' },
        { path:'/backoffice/criar-usuario', label:'Novo Usuário',      icon:'➕', desc:'Criar comprador, cliente ou analista' },
        { path:'/backoffice/perfis',        label:'Perfis de Usuário', icon:'🎛️', desc:'Módulos por perfil para clientes e fornecedores' },
      ],
    },
    {
      key:'config', label:'Configurações Gerais', icon:'⚙️',
      children: [
        { path:'/backoffice/precos',              label:'Preços ELOS',      icon:'💰', desc:'Valores dos planos da plataforma' },
        { path:'/backoffice/feriados',            label:'Feriados',         icon:'📅', desc:'Datas que ajustam os prazos do farol' },
        { path:'/backoffice/catalogo-documentos', label:'Catálogo de Docs', icon:'🗂️', desc:'Tipos de documento e regras de validação' },
      ],
    },
  ],
}
const ROLE_LABEL = { SUPPLIER:'Fornecedor', BUYER:'Comprador', CLIENT:'Cliente', ADMIN:'Backoffice' }
const ROLE_COLOR = { SUPPLIER:'#2563eb',    BUYER:'#ea580c',   CLIENT:'#059669', ADMIN:'#7c3aed' }

export default function Navbar() {
  const { user, logout, roleOptions, activeRole, switchRole } = useAuth()
  const navigate      = useNavigate()
  const { pathname }  = useLocation()
  const mobile        = useIsMobile()
  const [open,        setOpen]        = useState(false)
  const [openGroup,   setOpenGroup]   = useState(null)   // key of open dropdown
  const [mobileGroup, setMobileGroup] = useState(null)   // key of expanded mobile section
  const [clientLogo,  setClientLogo]  = useState(null)   // logo da LP do cliente (visão CLIENT)

  useEffect(() => {
    if (user?.role !== 'CLIENT' || !user?.clientId) { setClientLogo(null); return }
    supabase.from('client_landing_pages').select('logo_url')
      .eq('client_id', user.clientId).eq('is_active', true).not('logo_url', 'is', null).limit(1)
      .then(({ data }) => setClientLogo(data?.[0]?.logo_url || null))
  }, [user?.role, user?.clientId])

  if (!user) return null

  // Perfil analyst (ADMIN): esconde grupos de gestão — usuários, clientes e comunicados
  // Perfis de módulos (patch_038): SUPPLIER/CLIENT veem só os módulos do perfil
  const items = (NAVS[user.role] || []).filter(item => {
    if (user.role === 'ADMIN' && user.accessProfile === 'analyst') {
      if (item.key === 'usuarios' || item.key === 'clientes') return false
      if (item.path === '/backoffice/comunicados') return false
    }
    if (item.module && !hasModule(user, item.module)) return false
    return true
  })
  const handleLogout = async () => { await logout(); navigate('/login') }
  const go           = (path) => { navigate(path); setOpen(false); setOpenGroup(null) }

  // Active detection: works for flat items and group children
  const isPathActive = (path) =>
    pathname === path || (path.length > 10 && pathname.startsWith(path))
  const isGroupActive = (item) =>
    item.children?.some(c => isPathActive(c.path))

  // Right-side user area (shared between desktop and mobile)
  const UserChip = () => (
    <div style={{ display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
      <div style={{ textAlign:'right' }}>
        <div style={{ fontSize:12, fontWeight:700, color:'#fff', fontFamily:'Montserrat,sans-serif', lineHeight:1.2 }}>{user.name}</div>
        <div style={{ fontSize:10, color:ROLE_COLOR[user.role], background:`${ROLE_COLOR[user.role]}22`, padding:'1px 8px', borderRadius:20, fontFamily:'Montserrat,sans-serif', fontWeight:700, display:'inline-block' }}>
          {ROLE_LABEL[user.role]}
        </div>
      </div>
      <div style={{ width:34, height:34, borderRadius:10, background:'rgba(255,255,255,.12)', border:'1px solid rgba(255,255,255,.2)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:800, fontSize:12, flexShrink:0 }}>
        {user.name?.slice(0,2).toUpperCase()}
      </div>
    </div>
  )

  return (
    <nav style={{ background:'#2E3192', position:'sticky', top:0, zIndex:200, boxShadow:'0 2px 12px rgba(46,49,146,.4)', flexShrink:0 }}
      onMouseLeave={() => setOpenGroup(null)}>
      <div style={{ display:'flex', alignItems:'center', padding:'0 16px', height:58, gap:12 }}>

        {/* Logo: cliente com LP personalizada vê o próprio logo no lugar do SIGEC-ELOS */}
        <div style={{ cursor:'pointer', flexShrink:0, marginRight: clientLogo ? 10 : 0 }} onClick={() => go(items[0]?.path || '/')}>
          {clientLogo ? (
            <img src={clientLogo} alt="" onError={e => { e.currentTarget.src = '/logo.png' }}
              style={{ height:38, maxWidth:150, width:'auto', objectFit:'contain', display:'block', background:'#fff', borderRadius:8, padding:'3px 8px' }} />
          ) : (
            <img src="/logo.png" alt="SIGEC-ELOS" style={{ height:36, width:'auto', objectFit:'contain', display:'block' }} />
          )}
        </div>

        {/* ── Desktop nav ────────────────────────────────────────────── */}
        {!mobile && (
          <div style={{ display:'flex', gap:2, flex:1 }}>
            {items.map(item => {
              if (item.children) {
                // Group with dropdown
                const groupActive = isGroupActive(item)
                const isOpen      = openGroup === item.key
                return (
                  <div key={item.key} style={{ position:'relative' }}
                    onMouseEnter={() => setOpenGroup(item.key)}>
                    <button
                      style={{ background: groupActive || isOpen ? 'rgba(255,255,255,.12)' : 'transparent',
                        border: groupActive || isOpen ? '1px solid rgba(255,255,255,.2)' : '1px solid transparent',
                        color: groupActive || isOpen ? '#fff' : 'rgba(255,255,255,.6)',
                        padding:'6px 12px', borderRadius:8, cursor:'pointer',
                        fontFamily:'DM Sans,sans-serif', fontSize:12, fontWeight:500,
                        display:'flex', alignItems:'center', gap:5, whiteSpace:'nowrap' }}>
                      {item.icon} {item.label}
                      <span style={{ fontSize:9, opacity:.7, marginLeft:2 }}>▾</span>
                    </button>

                    {/* Dropdown panel */}
                    {isOpen && (
                      <div style={{ position:'absolute', top:'calc(100% + 6px)', left:0, background:'#fff',
                        borderRadius:12, boxShadow:'0 8px 32px rgba(0,0,0,.18)', padding:'8px', minWidth:240, zIndex:300 }}>
                        {item.children.map(child => {
                          const active = isPathActive(child.path)
                          return (
                            <button key={child.path} onClick={() => go(child.path)}
                              style={{ width:'100%', display:'flex', alignItems:'flex-start', gap:10,
                                padding:'10px 12px', borderRadius:8, border:'none', cursor:'pointer',
                                textAlign:'left', marginBottom:2,
                                background: active ? 'rgba(46,49,146,.08)' : 'transparent' }}>
                              <span style={{ fontSize:16, flexShrink:0, marginTop:1 }}>{child.icon}</span>
                              <div>
                                <div style={{ fontSize:13, fontWeight:700, color: active ? '#2E3192' : '#1a1c5e',
                                  fontFamily:'Montserrat,sans-serif', lineHeight:1.2, marginBottom:2 }}>
                                  {child.label}
                                </div>
                                {child.desc && (
                                  <div style={{ fontSize:11, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', lineHeight:1.3 }}>
                                    {child.desc}
                                  </div>
                                )}
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              }

              // Flat item
              const active = isPathActive(item.path)
              return (
                <button key={item.path} onClick={() => go(item.path)}
                  style={{ background: active ? 'rgba(255,255,255,.12)' : 'transparent',
                    border: active ? '1px solid rgba(255,255,255,.2)' : '1px solid transparent',
                    color: active ? '#fff' : 'rgba(255,255,255,.6)',
                    padding:'6px 12px', borderRadius:8, cursor:'pointer',
                    fontFamily:'DM Sans,sans-serif', fontSize:12, fontWeight:500,
                    display:'flex', alignItems:'center', gap:5, whiteSpace:'nowrap' }}>
                  {item.icon} {item.label}
                </button>
              )
            })}
          </div>
        )}

        {mobile && <div style={{ flex:1 }}/>}

        {/* ── Desktop right area ─────────────────────────────────────── */}
        {!mobile && (
          <div style={{ display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
            <UserChip/>
            {roleOptions?.length > 1 && (
              <select value={activeRole||''} onChange={e=>switchRole(e.target.value)}
                style={{ padding:'5px 8px', borderRadius:8, border:'1px solid rgba(255,255,255,.2)',
                  background:'rgba(255,255,255,.1)', color:'#fff', fontFamily:'Montserrat,sans-serif',
                  fontWeight:700, fontSize:11, cursor:'pointer', outline:'none' }}>
                {roleOptions.map(r=>(
                  <option key={r.role} value={r.role} style={{ color:'#1a1c5e', background:'#fff' }}>
                    {r.role==='SUPPLIER'?'🏭 Fornecedor':r.role==='BUYER'?'🏢 Comprador':r.role==='CLIENT'?'🏢 Cliente':'⚙️ Backoffice'}
                  </option>
                ))}
              </select>
            )}
            <button onClick={handleLogout}
              style={{ background:'rgba(255,255,255,.08)', border:'1px solid rgba(255,255,255,.15)',
                color:'rgba(255,255,255,.6)', borderRadius:8, padding:'5px 12px',
                fontSize:11, fontFamily:'DM Sans,sans-serif', cursor:'pointer' }}>
              Sair
            </button>
          </div>
        )}

        {/* ── Mobile hamburger ──────────────────────────────────────── */}
        {mobile && (
          <button onClick={() => setOpen(o => !o)}
            style={{ background:'rgba(255,255,255,.08)', border:'1px solid rgba(255,255,255,.15)',
              borderRadius:8, padding:'7px 10px', cursor:'pointer', color:'#fff', fontSize:18, lineHeight:1, flexShrink:0 }}>
            {open ? '✕' : '☰'}
          </button>
        )}
      </div>

      {/* ── Mobile drawer ──────────────────────────────────────────── */}
      {mobile && open && (
        <div style={{ background:'#1a1f6e', borderTop:'1px solid rgba(255,255,255,.1)', padding:'12px 16px 20px' }}>
          {/* User info */}
          <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 0 16px',
            borderBottom:'1px solid rgba(255,255,255,.1)', marginBottom:10 }}>
            <div style={{ width:36, height:36, borderRadius:10, background:'rgba(255,255,255,.12)',
              display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:800, fontSize:13, flexShrink:0 }}>
              {user.name?.slice(0,2).toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:'#fff', fontFamily:'Montserrat,sans-serif' }}>{user.name}</div>
              <div style={{ fontSize:11, color:ROLE_COLOR[user.role], fontFamily:'DM Sans,sans-serif' }}>{ROLE_LABEL[user.role]}</div>
            </div>
          </div>

          {/* Nav items — groups expand inline */}
          {items.map(item => {
            if (item.children) {
              const groupActive  = isGroupActive(item)
              const isExpanded   = mobileGroup === item.key
              return (
                <div key={item.key}>
                  <button onClick={() => setMobileGroup(isExpanded ? null : item.key)}
                    style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between',
                      padding:'12px 10px', borderRadius:10, border:'none', cursor:'pointer', marginBottom:2,
                      textAlign:'left', fontFamily:'DM Sans,sans-serif', fontSize:14, fontWeight:600,
                      background: groupActive ? 'rgba(255,255,255,.12)' : 'transparent',
                      color: groupActive ? '#fff' : 'rgba(255,255,255,.7)' }}>
                    <span style={{ display:'flex', alignItems:'center', gap:12 }}>
                      <span style={{ fontSize:18 }}>{item.icon}</span> {item.label}
                    </span>
                    <span style={{ fontSize:11, opacity:.6 }}>{isExpanded ? '▲' : '▾'}</span>
                  </button>
                  {isExpanded && (
                    <div style={{ paddingLeft:16, marginBottom:4 }}>
                      {item.children.map(child => {
                        const active = isPathActive(child.path)
                        return (
                          <button key={child.path} onClick={() => go(child.path)}
                            style={{ width:'100%', display:'flex', alignItems:'center', gap:10,
                              padding:'10px 10px', borderRadius:8, border:'none', cursor:'pointer',
                              marginBottom:2, textAlign:'left', fontFamily:'DM Sans,sans-serif', fontSize:13,
                              background: active ? 'rgba(255,255,255,.12)' : 'rgba(255,255,255,.04)',
                              color: active ? '#fff' : 'rgba(255,255,255,.65)' }}>
                            <span style={{ fontSize:15 }}>{child.icon}</span>
                            <div>
                              <div style={{ fontWeight:600, lineHeight:1.2 }}>{child.label}</div>
                              {child.desc && <div style={{ fontSize:11, opacity:.6, marginTop:1 }}>{child.desc}</div>}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            }
            const active = isPathActive(item.path)
            return (
              <button key={item.path} onClick={() => go(item.path)}
                style={{ width:'100%', display:'flex', alignItems:'center', gap:12, padding:'12px 10px',
                  borderRadius:10, border:'none', cursor:'pointer', marginBottom:4, textAlign:'left',
                  fontFamily:'DM Sans,sans-serif', fontSize:14, fontWeight:500,
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
                  style={{ width:'100%', padding:'10px', borderRadius:8, marginBottom:4,
                    border:`1px solid ${r.role===activeRole?'rgba(255,255,255,.3)':'rgba(255,255,255,.1)'}`,
                    background: r.role===activeRole?'rgba(255,255,255,.12)':'transparent',
                    color:'rgba(255,255,255,.8)', fontFamily:'DM Sans,sans-serif', fontSize:13, cursor:'pointer', textAlign:'left' }}>
                  {r.role==='SUPPLIER'?'🏭 Fornecedor':r.role==='BUYER'?'🏢 Comprador':r.role==='CLIENT'?'🏢 Cliente':'⚙️ Backoffice'}
                </button>
              ))}
            </div>
          )}

          <button onClick={handleLogout}
            style={{ width:'100%', marginTop:8, padding:'12px', borderRadius:10,
              background:'rgba(239,68,68,.15)', border:'1px solid rgba(239,68,68,.3)',
              color:'#fca5a5', fontFamily:'DM Sans,sans-serif', fontSize:14, cursor:'pointer' }}>
            Sair da conta
          </button>
        </div>
      )}
    </nav>
  )
}
