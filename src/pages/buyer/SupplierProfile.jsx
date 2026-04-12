import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { marketplaceApi, rfqApi } from '../../services/api.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { Badge, Seal, Button, Card, ScoreBar, StatusDot, Spinner } from '../../components/ui.jsx'

const TABS = ['Dados Cadastrais','Documentação','Portfólio','Histórico SIGEC']

export default function BuyerSupplierProfile() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab]       = useState(0)
  const [rfqSent, setRfqSent] = useState(false)

  useEffect(() => { marketplaceApi.getById(id).then(setData).finally(()=>setLoading(false)) }, [id])

  const sendRfq = async () => {
    try {
      await rfqApi.send({ supplierIds:[data.id], category: data.services?.[0] || 'Geral', message:'', buyerId: user.buyerId })
      setRfqSent(true)
    } catch(e) { console.error(e) }
  }

  if (loading) return <div style={{ display:'flex',justifyContent:'center',alignItems:'center',height:'50vh' }}><Spinner size={48}/></div>
  if (!data) return null
  const docs = data.documents||[]
  const okDocs = docs.filter(d=>d.status==='VALID').length

  return (
    <div style={{ maxWidth:980,margin:'0 auto',padding:'24px' }}>
      <button onClick={()=>navigate(-1)} style={{ background:'none',border:'none',cursor:'pointer',color:'#2E3192',fontSize:14,fontFamily:'DM Sans,sans-serif',fontWeight:600,marginBottom:16,display:'flex',alignItems:'center',gap:6,padding:0 }}>← Voltar ao Marketplace</button>
      <div style={{ background:'linear-gradient(135deg,#2E3192,#3d40b5)',borderRadius:20,padding:'28px 32px',marginBottom:20,color:'#fff',position:'relative',overflow:'hidden' }}>
        <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start' }}>
          <div style={{ display:'flex',gap:20,alignItems:'center' }}>
            <div style={{ width:72,height:72,borderRadius:18,background:'rgba(255,255,255,.12)',border:'2px solid rgba(255,255,255,.2)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:28,fontWeight:800,color:'#fff',fontFamily:'Montserrat,sans-serif' }}>{data.razao_social?.[0]}</div>
            <div>
              <div style={{ fontSize:22,fontWeight:800,fontFamily:'Montserrat,sans-serif' }}>{data.razao_social}</div>
              <div style={{ fontSize:14,color:'rgba(255,255,255,.7)',marginTop:2 }}>{data.city} · {data.state}</div>
              <div style={{ display:'flex',gap:16,marginTop:10 }}>
                <span style={{ fontSize:12,color:'rgba(255,255,255,.6)' }}>👥 {data.employee_range||'—'}</span>
                <span style={{ fontSize:12,color:'rgba(255,255,255,.6)' }}>💰 {data.revenue_range||'—'}</span>
              </div>
            </div>
          </div>
          <div style={{ display:'flex',flexDirection:'column',alignItems:'flex-end',gap:12 }}>
            <Seal level={data.sealLevel} size={80}/>
            <div style={{ background:'rgba(255,255,255,.12)',borderRadius:10,padding:'6px 12px',fontSize:10,color:'rgba(255,255,255,.7)',fontFamily:'Montserrat,sans-serif' }}>Verificado: {new Date().toLocaleDateString('pt-BR')}</div>
          </div>
        </div>
        <div style={{ display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginTop:24 }}>
          {[['SCORE',`${data.score||0}/100`],['CNPJ',data.cnpj||'—'],['DOCS VÁLIDOS',`${okDocs}/${docs.length||0}`],['SITUAÇÃO','Regular',true]].map(([l,v,g],i)=>(
            <div key={i} style={{ background:'rgba(255,255,255,.1)',borderRadius:12,padding:'10px 14px',border:'1px solid rgba(255,255,255,.1)' }}>
              <div style={{ fontSize:9,color:'rgba(255,255,255,.5)',fontFamily:'Montserrat,sans-serif',letterSpacing:.5 }}>{l}</div>
              <div style={{ fontSize:18,fontWeight:800,fontFamily:'Montserrat,sans-serif',color:g?'#4ade80':'#fff',marginTop:2 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display:'flex',gap:4,marginBottom:20,background:'#fff',padding:6,borderRadius:14,border:'1px solid #e2e4ef' }}>
        {TABS.map((t,i)=><button key={i} onClick={()=>setTab(i)} style={{ flex:1,padding:'10px',borderRadius:10,border:'none',cursor:'pointer',fontFamily:'Montserrat,sans-serif',fontWeight:600,fontSize:13,background:tab===i?'#2E3192':'transparent',color:tab===i?'#fff':'#9B9B9B',transition:'all .15s' }}>{t}</button>)}
      </div>
      {tab===0&&<div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:20 }}>{[['Razão Social',data.razao_social],['CNPJ',data.cnpj],['CNAE',data.cnae_main||'—'],['Localização',`${data.city}/${data.state}`],['Colaboradores',data.employee_range||'—'],['Faturamento',data.revenue_range||'—']].map(([l,v])=><Card key={l}><div style={{ fontSize:11,fontWeight:600,color:'#9B9B9B',fontFamily:'Montserrat,sans-serif',textTransform:'uppercase',letterSpacing:.5,marginBottom:4 }}>{l}</div><div style={{ fontSize:15,fontWeight:600,color:'#1a1c5e' }}>{v}</div></Card>)}</div>}
      {tab===1&&<Card style={{ borderRadius:16,padding:'20px 24px',marginBottom:20 }}>{docs.length===0?<div style={{ textAlign:'center',padding:'40px',color:'#9B9B9B' }}>Nenhum documento disponível</div>:docs.map((doc,i)=><div key={i} style={{ display:'flex',alignItems:'center',gap:16,padding:'12px 0',borderBottom:i<docs.length-1?'1px solid #e2e4ef':'none' }}><StatusDot status={doc.status}/><div style={{ flex:1 }}><div style={{ fontSize:14,fontWeight:600,color:'#1a1c5e',fontFamily:'Montserrat,sans-serif' }}>{doc.label}</div><div style={{ fontSize:12,color:'#9B9B9B' }}>{doc.expires_at?`Válido até ${doc.expires_at.slice(0,10)}`:'—'}</div></div><span style={{ fontSize:10,fontWeight:600,background:'rgba(46,49,146,.08)',color:'#2E3192',padding:'3px 10px',borderRadius:20,fontFamily:'Montserrat,sans-serif' }}>{doc.source==='AUTO'?'Auto':'Manual'}</span></div>)}</Card>}
      {tab===2&&<Card style={{ borderRadius:16,padding:'20px 24px',marginBottom:20 }}><div style={{ fontFamily:'Montserrat,sans-serif',fontWeight:700,fontSize:14,color:'#1a1c5e',marginBottom:10 }}>Serviços</div><div style={{ display:'flex',flexWrap:'wrap',gap:8 }}>{data.services?.map((sv,i)=><span key={i} style={{ fontSize:13,background:'rgba(46,49,146,.07)',color:'#2E3192',padding:'6px 14px',borderRadius:20 }}>{sv}</span>)}</div>{data.certifications?.length>0&&<><div style={{ fontFamily:'Montserrat,sans-serif',fontWeight:700,fontSize:14,color:'#1a1c5e',marginTop:16,marginBottom:10 }}>Certificações</div><div style={{ display:'flex',gap:8 }}>{data.certifications.map((c,i)=><span key={i} style={{ fontSize:13,background:'rgba(34,197,94,.1)',color:'#16a34a',padding:'6px 14px',borderRadius:20,fontWeight:600 }}>✓ {c}</span>)}</div></>}</Card>}
      {tab===3&&<Card style={{ borderRadius:16,padding:'20px 24px',marginBottom:20 }}><div style={{ fontSize:13,color:'#9B9B9B',fontFamily:'DM Sans,sans-serif',lineHeight:1.6 }}>Histórico de performance no ecossistema SIGEC disponível após homologação completa via SIGEC-HOC.</div></Card>}
      <div style={{ display:'flex',gap:12 }}>
        {rfqSent?<div style={{ flex:1,textAlign:'center',padding:'14px',background:'#f0fdf4',border:'1px solid #86efac',borderRadius:12,fontFamily:'Montserrat,sans-serif',fontWeight:700,fontSize:14,color:'#16a34a' }}>✅ Solicitação enviada!</div>:<Button variant="primary" full size="lg" style={{ borderRadius:12 }} onClick={sendRfq}>📩 Solicitar Cotação</Button>}
        <Button variant="ghost" full size="lg" style={{ borderRadius:12 }} onClick={() => window.open('https://www.sistemas-equipo.com.br/hoc-portal-cliente', '_blank')}>🔗 Iniciar SIGEC-HOC</Button>
      </div>
    </div>
  )
}
