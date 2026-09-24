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

      <MfaSection />
    </div>
  )
}

// ── Verificação em duas etapas: status + ativar agora + trocar aparelho ──
// Trocar aparelho: matricula um fator NOVO (nome único — Supabase exige
// friendly_name distinto por usuário), confirma o código e só então remove
// os fatores antigos. A sessão já está em AAL2 (passou no desafio do login).
function MfaSection() {
  const [factors, setFactors] = useState(null)   // fatores TOTP verificados
  const [enroll, setEnroll]   = useState(null)   // { id, qr, secret, swapping }
  const [code, setCode]       = useState('')
  const [busy, setBusy]       = useState(false)
  const [msg, setMsg]         = useState(null)   // { ok, text }

  const load = async () => {
    const { data } = await supabase.auth.mfa.listFactors()
    setFactors(data?.totp || [])
  }
  useEffect(() => { load() }, [])

  async function startEnroll(swapping) {
    setBusy(true); setMsg(null)
    try {
      const { data: f } = await supabase.auth.mfa.listFactors()
      for (const old of (f?.all || []).filter(x => x.factor_type === 'totp' && x.status !== 'verified')) {
        await supabase.auth.mfa.unenroll({ factorId: old.id }).catch(() => {})
      }
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: swapping ? `SIGEC-ELOS ${new Date().toISOString().slice(0, 16)}` : 'SIGEC-ELOS',
      })
      if (error) throw error
      setEnroll({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret, swapping })
      setCode('')
    } catch (e) { setMsg({ ok: false, text: e.message }) }
    finally { setBusy(false) }
  }

  async function confirm() {
    if (code.trim().length < 6) return
    setBusy(true); setMsg(null)
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enroll.id, code: code.trim() })
      if (error) throw error
      if (enroll.swapping) {
        // novo aparelho confirmado — remove os fatores anteriores
        const { data: f } = await supabase.auth.mfa.listFactors()
        for (const old of (f?.totp || []).filter(x => x.id !== enroll.id)) {
          await supabase.auth.mfa.unenroll({ factorId: old.id }).catch(() => {})
        }
      }
      setEnroll(null); setCode('')
      setMsg({ ok: true, text: enroll.swapping ? 'Aparelho trocado com sucesso!' : 'Verificação ativada!' })
      await load()
    } catch (e) { setMsg({ ok: false, text: 'Código inválido ou expirado — confira o app e tente de novo.' }) }
    finally { setBusy(false) }
  }

  const active = (factors || []).length > 0

  return (
    <Card style={{ borderRadius: 16, padding: '24px 28px', marginTop: 20 }}>
      <SectionTitle>Verificação em duas etapas</SectionTitle>
      {factors === null ? <Spinner size={20}/> : !enroll ? (
        <>
          <div style={{ fontFamily: 'DM Sans,sans-serif', fontSize: 13, color: '#64748b', lineHeight: 1.6, marginBottom: 14 }}>
            {active ? (
              <><span style={{ color: '#15803d', fontWeight: 700 }}>✓ Ativa</span> — sua conta é protegida por um aplicativo autenticador.</>
            ) : (
              <><span style={{ color: '#b45309', fontWeight: 700 }}>Ainda não ativada</span> — a plataforma vai exigir a verificação
              em duas etapas para todos os acessos. Ative agora e evite o aviso na entrada.</>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {active
              ? <Button variant="neutral" size="sm" disabled={busy} onClick={() => startEnroll(true)}>🔄 Trocar de aparelho</Button>
              : <Button variant="orange" size="sm" disabled={busy} onClick={() => startEnroll(false)}>Ativar verificação →</Button>
            }
          </div>
          {active && (
            <div style={{ fontFamily: 'DM Sans,sans-serif', fontSize: 11.5, color: '#9B9B9B', marginTop: 10 }}>
              Perdeu o acesso ao aplicativo antigo e não consegue entrar? Peça ao suporte para resetar.
            </div>
          )}
        </>
      ) : (
        <>
          <div style={{ fontFamily: 'DM Sans,sans-serif', fontSize: 13, color: '#64748b', marginBottom: 12 }}>
            Escaneie o QR code com o aplicativo autenticador {enroll.swapping ? 'do NOVO aparelho' : ''} e digite o código de 6 dígitos.
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
            <img src={enroll.qr} alt="QR code do autenticador" style={{ width: 170, height: 170, border: '1px solid #e2e4ef', borderRadius: 12, background: '#fff' }}/>
          </div>
          <div style={{ fontFamily: 'DM Sans,sans-serif', fontSize: 11, color: '#9B9B9B', textAlign: 'center', marginBottom: 12, wordBreak: 'break-all' }}>
            Sem câmera? Insira manualmente: <b>{enroll.secret}</b>
          </div>
          <input autoFocus value={code} maxLength={6} inputMode="numeric"
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => { if (e.key === 'Enter') confirm() }}
            placeholder="000000"
            style={{ ...inp, fontSize: 20, letterSpacing: 6, textAlign: 'center', maxWidth: 220, display: 'block', margin: '0 auto' }}/>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 14 }}>
            <Button variant="neutral" size="sm" disabled={busy} onClick={() => { setEnroll(null); setCode('') }}>Cancelar</Button>
            <Button variant="orange" size="sm" disabled={busy || code.length < 6} onClick={confirm}>
              {busy ? <Spinner size={14}/> : enroll.swapping ? 'Confirmar novo aparelho' : 'Confirmar e ativar'}
            </Button>
          </div>
        </>
      )}
      {msg && (
        <div style={{ fontFamily: 'DM Sans,sans-serif', fontSize: 12.5, marginTop: 12, color: msg.ok ? '#15803d' : '#dc2626' }}>
          {msg.ok ? '✓ ' : '⚠ '}{msg.text}
        </div>
      )}
    </Card>
  )
}
