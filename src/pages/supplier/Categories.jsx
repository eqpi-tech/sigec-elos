import { useState, useEffect } from 'react'
import { hasAction } from '../../lib/modules.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { categoriesApi } from '../../services/api.js'
import { supabase } from '../../lib/supabase.js'
import CategorySelector from '../../components/CategorySelector.jsx'

// Resumo das categorias já selecionadas — visível sem expandir a árvore
function SelectedSummary({ selectedIds, onRemove }) {
  const [names, setNames] = useState({})
  useEffect(() => {
    const ids = [...selectedIds].filter(id => !(id in names))
    if (!ids.length) return
    supabase.from('categories').select('id, name').in('id', ids)
      .then(({ data }) => setNames(p => ({ ...p, ...Object.fromEntries((data||[]).map(c => [c.id, c.name])) })))
  }, [selectedIds])
  if (selectedIds.size === 0) return null
  return (
    <div style={{ background:'rgba(46,49,146,.04)', border:'1px solid rgba(46,49,146,.12)', borderRadius:12, padding:'14px 18px', marginBottom:16 }}>
      <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:12, color:'#1a1c5e', marginBottom:8 }}>
        ✅ Suas categorias selecionadas ({selectedIds.size})
      </div>
      <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
        {[...selectedIds].map(id => (
          <span key={id} style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize:11.5, background:'#fff', border:'1px solid #c7cdf5', padding:'4px 10px', borderRadius:20, color:'#2E3192', fontFamily:'DM Sans,sans-serif', fontWeight:600 }}>
            {names[id] || `#${id}`}
            <button onClick={() => onRemove(id)} title="Remover"
              style={{ background:'none', border:'none', cursor:'pointer', color:'#9B9B9B', fontSize:12, lineHeight:1, padding:0 }}>✕</button>
          </span>
        ))}
      </div>
    </div>
  )
}
import { Button, Card, Spinner, PageHeader } from '../../components/ui.jsx'

export default function SupplierCategories() {
  const { user } = useAuth()
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [clientIds, setClientIds]     = useState(undefined)  // clientes vinculados → categorias custom visíveis
  const [allowedIds, setAllowedIds]   = useState(undefined)  // 22/09: mesma regra do cadastro (fluxos dos selos)
  const [cnpjData, setCnpjData]       = useState(null)       // CNAE p/ as sugestões (paridade c/ cadastro)
  const [loading, setLoading]         = useState(true)
  const [saving, setSaving]           = useState(false)
  const [toast, setToast]             = useState(null)
  const [dirty, setDirty]             = useState(false)

  useEffect(() => {
    if (!user?.supplierId) { setLoading(false); return }
    Promise.all([
      categoriesApi.getSupplierCategories(user.supplierId),
      // Clientes com selo para este fornecedor → árvore inclui as categorias deles
      supabase.from('seals').select('client_id, flow_id').eq('supplier_id', user.supplierId),
      supabase.from('suppliers').select('cnae_main, cnae_list').eq('id', user.supplierId).maybeSingle(),
    ])
      .then(async ([cats, sealsRes, supRes]) => {
        const selected = new Set(cats.map(c => c.id))
        setSelectedIds(selected)
        const ids = [...new Set((sealsRes.data || []).map(s => s.client_id).filter(Boolean))]
        setClientIds(ids.length ? ids : undefined)
        // 22/09: MESMA REGRA DO CADASTRO — convidado fica restrito à matriz
        // dos fluxos dos seus processos (+ o que já tem selecionado);
        // espontâneo (sem fluxo) segue a árvore aberta com sugestão por CNAE
        const flowIds = [...new Set((sealsRes.data || []).map(s => s.flow_id).filter(Boolean))]
        if (flowIds.length) {
          const { data: fc } = await supabase
            .from('client_flow_categories').select('category_id').in('flow_id', flowIds)
          const allow = new Set((fc || []).map(r => r.category_id))
          for (const id of selected) allow.add(id)
          if (allow.size) setAllowedIds([...allow])
        }
        // CNAE do cadastro p/ o painel de sugestões (o campo cnae_main pode
        // guardar código ou descrição, conforme a origem do dado)
        const sup = supRes.data
        if (sup?.cnae_main || sup?.cnae_list?.length) {
          const isCode = /^\d+$/.test(String(sup.cnae_main || ''))
          setCnpjData({
            cnae_fiscal: isCode ? sup.cnae_main : (sup.cnae_list?.[0] || null),
            cnae_fiscal_descricao: isCode ? '' : (sup.cnae_main || ''),
          })
        }
      })
      .finally(() => setLoading(false))
  }, [user?.supplierId])

  const handleChange = (newSet) => {
    setSelectedIds(newSet)
    setDirty(true)
  }

  const handleSave = async () => {
    if (!user?.supplierId) return
    setSaving(true)
    try {
      await categoriesApi.saveSupplierCategories(user.supplierId, [...selectedIds])
      setDirty(false)
      setToast({ msg: '✅ Categorias salvas com sucesso!', type: 'success' })
      setTimeout(() => setToast(null), 4000)
    } catch (err) {
      setToast({ msg: 'Erro: ' + err.message, type: 'error' })
      setTimeout(() => setToast(null), 4000)
    } finally { setSaving(false) }
  }

  if (loading) return <div style={{ display:'flex', justifyContent:'center', alignItems:'center', height:'50vh' }}><Spinner size={48}/></div>

  return (
    <div style={{ padding:'28px 32px', maxWidth:900, margin:'0 auto' }}>

      {toast && (
        <div style={{ position:'fixed', top:80, right:24, background:toast.type==='error'?'#ef4444':'#22c55e', color:'#fff', padding:'12px 20px', borderRadius:12, zIndex:9999, fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, boxShadow:'0 8px 24px rgba(0,0,0,.2)', maxWidth:360 }}>
          {toast.msg}
        </div>
      )}

      <PageHeader
        title="Minhas Categorias"
        subtitle={`${selectedIds.size} categoria${selectedIds.size !== 1 ? 's' : ''} selecionada${selectedIds.size !== 1 ? 's' : ''}`}
        action={
          <Button variant="orange" size="lg" style={{ borderRadius:12 }} disabled={!dirty || saving || !hasAction(user, 'acao:mudar_categorias')} title={!hasAction(user, 'acao:mudar_categorias') ? 'Seu perfil não permite mudar categorias' : undefined} onClick={handleSave}>
            {saving ? <><Spinner size={16}/> Salvando...</> : '💾 Salvar alterações'}
          </Button>
        }
      />

      <Card style={{ borderRadius:16, padding:'20px 24px', marginBottom:16, background:'rgba(46,49,146,.03)', border:'1px solid rgba(46,49,146,.1)' }}>
        <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#1a1c5e', lineHeight:1.6 }}>
          Selecione as categorias de produtos e serviços que sua empresa oferece.
          Com base na sua seleção, o sistema define automaticamente quais documentos são necessários para a homologação.
        </div>
      </Card>

      <Card style={{ borderRadius:16, padding:'20px 24px' }}>
        <SelectedSummary selectedIds={selectedIds}
          onRemove={(id) => { setSelectedIds(p => { const n = new Set(p); n.delete(id); return n }); setDirty(true) }}/>
        <CategorySelector
          selectedIds={selectedIds}
          onChange={handleChange}
          showDocuments={true}
          clientIds={clientIds}
          allowedIds={allowedIds}
          cnpjData={cnpjData}
        />
      </Card>

      {dirty && (
        <div style={{ position:'sticky', bottom:16, marginTop:16 }}>
          <div style={{ background:'linear-gradient(135deg,#2E3192,#3d40b5)', borderRadius:14, padding:'14px 20px', display:'flex', justifyContent:'space-between', alignItems:'center', boxShadow:'0 8px 32px rgba(46,49,146,.3)' }}>
            <span style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, color:'#fff' }}>
              Você tem alterações não salvas
            </span>
            <Button variant="orange" size="md" style={{ borderRadius:10 }} disabled={saving || !hasAction(user, 'acao:mudar_categorias')} onClick={handleSave}>
              {saving ? '⏳ Salvando...' : '💾 Salvar agora'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
