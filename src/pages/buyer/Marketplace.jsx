import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { marketplaceApi, rfqApi } from '../../services/api.js'
import { supabase } from '../../lib/supabase.js'
import { geocodeCep, getCityCoords, haversineKm } from '../../utils/geocoding.js'
import { Button, ScoreBar, Spinner } from '../../components/ui.jsx'

const STATES  = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO']
const SIZES   = ['MEI','ME','EPP','Médio','Grande']
const CERTS   = ['ISO 9001','ISO 14001','ISO 45001','PBQP-H','OHSAS 18001']
const RADIUS_OPTIONS = [25, 50, 100, 200, 500]
const CAPITAL_MAX_DISPLAY = 10_000_000

// ── RFQ Modal ────────────────────────────────────────────────────────────────
function BuyerRFQModal({ suppliers, user, onClose, onSent }) {
  const [category, setCategory] = useState('')
  const [message,  setMessage]  = useState('')
  const [sending,  setSending]  = useState(false)
  const inp = { width:'100%', padding:'10px 14px', borderRadius:10, border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#1a1c5e', boxSizing:'border-box', marginBottom:12, outline:'none' }

  const send = async () => {
    if (!message.trim()) { alert('Escreva uma mensagem para os fornecedores.'); return }
    setSending(true)
    try {
      await rfqApi.send({ supplierIds: suppliers.map(s => s.id), category, message, buyerId: user.id })
      onSent()
    } catch(e) { alert('Erro ao enviar cotação: ' + e.message) }
    finally { setSending(false) }
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:999, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ background:'#fff', borderRadius:20, padding:28, width:'100%', maxWidth:480, boxShadow:'0 20px 60px rgba(0,0,0,.2)' }}>
        <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:18, color:'#1a1c5e', marginBottom:6 }}>📝 Solicitar Cotação</div>
        <div style={{ fontSize:13, color:'#9B9B9B', marginBottom:20 }}>
          Para <strong style={{ color:'#2E3192' }}>{suppliers.length} fornecedor{suppliers.length !== 1 ? 'es' : ''}</strong> selecionado{suppliers.length !== 1 ? 's' : ''}.
        </div>
        <div style={{ fontSize:11, fontWeight:700, color:'#9B9B9B', textTransform:'uppercase', letterSpacing:.5, marginBottom:4 }}>Assunto / Categoria</div>
        <input value={category} onChange={e => setCategory(e.target.value)} placeholder="Ex: Serviço de manutenção elétrica" style={inp} />
        <div style={{ fontSize:11, fontWeight:700, color:'#9B9B9B', textTransform:'uppercase', letterSpacing:.5, marginBottom:4 }}>Mensagem *</div>
        <textarea value={message} onChange={e => setMessage(e.target.value)}
          placeholder="Descreva o que precisa, prazo, volume, local..." rows={5}
          style={{ ...inp, resize:'vertical' }} />
        <div style={{ display:'flex', gap:10, marginTop:8 }}>
          <Button variant="neutral" style={{ flex:1 }} onClick={onClose}>Cancelar</Button>
          <Button variant="primary" style={{ flex:1 }} onClick={send} disabled={sending}>
            {sending ? '⏳ Enviando...' : '📨 Enviar'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Seção colapsável do sidebar ───────────────────────────────────────────────
function FilterSection({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ borderBottom:'1px solid #f0f0f7', paddingBottom:open ? 16 : 0, marginBottom:16 }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ width:'100%', display:'flex', justifyContent:'space-between', alignItems:'center', background:'none', border:'none', cursor:'pointer', padding:'0 0 12px', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:12, color:'#1a1c5e', textTransform:'uppercase', letterSpacing:.5 }}>
        {title}
        <span style={{ fontSize:14, color:'#9B9B9B', transform:open?'rotate(180deg)':'rotate(0deg)', transition:'transform .2s' }}>▾</span>
      </button>
      {open && children}
    </div>
  )
}

// ── Chip multi-select ─────────────────────────────────────────────────────────
function MultiChip({ label, active, onClick, color = '#2E3192' }) {
  return (
    <button onClick={onClick} style={{
      padding:'5px 10px', borderRadius:20, fontSize:11, fontFamily:'Montserrat,sans-serif', fontWeight:600,
      border:`1px solid ${active ? color : '#e2e4ef'}`,
      background:active ? `${color}14` : '#fff',
      color:active ? color : '#9B9B9B',
      cursor:'pointer', whiteSpace:'nowrap', transition:'all .15s',
    }}>
      {active ? '✓ ' : ''}{label}
    </button>
  )
}

// ── Range slider capital social ───────────────────────────────────────────────
function CapitalSlider({ min, max, onMin, onMax }) {
  const fmt = v => v >= 1_000_000 ? `R$ ${(v/1_000_000).toFixed(0)}M` : v >= 1000 ? `R$ ${(v/1000).toFixed(0)}K` : `R$ ${v}`
  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#9B9B9B', marginBottom:6 }}>
        <span>{fmt(min ?? 0)}</span>
        <span>{max == null || max >= CAPITAL_MAX_DISPLAY ? 'Sem limite' : fmt(max)}</span>
      </div>
      <input type="range" min={0} max={CAPITAL_MAX_DISPLAY} step={50000}
        value={min ?? 0} onChange={e => onMin(Number(e.target.value) || undefined)}
        style={{ width:'100%', marginBottom:4 }} />
      <input type="range" min={0} max={CAPITAL_MAX_DISPLAY} step={50000}
        value={max ?? CAPITAL_MAX_DISPLAY} onChange={e => onMax(Number(e.target.value) >= CAPITAL_MAX_DISPLAY ? undefined : Number(e.target.value))}
        style={{ width:'100%' }} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
export default function BuyerMarketplace() {
  const navigate    = useNavigate()
  const { user }    = useAuth()

  // Dados estáticos
  const [dbCategories, setDbCategories] = useState([])

  // Filtros
  const [q,             setQ]             = useState('')
  const [cnae,          setCnae]          = useState('')
  const [cityInput,     setCityInput]     = useState('')
  const [states,        setStates]        = useState([])
  const [categoryIds,   setCategoryIds]   = useState([])
  const [sizes,         setSizes]         = useState([])
  const [certs,         setCerts]         = useState([])
  const [sealType,      setSealType]      = useState('Todos')
  const [clientSealMin, setClientSealMin] = useState(0)
  const [simples,       setSimples]       = useState(undefined)
  const [capitalMin,    setCapitalMin]    = useState(undefined)
  const [capitalMax,    setCapitalMax]    = useState(undefined)
  // Geo
  const [cepInput,      setCepInput]      = useState('')
  const [geoRadius,     setGeoRadius]     = useState(50)
  const [geoCenter,     setGeoCenter]     = useState(null)   // { lat, lng, city, state }
  const [geoLoading,    setGeoLoading]    = useState(false)
  const [geoError,      setGeoError]      = useState('')

  // Resultados
  const [results,     setResults]     = useState([])
  const [loading,     setLoading]     = useState(false)
  const [searched,    setSearched]    = useState(false)
  const [selectedMap, setSelectedMap] = useState({})
  const [showRfq,     setShowRfq]     = useState(false)

  useEffect(() => {
    supabase.from('categories').select('id, name').is('parent_id', null).order('name').limit(40)
      .then(({ data }) => setDbCategories(data || []))
  }, [])

  const toggleArr = (setter, val) => setter(arr => arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val])
  const selectedList = Object.values(selectedMap)

  // Geocodificar CEP quando tiver 8 dígitos
  useEffect(() => {
    const clean = cepInput.replace(/\D/g, '')
    if (clean.length !== 8) { setGeoCenter(null); setGeoError(''); return }
    setGeoLoading(true); setGeoError('')
    geocodeCep(clean)
      .then(geo => { setGeoCenter(geo); if (!geo.lat) setGeoError('Coordenadas não encontradas para este CEP — filtro de raio desativado.') })
      .catch(e => { setGeoError(e.message); setGeoCenter(null) })
      .finally(() => setGeoLoading(false))
  }, [cepInput])

  const runSearch = async () => {
    setLoading(true); setSearched(true)
    try {
      const { data } = await marketplaceApi.search({
        q, cnae, city: cityInput, states, categoryIds, sizes, certs,
        sealType, clientSealMin, simples, capitalMin, capitalMax,
      })

      let list = data || []

      // Filtro de geolocalização em JS (haversine)
      if (geoCenter?.lat && geoCenter?.lng) {
        list = list.map(s => {
          // Usar lat/lng do DB se disponível, senão lookup por cidade
          const lat = s.latitude  ?? getCityCoords(s.city, s.state)?.[0] ?? null
          const lng = s.longitude ?? getCityCoords(s.city, s.state)?.[1] ?? null
          const dist = (lat && lng) ? haversineKm(geoCenter.lat, geoCenter.lng, lat, lng) : null
          return { ...s, _dist: dist }
        })
        .filter(s => s._dist == null || s._dist <= geoRadius)
        .sort((a, b) => {
          if (a._dist == null && b._dist == null) return (b.score || 0) - (a.score || 0)
          if (a._dist == null) return 1
          if (b._dist == null) return -1
          return a._dist - b._dist
        })
      }

      setResults(list)
    } finally { setLoading(false) }
  }

  const resetFilters = () => {
    setQ(''); setCnae(''); setCityInput(''); setStates([]); setCategoryIds([])
    setSizes([]); setCerts([]); setSealType('Todos'); setClientSealMin(0)
    setSimples(undefined); setCapitalMin(undefined); setCapitalMax(undefined)
    setCepInput(''); setGeoCenter(null); setGeoError('')
  }

  const sealBadge = s => {
    if (s.sealType === 'homologado') return { label:'Homologado', color:'#F47E2F' }
    if (s.sealType === 'verificado') return { label:'Verificado',  color:'#2E3192' }
    return { label:'—', color:'#9B9B9B' }
  }

  const activeFilterCount = [
    q, cnae, cityInput,
    states.length > 0, categoryIds.length > 0, sizes.length > 0, certs.length > 0,
    sealType !== 'Todos', clientSealMin > 0,
    simples != null, capitalMin != null || capitalMax != null,
    geoCenter?.lat,
  ].filter(Boolean).length

  const inpStyle = { width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#1a1c5e', boxSizing:'border-box', outline:'none' }

  return (
    <div style={{ display:'flex', height:'calc(100vh - 58px)', overflow:'hidden', background:'#f4f5f9' }}>

      {/* ── Sidebar de filtros ───────────────────────────────────────── */}
      <div style={{ width:280, flexShrink:0, overflowY:'auto', background:'#fff', borderRight:'1px solid #e2e4ef', padding:'20px 16px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:14, color:'#1a1c5e' }}>Filtros</div>
          {activeFilterCount > 0 && (
            <button onClick={resetFilters} style={{ fontSize:11, color:'#ea580c', background:'none', border:'none', cursor:'pointer', fontWeight:700 }}>
              Limpar ({activeFilterCount})
            </button>
          )}
        </div>

        {/* Busca livre */}
        <FilterSection title="Busca" defaultOpen={true}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Nome ou CNPJ..." style={{ ...inpStyle, marginBottom:8 }} />
          <input value={cnae} onChange={e => setCnae(e.target.value)} placeholder="CNAE (descrição ou código)..." style={inpStyle} />
        </FilterSection>

        {/* Categoria */}
        <FilterSection title="Categoria" defaultOpen={true}>
          <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
            {dbCategories.map(c => (
              <MultiChip key={c.id} label={c.name} active={categoryIds.includes(c.id)}
                onClick={() => toggleArr(setCategoryIds, c.id)} />
            ))}
            {dbCategories.length === 0 && <div style={{ fontSize:12, color:'#9B9B9B' }}>Carregando...</div>}
          </div>
        </FilterSection>

        {/* Localização */}
        <FilterSection title="Estado" defaultOpen={false}>
          <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
            {STATES.map(s => (
              <MultiChip key={s} label={s} active={states.includes(s)} onClick={() => toggleArr(setStates, s)} />
            ))}
          </div>
          {states.length > 0 && (
            <button onClick={() => setStates([])} style={{ marginTop:6, fontSize:11, color:'#ea580c', background:'none', border:'none', cursor:'pointer', fontWeight:700 }}>
              Limpar estados
            </button>
          )}
        </FilterSection>

        <FilterSection title="Cidade" defaultOpen={false}>
          <input value={cityInput} onChange={e => setCityInput(e.target.value)} placeholder="Ex: Belo Horizonte" style={inpStyle} />
        </FilterSection>

        {/* Geolocalização por CEP */}
        <FilterSection title="Geolocalização (raio)" defaultOpen={false}>
          <div style={{ fontSize:11, color:'#9B9B9B', marginBottom:8, lineHeight:1.4 }}>
            Digite seu CEP para encontrar fornecedores dentro de um raio em km.
          </div>
          <input value={cepInput} onChange={e => setCepInput(e.target.value.replace(/\D/g,'').slice(0,8))}
            placeholder="00000000" maxLength={8}
            style={{ ...inpStyle, marginBottom:8, letterSpacing:2, textAlign:'center' }} />
          {geoLoading && <div style={{ fontSize:11, color:'#9B9B9B', marginBottom:8 }}>Buscando localização...</div>}
          {geoError  && <div style={{ fontSize:11, color:'#ea580c', marginBottom:8 }}>{geoError}</div>}
          {geoCenter?.lat && !geoError && (
            <div style={{ fontSize:11, color:'#22c55e', marginBottom:8 }}>
              📍 {geoCenter.city} / {geoCenter.state}
            </div>
          )}
          <div style={{ fontSize:11, color:'#9B9B9B', marginBottom:6 }}>Raio: <strong style={{ color:'#2E3192' }}>{geoRadius} km</strong></div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
            {RADIUS_OPTIONS.map(r => (
              <MultiChip key={r} label={`${r}km`} active={geoRadius === r} onClick={() => setGeoRadius(r)} color="#059669" />
            ))}
          </div>
        </FilterSection>

        {/* Empresa */}
        <FilterSection title="Porte" defaultOpen={false}>
          <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
            {SIZES.map(s => (
              <MultiChip key={s} label={s} active={sizes.includes(s)} onClick={() => toggleArr(setSizes, s)} />
            ))}
          </div>
        </FilterSection>

        <FilterSection title="Capital Social" defaultOpen={false}>
          <CapitalSlider min={capitalMin} max={capitalMax} onMin={setCapitalMin} onMax={setCapitalMax} />
        </FilterSection>

        <FilterSection title="Simples Nacional" defaultOpen={false}>
          <div style={{ display:'flex', gap:6 }}>
            {[['Todos', undefined],['Optante', true],['Não optante', false]].map(([label, val]) => (
              <MultiChip key={label} label={label} active={simples === val}
                onClick={() => setSimples(val)} color="#7c3aed" />
            ))}
          </div>
        </FilterSection>

        {/* Selos */}
        <FilterSection title="Selos ELOS" defaultOpen={false}>
          {[['Todos', 'Todos'],['Verificado', 'verificado'],['Homologado', 'homologado']].map(([label, val]) => (
            <MultiChip key={val} label={label} active={sealType === val}
              onClick={() => setSealType(val)} color="#F47E2F" />
          ))}
        </FilterSection>

        <FilterSection title="Selos de Cliente" defaultOpen={false}>
          <div style={{ fontSize:11, color:'#9B9B9B', marginBottom:8 }}>Mín. de processos homologados em clientes</div>
          <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
            {[0,1,2,3,5].map(n => (
              <MultiChip key={n} label={n === 0 ? 'Qualquer' : `${n}+`}
                active={clientSealMin === n} onClick={() => setClientSealMin(n)} color="#059669" />
            ))}
          </div>
        </FilterSection>

        <FilterSection title="Certificações" defaultOpen={false}>
          <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
            {CERTS.map(c => (
              <MultiChip key={c} label={c} active={certs.includes(c)}
                onClick={() => toggleArr(setCerts, c)} color="#ea580c" />
            ))}
          </div>
        </FilterSection>

        <button onClick={runSearch} disabled={loading}
          style={{ width:'100%', padding:'13px', borderRadius:12, background:loading ? '#e2e4ef' : 'linear-gradient(135deg,#2E3192,#3d40b5)', border:'none', color:'#fff', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:14, cursor:loading ? 'not-allowed' : 'pointer', marginTop:4 }}>
          {loading ? '⏳ Buscando...' : '🔍 Buscar Fornecedores'}
        </button>
      </div>

      {/* ── Área de resultados ───────────────────────────────────────── */}
      <div style={{ flex:1, overflowY:'auto', padding:'20px 24px' }}>

        {/* Header de resultados */}
        {searched && !loading && (
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:10 }}>
            <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#9B9B9B' }}>
              <strong style={{ color:'#1a1c5e' }}>{results.length}</strong> fornecedor{results.length !== 1 ? 'es' : ''} encontrado{results.length !== 1 ? 's' : ''}
              {results.length === 50 && <span style={{ color:'#F47E2F' }}> · máx. 50 exibidos</span>}
              {geoCenter?.lat && <span style={{ color:'#059669' }}> · ordenado por distância</span>}
            </div>
            <div style={{ display:'flex', gap:10, alignItems:'center' }}>
              {selectedList.length > 0 && (
                <>
                  <span style={{ fontSize:12, color:'#2E3192', fontWeight:600 }}>
                    {selectedList.length} selecionado{selectedList.length !== 1 ? 's' : ''}
                    {' — '}
                    <button onClick={() => setSelectedMap({})} style={{ background:'none', border:'none', color:'#ea580c', fontSize:12, cursor:'pointer', fontWeight:600 }}>Limpar</button>
                  </span>
                  {user?.buyerPlan === 'pro'
                    ? <Button variant="orange" onClick={() => setShowRfq(true)}>📝 Cotação ({selectedList.length})</Button>
                    : <button onClick={() => navigate('/comprador/plano')}
                        style={{ padding:'8px 14px', borderRadius:10, border:'2px dashed #F47E2F', background:'rgba(244,126,47,.06)', color:'#F47E2F', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:12, cursor:'pointer' }}>
                        🔒 RFQ (Pro) → Assinar
                      </button>
                  }
                </>
              )}
            </div>
          </div>
        )}

        {/* Estado inicial */}
        {!searched && !loading && (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'60vh', textAlign:'center' }}>
            <div style={{ fontSize:64, marginBottom:16 }}>🔍</div>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:22, color:'#1a1c5e', marginBottom:8 }}>
              Marketplace de Fornecedores
            </div>
            <div style={{ fontSize:14, color:'#9B9B9B', maxWidth:400, lineHeight:1.6 }}>
              Use os filtros ao lado para encontrar fornecedores homologados por CNAE, categoria, região, porte, selos e mais. Clique em <strong>Buscar Fornecedores</strong> para começar.
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ display:'flex', justifyContent:'center', padding:60 }}><Spinner size={48}/></div>
        )}

        {/* Sem resultados */}
        {searched && !loading && results.length === 0 && (
          <div style={{ textAlign:'center', padding:60 }}>
            <div style={{ fontSize:48 }}>😕</div>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:18, color:'#1a1c5e', marginTop:12 }}>Nenhum fornecedor encontrado</div>
            <div style={{ color:'#9B9B9B', marginTop:6 }}>Tente ajustar os filtros ou ampliar o raio de busca.</div>
          </div>
        )}

        {/* Grid de cards */}
        {searched && !loading && results.length > 0 && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(290px, 1fr))', gap:16 }}>
            {results.map(s => {
              const isSel  = !!selectedMap[s.id]
              const badge  = sealBadge(s)
              const dist   = s._dist != null ? Math.round(s._dist) : null

              return (
                <div key={s.id}
                  style={{ background:'#fff', borderRadius:16, padding:18, border:isSel ? '2px solid #2E3192' : s.sealType === 'homologado' ? '2px solid rgba(244,126,47,.25)' : '1px solid #e2e4ef', boxShadow:isSel ? '0 4px 20px rgba(46,49,146,.15)' : '0 1px 6px rgba(46,49,146,.05)', transition:'all .2s' }}
                  onMouseEnter={e => !isSel && (e.currentTarget.style.transform = 'translateY(-2px)')}
                  onMouseLeave={e => (e.currentTarget.style.transform = 'none')}>

                  {/* Header do card */}
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
                    <div style={{ display:'flex', gap:10, alignItems:'center', minWidth:0 }}>
                      <div style={{ width:40, height:40, borderRadius:10, background:'rgba(46,49,146,.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, fontWeight:700, color:'#2E3192', fontFamily:'Montserrat,sans-serif', flexShrink:0 }}>
                        {s.razao_social?.[0]}
                      </div>
                      <div style={{ minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:700, color:'#1a1c5e', fontFamily:'Montserrat,sans-serif', lineHeight:1.2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.razao_social}</div>
                        <div style={{ fontSize:11, color:'#9B9B9B', marginTop:2 }}>{[s.city, s.state].filter(Boolean).join(' · ')}</div>
                      </div>
                    </div>
                    <div style={{ flexShrink:0, marginLeft:8, textAlign:'right' }}>
                      <span style={{ fontSize:10, fontWeight:700, color:badge.color, background:`${badge.color}18`, padding:'3px 8px', borderRadius:20, fontFamily:'Montserrat,sans-serif', display:'block', whiteSpace:'nowrap' }}>
                        {badge.label}
                      </span>
                      {s.clientSealCount > 0 && (
                        <span style={{ fontSize:10, color:'#059669', fontWeight:600, display:'block', marginTop:3 }}>
                          🏅 {s.clientSealCount} cliente{s.clientSealCount !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Score */}
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                    <span style={{ fontSize:10, color:'#9B9B9B' }}>Score:</span>
                    <div style={{ flex:1 }}><ScoreBar score={s.score || 0}/></div>
                  </div>

                  {/* Tags */}
                  <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginBottom:10, minHeight:20 }}>
                    {s.cnae_main && (
                      <span style={{ fontSize:9, background:'rgba(124,58,237,.08)', color:'#7c3aed', padding:'2px 7px', borderRadius:20, fontFamily:'Montserrat,sans-serif', fontWeight:600 }}>
                        {s.cnae_main.length > 28 ? s.cnae_main.slice(0, 28) + '…' : s.cnae_main}
                      </span>
                    )}
                    {s.simples_nacional === true && (
                      <span style={{ fontSize:9, background:'rgba(34,197,94,.1)', color:'#16a34a', padding:'2px 7px', borderRadius:20, fontWeight:600 }}>Simples</span>
                    )}
                    {s.employee_range && (
                      <span style={{ fontSize:9, background:'rgba(46,49,146,.07)', color:'#2E3192', padding:'2px 7px', borderRadius:20, fontWeight:600 }}>{s.employee_range}</span>
                    )}
                    {dist != null && (
                      <span style={{ fontSize:9, background:'rgba(5,150,105,.1)', color:'#059669', padding:'2px 7px', borderRadius:20, fontWeight:600 }}>📍 {dist} km</span>
                    )}
                  </div>

                  {/* Capital social */}
                  {s.capital_social && (
                    <div style={{ fontSize:11, color:'#9B9B9B', marginBottom:8 }}>
                      Capital: <strong style={{ color:'#1a1c5e' }}>
                        {new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL', maximumFractionDigits:0 }).format(s.capital_social)}
                      </strong>
                    </div>
                  )}

                  {/* Ações */}
                  <div style={{ display:'flex', gap:8 }}>
                    <Button variant="primary" size="sm" style={{ flex:1, justifyContent:'center', borderRadius:8 }}
                      onClick={() => navigate(`/comprador/fornecedor/${s.id}`)}>Ver Perfil</Button>
                    <button onClick={() => setSelectedMap(m => { const n={...m}; if(n[s.id]) delete n[s.id]; else n[s.id]=s; return n })}
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

      {/* Modal RFQ */}
      {showRfq && (
        <BuyerRFQModal suppliers={selectedList} user={user}
          onClose={() => setShowRfq(false)}
          onSent={() => { setShowRfq(false); setSelectedMap({}); alert(`Cotação enviada para ${selectedList.length} fornecedor${selectedList.length !== 1 ? 'es' : ''}!`) }}
        />
      )}
    </div>
  )
}
