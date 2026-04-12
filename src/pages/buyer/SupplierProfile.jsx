import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { marketplaceApi } from '../../services/mockApi.js'
import { Badge, Seal, Button, Card, ScoreBar, StatusDot, Spinner } from '../../components/ui.jsx'

const TABS = ['Dados Cadastrais','Documentação','Portfólio','Histórico SIGEC']

export default function BuyerSupplierProfile() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [data, setData]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab]     = useState(0)
  const [rfqSent, setRfqSent] = useState(false)

  useEffect(() => {
    marketplaceApi.getById(id).then(setData).finally(() => setLoading(false))
  }, [id])

  if (loading) return <div style={{ display:'flex', justifyContent:'center', alignItems:'center', height:'50vh' }}><Spinner size={48} /></div>
  if (!data) return null

  const docs = data.documents || []
  const docOk = docs.filter(d=>d.status==='VALID').length

  return (
    <div style={{ maxWidth:980, margin:'0 auto', padding:'24px 24px' }}>
      <button onClick={() => navigate(-1)} style={{ background:'none', border:'none', cursor:'pointer', color:'#2E3192', fontSize:14, fontFamily:'DM Sans,sans-serif', fontWeight:600, marginBottom:16, display:'flex', alignItems:'center', gap:6, padding:0 }}>← Voltar ao Marketplace</button>

      {/* Header banner */}
      <div style={{ background:'linear-gradient(135deg,#2E3192,#3d40b5)', borderRadius:20, padding:'28px 32px', marginBottom:20, color:'#fff', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', right:-20, top:-20, width:200, height:200, borderRadius:'50%', background:'rgba(255,255,255,.04)' }} />
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
          <div style={{ display:'flex', gap:20, alignItems:'center' }}>
            <div style={{ width:72, height:72, borderRadius:18, background:'rgba(255,255,255,.12)', border:'2px solid rgba(255,255,255,.2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, fontWeight:800, color:'#fff', fontFamily:'Montserrat,sans-serif' }}>{data.razaoSocial[0]}</div>
            <div>
              <div style={{ fontSize:22, fontWeight:800, fontFamily:'Montserrat,sans-serif' }}>{data.razaoSocial}</div>
              <div style={{ fontSize:14, color:'rgba(255,255,255,.7)', marginTop:2 }}>{data.city} · {data.state}</div>
              <div style={{ display:'flex', gap:16, marginTop:10 }}>
                <span style={{ fontSize:12, color:'rgba(255,255,255,.6)' }}>🏢 {data.employeeRange} colaboradores</span>
                <span style={{ fontSize:12, color:'rgba(255,255,255,.6)' }}>💰 {data.revenueRange}</span>
                {data.sealSince && <span style={{ fontSize:12, color:'rgba(255,255,255,.6)' }}>📅 No SIGEC desde {data.sealSince?.slice(0,7)}</span>}
              </div>
            </div>
          </div>
          <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:12 }}>
            <Seal level={data.sealLevel} size={80} />
            <div style={{ background:'rgba(255,255,255,.12)', borderRadius:10, padding:'8px 14px', textAlign:'center', border:'1px solid rgba(255,255,255,.15)' }}>
              <div style={{ fontSize:9, color:'rgba(255,255,255,.5)' }}>VERIFICADO EM</div>
              <div style={{ fontSize:12, fontWeight:700, fontFamily:'Montserrat,sans-serif' }}>{new Date().toLocaleDateString('pt-BR')}</div>
            </div>
          </div>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginTop:24 }}>
          {[
            { l:'SCORE ELOS',    v:`${data.score}/100` },
            { l:'CNAE PRINCIPAL', v:data.cnaeMain },
            { l:'DOCS VALIDADOS', v:`${docOk}/${docs.length}` },
            { l:'SITUAÇÃO',      v:'Regular', green:true },
          ].map((k,i) => (
            <div key={i} style={{ background:'rgba(255,255,255,.1)', borderRadius:12, padding:'12px 16px', border:'1px solid rgba(255,255,255,.1)' }}>
              <div style={{ fontSize:9, color:'rgba(255,255,255,.5)', fontFamily:'Montserrat,sans-serif', letterSpacing:.5 }}>{k.l}</div>
              <div style={{ fontSize:18, fontWeight:800, fontFamily:'Montserrat,sans-serif', color:k.green?'#4ade80':'#fff', marginTop:2 }}>{k.v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, marginBottom:20, background:'#fff', padding:6, borderRadius:14, border:'1px solid #e2e4ef' }}>
        {TABS.map((t,i) => (
          <button key={i} onClick={() => setTab(i)} style={{ flex:1, padding:'10px', borderRadius:10, border:'none', cursor:'pointer', fontFamily:'Montserrat,sans-serif', fontWeight:600, fontSize:13, background:tab===i?'#2E3192':'transparent', color:tab===i?'#fff':'#9B9B9B', transition:'all .15s' }}>{t}</button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 0 && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:20 }}>
          {[['Razão Social',data.razaoSocial],['CNPJ',data.cnpj],['CNAE Principal',data.cnaeMain],['Estado',`${data.city} · ${data.state}`],['Colaboradores',data.employeeRange||'—'],['Faturamento',data.revenueRange||'—']].map(([l,v])=>(
            <Card key={l}>
              <div style={{ fontSize:11, fontWeight:600, color:'#9B9B9B', fontFamily:'Montserrat,sans-serif', letterSpacing:.5, marginBottom:4, textTransform:'uppercase' }}>{l}</div>
              <div style={{ fontSize:15, fontWeight:600, color:'#1a1c5e' }}>{v}</div>
            </Card>
          ))}
        </div>
      )}

      {tab === 1 && (
        <Card style={{ borderRadius:16, padding:'20px 24px', marginBottom:20 }}>
          {docs.length === 0
            ? <div style={{ textAlign:'center', padding:'40px', color:'#9B9B9B' }}>Nenhum documento disponível</div>
            : docs.map((doc,i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:16, padding:'12px 0', borderBottom:i<docs.length-1?'1px solid #e2e4ef':'none' }}>
                <div style={{ width:32, height:32, borderRadius:8, background:doc.status==='VALID'?'#f0fdf4':'#fff5f5', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <StatusDot status={doc.status} />
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:600, color:'#1a1c5e', fontFamily:'Montserrat,sans-serif' }}>{doc.label}</div>
                  <div style={{ fontSize:12, color:'#9B9B9B' }}>{doc.expires ? `Válido até ${doc.expires}` : 'Sem prazo de vencimento'}</div>
                </div>
                <span style={{ fontSize:10, fontWeight:600, background:doc.status==='VALID'?'rgba(46,49,146,.08)':'rgba(239,68,68,.08)', color:doc.status==='VALID'?'#2E3192':'#dc2626', padding:'3px 10px', borderRadius:20, fontFamily:'Montserrat,sans-serif' }}>{doc.source==='AUTO'?'Auto-coletado':'Manual'}</span>
              </div>
            ))
          }
        </Card>
      )}

      {tab === 2 && (
        <Card style={{ borderRadius:16, padding:'20px 24px', marginBottom:20 }}>
          <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:15, color:'#1a1c5e', marginBottom:12 }}>Serviços prestados</div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:20 }}>
            {data.services?.map((sv,i) => (
              <span key={i} style={{ fontSize:13, background:'rgba(46,49,146,.07)', color:'#2E3192', padding:'6px 14px', borderRadius:20 }}>{sv}</span>
            ))}
          </div>
          {data.certifications?.length > 0 && (
            <>
              <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:15, color:'#1a1c5e', marginBottom:12 }}>Certificações</div>
              <div style={{ display:'flex', gap:8 }}>
                {data.certifications.map((c,i) => (
                  <span key={i} style={{ fontSize:13, background:'rgba(34,197,94,.1)', color:'#16a34a', padding:'6px 14px', borderRadius:20, fontWeight:600 }}>✓ {c}</span>
                ))}
              </div>
            </>
          )}
        </Card>
      )}

      {tab === 3 && (
        <Card style={{ borderRadius:16, padding:'20px 24px', marginBottom:20 }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16, marginBottom:20 }}>
            {[['Ativo em clientes SIGEC','3','#2E3192'],['Score de performance','94/100','#22c55e'],['Não conformidades','0','#22c55e']].map(([l,v,c])=>(
              <div key={l} style={{ textAlign:'center', padding:'20px', background:'rgba(46,49,146,.04)', borderRadius:14, border:'1px solid rgba(46,49,146,.08)' }}>
                <div style={{ fontSize:28, fontWeight:900, color:c, fontFamily:'Montserrat,sans-serif' }}>{v}</div>
                <div style={{ fontSize:12, color:'#9B9B9B', marginTop:4 }}>{l}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize:13, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', lineHeight:1.6 }}>
            Este fornecedor possui histórico positivo comprovado dentro do ecossistema SIGEC, com avaliações consistentes pelos contratantes e zero ocorrências registradas nos últimos 12 meses.
          </div>
        </Card>
      )}

      {/* CTAs */}
      <div style={{ display:'flex', gap:12 }}>
        {rfqSent
          ? <div style={{ flex:1, textAlign:'center', padding:'14px', background:'#f0fdf4', border:'1px solid #86efac', borderRadius:12, fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:14, color:'#16a34a' }}>✅ Solicitação de cotação enviada com sucesso!</div>
          : <Button variant="primary" full size="lg" style={{ borderRadius:12 }} onClick={() => setRfqSent(true)}>📩 Solicitar Cotação</Button>
        }
        <Button variant="ghost" full size="lg" style={{ borderRadius:12 }}>🔗 Iniciar Homologação HOC</Button>
      </div>
    </div>
  )
}
