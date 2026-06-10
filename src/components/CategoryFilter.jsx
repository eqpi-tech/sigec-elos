// CategoryFilter — versão leve do CategorySelector para filtrar no marketplace
// Sem IA, sem documentos exigidos, sem criação de categoria customizada.
import { useState, useEffect, useRef } from 'react'
import { categoriesApi } from '../services/api.js'
import { Spinner } from './ui.jsx'

const norm = s => String(s||'').toLowerCase().normalize('NFD').replace(/\p{Mn}/gu,'')

export default function CategoryFilter({ selectedIds = new Set(), onChange }) {
  const [parents,     setParents]     = useState([])
  const [trees,       setTrees]       = useState({})
  const [expanded,    setExpanded]    = useState(new Set())
  const [loading,     setLoading]     = useState(true)
  const [search,      setSearch]      = useState('')
  const treesRef = useRef({})

  useEffect(() => {
    categoriesApi.getParents()
      .then(setParents)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { treesRef.current = trees }, [trees])

  const loadTree = async (parentId) => {
    if (treesRef.current[parentId]) return
    const tree = await categoriesApi.getTree(parentId)
    setTrees(prev => { const n={...prev,[parentId]:tree}; treesRef.current=n; return n })
  }

  const toggle = (id) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange(next)
  }

  const toggleParentAll = (parentId) => {
    const tree = trees[parentId]
    if (!tree) return
    const childIds = [
      ...(tree.children||[]).map(c=>c.id),
      ...(tree.grandchildren||[]).map(g=>g.id),
    ]
    const allSelected = childIds.every(id => selectedIds.has(id))
    const next = new Set(selectedIds)
    if (allSelected) childIds.forEach(id => next.delete(id))
    else             childIds.forEach(id => next.add(id))
    onChange(next)
  }

  // Busca: pré-carrega todas as árvores quando há termo
  useEffect(() => {
    if (!search || !parents.length) return
    const unloaded = parents.filter(p => !treesRef.current[p.id])
    if (!unloaded.length) { autoExpand(); return }
    Promise.allSettled(unloaded.map(p => categoriesApi.getTree(p.id))).then(results => {
      const patch = {}
      results.forEach((r,i) => { if (r.status==='fulfilled' && r.value) patch[unloaded[i].id]=r.value })
      if (Object.keys(patch).length) setTrees(prev => { const n={...prev,...patch}; treesRef.current=n; return n })
      autoExpand()
    })
  }, [search, parents])

  const autoExpand = () => {
    const q = norm(search)
    if (!q) return
    const toExpand = new Set()
    parents.forEach(p => {
      const tree = treesRef.current[p.id]
      if (!tree) return
      const hasMatch = (tree.children||[]).some(c=>norm(c.name).includes(q)) ||
                       (tree.grandchildren||[]).some(g=>norm(g.name).includes(q))
      if (hasMatch) toExpand.add(p.id)
    })
    if (toExpand.size) setExpanded(prev => new Set([...prev, ...toExpand]))
  }

  const matches = (name) => !search || norm(name).includes(norm(search))

  if (loading) return <div style={{display:'flex',justifyContent:'center',padding:12}}><Spinner size={24}/></div>

  const totalSelected = selectedIds.size

  return (
    <div>
      {/* Busca */}
      <input
        value={search} onChange={e=>setSearch(e.target.value)}
        placeholder="Buscar categoria..."
        style={{width:'100%',padding:'7px 10px',borderRadius:8,border:'1px solid #e2e4ef',fontSize:12,fontFamily:'DM Sans,sans-serif',color:'#1a1c5e',outline:'none',boxSizing:'border-box',marginBottom:8}}
      />

      {totalSelected > 0 && (
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
          <span style={{fontSize:11,color:'#2E3192',fontWeight:700}}>{totalSelected} selecionada{totalSelected!==1?'s':''}</span>
          <button onClick={()=>onChange(new Set())} style={{fontSize:11,color:'#ea580c',background:'none',border:'none',cursor:'pointer',fontWeight:700}}>Limpar</button>
        </div>
      )}

      {/* Lista de pais */}
      <div style={{display:'flex',flexDirection:'column',gap:2}}>
        {parents.filter(p => {
          if (!search) return true
          if (matches(p.name)) return true
          const tree = trees[p.id]
          if (!tree) return true // ainda não carregado — mantém
          return (tree.children||[]).some(c=>matches(c.name)) ||
                 (tree.grandchildren||[]).some(g=>matches(g.name))
        }).map(parent => {
          const tree = trees[parent.id]
          const isOpen = expanded.has(parent.id)
          const childIds = tree ? [...(tree.children||[]).map(c=>c.id),...(tree.grandchildren||[]).map(g=>g.id)] : []
          const countSel = childIds.filter(id=>selectedIds.has(id)).length

          return (
            <div key={parent.id} style={{borderRadius:8,overflow:'hidden',border:'1px solid #f0f0f7'}}>
              {/* Cabeçalho da categoria pai */}
              <div style={{display:'flex',alignItems:'center',gap:6,padding:'7px 10px',cursor:'pointer',background:isOpen?'rgba(46,49,146,.05)':'#fff',userSelect:'none'}}
                onClick={()=>{
                  if (!isOpen) loadTree(parent.id)
                  setExpanded(prev => { const n=new Set(prev); isOpen?n.delete(parent.id):n.add(parent.id); return n })
                }}>
                <span style={{fontSize:11,color:'#9B9B9B',width:12,flexShrink:0}}>{isOpen?'▾':'▸'}</span>
                <span style={{flex:1,fontSize:12,fontFamily:'Montserrat,sans-serif',fontWeight:700,color:'#1a1c5e'}}>{parent.name}</span>
                {countSel > 0 && (
                  <span style={{fontSize:10,background:'rgba(46,49,146,.1)',color:'#2E3192',padding:'1px 7px',borderRadius:20,fontWeight:700}}>{countSel}</span>
                )}
                {tree && childIds.length > 0 && (
                  <button onClick={e=>{e.stopPropagation();toggleParentAll(parent.id)}}
                    style={{fontSize:10,background:'none',border:'none',cursor:'pointer',color:'#9B9B9B',padding:'0 4px',whiteSpace:'nowrap'}}
                    title="Selecionar/desselecionar todos">
                    {childIds.every(id=>selectedIds.has(id))?'Dessel.':'Sel. todos'}
                  </button>
                )}
              </div>

              {/* Filhos */}
              {isOpen && (
                <div style={{padding:'4px 10px 8px 22px',background:'#fafbff'}}>
                  {!tree ? (
                    <div style={{display:'flex',justifyContent:'center',padding:8}}><Spinner size={16}/></div>
                  ) : (
                    (tree.children||[]).filter(c => matches(c.name) || (tree.grandchildren||[]).some(g=>g.parent_id===c.id&&matches(g.name))).map(child => {
                      const grandkids = (tree.grandchildren||[]).filter(g=>g.parent_id===child.id && matches(g.name))
                      const hasGrand  = grandkids.length > 0
                      const childSel  = selectedIds.has(child.id)

                      return (
                        <div key={child.id} style={{marginBottom:hasGrand?4:0}}>
                          <label style={{display:'flex',alignItems:'center',gap:7,padding:'4px 4px',cursor:'pointer',borderRadius:6,transition:'background .1s'}}
                            onMouseOver={e=>e.currentTarget.style.background='rgba(46,49,146,.05)'}
                            onMouseOut={e=>e.currentTarget.style.background='transparent'}>
                            <input type="checkbox" checked={childSel} onChange={()=>toggle(child.id)}
                              style={{width:13,height:13,accentColor:'#2E3192',cursor:'pointer',flexShrink:0}}/>
                            <span style={{fontSize:12,color:'#1a1c5e',fontFamily:'DM Sans,sans-serif'}}>{child.name}</span>
                          </label>
                          {hasGrand && grandkids.map(g => (
                            <label key={g.id} style={{display:'flex',alignItems:'center',gap:7,padding:'3px 4px 3px 20px',cursor:'pointer',borderRadius:6,transition:'background .1s'}}
                              onMouseOver={e=>e.currentTarget.style.background='rgba(46,49,146,.04)'}
                              onMouseOut={e=>e.currentTarget.style.background='transparent'}>
                              <input type="checkbox" checked={selectedIds.has(g.id)} onChange={()=>toggle(g.id)}
                                style={{width:12,height:12,accentColor:'#2E3192',cursor:'pointer',flexShrink:0}}/>
                              <span style={{fontSize:11,color:'#555',fontFamily:'DM Sans,sans-serif'}}>{g.name}</span>
                            </label>
                          ))}
                        </div>
                      )
                    })
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
