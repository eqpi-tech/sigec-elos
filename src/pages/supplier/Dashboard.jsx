import { useState, useEffect, useCallback } from 'react'
import { useIsMobile } from '../../hooks/useIsMobile.js'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { supplierApi, documentApi } from '../../services/api.js'
import { supabase } from '../../lib/supabase.js'
import { Button, Card, KpiCard, ScoreBar, StatusDot, Spinner, SectionTitle } from '../../components/ui.jsx'
import SealBadge from '../../components/SealBadge.jsx'

const STATUS_COLORS = { ACTIVE:'#22c55e', PENDING:'#f59e0b', SUSPENDED:'#f59e0b', EXPIRED:'#9B9B9B' }
const STATUS_LABELS = { ACTIVE:'Ativo', PENDING:'Em análise', SUSPENDED:'Suspenso', EXPIRED:'Expirado' }
const DOC_BG     = { VALID:'#f8fffe', EXPIRING:'#fffbeb', MISSING:'#fff5f5', PENDING:'#fff7ed', REJECTED:'#fff5f5' }
const DOC_BORDER = { VALID:'#dcfce7', EXPIRING:'#fef3c7', MISSING:'#fee2e2', PENDING:'#fed7aa', REJECTED:'#fee2e2' }

export default function SupplierDashboard() {
  const mobile   = useIsMobile()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [supplier, setSupplier]             = useState(null)
  const [docs,     setDocs]                 = useState([])
  const [seals,    setSeals]                = useState([])
  const [requiredDocsCount, setRequired]    = useState(0)
  const [loading,  setLoading]              = useState(true)
  const [showAlertModal, setShowAlertModal] = useState(false)
  const [alertDocs,      setAlertDocs]      = useState([])

  const load = useCallback(async () => {
    if (!user?.supplierId) { setLoading(false); return }
    setLoading(true)
    try {
      const [s, d] = await Promise.all([
        supplierApi.me(user.supplierId),
        documentApi.list(user.supplierId),
      ])
      setSupplier(s)
      setDocs(d)
      // seals já vêm com clients(razao_social) do me() atualizado
      setSeals(s.seals || [])

      // Contagem de docs exigidos pelas categorias do fornecedor
      const { data: catRows } = await supabase
        .from('supplier_categories').select('category_id').eq('supplier_id', user.supplierId)
      if (catRows?.length) {
        const catIds = catRows.map(r => r.category_id)
        const { data: catDocs } = await supabase
          .from('category_documents').select('document_id').in('category_id', catIds)
        setRequired(new Set((catDocs||[]).map(r => r.document_id)).size)
      }

      // Modal de alerta: mostra uma vez por sessão se há docs EXPIRED ou REJECTED
      const sessionKey = `alert_shown_${user.supplierId}`
      const urgent = d.filter(doc => doc.status === 'EXPIRED' || doc.status === 'REJECTED')
      if (urgent.length > 0 && !sessionStorage.getItem(sessionKey)) {
        sessionStorage.setItem(sessionKey, '1')
        setAlertDocs(urgent)
        setShowAlertModal(true)
      }
    } finally { setLoading(false) }
  }, [user?.supplierId])

  useEffect(() => { load() }, [load])

  if (loading) return (
    <div style={{ display:'flex', justifyContent:'center', alignItems:'center', height:'50vh' }}>
      <Spinner size={48}/>
    </div>
  )

  if (!user?.supplierId) return (
    <div style={{ padding:'60px 32px', textAlign:'center' }}>
      <div style={{ fontSize:64, marginBottom:16 }}>🏭</div>
      <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:22, color:'#1a1c5e', marginBottom:8 }}>
        Bem-vindo ao SIGEC-ELOS!
      </div>
      <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:15, color:'#9B9B9B', marginBottom:28, maxWidth:400, margin:'0 auto 28px' }}>
        Para aparecer no marketplace e iniciar a homologação, complete seu cadastro e escolha um plano.
      </div>
      <Button variant="orange" size="lg" style={{ borderRadius:12 }} onClick={() => navigate('/cadastro')}>
        Completar cadastro →
      </Button>
    </div>
  )

  const docsOk      = docs.filter(d => d.status === 'VALID').length
  const docsWarn    = docs.filter(d => d.status === 'EXPIRING').length
  const docsMissing = docs.filter(d => ['MISSING','REJECTED'].includes(d.status)).length
  const docsPending = docs.filter(d => d.status === 'PENDING').length
  const totalDocs   = requiredDocsCount || Math.max(docs.length, 1)

  const firstName = user.name?.split(' ')[0] || 'Bem-vindo'
  const hour      = new Date().getHours()
  const greeting  = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'

  // Seal principal = SIGEC próprio (client_id = null) ou primeiro ativo
  const sigecSeal   = seals.find(s => s.client_id === null)
  const primarySeal = sigecSeal || seals[0]
  const globalScore = primarySeal?.score || 0

  // Processos de homologação = cada seal é um processo
  const processes = seals.map(seal => {
    const isSusp   = !!(seal.client_suspended_at || seal.status === 'SUSPENDED')
    const effStatus = isSusp ? 'SUSPENDED' : (seal.status || 'PENDING')
    const clientName = seal.clients?.razao_social || (seal.client_id ? 'Cliente' : 'SIGEC-ELOS')
    const name       = seal.seal_name || (seal.client_id ? `Processo ${clientName}` : 'SIGEC Simples')
    return { ...seal, effStatus, clientName, name }
  })

  return (
    <div style={{ padding: mobile ? '16px' : '28px 32px', maxWidth:1200, margin:'0 auto' }}>

      {/* ── Header ── */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:24, flexWrap:'wrap', gap:12 }}>
        <div>
          <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:mobile?20:24, color:'#1a1c5e' }}>
            {greeting}, {firstName}! 👋
          </div>
          <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#9B9B9B', marginTop:2 }}>
            {supplier.razao_social} · CNPJ {supplier.cnpj}
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:11, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>Score geral</div>
            <div style={{ fontSize:22, fontWeight:900, color: globalScore>=70?'#22c55e':globalScore>=50?'#f59e0b':'#ef4444', fontFamily:'Montserrat,sans-serif', lineHeight:1 }}>
              {globalScore}<span style={{ fontSize:13, color:'#9B9B9B', fontWeight:400 }}>/100</span>
            </div>
          </div>
          <div style={{ width:80 }}>
            <ScoreBar score={globalScore} />
          </div>
        </div>
      </div>

      {/* ── Alertas ── */}
      {!supplier.activePlan && (
        <div style={{ background:'linear-gradient(135deg,#F47E2F,#ff9a52)', borderRadius:14, padding:'16px 20px', marginBottom:20, display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
          <div>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:14, color:'#fff' }}>Nenhum plano ativo</div>
            <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, color:'rgba(255,255,255,.8)' }}>Assine um plano para aparecer no marketplace e iniciar a homologação.</div>
          </div>
          <Button variant="neutral" size="md" style={{ background:'#fff', color:'#ea580c', flexShrink:0 }} onClick={() => navigate('/fornecedor/planos')}>
            Ver Planos →
          </Button>
        </div>
      )}
      {docsMissing > 0 && supplier?.sealStatus === 'ACTIVE' && (
        <div style={{ background:'rgba(239,68,68,.08)', border:'1px solid rgba(239,68,68,.25)', borderRadius:14, padding:'14px 20px', marginBottom:20, display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
          <span style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, color:'#dc2626' }}>
            ⚠ {docsMissing} documento(s) pendente(s) — Seu Selo pode ser suspenso.
          </span>
          <Button variant="danger" size="sm" onClick={() => navigate('/fornecedor/documentos')}>Resolver agora</Button>
        </div>
      )}

      {/* ── KPIs ── */}
      <div style={{ display:'grid', gridTemplateColumns: mobile ? '1fr 1fr' : 'repeat(4,1fr)', gap:16, marginBottom:28 }}>
        <KpiCard label="Processos Ativos" value={processes.filter(p=>p.effStatus==='ACTIVE').length} sub={`de ${processes.length} total`} subColor="#9B9B9B" icon="🔄" iconBg="rgba(46,49,146,.1)" />
        <KpiCard label="Docs Válidos"     value={`${docsOk}/${totalDocs}`} sub={docsWarn>0?`${docsWarn} vencendo`:docsMissing>0?`${docsMissing} pendente${docsMissing>1?'s':''}`:'Em dia'} subColor={docsWarn>0||docsMissing>0?'#f59e0b':'#22c55e'} icon="📋" iconBg="rgba(34,197,94,.1)" />
        <KpiCard label="Em Análise"       value={docsPending} sub="Aguardando backoffice" subColor="#8b5cf6" icon="⏳" iconBg="rgba(139,92,246,.1)" />
        <KpiCard label="Plano"            value={supplier.activePlan?.type||'—'} sub={supplier.activePlan?`Válido até ${supplier.activePlan.ends_at?.slice(0,10)||'—'}`:'Sem plano ativo'} subColor={supplier.activePlan?'#22c55e':'#ef4444'} icon="⭐" iconBg="rgba(244,126,47,.1)" />
      </div>

      {/* ── Carteira de Selos ── */}
      <Card style={{ borderRadius:16, padding:'24px 28px', marginBottom:24 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <div>
            <SectionTitle>Carteira de Selos</SectionTitle>
            <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#64748b', marginTop:2 }}>
              {seals.filter(s=>s.status==='ACTIVE').length} selo{seals.filter(s=>s.status==='ACTIVE').length!==1?'s':''} ativo{seals.filter(s=>s.status==='ACTIVE').length!==1?'s':''}
            </div>
          </div>
          {supplier.sealLevel !== 'Premium' && (
            <Button variant="orange" size="sm" onClick={() => navigate('/fornecedor/planos')}>⭐ Upgrade Premium</Button>
          )}
        </div>
        {seals.length === 0 ? (
          <div style={{ textAlign:'center', padding:'28px 0', color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', fontSize:14 }}>
            <div style={{ fontSize:40, marginBottom:8 }}>🏅</div>
            Seus selos aparecerão aqui após completar a homologação
          </div>
        ) : (
          <div style={{ display:'flex', gap:24, flexWrap:'wrap', justifyContent: seals.length <= 3 ? 'flex-start' : 'space-around' }}>
            {processes.map((seal, i) => (
              <div key={seal.id || i} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8 }}>
                <div style={{ cursor:'pointer' }} onClick={() => navigate(`/fornecedor/processo/${seal.id}`)}>
                  <SealBadge seal={seal} size={mobile ? 'sm' : 'md'} showClient showScore />
                </div>
                {seal.effStatus === 'ACTIVE' && (
                  <button onClick={() => navigate(`/fornecedor/certificado/${seal.id}`)}
                    title="Abrir certificado de homologação para impressão"
                    style={{ display:'flex', alignItems:'center', gap:5, background:'rgba(184,134,11,.1)',
                      border:'1px solid rgba(184,134,11,.35)', borderRadius:20, padding:'4px 12px',
                      cursor:'pointer', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:10.5,
                      color:'#92600a', whiteSpace:'nowrap' }}>
                    🎓 Certificado disponível
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── Meus Processos ── */}
      <div style={{ marginBottom:28 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <div>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:16, color:'#1a1c5e' }}>
              Meus Processos de Homologação
            </div>
            <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#64748b', marginTop:2 }}>
              Acompanhe o status de cada processo em detalhe
            </div>
          </div>
          <Button variant="neutral" size="sm" onClick={() => navigate('/fornecedor/documentos')}>
            📋 Gerenciar Docs
          </Button>
        </div>

        {processes.length === 0 ? (
          <Card style={{ borderRadius:14, padding:'32px', textAlign:'center' }}>
            <div style={{ fontSize:36, marginBottom:8 }}>🔄</div>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:15, color:'#1a1c5e', marginBottom:6 }}>
              Nenhum processo iniciado
            </div>
            <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#9B9B9B' }}>
              Complete o cadastro e aguarde um convite de homologação
            </div>
          </Card>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns: mobile ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))', gap:16 }}>
            {processes.map((proc, i) => {
              const statusColor  = STATUS_COLORS[proc.effStatus] || '#9B9B9B'
              const statusLabel  = STATUS_LABELS[proc.effStatus] || proc.effStatus
              const scoreVal     = proc.score || 0
              return (
                <Card key={proc.id || i} style={{ borderRadius:14, padding:'20px 22px', display:'flex', flexDirection:'column', gap:12, border:`1px solid ${proc.effStatus==='ACTIVE'?'rgba(34,197,94,.2)':proc.effStatus==='SUSPENDED'?'rgba(245,158,11,.2)':'rgba(46,49,146,.1)'}` }}>
                  {/* Header do card */}
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                    <div>
                      <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:14, color:'#1a1c5e', lineHeight:1.2 }}>
                        {proc.name}
                      </div>
                      <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:12, color:'#64748b', marginTop:2 }}>
                        {proc.clientName}
                      </div>
                    </div>
                    <span style={{ fontSize:10, fontWeight:700, color:statusColor, background:`${statusColor}18`, padding:'3px 10px', borderRadius:20, fontFamily:'Montserrat,sans-serif', flexShrink:0 }}>
                      {statusLabel}
                    </span>
                  </div>

                  {/* Score */}
                  <div>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                      <span style={{ fontFamily:'DM Sans,sans-serif', fontSize:11, color:'#9B9B9B' }}>Score</span>
                      <span style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:11, color:'#1a1c5e' }}>{scoreVal}/100</span>
                    </div>
                    <ScoreBar score={scoreVal} />
                  </div>

                  {/* Docs resumo */}
                  <div style={{ display:'flex', gap:8 }}>
                    {[['✓',docsOk,'#22c55e'],['⏳',docsPending,'#f59e0b'],['✗',docsMissing,'#ef4444']].map(([icon,val,color],j) => (
                      <div key={j} style={{ flex:1, textAlign:'center', padding:'5px', borderRadius:8, background:`${color}10`, border:`1px solid ${color}22` }}>
                        <div style={{ fontSize:13 }}>{icon}</div>
                        <div style={{ fontSize:11, fontWeight:700, color, fontFamily:'Montserrat,sans-serif' }}>{val}</div>
                      </div>
                    ))}
                  </div>

                  {/* Datas e CTA */}
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div style={{ fontSize:10, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>
                      {proc.issued_at ? `Emitido ${proc.issued_at.slice(0,10)}` : proc.expires_at ? `Válido até ${proc.expires_at.slice(0,10)}` : 'Aguardando análise'}
                    </div>
                    <Button variant="primary" size="sm" onClick={() => navigate(`/fornecedor/processo/${proc.id}`)}>
                      Ver Processo →
                    </Button>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Documentos Recentes ── */}
      {docs.length > 0 && (
        <Card style={{ borderRadius:16, padding:'20px 24px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
            <SectionTitle>Documentos Recentes</SectionTitle>
            <Button variant="neutral" size="sm" onClick={() => navigate('/fornecedor/documentos')}>Ver todos →</Button>
          </div>
          <div style={{ display:'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr', gap:8 }}>
            {docs.slice(0,6).map((doc, i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 12px', borderRadius:10, background:DOC_BG[doc.status]||'#f8fffe', border:`1px solid ${DOC_BORDER[doc.status]||'#dcfce7'}` }}>
                <StatusDot status={doc.status} />
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:12, fontWeight:600, color:'#1a1c5e', fontFamily:'Montserrat,sans-serif', lineHeight:1.2 }}>{doc.label}</div>
                  <div style={{ fontSize:10, color:'#9B9B9B' }}>{doc.source==='AUTO'?'automático':'manual'}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
      {/* Modal de alerta: documentos vencidos / rejeitados */}
      {showAlertModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'#fff', borderRadius:20, padding:28, maxWidth:480, width:'100%', boxShadow:'0 24px 80px rgba(0,0,0,.3)' }}>
            <div style={{ fontSize:36, marginBottom:12, textAlign:'center' }}>⚠️</div>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:18, color:'#dc2626', marginBottom:6, textAlign:'center' }}>
              {alertDocs.length} documento{alertDocs.length !== 1 ? 's' : ''} precisam de atenção
            </div>
            <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#64748b', marginBottom:20, textAlign:'center' }}>
              Documentos vencidos ou rejeitados podem suspender seu Selo ELOS.
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:8, maxHeight:240, overflowY:'auto', marginBottom:20 }}>
              {alertDocs.map((doc, i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderRadius:10, background: doc.status === 'EXPIRED' ? 'rgba(239,68,68,.06)' : 'rgba(239,68,68,.04)', border:`1px solid ${doc.status==='EXPIRED'?'rgba(239,68,68,.25)':'rgba(239,68,68,.15)'}` }}>
                  <span style={{ fontSize:16 }}>{doc.status === 'EXPIRED' ? '🔴' : '🟡'}</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, fontWeight:600, color:'#1a1c5e' }}>{doc.label}</div>
                    <div style={{ fontSize:11, color: doc.status==='EXPIRED'?'#dc2626':'#d97706', fontFamily:'DM Sans,sans-serif' }}>
                      {doc.status === 'EXPIRED' ? 'Vencido' : 'Rejeitado'}
                      {doc.expires_at ? ` · ${doc.expires_at.slice(0,10)}` : ''}
                      {doc.review_note ? ` · ${doc.review_note}` : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => setShowAlertModal(false)}
                style={{ flex:1, padding:'11px', borderRadius:10, border:'1px solid #e2e4ef', background:'#fff', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#64748b' }}>
                Ver depois
              </button>
              <button onClick={() => { setShowAlertModal(false); navigate('/fornecedor/documentos') }}
                style={{ flex:2, padding:'11px', borderRadius:10, border:'none', background:'#dc2626', cursor:'pointer', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, color:'#fff' }}>
                Regularizar agora →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
