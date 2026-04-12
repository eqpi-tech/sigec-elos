import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { Button } from '../components/ui.jsx'

const DEMO_USERS = [
  { label: 'Fornecedor', email: 'fornecedor@demo.com', color: '#2563eb', icon: '🏭', desc: 'Gerencie seu perfil e documentos' },
  { label: 'Comprador',  email: 'comprador@demo.com',  color: '#ea580c', icon: '🔍', desc: 'Encontre fornecedores qualificados' },
  { label: 'Backoffice', email: 'admin@eqpi.com.br',   color: '#7c3aed', icon: '⚙️', desc: 'Analise e aprove homologações' },
]

const REDIRECT = { SUPPLIER: '/fornecedor', BUYER: '/comprador', ADMIN: '/backoffice' }

export default function Login() {
  const [email, setEmail]     = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate  = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const user = await login({ email, password })
      navigate(REDIRECT[user.role] || '/')
    } catch (err) {
      setError(err.message)
    } finally { setLoading(false) }
  }

  const quickLogin = (demoEmail) => { setEmail(demoEmail); setPassword('demo123') }

  return (
    <div style={{ minHeight:'100vh', display:'flex', background:'linear-gradient(160deg,#1a1c5e 0%,#2E3192 50%,#1a1c5e 100%)' }}>
      {/* Left — branding */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', justifyContent:'center', padding:'60px', maxWidth:520 }}>
        <img src="/logo.png" alt="SIGEC-ELOS" style={{ height:80, objectFit:'contain', objectPosition:'left', marginBottom:32 }} />
        <h1 style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:36, color:'#fff', lineHeight:1.2, marginBottom:12 }}>
          Conectando competência a grandes oportunidades
        </h1>
        <p style={{ fontFamily:'DM Sans,sans-serif', fontSize:16, color:'rgba(255,255,255,.65)', lineHeight:1.7, marginBottom:40 }}>
          A plataforma de pré-homologação e marketplace de fornecedores da EQPI Tech.
        </p>
        <div style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
          {[['60k+','Fornecedores'],['7.2bi','Documentos analisados'],['31%','Redução de risco']].map(([v,l]) => (
            <div key={l} style={{ background:'rgba(255,255,255,.08)', border:'1px solid rgba(255,255,255,.12)', borderRadius:12, padding:'12px 16px' }}>
              <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:22, color:'#F47E2F' }}>{v}</div>
              <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:12, color:'rgba(255,255,255,.6)' }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right — login form */}
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:'40px' }}>
        <div style={{ width:'100%', maxWidth:420 }}>
          {/* Demo shortcuts */}
          <div style={{ background:'rgba(255,255,255,.06)', borderRadius:16, padding:16, marginBottom:24, border:'1px solid rgba(255,255,255,.1)' }}>
            <div style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,.4)', fontFamily:'Montserrat,sans-serif', letterSpacing:1, marginBottom:10 }}>ACESSO RÁPIDO — DEMO</div>
            <div style={{ display:'flex', gap:8 }}>
              {DEMO_USERS.map(u => (
                <button key={u.email} onClick={() => quickLogin(u.email)}
                  style={{ flex:1, background:email===u.email?`${u.color}33`:'rgba(255,255,255,.08)', border:`1px solid ${email===u.email?u.color:'rgba(255,255,255,.1)'}`, borderRadius:10, padding:'10px 8px', cursor:'pointer', transition:'all .15s', textAlign:'center' }}>
                  <div style={{ fontSize:20 }}>{u.icon}</div>
                  <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:11, color:email===u.email?u.color:'rgba(255,255,255,.7)', marginTop:4 }}>{u.label}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Card */}
          <div style={{ background:'#fff', borderRadius:20, padding:32, boxShadow:'0 24px 80px rgba(0,0,0,.3)' }}>
            <h2 style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:22, color:'#1a1c5e', marginBottom:6 }}>Entrar na plataforma</h2>
            <p style={{ fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#9B9B9B', marginBottom:24 }}>Senha para todos os acessos demo: <strong>demo123</strong></p>

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom:16 }}>
                <label style={{ display:'block', fontFamily:'Montserrat,sans-serif', fontWeight:600, fontSize:11, color:'#1a1c5e', letterSpacing:.5, marginBottom:6, textTransform:'uppercase' }}>E-mail</label>
                <input value={email} onChange={e=>setEmail(e.target.value)} type="email" placeholder="seu@email.com" required
                  style={{ width:'100%', padding:'12px 14px', borderRadius:10, border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#1a1c5e', boxSizing:'border-box', transition:'all .15s' }} />
              </div>
              <div style={{ marginBottom:20 }}>
                <label style={{ display:'block', fontFamily:'Montserrat,sans-serif', fontWeight:600, fontSize:11, color:'#1a1c5e', letterSpacing:.5, marginBottom:6, textTransform:'uppercase' }}>Senha</label>
                <input value={password} onChange={e=>setPassword(e.target.value)} type="password" placeholder="••••••••" required
                  style={{ width:'100%', padding:'12px 14px', borderRadius:10, border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#1a1c5e', boxSizing:'border-box', transition:'all .15s' }} />
              </div>

              {error && (
                <div style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:10, padding:'10px 14px', marginBottom:16, fontSize:13, color:'#dc2626', fontFamily:'DM Sans,sans-serif' }}>
                  {error}
                </div>
              )}

              <Button type="submit" variant="orange" full size="lg" disabled={loading} style={{ borderRadius:12, fontSize:15 }}>
                {loading ? '⏳ Entrando...' : 'Entrar →'}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
