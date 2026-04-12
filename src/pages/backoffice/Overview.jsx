import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminApi } from '../../services/api.js'
import { Button, Card, KpiCard, Spinner, PageHeader, SectionTitle } from '../../components/ui.jsx'

export default function BackofficeOverview() {
  const navigate = useNavigate()
  const [metrics, setMetrics] = useState(null)
  const [queue, setQueue] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    Promise.allSettled([adminApi.getMetrics(), adminApi.getQueue()])
      .then(([metricsRes, queueRes]) => {
        setMetrics(metricsRes.status === 'fulfilled' ? metricsRes.value : {
          totalSuppliers:0, activeSeals:0, pendingAnalysis:0, mrrBrl:0, mrrGrowth:0,
          byPlan:{ Simples:{count:0,rev:0}, Premium:{count:0,rev:0} }, newThisMonth:0, churnRate:0,
        })
        setQueue(queueRes.status === 'fulfilled' ? queueRes.value : [])
      })
      .finally(() => setLoading(false))
  }, [])
  if (loading) return <div style={{ display:'flex',justifyContent:'center',alignItems:'center',height:'50vh' }}><Spinner size={48}/></div>
  const riskColor = { Alto:'#ef4444',Médio:'#f59e0b',Baixo:'#22c55e' }
  return (
    <div style={{ padding:'28px 32px',maxWidth:1200,margin:'0 auto' }}>
      <PageHeader title="Painel Backoffice" subtitle="EQPI Tech · Ecossistema SIGEC-ELOS"
        action={<div style={{ display:'flex',gap:8 }}><Button variant="neutral" onClick={()=>navigate('/backoffice/criar-usuario')}>+ Novo Usuário</Button><Button variant="primary" onClick={()=>navigate('/backoffice/fila')}>Ver Fila</Button></div>}/>
      <div style={{ display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:16,marginBottom:24 }}>
        <KpiCard label="Fornecedores" value={metrics.totalSuppliers.toLocaleString()} sub={`+${metrics.newThisMonth} este mês`} subColor="#2E3192" icon="🏭" iconBg="rgba(46,49,146,.1)"/>
        <KpiCard label="Selos Ativos" value={metrics.activeSeals.toLocaleString()} sub="84% aprovados" subColor="#22c55e" icon="✅" iconBg="rgba(34,197,94,.1)"/>
        <KpiCard label="MRR" value={metrics.mrrBrl>0?`R$ ${(metrics.mrrBrl/1000).toFixed(1)}k`:'R$ 0'} sub={`+${metrics.mrrGrowth}% vs mês ant.`} subColor="#F47E2F" icon="💰" iconBg="rgba(244,126,47,.1)"/>
        <KpiCard label="Pendentes" value={metrics.pendingAnalysis} sub="Aguardando" subColor="#f59e0b" icon="⏳" iconBg="rgba(245,158,11,.1)"/>
      </div>
      <div style={{ display:'grid',gridTemplateColumns:'2fr 1fr',gap:20 }}>
        <Card style={{ borderRadius:16,padding:'20px 24px' }}>
          <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16 }}><SectionTitle>Fila de Análise</SectionTitle><Button variant="neutral" size="sm" onClick={()=>navigate('/backoffice/fila')}>Ver todos →</Button></div>
          {queue.length===0?<div style={{ textAlign:'center',padding:'30px',color:'#9B9B9B' }}>✅ Fila vazia</div>:queue.slice(0,4).map((s,i)=>(
            <div key={i} style={{ display:'flex',alignItems:'center',gap:14,padding:'12px 14px',borderRadius:12,marginBottom:8,background:'#f4f5f9',border:'1px solid #e2e4ef' }}>
              <div style={{ width:40,height:40,borderRadius:10,background:'rgba(46,49,146,.1)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:800,fontSize:16,color:'#2E3192',fontFamily:'Montserrat,sans-serif',flexShrink:0 }}>{s.razaoSocial?.[0]}</div>
              <div style={{ flex:1,minWidth:0 }}><div style={{ fontSize:13,fontWeight:700,color:'#1a1c5e',fontFamily:'Montserrat,sans-serif',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{s.razaoSocial}</div><div style={{ fontSize:11,color:'#9B9B9B' }}>{s.cnpj}</div></div>
              <span style={{ fontSize:10,fontWeight:700,color:riskColor[s.riskLevel],background:`${riskColor[s.riskLevel]}18`,padding:'2px 8px',borderRadius:20,fontFamily:'Montserrat,sans-serif',whiteSpace:'nowrap' }}>Risco {s.riskLevel}</span>
              <Button variant="primary" size="sm" onClick={()=>navigate(`/backoffice/analise/${s.id}`)}>Analisar</Button>
            </div>
          ))}
        </Card>
        <div style={{ display:'flex',flexDirection:'column',gap:16 }}>
          <Card style={{ borderRadius:16,padding:'20px 24px' }}>
            <SectionTitle>Receita por Plano</SectionTitle>
            {Object.entries(metrics.byPlan).map(([plan,d])=>(
              <div key={plan} style={{ marginBottom:14 }}>
                <div style={{ display:'flex',justifyContent:'space-between',marginBottom:6 }}><span style={{ fontSize:13,fontWeight:600,color:'#1a1c5e' }}>{plan==='Premium'?'⭐':'🏷️'} {plan}</span><span style={{ fontSize:13,fontWeight:700,color:plan==='Premium'?'#ea580c':'#2E3192' }}>R$ {(d.rev/1000).toFixed(1)}k</span></div>
                <div style={{ height:8,borderRadius:8,background:'#f4f5f9',overflow:'hidden' }}><div style={{ width:`${metrics.mrrBrl>0?(d.rev/metrics.mrrBrl*100):0}%`,height:'100%',background:plan==='Premium'?'#F47E2F':'#2E3192',borderRadius:8 }} /></div>
              </div>
            ))}
          </Card>
          <div style={{ background:'linear-gradient(135deg,#2E3192,#3d40b5)',borderRadius:16,padding:'20px 24px',color:'#fff' }}>
            <SectionTitle style={{ color:'#fff',marginBottom:12 }}>Ações Rápidas</SectionTitle>
            {[['⏳','Fila de Análise','/backoffice/fila'],['📊','Métricas','/backoffice/metricas'],['👤','Criar Usuário','/backoffice/criar-usuario']].map(([i,l,p],idx)=>(
              <button key={idx} onClick={()=>navigate(p)} style={{ display:'flex',alignItems:'center',gap:10,width:'100%',background:'rgba(255,255,255,.1)',border:'1px solid rgba(255,255,255,.15)',color:'#fff',borderRadius:10,padding:'10px 14px',fontFamily:'DM Sans,sans-serif',fontSize:13,fontWeight:600,cursor:'pointer',marginBottom:8,textAlign:'left',transition:'all .15s' }}>
                <span>{i}</span> {l}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
