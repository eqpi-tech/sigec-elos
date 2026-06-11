import { Card, Button, StatusDot, PageHeader } from '../../components/ui.jsx'
import { DEMO_DOCS, DEMO_SUPPLIER } from './demoData.js'

const STATUS_CONFIG = {
  VALID:    { bg:'#f8fffe', bd:'#dcfce7', color:'#22c55e', label:'Válido' },
  EXPIRING: { bg:'#fffbeb', bd:'#fef3c7', color:'#f59e0b', label:'Vencendo' },
  MISSING:  { bg:'#fff5f5', bd:'#fee2e2', color:'#ef4444', label:'Pendente' },
  PENDING:  { bg:'#fff7ed', bd:'#fed7aa', color:'#f59e0b', label:'Em análise' },
  EXPIRED:  { bg:'#fff5f5', bd:'#fee2e2', color:'#ef4444', label:'Vencido' },
  REJECTED: { bg:'#fff5f5', bd:'#fee2e2', color:'#ef4444', label:'Rejeitado' },
}

export default function DemoSupplierDocumentos({ navigate }) {
  const docsOk      = DEMO_DOCS.filter(d => d.status === 'VALID').length
  const docsPending = DEMO_DOCS.filter(d => d.status === 'PENDING').length
  const docsMissing = DEMO_DOCS.filter(d => ['MISSING','REJECTED','EXPIRED'].includes(d.status)).length

  return (
    <div style={{ padding:'28px 32px', maxWidth:1200, margin:'0 auto' }}>
      <PageHeader
        title="Meus Documentos"
        subtitle={`${DEMO_SUPPLIER.razao_social} · ${docsOk} validados · ${docsPending} em análise · ${docsMissing} pendentes`}
        action={{ label:'← Dashboard', onClick: () => navigate('dashboard') }}
      />

      {/* Resumo */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:28 }}>
        {[
          { label:'Válidos',     value:docsOk,      color:'#22c55e', bg:'rgba(34,197,94,.1)',    icon:'✅' },
          { label:'Vencendo',    value:DEMO_DOCS.filter(d=>d.status==='EXPIRING').length, color:'#f59e0b', bg:'rgba(245,158,11,.1)', icon:'⚠️' },
          { label:'Em análise',  value:docsPending,  color:'#8b5cf6', bg:'rgba(139,92,246,.1)', icon:'⏳' },
          { label:'Pendentes',   value:docsMissing,  color:'#ef4444', bg:'rgba(239,68,68,.1)',   icon:'❌' },
        ].map(k => (
          <Card key={k.label}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
              <div>
                <div style={{ fontSize:11, fontWeight:600, color:'#9B9B9B', letterSpacing:.5, fontFamily:'Montserrat,sans-serif', textTransform:'uppercase', marginBottom:6 }}>{k.label}</div>
                <div style={{ fontSize:28, fontWeight:900, color:k.color, fontFamily:'Montserrat,sans-serif', lineHeight:1 }}>{k.value}</div>
              </div>
              <div style={{ width:42, height:42, borderRadius:12, background:k.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>{k.icon}</div>
            </div>
          </Card>
        ))}
      </div>

      {/* Lista de documentos */}
      <Card style={{ borderRadius:16, padding:'20px 24px' }}>
        <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:15, color:'#1a1c5e', marginBottom:18 }}>Documentos Exigidos</div>
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {DEMO_DOCS.map(doc => {
            const cfg = STATUS_CONFIG[doc.status] || STATUS_CONFIG.MISSING
            const canUpload = ['MISSING','REJECTED','EXPIRED'].includes(doc.status)
            return (
              <div key={doc.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', borderRadius:12, background:cfg.bg, border:`1px solid ${cfg.bd}` }}>
                <StatusDot status={doc.status}/>
                <div style={{ flex:1 }}>
                  <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, color:'#1a1c5e' }}>{doc.label}</div>
                  <div style={{ display:'flex', gap:8, marginTop:3, flexWrap:'wrap', alignItems:'center' }}>
                    <span style={{ fontSize:10, fontWeight:700, color:cfg.color, background:`${cfg.color}15`, padding:'2px 8px', borderRadius:20, fontFamily:'Montserrat,sans-serif' }}>
                      {cfg.label}
                    </span>
                    <span style={{ fontSize:11, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>
                      {doc.source === 'AUTO' ? '🤖 automático' : '📎 manual'}
                    </span>
                    {doc.expires_at && doc.expires_at !== '2099-12-31' && (
                      <span style={{ fontSize:11, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>
                        vence {doc.expires_at}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display:'flex', gap:8, flexShrink:0 }}>
                  {doc.source === 'AUTO' ? (
                    <Button variant="neutral" size="sm">🔄 Atualizar</Button>
                  ) : canUpload ? (
                    <Button variant="primary" size="sm">📎 Enviar</Button>
                  ) : (
                    <Button variant="neutral" size="sm" style={{ opacity:.5, cursor:'default' }}>
                      {doc.status === 'PENDING' ? '⏳ Em análise' : '✓ Aprovado'}
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}
