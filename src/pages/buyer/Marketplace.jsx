import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { marketplaceApi } from '../../services/api.js'
import { Badge, Button, Card, ScoreBar, Spinner, SectionTitle } from '../../components/ui.jsx'

const SmartBanner = ({ onDismiss }) => (
  <div style={{ background:'linear-gradient(135deg,#2E3192,#3d40b5)',borderRadius:16,padding:'20px 24px',marginBottom:20,display:'flex',justifyContent:'space-between',alignItems:'center',gap:16 }}>
    <div style={{ display:'flex',gap:16,alignItems:'center' }}>
      <div style={{ width:48,height:48,borderRadius:14,background:'rgba(255,255,255,.15)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:24,flexShrink:0 }}>💡</div>
      <div>
        <div style={{ fontFamily:'Montserrat,sans-serif',fontWeight:800,fontSize:14,color:'#fff',marginBottom:4 }}>Oportunidade Identificada pelo SIGEC</div>
        <div style={{ fontFamily:'DM Sans,sans-serif',fontSize:13,color:'rgba(255,255,255,.75)',lineHeight:1.5,maxWidth:520 }}>
          Temos fornecedores já homologados em outros clientes SIGEC com histórico comprovado de conformidade. <strong style={{ color:'#F47E2F' }}>Veja os Premiuns disponíveis →</strong>
        </div>
      </div>
    </div>
    <button onClick={onDismiss} style={{ background:'rgba(255,255,255,.1)',border:'1px solid rgba(255,255,255,.2)',borderRadius:8,color:'rgba(255,255,255,.6)',width:32,height:32,cursor:'pointer',fontSize:16 }}>✕</button>
  </div>
)

const STAGES = [{n:1,label:'Categoria',icon:'📦'},{n:2,label:'Região',icon:'📍'},{n:3,label:'Porte',icon:'🏢'},{n:4,label:'Certificações',icon:'🏆'},{n:5,label:'Nível SIGEC',icon:'✅'},{n:6,label:'Revisão',icon:'📋'},{n:7,label:'Resultados',icon:'🎯'}]
const CATEGORIES = ['Manutenção Industrial','Logística','Construção Civil','Meio Ambiente','Segurança do Trabalho','Tecnologia','Metalurgia','Outros']
const STATES = ['Todos','AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO']
const SIZES = ['Todos','MEI','ME','EPP','Médio','Grande']

export default function BuyerMarketplace() {
  const navigate = useNavigate()
  const [banner, setBanner] = useState(true)
  const [stage, setStage]   = useState(1)
  const [filters, setFilters] = useState({ category:'',state:'Todos',size:'Todos',level:'Todos',q:'',certs:[] })
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState([])
  const [searched, setSearched] = useState(false)
  const upd = (k,v) => setFilters(f=>({...f,[k]:v}))

  const runSearch = async () => {
    setLoading(true); setSearched(true)
    try {
      const { data } = await marketplaceApi.search(filters)
      setResults(data); setStage(7)
    } finally { setLoading(false) }
  }
  const toggleSelect = (id) => setSelected(s => s.includes(id) ? s.filter(x=>x!==id) : [...s,id])
  const chipStyle = (active,color='#2E3192') => ({ padding:'8px 14px',borderRadius:20,border:`1px solid ${active?color:'#e2e4ef'}`,background:active?`${color}12`:'#fff',color:active?color:'#9B9B9B',cursor:'pointer',fontFamily:'Montserrat,sans-serif',fontWeight:600,fontSize:12,transition:'all .15s',whiteSpace:'nowrap' })
  const inputStyle = { width:'100%',padding:'10px 14px',borderRadius:10,border:'1px solid #e2e4ef',fontFamily:'DM Sans,sans-serif',fontSize:14,color:'#1a1c5e',boxSizing:'border-box' }

  const renderStage = () => {
    if (stage === 1) return <div><div style={{ fontFamily:'Montserrat,sans-serif',fontWeight:700,fontSize:16,color:'#1a1c5e',marginBottom:16 }}>Qual categoria de fornecedor você procura?</div><div style={{ display:'flex',flexWrap:'wrap',gap:10,marginBottom:20 }}>{CATEGORIES.map(c=><button key={c} onClick={()=>upd('category',c)} style={chipStyle(filters.category===c)}>{c}</button>)}</div><input value={filters.q} onChange={e=>upd('q',e.target.value)} placeholder="Busca por nome, CNPJ ou serviço..." style={inputStyle} /></div>
    if (stage === 2) return <div><div style={{ fontFamily:'Montserrat,sans-serif',fontWeight:700,fontSize:16,color:'#1a1c5e',marginBottom:16 }}>Estado de atuação?</div><div style={{ display:'flex',flexWrap:'wrap',gap:8 }}>{STATES.map(s=><button key={s} onClick={()=>upd('state',s)} style={chipStyle(filters.state===s)}>{s==='Todos'?'🌎 Todos':s}</button>)}</div></div>
    if (stage === 3) return <div><div style={{ fontFamily:'Montserrat,sans-serif',fontWeight:700,fontSize:16,color:'#1a1c5e',marginBottom:16 }}>Porte da empresa?</div><div style={{ display:'flex',flexWrap:'wrap',gap:8 }}>{SIZES.map(s=><button key={s} onClick={()=>upd('size',s)} style={chipStyle(filters.size===s)}>{s}</button>)}</div></div>
    if (stage === 4) return <div><div style={{ fontFamily:'Montserrat,sans-serif',fontWeight:700,fontSize:16,color:'#1a1c5e',marginBottom:16 }}>Certificações exigidas?</div><div style={{ display:'flex',flexWrap:'wrap',gap:8 }}>{['ISO 9001','ISO 14001','ISO 45001','PBQP-H','OHSAS','Nenhuma obrigatória'].map(c=><button key={c} onClick={()=>{const n=filters.certs.includes(c)?filters.certs.filter(x=>x!==c):[...filters.certs,c];upd('certs',n)}} style={chipStyle(filters.certs.includes(c),'#ea580c')}>{c}</button>)}</div></div>
    if (stage === 5) return <div><div style={{ fontFamily:'Montserrat,sans-serif',fontWeight:700,fontSize:16,color:'#1a1c5e',marginBottom:16 }}>Nível de homologação SIGEC?</div><div style={{ display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12 }}>{[{l:'Todos',i:'🔍',d:'Qualquer nível'},{l:'Simples',i:'🏷️',d:'Conformidade básica'},{l:'Premium',i:'⭐',d:'Homologação completa'}].map(o=><button key={o.l} onClick={()=>upd('level',o.l)} style={{ padding:'16px',borderRadius:12,border:`2px solid ${filters.level===o.l?'#2E3192':'#e2e4ef'}`,background:filters.level===o.l?'rgba(46,49,146,.08)':'#fff',cursor:'pointer',textAlign:'center',transition:'all .15s' }}><div style={{ fontSize:24 }}>{o.i}</div><div style={{ fontFamily:'Montserrat,sans-serif',fontWeight:700,fontSize:13,color:filters.level===o.l?'#2E3192':'#1a1c5e',marginTop:4 }}>{o.l}</div><div style={{ fontSize:11,color:'#9B9B9B',marginTop:2 }}>{o.d}</div></button>)}</div></div>
    if (stage === 6) return <div><div style={{ fontFamily:'Montserrat,sans-serif',fontWeight:700,fontSize:16,color:'#1a1c5e',marginBottom:16 }}>Confirme os filtros</div><div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:10 }}>{[['Categoria',filters.category||'Todas'],['Região',filters.state],['Porte',filters.size],['Nível',filters.level],['Busca/CNPJ',filters.q||'—']].map(([k,v])=><div key={k} style={{ padding:'12px 14px',background:'rgba(46,49,146,.04)',borderRadius:10,border:'1px solid rgba(46,49,146,.08)' }}><div style={{ fontSize:10,color:'#9B9B9B',fontFamily:'Montserrat,sans-serif',textTransform:'uppercase',letterSpacing:.5 }}>{k}</div><div style={{ fontSize:14,fontFamily:'DM Sans,sans-serif',fontWeight:600,color:'#1a1c5e',marginTop:2 }}>{v}</div></div>)}</div></div>
  }

  return (
    <div style={{ display:'flex',height:'calc(100vh - 58px)',flexDirection:'column',overflow:'hidden' }}>
      <div style={{ flex:1,overflowY:'auto',padding:'20px 28px',background:'#f4f5f9' }}>
        {banner && <SmartBanner onDismiss={()=>setBanner(false)} />}

        {!searched && (
          <Card style={{ borderRadius:16,marginBottom:20 }}>
            <div style={{ display:'flex',alignItems:'center',gap:0,marginBottom:24,overflowX:'auto' }}>
              {STAGES.map((s,i)=>(
                <div key={s.n} style={{ display:'flex',alignItems:'center',flex:i<STAGES.length-1?1:'initial' }}>
                  <div onClick={()=>s.n<=stage&&setStage(s.n)} style={{ display:'flex',flexDirection:'column',alignItems:'center',cursor:s.n<=stage?'pointer':'default',minWidth:60 }}>
                    <div style={{ width:32,height:32,borderRadius:'50%',background:s.n<stage?'#22c55e':s.n===stage?'#2E3192':'#e2e4ef',display:'flex',alignItems:'center',justifyContent:'center',fontSize:s.n<=stage?14:12,transition:'all .3s',border:s.n===stage?'3px solid #3d40b5':'none',color:s.n<stage||s.n===stage?'#fff':'#9B9B9B' }}>
                      {s.n<stage?'✓':s.icon}
                    </div>
                    <div style={{ fontSize:9,fontFamily:'Montserrat,sans-serif',fontWeight:600,color:s.n===stage?'#2E3192':'#9B9B9B',marginTop:4,textAlign:'center' }}>{s.label}</div>
                  </div>
                  {i<STAGES.length-1&&<div style={{ flex:1,height:2,background:s.n<stage?'#22c55e':'#e2e4ef',margin:'0 4px 20px',transition:'background .3s' }} />}
                </div>
              ))}
            </div>
            <div style={{ minHeight:160 }}>{renderStage()}</div>
            {stage<7&&(
              <div style={{ display:'flex',justifyContent:'space-between',marginTop:20,paddingTop:16,borderTop:'1px solid #e2e4ef' }}>
                <Button variant="neutral" onClick={()=>setStage(s=>Math.max(1,s-1))} disabled={stage===1}>← Anterior</Button>
                {stage<6?<Button variant="primary" onClick={()=>setStage(s=>s+1)}>Próximo →</Button>:<Button variant="orange" size="lg" onClick={runSearch}>{loading?'⏳ Buscando...':'🔍 Buscar Fornecedores'}</Button>}
              </div>
            )}
          </Card>
        )}

        {searched&&(
          <div style={{ display:'flex',gap:12,marginBottom:16,alignItems:'center' }}>
            <div style={{ flex:1,position:'relative' }}>
              <span style={{ position:'absolute',left:14,top:'50%',transform:'translateY(-50%)',fontSize:16,color:'#9B9B9B' }}>🔍</span>
              <input value={filters.q} onChange={e=>upd('q',e.target.value)} placeholder="Refinar busca por nome ou CNPJ..." style={{ width:'100%',padding:'11px 14px 11px 42px',borderRadius:12,border:'1px solid #e2e4ef',background:'#fff',fontFamily:'DM Sans,sans-serif',fontSize:14,color:'#1a1c5e',boxSizing:'border-box' }} />
            </div>
            <Button variant="neutral" onClick={()=>{setSearched(false);setStage(1);setResults([])}}>Nova Pesquisa</Button>
            {selected.length>0&&<Button variant="orange">📝 Cotação ({selected.length})</Button>}
          </div>
        )}

        {searched&&(loading?<div style={{ display:'flex',justifyContent:'center',padding:'60px' }}><Spinner size={48}/></div>:(
          <>
            <div style={{ fontFamily:'DM Sans,sans-serif',fontSize:14,color:'#9B9B9B',marginBottom:16 }}><strong style={{ color:'#1a1c5e' }}>{results.length}</strong> fornecedores encontrados</div>
            {results.length===0?<div style={{ textAlign:'center',padding:'60px' }}><div style={{ fontSize:48 }}>🔍</div><div style={{ fontFamily:'Montserrat,sans-serif',fontWeight:700,fontSize:18,color:'#1a1c5e',marginTop:12 }}>Nenhum resultado</div><div style={{ color:'#9B9B9B',marginTop:6 }}>Tente ajustar os filtros</div></div>:(
              <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))',gap:16 }}>
                {results.map(s=>{
                  const isSel=selected.includes(s.id)
                  return (
                    <div key={s.id} style={{ background:'#fff',borderRadius:16,padding:20,border:isSel?'2px solid #2E3192':s.sealLevel==='Premium'?'2px solid rgba(244,126,47,.3)':'1px solid #e2e4ef',boxShadow:isSel?'0 4px 20px rgba(46,49,146,.2)':'0 1px 6px rgba(46,49,146,.06)',cursor:'pointer',transition:'all .2s' }}
                      onMouseEnter={e=>!isSel&&(e.currentTarget.style.transform='translateY(-2px)')}
                      onMouseLeave={e=>e.currentTarget.style.transform='none'}>
                      <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12 }}>
                        <div style={{ display:'flex',gap:10,alignItems:'center' }}>
                          <div style={{ width:44,height:44,borderRadius:12,background:'rgba(46,49,146,.1)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,fontWeight:700,color:'#2E3192',fontFamily:'Montserrat,sans-serif',flexShrink:0 }}>{s.razao_social?.[0]}</div>
                          <div><div style={{ fontSize:14,fontWeight:700,color:'#1a1c5e',fontFamily:'Montserrat,sans-serif' }}>{s.razao_social}</div><div style={{ fontSize:11,color:'#9B9B9B' }}>{s.city} · {s.state}</div></div>
                        </div>
                        <Badge level={s.sealLevel} />
                      </div>
                      <div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:10 }}><span style={{ fontSize:11,color:'#9B9B9B' }}>Score:</span><div style={{ flex:1 }}><ScoreBar score={s.score||0}/></div></div>
                      <div style={{ display:'flex',flexWrap:'wrap',gap:6,marginBottom:14 }}>
                        {s.services?.slice(0,2).map((sv,i)=><span key={i} style={{ fontSize:10,background:'rgba(46,49,146,.07)',color:'#2E3192',padding:'3px 8px',borderRadius:20 }}>{sv}</span>)}
                        {s.certifications?.slice(0,1).map((c,i)=><span key={i} style={{ fontSize:10,background:'rgba(34,197,94,.1)',color:'#16a34a',padding:'3px 8px',borderRadius:20 }}>✓ {c}</span>)}
                      </div>
                      <div style={{ display:'flex',gap:8 }}>
                        <Button variant="primary" size="sm" style={{ flex:1,justifyContent:'center',borderRadius:8 }} onClick={()=>navigate(`/comprador/fornecedor/${s.id}`)}>Ver Perfil</Button>
                        <button onClick={()=>toggleSelect(s.id)} style={{ padding:'5px 12px',borderRadius:8,border:`1px solid ${isSel?'#2E3192':'#e2e4ef'}`,background:isSel?'rgba(46,49,146,.1)':'#fff',color:isSel?'#2E3192':'#9B9B9B',fontSize:11,fontFamily:'Montserrat,sans-serif',fontWeight:700,cursor:'pointer' }}>{isSel?'✓ Selecionado':'+ Cotação'}</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        ))}
      </div>
    </div>
  )
}
