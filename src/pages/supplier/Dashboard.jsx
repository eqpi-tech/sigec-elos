import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { supplierApi } from '../../services/mockApi.js'
import { Badge, Seal, Button, Card, KpiCard, ScoreBar, StatusDot, Spinner, PageHeader, SectionTitle } from '../../components/ui.jsx'

const WEEK = [{ d:'Seg',v:28},{ d:'Ter',v:45},{ d:'Qua',v:32},{ d:'Qui',v:61},{ d:'Sex',v:55},{ d:'Sáb',v:20},{ d:'Dom',v:18}]

export default function SupplierDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supplierApi.me(user.supplierId).then(setData).finally(() => setLoading(false))
  }, [user.supplierId])

  if (loading) return <div style={{ display:'flex', justifyContent:'center', alignItems:'center', height:'50vh' }}><Spinner size={48} /></div>
  if (!data) return null

  const docs = data.documents || []
  const docsOk = docs.filter(d => d.status === 'VALID').length
  const docsWarn = docs.filter(d => d.status === 'EXPIRING').length
  const docsMissing = docs.filter(d => ['MISSING','EXPIRED'].includes(d.status)).length
  const progress = Math.round((docsOk / Math.max(docs.length, 1)) * 100)

  const firstName = user.name?.split(' ')[0] || 'Bem-vindo'
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'

  return (
    <div style={{ padding:'28px 32px', maxWidth:1200, margin:'0 auto' }}>
      <PageHeader
        title={`${greeting}, ${firstName}! 👋`}
        subtitle={`${data.razaoSocial} · CNPJ ${data.cnpj}`}
        action={data.sealLevel !== 'Premium' && <Button variant="orange" onClick={() => navigate('/fornecedor/planos')}>⭐ Upgrade para Premium</Button>}
      />

      {/* Alert banner */}
      {docsMissing > 0 && (
        <div className="fade-in-up" style={{ background:'rgba(239,68,68,.08)', border:'1px solid rgba(239,68,68,.25)', borderRadius:14, padding:'14px 20px', marginBottom:20, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <span style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, color:'#dc2626' }}>⚠ Atenção: {docsMissing} documento(s) pendente(s)</span>
            <span style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#7f1d1d', marginLeft:8 }}>Seu Selo ELOS pode ser suspenso.</span>
          </div>
          <Button variant="danger" size="sm" onClick={() => navigate('/fornecedor/documentos')}>Resolver agora</Button>
        </div>
      )}

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16, marginBottom:24 }}>
        <KpiCard label="Nível Atual"          value={data.sealLevel}  sub={`Score: ${data.score}/100`}      subColor="#9B9B9B"  icon="🏷️" iconBg="rgba(46,49,146,.1)" />
        <KpiCard label="Visualizações (30d)"  value="847"             sub="+23% vs mês anterior"            subColor="#F47E2F" icon="👁️" iconBg="rgba(244,126,47,.1)" />
        <KpiCard label="Cotações Recebidas"   value="12"              sub="3 aguardando resposta"           subColor="#8b5cf6" icon="📩" iconBg="rgba(139,92,246,.1)" />
        <KpiCard label="Documentos OK"        value={`${docsOk}/${docs.length}`} sub={docsWarn>0?`${docsWarn} vencendo em breve`:'Todos em dia'} subColor={docsWarn>0?'#f59e0b':'#22c55e'} icon="📋" iconBg="rgba(34,197,94,.1)" />
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:20 }}>
        <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
          {/* Progress banner */}
          <div style={{ background:'linear-gradient(135deg,#2E3192,#3d40b5)', borderRadius:16, padding:'24px 28px', color:'#fff' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <div>
                <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:16 }}>Jornada para o Selo ELOS Premium</div>
                <div style={{ fontSize:13, color:'rgba(255,255,255,.65)', marginTop:2, fontFamily:'DM Sans,sans-serif' }}>Complete os requisitos para desbloquear benefícios exclusivos</div>
              </div>
              <Seal level={data.sealLevel} size={64} />
            </div>
            <div style={{ marginBottom:16 }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                <span style={{ fontSize:12, color:'rgba(255,255,255,.7)' }}>Progresso atual</span>
                <span style={{ fontWeight:700, fontFamily:'Montserrat,sans-serif' }}>{progress}%</span>
              </div>
              <div style={{ height:8, borderRadius:8, background:'rgba(255,255,255,.15)', overflow:'hidden' }}>
                <div style={{ width:`${progress}%`, height:'100%', borderRadius:8, background:'linear-gradient(90deg,#F47E2F,#ff9a52)', transition:'width .8s' }} />
              </div>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              {[{label:'Dados Básicos',done:true},{label:'Fiscal',done:docsOk>1},{label:'Trabalhista',done:docsOk>3},{label:'ESG',done:data.sealLevel==='HOC'}].map((s,i)=>(
                <div key={i} style={{ flex:1, textAlign:'center', padding:'8px 10px', borderRadius:8, background:s.done?'rgba(255,255,255,.15)':'rgba(255,255,255,.06)', border:s.done?'1px solid rgba(255,255,255,.2)':'1px solid rgba(255,255,255,.08)' }}>
                  <div style={{ fontSize:16 }}>{s.done?'✅':'⏳'}</div>
                  <div style={{ fontSize:10, fontFamily:'Montserrat,sans-serif', fontWeight:600, marginTop:2, color:s.done?'#fff':'rgba(255,255,255,.4)' }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Documents preview */}
          <Card style={{ borderRadius:16, padding:'20px 24px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <SectionTitle>Status dos Documentos</SectionTitle>
              <div style={{ display:'flex', gap:12, fontSize:12 }}>
                <span style={{ color:'#22c55e' }}>✓ {docsOk} ok</span>
                {docsWarn>0 && <span style={{ color:'#f59e0b' }}>⚠ {docsWarn} vencendo</span>}
                {docsMissing>0 && <span style={{ color:'#ef4444' }}>✕ {docsMissing} faltando</span>}
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              {docs.slice(0,6).map((doc,i) => {
                const bgC = { VALID:'#f8fffe', EXPIRING:'#fffbeb', MISSING:'#fff5f5', EXPIRED:'#fff5f5' }
                const bdC = { VALID:'#dcfce7', EXPIRING:'#fef3c7', MISSING:'#fee2e2', EXPIRED:'#fee2e2' }
                return (
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:10, background:bgC[doc.status]||'#f8fffe', border:`1px solid ${bdC[doc.status]||'#dcfce7'}` }}>
                    <StatusDot status={doc.status} />
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:12, fontWeight:600, color:'#1a1c5e', fontFamily:'Montserrat,sans-serif' }}>{doc.label}</div>
                      {doc.expires && <div style={{ fontSize:10, color:'#9B9B9B' }}>vence: {doc.expires}</div>}
                      {doc.status==='MISSING' && <div style={{ fontSize:10, color:'#ef4444' }}>Enviar documento</div>}
                    </div>
                    {doc.status!=='VALID' && <Button variant="orange" size="sm" onClick={() => navigate('/fornecedor/documentos')}>{doc.status==='MISSING'?'Enviar':'Renovar'}</Button>}
                  </div>
                )
              })}
            </div>
            <div style={{ textAlign:'center', marginTop:12 }}>
              <Button variant="neutral" size="sm" onClick={() => navigate('/fornecedor/documentos')}>Ver todos os documentos →</Button>
            </div>
          </Card>
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
          {/* Mini chart */}
          <Card style={{ borderRadius:16, padding:'20px 24px' }}>
            <SectionTitle>Visualizações esta semana</SectionTitle>
            {WEEK.map((d,i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
                <span style={{ width:28, fontSize:11, color:'#9B9B9B', textAlign:'right' }}>{d.d}</span>
                <div style={{ flex:1, height:8, background:'#f4f5f9', borderRadius:4, overflow:'hidden' }}>
                  <div style={{ width:`${(d.v/70)*100}%`, height:'100%', borderRadius:4, background:d.v===61?'#F47E2F':'linear-gradient(90deg,#2E3192,#3d40b5)', transition:'width .6s' }} />
                </div>
                <span style={{ width:24, fontSize:11, fontWeight:600, color:'#1a1c5e', fontFamily:'Montserrat,sans-serif' }}>{d.v}</span>
              </div>
            ))}
          </Card>

          {/* Score */}
          <Card style={{ borderRadius:16, padding:'20px 24px' }}>
            <SectionTitle>Score de Conformidade</SectionTitle>
            <div style={{ textAlign:'center', marginBottom:12 }}>
              <div style={{ fontSize:48, fontWeight:900, color: data.score>=70?'#22c55e':data.score>=50?'#f59e0b':'#ef4444', fontFamily:'Montserrat,sans-serif', lineHeight:1 }}>{data.score}</div>
              <div style={{ fontSize:12, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>de 100 pontos</div>
            </div>
            <ScoreBar score={data.score} />
            <div style={{ fontSize:11, color:'#9B9B9B', marginTop:8, fontFamily:'DM Sans,sans-serif', textAlign:'center' }}>
              {data.score<70 ? 'Complete documentos pendentes para melhorar' : 'Bom nível de conformidade!'}
            </div>
          </Card>

          {/* Quick actions */}
          <Card style={{ borderRadius:16, padding:'20px 24px' }}>
            <SectionTitle>Ações Rápidas</SectionTitle>
            {[['📋','Enviar documento','','fornecedor/documentos'],['⭐','Ver planos','','fornecedor/planos'],['👁️','Ver meu perfil público','','']].map(([icon,label,_,path],i) => (
              <button key={i} onClick={() => path && navigate(`/${path}`)} style={{ display:'flex', alignItems:'center', gap:10, width:'100%', background:'rgba(46,49,146,.05)', border:'1px solid rgba(46,49,146,.1)', color:'#2E3192', borderRadius:10, padding:'10px 14px', fontFamily:'DM Sans,sans-serif', fontSize:13, fontWeight:600, cursor:'pointer', marginBottom:8, textAlign:'left', transition:'all .15s' }}>
                <span>{icon}</span> {label}
              </button>
            ))}
          </Card>
        </div>
      </div>
    </div>
  )
}
