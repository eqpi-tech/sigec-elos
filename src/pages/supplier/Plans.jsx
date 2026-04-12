import { useState } from 'react'
import { Button, Card, PageHeader } from '../../components/ui.jsx'

const CNAE_OPTS = ['Até 3', '4 a 10', '11 a 15', '16+']
const PLANS = [
  { name:'Simples', icon:'🏷️', color:'#2563eb', highlight:false,
    prices:[290,390,490,590],
    features:['Cartão CNPJ + CNAE verificado','Dados bancários','Listas restritivas (CEIS, CNEP, CEPIM)','Monitoramento básico mensal automático','Visibilidade na vitrine do marketplace','Alertas de documentos vencendo'],
    cta:'Começar Agora' },
  { name:'Premium', icon:'⭐', color:'#ea580c', highlight:true,
    prices:[990,1290,1690,2190],
    features:['Tudo do Simples +','Certidões fiscais plenas (CND Federal, Estadual, Municipal)','CRF (FGTS) + CNDT Trabalhista','Consulta SERASA + órgão de proteção ao crédito','Balanço patrimonial + DRE 2 anos','Atestados técnicos + Certificações ISO/ESG','Prioridade nas buscas do marketplace','Consultoria de regularização inclusa'],
    cta:'Assinar Premium' },
]

export default function SupplierPlans() {
  const [cnaeIdx, setCnaeIdx] = useState(0)
  const [selected, setSelected] = useState(null)
  const fmt = v => v.toLocaleString('pt-BR')

  return (
    <div style={{ maxWidth:860, margin:'0 auto', padding:'32px 24px' }}>
      <PageHeader title="Planos SIGEC-ELOS" subtitle="Escolha o plano ideal para sua empresa" />

      {/* CNAE selector */}
      <Card style={{ borderRadius:14, padding:'16px 20px', marginBottom:28 }}>
        <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, color:'#1a1c5e', marginBottom:12 }}>Quantos CNAEs sua empresa possui?</div>
        <div style={{ display:'flex', gap:8 }}>
          {CNAE_OPTS.map((opt,i) => (
            <button key={i} onClick={() => setCnaeIdx(i)} style={{ flex:1, padding:'10px', borderRadius:10, cursor:'pointer', border:cnaeIdx===i?'2px solid #2E3192':'1px solid #e2e4ef', background:cnaeIdx===i?'rgba(46,49,146,.08)':'#fff', color:cnaeIdx===i?'#2E3192':'#9B9B9B', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, transition:'all .15s' }}>
              {opt} CNAEs
            </button>
          ))}
        </div>
      </Card>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
        {PLANS.map(plan => {
          const price = plan.prices[cnaeIdx]
          const monthly = Math.ceil(price / 12)
          const isSelected = selected === plan.name
          return (
            <div key={plan.name} style={{ background:'#fff', borderRadius:20, padding:'28px 24px', border:plan.highlight?`2px solid ${plan.color}`:'1px solid #e2e4ef', position:'relative', boxShadow:plan.highlight?`0 8px 32px rgba(244,126,47,.15)`:'0 2px 12px rgba(0,0,0,.04)', transition:'transform .2s' }}>
              {plan.highlight && (
                <div style={{ position:'absolute', top:-14, left:'50%', transform:'translateX(-50%)', background:'linear-gradient(135deg,#F47E2F,#ff9a52)', color:'#fff', fontSize:11, fontWeight:800, letterSpacing:1, padding:'4px 16px', borderRadius:20, fontFamily:'Montserrat,sans-serif', whiteSpace:'nowrap' }}>✦ MAIS POPULAR</div>
              )}
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
                <span style={{ fontSize:24 }}>{plan.icon}</span>
                <div style={{ fontSize:20, fontWeight:800, color:plan.color, fontFamily:'Montserrat,sans-serif' }}>{plan.name}</div>
              </div>
              <div style={{ marginBottom:20 }}>
                <div style={{ fontSize:36, fontWeight:900, color:'#1a1c5e', fontFamily:'Montserrat,sans-serif', lineHeight:1 }}>R$ {fmt(price)}</div>
                <div style={{ fontSize:13, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', marginTop:4 }}>/ano · ou ~R$ {fmt(monthly)}/mês</div>
              </div>
              <div style={{ marginBottom:24 }}>
                {plan.features.map((f,i) => (
                  <div key={i} style={{ display:'flex', gap:8, alignItems:'flex-start', marginBottom:8 }}>
                    <span style={{ color:plan.color, fontSize:14, flexShrink:0 }}>✓</span>
                    <span style={{ fontSize:13, color:'#1a1c5e', fontFamily:'DM Sans,sans-serif', lineHeight:1.4 }}>{f}</span>
                  </div>
                ))}
              </div>
              {isSelected
                ? <div style={{ textAlign:'center', padding:'12px', background:'#f0fdf4', border:'1px solid #86efac', borderRadius:12, fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, color:'#16a34a' }}>✅ Plano selecionado — Redirecionando para pagamento...</div>
                : <Button variant={plan.highlight?'orange':'primary'} full size="lg" style={{ borderRadius:12 }} onClick={() => setSelected(plan.name)}>{plan.cta}</Button>
              }
            </div>
          )
        })}
      </div>

      <div style={{ textAlign:'center', marginTop:24, fontSize:13, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', padding:16, background:'#fff', borderRadius:12, border:'1px solid #e2e4ef' }}>
        🔒 Pagamento seguro via <strong style={{ color:'#1a1c5e' }}>Stripe</strong> ou <strong style={{ color:'#1a1c5e' }}>Pagar.me</strong> · Boleto, PIX e Cartão em até 12x · Cancele quando quiser
      </div>
    </div>
  )
}
