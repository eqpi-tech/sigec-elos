import { useState } from 'react'
import { useAuth } from '../../context/AuthContext.jsx'
import { paymentsApi } from '../../services/api.js'
import { Button, Card, PageHeader, Spinner } from '../../components/ui.jsx'

// Preço fixo por plano — sem variação por número de CNAEs
const PLANS = [
  { name:'Simples', icon:'🏷️', color:'#2563eb', highlight:false, price:290,
    features:[
      'Cartão CNPJ verificado automaticamente',
      'Consulta CEIS, CNEP (listas de sanções)',
      'Documentos básicos da categoria selecionada',
      'Monitoramento mensal automático de certidões',
      'Visibilidade no marketplace SIGEC-ELOS',
      'Alertas de documentos vencendo',
    ]
  },
  { name:'Premium', icon:'⭐', color:'#ea580c', highlight:true, price:990,
    features:[
      'Tudo do Simples +',
      'Documentos completos da categoria (todos os níveis)',
      'Consulta SERASA + análise de crédito',
      'Balanço patrimonial + DRE 2 anos',
      'Atestados técnicos e certificações ISO/ESG',
      'Prioridade nas buscas do marketplace',
      'Consultoria de regularização inclusa',
    ]
  },
]

export default function SupplierPlans() {
  const { user }  = useAuth()
  const [loading, setLoading] = useState(null)
  const [error, setError]     = useState('')

  const handleSubscribe = async (planType, price) => {
    if (!user?.supplierId) {
      setError('Complete o cadastro da empresa antes de assinar um plano.')
      return
    }
    setLoading(planType); setError('')
    try {
      const { url } = await paymentsApi.createCheckout({
        planType,
        cnaeCount: 3,    // fixo — não é mais perguntado ao usuário
        supplierId: user.supplierId,
        userEmail:  user.email,
        priceYearly: price,
      })
      window.location.href = url
    } catch (err) {
      setError(err.message)
      setLoading(null)
    }
  }

  return (
    <div style={{ maxWidth:800, margin:'0 auto', padding:'32px 24px' }}>
      <PageHeader title="Planos SIGEC-ELOS" subtitle="Escolha o plano ideal para sua empresa" />

      {error && (
        <div style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:12, padding:'12px 16px', marginBottom:20, fontSize:13, color:'#dc2626', fontFamily:'DM Sans,sans-serif' }}>
          {error}
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
        {PLANS.map(plan => {
          const monthly = Math.ceil(plan.price / 12)
          const busy    = loading === plan.name
          return (
            <div key={plan.name} style={{ background:'#fff', borderRadius:20, padding:'28px 24px', border:plan.highlight?`2px solid ${plan.color}`:'1px solid #e2e4ef', position:'relative', boxShadow:plan.highlight?`0 8px 32px rgba(244,126,47,.15)`:'0 2px 12px rgba(0,0,0,.04)' }}>
              {plan.highlight && (
                <div style={{ position:'absolute', top:-14, left:'50%', transform:'translateX(-50%)', background:'linear-gradient(135deg,#F47E2F,#ff9a52)', color:'#fff', fontSize:11, fontWeight:800, letterSpacing:1, padding:'4px 16px', borderRadius:20, fontFamily:'Montserrat,sans-serif', whiteSpace:'nowrap' }}>
                  ✦ MAIS POPULAR
                </div>
              )}
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
                <span style={{ fontSize:24 }}>{plan.icon}</span>
                <div style={{ fontSize:20, fontWeight:800, color:plan.color, fontFamily:'Montserrat,sans-serif' }}>{plan.name}</div>
              </div>
              <div style={{ marginBottom:20 }}>
                <div style={{ fontSize:36, fontWeight:900, color:'#1a1c5e', fontFamily:'Montserrat,sans-serif', lineHeight:1 }}>
                  R$ {plan.price.toLocaleString('pt-BR')}
                </div>
                <div style={{ fontSize:13, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', marginTop:4 }}>
                  /ano · ~R$ {monthly.toLocaleString('pt-BR')}/mês
                </div>
              </div>
              <div style={{ marginBottom:24 }}>
                {plan.features.map((f,i) => (
                  <div key={i} style={{ display:'flex', gap:8, alignItems:'flex-start', marginBottom:8 }}>
                    <span style={{ color:plan.color, fontSize:14, flexShrink:0 }}>✓</span>
                    <span style={{ fontSize:13, color:'#1a1c5e', fontFamily:'DM Sans,sans-serif', lineHeight:1.4 }}>{f}</span>
                  </div>
                ))}
              </div>
              <Button variant={plan.highlight?'orange':'primary'} full size="lg" style={{ borderRadius:12 }}
                disabled={!!loading} onClick={() => handleSubscribe(plan.name, plan.price)}>
                {busy ? <><Spinner size={16}/> Abrindo Stripe...</> : `Assinar ${plan.name} →`}
              </Button>
            </div>
          )
        })}
      </div>

      <div style={{ textAlign:'center', marginTop:24, fontSize:13, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', padding:16, background:'#fff', borderRadius:12, border:'1px solid #e2e4ef' }}>
        🔒 Pagamento seguro via <strong style={{ color:'#1a1c5e' }}>Stripe</strong> · Boleto, PIX e Cartão em até 12x · Cancele quando quiser
      </div>
    </div>
  )
}
