import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '../../lib/supabase.js'
import { Card, Spinner, PageHeader } from '../../components/ui.jsx'

const font   = { fontFamily: 'DM Sans,sans-serif' }
const titleF = { fontFamily: 'Montserrat,sans-serif' }
const lbl = {
  display:'block', ...titleF, fontWeight:700, fontSize:10,
  color:'#9B9B9B', letterSpacing:.5, textTransform:'uppercase', marginBottom:6,
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
          style={{ width:'100%', padding:'10px 40px 10px 12px', borderRadius:10, border:'1px solid #e2e4ef', ...font, fontSize:14, color:'#1a1c5e', outline:'none', boxSizing:'border-box', background:'#fff' }}
        />
        {value
          ? <button onClick={clear} style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'#9B9B9B', fontSize:16, lineHeight:1 }}>✕</button>
          : <span style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', color:'#9B9B9B', pointerEvents:'none' }}>▾</span>
        }
      </div>
      {open && (
        <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, right:0, background:'#fff', border:'1px solid #e2e4ef', borderRadius:10, boxShadow:'0 4px 16px rgba(0,0,0,.1)', zIndex:200, maxHeight:260, overflowY:'auto' }}>
          {filtered.length === 0
            ? <div style={{ padding:'12px 14px', ...font, fontSize:13, color:'#9B9B9B' }}>Nenhum cliente encontrado</div>
            : filtered.map(c => (
              <button key={c.id} onMouseDown={() => select(c)}
                style={{ width:'100%', padding:'10px 14px', border:'none', borderBottom:'1px solid #f4f5f9', background: c.id===value ? 'rgba(46,49,146,.06)' : '#fff', cursor:'pointer', textAlign:'left', ...font, fontSize:13, color:'#1a1c5e', display:'block' }}>
                {c.nome_fantasia || c.razao_social}
                {c.nome_fantasia && c.razao_social !== c.nome_fantasia && (
                  <span style={{ display:'block', fontSize:11, color:'#9B9B9B' }}>{c.razao_social}</span>
                )}
              </button>
            ))
          }
          {!q.trim() && clients.length > 20 && (
            <div style={{ padding:'8px 14px', ...font, fontSize:11, color:'#9B9B9B', borderTop:'1px solid #f0f0f5', textAlign:'center' }}>
              {clients.length - 20} clientes adicionais — refine a busca para filtrar
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Modal simples de criação/renomeação de fluxo
function FlowFormModal({ flow, onSave, onClose, busy }) {
  const [name, setName] = useState(flow?.name || '')
  const [description, setDescription] = useState(flow?.description || '')

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(15,17,60,.45)', zIndex:500, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background:'#fff', borderRadius:16, padding:'24px 28px', width:'100%', maxWidth:440, boxShadow:'0 20px 60px rgba(0,0,0,.25)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
          <h3 style={{ ...titleF, fontWeight:800, fontSize:16, color:'#1a1c5e', margin:0 }}>
            {flow ? 'Editar Fluxo' : 'Novo Fluxo de Homologação'}
          </h3>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#9B9B9B', fontSize:18, lineHeight:1 }}>✕</button>
        </div>
        <span style={lbl}>Nome do fluxo *</span>
        <input value={name} onChange={e => setName(e.target.value)} autoFocus
          placeholder='Ex.: "Fluxo Serviços", "Fluxo Materiais"...'
          style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:'1px solid #e2e4ef', ...font, fontSize:14, color:'#1a1c5e', outline:'none', boxSizing:'border-box', marginBottom:14 }} />
        <span style={lbl}>Descrição</span>
        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
          placeholder="Opcional — quando este fluxo se aplica"
          style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:'1px solid #e2e4ef', ...font, fontSize:13, color:'#1a1c5e', outline:'none', boxSizing:'border-box', resize:'vertical', marginBottom:20 }} />
        <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
          <button onClick={onClose} disabled={busy}
            style={{ padding:'10px 20px', borderRadius:10, border:'1px solid #e2e4ef', background:'#fff', cursor:'pointer', ...font, fontSize:13, fontWeight:600, color:'#64748b' }}>
            Cancelar
          </button>
          <button onClick={() => onSave({ name: name.trim(), description: description.trim() || null })}
            disabled={busy || !name.trim()}
            style={{ padding:'10px 20px', borderRadius:10, border:'none', background: name.trim() ? '#2E3192' : '#c7c9e2', cursor: name.trim() ? 'pointer' : 'not-allowed', ...font, fontSize:13, fontWeight:700, color:'#fff', display:'flex', alignItems:'center', gap:8 }}>
            {busy && <Spinner size={14}/>}
            {flow ? 'Salvar' : 'Criar Fluxo'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function BackofficeClientDocumentFlows() {
  const [clients,  setClients]  = useState([])
  const [catalog,  setCatalog]  = useState([])
  const [clientId, setClientId] = useState('')

  const [flows,       setFlows]       = useState([])         // client_flows do cliente
  const [flowCounts,  setFlowCounts]  = useState({})         // flow_id → nº docs
  const [flowId,      setFlowId]      = useState('')
  const [docs,        setDocs]        = useState([])         // linhas do fluxo selecionado
  const [baseLoading, setBaseLoading] = useState(true)
  const [flowsLoading, setFlowsLoading] = useState(false)
  const [docsLoading, setDocsLoading] = useState(false)
  const [saving,      setSaving]      = useState(new Set())  // catalog_ids em gravação
  const [modal,       setModal]       = useState(null)       // { flow } | { flow: null } | null
  const [modalBusy,   setModalBusy]   = useState(false)
  const [addSearch,   setAddSearch]   = useState('')
  const [error,       setError]       = useState('')

  useEffect(() => {
    Promise.all([
      supabase.from('clients').select('id, razao_social, nome_fantasia').order('razao_social'),
      supabase.from('documents_catalog').select('id, name').order('name'),
    ]).then(([c, d]) => {
      setClients(c.data || [])
      setCatalog(d.data || [])
      setBaseLoading(false)
    })
  }, [])

  async function loadFlows(cid, keepFlowId) {
    setFlowsLoading(true)
    setError('')
    const [{ data: fl, error: e1 }, { data: rows }] = await Promise.all([
      supabase.from('client_flows').select('*').eq('client_id', cid).order('created_at'),
      supabase.from('client_document_flows').select('flow_id').eq('client_id', cid),
    ])
    if (e1) setError(e1.message)
    const counts = {}
    ;(rows || []).forEach(r => { if (r.flow_id) counts[r.flow_id] = (counts[r.flow_id] || 0) + 1 })
    setFlows(fl || [])
    setFlowCounts(counts)
    setFlowsLoading(false)
    const still = (fl || []).some(f => f.id === keepFlowId)
    setFlowId(still ? keepFlowId : ((fl || [])[0]?.id || ''))
  }

  useEffect(() => {
    if (!clientId) { setFlows([]); setFlowId(''); setDocs([]); return }
    loadFlows(clientId)
  }, [clientId])

  useEffect(() => {
    if (!flowId) { setDocs([]); return }
    setDocsLoading(true)
    supabase.from('client_document_flows')
      .select('id, catalog_id, required, blocking')
      .eq('flow_id', flowId)
      .then(({ data }) => {
        setDocs(data || [])
        setDocsLoading(false)
      })
  }, [flowId])

  const catalogMap = useMemo(() => {
    const m = {}
    catalog.forEach(d => { m[d.id] = d })
    return m
  }, [catalog])

  const currentFlow = flows.find(f => f.id === flowId)
  const inFlowIds = useMemo(() => new Set(docs.map(d => d.catalog_id)), [docs])

  const sortedDocs = useMemo(() =>
    [...docs].sort((a, b) => (catalogMap[a.catalog_id]?.name || '').localeCompare(catalogMap[b.catalog_id]?.name || '')),
  [docs, catalogMap])

  const addable = useMemo(() => {
    const q = addSearch.trim().toLowerCase()
    if (!q) return []
    return catalog.filter(d => !inFlowIds.has(d.id) && d.name.toLowerCase().includes(q)).slice(0, 12)
  }, [catalog, inFlowIds, addSearch])

  // ── Ações: fluxos ──────────────────────────────────────────────────────────

  async function saveFlow(values) {
    setModalBusy(true)
    setError('')
    try {
      if (modal.flow) {
        const { error: e } = await supabase.from('client_flows')
          .update(values).eq('id', modal.flow.id)
        if (e) throw e
      } else {
        const { data, error: e } = await supabase.from('client_flows')
          .insert({ client_id: clientId, ...values }).select().single()
        if (e) throw e
        await loadFlows(clientId, data.id)
        setModal(null); setModalBusy(false)
        return
      }
      await loadFlows(clientId, flowId)
      setModal(null)
    } catch (e) {
      setError(e.code === '23505' ? 'Já existe um fluxo com esse nome para este cliente.' : e.message)
    } finally {
      setModalBusy(false)
    }
  }

  async function toggleActive(flow) {
    const { error: e } = await supabase.from('client_flows')
      .update({ active: !flow.active }).eq('id', flow.id)
    if (e) { setError(e.message); return }
    setFlows(p => p.map(f => f.id === flow.id ? { ...f, active: !f.active } : f))
  }

  async function deleteFlow(flow) {
    const n = flowCounts[flow.id] || 0
    if (!window.confirm(`Excluir o fluxo "${flow.name}"${n ? ` e seus ${n} documentos` : ''}? Esta ação não pode ser desfeita.`)) return
    const { error: e } = await supabase.from('client_flows').delete().eq('id', flow.id)
    if (e) { setError(e.message); return }
    await loadFlows(clientId, flowId === flow.id ? null : flowId)
  }

  // ── Ações: documentos do fluxo ─────────────────────────────────────────────
  // Índice único parcial (flow_id, catalog_id) → sempre insert/delete, nunca upsert

  async function addDoc(doc) {
    setSaving(p => new Set([...p, doc.id]))
    setError('')
    const { data, error: e } = await supabase.from('client_document_flows')
      .insert({ client_id: clientId, flow_id: flowId, catalog_id: doc.id, required: true, blocking: false })
      .select('id, catalog_id, required, blocking').single()
    if (e) setError(e.message)
    else {
      setDocs(p => [...p, data])
      setFlowCounts(p => ({ ...p, [flowId]: (p[flowId] || 0) + 1 }))
    }
    setSaving(p => { const n = new Set(p); n.delete(doc.id); return n })
  }

  async function removeDoc(row) {
    setSaving(p => new Set([...p, row.catalog_id]))
    const { error: e } = await supabase.from('client_document_flows').delete().eq('id', row.id)
    if (e) setError(e.message)
    else {
      setDocs(p => p.filter(d => d.id !== row.id))
      setFlowCounts(p => ({ ...p, [flowId]: Math.max(0, (p[flowId] || 1) - 1) }))
    }
    setSaving(p => { const n = new Set(p); n.delete(row.catalog_id); return n })
  }

  async function toggleField(row, field) {
    setSaving(p => new Set([...p, row.catalog_id]))
    const { error: e } = await supabase.from('client_document_flows')
      .update({ [field]: !row[field] }).eq('id', row.id)
    if (e) setError(e.message)
    else setDocs(p => p.map(d => d.id === row.id ? { ...d, [field]: !row[field] } : d))
    setSaving(p => { const n = new Set(p); n.delete(row.catalog_id); return n })
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (baseLoading) return <div style={{ display:'flex', justifyContent:'center', padding:80 }}><Spinner size={40}/></div>

  return (
    <div style={{ padding:'24px 32px', maxWidth:1080, margin:'0 auto' }}>
      <PageHeader title="Fluxos de Homologação" subtitle="Cada cliente pode ter múltiplos fluxos de documentos — ex.: um por categoria de fornecedor"/>

      <Card style={{ borderRadius:14, padding:'20px 24px', marginBottom:20 }}>
        <span style={lbl}>Cliente</span>
        <ClientSearchCombo clients={clients} value={clientId} onChange={setClientId}/>
      </Card>

      {error && (
        <div style={{ marginBottom:16, padding:'12px 16px', borderRadius:10, background:'rgba(239,68,68,.08)', border:'1px solid rgba(239,68,68,.3)', ...font, fontSize:13, color:'#b91c1c' }}>
          {error}
        </div>
      )}

      {clientId && (flowsLoading ? (
        <div style={{ display:'flex', justifyContent:'center', padding:40 }}><Spinner size={32}/></div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'320px 1fr', gap:20, alignItems:'start' }}>

          {/* Coluna esquerda: lista de fluxos */}
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
                Nenhum fluxo cadastrado.<br/>Crie o primeiro com "+ Novo".
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {flows.map(f => (
                  <div key={f.id} onClick={() => setFlowId(f.id)}
                    style={{
                      padding:'12px 14px', borderRadius:10, cursor:'pointer',
                      border: f.id === flowId ? '1.5px solid #2E3192' : '1px solid #e2e4ef',
                      background: f.id === flowId ? 'rgba(46,49,146,.05)' : '#fff',
                      opacity: f.active ? 1 : .55,
                    }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ ...font, fontSize:13, fontWeight:700, color:'#1a1c5e', flex:1 }}>{f.name}</span>
                      {!f.active && (
                        <span style={{ fontSize:9, fontWeight:700, color:'#9B9B9B', background:'#f1f2f8', padding:'2px 7px', borderRadius:20, ...titleF }}>inativo</span>
                      )}
                    </div>
                    {f.description && (
                      <div style={{ ...font, fontSize:11, color:'#9B9B9B', marginTop:3 }}>{f.description}</div>
                    )}
                    <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:8 }}>
                      <span style={{ ...font, fontSize:11, color:'#64748b', flex:1 }}>
                        📄 {flowCounts[f.id] || 0} docs
                      </span>
                      <button onClick={e => { e.stopPropagation(); setModal({ flow: f }) }} title="Renomear / editar"
                        style={{ background:'none', border:'none', cursor:'pointer', fontSize:13, padding:2 }}>✏️</button>
                      <button onClick={e => { e.stopPropagation(); toggleActive(f) }} title={f.active ? 'Desativar' : 'Ativar'}
                        style={{ background:'none', border:'none', cursor:'pointer', fontSize:13, padding:2 }}>{f.active ? '⏸' : '▶️'}</button>
                      <button onClick={e => { e.stopPropagation(); deleteFlow(f) }} title="Excluir fluxo"
                        style={{ background:'none', border:'none', cursor:'pointer', fontSize:13, padding:2 }}>🗑</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Coluna direita: documentos do fluxo selecionado */}
          <Card style={{ borderRadius:14, padding:20 }}>
            {!currentFlow ? (
              <div style={{ padding:'40px 0', textAlign:'center', ...font, fontSize:13, color:'#9B9B9B' }}>
                Selecione ou crie um fluxo à esquerda
              </div>
            ) : (
              <>
                <div style={{ marginBottom:16 }}>
                  <div style={{ ...titleF, fontWeight:800, fontSize:15, color:'#1a1c5e' }}>{currentFlow.name}</div>
                  <div style={{ ...font, fontSize:12, color:'#9B9B9B', marginTop:2 }}>
                    {docs.length} documento{docs.length === 1 ? '' : 's'} no fluxo
                    {' · '}<strong style={{ color:'#ef4444' }}>desclassificatório</strong> suspende o selo se ausente
                  </div>
                </div>

                {/* Adicionar documento */}
                <div style={{ position:'relative', marginBottom:16 }}>
                  <input
                    value={addSearch}
                    onChange={e => setAddSearch(e.target.value)}
                    placeholder="➕ Buscar documento do catálogo para adicionar..."
                    style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:'1px dashed #2E319266', ...font, fontSize:13, color:'#1a1c5e', outline:'none', boxSizing:'border-box', background:'rgba(46,49,146,.02)' }}
                  />
                  {addSearch.trim() && (
                    <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, right:0, background:'#fff', border:'1px solid #e2e4ef', borderRadius:10, boxShadow:'0 4px 16px rgba(0,0,0,.1)', zIndex:100, maxHeight:280, overflowY:'auto' }}>
                      {addable.length === 0
                        ? <div style={{ padding:'12px 14px', ...font, fontSize:13, color:'#9B9B9B' }}>Nenhum documento disponível para "{addSearch}"</div>
                        : addable.map(d => (
                          <button key={d.id} onClick={() => { addDoc(d); setAddSearch('') }} disabled={saving.has(d.id)}
                            style={{ width:'100%', padding:'10px 14px', border:'none', borderBottom:'1px solid #f4f5f9', background:'#fff', cursor:'pointer', textAlign:'left', ...font, fontSize:13, color:'#1a1c5e', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                            {d.name}
                            <span style={{ fontSize:11, color:'#22c55e', fontWeight:700 }}>+ adicionar</span>
                          </button>
                        ))
                      }
                    </div>
                  )}
                </div>

                {docsLoading ? (
                  <div style={{ display:'flex', justifyContent:'center', padding:32 }}><Spinner size={28}/></div>
                ) : sortedDocs.length === 0 ? (
                  <div style={{ padding:'28px 0', textAlign:'center', ...font, fontSize:13, color:'#9B9B9B' }}>
                    Fluxo vazio — busque documentos acima para montar a lista
                  </div>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 90px 130px 36px', gap:8, padding:'0 10px', alignItems:'center' }}>
                      <span style={{ ...lbl, marginBottom:0 }}>Documento</span>
                      <span style={{ ...lbl, marginBottom:0, textAlign:'center' }}>Obrigatório</span>
                      <span style={{ ...lbl, marginBottom:0, textAlign:'center' }}>Desclassificatório</span>
                      <span/>
                    </div>
                    {sortedDocs.map(row => {
                      const busy = saving.has(row.catalog_id)
                      return (
                        <div key={row.id} style={{
                          display:'grid', gridTemplateColumns:'1fr 90px 130px 36px', gap:8, alignItems:'center',
                          padding:'9px 10px', borderRadius:8, border:'1px solid #eef0f6',
                          background: row.blocking ? 'rgba(239,68,68,.03)' : '#fff', opacity: busy ? .6 : 1,
                        }}>
                          <span style={{ ...font, fontSize:13, color:'#1a1c5e' }}>
                            {catalogMap[row.catalog_id]?.name || `Documento #${row.catalog_id}`}
                          </span>
                          <div style={{ textAlign:'center' }}>
                            <input type="checkbox" checked={!!row.required} disabled={busy}
                              onChange={() => toggleField(row, 'required')}
                              style={{ width:15, height:15, accentColor:'#2E3192', cursor:'pointer' }}/>
                          </div>
                          <div style={{ textAlign:'center' }}>
                            <input type="checkbox" checked={!!row.blocking} disabled={busy}
                              onChange={() => toggleField(row, 'blocking')}
                              style={{ width:15, height:15, accentColor:'#ef4444', cursor:'pointer' }}/>
                          </div>
                          <button onClick={() => removeDoc(row)} disabled={busy} title="Remover do fluxo"
                            style={{ background:'none', border:'none', cursor:'pointer', fontSize:13, color:'#9B9B9B' }}>
                            {busy ? <Spinner size={13}/> : '🗑'}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )}
          </Card>
        </div>
      ))}

      {modal && (
        <FlowFormModal flow={modal.flow} busy={modalBusy}
          onSave={saveFlow} onClose={() => { setModal(null); setError('') }}/>
      )}
    </div>
  )
}
