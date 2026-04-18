// CategorySelector.jsx
// Seleção hierárquica de categorias: pai → filha → neta
// Props:
//   selectedIds: Set<number>     — IDs das categorias folha selecionadas
//   onChange: (Set<number>) => void
//   showDocuments: boolean        — mostra preview dos docs exigidos
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'
import { categoriesApi } from '../services/api.js'
import { Spinner } from './ui.jsx'

const ICONS = {
  14466: '🔧', 14616: '📦',
  14889: '🚌', 14890: '🚌', 14891: '🚌', 14893: '🚛',
  31432: '💼', DEFAULT: '📋',
}

export default function CategorySelector({ selectedIds = new Set(), onChange, showDocuments = true, cnpjData = null }) {
  const [parents, setParents]   = useState([])
  const [expanded, setExpanded] = useState(new Set()) // parent IDs expandidos
  const [trees, setTrees]       = useState({})        // parentId → { children, grandchildren }
  const [loadingTree, setLoadingTree] = useState(new Set())
  const [search,    setSearch]    = useState('')
  const [aiSugs,    setAiSugs]    = useState([])
  const [aiLoading, setAiLoading] = useState(false)
  const [showCustom, setShowCustom]       = useState(false)
  const [customName, setCustomName]       = useState('')
  const [customParent, setCustomParent]   = useState(null)  // id do parent: Serviços ou Materiais
  const [savingCustom, setSavingCustom]   = useState(false)
  const [requiredDocs, setRequiredDocs] = useState([])
  const [loadingDocs, setLoadingDocs]   = useState(false)
  const [loading, setLoading] = useState(true)

  const [loadError, setLoadError] = useState('')

  // Carrega categorias pai
  useEffect(() => {
    categoriesApi.getParents()
      .then(data => {
        setParents(data)
        if (!data.length) setLoadError('Nenhuma categoria encontrada. Verifique se o patch_002_categorias.sql foi executado no Supabase.')
      })
      .catch(err => setLoadError('Erro ao carregar categorias: ' + err.message))
      .finally(() => setLoading(false))
  }, [])

  // Recalcula documentos quando seleção muda
  useEffect(() => {
    if (!showDocuments || selectedIds.size === 0) { setRequiredDocs([]); return }
    setLoadingDocs(true)
    categoriesApi.getRequiredDocuments([...selectedIds])
      .then(setRequiredDocs)
      .finally(() => setLoadingDocs(false))
  }, [selectedIds.size, showDocuments])

  const toggleParent = async (parentId) => {
    const isOpen = expanded.has(parentId)
    if (isOpen) {
      setExpanded(prev => { const n = new Set(prev); n.delete(parentId); return n })
      return
    }
    setExpanded(prev => new Set([...prev, parentId]))
    if (!trees[parentId]) {
      setLoadingTree(prev => new Set([...prev, parentId]))
      try {
        const tree = await categoriesApi.getTree(parentId)
        setTrees(prev => ({ ...prev, [parentId]: tree }))
      } finally {
        setLoadingTree(prev => { const n = new Set(prev); n.delete(parentId); return n })
      }
    }
  }

  const toggleLeaf = (leafId) => {
    const next = new Set(selectedIds)
    if (next.has(leafId)) next.delete(leafId)
    else next.add(leafId)
    onChange(next)
  }

  const isLeaf = (catId, parentId) => {
    const tree = trees[parentId]
    if (!tree) return true
    // É folha se não tem filhos na árvore
    const hasGrandchildren = tree.grandchildren?.some(g => g.parent_id === catId)
    return !hasGrandchildren
  }

  const getLeafIds = (parentId) => {
    const tree = trees[parentId]
    if (!tree) return []
    const leaves = []
    for (const child of tree.children) {
      const childGrandchildren = tree.grandchildren?.filter(g => g.parent_id === child.id) || []
      if (childGrandchildren.length > 0) {
        childGrandchildren.forEach(g => leaves.push(g.id))
      } else {
        leaves.push(child.id)
      }
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

  const countSelectedInParent = (parentId) => {
    const leafIds = getLeafIds(parentId)
    return leafIds.filter(id => selectedIds.has(id)).length
  }

  if (loading) return <div style={{ display:'flex', justifyContent:'center', padding:20 }}><Spinner size={32}/></div>

  if (loadError) return (
    <div style={{ padding:'16px', background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:12, fontSize:13, color:'#92400e', fontFamily:'DM Sans,sans-serif' }}>
      ⚠️ {loadError}
    </div>
  )

  // Filter categories by search term
  const filterCats = (list) => {
    if (!search) return list
    const q = search.toLowerCase()
    return list.filter(p => {
      const pMatch = p.name.toLowerCase().includes(q)
      const cMatch = (p.children||[]).some(c =>
        c.name.toLowerCase().includes(q) ||
        (c.children||[]).some(g => g.name.toLowerCase().includes(q))
      )
      return pMatch || cMatch
    })
  }

  // ── Sugestão de categorias por CNAE via IA ──────────────────────────────────
  // Chama Netlify Function (proxy) para evitar CORS — API key fica segura no servidor
  const suggestByAI = async () => {
    if (!cnpjData?.cnae_fiscal_descricao && !cnpjData?.cnae_fiscal) return
    setAiLoading(true)
    try {
      // Monta lista plana de todas as categorias visíveis no seletor
      const allNames = parents.flatMap(p => {
        const rows = [p.name]
        const t = trees[p.id]
        if (t) {
          ;(t.children||[]).forEach(c => {
            rows.push(c.name)
            ;(t.grandchildren||[]).filter(g=>g.parent_id===c.id).forEach(g=>rows.push(g.name))
          })
        }
        return rows
      })

      // Pré-carrega as árvores de todos os parents que ainda não foram carregadas
      // para que o match possa encontrar filhos e netos
      const unloadedParents = parents.filter(p => !trees[p.id])
      if (unloadedParents.length > 0) {
        const treeResults = await Promise.allSettled(
          unloadedParents.map(p => categoriesApi.getTree(p.id))
        )
        treeResults.forEach((r, i) => {
          if (r.status === 'fulfilled') {
            const parentId = unloadedParents[i].id
            setTrees(prev => ({ ...prev, [parentId]: r.value }))
          }
        })
        // Pequena espera para o estado atualizar antes de buscar sugestões
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      const res = await fetch('/.netlify/functions/ai-suggest-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cnae:          cnpjData.cnae_fiscal,
          cnaeDescricao: cnpjData.cnae_fiscal_descricao,
          categoryNames: allNames.slice(0, 120),
        })
      })
      const data = await res.json()
      setAiSugs(data.sugestoes || [])
    } catch (e) { console.warn('AI suggest:', e.message) }
    setAiLoading(false)
  }

  // ── Adicionar categoria customizada ──────────────────────────────────────
  const handleAddCustom = async () => {
    if (!customName.trim() || !customParent) return
    setSavingCustom(true)
    try {
      // Insere no banco como categoria pendente de aprovação pelo backoffice
      const { data: newCat, error } = await supabase
        .from('categories')
        .insert({
          name:        customName.trim(),
          parent_id:   customParent,
          is_custom:   true,
          approved:    false,           // backoffice precisa aprovar
          is_active:   true,
        })
        .select()
        .single()

      if (error) throw new Error(error.message)

      // Adiciona localmente ao tree do parent escolhido para aparecer imediatamente
      setTrees(prev => {
        const parentTree = prev[customParent] || { children: [], grandchildren: [] }
        return {
          ...prev,
          [customParent]: {
            ...parentTree,
            children: [...(parentTree.children||[]), { id: newCat.id, name: newCat.name, parent_id: customParent }]
          }
        }
      })

      // Seleciona automaticamente a nova categoria
      const next = new Set(selectedIds)
      next.add(newCat.id)
      onChange(next)

      // Garante que o parent está expandido para o usuário ver
      setExpanded(prev => { const n = new Set(prev); n.add(customParent); return n })

      setCustomName('')
      setCustomParent(null)
      setShowCustom(false)
    } catch (e) {
      console.error('Erro ao salvar categoria:', e.message)
      alert('Erro ao salvar: ' + e.message)
    }
    setSavingCustom(false)
  }

  return (
    <div>
      {/* Search + AI */}
      <div style={{ display:'flex', gap:8, marginBottom:12 }}>
        <input value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="🔍  Pesquisar categoria..."
          style={{ flex:1, padding:'9px 14px', borderRadius:10, border:'1px solid #e2e4ef',
            fontFamily:'DM Sans,sans-serif', fontSize:13, outline:'none' }}/>
        {cnpjData?.cnae_fiscal && (
          <button onClick={suggestByAI} disabled={aiLoading}
            style={{ padding:'9px 14px', borderRadius:10, border:'1px solid #2E3192',
              background:'rgba(46,49,146,.06)', color:'#2E3192', fontFamily:'Montserrat,sans-serif',
              fontWeight:700, fontSize:12, cursor:'pointer', whiteSpace:'nowrap' }}>
            {aiLoading ? '⏳...' : '🤖 Sugerir por CNAE'}
          </button>
        )}
      </div>

      {/* AI suggestions chips */}
      {aiSugs.length > 0 && (
        <div style={{ background:'rgba(46,49,146,.04)', border:'1px solid rgba(46,49,146,.15)', borderRadius:10, padding:'10px 14px', marginBottom:12 }}>
          <div style={{ fontSize:12, fontWeight:700, color:'#2E3192', fontFamily:'Montserrat,sans-serif', marginBottom:8 }}>
            🤖 Sugestões baseadas no CNAE da sua empresa:
          </div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
            {aiSugs.map((sug, i) => {
              // Busca match em todos os nós carregados: parents + trees (lazy)
              const allNodes = [
                ...parents,
                ...Object.values(trees).flatMap(t => [
                  ...(t.children||[]),
                  ...(t.grandchildren||[])
                ])
              ]
              // Similaridade: exact → starts-with → contains
              const sugLow = sug.toLowerCase()
              const match = allNodes.find(c => c.name.toLowerCase() === sugLow)
                         || allNodes.find(c => c.name.toLowerCase().startsWith(sugLow))
                         || allNodes.find(c => sugLow.startsWith(c.name.toLowerCase()))
                         || allNodes.find(c => c.name.toLowerCase().includes(sugLow) || sugLow.includes(c.name.toLowerCase().split(' ')[0]))
              if (!match) return null
              const isSelected = selectedIds.has(match.id)
              return (
                <button key={i} onClick={() => toggleLeaf(match.id)}
                  style={{ padding:'4px 12px', borderRadius:20, fontFamily:'DM Sans,sans-serif', fontSize:12, cursor:'pointer',
                    border:`1px solid ${isSelected?'#2E3192':'#c7d2fe'}`,
                    background: isSelected ? '#2E3192' : 'rgba(46,49,146,.06)',
                    color: isSelected ? '#fff' : '#2E3192' }}>
                  {isSelected ? '✓ ' : '+ '}{sug}
                </button>
              )
            }).filter(Boolean)}
          </div>
        </div>
      )}

      {/* Categorias pai */}
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
              {/* Header do pai */}
              <div onClick={() => toggleParent(parent.id)}
                style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', background:isOpen?'rgba(46,49,146,.05)':'#fff', cursor:'pointer', userSelect:'none' }}>
                <span style={{ fontSize:22 }}>{ICONS[parent.id] || ICONS.DEFAULT}</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, color:'#1a1c5e' }}>
                    {parent.name}
                  </div>
                  {selCount > 0 && (
                    <div style={{ fontSize:11, color:'#F47E2F', fontWeight:700, marginTop:1 }}>
                      {selCount} subcategoria{selCount>1?'s':''} selecionada{selCount>1?'s':''}
                    </div>
                  )}
                </div>
                {isLoading ? <Spinner size={16}/> : <span style={{ fontSize:16, color:'#9B9B9B', transition:'transform .2s', transform:isOpen?'rotate(180deg)':'none' }}>▾</span>}
              </div>

              {/* Subárvore */}
              {isOpen && tree && (
                <div style={{ padding:'8px 16px 12px', background:'rgba(46,49,146,.02)', borderTop:'1px solid #e2e4ef' }}>
                  {/* Selecionar todos */}
                  {totalLeafs > 0 && (
                    <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:8 }}>
                      <button onClick={()=>toggleAllInParent(parent.id, !allSel)}
                        style={{ fontSize:11, color:allSel?'#ef4444':'#2E3192', background:'none', border:`1px solid ${allSel?'#ef4444':'#2E3192'}`, borderRadius:20, padding:'3px 12px', cursor:'pointer', fontFamily:'Montserrat,sans-serif', fontWeight:700 }}>
                        {allSel ? '✕ Desmarcar todos' : '✓ Selecionar todos'}
                      </button>
                    </div>
                  )}

                  {tree.children.map(child => {
                    const grandchildren = tree.grandchildren?.filter(g => g.parent_id === child.id) || []
                    const childIsLeaf   = grandchildren.length === 0

                    if (childIsLeaf) {
                      return (
                        <CheckItem key={child.id} id={child.id} name={child.name}
                          checked={selectedIds.has(child.id)} onChange={() => toggleLeaf(child.id)} />
                      )
                    }

                    // Child tem netos → mostra grupo colapsável
                    return (
                      <ChildGroup key={child.id} child={child} grandchildren={grandchildren}
                        selectedIds={selectedIds} onToggle={toggleLeaf} />
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Preview documentos exigidos */}
      {showDocuments && selectedIds.size > 0 && (
        <div style={{ marginTop:16, padding:'16px', background:'rgba(46,49,146,.04)', border:'1px solid rgba(46,49,146,.1)', borderRadius:12 }}>
          <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, color:'#1a1c5e', marginBottom:10 }}>
            📋 Documentos exigidos pela seleção ({loadingDocs ? '...' : requiredDocs.length})
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
          <div style={{ fontSize:10, color:'#9B9B9B', marginTop:8, fontFamily:'DM Sans,sans-serif' }}>
            ⚡ = coletado automaticamente pelo sistema · Os demais precisam de upload manual
          </div>
        </div>
      )}

      {/* Adicionar categoria customizada */}
      <div style={{ marginTop:12 }}>
        {showCustom ? (
          <div style={{ background:'rgba(46,49,146,.04)', border:'1px solid rgba(46,49,146,.15)', borderRadius:10, padding:'14px' }}>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:12, color:'#2E3192', marginBottom:10 }}>
              Nova categoria — em qual grupo ela se encaixa?
            </div>
            {/* Seleção do grupo pai: Serviços ou Materiais */}
            <div style={{ display:'flex', gap:8, marginBottom:10 }}>
              {parents.map(p => (
                <button key={p.id} type="button" onClick={() => setCustomParent(p.id)}
                  style={{ flex:1, padding:'8px', borderRadius:8, cursor:'pointer',
                    border:`2px solid ${customParent===p.id?'#2E3192':'#e2e4ef'}`,
                    background: customParent===p.id ? '#2E3192' : '#fff',
                    color: customParent===p.id ? '#fff' : '#1a1c5e',
                    fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:12 }}>
                  {p.name}
                </button>
              ))}
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <input value={customName} onChange={e=>setCustomName(e.target.value)}
                placeholder="Nome da nova categoria..."
                style={{ flex:1, padding:'8px 12px', borderRadius:8, border:'1px solid #e2e4ef',
                  fontFamily:'DM Sans,sans-serif', fontSize:13, outline:'none' }}
                onKeyDown={e=>{ if(e.key==='Enter'&&customParent) handleAddCustom() }}/>
              <button onClick={handleAddCustom}
                disabled={!customName.trim() || !customParent || savingCustom}
                style={{ padding:'8px 16px', borderRadius:8,
                  background: (!customName.trim()||!customParent||savingCustom) ? '#9B9B9B' : '#2E3192',
                  color:'#fff', border:'none', cursor:'pointer',
                  fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:12 }}>
                {savingCustom ? '⏳' : 'Adicionar'}
              </button>
              <button onClick={() => { setShowCustom(false); setCustomParent(null); setCustomName('') }}
                style={{ padding:'8px 12px', borderRadius:8, background:'transparent',
                  border:'1px solid #e2e4ef', cursor:'pointer', color:'#9B9B9B', fontSize:12 }}>
                Cancelar
              </button>
            </div>
            {!customParent && customName && (
              <div style={{ fontSize:11, color:'#f59e0b', marginTop:6 }}>
                ⚠️ Selecione o grupo (Serviços ou Materiais) antes de adicionar
              </div>
            )}
          </div>
        ) : (
          <button onClick={() => setShowCustom(true)}
            style={{ fontSize:12, color:'#9B9B9B', background:'transparent', border:'1px dashed #d1d5db',
              borderRadius:8, padding:'8px 16px', cursor:'pointer', fontFamily:'DM Sans,sans-serif', width:'100%' }}>
            + Não encontrou sua categoria? Clique para sugerir
          </button>
        )}
      </div>
    </div>
  )
}

function CheckItem({ id, name, checked, onChange }) {
  return (
    <label style={{ display:'flex', alignItems:'center', gap:10, padding:'7px 8px', borderRadius:8, cursor:'pointer', background:checked?'rgba(46,49,146,.06)':'transparent', transition:'background .1s', marginBottom:2 }}>
      <div style={{ width:18, height:18, borderRadius:5, border:`2px solid ${checked?'#2E3192':'#d1d5db'}`, background:checked?'#2E3192':'#fff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'all .15s' }}
        onClick={onChange}>
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
            <CheckItem key={g.id} id={g.id} name={g.name}
              checked={selectedIds.has(g.id)} onChange={() => onToggle(g.id)} />
          ))}
        </div>
      )}
    </div>
  )
}
