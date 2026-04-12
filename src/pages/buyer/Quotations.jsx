import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext.jsx'
import { rfqApi } from '../../services/api.js'
import { Card, Spinner, PageHeader, EmptyState } from '../../components/ui.jsx'

const STATUS_COLOR = { SENT:'#2E3192',VIEWED:'#f59e0b',RESPONDED:'#22c55e',CONVERTED:'#8b5cf6' }
const STATUS_LABEL = { SENT:'Enviada',VIEWED:'Vista',RESPONDED:'Respondida',CONVERTED:'Convertida' }

export default function BuyerQuotations() {
  const { user } = useAuth()
  const [rfqs, setRfqs]     = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => { rfqApi.list(user.id,user.role).then(setRfqs).finally(()=>setLoading(false)) }, [user.id])
  if (loading) return <div style={{ display:'flex',justifyContent:'center',alignItems:'center',height:'50vh' }}><Spinner size={48}/></div>
  return (
    <div style={{ padding:'28px 32px',maxWidth:960,margin:'0 auto' }}>
      <PageHeader title="Minhas Cotações" subtitle={`${rfqs.length} solicitações`} />
      {rfqs.length===0?<EmptyState icon="📝" title="Nenhuma cotação" subtitle="Busque fornecedores e solicite cotações." />:(
        <div style={{ display:'flex',flexDirection:'column',gap:12 }}>
          {rfqs.map((rfq,i)=>(
            <Card key={i} style={{ borderRadius:14,padding:'16px 20px' }}>
              <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center' }}>
                <div>
                  <div style={{ fontFamily:'Montserrat,sans-serif',fontWeight:700,fontSize:14,color:'#1a1c5e' }}>{rfq.suppliers?.razao_social||`Cotação #${rfq.id?.slice(-6)}`}</div>
                  <div style={{ fontSize:13,color:'#9B9B9B',marginTop:2 }}>{rfq.category} · {rfq.created_at?.slice(0,10)}</div>
                </div>
                <span style={{ fontSize:11,fontWeight:700,color:STATUS_COLOR[rfq.status]||'#9B9B9B',background:`${STATUS_COLOR[rfq.status]||'#9B9B9B'}18`,padding:'4px 12px',borderRadius:20,fontFamily:'Montserrat,sans-serif' }}>{STATUS_LABEL[rfq.status]||rfq.status}</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
