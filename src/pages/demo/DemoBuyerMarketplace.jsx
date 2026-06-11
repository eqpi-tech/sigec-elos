import { useState } from 'react'
import { Button, ScoreBar, Spinner } from '../../components/ui.jsx'
import { DEMO_MARKETPLACE } from './demoData.js'

const STATES  = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO']
const SIZES   = ['MEI','ME','EPP','Médio','Grande']
const CERTS   = ['ISO 9001','ISO 14001','ISO 45001','PBQP-H','OHSAS 18001']
const RADIUS  = [25, 50, 100, 200, 500]
const CATS = ['Manutenção Industrial','Serviços Elétricos','Automação & Controle','Construção Civil','Logística','TI e Telecomunicações','Segurança do Trabalho','Gestão Ambiental','Fornecimento de Materiais','Serviços de Limpeza','Transportes','Consultoria']
const CAPITAL_MAX = 10_000_000

function FilterSection({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ borderBottom:'1px solid #f0f0f7', paddingBottom:open?16:0, marginBottom:16 }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ width:'100%', display:'flex', justifyContent:'space-between', alignItems:'center', background:'none', border:'none', cursor:'pointer', padding:'0 0 12px', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:12, color:'#1a1c5e', textTransform:'uppercase', letterSpacing:.5 }}>
        {title}
        <span style={{ fontSize:14, color:'#9B9B9B', transform:open?'rotate(180deg)':'rotate(0deg)', transition:'transform .2s' }}>▾</span>
      </button>
      {open && children}
    </div>
  )
}

function Chip({ label, active, onClick, color = '#2E3192' }) {
  return (
    <button onClick={onClick} style={{ padding:'5px 10px', borderRadius:20, fontSize:11, fontFamily:'Montserrat,sans-serif', fontWeight:600, border:`1px solid ${active?color:'#e2e4ef'}`, background:active?`${color}14`:'#fff', color:active?color:'#9B9B9B', cursor:'pointer', whiteSpace:'nowrap', transition:'all .15s' }}>
      {active?'✓ ':''}{label}
    </button>
  )
}

function CapitalSlider({ min, max, onMin, onMax }) {
  const fmt = v => v >= 1_000_000 ? `R$ ${(v/1_000_000).toFixed(0)}M` : v >= 1000 ? `R$ ${(v/1000).toFixed(0)}K` : `R$ ${v}`
  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#9B9B9B', marginBottom:6 }}>
        <span>{fmt(min ?? 0)}</span>
        <span>{!max || max >= CAPITAL_MAX ? 'Sem limite' : fmt(max)}</span>
      </div>
      <input type="range" min={0} max={CAPITAL_MAX} step={50000} value={min ?? 0}
        onChange={e => onMin(Number(e.target.value) || undefined)} style={{ width:'100%', marginBottom:4 }}/>
      <input type="range" min={0} max={CAPITAL_MAX} step={50000} value={max ?? CAPITAL_MAX}
        onChange={e => onMax(Number(e.target.value) >= CAPITAL_MAX ? undefined : Number(e.target.value))} style={{ width:'100%' }}/>
    </div>
  )
}

export default function DemoBuyerMarketplace({ navigate }) {
  const [q,           setQ]           = useState('')
  const [cnae,        setCnae]        = useState('')
  const [city,        setCity]        = useState('')
  const [sts,         setSts]         = useState([])
  const [cats,        setCats]        = useState([])
  const [sizes,       setSizes]       = useState([])
  const [certs,       setCerts]       = useState([])
  const [sealType,    setSealType]    = useState('Todos')
  const [clientMin,   setClientMin]   = useState(0)
  const [simples,     setSimples]     = useState(undefined)
  const [capitalMin,  setCapitalMin]  = useState(undefined)
  const [capitalMax,  setCapitalMax]  = useState(undefined)
  const [cep,         setCep]         = useState('')
  const [radius,      setRadius]      = useState(50)
  const [searched,    setSearched]    = useState(false)
  const [loading,     setLoading]     = useState(false)
  const [selected,    setSelected]    = useState({})
  const [showRfq,     setShowRfq]     = useState(false)

  const toggleArr = (setter, val) => setter(arr => arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val])

  const activeCount = [q, cnae, city, sts.length, cats.length, sizes.length, certs.length, sealType!=='Todos', clientMin>0, simples!=null, capitalMin!=null||capitalMax!=null, cep.length===8].filter(Boolean).length

  const runSearch = () => {
    setLoading(true)
    setTimeout(() => { setLoading(false); setSearched(true) }, 700)
  }

  const reset = () => {
    setQ(''); setCnae(''); setCity(''); setSts([]); setCats([]); setSizes([]); setCerts([])
    setSealType('Todos'); setClientMin(0); setSimples(undefined); setCapitalMin(undefined); setCapitalMax(undefined)
    setCep(''); setSearched(false); setSelected({})
  }

  const sealBadge = s => {
    if (s.sealType === 'homologado') return { label:'Homologado', color:'#F47E2F' }
    if (s.sealType === 'verificado') return { label:'Verificado',  color:'#2E3192' }
    return { label:'Sem selo', color:'#9B9B9B' }
  }

  const results = DEMO_MARKETPLACE.filter(s => {
    if (q && !s.razao_social.toLowerCase().includes(q.toLowerCase())) return false
    if (sts.length && !sts.includes(s.state)) return false
    if (sizes.length && !sizes.includes(s.porte)) return false
    if (sealType !== 'Todos' && s.sealType !== sealType) return false
    return true
  })

  const selectedList = Object.values(selected)
  const inp = { width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#1a1c5e', boxSizing:'border-box', outline:'none' }

  return (
    <div style={{ display:'flex', height:'calc(100vh - 58px)', overflow:'hidden', background:'#f4f5f9' }}>

      {/* ── Sidebar ── */}
      <div style={{ width:280, flexShrink:0, overflowY:'auto', background:'#fff', borderRight:'1px solid #e2e4ef', padding:'20px 16px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:14, color:'#1a1c5e' }}>Filtros</div>
          {activeCount > 0 && (
            <button onClick={reset} style={{ fontSize:11, color:'#ea580c', background:'none', border:'none', cursor:'pointer', fontWeight:700 }}>
              Limpar ({activeCount})
            </button>
          )}
        </div>

        <FilterSection title="Busca">
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Nome ou CNPJ..." style={{ ...inp, marginBottom:8 }}/>
          <input value={cnae} onChange={e => setCnae(e.target.value)} placeholder="CNAE (descrição ou código)..." style={inp}/>
        </FilterSection>

        <FilterSection title="Categoria">
          <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
            {CATS.map(c => <Chip key={c} label={c} active={cats.includes(c)} onClick={() => toggleArr(setCats, c)} color="#7c3aed"/>)}
          </div>
        </FilterSection>

        <FilterSection title="Estado" defaultOpen={false}>
          <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
            {STATES.map(s => <Chip key={s} label={s} active={sts.includes(s)} onClick={() => toggleArr(setSts, s)}/>)}
          </div>
        </FilterSection>

        <FilterSection title="Cidade" defaultOpen={false}>
          <input value={city} onChange={e => setCity(e.target.value)} placeholder="Ex: Belo Horizonte" style={inp}/>
        </FilterSection>

        <FilterSection title="Geolocalização (raio)" defaultOpen={false}>
          <div style={{ fontSize:11, color:'#9B9B9B', marginBottom:8, lineHeight:1.4 }}>
            Digite o CEP para buscar fornecedores por proximidade.
          </div>
          <input value={cep} onChange={e => setCep(e.target.value.replace(/\D/g,'').slice(0,8))}
            placeholder="00000000" maxLength={8} style={{ ...inp, marginBottom:8, letterSpacing:2, textAlign:'center' }}/>
          <div style={{ fontSize:11, color:'#9B9B9B', marginBottom:6 }}>Raio: <strong style={{ color:'#2E3192' }}>{radius} km</strong></div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
            {RADIUS.map(r => <Chip key={r} label={`${r}km`} active={radius===r} onClick={() => setRadius(r)} color="#059669"/>)}
          </div>
        </FilterSection>

        <FilterSection title="Porte" defaultOpen={false}>
          <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
            {SIZES.map(s => <Chip key={s} label={s} active={sizes.includes(s)} onClick={() => toggleArr(setSizes, s)}/>)}
          </div>
        </FilterSection>

        <FilterSection title="Capital Social" defaultOpen={false}>
          <CapitalSlider min={capitalMin} max={capitalMax} onMin={setCapitalMin} onMax={setCapitalMax}/>
        </FilterSection>

        <FilterSection title="Simples Nacional" defaultOpen={false}>
          <div style={{ display:'flex', gap:5 }}>
            {[['Todos', undefined],['Optante', true],['Não optante', false]].map(([label, val]) => (
              <Chip key={label} label={label} active={simples===val} onClick={() => setSimples(val)} color="#7c3aed"/>
            ))}
          </div>
        </FilterSection>

        <FilterSection title="Selos ELOS" defaultOpen={false}>
          <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
            {[['Todos','Todos'],['Verificado','verificado'],['Homologado','homologado']].map(([label, val]) => (
              <Chip key={val} label={label} active={sealType===val} onClick={() => setSealType(val)} color="#F47E2F"/>
            ))}
          </div>
        </FilterSection>

        <FilterSection title="Selos de Cliente" defaultOpen={false}>
          <div style={{ fontSize:11, color:'#9B9B9B', marginBottom:8, lineHeight:1.4 }}>Mín. de processos homologados em clientes</div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
            {[0,1,2,3,5].map(n => (
              <Chip key={n} label={n===0?'Qualquer':`${n}+`} active={clientMin===n} onClick={() => setClientMin(n)} color="#059669"/>
            ))}
          </div>
        </FilterSection>

        <FilterSection title="Certificações" defaultOpen={false}>
          <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
            {CERTS.map(c => <Chip key={c} label={c} active={certs.includes(c)} onClick={() => toggleArr(setCerts, c)} color="#ea580c"/>)}
          </div>
        </FilterSection>

        <button onClick={runSearch} disabled={loading}
          style={{ width:'100%', padding:'13px', borderRadius:12, background:loading?'#e2e4ef':'linear-gradient(135deg,#2E3192,#3d40b5)', border:'none', color:'#fff', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:14, cursor:loading?'not-allowed':'pointer', marginTop:4 }}>
          {loading ? '⏳ Buscando...' : '🔍 Buscar Fornecedores'}
        </button>
      </div>

      {/* ── Results ── */}
      <div style={{ flex:1, overflowY:'auto', padding:'20px 24px' }}>

        {searched && !loading && (
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:10 }}>
            <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#9B9B9B' }}>
              <strong style={{ color:'#1a1c5e' }}>{results.length}</strong> fornecedor{results.length!==1?'es':''} encontrado{results.length!==1?'s':''}.
            </div>
            <div style={{ display:'flex', gap:8 }}>
              {selectedList.length > 0 && (
                <Button variant="orange" size="sm" onClick={() => navigate('rfq')}>
                  📝 Cotação ({selectedList.length})
                </Button>
              )}
              <button onClick={reset} style={{ padding:'6px 14px', borderRadius:8, background:'#EEF0FF', color:'#2E3192', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:11, border:'none', cursor:'pointer' }}>
                Limpar busca
              </button>
            </div>
          </div>
        )}

        {!searched && !loading && (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'60vh', textAlign:'center' }}>
            <div style={{ fontSize:64, marginBottom:16 }}>🔍</div>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:22, color:'#1a1c5e', marginBottom:8 }}>Marketplace de Fornecedores</div>
            <div style={{ fontSize:14, color:'#9B9B9B', maxWidth:400, lineHeight:1.6, marginBottom:28 }}>
              Use os filtros ao lado para encontrar fornecedores por CNAE, categoria, estado, porte, selos, capital social e mais.
            </div>
            <div style={{ display:'flex', gap:20, flexWrap:'wrap', justifyContent:'center' }}>
              {[['6.240+','Fornecedores ELOS'],['1.847','Verificados'],['148','Categorias'],['27','Estados']].map(([v,l]) => (
                <div key={l} style={{ background:'#fff', border:'1px solid #e2e4ef', borderRadius:12, padding:'16px 20px', textAlign:'center', minWidth:100 }}>
                  <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:24, color:'#F47E2F' }}>{v}</div>
                  <div style={{ fontSize:12, color:'#9B9B9B', marginTop:4, fontFamily:'DM Sans,sans-serif' }}>{l}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {loading && (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', padding:'80px 0', gap:16 }}>
            <Spinner size={48}/>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:15, color:'#1a1c5e' }}>Buscando fornecedores...</div>
          </div>
        )}

        {searched && !loading && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(290px, 1fr))', gap:16 }}>
            {results.map(s => {
              const isSel  = !!selected[s.id]
              const badge  = sealBadge(s)
              const scoreC = s.score>=90?'#22c55e':s.score>=70?'#f59e0b':'#ef4444'
              const initials = s.razao_social.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase()
              return (
                <div key={s.id}
                  style={{ background:'#fff', borderRadius:16, padding:18, border:isSel?'2px solid #2E3192':s.sealType==='homologado'?'2px solid rgba(244,126,47,.25)':'1px solid #e2e4ef', boxShadow:isSel?'0 4px 20px rgba(46,49,146,.15)':'0 1px 6px rgba(46,49,146,.05)', transition:'all .2s' }}
                  onMouseEnter={e => !isSel && (e.currentTarget.style.transform='translateY(-2px)')}
                  onMouseLeave={e => (e.currentTarget.style.transform='none')}>

                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
                    <div style={{ display:'flex', gap:10, alignItems:'center', minWidth:0 }}>
                      <div style={{ width:40, height:40, borderRadius:10, background:'#EEF0FF', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:700, color:'#2E3192', fontFamily:'Montserrat,sans-serif', flexShrink:0 }}>
                        {initials}
                      </div>
                      <div style={{ minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:700, color:'#1a1c5e', fontFamily:'Montserrat,sans-serif', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.razao_social}</div>
                        <div style={{ fontSize:11, color:'#9B9B9B', marginTop:2 }}>{s.city} · {s.state}</div>
                      </div>
                    </div>
                    <span style={{ fontSize:10, fontWeight:700, color:badge.color, background:`${badge.color}18`, padding:'3px 8px', borderRadius:20, fontFamily:'Montserrat,sans-serif', flexShrink:0, marginLeft:8, whiteSpace:'nowrap' }}>
                      {badge.label}
                    </span>
                  </div>

                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                    <span style={{ fontSize:10, color:'#9B9B9B' }}>Score:</span>
                    <div style={{ flex:1 }}><ScoreBar score={s.score||0}/></div>
                  </div>

                  <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginBottom:10 }}>
                    <span style={{ fontSize:9, background:'rgba(124,58,237,.08)', color:'#7c3aed', padding:'2px 7px', borderRadius:20, fontFamily:'Montserrat,sans-serif', fontWeight:600 }}>{s.cnae}</span>
                    <span style={{ fontSize:9, background:'#EEF0FF', color:'#2E3192', padding:'2px 7px', borderRadius:20, fontWeight:600 }}>{s.porte}</span>
                    {s.simples && <span style={{ fontSize:9, background:'#f0fdf4', color:'#16a34a', padding:'2px 7px', borderRadius:20, fontWeight:600 }}>Simples</span>}
                    {s.capital && <span style={{ fontSize:9, background:'#fff7ed', color:'#ea580c', padding:'2px 7px', borderRadius:20, fontWeight:600 }}>R$ {(s.capital/1000).toFixed(0)}K cap.</span>}
                  </div>

                  <div style={{ display:'flex', gap:8 }}>
                    <Button variant="primary" size="sm" style={{ flex:1, justifyContent:'center', borderRadius:8 }}
                      onClick={() => s.sealType && navigate('perfil')}>Ver Perfil</Button>
                    <button onClick={() => setSelected(m => { const n={...m}; if(n[s.id]) delete n[s.id]; else n[s.id]=s; return n })}
                      style={{ padding:'5px 12px', borderRadius:8, border:`1px solid ${isSel?'#2E3192':'#e2e4ef'}`, background:isSel?'rgba(46,49,146,.1)':'#fff', color:isSel?'#2E3192':'#9B9B9B', fontSize:11, fontFamily:'Montserrat,sans-serif', fontWeight:700, cursor:'pointer' }}>
                      {isSel ? '✓' : '+'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
