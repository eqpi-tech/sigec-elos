// Análise de Processo — busca geral de todos os fornecedores (equivale à "Análise de Processo - Pesquisa" do HOC)
import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'
import { Button, Card, ScoreBar, Spinner, PageHeader, EmptyState } from '../../components/ui.jsx'

function ClientSearchCombo({ clients, value, onChange }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const selected = clients.find(c => c.id === value)
  const filtered = useMemo(() => {
    const lq = q.trim().toLowerCase()
    if (!lq) return clients.slice(0, 20)
    return clients.filter(c => (c.razao_social || '').toLowerCase().includes(lq)).slice(0, 20)
  }, [clients, q])
  useEffect(() => {
    if (!open) return
    function h(e) { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setQ('') } }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])
  function select(c) { onChange(c.id); setOpen(false); setQ('') }
  function clear(e) { e.stopPropagation(); onChange(''); setQ(''); setOpen(false) }
  return (
    <div ref={ref} style={{ position:'relative', minWidth:200 }}>
      <div style={{ position:'relative' }}>
        <input
          value={open ? q : (selected ? selected.razao_social : '')}
          onChange={e => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => { setOpen(true); setQ('') }}
          placeholder="Todos os clientes"
          style={{ width:'100%', padding:'10px 36px 10px 14px', borderRadius:10, border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#1a1c5e', outline:'none', boxSizing:'border-box', background:'#fff' }}
        />
        {value
          ? <button onClick={clear} style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'#9B9B9B', fontSize:15, lineHeight:1 }}>✕</button>
          : <span style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', color:'#9B9B9B', pointerEvents:'none' }}>▾</span>
        }
      </div>
      {open && (
        <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, right:0, background:'#fff', border:'1px solid #e2e4ef', borderRadius:10, boxShadow:'0 4px 16px rgba(0,0,0,.1)', zIndex:200, maxHeight:240, overflowY:'auto' }}>
          <button onMouseDown={() => { onChange(''); setOpen(false); setQ('') }}
            style={{ width:'100%', padding:'10px 14px', border:'none', borderBottom:'1px solid #f4f5f9', background: !value ? 'rgba(46,49,146,.06)' : '#fff', cursor:'pointer', textAlign:'left', fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#9B9B9B', display:'block' }}>
            Todos os clientes
          </button>
          {filtered.map(c => (
            <button key={c.id} onMouseDown={() => select(c)}
              style={{ width:'100%', padding:'10px 14px', border:'none', borderBottom:'1px solid #f4f5f9', background: c.id===value ? 'rgba(46,49,146,.06)' : '#fff', cursor:'pointer', textAlign:'left', fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#1a1c5e', display:'block' }}>
              {c.razao_social}
            </button>
          ))}
          {!q.trim() && clients.length > 20 && (
            <div style={{ padding:'8px 14px', fontFamily:'DM Sans,sans-serif', fontSize:11, color:'#9B9B9B', textAlign:'center' }}>
              {clients.length - 20} clientes adicionais — refine a busca
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const SEAL_LABEL = { ACTIVE:'Homologado', PENDING:'Em análise', SUSPENDED:'Suspenso', REJECTED:'Rejeitado' }
const SEAL_COLOR = { ACTIVE:'#22c55e',    PENDING:'#f59e0b',    SUSPENDED:'#ef4444',  REJECTED:'#9B9B9B'  }

export default function BackofficeProcessSearch() {
  const navigate  = useNavigate()
  const inputRef  = useRef(null)

  const [q,           setQ]           = useState('')
  const [filterType,  setFilterType]  = useState('Todos')   // Todos | ACTIVE | PENDING | SUSPENDED
  const [filterClient,setFilterClient]= useState('')         // client_id ou ''
  const [showInactive,setShowInactive]= useState(false)
  const [results,     setResults]     = useState([])
  const [clients,     setClients]     = useState([])
  const [loading,     setLoading]     = useState(false)
  const [searched,    setSearched]    = useState(false)

  // Carrega lista de clientes para o filtro
  useEffect(() => {
    supabase.from('clients').select('id, razao_social').order('razao_social')
      .then(({ data }) => setClients(data || []))
  }, [])

  const handleSearch = async () => {
    setLoading(true)
    setSearched(true)

    const qTrim  = q.trim()
    const qNums  = qTrim.replace(/\D/g, '')

    // Query base: todos os suppliers
    let suppQuery = supabase
      .from('suppliers')
      .select('id, razao_social, cnpj, city, state, status, created_at')
      .order('razao_social')

    if (!showInactive) {
      suppQuery = suppQuery.neq('status', 'INACTIVE')
    }

    // Filtro por CNPJ ou razão social
    if (qTrim) {
      if (qNums.length >= 8) {
        suppQuery = suppQuery.ilike('cnpj', `%${qNums}%`)
      } else {
        suppQuery = suppQuery.ilike('razao_social', `%${qTrim}%`)
      }
    }

    const { data: suppliers, error } = await suppQuery
    if (error) { console.error(error); setLoading(false); return }

    if (!suppliers?.length) { setResults([]); setLoading(false); return }

    const ids = suppliers.map(s => s.id)

    // Selos: inclui client_id para vincular fornecedor↔cliente (dados HOC)
    // Invitations: vínculo para dados nativos SIGEC
    const [sealsRes, invitesRes] = await Promise.allSettled([
      supabase.from('seals')
        .select('supplier_id, level, status, score, issued_at, client_id, clients(razao_social)')
        .in('supplier_id', ids)
        .range(0, 9999),
      filterClient
        ? supabase.from('invitations').select('supplier_id').in('supplier_id', ids).eq('client_id', filterClient)
        : supabase.from('invitations').select('supplier_id, clients(razao_social)').in('supplier_id', ids),
    ])

    const seals   = sealsRes.status   === 'fulfilled' ? (sealsRes.value.data   || []) : []
    const invites = invitesRes.status === 'fulfilled' ? (invitesRes.value.data || []) : []

    // Melhor selo por fornecedor: ACTIVE prevalece sobre PENDING/SUSPENDED
    const sealMap = {}
    seals.forEach(s => {
      const sid = s.supplier_id
      if (!sealMap[sid] || (s.status === 'ACTIVE' && sealMap[sid].status !== 'ACTIVE')) {
        sealMap[sid] = s
      }
    })

    // Nomes de cliente por fornecedor: fonte primária = seals.client_id (HOC) + invitations (SIGEC)
    const clientMap = {}
    const addName = (sid, name) => {
      if (!name) return
      if (!clientMap[sid]) clientMap[sid] = []
      if (!clientMap[sid].includes(name)) clientMap[sid].push(name)
    }
    seals.forEach(s => addName(s.supplier_id, s.clients?.razao_social))
    if (!filterClient) invites.forEach(i => addName(i.supplier_id, i.clients?.razao_social))

    // Filtro por cliente: union de seals.client_id (HOC) + invitations.client_id (SIGEC)
    const clientSupplierSet = filterClient
      ? new Set([
          ...seals.filter(s => s.client_id === filterClient).map(s => s.supplier_id),
          ...invites.map(i => i.supplier_id),
        ])
      : null

    let enriched = suppliers
      .filter(s => !clientSupplierSet || clientSupplierSet.has(s.id))
      .map(s => ({
        ...s,
        seal:    sealMap[s.id]   || null,
        clients: clientMap[s.id] || [],
      }))

    // Filtro por status do selo
    if (filterType !== 'Todos') {
      enriched = enriched.filter(s => (s.seal?.status || 'PENDING') === filterType)
    }

    setResults(enriched)
    setLoading(false)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSearch()
  }

  return (
    <div style={{ padding:'28px 32px', maxWidth:1100, margin:'0 auto' }}>
      <PageHeader
        title="Análise de Processo"
        subtitle="Pesquisa geral de fornecedores cadastrados na plataforma"
      />

      {/* Painel de filtros */}
      <Card style={{ borderRadius:14, padding:'20px 24px', marginBottom:20 }}>
        <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginBottom:16 }}>
          <input
            ref={inputRef}
            value={q} onChange={e => setQ(e.target.value)} onKeyDown={handleKeyDown}
            placeholder="CNPJ ou Razão Social..."
            style={{ flex:1, minWidth:220, padding:'10px 14px', borderRadius:10, border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#1a1c5e', outline:'none' }}
          />
          {clients.length > 0 && (
            <ClientSearchCombo clients={clients} value={filterClient} onChange={setFilterClient}/>
          )}
          <Button variant="primary" onClick={handleSearch}>Pesquisar</Button>
        </div>

        <div style={{ display:'flex', gap:12, alignItems:'center', flexWrap:'wrap' }}>
          <div style={{ display:'flex', gap:6 }}>
            {['Todos','ACTIVE','PENDING','SUSPENDED'].map(f => (
              <button key={f} onClick={() => setFilterType(f)}
                style={{ padding:'6px 12px', borderRadius:20, border:`1px solid ${filterType===f?SEAL_COLOR[f]||'#2E3192':'#e2e4ef'}`, background:filterType===f?`${SEAL_COLOR[f]||'#2E3192'}12`:'#fff', color:filterType===f?SEAL_COLOR[f]||'#2E3192':'#9B9B9B', fontFamily:'DM Sans,sans-serif', fontSize:12, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap' }}>
                {f === 'Todos' ? 'Todos' : SEAL_LABEL[f]}
              </button>
            ))}
          </div>
          <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'#64748b', fontFamily:'DM Sans,sans-serif', cursor:'pointer' }}>
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} style={{ cursor:'pointer' }}/>
            Mostrar inativos/arquivados
          </label>
        </div>
      </Card>

      {/* Resultados */}
      {loading && (
        <div style={{ display:'flex', justifyContent:'center', padding:60 }}><Spinner size={40}/></div>
      )}

      {!loading && searched && results.length === 0 && (
        <EmptyState icon="🔍" title="Nenhum fornecedor encontrado" subtitle="Tente ajustar os filtros ou termos de busca"/>
      )}

      {!loading && !searched && (
        <div style={{ textAlign:'center', padding:'60px 0', color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', fontSize:14 }}>
          Use os filtros acima e clique em <strong>Pesquisar</strong> para localizar fornecedores.
        </div>
      )}

      {!loading && results.length > 0 && (
        <>
          <div style={{ fontSize:12, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', marginBottom:12 }}>
            {results.length} fornecedor{results.length !== 1 ? 'es' : ''} encontrado{results.length !== 1 ? 's' : ''}
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {results.map((s, i) => {
              const sealStatus = s.seal?.status || 'PENDING'
              const sealColor  = SEAL_COLOR[sealStatus] || '#9B9B9B'
              const isInactive = s.status === 'INACTIVE'
              return (
                <Card key={i} hover style={{ borderRadius:14, padding:'16px 20px', opacity: isInactive ? 0.7 : 1 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:16 }}>
                    <div style={{ width:44, height:44, borderRadius:10, background:`${sealColor}18`, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:18, color:sealColor, flexShrink:0 }}>
                      {s.razao_social?.[0]}
                    </div>

                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:3 }}>
                        <span style={{ fontSize:14, fontWeight:700, color:'#1a1c5e', fontFamily:'Montserrat,sans-serif' }}>{s.razao_social}</span>
                        <span style={{ fontSize:10, fontWeight:700, color:sealColor, background:`${sealColor}18`, padding:'2px 8px', borderRadius:20 }}>
                          {SEAL_LABEL[sealStatus] || 'Em análise'}
                        </span>
                        {isInactive && (
                          <span style={{ fontSize:10, fontWeight:700, color:'#9B9B9B', background:'#f0f0f0', padding:'2px 8px', borderRadius:20 }}>Inativo</span>
                        )}
                      </div>

                      <div style={{ fontSize:12, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', marginBottom:4 }}>
                        {s.cnpj}{s.city && s.state ? ` · ${s.city}/${s.state}` : ''}
                        {s.seal?.issued_at ? ` · Homologado em ${s.seal.issued_at.slice(0,10)}` : ` · Cadastrado em ${s.created_at?.slice(0,10)||'—'}`}
                      </div>

                      {s.clients.length > 0 && (
                        <div style={{ fontSize:11, color:'#64748b', fontFamily:'DM Sans,sans-serif' }}>
                          Cliente{s.clients.length > 1 ? 's' : ''}: {s.clients.join(', ')}
                        </div>
                      )}

                      {sealStatus === 'ACTIVE' && s.seal?.score != null && (
                        <div style={{ marginTop:6, maxWidth:160 }}>
                          <ScoreBar score={s.seal.score}/>
                        </div>
                      )}
                    </div>

                    <Button variant="primary" size="sm" onClick={() => navigate(`/backoffice/analise/${s.id}`)}>
                      Ver Processo →
                    </Button>
                  </div>
                </Card>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
