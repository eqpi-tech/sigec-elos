import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext.jsx'
import { supabase } from '../../lib/supabase.js'
import { Card, Spinner, Button, SectionTitle, PageHeader } from '../../components/ui.jsx'

const BLOCKED_DOMAINS = [
  'gmail.com','googlemail.com','hotmail.com','hotmail.com.br','outlook.com','outlook.com.br',
  'yahoo.com','yahoo.com.br','icloud.com','me.com','mac.com','live.com','live.com.br',
  'msn.com','bol.com.br','uol.com.br','terra.com.br','ig.com.br','globo.com',
  'protonmail.com','proton.me','tutanota.com','yandex.com','aol.com',
]

function isPersonalEmail(email) {
  const domain = (email || '').split('@')[1]?.toLowerCase()
  return !domain || BLOCKED_DOMAINS.includes(domain)
}

export default function SupplierTeam() {
  const { user } = useAuth()

  const [members,    setMembers]    = useState([])
  const [loading,    setLoading]    = useState(true)
  const [inviteEmail,setInviteEmail]= useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviting,   setInviting]   = useState(false)
  const [error,      setError]      = useState('')
  const [success,    setSuccess]    = useState('')
  const [togglingId, setTogglingId] = useState(null)

  const isMaster  = user?.isPrimary !== false  // fallback: first user is master
  const supplierId = user?.supplierId

  useEffect(() => {
    if (!supplierId) return
    loadMembers()
  }, [supplierId])

  async function loadMembers() {
    setLoading(true)
    const { data } = await supabase
      .from('user_roles')
      .select('id, user_id, is_primary, is_active, invited_by, created_at')
      .eq('supplier_id', supplierId)
      .eq('role', 'SUPPLIER')
      .order('created_at')
    setMembers(data || [])
    setLoading(false)
  }

  async function handleInvite() {
    setError(''); setSuccess('')
    if (!inviteEmail.trim() || !inviteName.trim()) { setError('Preencha nome e e-mail.'); return }
    if (isPersonalEmail(inviteEmail)) { setError('E-mails de domínios pessoais não são permitidos. Use um e-mail corporativo.'); return }
    const activeCount = members.filter(m => m.is_active).length
    if (activeCount >= 4) { setError('Limite de 4 usuários atingido. Desative um membro antes de convidar outro.'); return }

    setInviting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/.netlify/functions/invite-supplier-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ email: inviteEmail.trim(), name: inviteName.trim(), supplierId }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error)
      setSuccess(`Convite enviado para ${inviteEmail}! ${result.isNewUser ? 'Um e-mail com as credenciais foi enviado.' : 'O usuário já tinha conta e foi vinculado.'}`)
      setInviteEmail(''); setInviteName('')
      await loadMembers()
    } catch (e) {
      setError(e.message)
    } finally {
      setInviting(false)
    }
  }

  async function toggleActive(member) {
    if (member.is_primary) return
    setTogglingId(member.id)
    await supabase.from('user_roles')
      .update({ is_active: !member.is_active })
      .eq('id', member.id)
    setMembers(prev => prev.map(m => m.id === member.id ? { ...m, is_active: !m.is_active } : m))
    setTogglingId(null)
  }

  const activeCount = members.filter(m => m.is_active).length
  const inp = { width:'100%', padding:'10px 12px', borderRadius:10, border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:13, boxSizing:'border-box', outline:'none' }
  const lbl = { display:'block', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:10, color:'#9B9B9B', letterSpacing:.5, textTransform:'uppercase', marginBottom:5 }

  return (
    <div style={{ padding:'24px 32px', maxWidth:720, margin:'0 auto' }}>
      <PageHeader title="Equipe" subtitle="Gerencie os usuários com acesso à conta da empresa"/>

      {/* Resumo */}
      <div style={{ display:'flex', gap:12, marginBottom:20 }}>
        {[
          [`${activeCount}/4`, 'Usuários ativos', '#2E3192'],
          [`${4 - activeCount}`, 'Vagas disponíveis', activeCount < 4 ? '#22c55e' : '#9B9B9B'],
        ].map(([v, l, c]) => (
          <div key={l} style={{ flex:1, textAlign:'center', padding:'14px', background:`${c}0d`, borderRadius:12, border:`1px solid ${c}22` }}>
            <div style={{ fontSize:22, fontWeight:900, color:c, fontFamily:'Montserrat,sans-serif' }}>{v}</div>
            <div style={{ fontSize:11, color:'#64748b', fontFamily:'DM Sans,sans-serif', marginTop:2 }}>{l}</div>
          </div>
        ))}
      </div>

      {/* Lista de membros */}
      <Card style={{ borderRadius:14, padding:'20px 24px', marginBottom:20 }}>
        <SectionTitle>Membros atuais</SectionTitle>
        {loading ? (
          <div style={{ display:'flex', justifyContent:'center', padding:24 }}><Spinner size={28}/></div>
        ) : members.length === 0 ? (
          <div style={{ color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', fontSize:13, textAlign:'center', padding:16 }}>Nenhum membro encontrado.</div>
        ) : (
          members.map(m => (
            <div key={m.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', borderRadius:10, background:'#fafbff', border:'1px solid #e2e4ef', marginBottom:8 }}>
              <div style={{ width:36, height:36, borderRadius:10, background: m.is_primary ? 'rgba(46,49,146,.12)' : 'rgba(100,116,139,.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0 }}>
                {m.is_primary ? '👑' : '👤'}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, fontWeight:600, color:'#1a1c5e' }}>
                  {m.is_primary ? 'Usuário Master' : 'Usuário Adicional'}
                  {!m.is_active && <span style={{ fontSize:10, color:'#9B9B9B', marginLeft:8, fontFamily:'DM Sans,sans-serif' }}>(inativo)</span>}
                </div>
                <div style={{ fontSize:11, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>
                  Adicionado em {m.created_at?.slice(0,10) || '—'}
                </div>
              </div>
              {!m.is_primary && isMaster && (
                togglingId === m.id ? <Spinner size={16}/> : (
                  <Button variant={m.is_active ? 'neutral' : 'success'} size="sm"
                    onClick={() => toggleActive(m)}>
                    {m.is_active ? 'Desativar' : 'Reativar'}
                  </Button>
                )
              )}
              {m.is_primary && (
                <span style={{ fontSize:10, fontWeight:700, color:'#2E3192', background:'rgba(46,49,146,.08)', padding:'2px 10px', borderRadius:20, fontFamily:'Montserrat,sans-serif' }}>
                  Master
                </span>
              )}
            </div>
          ))
        )}
      </Card>

      {/* Convidar novo membro */}
      {isMaster && activeCount < 4 && (
        <Card style={{ borderRadius:14, padding:'20px 24px' }}>
          <SectionTitle>Convidar membro adicional</SectionTitle>
          <div style={{ marginBottom:12 }}>
            <span style={lbl}>Nome completo</span>
            <input value={inviteName} onChange={e => setInviteName(e.target.value)} placeholder="Maria da Silva" style={inp}/>
          </div>
          <div style={{ marginBottom:12 }}>
            <span style={lbl}>E-mail corporativo</span>
            <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="maria@empresa.com.br" style={inp}/>
            <div style={{ fontSize:11, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', marginTop:4 }}>
              E-mails pessoais (Gmail, Hotmail, etc.) não são aceitos.
            </div>
          </div>
          {error   && <div style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:10, padding:'10px 14px', marginBottom:12, fontSize:13, color:'#dc2626', fontFamily:'DM Sans,sans-serif' }}>{error}</div>}
          {success && <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:10, padding:'10px 14px', marginBottom:12, fontSize:13, color:'#15803d', fontFamily:'DM Sans,sans-serif' }}>{success}</div>}
          <Button variant="primary" full disabled={inviting || !inviteEmail || !inviteName} onClick={handleInvite}>
            {inviting ? <><Spinner size={14}/> Enviando convite...</> : '📧 Enviar convite'}
          </Button>
        </Card>
      )}

      {isMaster && activeCount >= 4 && (
        <div style={{ background:'rgba(245,158,11,.06)', border:'1px solid rgba(245,158,11,.2)', borderRadius:12, padding:'14px 18px', fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#92400e', textAlign:'center' }}>
          ⚠ Limite de 4 usuários atingido. Desative um membro para liberar uma vaga.
        </div>
      )}

      {!isMaster && (
        <div style={{ background:'rgba(46,49,146,.04)', border:'1px solid rgba(46,49,146,.12)', borderRadius:12, padding:'14px 18px', fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#64748b', textAlign:'center' }}>
          Apenas o usuário master pode convidar ou gerenciar membros.
        </div>
      )}
    </div>
  )
}
