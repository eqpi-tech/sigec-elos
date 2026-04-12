import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../../context/AuthContext.jsx'
import { supplierApi, documentApi } from '../../services/api.js'
import { Button, Card, Spinner, PageHeader, SectionTitle, StatusDot } from '../../components/ui.jsx'

const DOC_TYPES = [
  { type:'CNPJ_CARD',   label:'Cartão CNPJ',            source:'AUTO',   required:true  },
  { type:'CND_FEDERAL', label:'CND Federal',             source:'MANUAL', required:true  },
  { type:'CRF_FGTS',   label:'CRF (FGTS)',              source:'MANUAL', required:true  },
  { type:'CNDT',        label:'CNDT Trabalhista',        source:'MANUAL', required:true  },
  { type:'ALVARA',      label:'Alvará de Funcionamento', source:'MANUAL', required:true  },
  { type:'CONTRACT',    label:'Contrato Social',         source:'MANUAL', required:true  },
  { type:'ISO9001',     label:'Certificado ISO 9001',    source:'MANUAL', required:false },
  { type:'BALANCE',     label:'Balanço Patrimonial',     source:'MANUAL', required:false },
]

const STATUS_CONFIG = {
  VALID:    { bg:'#f8fffe', bd:'#dcfce7', color:'#22c55e', label:'Válido' },
  EXPIRING: { bg:'#fffbeb', bd:'#fef3c7', color:'#f59e0b', label:'Vencendo' },
  MISSING:  { bg:'#fff5f5', bd:'#fee2e2', color:'#ef4444', label:'Pendente' },
  PENDING:  { bg:'#fff7ed', bd:'#fed7aa', color:'#f59e0b', label:'Em análise' },
  EXPIRED:  { bg:'#fff5f5', bd:'#fee2e2', color:'#ef4444', label:'Vencido' },
  REJECTED: { bg:'#fff5f5', bd:'#fee2e2', color:'#ef4444', label:'Rejeitado' },
}

export default function SupplierDocuments() {
  const { user } = useAuth()
  const [supplier, setSupplier] = useState(null)
  const [docs, setDocs]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [uploading, setUploading] = useState(null)
  const [toast, setToast]       = useState(null)
  const fileRefs = useRef({})

  const loadData = async () => {
    if (!user?.supplierId) { setLoading(false); return }
    try {
      const s = await supplierApi.me(user.supplierId)
      setSupplier(s)
      const d = await documentApi.list(user.supplierId)
      setDocs(d)
    } finally { setLoading(false) }
  }

  useEffect(() => { loadData() }, [user?.supplierId])

  const showToast = (msg, type='success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  const handleUpload = async (docType, file) => {
    if (!file) return
    if (file.size > 10*1024*1024) { showToast('Arquivo muito grande. Máx 10MB', 'error'); return }
    const ok = ['application/pdf','image/jpeg','image/jpg','image/png']
    if (!ok.includes(file.type)) { showToast('Use PDF, JPG ou PNG', 'error'); return }
    setUploading(docType)
    try {
      const uploaded = await documentApi.upload(user.supplierId, user.id, file, docType)
      setDocs(prev => { const i=prev.findIndex(d=>d.type===docType); return i>=0?prev.map(d=>d.type===docType?uploaded:d):[...prev,uploaded] })
      showToast('✅ Documento enviado! Aguardando validação.')
    } catch (err) { showToast('Erro: '+err.message,'error') }
    finally { setUploading(null) }
  }

  const getDoc = (type) => docs.find(d => d.type === type)

  if (loading) return <div style={{ display:'flex',justifyContent:'center',alignItems:'center',height:'50vh' }}><Spinner size={48}/></div>

  if (!user?.supplierId) return (
    <div style={{ padding:'60px 32px', textAlign:'center' }}>
      <div style={{ fontSize:48, marginBottom:12 }}>📋</div>
      <div style={{ fontFamily:'Montserrat,sans-serif',fontWeight:700,fontSize:18,color:'#1a1c5e',marginBottom:8 }}>Complete o cadastro primeiro</div>
      <Button variant="orange" onClick={()=>window.location.href='/cadastro'}>Ir para cadastro →</Button>
    </div>
  )

  const docGrid = (types) => (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
      {types.map(dt => {
        const doc  = getDoc(dt.type)
        const cfg  = STATUS_CONFIG[doc?.status||'MISSING']
        const busy = uploading === dt.type
        return (
          <div key={dt.type} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', borderRadius:12, background:cfg.bg, border:`1px solid ${cfg.bd}` }}>
            <StatusDot status={doc?.status||'MISSING'} />
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:700, color:'#1a1c5e', fontFamily:'Montserrat,sans-serif' }}>{dt.label}</div>
              <div style={{ display:'flex', gap:6, marginTop:2, alignItems:'center', flexWrap:'wrap' }}>
                <span style={{ fontSize:10, fontWeight:700, color:cfg.color, background:`${cfg.color}18`, padding:'1px 7px', borderRadius:20, fontFamily:'Montserrat,sans-serif' }}>{cfg.label}</span>
                {doc?.expires_at && <span style={{ fontSize:10, color:'#9B9B9B' }}>{doc.expires_at.slice(0,10)}</span>}
              </div>
              {doc?.review_note && <div style={{ fontSize:11,color:'#dc2626',marginTop:2 }}>⚠ {doc.review_note}</div>}
            </div>
            {dt.source === 'MANUAL' && (
              <>
                <input type="file" accept=".pdf,.jpg,.jpeg,.png" ref={el=>fileRefs.current[dt.type]=el} style={{ display:'none' }} onChange={e=>handleUpload(dt.type,e.target.files[0])} />
                {busy ? <Spinner size={20}/> : (
                  <Button variant={doc?.status==='VALID'?'neutral':'orange'} size="sm" onClick={()=>fileRefs.current[dt.type]?.click()}>
                    {doc?.status==='VALID'?'↑ Atualizar':'↑ Enviar'}
                  </Button>
                )}
              </>
            )}
          </div>
        )
      })}
    </div>
  )

  const ok  = docs.filter(d=>d.status==='VALID').length
  const pnd = docs.filter(d=>['PENDING','MISSING'].includes(d.status)).length

  return (
    <div style={{ padding:'28px 32px', maxWidth:960, margin:'0 auto' }}>
      {toast && <div style={{ position:'fixed',top:80,right:24,background:toast.type==='error'?'#ef4444':'#22c55e',color:'#fff',padding:'12px 20px',borderRadius:12,zIndex:9999,fontFamily:'Montserrat,sans-serif',fontWeight:700,fontSize:13,boxShadow:'0 8px 24px rgba(0,0,0,.2)',maxWidth:340 }}>{toast.msg}</div>}

      <PageHeader title="Meus Documentos" subtitle={`${supplier?.razao_social} · ${ok}/${DOC_TYPES.length} válidos`} />

      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16, marginBottom:24 }}>
        {[['Válidos',ok,'#22c55e','✅'],['Pendentes',pnd,pnd>0?'#f59e0b':'#22c55e','⏳'],['Score ELOS',`${supplier?.score||0}/100`,supplier?.score>=70?'#22c55e':'#f59e0b','📊']].map(([l,v,c,i])=>(
          <Card key={l}><div style={{ display:'flex',alignItems:'center',gap:12 }}><div style={{ fontSize:28 }}>{i}</div><div><div style={{ fontSize:22,fontWeight:800,color:c,fontFamily:'Montserrat,sans-serif' }}>{v}</div><div style={{ fontSize:11,color:'#9B9B9B' }}>{l}</div></div></div></Card>
        ))}
      </div>

      <Card style={{ borderRadius:16, padding:'20px 24px', marginBottom:16 }}>
        <SectionTitle>Documentos Obrigatórios</SectionTitle>
        {docGrid(DOC_TYPES.filter(d=>d.required))}
      </Card>

      <Card style={{ borderRadius:16, padding:'20px 24px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
          <SectionTitle style={{ marginBottom:0 }}>Documentos Opcionais</SectionTitle>
          <span style={{ fontSize:11,background:'rgba(46,49,146,.08)',color:'#2E3192',padding:'3px 10px',borderRadius:20,fontFamily:'Montserrat,sans-serif',fontWeight:700 }}>Eleva o score ELOS</span>
        </div>
        {docGrid(DOC_TYPES.filter(d=>!d.required))}
        <div style={{ marginTop:14,padding:'10px 14px',background:'rgba(46,49,146,.04)',borderRadius:10,fontSize:12,color:'#9B9B9B',fontFamily:'DM Sans,sans-serif' }}>
          📄 PDF, JPG ou PNG · Máx 10MB · Documentos são validados pelo backoffice EQPI
        </div>
      </Card>
    </div>
  )
}
