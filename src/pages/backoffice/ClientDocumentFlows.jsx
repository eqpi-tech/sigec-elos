// Fluxos de Homologação (modelo HOC, patch_043):
//   · Matriz de Documentos — categoria → N documentos (categories × category_documents)
//   · Fluxos de Categorias — fluxo nomeado → N categorias (client_flows × client_flow_categories)
// Os documentos exigidos de um fluxo derivam das suas categorias.
import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { supabase } from '../../lib/supabase.js'
import { Card, Spinner, PageHeader } from '../../components/ui.jsx'

const font   = { fontFamily: 'DM Sans,sans-serif' }
const titleF = { fontFamily: 'Montserrat,sans-serif' }
const lbl = {
  display:'block', ...titleF, fontWeight:700, fontSize:10,
  color:'#9B9B9B', letterSpacing:.5, textTransform:'uppercase', marginBottom:6,
}
const inputCss = { width:'100%', padding:'9px 12px', borderRadius:10, border:'1px solid #e2e4ef', ...font, fontSize:13, color:'#1a1c5e', outline:'none', boxSizing:'border-box', background:'#fff' }

// Busca paginada (PostgREST corta em 1000/request)
async function fetchAll(query, pageSize = 1000) {
  let all = [], from = 0
  for (;;) {
    const { data, error } = await query.range(from, from + pageSize - 1)
    if (error) throw error
    all = all.concat(data || [])
    if (!data || data.length < pageSize) break
    from += pageSize
  }
  return all
}

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

  return (
    <div ref={ref} style={{ position:'relative' }}>
      <div style={{ position:'relative' }}>
        <input
          value={open ? q : (selected ? (selected.nome_fantasia || selected.razao_social) : '')}
          onChange={e => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => { setOpen(true); setQ('') }}
          placeholder="Buscar cliente por nome..."
          style={{ ...inputCss, padding:'10px 40px 10px 12px', fontSize:14 }}
        />
        {value
          ? <button onClick={e => { e.stopPropagation(); onChange(''); setQ(''); setOpen(false) }} style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'#9B9B9B', fontSize:16, lineHeight:1 }}>✕</button>
          : <span style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', color:'#9B9B9B', pointerEvents:'none' }}>▾</span>
        }
      </div>
      {open && (
        <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, right:0, background:'#fff', border:'1px solid #e2e4ef', borderRadius:10, boxShadow:'0 4px 16px rgba(0,0,0,.1)', zIndex:200, maxHeight:260, overflowY:'auto' }}>
          {filtered.length === 0
            ? <div style={{ padding:'12px 14px', ...font, fontSize:13, color:'#9B9B9B' }}>Nenhum cliente encontrado</div>
            : filtered.map(c => (
              <button key={c.id} onMouseDown={() => { onChange(c.id); setOpen(false); setQ('') }}
                style={{ width:'100%', padding:'10px 14px', border:'none', borderBottom:'1px solid #f4f5f9', background: c.id===value ? 'rgba(46,49,146,.06)' : '#fff', cursor:'pointer', textAlign:'left', ...font, fontSize:13, color:'#1a1c5e', display:'block' }}>
                {c.nome_fantasia || c.razao_social}
              </button>
            ))
          }
        </div>
      )}
    </div>
  )
}

function FlowFormModal({ flow, onSave, onClose, busy }) {
  const [name, setName] = useState(flow?.name || '')
  const [description, setDescription] = useState(flow?.description || '')
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(15,17,60,.45)', zIndex:500, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background:'#fff', borderRadius:16, padding:'24px 28px', width:'100%', maxWidth:440, boxShadow:'0 20px 60px rgba(0,0,0,.25)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
          <h3 style={{ ...titleF, fontWeight:800, fontSize:16, color:'#1a1c5e', margin:0 }}>
            {flow ? 'Editar Fluxo' : 'Novo Fluxo de Categorias'}
          </h3>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#9B9B9B', fontSize:18, lineHeight:1 }}>✕</button>
        </div>
        <span style={lbl}>Nome do fluxo *</span>
        <input value={name} onChange={e => setName(e.target.value)} autoFocus
          placeholder='Ex.: "Fluxo Serviços Críticos"'
          style={{ ...inputCss, fontSize:14, marginBottom:14 }} />
        <span style={lbl}>Descrição</span>
        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
          placeholder="Opcional — quando este fluxo se aplica"
          style={{ ...inputCss, resize:'vertical', marginBottom:20 }} />
        <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
          <button onClick={onClose} disabled={busy}
            style={{ padding:'10px 20px', borderRadius:10, border:'1px solid #e2e4ef', background:'#fff', cursor:'pointer', ...font, fontSize:13, fontWeight:600, color:'#64748b' }}>
            Cancelar
          </button>
          <button onClick={() => onSave({ name: name.trim(), description: description.trim() || null })}
            disabled={busy || !name.trim()}
            style={{ padding:'10px 20px', borderRadius:10, border:'none', background: name.trim() ? '#2E3192' : '#c7c9e2', cursor: name.trim() ? 'pointer' : 'not-allowed', ...font, fontSize:13, fontWeight:700, color:'#fff' }}>
            {busy ? '...' : flow ? 'Salvar' : 'Criar Fluxo'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── ABA 1: Fluxos de Categorias ───────────────────────────────────────────
function FlowsTab({ clientId, categories, setError }) {
  const [flows, setFlows]           = useState([])
  const [flowId, setFlowId]         = useState('')
  const [flowCats, setFlowCats]     = useState([])   // linhas de client_flow_categories do fluxo
  const [loading, setLoading]       = useState(true)
  const [catsLoading, setCatsLoading] = useState(false)
  const [modal, setModal]           = useState(null)
  const [modalBusy, setModalBusy]   = useState(false)
  const [addSearch, setAddSearch]   = useState('')

  const catMap = useMemo(() => Object.fromEntries(categories.map(c => [c.id, c])), [categories])

  const loadFlows = useCallback(async (keepId) => {
    setLoading(true)
    const { data, error } = await supabase.from('client_flows')
      .select('*').eq('client_id', clientId).order('created_at')
    if (error) setError(error.message)
    setFlows(data || [])
    const still = (data || []).some(f => f.id === keepId)
    setFlowId(still ? keepId : ((data || [])[0]?.id || ''))
    setLoading(false)
  }, [clientId, setError])

  useEffect(() => { loadFlows() }, [loadFlows])

  useEffect(() => {
    if (!flowId) { setFlowCats([]); return }
    setCatsLoading(true)
    fetchAll(supabase.from('client_flow_categories').select('id, category_id').eq('flow_id', flowId).order('id'))
      .then(rows => { setFlowCats(rows); setCatsLoading(false) })
      .catch(e => { setError(e.message); setCatsLoading(false) })
  }, [flowId, setError])

  const currentFlow = flows.find(f => f.id === flowId)
  const inFlow = useMemo(() => new Set(flowCats.map(r => r.category_id)), [flowCats])
  const addable = useMemo(() => {
    const q = addSearch.trim().toLowerCase()
    if (!q) return []
    return categories.filter(c => !inFlow.has(c.id) && c.name.toLowerCase().includes(q)).slice(0, 12)
  }, [categories, inFlow, addSearch])

  async function saveFlow(values) {
    setModalBusy(true)
    try {
      if (modal.flow) {
        const { error } = await supabase.from('client_flows').update(values).eq('id', modal.flow.id)
        if (error) throw error
        await loadFlows(flowId)
      } else {
        const { data, error } = await supabase.from('client_flows')
          .insert({ client_id: clientId, ...values }).select().single()
        if (error) throw error
        await loadFlows(data.id)
      }
      setModal(null)
    } catch (e) {
      setError(e.code === '23505' ? 'Já existe um fluxo com esse nome para este cliente.' : e.message)
    } finally { setModalBusy(false) }
  }

  async function toggleActive(flow) {
    const { error } = await supabase.from('client_flows').update({ active: !flow.active }).eq('id', flow.id)
    if (error) { setError(error.message); return }
    setFlows(p => p.map(f => f.id === flow.id ? { ...f, active: !f.active } : f))
  }

  async function deleteFlow(flow) {
    if (!window.confirm(`Excluir o fluxo "${flow.name}"? As categorias continuam existindo — só o agrupamento é removido.`)) return
    const { error } = await supabase.from('client_flows').delete().eq('id', flow.id)
    if (error) { setError(error.message); return }
    await loadFlows(flowId === flow.id ? null : flowId)
  }

  async function addCat(cat) {
    const { data, error } = await supabase.from('client_flow_categories')
      .insert({ flow_id: flowId, category_id: cat.id }).select('id, category_id').single()
    if (error) { setError(error.message); return }
    setFlowCats(p => [...p, data])
  }

  async function removeCat(row) {
    const { error } = await supabase.from('client_flow_categories').delete().eq('id', row.id)
    if (error) { setError(error.message); return }
    setFlowCats(p => p.filter(r => r.id !== row.id))
  }

  if (loading) return <div style={{ display:'flex', justifyContent:'center', padding:40 }}><Spinner size={32}/></div>

  return (
    <div style={{ display:'grid', gridTemplateColumns:'320px 1fr', gap:20, alignItems:'start' }}>
      {/* Fluxos */}
      <Card style={{ borderRadius:14, padding:16 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
          <span style={{ ...lbl, marginBottom:0 }}>Fluxos ({flows.length})</span>
          <button onClick={() => setModal({ flow: null })}
            style={{ padding:'6px 12px', borderRadius:8, border:'none', background:'#2E3192', color:'#fff', cursor:'pointer', ...font, fontSize:12, fontWeight:700 }}>
            + Novo
          </button>
        </div>
        {flows.length === 0 ? (
          <div style={{ padding:'24px 8px', textAlign:'center', ...font, fontSize:13, color:'#9B9B9B' }}>
            Nenhum fluxo. Crie o primeiro com "+ Novo".
          </div>
        ) : flows.map(f => (
          <div key={f.id} onClick={() => setFlowId(f.id)}
            style={{ padding:'12px 14px', borderRadius:10, cursor:'pointer', marginBottom:8,
              border: f.id === flowId ? '1.5px solid #2E3192' : '1px solid #e2e4ef',
              background: f.id === flowId ? 'rgba(46,49,146,.05)' : '#fff', opacity: f.active ? 1 : .55 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ ...font, fontSize:13, fontWeight:700, color:'#1a1c5e', flex:1 }}>{f.name}</span>
              {!f.active && <span style={{ fontSize:9, fontWeight:700, color:'#9B9B9B', background:'#f1f2f8', padding:'2px 7px', borderRadius:20, ...titleF }}>inativo</span>}
            </div>
            {f.description && <div style={{ ...font, fontSize:11, color:'#9B9B9B', marginTop:3 }}>{f.description}</div>}
            <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:8 }}>
              <span style={{ ...font, fontSize:11, color:'#64748b', flex:1 }}>
                {f.id === flowId ? `📦 ${flowCats.length} categorias` : ''}
              </span>
              <button onClick={e => { e.stopPropagation(); setModal({ flow: f }) }} title="Renomear"
                style={{ background:'none', border:'none', cursor:'pointer', fontSize:13, padding:2 }}>✏️</button>
              <button onClick={e => { e.stopPropagation(); toggleActive(f) }} title={f.active ? 'Pausar' : 'Ativar'}
                style={{ background:'none', border:'none', cursor:'pointer', fontSize:13, padding:2 }}>{f.active ? '⏸' : '▶️'}</button>
              <button onClick={e => { e.stopPropagation(); deleteFlow(f) }} title="Excluir"
                style={{ background:'none', border:'none', cursor:'pointer', fontSize:13, padding:2 }}>🗑</button>
            </div>
          </div>
        ))}
      </Card>

      {/* Categorias do fluxo */}
      <Card style={{ borderRadius:14, padding:20 }}>
        {!currentFlow ? (
          <div style={{ padding:'40px 0', textAlign:'center', ...font, fontSize:13, color:'#9B9B9B' }}>
            Selecione ou crie um fluxo à esquerda
          </div>
        ) : (
          <>
            <div style={{ marginBottom:14 }}>
              <div style={{ ...titleF, fontWeight:800, fontSize:15, color:'#1a1c5e' }}>{currentFlow.name}</div>
              <div style={{ ...font, fontSize:12, color:'#9B9B9B', marginTop:2 }}>
                {flowCats.length} categoria{flowCats.length === 1 ? '' : 's'} — os documentos exigidos vêm da Matriz de cada categoria
              </div>
            </div>

            <div style={{ position:'relative', marginBottom:14 }}>
              <input value={addSearch} onChange={e => setAddSearch(e.target.value)}
                placeholder="➕ Buscar categoria do cliente para adicionar ao fluxo..."
                style={{ ...inputCss, border:'1px dashed #2E319266', background:'rgba(46,49,146,.02)' }}/>
              {addSearch.trim() && (
                <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, right:0, background:'#fff', border:'1px solid #e2e4ef', borderRadius:10, boxShadow:'0 4px 16px rgba(0,0,0,.1)', zIndex:100, maxHeight:280, overflowY:'auto' }}>
                  {addable.length === 0
                    ? <div style={{ padding:'12px 14px', ...font, fontSize:13, color:'#9B9B9B' }}>Nenhuma categoria disponível para "{addSearch}"</div>
                    : addable.map(c => (
                      <button key={c.id} onClick={() => { addCat(c); setAddSearch('') }}
                        style={{ width:'100%', padding:'10px 14px', border:'none', borderBottom:'1px solid #f4f5f9', background:'#fff', cursor:'pointer', textAlign:'left', ...font, fontSize:13, color:'#1a1c5e', display:'flex', justifyContent:'space-between' }}>
                        {c.name}
                        <span style={{ fontSize:11, color:'#22c55e', fontWeight:700 }}>+ adicionar</span>
                      </button>
                    ))
                  }
                </div>
              )}
            </div>

            {catsLoading ? (
              <div style={{ display:'flex', justifyContent:'center', padding:24 }}><Spinner size={24}/></div>
            ) : flowCats.length === 0 ? (
              <div style={{ padding:'24px 0', textAlign:'center', ...font, fontSize:13, color:'#9B9B9B' }}>
                Fluxo vazio — adicione categorias acima
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:6, maxHeight:480, overflowY:'auto' }}>
                {flowCats
                  .map(r => ({ ...r, cat: catMap[r.category_id] }))
                  .sort((a, b) => (a.cat?.name || '').localeCompare(b.cat?.name || ''))
                  .map(r => (
                  <div key={r.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:8, border:'1px solid #eef0f6' }}>
                    <span style={{ fontSize:14 }}>📦</span>
                    <span style={{ ...font, fontSize:13, color:'#1a1c5e', flex:1 }}>
                      {r.cat?.name || `Categoria #${r.category_id}`}
                    </span>
                    <button onClick={() => removeCat(r)} title="Remover do fluxo"
                      style={{ background:'none', border:'none', cursor:'pointer', fontSize:13, color:'#9B9B9B' }}>🗑</button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </Card>

      {modal && <FlowFormModal flow={modal.flow} busy={modalBusy} onSave={saveFlow} onClose={() => setModal(null)}/>}
    </div>
  )
}

// ── ABA 2: Matriz de Documentos (categoria → documentos) ──────────────────
function MatrixTab({ clientId, categories, setError }) {
  const [catalog, setCatalog]   = useState([])
  const [search, setSearch]     = useState('')
  const [expanded, setExpanded] = useState(null)      // category_id aberto
  const [catDocs, setCatDocs]   = useState({})        // catId → [{id, document_id, blocking}]
  const [busy, setBusy]         = useState(false)
  const [addSearch, setAddSearch] = useState('')

  useEffect(() => {
    supabase.from('documents_catalog').select('id, name').order('name')
      .then(({ data }) => setCatalog(data || []))
  }, [])
  const catalogMap = useMemo(() => Object.fromEntries(catalog.map(d => [d.id, d])), [catalog])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = q ? categories.filter(c => c.name.toLowerCase().includes(q)) : categories
    return list.slice(0, 60)
  }, [categories, search])

  async function toggleExpand(catId) {
    if (expanded === catId) { setExpanded(null); return }
    setExpanded(catId)
    setAddSearch('')
    if (!catDocs[catId]) {
      const { data, error } = await supabase.from('category_documents')
        .select('id, document_id, blocking').eq('category_id', catId)
      if (error) { setError(error.message); return }
      setCatDocs(p => ({ ...p, [catId]: data || [] }))
    }
  }

  const docs = catDocs[expanded] || []
  const inCat = useMemo(() => new Set(docs.map(d => d.document_id)), [docs])
  const addable = useMemo(() => {
    const q = addSearch.trim().toLowerCase()
    if (!q) return []
    return catalog.filter(d => !inCat.has(d.id) && d.name.toLowerCase().includes(q)).slice(0, 12)
  }, [catalog, inCat, addSearch])

  async function addDoc(doc) {
    setBusy(true)
    const { data, error } = await supabase.from('category_documents')
      .insert({ category_id: expanded, document_id: doc.id, blocking: false })
      .select('id, document_id, blocking').single()
    if (error) setError(error.message)
    else setCatDocs(p => ({ ...p, [expanded]: [...(p[expanded] || []), data] }))
    setBusy(false)
  }

  async function removeDoc(row) {
    setBusy(true)
    const { error } = await supabase.from('category_documents').delete().eq('id', row.id)
    if (error) setError(error.message)
    else setCatDocs(p => ({ ...p, [expanded]: (p[expanded] || []).filter(d => d.id !== row.id) }))
    setBusy(false)
  }

  async function toggleBlocking(row) {
    setBusy(true)
    const { error } = await supabase.from('category_documents')
      .update({ blocking: !row.blocking }).eq('id', row.id)
    if (error) setError(error.message)
    else setCatDocs(p => ({ ...p, [expanded]: (p[expanded] || []).map(d => d.id === row.id ? { ...d, blocking: !row.blocking } : d) }))
    setBusy(false)
  }

  return (
    <div>
      <div style={{ marginBottom:14, display:'flex', gap:12, alignItems:'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Buscar categoria do cliente..." style={{ ...inputCss, maxWidth:420 }}/>
        <span style={{ ...font, fontSize:12, color:'#9B9B9B' }}>
          {categories.length.toLocaleString('pt-BR')} categorias do cliente{filtered.length < categories.length ? ` · exibindo ${filtered.length}` : ''}
        </span>
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
        {filtered.map(cat => {
          const isOpen = expanded === cat.id
          return (
            <Card key={cat.id} style={{ borderRadius:12, padding:0, overflow:'visible', border:'1px solid #e2e4ef' }}>
              <button onClick={() => toggleExpand(cat.id)}
                style={{ width:'100%', background:'#fff', border:'none', cursor:'pointer', padding:'12px 16px', display:'flex', alignItems:'center', gap:10, textAlign:'left', borderRadius:12 }}>
                <span style={{ color:'#9B9B9B', fontSize:11, transform: isOpen ? 'rotate(90deg)' : 'none', display:'inline-block', transition:'transform .15s' }}>▶</span>
                <span style={{ ...font, fontSize:13, fontWeight:600, color:'#1a1c5e', flex:1 }}>{cat.name}</span>
                {isOpen && <span style={{ ...font, fontSize:11, color:'#9B9B9B' }}>{docs.length} docs</span>}
              </button>

              {isOpen && (
                <div style={{ padding:'4px 16px 16px', borderTop:'1px solid #f0f0f5' }}>
                  <div style={{ position:'relative', margin:'12px 0' }}>
                    <input value={addSearch} onChange={e => setAddSearch(e.target.value)}
                      placeholder="➕ Adicionar documento do catálogo a esta categoria..."
                      style={{ ...inputCss, border:'1px dashed #2E319266', background:'rgba(46,49,146,.02)' }}/>
                    {addSearch.trim() && (
                      <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, right:0, background:'#fff', border:'1px solid #e2e4ef', borderRadius:10, boxShadow:'0 4px 16px rgba(0,0,0,.1)', zIndex:100, maxHeight:240, overflowY:'auto' }}>
                        {addable.length === 0
                          ? <div style={{ padding:'10px 14px', ...font, fontSize:13, color:'#9B9B9B' }}>Nenhum documento disponível</div>
                          : addable.map(d => (
                            <button key={d.id} disabled={busy} onClick={() => { addDoc(d); setAddSearch('') }}
                              style={{ width:'100%', padding:'9px 14px', border:'none', borderBottom:'1px solid #f4f5f9', background:'#fff', cursor:'pointer', textAlign:'left', ...font, fontSize:13, color:'#1a1c5e', display:'flex', justifyContent:'space-between' }}>
                              {d.name}<span style={{ fontSize:11, color:'#22c55e', fontWeight:700 }}>+ adicionar</span>
                            </button>
                          ))
                        }
                      </div>
                    )}
                  </div>

                  {docs.length === 0 ? (
                    <div style={{ padding:'10px 0', ...font, fontSize:13, color:'#9B9B9B', textAlign:'center' }}>
                      Nenhum documento nesta categoria
                    </div>
                  ) : (
                    <>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 140px 36px', gap:8, padding:'0 10px 4px', alignItems:'center' }}>
                        <span style={{ ...lbl, marginBottom:0 }}>Documento</span>
                        <span style={{ ...lbl, marginBottom:0, textAlign:'center' }}>Desclassificatório</span>
                        <span/>
                      </div>
                      {docs
                        .map(row => ({ ...row, name: catalogMap[row.document_id]?.name || `Documento #${row.document_id}` }))
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map(row => (
                        <div key={row.id} style={{ display:'grid', gridTemplateColumns:'1fr 140px 36px', gap:8, alignItems:'center', padding:'8px 10px', borderRadius:8, border:'1px solid #eef0f6', marginBottom:4, background: row.blocking ? 'rgba(239,68,68,.03)' : '#fff' }}>
                          <span style={{ ...font, fontSize:13, color:'#1a1c5e' }}>{row.name}</span>
                          <div style={{ textAlign:'center' }}>
                            <input type="checkbox" checked={!!row.blocking} disabled={busy}
                              onChange={() => toggleBlocking(row)}
                              style={{ width:15, height:15, accentColor:'#ef4444', cursor:'pointer' }}/>
                          </div>
                          <button onClick={() => removeDoc(row)} disabled={busy} title="Remover da categoria"
                            style={{ background:'none', border:'none', cursor:'pointer', fontSize:13, color:'#9B9B9B' }}>🗑</button>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}

// ── Página ────────────────────────────────────────────────────────────────
export default function BackofficeClientDocumentFlows() {
  const [clients, setClients]       = useState([])
  const [clientId, setClientId]     = useState('')
  const [categories, setCategories] = useState([])   // categorias DO CLIENTE
  const [tab, setTab]               = useState('fluxos')
  const [baseLoading, setBaseLoading] = useState(true)
  const [catsLoading, setCatsLoading] = useState(false)
  const [error, setError]           = useState('')

  useEffect(() => {
    supabase.from('clients').select('id, razao_social, nome_fantasia').order('razao_social')
      .then(({ data }) => { setClients(data || []); setBaseLoading(false) })
  }, [])

  useEffect(() => {
    if (!clientId) { setCategories([]); return }
    setCatsLoading(true)
    setError('')
    fetchAll(supabase.from('categories').select('id, name, parent_id').eq('client_id', clientId).order('id'))
      .then(rows => { setCategories(rows); setCatsLoading(false) })
      .catch(e => { setError(e.message); setCatsLoading(false) })
  }, [clientId])

  if (baseLoading) return <div style={{ display:'flex', justifyContent:'center', padding:80 }}><Spinner size={40}/></div>

  return (
    <div style={{ padding:'24px 32px', maxWidth:1080, margin:'0 auto' }}>
      <PageHeader title="Fluxos de Homologação"
        subtitle="Matriz de Documentos (categoria → documentos) e Fluxos de Categorias (fluxo → categorias)"/>

      <Card style={{ borderRadius:14, padding:'20px 24px', marginBottom:20 }}>
        <span style={lbl}>Cliente</span>
        <ClientSearchCombo clients={clients} value={clientId} onChange={setClientId}/>
      </Card>

      {error && (
        <div style={{ marginBottom:16, padding:'12px 16px', borderRadius:10, background:'rgba(239,68,68,.08)', border:'1px solid rgba(239,68,68,.3)', ...font, fontSize:13, color:'#b91c1c' }}>
          {error}
        </div>
      )}

      {clientId && (catsLoading ? (
        <div style={{ display:'flex', justifyContent:'center', padding:40 }}><Spinner size={32}/></div>
      ) : (
        <>
          <div style={{ display:'flex', gap:8, marginBottom:20, borderBottom:'1px solid #e2e4ef' }}>
            {[['fluxos','📂 Fluxos de Categorias'],['matriz','🧩 Matriz de Documentos']].map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)}
                style={{ padding:'10px 18px', border:'none', borderBottom: tab===k ? '2.5px solid #2E3192' : '2.5px solid transparent', background:'none', cursor:'pointer', ...titleF, fontWeight:700, fontSize:13, color: tab===k ? '#2E3192' : '#9B9B9B' }}>
                {l}
              </button>
            ))}
          </div>
          {categories.length === 0 && (
            <div style={{ marginBottom:16, padding:'12px 16px', borderRadius:10, background:'#fffbeb', border:'1px solid #fde68a', ...font, fontSize:13, color:'#92400e' }}>
              Este cliente ainda não tem categorias próprias. Cadastre as categorias antes de montar a Matriz e os Fluxos.
            </div>
          )}
          {tab === 'fluxos'
            ? <FlowsTab   key={clientId} clientId={clientId} categories={categories} setError={setError}/>
            : <MatrixTab  key={clientId} clientId={clientId} categories={categories} setError={setError}/>
          }
        </>
      ))}
    </div>
  )
}
