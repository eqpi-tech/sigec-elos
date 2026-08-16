// Equipe do Cliente — gestão de usuários da empresa contratante.
// Sem limite de usuários (diferente do fornecedor, limitado a 4).
// Cada usuário vincula-se a um Perfil de Usuário (módulos, patch_038).
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext.jsx'
import { supabase } from '../../lib/supabase.js'
import { Button, Card, Spinner, PageHeader, EmptyState } from '../../components/ui.jsx'

export default function ClientTeam() {
  const { user } = useAuth()
  const [members,  setMembers]  = useState(null)
  const [profiles, setProfiles] = useState([])
  const [modal,    setModal]    = useState(null)  // { name, email, accessProfileId }
  const [sending,  setSending]  = useState(false)
  const [toast,    setToast]    = useState(null)
  const [error,    setError]    = useState('')

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 4000) }

  const load = useCallback(async () => {
    if (!user?.clientId) return
    const [{ data: roles }, { data: aps }] = await Promise.all([
      supabase.from('user_roles')
        .select('id, user_id, is_primary, is_active, access_profile_id, created_at')
        .eq('client_id', user.clientId).eq('role', 'CLIENT'),
      supabase.from('access_profiles').select('id, name, is_system').eq('role_type', 'CLIENT').order('is_system', { ascending: false }).order('name'),
    ])
    setProfiles(aps || [])
    // Nomes via profiles
    const ids = (roles || []).map(r => r.user_id)
    let names = {}
    if (ids.length) {
      const { data: ps } = await supabase.from('profiles').select('id, name').in('id', ids)
      ;(ps || []).forEach(p => { names[p.id] = p.name })
    }
    const apName = {}
    ;(aps || []).forEach(a => { apName[a.id] = a.name })
    setMembers((roles || []).map(r => ({
      ...r,
      name: names[r.user_id] || '—',
      profileName: r.access_profile_id ? (apName[r.access_profile_id] || 'Perfil') : 'Acesso Total',
    })).sort((a, b) => (b.is_primary === true) - (a.is_primary === true)))
  }, [user?.clientId])

  useEffect(() => { load() }, [load])

  const invite = async () => {
    if (!modal?.name?.trim() || !modal?.email?.trim()) return
    setSending(true); setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/.netlify/functions/invite-client-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ name: modal.name.trim(), email: modal.email.trim(), accessProfileId: modal.accessProfileId || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao convidar')
      setModal(null)
      showToast('✅ Usuário convidado! As credenciais foram enviadas por e-mail.')
      await load()
    } catch (e) { setError(e.message) }
    finally { setSending(false) }
  }

  const setProfile = async (member, profileId) => {
    const { error: err } = await supabase.from('user_roles')
      .update({ access_profile_id: profileId }).eq('id', member.id)
    if (err) { showToast('Erro: ' + err.message, 'error'); return }
    setMembers(prev => prev.map(m => m.id === member.id
      ? { ...m, access_profile_id: profileId, profileName: profiles.find(p => p.id === profileId)?.name || 'Perfil' } : m))
    showToast('Perfil atualizado.')
  }

  const toggleActive = async (member) => {
    if (member.is_primary) { showToast('O usuário principal não pode ser desativado.', 'error'); return }
    const next = member.is_active === false
    const { error: err } = await supabase.from('user_roles').update({ is_active: next }).eq('id', member.id)
    if (err) { showToast('Erro: ' + err.message, 'error'); return }
    setMembers(prev => prev.map(m => m.id === member.id ? { ...m, is_active: next } : m))
  }

  if (members === null) return <div style={{ display:'flex', justifyContent:'center', alignItems:'center', height:'50vh' }}><Spinner size={48}/></div>

  const inp = { width:'100%', padding:'10px 12px', borderRadius:10, border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:14, boxSizing:'border-box' }
  const lbl = { display:'block', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:10, color:'#9B9B9B', letterSpacing:.5, textTransform:'uppercase', marginBottom:5 }

  return (
    <div style={{ padding:'28px 32px', maxWidth:860, margin:'0 auto' }}>
      {toast && (
        <div style={{ position:'fixed', top:80, right:24, background:toast.type==='error'?'#ef4444':'#22c55e', color:'#fff', padding:'12px 20px', borderRadius:12, zIndex:9999, fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, boxShadow:'0 8px 24px rgba(0,0,0,.2)', maxWidth:360 }}>
          {toast.msg}
        </div>
      )}

      <PageHeader
        title="Equipe"
        subtitle={`${members.length} usuário${members.length !== 1 ? 's' : ''} da sua empresa · sem limite de usuários`}
        action={{ label:'+ Convidar Usuário', onClick: () => { setError(''); setModal({ name:'', email:'', accessProfileId: profiles.find(p => p.is_system)?.id || '' }) } }}
      />

      {members.length === 0 ? (
        <EmptyState icon="👥" title="Nenhum usuário" subtitle="Convide os usuários da sua empresa"/>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {members.map(m => (
            <Card key={m.id} style={{ borderRadius:12, padding:'14px 18px', opacity: m.is_active === false ? 0.6 : 1 }}>
              <div style={{ display:'flex', alignItems:'center', gap:14, flexWrap:'wrap' }}>
                <div style={{ width:42, height:42, borderRadius:10, background:'rgba(5,150,105,.12)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:16, color:'#059669', flexShrink:0 }}>
                  {m.name?.[0]?.toUpperCase() || '?'}
                </div>
                <div style={{ flex:1, minWidth:180 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                    <span style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:14, color:'#1a1c5e' }}>{m.name}</span>
                    {m.is_primary && (
                      <span style={{ fontSize:10, fontWeight:700, color:'#F47E2F', background:'rgba(244,126,47,.12)', padding:'2px 8px', borderRadius:20, fontFamily:'Montserrat,sans-serif' }}>PRINCIPAL</span>
                    )}
                    {m.is_active === false && (
                      <span style={{ fontSize:10, fontWeight:700, color:'#dc2626', background:'rgba(239,68,68,.1)', padding:'2px 8px', borderRadius:20, fontFamily:'Montserrat,sans-serif' }}>INATIVO</span>
                    )}
                  </div>
                  <div style={{ fontSize:11.5, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', marginTop:2 }}>
                    Desde {m.created_at ? new Date(m.created_at).toLocaleDateString('pt-BR') : '—'}
                  </div>
                </div>

                {/* Perfil de módulos */}
                <div style={{ minWidth:180 }}>
                  <select value={m.access_profile_id || ''} onChange={e => setProfile(m, e.target.value || null)}
                    style={{ ...inp, padding:'8px 10px', fontSize:13 }}>
                    {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>

                {!m.is_primary && (
                  <Button variant={m.is_active === false ? 'success' : 'danger'} size="sm" onClick={() => toggleActive(m)}>
                    {m.is_active === false ? '↺ Reativar' : 'Desativar'}
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Modal convite */}
      {modal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'#fff', borderRadius:16, padding:'28px 32px', maxWidth:440, width:'100%', boxShadow:'0 20px 60px rgba(0,0,0,.2)' }}>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:17, color:'#1a1c5e', marginBottom:4 }}>
              + Convidar Usuário
            </div>
            <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:12.5, color:'#9B9B9B', marginBottom:18 }}>
              O usuário receberá as credenciais por e-mail e verá apenas os módulos do perfil escolhido.
            </div>

            <div style={{ marginBottom:12 }}>
              <span style={lbl}>Nome *</span>
              <input value={modal.name} onChange={e => setModal(m => ({ ...m, name: e.target.value }))} placeholder="Maria Souza" style={inp}/>
            </div>
            <div style={{ marginBottom:12 }}>
              <span style={lbl}>E-mail corporativo *</span>
              <input type="email" value={modal.email} onChange={e => setModal(m => ({ ...m, email: e.target.value }))} placeholder="maria@suaempresa.com.br" style={inp}/>
            </div>
            <div style={{ marginBottom:16 }}>
              <span style={lbl}>Perfil de acesso *</span>
              <select value={modal.accessProfileId} onChange={e => setModal(m => ({ ...m, accessProfileId: e.target.value }))} style={inp}>
                {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            {error && (
              <div style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:10, padding:'9px 12px', marginBottom:14, fontSize:12.5, color:'#dc2626', fontFamily:'DM Sans,sans-serif' }}>
                {error}
              </div>
            )}

            <div style={{ display:'flex', gap:8 }}>
              <Button variant="neutral" full onClick={() => setModal(null)}>Cancelar</Button>
              <Button variant="primary" full disabled={sending || !modal.name?.trim() || !modal.email?.trim()} onClick={invite}>
                {sending ? <Spinner size={14}/> : '📨 Convidar'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
