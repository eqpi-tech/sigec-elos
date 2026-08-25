import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext.jsx'
import { paymentsApi } from '../../services/api.js'
import { supabase } from '../../lib/supabase.js'
import { planLabel } from '../../lib/planLabels.js'
import { Button, Card, PageHeader, Spinner } from '../../components/ui.jsx'

const SEALS = [
  {
    type: 'verificado', name: 'ELOS Verificado', icon: '🔵', color: '#2E3192', highlight: false,
    priceAnual: 199, priceMensal: 29,
    badge: null,
    features: [
      'Verificação automática via Receita Federal e BrasilAPI',
      'Consulta de sanções (CEIS, CNEP)',
      'Perfil público no marketplace SIGEC-ELOS',
      'Perfil Comprador Free incluído automaticamente',
      'Alertas de vencimento de documentos',
      'Monitoramento mensal automático',
    ],
  },
  {
    type: 'homologado', name: 'ELOS Homologado', icon: '🏅', color: '#F47E2F', highlight: true,
    priceAnual: 690, priceMensal: null,
    badge: 'RECOMENDADO',
    features: [
      'Tudo do Verificado +',
      'Análise humana pelo backoffice EQPI',
      'Selo de Reputação: Bronze → Prata → Ouro',
      'Prioridade de exibição no marketplace',
      'Documentos completos da categoria (todos os níveis)',
      'Relatório Assertiva de análise de crédito',
      'Balanço patrimonial e DRE (2 anos)',
      'Elegível para processos de clientes HOC',
    ],
  },
]

export default function SupplierPlans() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(null)
  const [error,   setError]   = useState('')
  const [billing, setBilling] = useState({ verificado: 'anual' })
  const [currentPlan, setCurrentPlan] = useState(null)

  useEffect(() => {
    if (!user?.supplierId) return
    supabase.from('plans').select('type, status, ends_at')
      .eq('supplier_id', user.supplierId).maybeSingle()
      .then(({ data }) => setCurrentPlan(data))
  }, [user?.supplierId])

  // card correspondente ao plano vigente ('verificado_mensal' → card 'verificado')
  const currentCardType = currentPlan?.status === 'ACTIVE'
    ? (currentPlan.type || '').replace(/_(mensal|anual)$/, '') : null

  const handleSubscribe = async (sealType, price, cycle) => {
    if (!user?.supplierId) { setError('Complete o cadastro da empresa antes de assinar um plano.'); return }
    const stripeType = cycle === 'mensal' ? 'verificado_mensal' : `${sealType}_anual`
    setLoading(sealType); setError('')
    try {
      const { url } = await paymentsApi.createCheckout({
        planType: stripeType, cnaeCount: 3,
        supplierId: user.supplierId, userEmail: user.email, priceYearly: price,
      })
      window.location.href = url
    } catch (err) { setError(err.message); setLoading(null) }
  }

  return (
    <div style={{ maxWidth:860, margin:'0 auto', padding:'32px 24px' }}>
      <PageHeader title="Selos SIGEC-ELOS" subtitle="Escolha o nível de homologação para sua empresa"/>

      {currentPlan?.status === 'ACTIVE' && (
        <div style={{ background:'linear-gradient(135deg,#1a1c5e,#2E3192)', borderRadius:14, padding:'16px 22px', marginBottom:20, display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
          <div>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:15, color:'#fff' }}>
              ⭐ Seu plano atual: {planLabel(currentPlan.type)}
            </div>
            <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:12.5, color:'rgba(255,255,255,.7)', marginTop:2 }}>
              Válido até {currentPlan.ends_at?.slice(0,10) || '—'} · os valores abaixo servem de referência para upgrade ou renovação
            </div>
          </div>
        </div>
      )}

      {error && (
        <div style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:12, padding:'12px 16px', marginBottom:20, fontSize:13, color:'#dc2626', fontFamily:'DM Sans,sans-serif' }}>{error}</div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, marginBottom:24 }}>
        {SEALS.map(seal => {
          const cycle   = billing[seal.type] || 'anual'
          const price   = cycle === 'mensal' ? seal.priceMensal : seal.priceAnual
          const monthly = cycle === 'mensal' ? price : Math.ceil(price / 12)
          const busy    = loading === seal.type

          return (
            <div key={seal.type} style={{ background:'#fff', borderRadius:20, padding:'28px 24px', border: currentCardType===seal.type ? '2px solid #22c55e' : seal.highlight?`2px solid ${seal.color}`:'1px solid #e2e4ef', position:'relative', boxShadow:seal.highlight?`0 8px 32px rgba(244,126,47,.15)`:'0 2px 12px rgba(0,0,0,.04)' }}>
              {currentCardType===seal.type && (
                <span style={{ position:'absolute', top:-11, right:20, fontSize:10, fontWeight:800, fontFamily:'Montserrat,sans-serif', background:'#22c55e', color:'#fff', padding:'3px 12px', borderRadius:20 }}>SEU PLANO ATUAL</span>
              )}
              {seal.badge && (
                <div style={{ position:'absolute', top:-14, left:'50%', transform:'translateX(-50%)', background:'linear-gradient(135deg,#F47E2F,#ff9a52)', color:'#fff', fontSize:11, fontWeight:800, letterSpacing:1, padding:'4px 16px', borderRadius:20, fontFamily:'Montserrat,sans-serif', whiteSpace:'nowrap' }}>
                  ✦ {seal.badge}
                </div>
              )}
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
                <span style={{ fontSize:26 }}>{seal.icon}</span>
                <div style={{ fontSize:18, fontWeight:800, color:seal.color, fontFamily:'Montserrat,sans-serif' }}>{seal.name}</div>
              </div>

              {/* Periodicidade (só Verificado tem mensal) */}
              {seal.priceMensal && (
                <div style={{ display:'flex', gap:6, marginBottom:14 }}>
                  {['anual','mensal'].map(c => (
                    <button key={c} onClick={() => setBilling(p => ({...p, [seal.type]: c}))}
                      style={{ flex:1, padding:'6px', borderRadius:8, border:`1.5px solid ${cycle===c?seal.color:'#e2e4ef'}`, background:cycle===c?`${seal.color}10`:'#fff', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontSize:11, color:cycle===c?seal.color:'#9B9B9B', fontWeight:cycle===c?700:400 }}>
                      {c === 'anual' ? 'Anual' : 'Mensal'}
                    </button>
                  ))}
                </div>
              )}

              <div style={{ marginBottom:18 }}>
                <div style={{ fontSize:34, fontWeight:900, color:'#1a1c5e', fontFamily:'Montserrat,sans-serif', lineHeight:1 }}>
                  R$ {price.toLocaleString('pt-BR')}
                </div>
                <div style={{ fontSize:12, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', marginTop:4 }}>
                  {cycle === 'mensal' ? '/mês' : `/ano · ~R$ ${monthly}/mês`}
                </div>
              </div>

              <div style={{ marginBottom:22 }}>
                {seal.features.map((f, i) => (
                  <div key={i} style={{ display:'flex', gap:8, alignItems:'flex-start', marginBottom:7 }}>
                    <span style={{ color:seal.color, fontSize:13, flexShrink:0, marginTop:1 }}>✓</span>
                    <span style={{ fontSize:13, color:'#374151', fontFamily:'DM Sans,sans-serif', lineHeight:1.4 }}>{f}</span>
                  </div>
                ))}
              </div>

              <Button variant={seal.highlight ? 'orange' : 'primary'} full size="lg" style={{ borderRadius:12 }}
                disabled={!!loading} onClick={() => handleSubscribe(seal.type, price, cycle)}>
                {busy ? <><Spinner size={16}/> Abrindo Stripe...</> : `Contratar ${seal.name} →`}
              </Button>
            </div>
          )
        })}
      </div>

      {/* Selo de Reputação — informativo */}
      <Card style={{ borderRadius:16, padding:'20px 24px', background:'linear-gradient(135deg,#fff9f0,#fff)' }}>
        <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:14, color:'#1a1c5e', marginBottom:8 }}>
          🏅 Selo de Reputação — Bronze · Prata · Ouro
        </div>
        <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#64748b', lineHeight:1.6, marginBottom:12 }}>
          O Selo de Reputação não é comprado — ele é <strong>conquistado</strong> dentro do ELOS Homologado.
          É calculado com base na completude documental, tempo de casa, performance e indicadores ESG.
          Ele rege seu posicionamento no ranking do marketplace.
        </div>
        <div style={{ display:'flex', gap:16 }}>
          {[
            ['🥉','Bronze','Ponto de entrada após homologação','#cd7f32'],
            ['🥈','Prata','Documentação completa e histórico positivo','#9E9E9E'],
            ['🥇','Ouro','Excelência comprovada em múltiplos critérios','#FFD700'],
          ].map(([icon, tier, desc, color]) => (
            <div key={tier} style={{ flex:1, textAlign:'center', padding:'12px 8px', background:`${color}12`, borderRadius:12, border:`1px solid ${color}44` }}>
              <div style={{ fontSize:20 }}>{icon}</div>
              <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:12, color, marginTop:4 }}>{tier}</div>
              <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:10, color:'#64748b', marginTop:3, lineHeight:1.4 }}>{desc}</div>
            </div>
          ))}
        </div>
      </Card>

      <div style={{ textAlign:'center', marginTop:16, fontSize:12, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>
        🔒 Pagamento seguro via <strong style={{ color:'#1a1c5e' }}>Stripe</strong> · Boleto, PIX e Cartão em até 12x · Cancele quando quiser
      </div>
    </div>
  )
}
