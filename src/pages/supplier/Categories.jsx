import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext.jsx'
import { categoriesApi } from '../../services/api.js'
import CategorySelector from '../../components/CategorySelector.jsx'
import { Button, Card, Spinner, PageHeader } from '../../components/ui.jsx'

export default function SupplierCategories() {
  const { user } = useAuth()
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [loading, setLoading]         = useState(true)
  const [saving, setSaving]           = useState(false)
  const [toast, setToast]             = useState(null)
  const [dirty, setDirty]             = useState(false)

  useEffect(() => {
    if (!user?.supplierId) { setLoading(false); return }
    categoriesApi.getSupplierCategories(user.supplierId)
      .then(cats => setSelectedIds(new Set(cats.map(c => c.id))))
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
          <Button variant="orange" size="lg" style={{ borderRadius:12 }} disabled={!dirty || saving} onClick={handleSave}>
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
        <CategorySelector
          selectedIds={selectedIds}
          onChange={handleChange}
          showDocuments={true}
        />
      </Card>

      {dirty && (
        <div style={{ position:'sticky', bottom:16, marginTop:16 }}>
          <div style={{ background:'linear-gradient(135deg,#2E3192,#3d40b5)', borderRadius:14, padding:'14px 20px', display:'flex', justifyContent:'space-between', alignItems:'center', boxShadow:'0 8px 32px rgba(46,49,146,.3)' }}>
            <span style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, color:'#fff' }}>
              Você tem alterações não salvas
            </span>
            <Button variant="orange" size="md" style={{ borderRadius:10 }} disabled={saving} onClick={handleSave}>
              {saving ? '⏳ Salvando...' : '💾 Salvar agora'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
