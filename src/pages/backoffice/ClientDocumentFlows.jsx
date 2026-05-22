import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '../../lib/supabase.js'
import { Card, Spinner, PageHeader } from '../../components/ui.jsx'

function ClientSearchCombo({ clients, value, onChange }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const selected = clients.find(c => c.id === value)

  const filtered = useMemo(() => {
    const lq = q.trim().toLowerCase()
    if (!lq) return clients.slice(0, 20)
    return clients.filter(c =>
      (c.razao_social || '').toLowerCase().includes(lq) ||
      (c.nome_fantasia || '').toLowerCase().includes(lq)
    ).slice(0, 20)
  }, [clients, q])

  useEffect(() => {
    if (!open) return
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setQ('') }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  function select(c) { onChange(c.id); setOpen(false); setQ('') }
  function clear(e) { e.stopPropagation(); onChange(''); setQ(''); setOpen(false) }

  return (
    <div ref={ref} style={{ position:'relative' }}>
      <div style={{ position:'relative' }}>
        <input
          value={open ? q : (selected ? (selected.nome_fantasia || selected.razao_social) : '')}
          onChange={e => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => { setOpen(true); setQ('') }}
          placeholder="Buscar cliente por nome..."
          style={{ width:'100%', padding:'10px 40px 10px 12px', borderRadius:10, border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#1a1c5e', outline:'none', boxSizing:'border-box', background:'#fff' }}
        />
        {value
          ? <button onClick={clear} style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'#9B9B9B', fontSize:16, lineHeight:1 }}>✕</button>
          : <span style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', color:'#9B9B9B', pointerEvents:'none' }}>▾</span>
        }
      </div>
      {open && (
        <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, right:0, background:'#fff', border:'1px solid #e2e4ef', borderRadius:10, boxShadow:'0 4px 16px rgba(0,0,0,.1)', zIndex:200, maxHeight:260, overflowY:'auto' }}>
          {filtered.length === 0
            ? <div style={{ padding:'12px 14px', fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#9B9B9B' }}>Nenhum cliente encontrado</div>
            : filtered.map(c => (
              <button key={c.id} onMouseDown={() => select(c)}
                style={{ width:'100%', padding:'10px 14px', border:'none', borderBottom:'1px solid #f4f5f9', background: c.id===value ? 'rgba(46,49,146,.06)' : '#fff', cursor:'pointer', textAlign:'left', fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#1a1c5e', display:'block' }}>
                {c.nome_fantasia || c.razao_social}
                {c.nome_fantasia && c.razao_social !== c.nome_fantasia && (
                  <span style={{ display:'block', fontSize:11, color:'#9B9B9B' }}>{c.razao_social}</span>
                )}
              </button>
            ))
          }
          {!q.trim() && clients.length > 20 && (
            <div style={{ padding:'8px 14px', fontFamily:'DM Sans,sans-serif', fontSize:11, color:'#9B9B9B', borderTop:'1px solid #f0f0f5', textAlign:'center' }}>
              {clients.length - 20} clientes adicionais — refine a busca para filtrar
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function BackofficeClientDocumentFlows() {
  const [clients,     setClients]     = useState([])
  const [clientId,    setClientId]    = useState('')
  const [categories,  setCategories]  = useState([])
  const [catalog,     setCatalog]     = useState([])
  const [standardSet, setStandardSet] = useState(new Set())
  const [flowMap,     setFlowMap]     = useState({})   // `${catId}:${docId}` → { id, required }
  const [expanded,    setExpanded]    = useState(new Set())
  const [search,      setSearch]      = useState('')
  const [baseLoading, setBaseLoading] = useState(true)
  const [flowLoading, setFlowLoading] = useState(false)
  const [saving,      setSaving]      = useState(new Set())

  // Load static data once
  useEffect(() => {
    Promise.all([
      supabase.from('clients').select('id, razao_social').order('razao_social'),
      supabase.from('categories').select('id, name, parent_id').order('id'),
      supabase.from('documents_catalog').select('id, name').order('name'),
      supabase.from('category_documents').select('category_id, document_id'),
    ]).then(([c, cats, docs, std]) => {
      setClients(c.data || [])
      setCategories(cats.data || [])
      setCatalog(docs.data || [])
      const s = new Set((std.data || []).map(r => `${r.category_id}:${r.document_id}`))
      setStandardSet(s)
      setBaseLoading(false)
    })
  }, [])

  // Load client flows when client changes
  useEffect(() => {
    if (!clientId) { setFlowMap({}); return }
    setFlowLoading(true)
    supabase.from('client_document_flows')
      .select('id, category_id, catalog_id, required')
      .eq('client_id', clientId)
      .then(({ data }) => {
        const m = {}
        ;(data || []).forEach(r => { m[`${r.category_id}:${r.catalog_id}`] = { id: r.id, required: r.required } })
        setFlowMap(m)
        setFlowLoading(false)
      })
  }, [clientId])

  // ── Derived maps ───────────────────────────────────────────────────────────

  const catMap = useMemo(() => {
    const m = {}
    categories.forEach(c => { m[c.id] = c })
    return m
  }, [categories])

  const catalogMap = useMemo(() => {
    const m = {}
    catalog.forEach(d => { m[d.id] = d })
    return m
  }, [catalog])

  // standard docs per category: catId → Set<docId>
  const catStdDocs = useMemo(() => {
    const m = {}
    standardSet.forEach(k => {
      const [catId, docId] = k.split(':').map(Number)
      if (!m[catId]) m[catId] = []
      m[catId].push(docId)
    })
    return m
  }, [standardSet])

  // category IDs that differ from the standard
  const modifiedCatIds = useMemo(() => {
    const s = new Set()
    Object.entries(flowMap).forEach(([k, v]) => {
      if (!v.required || !standardSet.has(k)) {
        s.add(Number(k.split(':')[0]))
      }
    })
    return s
  }, [flowMap, standardSet])

  const stats = useMemo(() => {
    let removed = 0, added = 0
    Object.entries(flowMap).forEach(([k, v]) => {
      if (standardSet.has(k) && !v.required) removed++
      if (!standardSet.has(k) && v.required)  added++
    })
    return { removed, added, modified: modifiedCatIds.size }
  }, [flowMap, standardSet, modifiedCatIds])

  // categories to display
  const filteredCats = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return clientId ? categories.filter(c => modifiedCatIds.has(c.id)) : []
    return categories.filter(c => c.name.toLowerCase().includes(q))
  }, [categories, search, modifiedCatIds, clientId])

  // ── Helpers ────────────────────────────────────────────────────────────────

  function parentLabel(cat) {
    const p = cat.parent_id ? catMap[cat.parent_id] : null
    return p ? `${p.name} › ${cat.name}` : cat.name
  }

  function isActive(catId, docId) {
    const key = `${catId}:${docId}`
    const row = flowMap[key]
    return standardSet.has(key) ? (row ? row.required : true) : (row?.required ?? false)
  }

  async function toggle(catId, docId) {
    if (!clientId) return
    const key       = `${catId}:${docId}`
    const isStd     = standardSet.has(key)
    const row       = flowMap[key]
    const nowActive = isActive(catId, docId)
    setSaving(p => new Set([...p, key]))
    try {
      if (isStd) {
        const next = !nowActive
        if (row) {
          await supabase.from('client_document_flows').update({ required: next }).eq('id', row.id)
          setFlowMap(p => ({ ...p, [key]: { ...row, required: next } }))
        } else {
          // Row missing — insert (graceful recovery after backfill gap)
          const { data } = await supabase.from('client_document_flows')
            .insert({ client_id: clientId, category_id: catId, catalog_id: docId, required: next })
            .select().single()
          setFlowMap(p => ({ ...p, [key]: { id: data.id, required: next } }))
        }
      } else {
        if (nowActive && row) {
          await supabase.from('client_document_flows').delete().eq('id', row.id)
          setFlowMap(p => { const n = { ...p }; delete n[key]; return n })
        } else {
          const { data } = await supabase.from('client_document_flows')
            .insert({ client_id: clientId, category_id: catId, catalog_id: docId, required: true })
            .select().single()
          setFlowMap(p => ({ ...p, [key]: { id: data.id, required: true } }))
        }
      }
    } catch (e) {
      console.error('toggle failed', e)
    } finally {
      setSaving(p => { const n = new Set(p); n.delete(key); return n })
    }
  }

  function toggleExpand(catId) {
    setExpanded(p => {
      const n = new Set(p)
      n.has(catId) ? n.delete(catId) : n.add(catId)
      return n
    })
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const lbl = {
    display:'block', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:10,
    color:'#9B9B9B', letterSpacing:.5, textTransform:'uppercase', marginBottom:6,
  }

  if (baseLoading) return <div style={{ display:'flex', justifyContent:'center', padding:80 }}><Spinner size={40}/></div>

  return (
    <div style={{ padding:'24px 32px', maxWidth:960, margin:'0 auto' }}>
      <PageHeader title="Fluxo de Homologação" subtitle="Configuração de documentos por cliente"/>

      {/* Client selector */}
      <Card style={{ borderRadius:14, padding:'20px 24px', marginBottom:20 }}>
        <span style={lbl}>Cliente</span>
        <ClientSearchCombo
          clients={clients}
          value={clientId}
          onChange={id => { setClientId(id); setSearch(''); setExpanded(new Set()) }}
        />
      </Card>

      {clientId && (
        <>
          {/* Stats */}
          {!flowLoading && (
            <div style={{ display:'flex', gap:12, marginBottom:16 }}>
              {[
                ['Removidos vs. padrão',  stats.removed,  '#ef4444'],
                ['Adicionados vs. padrão', stats.added,   '#22c55e'],
                ['Categorias modificadas', stats.modified, '#2E3192'],
              ].map(([label, n, color]) => (
                <div key={label} style={{ flex:1, textAlign:'center', padding:'12px', background:`${color}0d`, borderRadius:12, border:`1px solid ${color}22` }}>
                  <div style={{ fontSize:22, fontWeight:900, color, fontFamily:'Montserrat,sans-serif' }}>{n}</div>
                  <div style={{ fontSize:11, color:'#64748b', fontFamily:'DM Sans,sans-serif', marginTop:2 }}>{label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Search */}
          <div style={{ marginBottom:16, position:'relative' }}>
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setExpanded(new Set()) }}
              placeholder="Buscar categoria..."
              style={{ width:'100%', padding:'10px 12px 10px 38px', borderRadius:10, border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:14, boxSizing:'border-box', outline:'none' }}
            />
            <span style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'#9B9B9B', pointerEvents:'none' }}>🔍</span>
            {search && (
              <button onClick={() => setSearch('')}
                style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'#9B9B9B', fontSize:16, lineHeight:1 }}>✕</button>
            )}
          </div>

          {flowLoading ? (
            <div style={{ display:'flex', justifyContent:'center', padding:40 }}><Spinner size={32}/></div>
          ) : (
            <>
              {filteredCats.length === 0 && (
                <Card style={{ borderRadius:14, padding:'32px', textAlign:'center' }}>
                  {search ? (
                    <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#9B9B9B' }}>
                      Nenhuma categoria encontrada para "{search}"
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize:32, marginBottom:8 }}>✅</div>
                      <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:14, color:'#1a1c5e', marginBottom:4 }}>
                        Nenhuma modificação
                      </div>
                      <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#9B9B9B' }}>
                        Este cliente segue o fluxo padrão em todas as categorias. Busque uma categoria acima para editar.
                      </div>
                    </>
                  )}
                </Card>
              )}

              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {filteredCats.map(cat => {
                  const isOpen   = expanded.has(cat.id)
                  const stdDocs  = catStdDocs[cat.id] || []
                  const modified = modifiedCatIds.has(cat.id)

                  // extra docs already added for this client+category
                  const extraActive = catalog.filter(d =>
                    !stdDocs.includes(d.id) && isActive(cat.id, d.id)
                  )

                  const activeStd = stdDocs.filter(dId => isActive(cat.id, dId)).length

                  // non-standard docs available to add
                  const nonStd = catalog.filter(d => !stdDocs.includes(d.id))

                  return (
                    <Card key={cat.id} style={{
                      borderRadius:12, padding:0, overflow:'hidden',
                      border: modified ? '1px solid rgba(239,68,68,.3)' : '1px solid #e2e4ef',
                    }}>
                      {/* Row header */}
                      <button onClick={() => toggleExpand(cat.id)}
                        style={{ width:'100%', background: modified ? 'rgba(254,242,242,.5)' : '#fff', border:'none', cursor:'pointer', padding:'13px 16px', display:'flex', alignItems:'center', gap:10, textAlign:'left' }}>
                        <span style={{ color:'#9B9B9B', fontSize:11, transition:'transform .15s', display:'inline-block', transform: isOpen ? 'rotate(90deg)' : 'none' }}>▶</span>
                        <div style={{ flex:1 }}>
                          <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, fontWeight:600, color:'#1a1c5e' }}>
                            {parentLabel(cat)}
                          </div>
                        </div>
                        <div style={{ display:'flex', gap:6, alignItems:'center', flexShrink:0 }}>
                          {modified && (
                            <span style={{ fontSize:10, fontWeight:700, color:'#ef4444', background:'rgba(239,68,68,.08)', padding:'2px 8px', borderRadius:20, fontFamily:'Montserrat,sans-serif' }}>
                              modificado
                            </span>
                          )}
                          {extraActive.length > 0 && (
                            <span style={{ fontSize:10, fontWeight:700, color:'#22c55e', background:'rgba(34,197,94,.08)', padding:'2px 8px', borderRadius:20, fontFamily:'Montserrat,sans-serif' }}>
                              +{extraActive.length} extra
                            </span>
                          )}
                          <span style={{ fontSize:11, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>
                            {activeStd}/{stdDocs.length}
                          </span>
                        </div>
                      </button>

                      {/* Expanded docs */}
                      {isOpen && (
                        <div style={{ padding:'4px 16px 16px', borderTop:'1px solid #f0f0f5' }}>

                          {/* Standard docs */}
                          {stdDocs.length > 0 && (
                            <>
                              <div style={{ ...lbl, marginTop:12 }}>Documentos Padrão</div>
                              {stdDocs.map(docId => {
                                const key    = `${cat.id}:${docId}`
                                const active = isActive(cat.id, docId)
                                const busy   = saving.has(key)
                                const doc    = catalogMap[docId]
                                return (
                                  <label key={docId} style={{
                                    display:'flex', alignItems:'center', gap:10, padding:'8px 10px',
                                    borderRadius:8, marginBottom:5, cursor: busy ? 'wait' : 'pointer',
                                    background: active ? '#f0fdf4' : '#fff5f5',
                                    border: `1px solid ${active ? '#bbf7d0' : '#fecaca'}`,
                                  }}>
                                    <input type="checkbox" checked={active} disabled={busy}
                                      onChange={() => toggle(cat.id, docId)}
                                      style={{ width:15, height:15, accentColor:'#22c55e', cursor:'pointer', flexShrink:0 }} />
                                    <span style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#1a1c5e', flex:1 }}>
                                      {doc?.name || `Documento #${docId}`}
                                    </span>
                                    {busy && <Spinner size={14}/>}
                                    {!active && !busy && (
                                      <span style={{ fontSize:10, color:'#ef4444', fontFamily:'DM Sans,sans-serif', flexShrink:0 }}>removido</span>
                                    )}
                                  </label>
                                )
                              })}
                            </>
                          )}

                          {/* Non-standard docs (extras) */}
                          {nonStd.length > 0 && (
                            <>
                              <div style={{ ...lbl, marginTop:16 }}>Documentos Adicionais (fora do padrão)</div>
                              {nonStd.map(doc => {
                                const key    = `${cat.id}:${doc.id}`
                                const active = isActive(cat.id, doc.id)
                                const busy   = saving.has(key)
                                return (
                                  <label key={doc.id} style={{
                                    display:'flex', alignItems:'center', gap:10, padding:'8px 10px',
                                    borderRadius:8, marginBottom:5, cursor: busy ? 'wait' : 'pointer',
                                    background: active ? '#f0fdf4' : '#fafafa',
                                    border: `1px solid ${active ? '#bbf7d0' : '#e2e4ef'}`,
                                    opacity: active ? 1 : 0.6,
                                  }}>
                                    <input type="checkbox" checked={active} disabled={busy}
                                      onChange={() => toggle(cat.id, doc.id)}
                                      style={{ width:15, height:15, accentColor:'#22c55e', cursor:'pointer', flexShrink:0 }} />
                                    <span style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#1a1c5e', flex:1 }}>
                                      {doc.name}
                                    </span>
                                    {busy && <Spinner size={14}/>}
                                    {active && !busy && (
                                      <span style={{ fontSize:10, color:'#22c55e', fontFamily:'DM Sans,sans-serif', flexShrink:0 }}>adicionado</span>
                                    )}
                                  </label>
                                )
                              })}
                            </>
                          )}

                          {stdDocs.length === 0 && nonStd.length === 0 && (
                            <div style={{ padding:'12px 0', fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#9B9B9B', textAlign:'center' }}>
                              Nenhum documento associado a esta categoria
                            </div>
                          )}
                        </div>
                      )}
                    </Card>
                  )
                })}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
