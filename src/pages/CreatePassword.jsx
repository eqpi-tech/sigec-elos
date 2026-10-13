import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { Button, Spinner } from '../components/ui.jsx'

// "Criar minha senha" — link pessoal dos comunicados da migração HOC → ELOS
// (patch_135 + função migration-set-password). O token é do link do e-mail;
// depois de criar a senha a pessoa já entra no painel.
const call = (body) => fetch('/.netlify/functions/migration-set-password', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}).then(async r => ({ status: r.status, ...(await r.json().catch(() => ({}))) }))

export default function CreatePassword() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const token = params.get('t') || ''
  const [state, setState] = useState('checking')   // checking | ready | invalid | expired | done
  const [info, setInfo] = useState({})
  const [password, setPassword]   = useState('')
  const [password2, setPassword2] = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')

  useEffect(() => {
    if (!token) { setState('invalid'); return }
    call({ token }).then(r => {
      if (r.ok) { setInfo(r); setState('ready') }
      else if (r.error === 'expirado') { setInfo(r); setState('expired') }
      else setState('invalid')
    }).catch(() => setState('invalid'))
  }, [token])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (password !== password2) { setError('As senhas não coincidem'); return }
    if (password.length < 8)    { setError('A senha precisa ter pelo menos 8 caracteres'); return }
    setError(''); setLoading(true)
    try {
      const r = await call({ token, password })
      if (!r.ok) throw new Error(r.error === 'expirado' ? 'Este link expirou. Use "Esqueci minha senha" na tela de login.' : (r.error || 'Não foi possível criar a senha.'))
      setState('done')
      const { error: e2 } = await supabase.auth.signInWithPassword({ email: r.email, password })
      setTimeout(() => navigate(e2 ? '/login' : '/'), 1500)
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  const containerStyle = {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'linear-gradient(160deg,#1a1c5e,#2E3192)',
  }
  const cardStyle = {
    background: '#fff', borderRadius: 20, padding: '40px 36px',
    maxWidth: 420, width: '90%', boxShadow: '0 24px 80px rgba(0,0,0,.3)', textAlign: 'center',
  }
  const titleStyle = { fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:20, color:'#1a1c5e', marginBottom:8 }
  const textStyle = { fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#6b7280', marginBottom:24, lineHeight:1.6 }

  if (state === 'checking') return (
    <div style={containerStyle}><div style={cardStyle}>
      <Spinner size={48} />
      <div style={{ ...titleStyle, fontSize:17, marginTop:16 }}>Verificando link...</div>
    </div></div>
  )

  if (state === 'invalid' || state === 'expired') return (
    <div style={containerStyle}><div style={cardStyle}>
      <div style={{ fontSize:52, marginBottom:12 }}>{state === 'expired' ? '⏰' : '🔗'}</div>
      <div style={titleStyle}>{state === 'expired' ? 'Link expirado' : 'Link inválido ou já usado'}</div>
      <div style={textStyle}>
        {state === 'expired'
          ? <>Este link pessoal expirou. Na tela de login, clique em <strong>Esqueci minha senha</strong>{info.email ? <> e informe <strong>{info.email}</strong></> : ''}.</>
          : <>Se você já criou a sua senha, é só entrar. Se não, na tela de login clique em <strong>Esqueci minha senha</strong> e informe o seu e-mail.</>}
        <br/>Dúvidas: <strong>suporte@eqpitech.com.br</strong> · WhatsApp (11) 5039-6769
      </div>
      <Button variant="primary" full style={{ borderRadius:10 }} onClick={() => navigate('/login')}>Ir para o login</Button>
    </div></div>
  )

  if (state === 'done') return (
    <div style={containerStyle}><div style={cardStyle}>
      <div style={{ fontSize:52, marginBottom:12 }}>✅</div>
      <div style={titleStyle}>Senha criada!</div>
      <div style={{ ...textStyle, marginBottom:8 }}>Entrando no seu painel...</div>
      <Spinner size={24} />
    </div></div>
  )

  const inputStyle = {
    width:'100%', padding:'12px 14px', borderRadius:10, border:'1px solid #e2e4ef',
    fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#1a1c5e', boxSizing:'border-box',
  }
  const labelStyle = {
    display:'block', fontFamily:'Montserrat,sans-serif', fontWeight:600, fontSize:11,
    color:'#1a1c5e', letterSpacing:.5, marginBottom:6, textTransform:'uppercase', textAlign:'left',
  }
  const nome = (info.nome || '').trim().split(/\s+/)[0]

  return (
    <div style={containerStyle}>
      <div style={{ ...cardStyle, textAlign:'left' }}>
        <div style={{ textAlign:'center', marginBottom:24 }}>
          <img src="/logo.png" alt="SIGEC-ELOS" style={{ height:50, objectFit:'contain' }} />
        </div>
        <h2 style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:22, color:'#1a1c5e', marginBottom:6 }}>
          {nome && !nome.includes('@') ? `Olá, ${nome.charAt(0).toUpperCase() + nome.slice(1).toLowerCase()}!` : 'Bem-vindo ao SIGEC-ELOS!'}
        </h2>
        <p style={{ fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#6b7280', marginBottom:20, lineHeight:1.6 }}>
          O seu acesso já está pronto, com os mesmos dados do SIGEC-HOC. Crie a sua senha para entrar.
        </p>
        <div style={{ background:'#f8f9fb', border:'1px solid #e2e4ef', borderRadius:10, padding:'10px 14px', marginBottom:18, fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#374151' }}>
          Seu login: <strong>{info.email}</strong>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom:16 }}>
            <label style={labelStyle}>Senha (mín. 8 caracteres)</label>
            <input value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="••••••••" required autoComplete="new-password" style={inputStyle} />
          </div>
          <div style={{ marginBottom:20 }}>
            <label style={labelStyle}>Confirmar senha</label>
            <input value={password2} onChange={e => setPassword2(e.target.value)} type="password" placeholder="••••••••" required autoComplete="new-password" style={inputStyle} />
          </div>
          {error && (
            <div style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:10, padding:'10px 14px', marginBottom:16, fontSize:13, color:'#dc2626', fontFamily:'DM Sans,sans-serif' }}>
              {error}
            </div>
          )}
          <Button type="submit" variant="orange" full size="lg" disabled={loading} style={{ borderRadius:12 }}>
            {loading ? '⏳ Salvando...' : '🔐 Criar minha senha'}
          </Button>
        </form>
      </div>
    </div>
  )
}
