// CategorySelector.jsx
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase.js'
import { categoriesApi } from '../services/api.js'
import { Spinner } from './ui.jsx'

const ICONS = {
  14466: '🔧', 14616: '📦',
  14889: '🚌', 14890: '🚌', 14891: '🚌', 14893: '🚛',
  31432: '💼', DEFAULT: '📋',
}

// Normaliza string para comparação sem acento e case-insensitive
const norm = s => String(s||'').toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '')

export default function CategorySelector({ selectedIds = new Set(), onChange, showDocuments = true, cnpjData = null }) {
  const [parents,      setParents]      = useState([])
  const [expanded,     setExpanded]     = useState(new Set())
  const [trees,        setTrees]        = useState({})
  const [loadingTree,  setLoadingTree]  = useState(new Set())
  const [search,       setSearch]       = useState('')
  const [aiSugs,       setAiSugs]       = useState([])
  const [aiLoading,    setAiLoading]    = useState(false)
  const [showCustom,   setShowCustom]   = useState(false)
  const [customName,   setCustomName]   = useState('')
  const [customParent, setCustomParent] = useState(null)
  const [savingCustom, setSavingCustom] = useState(false)
  const [requiredDocs, setRequiredDocs] = useState([])
  const [loadingDocs,  setLoadingDocs]  = useState(false)
  const [loading,      setLoading]      = useState(true)
  const [loadError,    setLoadError]    = useState('')
  const treesRef = useRef({})   // ref para acesso síncrono nas funções

  // Carrega categorias pai
  useEffect(() => {
    categoriesApi.getParents()
      .then(data => {
        setParents(data)
        if (!data.length) setLoadError('Nenhuma categoria encontrada.')
      })
      .catch(err => setLoadError('Erro ao carregar categorias: ' + err.message))
      .finally(() => setLoading(false))
  }, [])

  // Sincroniza ref com state
  useEffect(() => { treesRef.current = trees }, [trees])

  // Pré-carrega árvores de todos os pais ao pesquisar
  useEffect(() => {
    if (!search || !parents.length) return
    const unloaded = parents.filter(p => !treesRef.current[p.id])
    if (!unloaded.length) {
      // Árvores já carregadas — auto-expande pais com match nos filhos
      autoExpandMatching()
      return
    }
    Promise.allSettled(unloaded.map(p => categoriesApi.getTree(p.id))).then(results => {
      const patch = {}
      results.forEach((r, i) => { if (r.status === 'fulfilled' && r.value) patch[unloaded[i].id] = r.value })
      if (Object.keys(patch).length) {
        setTrees(prev => {
          const updated = { ...prev, ...patch }
          treesRef.current = updated
          return updated
        })
      }
      autoExpandMatching()
    })
  }, [search, parents])

  // Expande automaticamente pais cujos filhos/netos fazem match com a busca
  const autoExpandMatching = () => {
    if (!search) return
    const q = norm(search)
    const toExpand = parents
      .filter(p => {
        const tree = treesRef.current[p.id]
        if (!tree) return false
        return (tree.children||[]).some(c => norm(c.name).includes(q)) ||
               (tree.grandchildren||[]).some(g => norm(g.name).includes(q))
      })
      .map(p => p.id)
    if (toExpand.length > 0) setExpanded(prev => new Set([...prev, ...toExpand]))
  }

  // Documentos exigidos
  useEffect(() => {
    if (!showDocuments || selectedIds.size === 0) { setRequiredDocs([]); return }
    setLoadingDocs(true)
    categoriesApi.getRequiredDocuments([...selectedIds])
      .then(setRequiredDocs).finally(() => setLoadingDocs(false))
  }, [selectedIds.size, showDocuments])

  const loadTree = async (parentId) => {
    if (treesRef.current[parentId]) return
    setLoadingTree(prev => new Set([...prev, parentId]))
    try {
      const tree = await categoriesApi.getTree(parentId)
      setTrees(prev => ({ ...prev, [parentId]: tree }))
    } finally {
      setLoadingTree(prev => { const n = new Set(prev); n.delete(parentId); return n })
    }
  }

  const toggleParent = async (parentId) => {
    const isOpen = expanded.has(parentId)
    if (isOpen) { setExpanded(prev => { const n = new Set(prev); n.delete(parentId); return n }); return }
    setExpanded(prev => new Set([...prev, parentId]))
    await loadTree(parentId)
  }

  const toggleLeaf = (leafId) => {
    const next = new Set(selectedIds)
    if (next.has(leafId)) next.delete(leafId); else next.add(leafId)
    onChange(next)
  }

  const getLeafIds = (parentId) => {
    const tree = trees[parentId]
    if (!tree) return []
    const leaves = []
    for (const child of tree.children) {
      const gc = tree.grandchildren?.filter(g => g.parent_id === child.id) || []
      if (gc.length > 0) gc.forEach(g => leaves.push(g.id))
      else leaves.push(child.id)
    }
    return leaves
  }

  const toggleAllInParent = (parentId, checked) => {
    const leafIds = getLeafIds(parentId)
    if (!leafIds.length) return
    const next = new Set(selectedIds)
    leafIds.forEach(id => checked ? next.add(id) : next.delete(id))
    onChange(next)
  }

  const countSelectedInParent = (parentId) => getLeafIds(parentId).filter(id => selectedIds.has(id)).length

  // Filtra pais por busca — inclui pais cujos filhos/netos fazem match
  const filterCats = (list) => {
    if (!search) return list
    const q = norm(search)
    return list.filter(p => {
      if (norm(p.name).includes(q)) return true
      const tree = trees[p.id]
      if (!tree) return true  // árvore ainda carregando — mantém o pai visível
      return (tree.children||[]).some(c => norm(c.name).includes(q)) ||
             (tree.grandchildren||[]).some(g => norm(g.name).includes(q))
    })
  }

  // Sugestão por CNAE via Netlify Function (proxy Anthropic)
  const suggestByAI = async () => {
    if (!cnpjData?.cnae_fiscal_descricao && !cnpjData?.cnae_fiscal) return
    setAiLoading(true)
    try {
      // Garante que todas as árvores estão carregadas
      const unloaded = parents.filter(p => !treesRef.current[p.id])
      if (unloaded.length) {
        const results = await Promise.allSettled(unloaded.map(p => categoriesApi.getTree(p.id)))
        const patch = {}
        results.forEach((r, i) => { if (r.status === 'fulfilled' && r.value) patch[unloaded[i].id] = r.value })
        if (Object.keys(patch).length) {
          const updated = { ...treesRef.current, ...patch }
          treesRef.current = updated
          setTrees(updated)
        }
      }

      // Monta lista numerada de TODOS os nós
      const allNames = [
        ...parents.map(p => p.name),
        ...Object.values(treesRef.current).flatMap(t => [
          ...(t.children||[]).map(c => c.name),
          ...(t.grandchildren||[]).map(g => g.name),
        ])
      ]
      const unique = [...new Set(allNames)]

      const res = await fetch('/.netlify/functions/ai-suggest-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cnae:          cnpjData.cnae_fiscal,
          cnaeDescricao: cnpjData.cnae_fiscal_descricao,
          categoryNames: unique.slice(0, 150),
        })
      })
      const data = await res.json()
      if (data.error) console.warn('[AI suggest]', data.error)
      setAiSugs(data.sugestoes || [])
    } catch (e) { console.warn('AI suggest:', e.message) }
    setAiLoading(false)
  }

  // Adiciona categoria customizada
  const handleAddCustom = async () => {
    if (!customName.trim() || !customParent) return
    setSavingCustom(true)
    try {
      const { data: newCat, error } = await supabase
        .from('categories')
        .insert({ name: customName.trim(), parent_id: customParent, is_custom: true, approved: false, is_active: true })
        .select().single()
      if (error) throw new Error(error.message)
      setTrees(prev => {
        const t = prev[customParent] || { children: [], grandchildren: [] }
        return { ...prev, [customParent]: { ...t, children: [...(t.children||[]), { id: newCat.id, name: newCat.name, parent_id: customParent }] } }
      })
      const next = new Set(selectedIds); next.add(newCat.id); onChange(next)
      setExpanded(prev => { const n = new Set(prev); n.add(customParent); return n })
      setCustomName(''); setCustomParent(null); setShowCustom(false)
    } catch (e) { alert('Erro ao salvar: ' + e.message) }
    setSavingCustom(false)
  }

  if (loading) return <div style={{ display:'flex', justifyContent:'center', padding:20 }}><Spinner size={32}/></div>
  if (loadError) return <div style={{ padding:16, background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:12, fontSize:13, color:'#92400e' }}>⚠️ {loadError}</div>

  return (
    <div>
      {/* Search + AI */}
      <div style={{ display:'flex', gap:8, marginBottom:12 }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍  Pesquisar categoria..."
          style={{ flex:1, padding:'9px 14px', borderRadius:10, border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:13, outline:'none' }}/>
        {cnpjData?.cnae_fiscal && (
          <button onClick={suggestByAI} disabled={aiLoading}
            style={{ padding:'9px 14px', borderRadius:10, border:'1px solid #2E3192', background:'rgba(46,49,146,.06)', color:'#2E3192', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:12, cursor:'pointer', whiteSpace:'nowrap' }}>
            {aiLoading ? '⏳...' : '🤖 Sugerir por CNAE'}
          </button>
        )}
      </div>

      {/* AI chips */}
      {aiSugs.length > 0 && (
        <div style={{ background:'rgba(46,49,146,.04)', border:'1px solid rgba(46,49,146,.15)', borderRadius:10, padding:'10px 14px', marginBottom:12 }}>
          <div style={{ fontSize:12, fontWeight:700, color:'#2E3192', fontFamily:'Montserrat,sans-serif', marginBottom:8 }}>
            🤖 Sugestões baseadas no CNAE da sua empresa:
          </div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
            {aiSugs.map((sug, i) => {
              const sugN = norm(sug)
              const allNodes = [
                ...parents,
                ...Object.values(trees).flatMap(t => [...(t.children||[]), ...(t.grandchildren||[])])
              ]
              // Match: exato → começa com → contém
              const match = allNodes.find(c => norm(c.name) === sugN)
                         || allNodes.find(c => norm(c.name).includes(sugN))
                         || allNodes.find(c => sugN.includes(norm(c.name)))
              if (!match) return null
              const isSel = selectedIds.has(match.id)
              return (
                <button key={i} onClick={() => toggleLeaf(match.id)}
                  style={{ padding:'4px 12px', borderRadius:20, fontFamily:'DM Sans,sans-serif', fontSize:12, cursor:'pointer',
                    border:`1px solid ${isSel?'#2E3192':'#c7d2fe'}`,
                    background: isSel ? '#2E3192' : 'rgba(46,49,146,.06)',
                    color: isSel ? '#fff' : '#2E3192' }}>
                  {isSel ? '✓ ' : '+ '}{sug}
                </button>
              )
            }).filter(Boolean)}
          </div>
        </div>
      )}

      {/* Lista de pais */}
      <div style={{ display:'grid', gap:8 }}>
        {filterCats(parents).map(parent => {
          const isOpen    = expanded.has(parent.id)
          const tree      = trees[parent.id]
          const isLoading = loadingTree.has(parent.id)
          const selCount  = countSelectedInParent(parent.id)
          const totalLeafs= getLeafIds(parent.id).length
          const allSel    = totalLeafs > 0 && selCount === totalLeafs
          return (
            <div key={parent.id} style={{ border:`2px solid ${isOpen?'#2E3192':'#e2e4ef'}`, borderRadius:14, overflow:'hidden', transition:'border .15s' }}>
              <div onClick={() => toggleParent(parent.id)}
                style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', background:isOpen?'rgba(46,49,146,.05)':'#fff', cursor:'pointer', userSelect:'none' }}>
                <span style={{ fontSize:22 }}>{ICONS[parent.id] || ICONS.DEFAULT}</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, color:'#1a1c5e' }}>{parent.name}</div>
                  {selCount > 0 && <div style={{ fontSize:11, color:'#F47E2F', fontWeight:700, marginTop:1 }}>{selCount} subcategoria{selCount>1?'s':''} selecionada{selCount>1?'s':''}</div>}
                </div>
                {isLoading ? <Spinner size={16}/> : <span style={{ fontSize:16, color:'#9B9B9B', transition:'transform .2s', transform:isOpen?'rotate(180deg)':'none' }}>▾</span>}
              </div>
              {isOpen && tree && (
                <div style={{ padding:'8px 16px 12px', background:'rgba(46,49,146,.02)', borderTop:'1px solid #e2e4ef' }}>
                  {totalLeafs > 0 && (
                    <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:8 }}>
                      <button onClick={() => toggleAllInParent(parent.id, !allSel)}
                        style={{ fontSize:11, color:allSel?'#ef4444':'#2E3192', background:'none', border:`1px solid ${allSel?'#ef4444':'#2E3192'}`, borderRadius:20, padding:'3px 12px', cursor:'pointer', fontFamily:'Montserrat,sans-serif', fontWeight:700 }}>
                        {allSel ? '✕ Desmarcar todos' : '✓ Selecionar todos'}
                      </button>
                    </div>
                  )}
                  {tree.children
                    .filter(child => {
                      if (!search) return true
                      const q = norm(search)
                      if (norm(child.name).includes(q)) return true
                      const gcs = tree.grandchildren?.filter(g => g.parent_id === child.id) || []
                      return gcs.some(g => norm(g.name).includes(q))
                    })
                    .map(child => {
                      const gcs = tree.grandchildren?.filter(g => g.parent_id === child.id) || []
                      // Quando busca ativa, filtra também os netos
                      const visibleGcs = search
                        ? gcs.filter(g => norm(g.name).includes(norm(search)))
                        : gcs
                      return visibleGcs.length === 0 && gcs.length > 0
                        ? null  // todos os netos filtrados — não mostra o grupo
                        : gcs.length === 0
                          ? <CheckItem key={child.id} id={child.id} name={child.name} checked={selectedIds.has(child.id)} onChange={() => toggleLeaf(child.id)} />
                          : <ChildGroup key={child.id} child={child} grandchildren={visibleGcs.length ? visibleGcs : gcs} selectedIds={selectedIds} onToggle={toggleLeaf} />
                    }).filter(Boolean)}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Documentos exigidos */}
      {showDocuments && selectedIds.size > 0 && (
        <div style={{ marginTop:16, padding:16, background:'rgba(46,49,146,.04)', border:'1px solid rgba(46,49,146,.1)', borderRadius:12 }}>
          <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, color:'#1a1c5e', marginBottom:10 }}>
            📋 Documentos exigidos ({loadingDocs ? '...' : requiredDocs.length})
          </div>
          {loadingDocs ? <Spinner size={20}/> : (
            <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
              {requiredDocs.map(doc => (
                <span key={doc.id} style={{ fontSize:11, background:'#fff', border:'1px solid #e2e4ef', padding:'4px 10px', borderRadius:20, color:'#1a1c5e', fontFamily:'DM Sans,sans-serif' }}>
                  {doc.auto_collect && <span style={{ color:'#22c55e', marginRight:4 }}>⚡</span>}
                  {doc.name}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Categoria customizada */}
      <div style={{ marginTop:12 }}>
        {showCustom ? (
          <div style={{ background:'rgba(46,49,146,.04)', border:'1px solid rgba(46,49,146,.15)', borderRadius:10, padding:14 }}>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:12, color:'#2E3192', marginBottom:10 }}>Nova categoria — em qual grupo ela se encaixa?</div>
            <div style={{ display:'flex', gap:8, marginBottom:10 }}>
              {parents.map(p => (
                <button key={p.id} type="button" onClick={() => setCustomParent(p.id)}
                  style={{ flex:1, padding:8, borderRadius:8, cursor:'pointer',
                    border:`2px solid ${customParent===p.id?'#2E3192':'#e2e4ef'}`,
                    background: customParent===p.id ? '#2E3192' : '#fff',
                    color: customParent===p.id ? '#fff' : '#1a1c5e',
                    fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:12 }}>
                  {p.name}
                </button>
              ))}
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <input value={customName} onChange={e => setCustomName(e.target.value)}
                placeholder="Nome da nova categoria..."
                style={{ flex:1, padding:'8px 12px', borderRadius:8, border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:13, outline:'none' }}
                onKeyDown={e => { if (e.key==='Enter' && customParent) handleAddCustom() }}/>
              <button onClick={handleAddCustom} disabled={!customName.trim()||!customParent||savingCustom}
                style={{ padding:'8px 16px', borderRadius:8, border:'none', cursor:'pointer', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:12, color:'#fff',
                  background: (!customName.trim()||!customParent||savingCustom) ? '#9B9B9B' : '#2E3192' }}>
                {savingCustom ? '⏳' : 'Adicionar'}
              </button>
              <button onClick={() => { setShowCustom(false); setCustomParent(null); setCustomName('') }}
                style={{ padding:'8px 12px', borderRadius:8, background:'transparent', border:'1px solid #e2e4ef', cursor:'pointer', color:'#9B9B9B', fontSize:12 }}>
                Cancelar
              </button>
            </div>
            {!customParent && customName && <div style={{ fontSize:11, color:'#f59e0b', marginTop:6 }}>⚠️ Selecione o grupo antes de adicionar</div>}
          </div>
        ) : (
          <button onClick={() => setShowCustom(true)}
            style={{ fontSize:12, color:'#9B9B9B', background:'transparent', border:'1px dashed #d1d5db', borderRadius:8, padding:'8px 16px', cursor:'pointer', fontFamily:'DM Sans,sans-serif', width:'100%' }}>
            + Não encontrou sua categoria? Clique para sugerir
          </button>
        )}
      </div>
    </div>
  )
}

function CheckItem({ id, name, checked, onChange }) {
  return (
    <label style={{ display:'flex', alignItems:'center', gap:10, padding:'7px 8px', borderRadius:8, cursor:'pointer', background:checked?'rgba(46,49,146,.06)':'transparent', marginBottom:2 }}>
      <div style={{ width:18, height:18, borderRadius:5, border:`2px solid ${checked?'#2E3192':'#d1d5db'}`, background:checked?'#2E3192':'#fff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }} onClick={onChange}>
        {checked && <span style={{ color:'#fff', fontSize:11, fontWeight:900 }}>✓</span>}
      </div>
      <span style={{ fontSize:12, color:'#1a1c5e', fontFamily:'DM Sans,sans-serif', lineHeight:1.3 }}>{name}</span>
    </label>
  )
}

function ChildGroup({ child, grandchildren, selectedIds, onToggle }) {
  const [open, setOpen] = useState(false)
  const selCount = grandchildren.filter(g => selectedIds.has(g.id)).length
  return (
    <div style={{ marginBottom:4 }}>
      <div onClick={() => setOpen(o => !o)}
        style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 8px', borderRadius:8, cursor:'pointer', background:'rgba(46,49,146,.03)', border:'1px solid rgba(46,49,146,.08)' }}>
        <span style={{ fontSize:11, color:'#2E3192', transform:open?'rotate(90deg)':'none', transition:'transform .15s' }}>▶</span>
        <span style={{ flex:1, fontSize:12, fontWeight:600, color:'#1a1c5e', fontFamily:'Montserrat,sans-serif' }}>{child.name}</span>
        {selCount > 0 && <span style={{ fontSize:10, color:'#F47E2F', fontWeight:700 }}>{selCount} sel.</span>}
      </div>
      {open && (
        <div style={{ paddingLeft:20, marginTop:2 }}>
          {grandchildren.map(g => (
            <CheckItem key={g.id} id={g.id} name={g.name} checked={selectedIds.has(g.id)} onChange={() => onToggle(g.id)} />
          ))}
        </div>
      )}
    </div>
  )
}
