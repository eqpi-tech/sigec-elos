import { useState, useEffect, useCallback } from 'react'
import { useIsMobile } from '../../hooks/useIsMobile.js'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { supplierApi, documentApi, assertivaApi } from '../../services/api.js'
import { supabase } from '../../lib/supabase.js'
import { Badge, Seal, Button, Card, KpiCard, ScoreBar, StatusDot, Spinner, PageHeader, SectionTitle } from '../../components/ui.jsx'

const SCORE_CLASS_COLOR = { A:'#22c55e', B:'#84cc16', C:'#f59e0b', D:'#fb923c', E:'#ef4444', F:'#dc2626' }
const SCORE_CLASS_LABEL = { A:'Excelente', B:'Bom', C:'Médio', D:'Baixo', E:'Alto risco', F:'Altíssimo risco' }

function AssertivaCard({ report, loading, error, onGenerate }) {
  const resposta = report?.report_data?.resposta || report?.resposta
  const cabecalho = report?.report_data?.cabecalho || report?.cabecalho
  const score = resposta?.score
  const protestos = resposta?.protestosPublicos
  const scoreColor = score?.classe ? SCORE_CLASS_COLOR[score.classe] || '#9B9B9B' : '#9B9B9B'

  return (
    <Card style={{ borderRadius:16, padding:'20px 24px', border:'1px solid rgba(46,49,146,.15)' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:'#9B9B9B', fontFamily:'Montserrat,sans-serif', textTransform:'uppercase', letterSpacing:.5, marginBottom:2 }}>Análise Assertiva</div>
          <div style={{ fontSize:13, fontWeight:700, color:'#1a1c5e', fontFamily:'Montserrat,sans-serif' }}>Análise Restritiva PJ</div>
        </div>
        {report && (
          <span style={{ fontSize:10, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>
            {new Date(report.generated_at).toLocaleDateString('pt-BR')}
          </span>
        )}
      </div>

      {!report && !loading && (
        <div>
          <div style={{ fontSize:12, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', marginBottom:12, lineHeight:1.5 }}>
            Gere o relatório de análise de crédito e restrições da sua empresa para facilitar a aprovação em categorias que exigem esse documento.
          </div>
          {error && <div style={{ fontSize:12, color:'#dc2626', fontFamily:'DM Sans,sans-serif', marginBottom:8 }}>⚠ {error}</div>}
          <Button variant="primary" full onClick={onGenerate}>
            📊 Gerar Relatório Assertiva
          </Button>
        </div>
      )}

      {loading && (
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8, padding:'12px 0' }}>
          <Spinner size={28}/>
          <div style={{ fontSize:12, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>Consultando Assertiva...</div>
        </div>
      )}

      {report && !loading && score && (
        <div>
          {/* Score */}
          <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px', background:`${scoreColor}10`, borderRadius:10, border:`1px solid ${scoreColor}30`, marginBottom:10 }}>
            <div style={{ width:40, height:40, borderRadius:10, background:scoreColor, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:900, fontSize:20, fontFamily:'Montserrat,sans-serif', flexShrink:0 }}>
              {score.classe}
            </div>
            <div>
              <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, color:scoreColor }}>{SCORE_CLASS_LABEL[score.classe] || score.classe}</div>
              <div style={{ fontSize:11, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>
                {score.pontos} pontos · {score.faixa?.descricao || score.faixa?.titulo || ''}
              </div>
            </div>
          </div>

          {/* Protestos */}
          {protestos && (
            <div style={{ fontSize:11, color: protestos.qtdProtestos > 0 ? '#dc2626' : '#15803d', fontFamily:'DM Sans,sans-serif', marginBottom:8 }}>
              {protestos.qtdProtestos > 0
                ? `⚠ ${protestos.qtdProtestos} protesto(s) · R$ ${Number(protestos.valorTotal||0).toLocaleString('pt-BR', {minimumFractionDigits:2})}`
                : '✅ Sem protestos registrados'}
            </div>
          )}

          {error && <div style={{ fontSize:12, color:'#dc2626', fontFamily:'DM Sans,sans-serif', marginBottom:8 }}>⚠ {error}</div>}
          <Button variant="neutral" full size="sm" onClick={onGenerate}>
            ↺ Atualizar Relatório
          </Button>
        </div>
      )}
    </Card>
  )
}

export default function SupplierDashboard() {
  const mobile = useIsMobile()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [supplier,          setSupplier]          = useState(null)
  const [docs,              setDocs]              = useState([])
  const [loading,           setLoading]           = useState(true)
  const [assertivaReport,   setAssertivaReport]   = useState(undefined) // undefined=não carregado, null=sem relatório
  const [assertivaLoading,  setAssertivaLoading]  = useState(false)
  const [assertivaError,    setAssertivaError]    = useState('')

  const { pathname } = useLocation()

  const [requiredDocsCount, setRequiredDocsCount] = useState(0)

  const load = useCallback(async () => {
    if (!user?.supplierId) { setLoading(false); return }
    setLoading(true)
    try {
      const s = await supplierApi.me(user.supplierId)
      setSupplier(s)
      const d = await documentApi.list(user.supplierId)
      setDocs(d)
      // Busca contagem de documentos EXIGIDOS pelas categorias
      // para usar como denominador correto no KPI
      try {
        const { data: catRows } = await supabase
          .from('supplier_categories').select('category_id').eq('supplier_id', user.supplierId)
        if (catRows?.length) {
          const catIds = catRows.map(r => r.category_id)
          const { data: catDocs } = await supabase
            .from('category_documents').select('document_id').in('category_id', catIds)
          const unique = new Set((catDocs||[]).map(r => r.document_id))
          setRequiredDocsCount(unique.size)
        }
      } catch { /* não crítico */ }
      // Carrega último relatório Assertiva (silencioso — não bloqueia o dashboard)
      assertivaApi.getLast().then(setAssertivaReport).catch(() => setAssertivaReport(null))
    } finally { setLoading(false) }
  }, [user?.supplierId])

  // Recarrega quando supplierId muda (primeiro acesso após cadastro)
  // ou quando volta do plano-ativo
  useEffect(() => { load() }, [load])

  if (loading) return <div style={{ display:'flex', justifyContent:'center', alignItems:'center', height:'50vh' }}><Spinner size={48}/></div>

  // Fornecedor sem cadastro completo
  if (!user?.supplierId) return (
    <div style={{ padding:'60px 32px', textAlign:'center' }}>
      <div style={{ fontSize:64, marginBottom:16 }}>🏭</div>
      <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:22, color:'#1a1c5e', marginBottom:8 }}>Bem-vindo ao SIGEC-ELOS!</div>
      <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:15, color:'#9B9B9B', marginBottom:28, maxWidth:400, margin:'0 auto 28px' }}>
        Para aparecer no marketplace e iniciar a homologação, complete seu cadastro e escolha um plano.
      </div>
      <Button variant="orange" size="lg" style={{ borderRadius:12 }} onClick={() => navigate('/cadastro')}>
        Completar cadastro →
      </Button>
    </div>
  )

  const handleGenerateAssertiva = async () => {
    setAssertivaLoading(true)
    setAssertivaError('')
    try {
      const result = await assertivaApi.generate()
      setAssertivaReport(result.report)
    } catch(e) {
      setAssertivaError(e.message)
    }
    setAssertivaLoading(false)
  }

  const docsOk      = docs.filter(d => d.status === 'VALID').length
  const docsWarn    = docs.filter(d => d.status === 'EXPIRING').length
  const docsMissing = docs.filter(d => ['MISSING','REJECTED'].includes(d.status)).length
  const docsPending = docs.filter(d => d.status === 'PENDING').length
  const total4progress = requiredDocsCount || Math.max(docs.length, 1)
  const progress    = Math.round((docsOk / total4progress) * 100)
  const firstName   = user.name?.split(' ')[0] || 'Bem-vindo'
  const hour        = new Date().getHours()
  const greeting    = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'

  return (
    <div style={{ padding: mobile ? '16px' : '28px 32px', maxWidth:1200, margin:'0 auto' }}>
      <PageHeader
        title={`${greeting}, ${firstName}! 👋`}
        subtitle={`${supplier.razao_social} · CNPJ ${supplier.cnpj}`}
        action={supplier.sealLevel !== 'Premium' &&
          <Button variant="orange" onClick={() => navigate('/fornecedor/planos')}>⭐ Upgrade para Premium</Button>
        }
      />

      {/* Alert de documentos pendentes — só relevante se o selo já está ativo */}
      {docsMissing > 0 && supplier?.sealStatus === 'ACTIVE' && (
        <div className="fade-in-up" style={{ background:'rgba(239,68,68,.08)', border:'1px solid rgba(239,68,68,.25)', borderRadius:14, padding:'14px 20px', marginBottom:20, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, color:'#dc2626' }}>⚠ {docsMissing} documento(s) pendente(s) — Seu Selo pode ser suspenso.</span>
          <Button variant="danger" size="sm" onClick={() => navigate('/fornecedor/documentos')}>Resolver agora</Button>
        </div>
      )}

      {/* Status do plano */}
      {!supplier.activePlan && (
        <div className="fade-in-up" style={{ background:'linear-gradient(135deg,#F47E2F,#ff9a52)', borderRadius:14, padding:'16px 20px', marginBottom:20, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:14, color:'#fff' }}>Nenhum plano ativo</div>
            <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, color:'rgba(255,255,255,.8)' }}>Assine um plano para aparecer no marketplace e iniciar a homologação.</div>
          </div>
          <Button variant="neutral" size="md" style={{ background:'#fff', color:'#ea580c' }} onClick={() => navigate('/fornecedor/planos')}>
            Ver Planos →
          </Button>
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns: mobile ? '1fr 1fr' : 'repeat(4,1fr)', gap:16, marginBottom:24 }}>
        <KpiCard label="Nível Atual"     value={supplier.sealLevel || 'Simples'} sub={`Score: ${supplier.score || 0}/100`} subColor="#9B9B9B" icon="🏷️" iconBg="rgba(46,49,146,.1)" />
        <KpiCard label="Docs Válidos"    value={`${docsOk}/${requiredDocsCount||docs.length||'?'}`} sub={docsWarn>0?`${docsWarn} vencendo`:docsMissing>0?`${docsMissing} pendente${docsMissing>1?'s':''}`:'Em dia'} subColor={docsWarn>0||docsMissing>0?'#f59e0b':'#22c55e'} icon="📋" iconBg="rgba(34,197,94,.1)" />
        <KpiCard label="Em Análise"      value={docsPending} sub="Aguardando backoffice" subColor="#8b5cf6" icon="⏳" iconBg="rgba(139,92,246,.1)" />
        <KpiCard label="Status Seal"     value={supplier.sealStatus==='ACTIVE'?'Ativo':supplier.sealStatus==='PENDING'?'Pendente':'Inativo'} sub={`Nível ${supplier.sealLevel||'—'}`} subColor={supplier.sealStatus==='ACTIVE'?'#22c55e':'#f59e0b'} icon="✅" iconBg="rgba(34,197,94,.1)" />
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:20 }}>
        <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
          {/* Progress banner */}
          <div style={{ background:'linear-gradient(135deg,#2E3192,#3d40b5)', borderRadius:16, padding:'24px 28px', color:'#fff' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <div>
                <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:16 }}>Jornada para o Selo ELOS Premium</div>
                <div style={{ fontSize:13, color:'rgba(255,255,255,.65)', marginTop:2 }}>Complete os requisitos para liberar o marketplace</div>
              </div>
              <Seal level={supplier.sealLevel || 'Simples'} size={64} />
            </div>
            <div style={{ marginBottom:16 }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                <span style={{ fontSize:12, color:'rgba(255,255,255,.7)' }}>Progresso de documentação</span>
                <span style={{ fontWeight:700, fontFamily:'Montserrat,sans-serif' }}>{progress}%</span>
              </div>
              <div style={{ height:8, borderRadius:8, background:'rgba(255,255,255,.15)', overflow:'hidden' }}>
                <div style={{ width:`${progress}%`, height:'100%', borderRadius:8, background:'linear-gradient(90deg,#F47E2F,#ff9a52)', transition:'width .8s' }} />
              </div>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              {[{l:'Cadastro',d:true},{l:'Plano',d:!!supplier.plans?.length},{l:'Documentos',d:docsOk>0&&docsMissing===0},{l:'Aprovação',d:supplier.sealStatus==='ACTIVE'}].map((s,i)=>(
                <div key={i} style={{ flex:1, textAlign:'center', padding:'8px 6px', borderRadius:8, background:s.d?'rgba(255,255,255,.15)':'rgba(255,255,255,.06)', border:s.d?'1px solid rgba(255,255,255,.2)':'1px solid rgba(255,255,255,.08)' }}>
                  <div style={{ fontSize:14 }}>{s.d?'✅':'⏳'}</div>
                  <div style={{ fontSize:9, fontFamily:'Montserrat,sans-serif', fontWeight:600, marginTop:2, color:s.d?'#fff':'rgba(255,255,255,.4)' }}>{s.l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Docs preview */}
          {/* Msg de contexto quando em fase de homologação */}
          {supplier.sealStatus === 'PENDING' && docsMissing > 0 && (
            <div style={{ background:'rgba(46,49,146,.04)',border:'1px solid rgba(46,49,146,.1)',borderRadius:12,padding:'12px 16px',marginBottom:12,display:'flex',gap:10,alignItems:'center' }}>
              <span style={{ fontSize:20 }}>📋</span>
              <div>
                <div style={{ fontFamily:'Montserrat,sans-serif',fontWeight:700,fontSize:13,color:'#1a1c5e' }}>Documentação em andamento</div>
                <div style={{ fontSize:12,color:'#9B9B9B',fontFamily:'DM Sans,sans-serif' }}>{docsMissing} documento{docsMissing>1?'s':''} ainda pendente{docsMissing>1?'s':''} · Envie para agilizar a homologação</div>
              </div>
              <Button variant="orange" size="sm" style={{ marginLeft:'auto' }} onClick={()=>navigate('/fornecedor/documentos')}>Enviar →</Button>
            </div>
          )}
          {docs.length > 0 && (
            <Card style={{ borderRadius:16, padding:'20px 24px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
                <SectionTitle>Documentos Recentes</SectionTitle>
                <Button variant="neutral" size="sm" onClick={() => navigate('/fornecedor/documentos')}>Ver todos →</Button>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                {docs.slice(0,6).map((doc,i) => {
                  const colors = {VALID:'#f8fffe',EXPIRING:'#fffbeb',MISSING:'#fff5f5',PENDING:'#fff7ed',REJECTED:'#fff5f5'}
                  const borders = {VALID:'#dcfce7',EXPIRING:'#fef3c7',MISSING:'#fee2e2',PENDING:'#fed7aa',REJECTED:'#fee2e2'}
                  return (
                    <div key={i} style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 12px', borderRadius:10, background:colors[doc.status]||'#f8fffe', border:`1px solid ${borders[doc.status]||'#dcfce7'}` }}>
                      <StatusDot status={doc.status} />
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:12, fontWeight:600, color:'#1a1c5e', fontFamily:'Montserrat,sans-serif', lineHeight:1.2 }}>{doc.label}</div>
                        <div style={{ fontSize:10, color:'#9B9B9B' }}>{doc.source==='AUTO'?'auto':'manual'}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>
          )}
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          {/* Score */}
          <Card style={{ borderRadius:16, padding:'20px 24px' }}>
            <SectionTitle>Score de Conformidade</SectionTitle>
            <div style={{ textAlign:'center', marginBottom:12 }}>
              <div style={{ fontSize:48, fontWeight:900, color:supplier.score>=70?'#22c55e':supplier.score>=50?'#f59e0b':'#ef4444', fontFamily:'Montserrat,sans-serif', lineHeight:1 }}>{supplier.score||0}</div>
              <div style={{ fontSize:12, color:'#9B9B9B' }}>de 100 pontos</div>
            </div>
            <ScoreBar score={supplier.score||0} />
          </Card>

          {/* Ações rápidas */}
          <Card style={{ borderRadius:16, padding:'20px 24px' }}>
            <SectionTitle>Ações Rápidas</SectionTitle>
            {[['📋','Enviar Documentos','/fornecedor/documentos'],['⭐','Ver Planos','/fornecedor/planos']].map(([icon,label,path],i)=>(
              <button key={i} onClick={()=>navigate(path)} style={{ display:'flex', alignItems:'center', gap:10, width:'100%', background:'rgba(46,49,146,.05)', border:'1px solid rgba(46,49,146,.1)', color:'#2E3192', borderRadius:10, padding:'10px 14px', fontFamily:'DM Sans,sans-serif', fontSize:13, fontWeight:600, cursor:'pointer', marginBottom:8, textAlign:'left', transition:'all .15s' }}>
                <span>{icon}</span> {label}
              </button>
            ))}
          </Card>

          {/* Info do plano */}
          {supplier.activePlan && (
            <Card style={{ borderRadius:16, padding:'20px 24px', background:'rgba(46,49,146,.03)', border:'1px solid rgba(46,49,146,.1)' }}>
              <div style={{ fontSize:11, fontWeight:600, color:'#9B9B9B', fontFamily:'Montserrat,sans-serif', textTransform:'uppercase', letterSpacing:.5, marginBottom:8 }}>Plano Ativo</div>
              <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:16, color:'#1a1c5e' }}>{supplier.activePlan.type}</div>
              <div style={{ fontSize:12, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', marginTop:4 }}>
                Válido até: {supplier.activePlan.ends_at?.slice(0,10) || '—'}
              </div>
            </Card>
          )}

          {/* Relatório Assertiva */}
          <AssertivaCard
            report={assertivaReport}
            loading={assertivaLoading}
            error={assertivaError}
            onGenerate={handleGenerateAssertiva}
          />
        </div>
      </div>
    </div>
  )
}
