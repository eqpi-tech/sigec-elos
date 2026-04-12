import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { Button, Spinner } from '../components/ui.jsx'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [ready, setReady]     = useState(false)    // token válido recebido
  const [invalid, setInvalid] = useState(false)    // token inválido/expirado
  const [password, setPassword]   = useState('')
  const [password2, setPassword2] = useState('')
  const [loading, setLoading]     = useState(false)
  const [done, setDone]           = useState(false)
  const [error, setError]         = useState('')

  useEffect(() => {
    // Supabase detecta o hash #access_token=...&type=recovery na URL
    // e dispara onAuthStateChange com event='PASSWORD_RECOVERY'
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true)
      }
      if (event === 'SIGNED_IN' && session) {
        // Sessão ativa — pode haver recovery
        setTimeout(() => {
          if (!ready) setReady(true)
        }, 500)
      }
    })

    // Timeout: se em 5s não receber o evento, token pode ser inválido
    const timeout = setTimeout(() => {
      setInvalid(true)
    }, 6000)

    // Se já tem sessão (raro), marca como pronto
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        clearTimeout(timeout)
        setReady(true)
      }
    })

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [])

  // Cancela o timeout quando ready muda para true
  useEffect(() => {
    if (ready) setInvalid(false)
  }, [ready])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (password !== password2) { setError('As senhas não coincidem'); return }
    if (password.length < 8)    { setError('Senha deve ter pelo menos 8 caracteres'); return }
    setError(''); setLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw new Error(error.message)
      setDone(true)
      setTimeout(() => navigate('/login'), 3000)
    } catch (err) {
      setError(err.message)
    } finally { setLoading(false) }
  }

  const containerStyle = {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'linear-gradient(160deg,#1a1c5e,#2E3192)',
  }
  const cardStyle = {
    background: '#fff', borderRadius: 20, padding: '40px 36px',
    maxWidth: 420, width: '90%', boxShadow: '0 24px 80px rgba(0,0,0,.3)',
    textAlign: 'center',
  }

  // ── Aguardando token ──────────────────────────────────────────────────────
  if (!ready && !invalid) return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <Spinner size={48} />
        <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:17, color:'#1a1c5e', marginTop:16 }}>
          Verificando link...
        </div>
        <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#9B9B9B', marginTop:6 }}>
          Isso leva apenas um instante.
        </div>
      </div>
    </div>
  )

  // ── Link inválido ou expirado ─────────────────────────────────────────────
  if (invalid && !ready) return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <div style={{ fontSize:52, marginBottom:12 }}>⏰</div>
        <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:20, color:'#1a1c5e', marginBottom:8 }}>
          Link expirado
        </div>
        <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#9B9B9B', marginBottom:24, lineHeight:1.6 }}>
          O link de redefinição de senha expirou ou já foi usado. Solicite um novo link.
        </div>
        <Button variant="primary" full style={{ borderRadius:10 }} onClick={() => navigate('/login')}>
          ← Voltar ao login
        </Button>
      </div>
    </div>
  )

  // ── Senha alterada com sucesso ────────────────────────────────────────────
  if (done) return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <div style={{ fontSize:52, marginBottom:12 }}>✅</div>
        <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:20, color:'#1a1c5e', marginBottom:8 }}>
          Senha alterada!
        </div>
        <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#9B9B9B', marginBottom:8 }}>
          Redirecionando para o login em instantes...
        </div>
        <Spinner size={24} />
      </div>
    </div>
  )

  // ── Formulário de nova senha ──────────────────────────────────────────────
  const inputStyle = {
    width:'100%', padding:'12px 14px', borderRadius:10, border:'1px solid #e2e4ef',
    fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#1a1c5e', boxSizing:'border-box',
  }
  const labelStyle = {
    display:'block', fontFamily:'Montserrat,sans-serif', fontWeight:600, fontSize:11,
    color:'#1a1c5e', letterSpacing:.5, marginBottom:6, textTransform:'uppercase', textAlign:'left',
  }

  return (
    <div style={containerStyle}>
      <div style={{ ...cardStyle, textAlign:'left' }}>
        <div style={{ textAlign:'center', marginBottom:24 }}>
          <img src="/logo.png" alt="SIGEC-ELOS" style={{ height:50, objectFit:'contain' }} />
        </div>
        <h2 style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:22, color:'#1a1c5e', marginBottom:6 }}>
          Redefinir senha
        </h2>
        <p style={{ fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#9B9B9B', marginBottom:24 }}>
          Escolha uma nova senha para sua conta.
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom:16 }}>
            <label style={labelStyle}>Nova senha (mín. 8 caracteres)</label>
            <input
              value={password} onChange={e => setPassword(e.target.value)}
              type="password" placeholder="••••••••" required
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom:20 }}>
            <label style={labelStyle}>Confirmar nova senha</label>
            <input
              value={password2} onChange={e => setPassword2(e.target.value)}
              type="password" placeholder="••••••••" required
              style={inputStyle}
            />
          </div>

          {/* Indicador de força da senha */}
          {password.length > 0 && (
            <div style={{ marginBottom:16 }}>
              <div style={{ height:4, borderRadius:4, background:'#f4f5f9', overflow:'hidden', marginBottom:4 }}>
                <div style={{
                  height:'100%', borderRadius:4, transition:'width .3s',
                  width: password.length >= 12 ? '100%' : password.length >= 8 ? '65%' : '30%',
                  background: password.length >= 12 ? '#22c55e' : password.length >= 8 ? '#f59e0b' : '#ef4444',
                }} />
              </div>
              <div style={{ fontSize:11, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>
                {password.length >= 12 ? '✓ Senha forte' : password.length >= 8 ? '⚠ Senha razoável' : '✕ Senha fraca'}
              </div>
            </div>
          )}

          {error && (
            <div style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:10, padding:'10px 14px', marginBottom:16, fontSize:13, color:'#dc2626', fontFamily:'DM Sans,sans-serif' }}>
              {error}
            </div>
          )}

          <Button type="submit" variant="orange" full size="lg" disabled={loading} style={{ borderRadius:12 }}>
            {loading ? '⏳ Salvando...' : '🔐 Salvar nova senha'}
          </Button>
        </form>
      </div>
    </div>
  )
}
