// Login white-label do cliente HOC — herda logo, cores e imagem da
// landing page do cliente (client_landing_pages). Paridade com o HOC,
// que tinha tela de login personalizada por cliente.
// Rota pública: /portal/:slug/login
import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../context/AuthContext.jsx'
import { Spinner } from '../components/ui.jsx'

export default function PortalLogin() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const { login } = useAuth()

  const [client,   setClient]   = useState(null)
  const [notFound, setNotFound] = useState(false)
  const [loading,  setLoading]  = useState(true)

  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [signing,  setSigning]  = useState(false)

  const [showForgot,    setShowForgot]    = useState(false)
  const [forgotEmail,   setForgotEmail]   = useState('')
  const [forgotSent,    setForgotSent]    = useState(false)
  const [forgotLoading, setForgotLoading] = useState(false)

  useEffect(() => {
    supabase
      .from('client_landing_pages')
      .select('*')
      .eq('slug', slug)
      .eq('is_active', true)
      .single()
      .then(({ data, error: err }) => {
        if (err || !data) setNotFound(true)
        else setClient(data)
        setLoading(false)
      })
  }, [slug])

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setSigning(true)
    try { await login({ email, password }); navigate('/') }
    catch (err) { setError(err.message) }
    finally { setSigning(false) }
  }

  const handleForgot = async (e) => {
    e.preventDefault(); setForgotLoading(true)
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: 'https://elos.eqpitech.com.br/redefinir-senha',
      })
      if (err) throw new Error(err.message)
      setForgotSent(true)
    } catch (err) { setError(err.message) }
    finally { setForgotLoading(false) }
  }

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#1a1c5e' }}>
      <Spinner size={48}/>
    </div>
  )

  if (notFound) return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:14, background:'#1a1c5e', fontFamily:'DM Sans,sans-serif' }}>
      <div style={{ fontSize:40 }}>🔍</div>
      <div style={{ color:'#fff', fontSize:16 }}>Portal não encontrado ou inativo.</div>
      <Link to="/login" style={{ color:'#F47E2F', fontWeight:700, textDecoration:'none' }}>Ir para o login padrão →</Link>
    </div>
  )

  const accent    = client.accent_color    || '#F47E2F'
  const secondary = client.secondary_color || '#1a1c5e'
  const companyName = client.company_name || 'Portal do Cliente'

  const inp = { width:'100%', padding:'12px 14px', borderRadius:10, border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#1a1c5e', boxSizing:'border-box', outline:'none' }
  const lbl = { display:'block', fontFamily:'Montserrat,sans-serif', fontWeight:600, fontSize:11, color:'#1a1c5e', letterSpacing:.5, marginBottom:6, textTransform:'uppercase' }

  return (
    <div style={{
      minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center',
      padding:'32px 16px', position:'relative', fontFamily:'DM Sans,sans-serif',
      background: `linear-gradient(150deg, ${secondary} 0%, ${secondary}ee 55%, ${accent}33 130%)`,
    }}>
      {/* Imagem hero do cliente como textura de fundo */}
      {client.hero_image_url && (
        <div style={{ position:'absolute', inset:0, backgroundImage:`url(${client.hero_image_url})`,
          backgroundSize:'cover', backgroundPosition:'center', opacity:0.14, pointerEvents:'none' }}/>
      )}

      <div style={{ width:'100%', maxWidth:420, position:'relative' }}>
        {/* Logo do cliente */}
        <div style={{ textAlign:'center', marginBottom:24 }}>
          {client.logo_url ? (
            <img src={client.logo_url} alt={companyName}
              style={{ height:64, objectFit:'contain', filter:'drop-shadow(0 4px 12px rgba(0,0,0,.3))' }}/>
          ) : (
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:26, color:'#fff' }}>{companyName}</div>
          )}
          <div style={{ marginTop:10, color:'rgba(255,255,255,.55)', fontSize:12, letterSpacing:.8 }}>
            Portal de Fornecedores · powered by <span style={{ color:accent, fontWeight:700 }}>SIGEC-ELOS</span>
          </div>
        </div>

        {/* Card de login */}
        <div style={{ background:'#fff', borderRadius:20, padding:32, boxShadow:'0 24px 80px rgba(0,0,0,.35)' }}>
          <h2 style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:20, color:'#1a1c5e', marginBottom:4 }}>
            Entrar na plataforma
          </h2>
          <p style={{ fontSize:13, color:'#9B9B9B', marginBottom:22 }}>
            Acesso ao processo de homologação {companyName}
          </p>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom:14 }}>
              <label style={lbl}>E-mail</label>
              <input value={email} onChange={e=>setEmail(e.target.value)} type="email" placeholder="seu@email.com" required style={inp}/>
            </div>
            <div style={{ marginBottom:18 }}>
              <label style={lbl}>Senha</label>
              <input value={password} onChange={e=>setPassword(e.target.value)} type="password" placeholder="••••••••" required style={inp}/>
            </div>
            {error && (
              <div style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:10, padding:'10px 14px', marginBottom:14, fontSize:13, color:'#dc2626' }}>
                {error}
              </div>
            )}
            <button type="submit" disabled={signing}
              style={{ width:'100%', padding:'13px', borderRadius:12, border:'none', cursor:'pointer',
                background:accent, color:'#fff', fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:15,
                boxShadow:`0 8px 24px ${accent}55`, opacity:signing?0.7:1 }}>
              {signing ? '⏳ Entrando...' : 'Entrar →'}
            </button>
          </form>

          {!showForgot && (
            <div style={{ textAlign:'center', marginTop:12 }}>
              <button onClick={() => setShowForgot(true)}
                style={{ background:'none', border:'none', cursor:'pointer', color:'#9B9B9B', fontSize:13, fontFamily:'DM Sans,sans-serif', textDecoration:'underline' }}>
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
                  style={{ ...inp, padding:'10px 12px', marginBottom:8 }}/>
                <div style={{ display:'flex', gap:8 }}>
                  <button type="button" onClick={() => setShowForgot(false)}
                    style={{ flex:1, padding:'9px', borderRadius:10, border:'1px solid #e2e4ef', background:'#fff', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#64748b' }}>
                    Cancelar
                  </button>
                  <button type="submit" disabled={forgotLoading}
                    style={{ flex:1, padding:'9px', borderRadius:10, border:'none', background:secondary, color:'#fff', cursor:'pointer', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13 }}>
                    {forgotLoading ? '⏳...' : 'Enviar link'}
                  </button>
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

        {/* Rodapé: cadastro + voltar ao portal */}
        <div style={{ textAlign:'center', marginTop:18, display:'flex', flexDirection:'column', gap:8 }}>
          <span style={{ fontSize:13, color:'rgba(255,255,255,.65)' }}>
            Fornecedor sem conta?{' '}
            <Link to={`/portal/${slug}`} style={{ color:accent, fontWeight:700, textDecoration:'none' }}>
              Cadastre-se pelo portal →
            </Link>
          </span>
          <Link to={`/portal/${slug}`} style={{ fontSize:12, color:'rgba(255,255,255,.4)', textDecoration:'none' }}>
            ← Voltar ao portal {companyName}
          </Link>
        </div>
      </div>
    </div>
  )
}
