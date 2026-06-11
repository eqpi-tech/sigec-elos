import { useState } from 'react'
import { Button, ScoreBar, Spinner } from '../../components/ui.jsx'
import { DEMO_MARKETPLACE } from './demoData.js'

const STATES = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO']
const SIZES  = ['MEI','ME','EPP','Médio','Grande']

function FilterSection({ title, children, defaultOpen=true }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ borderBottom:'1px solid #f0f0f7', paddingBottom:open?16:0, marginBottom:16 }}>
      <button onClick={() => setOpen(o=>!o)} style={{ width:'100%', display:'flex', justifyContent:'space-between', alignItems:'center', background:'none', border:'none', cursor:'pointer', padding:'0 0 12px', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:12, color:'#1a1c5e', textTransform:'uppercase', letterSpacing:.5 }}>
        {title}
        <span style={{ fontSize:14, color:'#9B9B9B', transform:open?'rotate(180deg)':'none', transition:'transform .2s' }}>▾</span>
      </button>
      {open && children}
    </div>
  )
}

function Chip({ label, active, onClick, color='#2E3192' }) {
  return (
    <button onClick={onClick} style={{ padding:'5px 10px', borderRadius:20, fontSize:11, fontFamily:'Montserrat,sans-serif', fontWeight:600, border:`1px solid ${active?color:'#e2e4ef'}`, background:active?`${color}14`:'#fff', color:active?color:'#9B9B9B', cursor:'pointer', whiteSpace:'nowrap', transition:'all .15s' }}>
      {active?'✓ ':''}{label}
    </button>
  )
}

export default function DemoBuyerMarketplace({ navigate }) {
  const [q,        setQ]        = useState('')
  const [sts,      setSts]      = useState([])
  const [sizes,    setSizes]    = useState([])
  const [sealType, setSealType] = useState('Todos')
  const [searched, setSearched] = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [selected, setSelected] = useState({})

  const toggleArr = (setter, val) => setter(arr => arr.includes(val) ? arr.filter(x=>x!==val) : [...arr, val])
  const sealBadge = s => {
    if (s.sealType === 'homologado') return { label:'Homologado', color:'#F47E2F' }
    if (s.sealType === 'verificado') return { label:'Verificado',  color:'#2E3192' }
    return { label:'Sem selo', color:'#9B9B9B' }
  }

  const runSearch = () => {
    setLoading(true)
    setTimeout(() => { setLoading(false); setSearched(true) }, 800)
  }

  const inpStyle = { width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#1a1c5e', boxSizing:'border-box', outline:'none' }

  const results = DEMO_MARKETPLACE.filter(s => {
    if (q && !s.razao_social.toLowerCase().includes(q.toLowerCase())) return false
    if (sts.length && !sts.includes(s.state)) return false
    if (sizes.length && !sizes.includes(s.porte)) return false
    if (sealType !== 'Todos' && s.sealType !== sealType) return false
    return true
  })
  const selectedList = Object.values(selected)

  return (
    <div style={{ display:'flex', height:'calc(100vh - 58px)', overflow:'hidden', background:'#f4f5f9' }}>

      {/* ── Sidebar ── */}
      <div style={{ width:280, flexShrink:0, overflowY:'auto', background:'#fff', borderRight:'1px solid #e2e4ef', padding:'20px 16px' }}>
        <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:14, color:'#1a1c5e', marginBottom:16 }}>Filtros</div>

        <FilterSection title="Busca">
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Nome ou CNPJ..." style={{ ...inpStyle, marginBottom:8 }}/>
          <input placeholder="CNAE (descrição ou código)..." style={inpStyle}/>
        </FilterSection>

        <FilterSection title="Tipo de Selo">
          <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
            {['Todos','homologado','verificado'].map(v => (
              <Chip key={v} label={v==='Todos'?'Todos':v==='homologado'?'Homologado':'Verificado'} active={sealType===v} onClick={() => setSealType(v)} color="#F47E2F"/>
            ))}
          </div>
        </FilterSection>

        <FilterSection title="Estado" defaultOpen={false}>
          <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
            {STATES.map(s => <Chip key={s} label={s} active={sts.includes(s)} onClick={() => toggleArr(setSts, s)}/>)}
          </div>
        </FilterSection>

        <FilterSection title="Porte" defaultOpen={false}>
          <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
            {SIZES.map(s => <Chip key={s} label={s} active={sizes.includes(s)} onClick={() => toggleArr(setSizes, s)}/>)}
          </div>
        </FilterSection>

        <FilterSection title="Simples Nacional" defaultOpen={false}>
          <div style={{ display:'flex', gap:5 }}>
            {['Todos','Optante','Não optante'].map(v => (
              <Chip key={v} label={v} active={false} onClick={() => {}} color="#7c3aed"/>
            ))}
          </div>
        </FilterSection>

        <Button variant="primary" full size="lg" onClick={runSearch} style={{ marginTop:8 }}>
          🔍 Buscar fornecedores
        </Button>
      </div>

      {/* ── Results ── */}
      <div style={{ flex:1, overflowY:'auto', padding:'20px 24px' }}>
        {!searched && !loading && (
          <div style={{ textAlign:'center', padding:'80px 20px' }}>
            <div style={{ fontSize:48, marginBottom:16 }}>🔍</div>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:18, color:'#1a1c5e', marginBottom:8 }}>Busque fornecedores qualificados</div>
            <div style={{ fontSize:14, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', marginBottom:24 }}>Use os filtros ao lado e clique em Buscar para encontrar fornecedores verificados</div>
            <div style={{ display:'flex', justifyContent:'center', gap:24 }}>
              {[['6.240+','Fornecedores ELOS'],['1.847','Verificados hoje'],['148','Categorias']].map(([v,l]) => (
                <div key={l} style={{ background:'#fff', border:'1px solid #e2e4ef', borderRadius:12, padding:'16px 20px', textAlign:'center', boxShadow:'0 1px 6px rgba(46,49,146,.06)' }}>
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
          <>
            {/* Barra superior resultados */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
              <div>
                <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:16, color:'#1a1c5e' }}>{results.length} fornecedores encontrados</div>
                <div style={{ fontSize:12, color:'#9B9B9B', marginTop:2, fontFamily:'DM Sans,sans-serif' }}>
                  {sts.length>0?`Estado: ${sts.join(', ')} · `:''}
                  {sealType!=='Todos'?`${sealType==='homologado'?'Homologado':'Verificado'} · `:''}
                  Score: ≥70
                </div>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                {selectedList.length > 0 && (
                  <Button variant="orange" size="sm">📝 Cotação ({selectedList.length})</Button>
                )}
                <button onClick={() => { setSearched(false); setQ(''); setSts([]); setSizes([]) }}
                  style={{ padding:'6px 14px', borderRadius:8, background:'#EEF0FF', color:'#2E3192', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:11, border:'none', cursor:'pointer' }}>
                  Limpar busca
                </button>
              </div>
            </div>

            {/* Cards */}
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {results.map(s => {
                const badge  = sealBadge(s)
                const scoreC = s.score>=90?'#22c55e':s.score>=70?'#f59e0b':'#ef4444'
                const initials = s.razao_social.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase()
                const isSel  = !!selected[s.id]
                return (
                  <div key={s.id} style={{ background:'#fff', borderRadius:12, padding:'16px 18px', border:`1px solid ${isSel?'#2E3192':'#e2e4ef'}`, boxShadow:isSel?'0 0 0 2px rgba(46,49,146,.15)':'0 1px 4px rgba(0,0,0,.04)', cursor:s.sealType?'pointer':'default', opacity:s.sealType?1:.65 }}
                    onClick={() => s.sealType && navigate('perfil')}>
                    <div style={{ display:'flex', gap:14, alignItems:'flex-start' }}>
                      {/* Checkbox select */}
                      <div onClick={e => { e.stopPropagation(); if (!s.sealType) return; setSelected(prev => { const n={...prev}; isSel?delete n[s.id]:n[s.id]=s; return n }) }}
                        style={{ width:20, height:20, borderRadius:6, border:`2px solid ${isSel?'#2E3192':'#e2e4ef'}`, background:isSel?'#2E3192':'#fff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, cursor:s.sealType?'pointer':'default', marginTop:2 }}>
                        {isSel && <span style={{ color:'#fff', fontSize:11 }}>✓</span>}
                      </div>
                      {/* Avatar */}
                      <div style={{ width:44, height:44, borderRadius:12, background:'#EEF0FF', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:16, color:'#2E3192', flexShrink:0 }}>
                        {initials}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                          <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:14, color:'#1a1c5e' }}>{s.razao_social}</div>
                          <span style={{ fontSize:11, background:`${badge.color}15`, color:badge.color, padding:'2px 8px', borderRadius:20, fontFamily:'Montserrat,sans-serif', fontWeight:700 }}>{badge.label}</span>
                        </div>
                        <div style={{ fontSize:12, color:'#9B9B9B', marginTop:2, fontFamily:'DM Sans,sans-serif' }}>
                          {s.city}/{s.state} · {s.cnae}
                        </div>
                        <div style={{ display:'flex', gap:6, marginTop:6, flexWrap:'wrap' }}>
                          <span style={{ fontSize:11, background:'#EEF0FF', color:'#2E3192', padding:'2px 8px', borderRadius:20, fontFamily:'DM Sans,sans-serif' }}>{s.porte}</span>
                          {s.simples && <span style={{ fontSize:11, background:'#f0fdf4', color:'#16a34a', padding:'2px 8px', borderRadius:20, fontFamily:'DM Sans,sans-serif' }}>Simples Nacional</span>}
                          {s.capital && <span style={{ fontSize:11, background:'#fff7ed', color:'#ea580c', padding:'2px 8px', borderRadius:20, fontFamily:'DM Sans,sans-serif' }}>R$ {(s.capital/1000).toFixed(0)}K capital</span>}
                        </div>
                      </div>
                      <div style={{ flexShrink:0, textAlign:'right', minWidth:80 }}>
                        {s.score ? (
                          <>
                            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:22, color:scoreC, lineHeight:1 }}>{s.score}</div>
                            <div style={{ fontSize:10, color:'#9B9B9B', marginBottom:8 }}>score</div>
                            <ScoreBar score={s.score}/>
                          </>
                        ) : (
                          <span style={{ fontSize:11, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>Em análise</span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
