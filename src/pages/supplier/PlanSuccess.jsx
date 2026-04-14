import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'
import { Button, Spinner } from '../../components/ui.jsx'

export default function PlanSuccess() {
  const navigate   = useNavigate()
  const [status, setStatus] = useState('waiting')
  const [dots, setDots]     = useState('')
  const [elapsed, setElapsed] = useState(0)
  // useRef previne que o efeito rode mais de uma vez (StrictMode / remount)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    // Animação dos "..."
    const dotsTimer = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 500)
    // Contador de segundos (feedback visual)
    const elapsedTimer = setInterval(() => setElapsed(e => e + 1), 1000)

    let attempts = 0
    const MAX = 20 // 20 × 2s = 40s máximo

    const poll = async () => {
      attempts++

      try {
        // Não chama reloadProfile() — consulta o banco diretamente
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          // Sem sessão — raro após Stripe redirect, mas acontece
          if (attempts < MAX) { setTimeout(poll, 2000); return }
          clearInterval(dotsTimer); clearInterval(elapsedTimer)
          setStatus('timeout'); return
        }

        // Busca o supplier_id
        const { data: profile } = await supabase
          .from('profiles').select('supplier_id').eq('id', user.id).single()

        const supplierId = profile?.supplier_id
        if (!supplierId) {
          if (attempts < MAX) { setTimeout(poll, 2000); return }
          clearInterval(dotsTimer); clearInterval(elapsedTimer)
          setStatus('timeout'); return
        }

        // Verifica plano ativo — inserido pelo webhook do Stripe
        const { data: plan } = await supabase
          .from('plans')
          .select('id, type, status')
          .eq('supplier_id', supplierId)
          .eq('status', 'ACTIVE')
          .maybeSingle()  // maybeSingle não lança erro se não encontrar

        if (plan) {
          clearInterval(dotsTimer); clearInterval(elapsedTimer)
          setStatus('confirmed')
        } else if (attempts < MAX) {
          setTimeout(poll, 2000)
        } else {
          clearInterval(dotsTimer); clearInterval(elapsedTimer)
          setStatus('timeout')
        }
      } catch (err) {
        console.warn('PlanSuccess poll error:', err)
        if (attempts < MAX) setTimeout(poll, 2000)
        else { clearInterval(dotsTimer); clearInterval(elapsedTimer); setStatus('timeout') }
      }
    }

    setTimeout(poll, 2000)

    return () => {
      clearInterval(dotsTimer)
      clearInterval(elapsedTimer)
    }
  }, [])

  const cardStyle = {
    background:'#fff', borderRadius:24, padding:'40px 36px', textAlign:'center',
    maxWidth:460, width:'90%', boxShadow:'0 24px 80px rgba(0,0,0,.3)',
  }

  const wrapper = (children) => (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'linear-gradient(160deg,#1a1c5e,#2E3192)' }}>
      {children}
    </div>
  )

  if (status === 'waiting') return wrapper(
    <div style={cardStyle}>
      <Spinner size={52} />
      <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:18, color:'#1a1c5e', marginTop:20 }}>
        Confirmando pagamento{dots}
      </div>
      <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#9B9B9B', marginTop:6, marginBottom:20 }}>
        Aguardando o Stripe confirmar. Isso leva de 3 a 15 segundos.
      </div>
      {elapsed >= 10 && (
        <div style={{ marginTop:8 }}>
          <div style={{ fontSize:12, color:'#9B9B9B', marginBottom:8 }}>Demorando mais que o esperado?</div>
          <Button variant="neutral" size="sm" style={{ borderRadius:10 }}
            onClick={() => navigate('/fornecedor')}>
            Ir para o Dashboard →
          </Button>
        </div>
      )}
    </div>
  )

  if (status === 'confirmed') return wrapper(
    <div style={cardStyle}>
      <div style={{ fontSize:64, marginBottom:12 }}>🎉</div>
      <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:26, color:'#1a1c5e', marginBottom:8 }}>
        Pagamento confirmado!
      </div>
      <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#9B9B9B', lineHeight:1.6, marginBottom:28 }}>
        Seu plano SIGEC-ELOS foi ativado. O próximo passo é enviar os documentos para a homologação.
      </div>
      <Button variant="orange" full size="lg" style={{ borderRadius:12, marginBottom:10 }}
        onClick={() => navigate('/fornecedor/documentos')}>
        📋 Enviar Documentos →
      </Button>
      <Button variant="neutral" full onClick={() => navigate('/fornecedor')}>
        Ver Dashboard
      </Button>
    </div>
  )

  // Timeout
  return wrapper(
    <div style={cardStyle}>
      <div style={{ fontSize:56, marginBottom:12 }}>✅</div>
      <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:22, color:'#1a1c5e', marginBottom:8 }}>
        Pagamento recebido!
      </div>
      <div style={{ background:'rgba(245,158,11,.08)', border:'1px solid rgba(245,158,11,.3)', borderRadius:12, padding:'12px 14px', marginBottom:20, fontSize:13, color:'#92400e', fontFamily:'DM Sans,sans-serif', textAlign:'left' }}>
        ⚠️ A ativação está sendo processada. O dashboard mostrará o plano ativo em alguns instantes. Se não aparecer, confirme o webhook do Stripe no Netlify.
      </div>
      <Button variant="orange" full size="lg" style={{ borderRadius:12, marginBottom:10 }}
        onClick={() => navigate('/fornecedor/documentos')}>
        📋 Enviar Documentos →
      </Button>
      <Button variant="neutral" full onClick={() => navigate('/fornecedor')}>
        Ver Dashboard
      </Button>
    </div>
  )
}
