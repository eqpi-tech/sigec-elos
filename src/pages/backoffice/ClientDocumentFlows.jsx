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
  const [price, setPrice] = useState(flow?.price ?? '')
  const [priceSub, setPriceSub] = useState(flow?.price_subsidized ?? '')
  const [isDefault, setIsDefault] = useState(!!flow?.is_default)
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
          style={{ ...inputCss, resize:'vertical', marginBottom:14 }} />
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
          <div>
            <span style={lbl}>Preço (R$) — não subsidiado</span>
            <input type="number" min="0" step="0.01" value={price} onChange={e => setPrice(e.target.value)}
              placeholder="0,00" style={{ ...inputCss, fontSize:14 }} />
          </div>
          <div>
            <span style={lbl}>Preço (R$) — subsidiado</span>
            <input type="number" min="0" step="0.01" value={priceSub} onChange={e => setPriceSub(e.target.value)}
              placeholder="0,00" style={{ ...inputCss, fontSize:14 }} />
          </div>
        </div>
        <label style={{ ...font, fontSize:13, color:'#1a1c5e', display:'flex', alignItems:'center', gap:8, marginBottom:20, cursor:'pointer' }}>
          <input type="checkbox" checked={isDefault} onChange={e => setIsDefault(e.target.checked)} style={{ accentColor:'#2E3192' }} />
          ⭐ Fluxo padrão — fornecedores espontâneos (sem convite) caem neste fluxo
        </label>
        <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
          <button onClick={onClose} disabled={busy}
            style={{ padding:'10px 20px', borderRadius:10, border:'1px solid #e2e4ef', background:'#fff', cursor:'pointer', ...font, fontSize:13, fontWeight:600, color:'#64748b' }}>
            Cancelar
          </button>
          <button onClick={() => onSave({ name: name.trim(), description: description.trim() || null,
              price: price === '' ? null : Number(price),
              price_subsidized: priceSub === '' ? null : Number(priceSub),
              is_default: isDefault })}
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
      // Só pode haver 1 fluxo padrão por cliente (índice único parcial)
      if (values.is_default) {
        const { error: defErr } = await supabase.from('client_flows')
          .update({ is_default: false }).eq('client_id', clientId).eq('is_default', true)
        if (defErr) throw defErr
      }
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
              {f.is_default && <span style={{ fontSize:9, fontWeight:700, color:'#92400e', background:'#fef3c7', padding:'2px 7px', borderRadius:20, ...titleF }}>⭐ padrão</span>}
              {!f.active && <span style={{ fontSize:9, fontWeight:700, color:'#9B9B9B', background:'#f1f2f8', padding:'2px 7px', borderRadius:20, ...titleF }}>inativo</span>}
            </div>
            {f.description && <div style={{ ...font, fontSize:11, color:'#9B9B9B', marginTop:3 }}>{f.description}</div>}
            {(f.price != null || f.price_subsidized != null) && (
              <div style={{ ...font, fontSize:11, color:'#15803d', marginTop:3 }}>
                💰 {f.price != null ? `R$ ${Number(f.price).toFixed(2).replace('.', ',')}` : '—'}
                {f.price_subsidized != null && ` · subsidiado R$ ${Number(f.price_subsidized).toFixed(2).replace('.', ',')}`}
              </div>
            )}
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

// ── ABA 3: Mobilidade (matriz de docs PF + postos por CNPJ) ───────────────
// SPEC_MOBILIDADE.md: docs de pessoa/posto por categoria + slots de postos
// abertos por CNPJ (o fornecedor vê a árvore ao se cadastrar).
const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']

function validCnpj(value) {
  const d = String(value || '').replace(/\D/g, '')
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false
  const calc = (len) => {
    const w = len === 12 ? [5,4,3,2,9,8,7,6,5,4,3,2] : [6,5,4,3,2,9,8,7,6,5,4,3,2]
    const sum = w.reduce((a, p, i) => a + p * Number(d[i]), 0)
    const r = sum % 11
    return r < 2 ? 0 : 11 - r
  }
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13])
}
const fmtCnpj = (c) => String(c || '').replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')

function PostFormModal({ post, categories, onSave, onClose, busy }) {
  const [f, setF] = useState({
    supplier_cnpj: post?.supplier_cnpj || '', category_id: post?.category_id || '',
    site_city: post?.site_city || '', site_uf: post?.site_uf || '',
    armado: !!post?.armado, qty_posts: post?.qty_posts ?? 1, qty_people: post?.qty_people ?? 1,
    funcao_label: post?.funcao_label || '',
  })
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  const cnpjDigits = f.supplier_cnpj.replace(/\D/g, '')
  const cnpjOk = validCnpj(cnpjDigits)
  const ok = cnpjOk && f.category_id && f.site_city.trim() && f.site_uf && Number(f.qty_people) > 0 && Number(f.qty_posts) > 0
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(15,17,60,.45)', zIndex:500, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background:'#fff', borderRadius:16, padding:'24px 28px', width:'100%', maxWidth:480, boxShadow:'0 20px 60px rgba(0,0,0,.25)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
          <h3 style={{ ...titleF, fontWeight:800, fontSize:16, color:'#1a1c5e', margin:0 }}>
            {post ? 'Editar Posto' : 'Novo Posto de Mobilidade'}
          </h3>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#9B9B9B', fontSize:18, lineHeight:1 }}>✕</button>
        </div>
        <span style={lbl}>CNPJ do fornecedor *</span>
        <input value={f.supplier_cnpj} onChange={e => set('supplier_cnpj', e.target.value)}
          placeholder="00.000.000/0000-00"
          style={{ ...inputCss, marginBottom:4, borderColor: f.supplier_cnpj && !cnpjOk ? '#ef4444' : '#e2e4ef' }}/>
        <div style={{ ...font, fontSize:11, color: f.supplier_cnpj ? (cnpjOk ? '#22c55e' : '#ef4444') : '#9B9B9B', marginBottom:12 }}>
          {f.supplier_cnpj ? (cnpjOk ? '✓ CNPJ válido' : 'CNPJ inválido — confira os dígitos') : 'O slot abre para este CNPJ mesmo antes do cadastro'}
        </div>
        <span style={lbl}>Categoria (função) *</span>
        <select value={f.category_id} onChange={e => set('category_id', Number(e.target.value))}
          style={{ ...inputCss, marginBottom:12 }}>
          <option value="">Selecione...</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 90px', gap:12, marginBottom:12 }}>
          <div>
            <span style={lbl}>Cidade *</span>
            <input value={f.site_city} onChange={e => set('site_city', e.target.value)} style={inputCss}/>
          </div>
          <div>
            <span style={lbl}>UF *</span>
            <select value={f.site_uf} onChange={e => set('site_uf', e.target.value)} style={inputCss}>
              <option value="">—</option>
              {UFS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:12 }}>
          <div>
            <span style={lbl}>Qtde postos *</span>
            <input type="number" min="1" value={f.qty_posts} onChange={e => set('qty_posts', e.target.value)} style={inputCss}/>
          </div>
          <div>
            <span style={lbl}>Qtde pessoas *</span>
            <input type="number" min="1" value={f.qty_people} onChange={e => set('qty_people', e.target.value)} style={inputCss}/>
          </div>
          <div>
            <span style={lbl}>Armado</span>
            <label style={{ ...font, fontSize:13, color:'#1a1c5e', display:'flex', alignItems:'center', gap:8, paddingTop:9, cursor:'pointer' }}>
              <input type="checkbox" checked={f.armado} onChange={e => set('armado', e.target.checked)} style={{ accentColor:'#2E3192' }}/>
              🔫 Sim
            </label>
          </div>
        </div>
        <span style={lbl}>Rótulo da função (opcional)</span>
        <input value={f.funcao_label} onChange={e => set('funcao_label', e.target.value)}
          placeholder='Ex.: "ASG DIURNO 40%"' style={{ ...inputCss, marginBottom:20 }}/>
        <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
          <button onClick={onClose} disabled={busy}
            style={{ padding:'10px 20px', borderRadius:10, border:'1px solid #e2e4ef', background:'#fff', cursor:'pointer', ...font, fontSize:13, fontWeight:600, color:'#64748b' }}>
            Cancelar
          </button>
          <button disabled={busy || !ok}
            onClick={() => onSave({
              supplier_cnpj: cnpjDigits, category_id: f.category_id,
              site_city: f.site_city.trim(), site_uf: f.site_uf, armado: f.armado,
              qty_posts: Number(f.qty_posts), qty_people: Number(f.qty_people),
              funcao_label: f.funcao_label.trim() || null,
            })}
            style={{ padding:'10px 20px', borderRadius:10, border:'none', background: ok ? '#2E3192' : '#c7c9e2', cursor: ok ? 'pointer' : 'not-allowed', ...font, fontSize:13, fontWeight:700, color:'#fff' }}>
            {busy ? '...' : post ? 'Salvar' : 'Criar Posto'}
          </button>
        </div>
      </div>
    </div>
  )
}

function MobilidadeTab({ clientId, categories, setError }) {
  const [panel, setPanel]       = useState('postos')     // 'postos' | 'matriz'
  const [posts, setPosts]       = useState([])
  const [peopleCount, setPeopleCount] = useState({})     // post_id → nº pessoas ativas
  const [loading, setLoading]   = useState(true)
  const [modal, setModal]       = useState(null)         // { post } | null
  const [modalBusy, setModalBusy] = useState(false)
  const [filter, setFilter]     = useState('')
  // matriz
  const [catalog, setCatalog]   = useState([])
  const [expanded, setExpanded] = useState(null)
  const [catDocs, setCatDocs]   = useState({})
  const [addSearch, setAddSearch] = useState('')
  const [busy, setBusy]         = useState(false)
  const [matrixCatIds, setMatrixCatIds] = useState(new Set()) // categorias do cliente COM matriz de mobilidade
  const [catSearch, setCatSearch] = useState('')              // busca p/ montar matriz numa categoria nova

  const catMap = useMemo(() => Object.fromEntries(categories.map(c => [c.id, c])), [categories])
  // categorias com matriz de mobilidade OU com postos — as relevantes para a aba
  const mobCatIds = useMemo(() => new Set(posts.map(p => p.category_id)), [posts])

  const loadPosts = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await fetchAll(supabase.from('mobility_posts')
        .select('*').eq('client_id', clientId).order('created_at'))
      setPosts(rows)
      if (rows.length) {
        const { data: ppl } = await supabase.from('mobility_people')
          .select('post_id').in('post_id', rows.map(r => r.id)).eq('active', true)
        const cnt = {}
        for (const p of (ppl || [])) cnt[p.post_id] = (cnt[p.post_id] || 0) + 1
        setPeopleCount(cnt)
      }
    } catch (e) { setError(e.message) }
    setLoading(false)
  }, [clientId, setError])

  useEffect(() => { loadPosts() }, [loadPosts])
  useEffect(() => {
    supabase.from('documents_catalog').select('id, name').order('name')
      .then(({ data }) => setCatalog(data || []))
  }, [])
  // categorias DESTE cliente que já têm matriz de mobilidade (join no servidor)
  useEffect(() => {
    fetchAll(supabase.from('category_mobility_documents')
      .select('category_id, categories!inner(client_id)')
      .eq('categories.client_id', clientId))
      .then(rows => setMatrixCatIds(new Set(rows.map(r => r.category_id))))
      .catch(e => setError(e.message))
  }, [clientId, setError])
  const catalogMap = useMemo(() => Object.fromEntries(catalog.map(d => [d.id, d])), [catalog])

  async function savePost(values) {
    setModalBusy(true)
    try {
      if (modal.post) {
        const { error } = await supabase.from('mobility_posts').update(values).eq('id', modal.post.id)
        if (error) throw error
      } else {
        // resolve supplier_id se o CNPJ já existir na base
        const { data: sup } = await supabase.from('suppliers')
          .select('id').eq('cnpj', values.supplier_cnpj).maybeSingle()
        const { error } = await supabase.from('mobility_posts')
          .insert({ client_id: clientId, supplier_id: sup?.id || null, source: 'manual', ...values })
        if (error) throw error
      }
      await loadPosts()
      setModal(null)
    } catch (e) {
      setError(e.code === '23505' ? 'Já existe um posto idêntico (mesmo CNPJ, categoria, cidade e função).' : e.message)
    } finally { setModalBusy(false) }
  }

  async function togglePost(post) {
    const { error } = await supabase.from('mobility_posts').update({ active: !post.active }).eq('id', post.id)
    if (error) { setError(error.message); return }
    setPosts(p => p.map(x => x.id === post.id ? { ...x, active: !x.active } : x))
  }

  // ── matriz de mobilidade ──
  async function toggleExpand(catId) {
    if (expanded === catId) { setExpanded(null); return }
    setExpanded(catId); setAddSearch('')
    if (!catDocs[catId]) {
      const { data, error } = await supabase.from('category_mobility_documents')
        .select('id, document_id, escopo, required, blocking').eq('category_id', catId)
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
    const { data, error } = await supabase.from('category_mobility_documents')
      .insert({ category_id: expanded, document_id: doc.id, escopo: 'pessoa', required: true, blocking: true })
      .select('id, document_id, escopo, required, blocking').single()
    if (error) setError(error.message)
    else {
      setCatDocs(p => ({ ...p, [expanded]: [...(p[expanded] || []), data] }))
      setMatrixCatIds(p => new Set([...p, expanded]))
    }
    setBusy(false)
  }
  async function removeDoc(row) {
    setBusy(true)
    const { error } = await supabase.from('category_mobility_documents').delete().eq('id', row.id)
    if (error) setError(error.message)
    else setCatDocs(p => ({ ...p, [expanded]: (p[expanded] || []).filter(d => d.id !== row.id) }))
    setBusy(false)
  }
  async function updateDoc(row, patch) {
    setBusy(true)
    const { error } = await supabase.from('category_mobility_documents').update(patch).eq('id', row.id)
    if (error) setError(error.message)
    else setCatDocs(p => ({ ...p, [expanded]: (p[expanded] || []).map(d => d.id === row.id ? { ...d, ...patch } : d) }))
    setBusy(false)
  }

  const filteredPosts = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return posts
    return posts.filter(p => p.supplier_cnpj.includes(q.replace(/\D/g, '') || '\u0000')
      || (catMap[p.category_id]?.name || '').toLowerCase().includes(q)
      || p.site_city.toLowerCase().includes(q))
  }, [posts, filter, catMap])

  // Só categorias de mobilidade do cliente (com postos ou matriz) aparecem —
  // cliente sem mobilidade (ex. sem postos) vê o painel vazio, não a lista
  // inteira de categorias (feedback 23/09). Categoria nova entra pela busca.
  const [extraCats, setExtraCats] = useState(new Set())
  const matrizCats = useMemo(() =>
    categories.filter(c => mobCatIds.has(c.id) || matrixCatIds.has(c.id) || extraCats.has(c.id)),
  [categories, mobCatIds, matrixCatIds, extraCats])
  const catSearchResults = useMemo(() => {
    const q = catSearch.trim().toLowerCase()
    if (!q) return []
    const shown = new Set(matrizCats.map(c => c.id))
    return categories.filter(c => !shown.has(c.id) && c.name.toLowerCase().includes(q)).slice(0, 12)
  }, [categories, matrizCats, catSearch])

  if (loading) return <div style={{ display:'flex', justifyContent:'center', padding:40 }}><Spinner size={32}/></div>

  return (
    <div>
      <div style={{ display:'flex', gap:8, marginBottom:16 }}>
        {[['postos','📍 Postos'],['matriz','🧩 Matriz de Mobilidade']].map(([k, l]) => (
          <button key={k} onClick={() => setPanel(k)}
            style={{ padding:'8px 16px', borderRadius:20, border: panel===k ? 'none' : '1px solid #e2e4ef', background: panel===k ? '#2E3192' : '#fff', cursor:'pointer', ...titleF, fontWeight:700, fontSize:12, color: panel===k ? '#fff' : '#9B9B9B' }}>
            {l}
          </button>
        ))}
      </div>

      {panel === 'postos' ? (
        <Card style={{ borderRadius:14, padding:20 }}>
          <div style={{ display:'flex', gap:12, alignItems:'center', marginBottom:14 }}>
            <input value={filter} onChange={e => setFilter(e.target.value)}
              placeholder="🔍 Filtrar por CNPJ, categoria ou cidade..." style={{ ...inputCss, maxWidth:380 }}/>
            <span style={{ ...font, fontSize:12, color:'#9B9B9B', flex:1 }}>
              {posts.length} posto{posts.length === 1 ? '' : 's'} · {Object.values(peopleCount).reduce((a, b) => a + b, 0)} pessoas cadastradas
            </span>
            <button onClick={() => setModal({ post: null })}
              style={{ padding:'8px 16px', borderRadius:8, border:'none', background:'#2E3192', color:'#fff', cursor:'pointer', ...font, fontSize:12, fontWeight:700 }}>
              + Novo Posto
            </button>
          </div>
          {filteredPosts.length === 0 ? (
            <div style={{ padding:'28px 0', textAlign:'center', ...font, fontSize:13, color:'#9B9B9B' }}>
              Nenhum posto. Cadastre com "+ Novo Posto" ou rode a importação das planilhas.
            </div>
          ) : (
            <>
              <div style={{ display:'grid', gridTemplateColumns:'150px 1fr 150px 60px 110px 110px 70px', gap:8, padding:'0 10px 6px', alignItems:'center' }}>
                {['CNPJ','Categoria / função','Localidade','Armado','Postos/Pessoas','Cadastradas',''].map((h, i) => <span key={i} style={{ ...lbl, marginBottom:0 }}>{h}</span>)}
              </div>
              {filteredPosts.map(p => {
                const cadastradas = peopleCount[p.id] || 0
                const okPeople = cadastradas >= p.qty_people
                return (
                  <div key={p.id} style={{ display:'grid', gridTemplateColumns:'150px 1fr 150px 60px 110px 110px 70px', gap:8, alignItems:'center', padding:'9px 10px', borderRadius:8, border:'1px solid #eef0f6', marginBottom:4, opacity: p.active ? 1 : .5 }}>
                    <span style={{ ...font, fontSize:12, color:'#1a1c5e', fontWeight:600 }}>{fmtCnpj(p.supplier_cnpj)}</span>
                    <div>
                      <div style={{ ...font, fontSize:12.5, color:'#1a1c5e' }}>{catMap[p.category_id]?.name || `#${p.category_id}`}</div>
                      {p.funcao_label && <div style={{ ...font, fontSize:11, color:'#9B9B9B' }}>{p.funcao_label}</div>}
                    </div>
                    <span style={{ ...font, fontSize:12, color:'#64748b' }}>{p.site_city}/{p.site_uf}</span>
                    <span style={{ fontSize:13 }}>{p.armado ? '🔫' : '—'}</span>
                    <span style={{ ...font, fontSize:12, color:'#64748b' }}>{p.qty_posts} / {p.qty_people}</span>
                    <span style={{ ...font, fontSize:12, fontWeight:700, color: okPeople ? '#22c55e' : '#f59e0b' }}>
                      {cadastradas}/{p.qty_people} {okPeople ? '✓' : ''}
                    </span>
                    <div style={{ display:'flex', gap:6, justifyContent:'flex-end' }}>
                      <button onClick={() => setModal({ post: p })} title="Editar"
                        style={{ background:'none', border:'none', cursor:'pointer', fontSize:13, padding:2 }}>✏️</button>
                      <button onClick={() => togglePost(p)} title={p.active ? 'Desativar' : 'Reativar'}
                        style={{ background:'none', border:'none', cursor:'pointer', fontSize:13, padding:2 }}>{p.active ? '⏸' : '▶️'}</button>
                    </div>
                  </div>
                )
              })}
            </>
          )}
        </Card>
      ) : (
        <div>
          <div style={{ marginBottom:12, padding:'10px 14px', borderRadius:10, background:'rgba(46,49,146,.04)', ...font, fontSize:12, color:'#64748b' }}>
            Docs por <b>Pessoa</b> são exigidos de cada colaborador cadastrado; docs por <b>Posto</b> valem uma vez por posto/unidade (ex.: PCMSO, PGR, Registro da Arma).
          </div>
          <div style={{ position:'relative', marginBottom:12 }}>
            <input value={catSearch} onChange={e => setCatSearch(e.target.value)}
              placeholder="➕ Buscar categoria do cliente para montar a matriz de mobilidade..."
              style={{ ...inputCss, maxWidth:480, border:'1px dashed #2E319266', background:'rgba(46,49,146,.02)' }}/>
            {catSearch.trim() && (
              <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, width:'100%', maxWidth:480, background:'#fff', border:'1px solid #e2e4ef', borderRadius:10, boxShadow:'0 4px 16px rgba(0,0,0,.1)', zIndex:150, maxHeight:240, overflowY:'auto' }}>
                {catSearchResults.length === 0
                  ? <div style={{ padding:'10px 14px', ...font, fontSize:13, color:'#9B9B9B' }}>Nenhuma categoria encontrada</div>
                  : catSearchResults.map(c => (
                    <button key={c.id} onClick={() => { setExtraCats(p => new Set([...p, c.id])); setCatSearch(''); toggleExpand(c.id) }}
                      style={{ width:'100%', padding:'9px 14px', border:'none', borderBottom:'1px solid #f4f5f9', background:'#fff', cursor:'pointer', textAlign:'left', ...font, fontSize:13, color:'#1a1c5e', display:'flex', justifyContent:'space-between' }}>
                      {c.name}<span style={{ fontSize:11, color:'#22c55e', fontWeight:700 }}>montar matriz</span>
                    </button>
                  ))
                }
              </div>
            )}
          </div>
          {matrizCats.length === 0 && (
            <div style={{ padding:'24px 0', textAlign:'center', ...font, fontSize:13, color:'#9B9B9B' }}>
              Este cliente não tem categorias com mobilidade. Cadastre postos ou busque uma categoria acima para montar a matriz.
            </div>
          )}
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {matrizCats.slice(0, 60).map(cat => {
              const isOpen = expanded === cat.id
              return (
                <Card key={cat.id} style={{ borderRadius:12, padding:0, overflow:'visible', border:'1px solid #e2e4ef' }}>
                  <button onClick={() => toggleExpand(cat.id)}
                    style={{ width:'100%', background:'#fff', border:'none', cursor:'pointer', padding:'12px 16px', display:'flex', alignItems:'center', gap:10, textAlign:'left', borderRadius:12 }}>
                    <span style={{ color:'#9B9B9B', fontSize:11, transform: isOpen ? 'rotate(90deg)' : 'none', display:'inline-block', transition:'transform .15s' }}>▶</span>
                    <span style={{ ...font, fontSize:13, fontWeight:600, color:'#1a1c5e', flex:1 }}>{cat.name}</span>
                    {mobCatIds.has(cat.id) && <span style={{ fontSize:9, fontWeight:700, color:'#2E3192', background:'rgba(46,49,146,.08)', padding:'2px 7px', borderRadius:20, ...titleF }}>📍 tem postos</span>}
                    {isOpen && <span style={{ ...font, fontSize:11, color:'#9B9B9B' }}>{docs.length} docs</span>}
                  </button>
                  {isOpen && (
                    <div style={{ padding:'4px 16px 16px', borderTop:'1px solid #f0f0f5' }}>
                      <div style={{ position:'relative', margin:'12px 0' }}>
                        <input value={addSearch} onChange={e => setAddSearch(e.target.value)}
                          placeholder="➕ Adicionar documento de mobilidade a esta categoria..."
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
                          Nenhum documento de mobilidade nesta categoria
                        </div>
                      ) : (
                        <>
                          <div style={{ display:'grid', gridTemplateColumns:'1fr 130px 120px 36px', gap:8, padding:'0 10px 4px', alignItems:'center' }}>
                            <span style={{ ...lbl, marginBottom:0 }}>Documento</span>
                            <span style={{ ...lbl, marginBottom:0, textAlign:'center' }}>Escopo</span>
                            <span style={{ ...lbl, marginBottom:0, textAlign:'center' }}>Desclassificatório</span>
                            <span/>
                          </div>
                          {docs
                            .map(row => ({ ...row, name: catalogMap[row.document_id]?.name || `Documento #${row.document_id}` }))
                            .sort((a, b) => a.name.localeCompare(b.name))
                            .map(row => (
                            <div key={row.id} style={{ display:'grid', gridTemplateColumns:'1fr 130px 120px 36px', gap:8, alignItems:'center', padding:'8px 10px', borderRadius:8, border:'1px solid #eef0f6', marginBottom:4, background: row.blocking ? 'rgba(239,68,68,.03)' : '#fff' }}>
                              <span style={{ ...font, fontSize:13, color:'#1a1c5e' }}>{row.name}</span>
                              <select value={row.escopo} disabled={busy}
                                onChange={e => updateDoc(row, { escopo: e.target.value })}
                                style={{ ...inputCss, padding:'5px 8px', fontSize:12 }}>
                                <option value="pessoa">👤 Pessoa</option>
                                <option value="posto">📍 Posto</option>
                              </select>
                              <div style={{ textAlign:'center' }}>
                                <input type="checkbox" checked={!!row.blocking} disabled={busy}
                                  onChange={() => updateDoc(row, { blocking: !row.blocking })}
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
      )}

      {modal && <PostFormModal post={modal.post} categories={categories} busy={modalBusy} onSave={savePost} onClose={() => setModal(null)}/>}
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
            {[['fluxos','📂 Fluxos de Categorias'],['matriz','🧩 Matriz de Documentos'],['mobilidade','👷 Mobilidade']].map(([k, l]) => (
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
            ? <FlowsTab      key={clientId} clientId={clientId} categories={categories} setError={setError}/>
            : tab === 'matriz'
            ? <MatrixTab     key={clientId} clientId={clientId} categories={categories} setError={setError}/>
            : <MobilidadeTab key={clientId} clientId={clientId} categories={categories} setError={setError}/>
          }
        </>
      ))}
    </div>
  )
}
