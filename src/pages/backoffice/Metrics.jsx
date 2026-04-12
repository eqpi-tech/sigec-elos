import { useState, useEffect } from 'react'
import { adminApi } from '../../services/mockApi.js'
import { Card, KpiCard, Spinner, PageHeader, SectionTitle } from '../../components/ui.jsx'

const BAR_MONTHS = [
  { m:'Jan', v:42 },{ m:'Fev', v:58 },{ m:'Mar', v:53 },{ m:'Abr', v:71 },
  { m:'Mai', v:89 },{ m:'Jun', v:94 },
]

export default function BackofficeMetrics() {
  const [metrics, setMetrics] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { adminApi.getMetrics().then(setMetrics).finally(() => setLoading(false)) }, [])

  if (loading) return <div style={{ display:'flex', justifyContent:'center', alignItems:'center', height:'50vh' }}><Spinner size={48} /></div>
  if (!metrics) return null

  return (
    <div style={{ padding:'28px 32px', maxWidth:1100, margin:'0 auto' }}>
      <PageHeader title="Métricas e KPIs" subtitle="Visão financeira e operacional do ecossistema SIGEC-ELOS" />

      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16, marginBottom:24 }}>
        <KpiCard label="MRR Atual"          value={`R$ ${(metrics.mrrBrl/1000).toFixed(1)}k`} sub={`+${metrics.mrrGrowth}% vs mês ant.`} subColor="#22c55e" icon="💰" iconBg="rgba(244,126,47,.1)" />
        <KpiCard label="ARR Projetado"      value={`R$ ${(metrics.mrrBrl*12/1000).toFixed(0)}k`} sub="Anualizado"                          subColor="#9B9B9B" icon="📈" iconBg="rgba(46,49,146,.1)" />
        <KpiCard label="Churn Rate"         value={`${metrics.churnRate}%`}                   sub="Mensal"                                subColor="#f59e0b" icon="📉" iconBg="rgba(245,158,11,.1)" />
        <KpiCard label="Ticket Médio Anual" value={`R$ ${Math.round(metrics.mrrBrl*12/metrics.totalSuppliers)}`} sub="Por fornecedor"       subColor="#9B9B9B" icon="🎫" iconBg="rgba(139,92,246,.1)" />
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:20 }}>
        {/* MRR chart */}
        <Card style={{ borderRadius:16, padding:'20px 24px' }}>
          <SectionTitle>Evolução do MRR (R$ mil)</SectionTitle>
          <div style={{ display:'flex', alignItems:'flex-end', gap:12, height:160, paddingTop:20 }}>
            {BAR_MONTHS.map((m,i) => (
              <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:6 }}>
                <div style={{ fontSize:11, fontWeight:700, color:'#2E3192', fontFamily:'Montserrat,sans-serif' }}>{m.v}</div>
                <div style={{ width:'100%', background:i===BAR_MONTHS.length-1?'#F47E2F':'linear-gradient(180deg,#3d40b5,#2E3192)', borderRadius:'6px 6px 0 0', height:`${(m.v/100)*120}px`, transition:'height .6s' }} />
                <div style={{ fontSize:10, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>{m.m}</div>
              </div>
            ))}
          </div>
        </Card>

        {/* Plan distribution */}
        <Card style={{ borderRadius:16, padding:'20px 24px' }}>
          <SectionTitle>Distribuição por Plano</SectionTitle>
          {Object.entries(metrics.byPlan).map(([plan, d]) => {
            const pct = Math.round((d.count / metrics.totalSuppliers) * 100)
            return (
              <div key={plan} style={{ marginBottom:20 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6, alignItems:'center' }}>
                  <div>
                    <span style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:14, color:'#1a1c5e' }}>{plan==='Premium'?'⭐':'🏷️'} {plan}</span>
                    <span style={{ fontFamily:'DM Sans,sans-serif', fontSize:12, color:'#9B9B9B', marginLeft:8 }}>{d.count} fornecedores</span>
                  </div>
                  <span style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:14, color:plan==='Premium'?'#ea580c':'#2E3192' }}>R$ {(d.rev/1000).toFixed(1)}k</span>
                </div>
                <div style={{ height:10, borderRadius:8, background:'#f4f5f9', overflow:'hidden' }}>
                  <div style={{ width:`${pct}%`, height:'100%', background:plan==='Premium'?'#F47E2F':'#2E3192', borderRadius:8 }} />
                </div>
                <div style={{ fontSize:11, color:'#9B9B9B', marginTop:3 }}>{pct}% da base</div>
              </div>
            )
          })}

          <div style={{ marginTop:20, padding:'12px', background:'rgba(46,49,146,.04)', borderRadius:10, border:'1px solid rgba(46,49,146,.08)' }}>
            <div style={{ fontSize:11, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', marginBottom:4 }}>Receita total (mês)</div>
            <div style={{ fontSize:24, fontWeight:900, color:'#2E3192', fontFamily:'Montserrat,sans-serif' }}>R$ {(metrics.mrrBrl/1000).toFixed(1)}k</div>
          </div>
        </Card>
      </div>

      {/* Funnel */}
      <Card style={{ borderRadius:16, padding:'20px 24px', marginTop:20 }}>
        <SectionTitle>Funil do Ecossistema ELOS</SectionTitle>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:12 }}>
          {[
            { label:'Cadastros',     value:metrics.totalSuppliers+623, color:'#e2e4ef', text:'#9B9B9B' },
            { label:'Com CNPJ',      value:metrics.totalSuppliers+200, color:'rgba(46,49,146,.15)', text:'#2E3192' },
            { label:'Documentação',  value:metrics.totalSuppliers,     color:'rgba(46,49,146,.25)', text:'#2E3192' },
            { label:'Selos Ativos',  value:metrics.activeSeals,        color:'#2E3192',             text:'#fff' },
            { label:'Premium',       value:metrics.byPlan.Premium.count, color:'#F47E2F',           text:'#fff' },
          ].map((f,i) => (
            <div key={i} style={{ textAlign:'center', padding:'20px 12px', background:f.color, borderRadius:12, transition:'transform .2s' }}>
              <div style={{ fontSize:24, fontWeight:900, color:f.text, fontFamily:'Montserrat,sans-serif' }}>{f.value.toLocaleString()}</div>
              <div style={{ fontSize:12, color:f.text, opacity:.8, fontFamily:'DM Sans,sans-serif', marginTop:4 }}>{f.label}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
