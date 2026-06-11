import { Card, KpiCard, ScoreBar, StatusDot, Button, SectionTitle } from '../../components/ui.jsx'
import { DEMO_SUPPLIER, DEMO_SEALS, DEMO_DOCS } from './demoData.js'

const STATUS_C = { ACTIVE:'#22c55e', PENDING:'#f59e0b', SUSPENDED:'#f59e0b', EXPIRED:'#9B9B9B' }
const STATUS_L = { ACTIVE:'Ativo', PENDING:'Em análise', SUSPENDED:'Suspenso', EXPIRED:'Expirado' }
const DOC_BG   = { VALID:'#f8fffe', EXPIRING:'#fffbeb', MISSING:'#fff5f5', PENDING:'#fff7ed', REJECTED:'#fff5f5' }
const DOC_BD   = { VALID:'#dcfce7', EXPIRING:'#fef3c7', MISSING:'#fee2e2', PENDING:'#fed7aa', REJECTED:'#fee2e2' }

function SealCard({ seal, onClick }) {
  const sc = STATUS_C[seal.status] || '#9B9B9B'
  const sl = STATUS_L[seal.status] || seal.status
  return (
    <div onClick={onClick} style={{ cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:8, padding:'16px 14px', background:'#fff', border:`1px solid ${seal.status==='ACTIVE'?'rgba(34,197,94,.25)':'rgba(46,49,146,.1)'}`, borderRadius:14, minWidth:140 }}>
      <div style={{ width:56, height:56, borderRadius:'50%', background:`${seal.color}15`, border:`3px solid ${seal.color}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:24 }}>{seal.icon}</div>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:12, color:'#1a1c5e' }}>{seal.name}</div>
        <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:11, color:'#64748b' }}>{seal.clientName}</div>
      </div>
      <span style={{ fontSize:10, fontWeight:700, color:sc, background:`${sc}18`, padding:'3px 10px', borderRadius:20, fontFamily:'Montserrat,sans-serif' }}>{sl}</span>
      {seal.status === 'ACTIVE' && (
        <div style={{ width:'100%' }}><ScoreBar score={seal.score}/></div>
      )}
    </div>
  )
}

export default function DemoSupplierDashboard({ navigate }) {
  const s = DEMO_SUPPLIER
  const scoreC = s.score >= 90 ? '#22c55e' : s.score >= 70 ? '#f59e0b' : '#ef4444'

  const docsOk      = DEMO_DOCS.filter(d => d.status === 'VALID').length
  const docsWarn    = DEMO_DOCS.filter(d => d.status === 'EXPIRING').length
  const docsMissing = DEMO_DOCS.filter(d => ['MISSING','REJECTED'].includes(d.status)).length
  const docsPending = DEMO_DOCS.filter(d => d.status === 'PENDING').length

  return (
    <div style={{ padding:'28px 32px', maxWidth:1200, margin:'0 auto' }}>

      {/* ── Header ── */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:24, flexWrap:'wrap', gap:12 }}>
        <div>
          <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:24, color:'#1a1c5e' }}>Boa tarde, Lucas! 👋</div>
          <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#9B9B9B', marginTop:2 }}>
            {s.razao_social} · CNPJ {s.cnpj}
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:11, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>Score geral</div>
            <div style={{ fontSize:22, fontWeight:900, color:scoreC, fontFamily:'Montserrat,sans-serif', lineHeight:1 }}>
              {s.score}<span style={{ fontSize:13, color:'#9B9B9B', fontWeight:400 }}>/100</span>
            </div>
          </div>
          <div style={{ width:80 }}><ScoreBar score={s.score}/></div>
        </div>
      </div>

      {/* ── Alerta docs pendentes ── */}
      {docsMissing > 0 && (
        <div style={{ background:'rgba(239,68,68,.08)', border:'1px solid rgba(239,68,68,.25)', borderRadius:14, padding:'14px 20px', marginBottom:20, display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
          <span style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, color:'#dc2626' }}>
            ⚠ {docsMissing} documento(s) pendente(s) — Seu Selo pode ser suspenso.
          </span>
          <Button variant="danger" size="sm" onClick={() => navigate('documentos')}>Resolver agora</Button>
        </div>
      )}

      {/* ── KPIs ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16, marginBottom:28 }}>
        <KpiCard label="Processos Ativos" value={DEMO_SEALS.filter(s=>s.status==='ACTIVE').length} sub={`de ${DEMO_SEALS.length} total`} subColor="#9B9B9B" icon="🔄" iconBg="rgba(46,49,146,.1)" />
        <KpiCard label="Docs Válidos"     value={`${docsOk}/${DEMO_DOCS.length}`} sub={docsWarn>0?`${docsWarn} vencendo`:docsMissing>0?`${docsMissing} pendente`:'Em dia'} subColor={docsWarn>0||docsMissing>0?'#f59e0b':'#22c55e'} icon="📋" iconBg="rgba(34,197,94,.1)" />
        <KpiCard label="Em Análise"       value={docsPending} sub="Aguardando backoffice" subColor="#8b5cf6" icon="⏳" iconBg="rgba(139,92,246,.1)" />
        <KpiCard label="Plano"            value={s.activePlan.type} sub={`Válido até ${s.activePlan.ends_at}`} subColor="#22c55e" icon="⭐" iconBg="rgba(244,126,47,.1)" />
      </div>

      {/* ── Carteira de Selos ── */}
      <Card style={{ borderRadius:16, padding:'24px 28px', marginBottom:24 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <div>
            <SectionTitle>Carteira de Selos</SectionTitle>
            <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#64748b', marginTop:2 }}>
              {DEMO_SEALS.filter(s=>s.status==='ACTIVE').length} selo ativo
            </div>
          </div>
          <Button variant="orange" size="sm">⭐ Upgrade Homologado</Button>
        </div>
        <div style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
          {DEMO_SEALS.map(seal => (
            <SealCard key={seal.id} seal={seal} onClick={() => navigate('processo')}/>
          ))}
        </div>
      </Card>

      {/* ── Meus Processos ── */}
      <div style={{ marginBottom:28 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <div>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:16, color:'#1a1c5e' }}>Meus Processos de Homologação</div>
            <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#64748b', marginTop:2 }}>Acompanhe o status de cada processo em detalhe</div>
          </div>
          <Button variant="neutral" size="sm" onClick={() => navigate('documentos')}>📋 Gerenciar Docs</Button>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:16 }}>
          {DEMO_SEALS.map(seal => {
            const sc = STATUS_C[seal.status] || '#9B9B9B'
            const sl = STATUS_L[seal.status] || seal.status
            return (
              <Card key={seal.id} style={{ borderRadius:14, padding:'20px 22px', display:'flex', flexDirection:'column', gap:12, border:`1px solid ${seal.status==='ACTIVE'?'rgba(34,197,94,.2)':'rgba(46,49,146,.1)'}` }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                  <div>
                    <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:14, color:'#1a1c5e', lineHeight:1.2 }}>{seal.name}</div>
                    <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:12, color:'#64748b', marginTop:2 }}>{seal.clientName}</div>
                  </div>
                  <span style={{ fontSize:10, fontWeight:700, color:sc, background:`${sc}18`, padding:'3px 10px', borderRadius:20, fontFamily:'Montserrat,sans-serif', flexShrink:0 }}>{sl}</span>
                </div>
                <div>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                    <span style={{ fontFamily:'DM Sans,sans-serif', fontSize:11, color:'#9B9B9B' }}>Score</span>
                    <span style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:11, color:'#1a1c5e' }}>{seal.score}/100</span>
                  </div>
                  <ScoreBar score={seal.score}/>
                </div>
                <div style={{ display:'flex', gap:8 }}>
                  {[['✓',docsOk,'#22c55e'],['⏳',docsPending,'#f59e0b'],['✗',docsMissing,'#ef4444']].map(([icon,val,color],j) => (
                    <div key={j} style={{ flex:1, textAlign:'center', padding:5, borderRadius:8, background:`${color}10`, border:`1px solid ${color}22` }}>
                      <div style={{ fontSize:13 }}>{icon}</div>
                      <div style={{ fontSize:11, fontWeight:700, color, fontFamily:'Montserrat,sans-serif' }}>{val}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div style={{ fontSize:10, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>
                    {seal.issued_at ? `Emitido ${seal.issued_at}` : 'Aguardando análise'}
                  </div>
                  <Button variant="primary" size="sm" onClick={() => navigate('processo')}>Ver Processo →</Button>
                </div>
              </Card>
            )
          })}
        </div>
      </div>

      {/* ── Documentos Recentes ── */}
      <Card style={{ borderRadius:16, padding:'20px 24px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <SectionTitle>Documentos Recentes</SectionTitle>
          <Button variant="neutral" size="sm" onClick={() => navigate('documentos')}>Ver todos →</Button>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
          {DEMO_DOCS.slice(0,6).map((doc,i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 12px', borderRadius:10, background:DOC_BG[doc.status]||'#f8fffe', border:`1px solid ${DOC_BD[doc.status]||'#dcfce7'}` }}>
              <StatusDot status={doc.status}/>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:12, fontWeight:600, color:'#1a1c5e', fontFamily:'Montserrat,sans-serif', lineHeight:1.2 }}>{doc.label}</div>
                <div style={{ fontSize:10, color:'#9B9B9B' }}>{doc.source==='AUTO'?'automático':'manual'}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
