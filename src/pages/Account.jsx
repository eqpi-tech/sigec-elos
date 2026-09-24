// Minha Conta — aberta pelo avatar do Navbar (21/09). Qualquer papel.
// Edita: nome, telefone (base do MFA que vem em breve) e senha.
// SOMENTE LEITURA: e-mail (identidade do login) e perfil de acesso/papel
// (perfil só muda pelo backoffice — o usuário nunca altera o próprio).
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../context/AuthContext.jsx'
import { Card, Button, PageHeader, SectionTitle, Spinner } from '../components/ui.jsx'

const ROLE_LABEL = { SUPPLIER: 'Fornecedor', BUYER: 'Comprador', CLIENT: 'Cliente', ADMIN: 'Backoffice' }

const lbl = { display: 'block', fontSize: 12, fontWeight: 600, color: '#9B9B9B', marginBottom: 4, fontFamily: 'DM Sans,sans-serif' }
const inp = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e2e4ef', fontFamily: 'DM Sans,sans-serif', fontSize: 14, boxSizing: 'border-box' }
const ro  = { ...inp, background: '#f8f9fc', color: '#6b7280', cursor: 'not-allowed' }

const fmtPhone = (v) => {
  const d = String(v || '').replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

export default function Account() {
  const { user } = useAuth()
  const [name, setName]   = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [profileName, setProfileName] = useState(null)
  const [loading, setLoading] = useState(true)
  const [savingData, setSavingData] = useState(false)
  const [msgData, setMsgData] = useState(null)     // { ok, texto }
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [savingPw, setSavingPw] = useState(false)
  const [msgPw, setMsgPw] = useState(null)

  useEffect(() => {
    (async () => {
      const { data: { user: au } } = await supabase.auth.getUser()
      setEmail(au?.email || '')
      const { data: p } = await supabase.from('profiles').select('name, phone').eq('id', au?.id).maybeSingle()
      setName(p?.name || au?.user_metadata?.name || '')
      setPhone(fmtPhone(p?.phone || ''))
      // perfil de acesso vigente (exibição): vínculo do papel ativo
      const { data: r } = await supabase.from('user_roles')
        .select('access_profile_id, access_profiles(name)')
        .eq('user_id', au?.id).eq('role', user?.role).limit(1).maybeSingle()
      setProfileName(r?.access_profiles?.name || 'Acesso Total')
      setLoading(false)
    })()
  }, [user?.role])

  const saveData = async () => {
    if (!name.trim()) { setMsgData({ ok: false, texto: 'Informe o nome.' }); return }
    setSavingData(true); setMsgData(null)
    try {
      const digits = phone.replace(/\D/g, '')
      const { error } = await supabase.from('profiles')
        .update({ name: name.trim(), phone: digits || null })
        .eq('id', user.id)
      if (error) throw error
      await supabase.auth.updateUser({ data: { name: name.trim() } }).catch(() => {})
      setMsgData({ ok: true, texto: 'Dados atualizados. O nome novo aparece no próximo carregamento.' })
    } catch (e) { setMsgData({ ok: false, texto: e.message }) }
    setSavingData(false)
  }

  const savePassword = async () => {
    if (pw1.length < 8) { setMsgPw({ ok: false, texto: 'A senha precisa de pelo menos 8 caracteres.' }); return }
    if (pw1 !== pw2) { setMsgPw({ ok: false, texto: 'As senhas não conferem.' }); return }
    setSavingPw(true); setMsgPw(null)
    try {
      const { error } = await supabase.auth.updateUser({ password: pw1 })
      if (error) throw error
      setPw1(''); setPw2('')
      setMsgPw({ ok: true, texto: 'Senha alterada com sucesso.' })
    } catch (e) { setMsgPw({ ok: false, texto: e.message }) }
    setSavingPw(false)
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}><Spinner size={40} /></div>

  const Msg = ({ m }) => m && (
    <div style={{ marginTop: 10, padding: '9px 13px', borderRadius: 10, fontSize: 13, fontFamily: 'DM Sans,sans-serif',
      background: m.ok ? 'rgba(34,197,94,.08)' : '#fee2e2', border: `1px solid ${m.ok ? '#86efac' : '#fca5a5'}`,
      color: m.ok ? '#15803d' : '#dc2626' }}>{m.texto}</div>
  )

  return (
    <div style={{ padding: '28px 32px', maxWidth: 620, margin: '0 auto' }}>
      <PageHeader title="Minha Conta" subtitle="Seus dados de acesso à plataforma" />

      <Card style={{ borderRadius: 16, padding: '24px 28px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: 'rgba(46,49,146,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2E3192', fontWeight: 800, fontSize: 20, fontFamily: 'Montserrat,sans-serif' }}>
            {(name || email).slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: 16, color: '#1a1c5e' }}>{name || '—'}</div>
            <div style={{ fontSize: 12, color: '#9B9B9B', fontFamily: 'DM Sans,sans-serif' }}>
              {ROLE_LABEL[user?.role] || user?.role} · Perfil: {profileName}
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>Nome</label>
          <input value={name} onChange={(e) => setName(e.target.value)} style={inp} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>E-mail (identidade do login — não editável)</label>
          <input value={email} readOnly style={ro} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>Telefone celular</label>
          <input value={phone} onChange={(e) => setPhone(fmtPhone(e.target.value))} placeholder="(00) 00000-0000" style={inp} />
          <div style={{ fontSize: 11, color: '#9B9B9B', fontFamily: 'DM Sans,sans-serif', marginTop: 4 }}>
            📱 Em breve: verificação em duas etapas (MFA) usando este número.
          </div>
        </div>
        <Button variant="primary" disabled={savingData} onClick={saveData}>
          {savingData ? 'Salvando…' : 'Salvar dados'}
        </Button>
        <Msg m={msgData} />
      </Card>

      <Card style={{ borderRadius: 16, padding: '24px 28px' }}>
        <SectionTitle>Alterar senha</SectionTitle>
        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>Nova senha (mínimo 8 caracteres)</label>
          <input type="password" value={pw1} onChange={(e) => setPw1(e.target.value)} autoComplete="new-password" style={inp} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>Confirmar nova senha</label>
          <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" style={inp} />
        </div>
        <Button variant="primary" disabled={savingPw || !pw1} onClick={savePassword}>
          {savingPw ? 'Alterando…' : 'Alterar senha'}
        </Button>
        <Msg m={msgPw} />
      </Card>

      <Card style={{ borderRadius: 16, padding: '24px 28px', marginTop: 20 }}>
        <SectionTitle>Verificação em duas etapas</SectionTitle>
        <div style={{ fontFamily: 'DM Sans,sans-serif', fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>
          <span style={{ color: '#15803d', fontWeight: 700 }}>✓ Ativa</span> — sua conta é protegida por um
          aplicativo autenticador, obrigatório em toda a plataforma.
          <br />Trocou de celular ou perdeu o acesso ao aplicativo? Fale com o suporte para resetar —
          você cadastra o novo aparelho no próximo login.
        </div>
      </Card>
    </div>
  )
}
