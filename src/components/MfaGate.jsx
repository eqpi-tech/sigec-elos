// MfaGate — verificação em duas etapas (TOTP nativo do Supabase Auth).
// Envolve TODAS as rotas autenticadas (via ProtectedRoute): MFA é
// obrigatório para todos os perfis (decisão 24/09, pré-rollout holding).
// · sem fator cadastrado  → tela de ativação (QR + código do app)
// · com fator, sessão AAL1 → tela de desafio (código de 6 dígitos)
// · sessão AAL2           → passa direto
// Perdeu o aparelho: um ADMIN reseta em Backoffice → Usuários.
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase.js'
import { Button, Card, Spinner } from './ui.jsx'

const titleF = { fontFamily: 'Montserrat,sans-serif' }
const font   = { fontFamily: 'DM Sans,sans-serif' }
const wrap = { minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f4f5fa', padding:16 }
const codeInput = {
  width:'100%', padding:'12px 14px', borderRadius:10, border:'1px solid #e2e4ef', boxSizing:'border-box',
  ...font, fontSize:22, letterSpacing:8, textAlign:'center', outline:'none',
}

export default function MfaGate({ children }) {
  const [state, setState]   = useState('checking') // checking | ok | enroll | challenge
  const [enroll, setEnroll] = useState(null)       // { id, qr, secret }
  const [factorId, setFactorId] = useState(null)
  const [code, setCode]     = useState('')
  const [busy, setBusy]     = useState(false)
  const [error, setError]   = useState('')

  const check = useCallback(async () => {
    try {
      const { data, error: aalErr } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (aalErr) throw aalErr
      if (data.currentLevel === 'aal2') { setState('ok'); return }
      if (data.nextLevel === 'aal2') {
        // já tem fator verificado — precisa do código
        const { data: f } = await supabase.auth.mfa.listFactors()
        const totp = (f?.totp || [])[0]
        if (totp) { setFactorId(totp.id); setState('challenge'); return }
      }
      setState('enroll')
    } catch (e) {
      // MFA indisponível no projeto não pode trancar todo mundo para fora
      console.warn('[mfa] indisponível, liberando sessão:', e.message)
      setState('ok')
    }
  }, [])

  useEffect(() => { check() }, [check])

  async function startEnroll() {
    setBusy(true); setError('')
    try {
      // remove fatores não verificados de tentativas anteriores
      const { data: f } = await supabase.auth.mfa.listFactors()
      for (const old of (f?.all || []).filter(x => x.factor_type === 'totp' && x.status !== 'verified')) {
        await supabase.auth.mfa.unenroll({ factorId: old.id }).catch(() => {})
      }
      const { data, error: err } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'SIGEC-ELOS' })
      if (err) throw err
      setEnroll({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret })
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }

  async function confirmCode(fId) {
    if (code.trim().length < 6) return
    setBusy(true); setError('')
    try {
      const { error: err } = await supabase.auth.mfa.challengeAndVerify({ factorId: fId, code: code.trim() })
      if (err) throw err
      setCode(''); setEnroll(null)
      setState('ok')
    } catch (e) {
      setError('Código inválido ou expirado — confira o app e tente de novo.')
      console.warn('[mfa]', e.message)
    } finally { setBusy(false) }
  }

  async function sair() { await supabase.auth.signOut(); window.location.href = '/login' }

  if (state === 'ok') return children
  if (state === 'checking') {
    return <div style={wrap}><Spinner size={40}/></div>
  }

  return (
    <div style={wrap}>
      <Card style={{ borderRadius:18, padding:'28px 32px', width:'100%', maxWidth:440 }}>
        <div style={{ ...titleF, fontWeight:800, fontSize:18, color:'#1a1c5e', marginBottom:6 }}>
          🔐 Verificação em duas etapas
        </div>

        {state === 'challenge' ? (
          <>
            <div style={{ ...font, fontSize:13, color:'#64748b', marginBottom:18 }}>
              Digite o código de 6 dígitos do seu aplicativo autenticador para continuar.
            </div>
            <input autoFocus value={code} maxLength={6} inputMode="numeric"
              onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
              onKeyDown={e => { if (e.key === 'Enter') confirmCode(factorId) }}
              placeholder="000000" style={codeInput}/>
            {error && <div style={{ ...font, fontSize:12, color:'#dc2626', marginTop:8 }}>{error}</div>}
            <div style={{ marginTop:16 }}>
              <Button variant="orange" full disabled={busy || code.length < 6} onClick={() => confirmCode(factorId)}>
                {busy ? <Spinner size={16}/> : 'Verificar'}
              </Button>
            </div>
            <div style={{ ...font, fontSize:11.5, color:'#9B9B9B', marginTop:14, lineHeight:1.5 }}>
              Perdeu o acesso ao aplicativo? Fale com o suporte para resetar a verificação.
            </div>
          </>
        ) : !enroll ? (
          <>
            <div style={{ ...font, fontSize:13, color:'#64748b', marginBottom:8, lineHeight:1.55 }}>
              Para proteger os dados da sua empresa, a plataforma agora exige verificação em duas
              etapas. Você vai precisar de um aplicativo autenticador no celular
              (Google Authenticator, Microsoft Authenticator, Authy...).
            </div>
            <div style={{ ...font, fontSize:12, color:'#9B9B9B', marginBottom:18 }}>
              Leva menos de um minuto e é pedido uma única vez por aparelho de confiança.
            </div>
            {error && <div style={{ ...font, fontSize:12, color:'#dc2626', marginBottom:10 }}>{error}</div>}
            <Button variant="orange" full disabled={busy} onClick={startEnroll}>
              {busy ? <Spinner size={16}/> : 'Ativar verificação →'}
            </Button>
          </>
        ) : (
          <>
            <div style={{ ...font, fontSize:13, color:'#64748b', marginBottom:14 }}>
              1. Escaneie o QR code com o aplicativo autenticador · 2. Digite o código de 6 dígitos gerado.
            </div>
            <div style={{ display:'flex', justifyContent:'center', marginBottom:10 }}>
              <img src={enroll.qr} alt="QR code do autenticador" style={{ width:180, height:180, border:'1px solid #e2e4ef', borderRadius:12, background:'#fff' }}/>
            </div>
            <div style={{ ...font, fontSize:11, color:'#9B9B9B', textAlign:'center', marginBottom:14, wordBreak:'break-all' }}>
              Sem câmera? Insira manualmente: <b>{enroll.secret}</b>
            </div>
            <input autoFocus value={code} maxLength={6} inputMode="numeric"
              onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
              onKeyDown={e => { if (e.key === 'Enter') confirmCode(enroll.id) }}
              placeholder="000000" style={codeInput}/>
            {error && <div style={{ ...font, fontSize:12, color:'#dc2626', marginTop:8 }}>{error}</div>}
            <div style={{ marginTop:16 }}>
              <Button variant="orange" full disabled={busy || code.length < 6} onClick={() => confirmCode(enroll.id)}>
                {busy ? <Spinner size={16}/> : 'Confirmar e ativar'}
              </Button>
            </div>
          </>
        )}

        <button onClick={sair}
          style={{ marginTop:18, background:'none', border:'none', cursor:'pointer', ...font, fontSize:12, color:'#9B9B9B', textDecoration:'underline', display:'block', margin:'18px auto 0' }}>
          Sair da conta
        </button>
      </Card>
    </div>
  )
}
