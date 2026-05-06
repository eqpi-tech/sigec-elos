// Gestão de Usuários — lista, bloqueia, desbloqueia, redefine senha, edita nome
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase.js'
import { Button, Card, Spinner, PageHeader, EmptyState } from '../../components/ui.jsx'

const ROLE_LABEL = { ADMIN:'Backoffice', BUYER:'Comprador', CLIENT:'Cliente', SUPPLIER:'Fornecedor' }
const ROLE_COLOR = { ADMIN:'#7c3aed',    BUYER:'#ea580c',   CLIENT:'#059669', SUPPLIER:'#2563eb' }

async function callManage(body) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch('/.netlify/functions/admin-manage-users', {
    method: 'POST',
    headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${session?.access_token}` },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Erro desconhecido')
  return data
}

export default function BackofficeUsers() {
  const [users,       setUsers]       = useState([])
  const [loading,     setLoading]     = useState(true)
  const [filterRole,  setFilterRole]  = useState('Todos')
  const [filterStatus,setFilterStatus]= useState('Todos')   // Todos | Ativo | Bloqueado
  const [search,      setSearch]      = useState('')
  const [acting,      setActing]      = useState({})         // { [userId]: string }
  const [editModal,   setEditModal]   = useState(null)       // { userId, currentName }
  const [editName,    setEditName]    = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { users: list } = await callManage({ action: 'list' })
      setUsers(list || [])
    } catch(e) { console.error(e) }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const act = async (userId, action, params = {}) => {
    setActing(prev => ({ ...prev, [userId]: action }))
    try {
      await callManage({ action, userId, ...params })
      await load()
    } catch(e) { alert('Erro: ' + e.message) }
    setActing(prev => { const n = {...prev}; delete n[userId]; return n })
  }

  const handleEditSave = async () => {
    if (!editName.trim()) return
    await act(editModal.userId, 'update', { name: editName.trim() })
    setEditModal(null)
    setEditName('')
  }

  const filtered = users.filter(u => {
    if (filterRole !== 'Todos' && u.primaryRole !== filterRole) return false
    if (filterStatus === 'Ativo'     && u.banned)  return false
    if (filterStatus === 'Bloqueado' && !u.banned) return false
    if (search) {
      const q = search.toLowerCase()
      if (!u.email?.toLowerCase().includes(q) && !u.name?.toLowerCase().includes(q)) return false
    }
    return true
  })

  if (loading) return <div style={{ display:'flex',justifyContent:'center',alignItems:'center',height:'50vh' }}><Spinner size={48}/></div>

  return (
    <div style={{ padding:'28px 32px', maxWidth:1100, margin:'0 auto' }}>
      <PageHeader
        title="Gestão de Usuários"
        subtitle={`${users.length} usuário${users.length!==1?'s':''} cadastrado${users.length!==1?'s':''} na plataforma`}
      />

      {/* KPIs rápidos */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:24 }}>
        {['ADMIN','BUYER','CLIENT','SUPPLIER'].map(role => {
          const count = users.filter(u => u.primaryRole === role).length
          const color = ROLE_COLOR[role]
          return (
            <div key={role} style={{ background:`${color}08`, border:`1px solid ${color}22`, borderRadius:12, padding:'14px 18px' }}>
              <div style={{ fontSize:24, fontWeight:800, color, fontFamily:'Montserrat,sans-serif' }}>{count}</div>
              <div style={{ fontSize:12, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>{ROLE_LABEL[role]}</div>
            </div>
          )
        })}
      </div>

      {/* Filtros */}
      <div style={{ display:'flex', gap:12, marginBottom:20, flexWrap:'wrap' }}>
        <input value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="🔍  Buscar por nome ou e-mail..."
          style={{ flex:1, minWidth:220, padding:'10px 14px', borderRadius:10, border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:14, outline:'none' }}/>
        <div style={{ display:'flex', gap:6 }}>
          {['Todos','ADMIN','BUYER','CLIENT','SUPPLIER'].map(r => (
            <button key={r} onClick={()=>setFilterRole(r)}
              style={{ padding:'8px 12px', borderRadius:20, border:`1px solid ${filterRole===r?ROLE_COLOR[r]||'#2E3192':'#e2e4ef'}`, background:filterRole===r?`${ROLE_COLOR[r]||'#2E3192'}12`:'#fff', color:filterRole===r?ROLE_COLOR[r]||'#2E3192':'#9B9B9B', fontFamily:'DM Sans,sans-serif', fontSize:12, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap' }}>
              {r==='Todos'?'Todos':ROLE_LABEL[r]}
            </button>
          ))}
        </div>
        <div style={{ display:'flex', gap:6 }}>
          {['Todos','Ativo','Bloqueado'].map(s => (
            <button key={s} onClick={()=>setFilterStatus(s)}
              style={{ padding:'8px 12px', borderRadius:20, border:`1px solid ${filterStatus===s?'#2E3192':'#e2e4ef'}`, background:filterStatus===s?'#2E3192':'#fff', color:filterStatus===s?'#fff':'#9B9B9B', fontFamily:'DM Sans,sans-serif', fontSize:12, fontWeight:600, cursor:'pointer' }}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon="👤" title="Nenhum usuário encontrado" subtitle="Tente ajustar os filtros"/>
      ) : (
        <>
          <div style={{ fontSize:12, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', marginBottom:10 }}>
            {filtered.length} usuário{filtered.length!==1?'s':''} encontrado{filtered.length!==1?'s':''}
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {filtered.map(u => {
              const isActing  = !!acting[u.id]
              const roleColor = ROLE_COLOR[u.primaryRole] || '#9B9B9B'
              return (
                <Card key={u.id} style={{ borderRadius:14, padding:'16px 20px', opacity: u.banned ? 0.75 : 1 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:16 }}>
                    {/* Avatar */}
                    <div style={{ width:44, height:44, borderRadius:10, background:`${roleColor}18`, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:17, color:roleColor, flexShrink:0 }}>
                      {u.name?.[0]?.toUpperCase() || u.email?.[0]?.toUpperCase() || '?'}
                    </div>

                    {/* Info */}
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:3 }}>
                        <span style={{ fontSize:14, fontWeight:700, color:'#1a1c5e', fontFamily:'Montserrat,sans-serif' }}>{u.name}</span>
                        <span style={{ fontSize:10, fontWeight:700, color:roleColor, background:`${roleColor}18`, padding:'2px 8px', borderRadius:20 }}>
                          {ROLE_LABEL[u.primaryRole] || u.primaryRole}
                        </span>
                        {u.banned && (
                          <span style={{ fontSize:10, fontWeight:700, color:'#dc2626', background:'rgba(239,68,68,.1)', padding:'2px 8px', borderRadius:20 }}>BLOQUEADO</span>
                        )}
                      </div>
                      <div style={{ fontSize:12, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>
                        {u.email}
                        {u.lastSignIn ? ` · Último acesso: ${new Date(u.lastSignIn).toLocaleDateString('pt-BR')}` : ' · Nunca acessou'}
                        {u.createdAt ? ` · Cadastrado: ${new Date(u.createdAt).toLocaleDateString('pt-BR')}` : ''}
                      </div>
                    </div>

                    {/* Ações */}
                    <div style={{ display:'flex', gap:6, flexShrink:0, flexWrap:'wrap', justifyContent:'flex-end' }}>
                      <Button variant="neutral" size="sm"
                        disabled={isActing}
                        onClick={() => { setEditModal({ userId: u.id, currentName: u.name }); setEditName(u.name || '') }}>
                        ✏ Editar
                      </Button>
                      <Button variant="neutral" size="sm"
                        disabled={isActing}
                        onClick={() => { if (confirm(`Enviar e-mail de redefinição de senha para ${u.email}?`)) act(u.id, 'reset-password') }}>
                        {acting[u.id]==='reset-password' ? '⏳...' : '🔑 Reset Senha'}
                      </Button>
                      {u.banned ? (
                        <Button variant="success" size="sm" disabled={isActing} onClick={() => act(u.id, 'unblock')}>
                          {acting[u.id]==='unblock' ? '⏳...' : '↺ Desbloquear'}
                        </Button>
                      ) : (
                        <Button variant="danger" size="sm" disabled={isActing}
                          onClick={() => { if (confirm(`Bloquear acesso de ${u.name || u.email}?`)) act(u.id, 'block') }}>
                          {acting[u.id]==='block' ? '⏳...' : 'Bloquear'}
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        </>
      )}

      {/* Modal editar nome */}
      {editModal && (
        <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.5)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center' }}>
          <div style={{ background:'#fff',borderRadius:16,padding:32,maxWidth:400,width:'90%',boxShadow:'0 20px 60px rgba(0,0,0,.2)' }}>
            <div style={{ fontFamily:'Montserrat,sans-serif',fontWeight:800,fontSize:18,color:'#1a1c5e',marginBottom:16 }}>✏ Editar Nome</div>
            <input value={editName} onChange={e=>setEditName(e.target.value)}
              placeholder="Nome do usuário"
              style={{ width:'100%',padding:'10px 12px',borderRadius:10,border:'1px solid #e2e4ef',fontFamily:'DM Sans,sans-serif',fontSize:14,boxSizing:'border-box',marginBottom:16 }}/>
            <div style={{ display:'flex',gap:8 }}>
              <Button variant="neutral" full onClick={()=>setEditModal(null)}>Cancelar</Button>
              <Button variant="primary" full disabled={!editName.trim()} onClick={handleEditSave}>Salvar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
