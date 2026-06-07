import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { marketplaceApi, rfqApi } from '../../services/api.js'
import { supabase } from '../../lib/supabase.js'
import { Badge, Button, Card, ScoreBar, Spinner } from '../../components/ui.jsx'

const STAGES = [
  { n:1, label:'Categoria', icon:'📦' },
  { n:2, label:'Região',    icon:'📍' },
  { n:3, label:'Porte',     icon:'🏢' },
  { n:4, label:'Selos',     icon:'✅' },
  { n:5, label:'Revisão',   icon:'📋' },
  { n:6, label:'Resultados',icon:'🎯' },
]

const STATES  = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO']
const SIZES   = ['MEI','ME','EPP','Médio','Grande']
const CERTS   = ['ISO 9001','ISO 14001','ISO 45001','PBQP-H','OHSAS 18001']
const SEAL_TYPES = [
  { v:'Todos',      i:'🔍', d:'Qualquer nível de homologação' },
  { v:'verificado', i:'🔵', d:'Pré-homologação automática — CNPJ, certidões e documentos básicos verificados' },
  { v:'homologado', i:'⭐', d:'Homologação profissional — análise humana, documentos técnicos e parecer' },
]

function BuyerRFQModal({ suppliers, user, onClose, onSent }) {
  const [category, setCategory] = useState('')
  const [message,  setMessage]  = useState('')
  const [sending,  setSending]  = useState(false)
  const inp = { width:'100%', padding:'10px 14px', borderRadius:10, border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#1a1c5e', boxSizing:'border-box', marginBottom:12 }

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
        <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:18, color:'#1a1c5e', marginBottom:6 }}>
          📝 Solicitar Cotação
        </div>
        <div style={{ fontSize:13, color:'#9B9B9B', marginBottom:20 }}>
          Será enviada para <strong style={{ color:'#2E3192' }}>{suppliers.length} fornecedor{suppliers.length !== 1 ? 'es' : ''}</strong> selecionado{suppliers.length !== 1 ? 's' : ''}.
        </div>

        <div style={{ fontSize:11, fontWeight:700, color:'#9B9B9B', textTransform:'uppercase', letterSpacing:.5, marginBottom:4 }}>Assunto / Categoria</div>
        <input value={category} onChange={e => setCategory(e.target.value)} placeholder="Ex: Serviço de manutenção elétrica" style={inp} />

        <div style={{ fontSize:11, fontWeight:700, color:'#9B9B9B', textTransform:'uppercase', letterSpacing:.5, marginBottom:4 }}>Mensagem *</div>
        <textarea value={message} onChange={e => setMessage(e.target.value)}
          placeholder="Descreva o que você precisa, prazo, volume estimado, local de entrega..."
          rows={5} style={{ ...inp, resize:'vertical', fontFamily:'DM Sans,sans-serif' }} />

        <div style={{ fontSize:11, color:'#9B9B9B', marginBottom:20 }}>
          Os fornecedores receberão sua solicitação e poderão responder com preço e mensagem.
        </div>

        <div style={{ display:'flex', gap:10 }}>
          <Button variant="neutral" style={{ flex:1 }} onClick={onClose}>Cancelar</Button>
          <Button variant="primary" style={{ flex:1 }} onClick={send} disabled={sending}>
            {sending ? '⏳ Enviando...' : '📨 Enviar para todos'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function BuyerMarketplace() {
  const navigate       = useNavigate()
  const { user }       = useAuth()
  const [banner,       setBanner]       = useState(true)
  const [stage,        setStage]        = useState(1)
  const [dbCategories, setDbCategories] = useState([])
  const [filters,      setFilters]      = useState({
    categoryIds: [],   // multi-select — IDs das categorias do DB
    q:           '',
    states:      [],   // multi-select
    sizes:       [],   // multi-select
    sealType:    'Todos',
    certs:       [],
  })
  const [results,     setResults]     = useState([])
  const [loading,     setLoading]     = useState(false)
  const [searched,    setSearched]    = useState(false)
  const [selectedMap, setSelectedMap] = useState({}) // id → supplier object
  const [showRfq,     setShowRfq]     = useState(false)

  // Carrega categorias de nível raiz do banco
  useEffect(() => {
    supabase
      .from('categories')
      .select('id, name')
      .is('parent_id', null)
      .order('name')
      .limit(40)
      .then(({ data }) => setDbCategories(data || []))
  }, [])

  const upd = (k, v) => setFilters(f => ({ ...f, [k]: v }))

  const toggleArr = (key, val) => setFilters(f => {
    const arr = f[key]
    return { ...f, [key]: arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val] }
  })

  const runSearch = async (overrides = {}) => {
    const f = { ...filters, ...overrides }
    setLoading(true); setSearched(true)
    try {
      const { data } = await marketplaceApi.search({
        q:           f.q,
        states:      f.states,
        categoryIds: f.categoryIds,
        sizes:       f.sizes,
        sealType:    f.sealType,
        certs:       f.certs,
      })
      setResults(data || [])
      setStage(6)
    } finally { setLoading(false) }
  }

  const quickSearch = async (sealType) => {
    setBanner(false)
    setFilters(f => ({ ...f, sealType }))
    await runSearch({ sealType })
  }

  const toggleSelect = (s) => setSelectedMap(m => {
    const next = { ...m }
    if (next[s.id]) delete next[s.id]
    else next[s.id] = s
    return next
  })

  const selectedList = Object.values(selectedMap)

  const chip = (active, color = '#2E3192') => ({
    padding:'8px 14px', borderRadius:20,
    border:`1px solid ${active ? color : '#e2e4ef'}`,
    background:active ? `${color}12` : '#fff',
    color:active ? color : '#9B9B9B',
    cursor:'pointer', fontFamily:'Montserrat,sans-serif',
    fontWeight:600, fontSize:12, whiteSpace:'nowrap', transition:'all .15s',
  })
  const sec = t => (
    <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:15, color:'#1a1c5e', marginBottom:12 }}>{t}</div>
  )
  const inp = { width:'100%', padding:'10px 14px', borderRadius:10, border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#1a1c5e', boxSizing:'border-box' }

  const renderStage = () => {
    // 1 — Categoria (multi-select do DB)
    if (stage === 1) return (
      <div>
        {sec('Qual categoria de fornecedor você procura?')}
        <div style={{ fontSize:12, color:'#9B9B9B', marginBottom:10 }}>Selecione uma ou mais categorias. Deixe em branco para buscar em todas.</div>
        {dbCategories.length === 0
          ? <div style={{ color:'#9B9B9B', fontSize:13 }}>Carregando categorias...</div>
          : (
            <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:16 }}>
              {dbCategories.map(c => (
                <button key={c.id} onClick={() => toggleArr('categoryIds', c.id)}
                  style={chip(filters.categoryIds.includes(c.id))}>
                  {filters.categoryIds.includes(c.id) ? '✓ ' : ''}{c.name}
                </button>
              ))}
            </div>
          )
        }
        <input value={filters.q} onChange={e => upd('q', e.target.value)}
          placeholder="Refine por nome, CNPJ ou palavra-chave específica..." style={inp} />
        {filters.categoryIds.length > 0 && (
          <div style={{ marginTop:8, fontSize:12, color:'#2E3192' }}>
            {filters.categoryIds.length} categoria{filters.categoryIds.length !== 1 ? 's' : ''} selecionada{filters.categoryIds.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>
    )

    // 2 — Região (multi-select)
    if (stage === 2) return (
      <div>
        {sec('Estados de atuação?')}
        <div style={{ fontSize:12, color:'#9B9B9B', marginBottom:10 }}>Selecione um ou mais estados. Deixe em branco para buscar em todo o Brasil.</div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
          {STATES.map(s => (
            <button key={s} onClick={() => toggleArr('states', s)} style={chip(filters.states.includes(s))}>
              {filters.states.includes(s) ? '✓ ' : ''}{s}
            </button>
          ))}
        </div>
        {filters.states.length > 0 && (
          <div style={{ marginTop:10, fontSize:12, color:'#2E3192' }}>
            {filters.states.length} estado{filters.states.length !== 1 ? 's' : ''} selecionado{filters.states.length !== 1 ? 's' : ''}
            {' — '}<button onClick={() => upd('states', [])} style={{ background:'none', border:'none', color:'#ea580c', fontSize:12, cursor:'pointer', fontWeight:600 }}>Limpar</button>
          </div>
        )}
      </div>
    )

    // 3 — Porte (multi-select)
    if (stage === 3) return (
      <div>
        {sec('Porte da empresa?')}
        <div style={{ fontSize:12, color:'#9B9B9B', marginBottom:10 }}>Selecione um ou mais portes. Deixe em branco para qualquer porte.</div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
          {SIZES.map(s => (
            <button key={s} onClick={() => toggleArr('sizes', s)} style={chip(filters.sizes.includes(s))}>
              {filters.sizes.includes(s) ? '✓ ' : ''}{s}
            </button>
          ))}
        </div>
        {filters.sizes.length > 0 && (
          <div style={{ marginTop:10, fontSize:12, color:'#2E3192' }}>
            {filters.sizes.join(', ')}
          </div>
        )}
      </div>
    )

    // 4 — Selos + Certs
    if (stage === 4) return (
      <div>
        {sec('Nível de homologação SIGEC?')}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:24 }}>
          {SEAL_TYPES.map(o => (
            <button key={o.v} onClick={() => upd('sealType', o.v)}
              style={{ padding:16, borderRadius:12, border:`2px solid ${filters.sealType === o.v ? '#2E3192' : '#e2e4ef'}`, background:filters.sealType === o.v ? 'rgba(46,49,146,.08)' : '#fff', cursor:'pointer', textAlign:'center', transition:'all .15s' }}>
              <div style={{ fontSize:22 }}>{o.i}</div>
              <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, color:filters.sealType === o.v ? '#2E3192' : '#1a1c5e', marginTop:4, textTransform:'capitalize' }}>{o.v}</div>
              <div style={{ fontSize:10, color:'#9B9B9B', marginTop:4, lineHeight:1.3 }}>{o.d}</div>
            </button>
          ))}
        </div>
        {sec('Certificações exigidas? (multi-select)')}
        <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
          {CERTS.map(c => (
            <button key={c}
              onClick={() => toggleArr('certs', c)}
              style={chip(filters.certs.includes(c), '#ea580c')}>
              {filters.certs.includes(c) ? '✓ ' : ''}{c}
            </button>
          ))}
        </div>
      </div>
    )

    // 5 — Revisão
    if (stage === 5) return (
      <div>
        {sec('Confirme os filtros antes de buscar')}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
          {[
            ['Categorias',    filters.categoryIds.length
              ? `${filters.categoryIds.length} selecionada${filters.categoryIds.length !== 1 ? 's' : ''}`
              : 'Todas'],
            ['Busca livre',   filters.q || '—'],
            ['Estados',       filters.states.length ? filters.states.join(', ') : 'Todos'],
            ['Porte',         filters.sizes.length  ? filters.sizes.join(', ')  : 'Todos'],
            ['Nível SIGEC',   filters.sealType === 'Todos' ? 'Qualquer' : filters.sealType],
            ['Certificações', filters.certs.length ? filters.certs.join(', ') : '—'],
          ].map(([k, v]) => (
            <div key={k} style={{ padding:'10px 14px', background:'rgba(46,49,146,.04)', borderRadius:10, border:'1px solid rgba(46,49,146,.08)' }}>
              <div style={{ fontSize:10, color:'#9B9B9B', fontFamily:'Montserrat,sans-serif', textTransform:'uppercase', letterSpacing:.5 }}>{k}</div>
              <div style={{ fontSize:13, fontFamily:'DM Sans,sans-serif', fontWeight:600, color:'#1a1c5e', marginTop:2 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const sealBadge = (s) => {
    if (s.sealType === 'homologado') return { label:'Homologado', color:'#F47E2F' }
    if (s.sealType === 'verificado') return { label:'Verificado',  color:'#2E3192' }
    return { label: s.sealLevel || '—', color: '#9B9B9B' }
  }

  return (
    <div style={{ display:'flex', height:'calc(100vh - 58px)', flexDirection:'column', overflow:'hidden' }}>
      <div style={{ flex:1, overflowY:'auto', padding:'20px 28px', background:'#f4f5f9' }}>

        {/* Banner */}
        {banner && (
          <div style={{ background:'linear-gradient(135deg,#2E3192,#3d40b5)', borderRadius:16, padding:'20px 24px', marginBottom:20, display:'flex', justifyContent:'space-between', alignItems:'center', gap:16 }}>
            <div style={{ display:'flex', gap:16, alignItems:'center' }}>
              <div style={{ width:48, height:48, borderRadius:14, background:'rgba(255,255,255,.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, flexShrink:0 }}>💡</div>
              <div>
                <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:14, color:'#fff', marginBottom:4 }}>Fornecedores Homologados Disponíveis</div>
                <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, color:'rgba(255,255,255,.75)', lineHeight:1.5, maxWidth:520 }}>
                  Temos fornecedores com análise humana completa, documentos técnicos e parecer aprovado.{' '}
                  <button onClick={() => quickSearch('homologado')}
                    style={{ background:'none', border:'none', color:'#F47E2F', fontWeight:700, cursor:'pointer', fontSize:13, padding:0, textDecoration:'underline' }}>
                    Ver os Homologados disponíveis →
                  </button>
                </div>
              </div>
            </div>
            <button onClick={() => setBanner(false)} style={{ background:'rgba(255,255,255,.1)', border:'1px solid rgba(255,255,255,.2)', borderRadius:8, color:'rgba(255,255,255,.6)', width:32, height:32, cursor:'pointer', fontSize:16, flexShrink:0 }}>✕</button>
          </div>
        )}

        {/* Wizard */}
        {!searched && (
          <Card style={{ borderRadius:16, marginBottom:20 }}>
            {/* Barra de progresso */}
            <div style={{ display:'flex', alignItems:'center', marginBottom:28, overflowX:'auto' }}>
              {STAGES.map((s, i) => (
                <div key={s.n} style={{ display:'flex', alignItems:'center', flex: i < STAGES.length - 1 ? 1 : 'initial' }}>
                  <div onClick={() => s.n <= stage && setStage(s.n)}
                    style={{ display:'flex', flexDirection:'column', alignItems:'center', cursor: s.n <= stage ? 'pointer' : 'default', minWidth:54 }}>
                    <div style={{ width:32, height:32, borderRadius:'50%', background: s.n < stage ? '#22c55e' : s.n === stage ? '#2E3192' : '#e2e4ef', display:'flex', alignItems:'center', justifyContent:'center', fontSize: s.n <= stage ? 14 : 12, border: s.n === stage ? '3px solid #3d40b5' : 'none', color: s.n <= stage ? '#fff' : '#9B9B9B', transition:'all .3s' }}>
                      {s.n < stage ? '✓' : s.icon}
                    </div>
                    <div style={{ fontSize:9, fontFamily:'Montserrat,sans-serif', fontWeight:600, color: s.n === stage ? '#2E3192' : '#9B9B9B', marginTop:4, textAlign:'center' }}>{s.label}</div>
                  </div>
                  {i < STAGES.length - 1 && (
                    <div style={{ flex:1, height:2, background: s.n < stage ? '#22c55e' : '#e2e4ef', margin:'0 4px 20px', transition:'background .3s' }} />
                  )}
                </div>
              ))}
            </div>

            <div style={{ minHeight:160 }}>{renderStage()}</div>

            {stage < 6 && (
              <div style={{ display:'flex', justifyContent:'space-between', marginTop:24, paddingTop:16, borderTop:'1px solid #e2e4ef' }}>
                <Button variant="neutral" onClick={() => setStage(s => Math.max(1, s - 1))} disabled={stage === 1}>← Anterior</Button>
                {stage < 5
                  ? <Button variant="primary" onClick={() => setStage(s => s + 1)}>Próximo →</Button>
                  : <Button variant="orange" size="lg" onClick={() => runSearch()}>{loading ? '⏳ Buscando...' : '🔍 Buscar Fornecedores'}</Button>
                }
              </div>
            )}
          </Card>
        )}

        {/* Toolbar de resultados */}
        {searched && (
          <div style={{ display:'flex', gap:12, marginBottom:16, alignItems:'center', flexWrap:'wrap' }}>
            <div style={{ flex:1, minWidth:200, position:'relative' }}>
              <span style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', fontSize:16, color:'#9B9B9B' }}>🔍</span>
              <input value={filters.q}
                onChange={e => upd('q', e.target.value)}
                onKeyDown={e => e.key === 'Enter' && runSearch()}
                placeholder="Refinar por nome ou CNPJ e pressione Enter..."
                style={{ width:'100%', padding:'11px 14px 11px 42px', borderRadius:12, border:'1px solid #e2e4ef', background:'#fff', fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#1a1c5e', boxSizing:'border-box' }} />
            </div>
            <Button variant="neutral" onClick={() => { setSearched(false); setStage(1); setResults([]); setSelectedMap({}) }}>
              Nova Pesquisa
            </Button>
            {selectedList.length > 0 && (
              user?.buyerPlan === 'pro'
                ? <Button variant="orange" onClick={() => setShowRfq(true)}>📝 Cotação ({selectedList.length})</Button>
                : <button onClick={() => navigate('/comprador/plano')}
                    style={{ padding:'9px 16px', borderRadius:10, border:'2px dashed #F47E2F', background:'rgba(244,126,47,.06)', color:'#F47E2F', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:12, cursor:'pointer' }}>
                    🔒 RFQ — Exclusivo Pro → Assinar
                  </button>
            )}
          </div>
        )}

        {/* Resultados */}
        {searched && (
          loading
            ? <div style={{ display:'flex', justifyContent:'center', padding:60 }}><Spinner size={48}/></div>
            : (
              <>
                <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#9B9B9B', marginBottom:16, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span>
                    <strong style={{ color:'#1a1c5e' }}>{results.length}</strong> fornecedor{results.length !== 1 ? 'es' : ''} encontrado{results.length !== 1 ? 's' : ''}
                    {results.length === 50 && <span style={{ color:'#F47E2F' }}> (exibindo os 50 primeiros — refine os filtros para resultados mais precisos)</span>}
                  </span>
                  {selectedList.length > 0 && (
                    <span style={{ fontSize:12, color:'#2E3192', fontWeight:600 }}>
                      {selectedList.length} selecionado{selectedList.length !== 1 ? 's' : ''}
                      {' — '}
                      <button onClick={() => setSelectedMap({})} style={{ background:'none', border:'none', color:'#ea580c', fontSize:12, cursor:'pointer', fontWeight:600 }}>Limpar</button>
                    </span>
                  )}
                </div>

                {results.length === 0 ? (
                  <div style={{ textAlign:'center', padding:60 }}>
                    <div style={{ fontSize:48 }}>🔍</div>
                    <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:18, color:'#1a1c5e', marginTop:12 }}>Nenhum resultado</div>
                    <div style={{ color:'#9B9B9B', marginTop:6 }}>Ajuste os filtros ou clique em Nova Pesquisa.</div>
                  </div>
                ) : (
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(300px, 1fr))', gap:16 }}>
                    {results.map(s => {
                      const isSel = !!selectedMap[s.id]
                      const badge = sealBadge(s)
                      return (
                        <div key={s.id}
                          style={{ background:'#fff', borderRadius:16, padding:20, border:isSel ? `2px solid #2E3192` : s.sealType === 'homologado' ? '2px solid rgba(244,126,47,.3)' : '1px solid #e2e4ef', boxShadow:isSel ? '0 4px 20px rgba(46,49,146,.2)' : '0 1px 6px rgba(46,49,146,.06)', cursor:'pointer', transition:'all .2s' }}
                          onMouseEnter={e => !isSel && (e.currentTarget.style.transform = 'translateY(-2px)')}
                          onMouseLeave={e => (e.currentTarget.style.transform = 'none')}>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
                            <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                              <div style={{ width:44, height:44, borderRadius:12, background:'rgba(46,49,146,.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, fontWeight:700, color:'#2E3192', fontFamily:'Montserrat,sans-serif', flexShrink:0 }}>
                                {s.razao_social?.[0]}
                              </div>
                              <div>
                                <div style={{ fontSize:14, fontWeight:700, color:'#1a1c5e', fontFamily:'Montserrat,sans-serif', lineHeight:1.2 }}>{s.razao_social}</div>
                                <div style={{ fontSize:11, color:'#9B9B9B', marginTop:2 }}>{[s.city, s.state].filter(Boolean).join(' · ')}</div>
                              </div>
                            </div>
                            <span style={{ fontSize:10, fontWeight:700, color:badge.color, background:`${badge.color}18`, padding:'3px 8px', borderRadius:20, fontFamily:'Montserrat,sans-serif', whiteSpace:'nowrap', flexShrink:0 }}>
                              {badge.label}
                            </span>
                          </div>

                          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                            <span style={{ fontSize:11, color:'#9B9B9B' }}>Score:</span>
                            <div style={{ flex:1 }}><ScoreBar score={s.score || 0}/></div>
                          </div>

                          {s.employee_range && (
                            <div style={{ fontSize:11, color:'#9B9B9B', marginBottom:8 }}>
                              Porte: <span style={{ color:'#1a1c5e', fontWeight:600 }}>{s.employee_range}</span>
                            </div>
                          )}

                          <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:14 }}>
                            {(s.services || []).slice(0, 2).map((sv, i) => (
                              <span key={i} style={{ fontSize:10, background:'rgba(46,49,146,.07)', color:'#2E3192', padding:'3px 8px', borderRadius:20 }}>{sv}</span>
                            ))}
                            {(s.certifications || []).slice(0, 1).map((c, i) => (
                              <span key={i} style={{ fontSize:10, background:'rgba(34,197,94,.1)', color:'#16a34a', padding:'3px 8px', borderRadius:20 }}>✓ {c}</span>
                            ))}
                          </div>

                          <div style={{ display:'flex', gap:8 }}>
                            <Button variant="primary" size="sm" style={{ flex:1, justifyContent:'center', borderRadius:8 }}
                              onClick={() => navigate(`/comprador/fornecedor/${s.id}`)}>Ver Perfil</Button>
                            <button onClick={() => toggleSelect(s)}
                              style={{ padding:'5px 12px', borderRadius:8, border:`1px solid ${isSel ? '#2E3192' : '#e2e4ef'}`, background:isSel ? 'rgba(46,49,146,.1)' : '#fff', color:isSel ? '#2E3192' : '#9B9B9B', fontSize:11, fontFamily:'Montserrat,sans-serif', fontWeight:700, cursor:'pointer' }}>
                              {isSel ? '✓ Selecionado' : '+ Cotação'}
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )
        )}
      </div>

      {/* Modal RFQ */}
      {showRfq && (
        <BuyerRFQModal
          suppliers={selectedList}
          user={user}
          onClose={() => setShowRfq(false)}
          onSent={() => {
            setShowRfq(false)
            setSelectedMap({})
            alert(`Cotação enviada para ${selectedList.length} fornecedor${selectedList.length !== 1 ? 'es' : ''}!`)
          }}
        />
      )}
    </div>
  )
}
