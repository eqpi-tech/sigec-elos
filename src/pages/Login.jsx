import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../context/AuthContext.jsx'
import { Button } from '../components/ui.jsx'
import { useIsMobile } from '../hooks/useIsMobile.js'

export default function Login() {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const { login } = useAuth()
  const navigate  = useNavigate()
  const mobile    = useIsMobile()

  const [showForgot,    setShowForgot]    = useState(false)
  const [forgotEmail,   setForgotEmail]   = useState('')
  const [forgotSent,    setForgotSent]    = useState(false)
  const [forgotLoading, setForgotLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setLoading(true)
    try { await login({ email, password }); navigate('/') }
    catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  const handleForgot = async (e) => {
    e.preventDefault(); setForgotLoading(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: 'https://elos.eqpitech.com.br/redefinir-senha',
      })
      if (error) throw new Error(error.message)
      setForgotSent(true)
    } catch (err) { setError(err.message) }
    finally { setForgotLoading(false) }
  }

  const inp = { width:'100%', padding:'12px 14px', borderRadius:10, border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#1a1c5e', boxSizing:'border-box' }
  const lbl = { display:'block', fontFamily:'Montserrat,sans-serif', fontWeight:600, fontSize:11, color:'#1a1c5e', letterSpacing:.5, marginBottom:6, textTransform:'uppercase' }

  return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection: mobile ? 'column' : 'row', background:'linear-gradient(160deg,#1a1c5e 0%,#2E3192 50%,#1a1c5e 100%)' }}>

      {/* Painel esquerdo — esconde no mobile, vira header compacto */}
      {mobile ? (
        <div style={{ padding:'24px 24px 0', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <img src="/logo.png" alt="SIGEC-ELOS" style={{ height:40, objectFit:'contain' }} />
          <Link to="/cadastro" style={{ color:'#F47E2F', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, textDecoration:'none' }}>
            Cadastrar →
          </Link>
        </div>
      ) : (
        <div style={{ flex:1, display:'flex', flexDirection:'column', justifyContent:'center', padding:'60px', maxWidth:520 }}>
          <img src="/logo.png" alt="SIGEC-ELOS" style={{ height:80, objectFit:'contain', objectPosition:'left', marginBottom:32 }} />
          <h1 style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:36, color:'#fff', lineHeight:1.2, marginBottom:12 }}>
            Conectando competência<br/>a grandes oportunidades
          </h1>
          <p style={{ fontFamily:'DM Sans,sans-serif', fontSize:16, color:'rgba(255,255,255,.65)', lineHeight:1.7, marginBottom:40 }}>
            A plataforma de pré-homologação e marketplace de fornecedores da EQPI Tech.
          </p>
          <div style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
            {[['60k+','Fornecedores'],['7.2bi','Documentos'],['31%','Redução de risco']].map(([v,l]) => (
              <div key={l} style={{ background:'rgba(255,255,255,.08)', border:'1px solid rgba(255,255,255,.12)', borderRadius:12, padding:'12px 16px' }}>
                <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:22, color:'#F47E2F' }}>{v}</div>
                <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:12, color:'rgba(255,255,255,.6)' }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Painel direito — formulário */}
      <div style={{ flex: mobile ? 'unset' : 1, display:'flex', alignItems: mobile ? 'flex-start' : 'center', justifyContent:'center', padding: mobile ? '24px 20px 40px' : '40px' }}>
        <div style={{ width:'100%', maxWidth: mobile ? '100%' : 420 }}>
          <div style={{ background:'#fff', borderRadius:20, padding: mobile ? 24 : 32, boxShadow:'0 24px 80px rgba(0,0,0,.3)' }}>
            <h2 style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize: mobile ? 20 : 22, color:'#1a1c5e', marginBottom:6 }}>Entrar na plataforma</h2>
            <p style={{ fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#9B9B9B', marginBottom:24 }}>
              Fornecedor sem conta?{' '}
              <Link to="/cadastro" style={{ color:'#F47E2F', fontWeight:700, textDecoration:'none' }}>Cadastre-se →</Link>
            </p>
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom:16 }}>
                <label style={lbl}>E-mail</label>
                <input value={email} onChange={e=>setEmail(e.target.value)} type="email" placeholder="seu@email.com" required style={inp} />
              </div>
              <div style={{ marginBottom:20 }}>
                <label style={lbl}>Senha</label>
                <input value={password} onChange={e=>setPassword(e.target.value)} type="password" placeholder="••••••••" required style={inp} />
              </div>
              {error && <div style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:10, padding:'10px 14px', marginBottom:16, fontSize:13, color:'#dc2626' }}>{error}</div>}
              <Button type="submit" variant="orange" full size="lg" disabled={loading} style={{ borderRadius:12, fontSize:15 }}>
                {loading ? '⏳ Entrando...' : 'Entrar →'}
              </Button>
            </form>

            {!showForgot && (
              <div style={{ textAlign:'center', marginTop:12 }}>
                <button onClick={() => setShowForgot(true)} style={{ background:'none', border:'none', cursor:'pointer', color:'#9B9B9B', fontSize:13, fontFamily:'DM Sans,sans-serif', textDecoration:'underline' }}>
                  Esqueci minha senha
                </button>
              </div>
            )}

            {showForgot && !forgotSent && (
              <div style={{ marginTop:16, padding:16, background:'#f4f5f9', borderRadius:12 }}>
                <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, color:'#1a1c5e', marginBottom:8 }}>Redefinir senha</div>
                <form onSubmit={handleForgot}>
                  <input value={forgotEmail} onChange={e => setForgotEmail(e.target.value)}
                    type="email" placeholder="seu@email.com" required
                    style={{ ...inp, padding:'10px 12px', marginBottom:8 }} />
                  <div style={{ display:'flex', gap:8 }}>
                    <Button type="button" variant="neutral" size="sm" full onClick={() => setShowForgot(false)}>Cancelar</Button>
                    <Button type="submit" variant="primary" size="sm" full disabled={forgotLoading}>
                      {forgotLoading ? '⏳...' : 'Enviar link'}
                    </Button>
                  </div>
                </form>
              </div>
            )}

            {forgotSent && (
              <div style={{ marginTop:16, padding:12, background:'#f0fdf4', border:'1px solid #86efac', borderRadius:10, textAlign:'center', fontSize:13, color:'#15803d' }}>
                ✅ Link enviado! Verifique seu e-mail.
              </div>
            )}
          </div>
          <div style={{ textAlign:'center', marginTop:16 }}>
            <p style={{ fontFamily:'DM Sans,sans-serif', fontSize:12, color:'rgba(255,255,255,.4)' }}>
              Comprador ou backoffice? Solicite acesso ao administrador EQPI Tech.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
