import { useState, useEffect } from 'react'
import { adminApi } from '../../services/api.js'
import { Card, KpiCard, Spinner, PageHeader, SectionTitle } from '../../components/ui.jsx'

export default function BackofficeMetrics() {
  const [metrics, setMetrics] = useState(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => { adminApi.getMetrics().then(setMetrics).finally(()=>setLoading(false)) },[])
  if (loading) return <div style={{ display:'flex',justifyContent:'center',alignItems:'center',height:'50vh' }}><Spinner size={48}/></div>
  if (!metrics) return null
  return (
    <div style={{ padding:'28px 32px',maxWidth:1100,margin:'0 auto' }}>
      <PageHeader title="Métricas e KPIs" subtitle="Visão financeira e operacional do ecossistema SIGEC-ELOS"/>
      <div style={{ display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:16,marginBottom:24 }}>
        <KpiCard label="MRR Atual" value={metrics.mrrBrl>0?`R$ ${(metrics.mrrBrl/1000).toFixed(1)}k`:'R$ 0'} sub={`+${metrics.mrrGrowth}%`} subColor="#22c55e" icon="💰" iconBg="rgba(244,126,47,.1)"/>
        <KpiCard label="ARR Projetado" value={`R$ ${(metrics.mrrBrl*12/1000).toFixed(0)}k`} sub="Anualizado" subColor="#9B9B9B" icon="📈" iconBg="rgba(46,49,146,.1)"/>
        <KpiCard label="Churn Rate" value={`${metrics.churnRate}%`} sub="Mensal" subColor="#f59e0b" icon="📉" iconBg="rgba(245,158,11,.1)"/>
        <KpiCard label="Fornecedores" value={metrics.totalSuppliers.toLocaleString()} sub="Total na base" subColor="#9B9B9B" icon="🏭" iconBg="rgba(46,49,146,.1)"/>
      </div>
      <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:20 }}>
        <Card style={{ borderRadius:16,padding:'20px 24px' }}>
          <SectionTitle>Distribuição por Plano</SectionTitle>
          {Object.entries(metrics.byPlan).map(([plan,d])=>{
            const pct = metrics.totalSuppliers>0?Math.round((d.count/metrics.totalSuppliers)*100):0
            return (
              <div key={plan} style={{ marginBottom:20 }}>
                <div style={{ display:'flex',justifyContent:'space-between',marginBottom:6,alignItems:'center' }}>
                  <span style={{ fontFamily:'Montserrat,sans-serif',fontWeight:700,fontSize:14,color:'#1a1c5e' }}>{plan==='Premium'?'⭐':'🏷️'} {plan} <span style={{ fontWeight:400,fontSize:12,color:'#9B9B9B' }}>({d.count})</span></span>
                  <span style={{ fontFamily:'Montserrat,sans-serif',fontWeight:800,fontSize:14,color:plan==='Premium'?'#ea580c':'#2E3192' }}>R$ {(d.rev/1000).toFixed(1)}k/mês</span>
                </div>
                <div style={{ height:10,borderRadius:8,background:'#f4f5f9',overflow:'hidden' }}><div style={{ width:`${pct}%`,height:'100%',background:plan==='Premium'?'#F47E2F':'#2E3192',borderRadius:8 }}/></div>
                <div style={{ fontSize:11,color:'#9B9B9B',marginTop:3 }}>{pct}% da base</div>
              </div>
            )
          })}
        </Card>
        <Card style={{ borderRadius:16,padding:'20px 24px' }}>
          <SectionTitle>Funil do Ecossistema ELOS</SectionTitle>
          {[['Cadastros',metrics.totalSuppliers+20,'#e2e4ef','#9B9B9B'],['Ativos',metrics.totalSuppliers,'rgba(46,49,146,.15)','#2E3192'],['Selos ATIVOS',metrics.activeSeals,'#2E3192','#fff'],['Premium',metrics.byPlan.Premium.count,'#F47E2F','#fff']].map(([l,v,bg,color])=>(
            <div key={l} style={{ textAlign:'center',padding:'14px',background:bg,borderRadius:12,marginBottom:8,transition:'transform .2s' }}>
              <div style={{ fontSize:24,fontWeight:900,color,fontFamily:'Montserrat,sans-serif' }}>{v.toLocaleString()}</div>
              <div style={{ fontSize:12,color,opacity:.8,fontFamily:'DM Sans,sans-serif' }}>{l}</div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  )
}
