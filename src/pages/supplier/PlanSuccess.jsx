import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { Button, Spinner } from '../../components/ui.jsx'

export default function PlanSuccess() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { reloadProfile } = useAuth()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Aguarda o webhook do Stripe processar (normalmente < 5s)
    const timer = setTimeout(async () => {
      await reloadProfile()
      setLoading(false)
    }, 3000)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'linear-gradient(160deg,#1a1c5e,#2E3192)' }}>
      <div style={{ background:'#fff', borderRadius:24, padding:48, textAlign:'center', maxWidth:480, width:'90%', boxShadow:'0 24px 80px rgba(0,0,0,.3)' }}>
        {loading ? (
          <>
            <Spinner size={48} />
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:18, color:'#1a1c5e', marginTop:20 }}>Confirmando pagamento...</div>
            <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#9B9B9B', marginTop:8 }}>Aguarde alguns instantes</div>
          </>
        ) : (
          <>
            <div style={{ fontSize:64, marginBottom:16 }}>🎉</div>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:26, color:'#1a1c5e', marginBottom:8 }}>
              Pagamento confirmado!
            </div>
            <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:15, color:'#9B9B9B', lineHeight:1.6, marginBottom:32 }}>
              Seu plano SIGEC-ELOS foi ativado. A equipe EQPI analisará sua documentação e emitirá o Selo em breve.
              <br/><br/>
              Próximo passo: envie seus documentos para iniciar a homologação.
            </div>
            <Button variant="orange" full size="lg" style={{ borderRadius:12, marginBottom:12 }}
              onClick={() => navigate('/fornecedor/documentos')}>
              📋 Enviar Documentos →
            </Button>
            <Button variant="neutral" full size="md" style={{ borderRadius:10 }}
              onClick={() => navigate('/fornecedor')}>
              Ver Dashboard
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
