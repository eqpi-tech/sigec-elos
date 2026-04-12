import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { supabase } from '../../lib/supabase.js'
import { Button, Spinner } from '../../components/ui.jsx'

export default function PlanSuccess() {
  const [params]    = useSearchParams()
  const navigate    = useNavigate()
  const { user, reloadProfile } = useAuth()
  const [status, setStatus] = useState('waiting') // waiting | confirmed | timeout
  const [dots, setDots]     = useState('')

  useEffect(() => {
    // Anima os "..." enquanto aguarda
    const dotsInterval = setInterval(() => {
      setDots(d => d.length >= 3 ? '' : d + '.')
    }, 500)

    // Recarrega o perfil imediatamente (para pegar supplier_id se ainda não tinha)
    reloadProfile()

    // Polling: verifica se o plano foi ativado pelo webhook do Stripe
    // O webhook pode levar de 2s a 30s dependendo da latência
    let attempts = 0
    const maxAttempts = 15 // 15 × 2s = 30 segundos

    const poll = async () => {
      attempts++

      // Pega o supplier_id mais atualizado do banco
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) return

      const { data: profile } = await supabase
        .from('profiles').select('supplier_id').eq('id', authUser.id).single()

      const supplierId = profile?.supplier_id
      if (!supplierId) {
        if (attempts < maxAttempts) { setTimeout(poll, 2000); return }
        setStatus('timeout'); return
      }

      // Verifica se o plano foi ativado
      const { data: plan } = await supabase
        .from('plans')
        .select('status, type')
        .eq('supplier_id', supplierId)
        .eq('status', 'ACTIVE')
        .single()

      if (plan) {
        await reloadProfile() // garante que o contexto tem supplier_id atualizado
        setStatus('confirmed')
        clearInterval(dotsInterval)
      } else if (attempts < maxAttempts) {
        setTimeout(poll, 2000)
      } else {
        // Timeout mas continua — o webhook pode ainda estar a caminho
        await reloadProfile()
        setStatus('timeout')
        clearInterval(dotsInterval)
      }
    }

    // Começa o polling após 2 segundos
    setTimeout(poll, 2000)

    return () => clearInterval(dotsInterval)
  }, [])

  if (status === 'waiting') return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'linear-gradient(160deg,#1a1c5e,#2E3192)' }}>
      <div style={{ background:'#fff', borderRadius:24, padding:48, textAlign:'center', maxWidth:440, width:'90%' }}>
        <Spinner size={48} />
        <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:18, color:'#1a1c5e', marginTop:20 }}>
          Confirmando pagamento{dots}
        </div>
        <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#9B9B9B', marginTop:8 }}>
          Aguardando confirmação do Stripe. Isso leva alguns segundos.
        </div>
      </div>
    </div>
  )

  if (status === 'confirmed') return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'linear-gradient(160deg,#1a1c5e,#2E3192)' }}>
      <div style={{ background:'#fff', borderRadius:24, padding:48, textAlign:'center', maxWidth:480, width:'90%', boxShadow:'0 24px 80px rgba(0,0,0,.3)' }}>
        <div style={{ fontSize:64, marginBottom:16 }}>🎉</div>
        <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:26, color:'#1a1c5e', marginBottom:8 }}>
          Pagamento confirmado!
        </div>
        <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:15, color:'#9B9B9B', lineHeight:1.6, marginBottom:32 }}>
          Seu plano SIGEC-ELOS foi ativado com sucesso. O próximo passo é enviar seus documentos para iniciar a homologação pelo backoffice EQPI.
        </div>
        <Button variant="orange" full size="lg" style={{ borderRadius:12, marginBottom:12 }}
          onClick={() => navigate('/fornecedor/documentos')}>
          📋 Enviar Documentos →
        </Button>
        <Button variant="neutral" full size="md" style={{ borderRadius:10 }}
          onClick={() => navigate('/fornecedor')}>
          Ver Dashboard
        </Button>
      </div>
    </div>
  )

  // Timeout — plano pode ainda estar sendo processado
  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'linear-gradient(160deg,#1a1c5e,#2E3192)' }}>
      <div style={{ background:'#fff', borderRadius:24, padding:48, textAlign:'center', maxWidth:480, width:'90%', boxShadow:'0 24px 80px rgba(0,0,0,.3)' }}>
        <div style={{ fontSize:64, marginBottom:16 }}>✅</div>
        <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:24, color:'#1a1c5e', marginBottom:8 }}>
          Pagamento recebido!
        </div>
        <div style={{ background:'rgba(245,158,11,.1)', border:'1px solid rgba(245,158,11,.3)', borderRadius:12, padding:'12px 16px', marginBottom:24, fontSize:13, color:'#92400e', fontFamily:'DM Sans,sans-serif' }}>
          ⚠️ A ativação do plano está sendo processada. Se o dashboard ainda não mostrar o plano em alguns minutos, verifique se o webhook do Stripe está configurado corretamente.
        </div>
        <Button variant="orange" full size="lg" style={{ borderRadius:12, marginBottom:12 }}
          onClick={() => navigate('/fornecedor/documentos')}>
          📋 Enviar Documentos →
        </Button>
        <Button variant="neutral" full size="md" style={{ borderRadius:10 }}
          onClick={() => navigate('/fornecedor')}>
          Ver Dashboard
        </Button>
      </div>
    </div>
  )
}
