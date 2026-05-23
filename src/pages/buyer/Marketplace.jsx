import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { marketplaceApi } from '../../services/api.js'
import { Badge, Button, Card, ScoreBar, Spinner, PageHeader } from '../../components/ui.jsx'

const STATES = ['','AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO']
const LEVELS = [
  { value: '',        label: 'Todos os níveis' },
  { value: 'Premium', label: 'Premium' },
  { value: 'Simples', label: 'Simples' },
]

export default function BuyerMarketplace() {
  const navigate  = useNavigate()
  const debounceRef = useRef(null)

  const [search,   setSearch]   = useState('')
  const [state,    setState]    = useState('')
  const [level,    setLevel]    = useState('')
  const [results,  setResults]  = useState([])
  const [loading,  setLoading]  = useState(false)
  const [searched, setSearched] = useState(false)
  const [selected, setSelected] = useState([])

  useEffect(() => {
    clearTimeout(debounceRef.current)
    const hasFilter = search.trim().length >= 2 || state
    if (!hasFilter) { setResults([]); setSearched(false); return }
    debounceRef.current = setTimeout(runSearch, 500)
    return () => clearTimeout(debounceRef.current)
  }, [search, state, level])

  const runSearch = async () => {
    setLoading(true); setSearched(true)
    try {
      const { data } = await marketplaceApi.search({ q: search, state: state || 'Todos', level: level || 'Todos' })
      setResults(data || [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const toggleSelect = (id) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])

  const inp = { padding:'10px 14px', borderRadius:10, border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#1a1c5e', background:'#fff', boxSizing:'border-box' }

  return (
    <div style={{ padding:'28px 32px', maxWidth:1200, margin:'0 auto' }}>
      <PageHeader
        title="Marketplace"
        subtitle="Busque fornecedores homologados na plataforma SIGEC-ELOS"
        action={selected.length > 0 && (
          <Button variant="orange">📝 Cotação ({selected.length})</Button>
        )}
      />

      {/* Filtros */}
      <div style={{ display:'flex', gap:10, marginBottom:24, flexWrap:'wrap', alignItems:'center' }}>
        <div style={{ flex:1, minWidth:260, position:'relative' }}>
          <span style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', fontSize:15, color:'#9B9B9B', pointerEvents:'none' }}>🔍</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por razão social ou CNPJ (mín. 2 caracteres)..."
            style={{ ...inp, width:'100%', paddingLeft:42 }}
          />
        </div>

        <select value={state} onChange={e => setState(e.target.value)} style={{ ...inp, cursor:'pointer', minWidth:160 }}>
          <option value="">Todos os estados</option>
          {STATES.filter(Boolean).map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <select value={level} onChange={e => setLevel(e.target.value)} style={{ ...inp, cursor:'pointer', minWidth:160 }}>
          {LEVELS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
      </div>

      {/* Empty / prompt */}
      {!searched && !loading && (
        <div style={{ textAlign:'center', padding:'80px 32px' }}>
          <div style={{ fontSize:48, marginBottom:16 }}>🏭</div>
          <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:18, color:'#1a1c5e', marginBottom:8 }}>
            Encontre fornecedores certificados
          </div>
          <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#9B9B9B', maxWidth:420, margin:'0 auto' }}>
            Digite o nome, CNPJ ou selecione um estado para buscar fornecedores homologados pela plataforma SIGEC-ELOS.
          </div>
        </div>
      )}

      {loading && (
        <div style={{ display:'flex', justifyContent:'center', padding:80 }}><Spinner size={40}/></div>
      )}

      {searched && !loading && (
        <>
          <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#9B9B9B', marginBottom:16 }}>
            <strong style={{ color:'#1a1c5e' }}>{results.length}</strong> fornecedor{results.length !== 1 ? 'es' : ''} encontrado{results.length !== 1 ? 's' : ''}
          </div>

          {results.length === 0 ? (
            <div style={{ textAlign:'center', padding:60 }}>
              <div style={{ fontSize:40 }}>🔍</div>
              <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:16, color:'#1a1c5e', marginTop:12 }}>Nenhum resultado</div>
              <div style={{ color:'#9B9B9B', marginTop:6 }}>Tente ajustar os filtros de busca.</div>
            </div>
          ) : (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(300px, 1fr))', gap:16 }}>
              {results.map(s => {
                const isSel = selected.includes(s.id)
                return (
                  <div key={s.id}
                    style={{ background:'#fff', borderRadius:16, padding:20, border:isSel?'2px solid #2E3192':s.sealLevel==='Premium'?'2px solid rgba(244,126,47,.3)':'1px solid #e2e4ef', boxShadow:isSel?'0 4px 20px rgba(46,49,146,.2)':'0 1px 6px rgba(46,49,146,.06)', cursor:'pointer', transition:'all .2s' }}
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
                      <Badge level={s.sealLevel} />
                    </div>

                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                      <span style={{ fontSize:11, color:'#9B9B9B' }}>Score:</span>
                      <div style={{ flex:1 }}><ScoreBar score={s.score || 0}/></div>
                    </div>

                    <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:14 }}>
                      {s.services?.slice(0,2).map((sv, i) => (
                        <span key={i} style={{ fontSize:10, background:'rgba(46,49,146,.07)', color:'#2E3192', padding:'3px 8px', borderRadius:20 }}>{sv}</span>
                      ))}
                      {s.certifications?.slice(0,1).map((c, i) => (
                        <span key={i} style={{ fontSize:10, background:'rgba(34,197,94,.1)', color:'#16a34a', padding:'3px 8px', borderRadius:20 }}>✓ {c}</span>
                      ))}
                    </div>

                    <div style={{ display:'flex', gap:8 }}>
                      <Button variant="primary" size="sm"
                        style={{ flex:1, justifyContent:'center', borderRadius:8 }}
                        onClick={() => navigate(`/comprador/fornecedor/${s.id}`)}>
                        Ver Perfil
                      </Button>
                      <button onClick={() => toggleSelect(s.id)}
                        style={{ padding:'5px 12px', borderRadius:8, border:`1px solid ${isSel?'#2E3192':'#e2e4ef'}`, background:isSel?'rgba(46,49,146,.1)':'#fff', color:isSel?'#2E3192':'#9B9B9B', fontSize:11, fontFamily:'Montserrat,sans-serif', fontWeight:700, cursor:'pointer' }}>
                        {isSel ? '✓ Selecionado' : '+ Cotação'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
