import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext.jsx'
import { supplierApi } from '../../services/mockApi.js'
import { Button, Card, Spinner, PageHeader, SectionTitle, StatusDot } from '../../components/ui.jsx'

const STATUS_BG = { VALID:'#f8fffe', EXPIRING:'#fffbeb', MISSING:'#fff5f5', EXPIRED:'#fff5f5', REJECTED:'#fff5f5' }
const STATUS_BD = { VALID:'#dcfce7', EXPIRING:'#fef3c7', MISSING:'#fee2e2', EXPIRED:'#fee2e2', REJECTED:'#fee2e2' }
const STATUS_LABEL = { VALID:'Válido', EXPIRING:'Vencendo', MISSING:'Pendente', EXPIRED:'Vencido', REJECTED:'Rejeitado' }
const STATUS_COLOR = { VALID:'#22c55e', EXPIRING:'#f59e0b', MISSING:'#ef4444', EXPIRED:'#ef4444', REJECTED:'#ef4444' }

export default function SupplierDocuments() {
  const { user } = useAuth()
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(null)
  const [toast, setToast]     = useState('')

  useEffect(() => {
    supplierApi.me(user.supplierId).then(setData).finally(() => setLoading(false))
  }, [user.supplierId])

  const handleUpload = async (docId) => {
    setUploading(docId)
    await new Promise(r => setTimeout(r, 1200))
    setData(prev => ({
      ...prev,
      documents: prev.documents.map(d =>
        d.id === docId ? { ...d, status: 'VALID', expires: '2026-06-15' } : d
      )
    }))
    setUploading(null)
    setToast('✅ Documento enviado com sucesso!')
    setTimeout(() => setToast(''), 3000)
  }

  if (loading) return <div style={{ display:'flex', justifyContent:'center', alignItems:'center', height:'50vh' }}><Spinner size={48} /></div>
  if (!data) return null

  const docs = data.documents || []
  const ok = docs.filter(d => d.status === 'VALID').length
  const pending = docs.filter(d => d.status !== 'VALID').length

  return (
    <div style={{ padding:'28px 32px', maxWidth:960, margin:'0 auto' }}>
      {toast && (
        <div style={{ position:'fixed', top:80, right:24, background:'#22c55e', color:'#fff', padding:'12px 20px', borderRadius:12, zIndex:9999, fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, boxShadow:'0 8px 24px rgba(34,197,94,.35)' }}>
          {toast}
        </div>
      )}

      <PageHeader title="Meus Documentos" subtitle={`${data.razaoSocial} · ${ok} de ${docs.length} documentos válidos`} />

      {/* Summary */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16, marginBottom:24 }}>
        {[
          { label:'Documentos Válidos', value:ok, color:'#22c55e', icon:'✅' },
          { label:'Pendentes / Vencendo', value:pending, color:pending>0?'#ef4444':'#22c55e', icon:pending>0?'⚠️':'✅' },
          { label:'Score de Conformidade', value:`${data.score}/100`, color:data.score>=70?'#22c55e':'#f59e0b', icon:'📊' },
        ].map((s,i) => (
          <Card key={i}>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ fontSize:28 }}>{s.icon}</div>
              <div>
                <div style={{ fontSize:22, fontWeight:800, color:s.color, fontFamily:'Montserrat,sans-serif' }}>{s.value}</div>
                <div style={{ fontSize:11, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>{s.label}</div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Auto-collected */}
      <Card style={{ borderRadius:16, padding:'20px 24px', marginBottom:16 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
          <SectionTitle style={{ marginBottom:0 }}>Certidões Públicas</SectionTitle>
          <span style={{ fontSize:11, background:'rgba(46,49,146,.08)', color:'#2E3192', padding:'3px 10px', borderRadius:20, fontFamily:'Montserrat,sans-serif', fontWeight:700 }}>Coletadas automaticamente</span>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          {docs.filter(d => d.source === 'AUTO').map((doc, i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', borderRadius:12, background:STATUS_BG[doc.status], border:`1px solid ${STATUS_BD[doc.status]}` }}>
              <StatusDot status={doc.status} />
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:700, color:'#1a1c5e', fontFamily:'Montserrat,sans-serif' }}>{doc.label}</div>
                <div style={{ display:'flex', gap:8, marginTop:2, alignItems:'center' }}>
                  <span style={{ fontSize:11, fontWeight:700, color:STATUS_COLOR[doc.status], background:`${STATUS_COLOR[doc.status]}18`, padding:'1px 8px', borderRadius:20, fontFamily:'Montserrat,sans-serif' }}>{STATUS_LABEL[doc.status]}</span>
                  {doc.expires && <span style={{ fontSize:10, color:'#9B9B9B' }}>vence {doc.expires}</span>}
                </div>
              </div>
              {uploading === doc.id
                ? <Spinner size={20} />
                : doc.status !== 'VALID' && <Button variant="orange" size="sm" onClick={() => handleUpload(doc.id)}>Renovar</Button>
              }
            </div>
          ))}
        </div>
      </Card>

      {/* Manual docs */}
      <Card style={{ borderRadius:16, padding:'20px 24px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
          <SectionTitle style={{ marginBottom:0 }}>Documentos Manuais</SectionTitle>
          <span style={{ fontSize:11, background:'rgba(244,126,47,.1)', color:'#ea580c', padding:'3px 10px', borderRadius:20, fontFamily:'Montserrat,sans-serif', fontWeight:700 }}>Upload necessário</span>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          {docs.filter(d => d.source === 'MANUAL').map((doc, i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', borderRadius:12, background:STATUS_BG[doc.status], border:`1px solid ${STATUS_BD[doc.status]}` }}>
              <StatusDot status={doc.status} />
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:700, color:'#1a1c5e', fontFamily:'Montserrat,sans-serif' }}>{doc.label}</div>
                <div style={{ display:'flex', gap:8, marginTop:2, alignItems:'center' }}>
                  <span style={{ fontSize:11, fontWeight:700, color:STATUS_COLOR[doc.status], background:`${STATUS_COLOR[doc.status]}18`, padding:'1px 8px', borderRadius:20, fontFamily:'Montserrat,sans-serif' }}>{STATUS_LABEL[doc.status]}</span>
                </div>
              </div>
              {uploading === doc.id
                ? <Spinner size={20} />
                : (
                  <label style={{ cursor:'pointer' }}>
                    <Button variant={doc.status==='VALID'?'neutral':'orange'} size="sm" onClick={() => handleUpload(doc.id)}>
                      {doc.status==='VALID' ? '↑ Atualizar' : '↑ Enviar'}
                    </Button>
                  </label>
                )
              }
            </div>
          ))}
        </div>
        <div style={{ marginTop:16, padding:'12px 16px', background:'rgba(46,49,146,.04)', borderRadius:12, border:'1px solid rgba(46,49,146,.1)', fontSize:12, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>
          📄 Formatos aceitos: PDF, JPG, PNG · Tamanho máximo: 10MB por arquivo
        </div>
      </Card>
    </div>
  )
}
