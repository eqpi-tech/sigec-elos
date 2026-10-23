// Demo · Dashboard do fornecedor — espelha src/pages/supplier/Dashboard.jsx
// (saudação pela hora, carteira de selos com o SealBadge real, KPIs e
// processos). Mesmos documentos da ficha do processo (DemoFichaKit).
import { Card, KpiCard, ScoreBar, StatusDot, Button, SectionTitle } from '../../components/ui.jsx'
import SealBadge from '../../components/SealBadge.jsx'
import { planName, planCycle } from '../../lib/planLabels.js'
import { DEMO_SUPPLIER, DEMO_SEALS, fmtBR, SCORE_NOTE } from './demoData.js'
import { FICHA, effStatus, DOC_STATUS } from './DemoFichaKit.jsx'

const DOCS = FICHA.docs.filter(d => !d.soEqpi)   // Inscrição Estadual fica com a EQPI
const OK = ['VALID', 'EXPIRING']
const STATUS_C = { ACTIVE:'#22c55e', PENDING:'#f59e0b', SUSPENDED:'#f59e0b', EXPIRED:'#9B9B9B' }
const STATUS_L = { ACTIVE:'Ativo', PENDING:'Em análise', SUSPENDED:'Suspenso', EXPIRED:'Expirado' }
const cnt = (docs) => {
  const st = docs.map(effStatus)
  return { ok: st.filter(s => OK.includes(s)).length, pend: st.filter(s => s === 'PENDING').length, miss: st.filter(s => ['MISSING', 'REJECTED', 'EXPIRED'].includes(s)).length }
}

export default function DemoSupplierDashboard({ navigate }) {
  const s = DEMO_SUPPLIER
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'
  const scoreC = s.score >= 70 ? '#22c55e' : s.score >= 50 ? '#f59e0b' : '#ef4444'
  const all = cnt(DOCS)
  const docsWarn = DOCS.filter(d => effStatus(d) === 'EXPIRING').length
  const processos = DEMO_SEALS.map(seal => ({ ...seal, cnt: cnt(seal.reqIds ? DOCS.filter(d => seal.reqIds.includes(d.id)) : DOCS) }))
  const ativos = DEMO_SEALS.filter(x => x.status === 'ACTIVE').length

  return (
    <div style={{ padding:'28px 32px', maxWidth:1200, margin:'0 auto' }}>
      {/* ── Header ── */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:24, flexWrap:'wrap', gap:12 }}>
        <div>
          <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:24, color:'#1a1c5e' }}>{greeting}, Lucas! 👋</div>
          <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#9B9B9B', marginTop:2 }}>{s.razao_social} · CNPJ {s.cnpj}</div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:12, flexShrink:0 }} title={SCORE_NOTE}>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:11, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>Score geral</div>
            <div style={{ fontSize:22, fontWeight:900, color:scoreC, fontFamily:'Montserrat,sans-serif', lineHeight:1 }}>
              {s.score}<span style={{ fontSize:13, color:'#9B9B9B', fontWeight:400 }}>/100</span>
            </div>
          </div>
          <div style={{ width:80 }}><ScoreBar score={s.score}/></div>
        </div>
      </div>

      {/* ── Alertas ── */}
      <div style={{ background:'rgba(46,49,146,.06)', border:'1px solid rgba(46,49,146,.2)', borderRadius:14, padding:'16px 20px', marginBottom:14, display:'flex', alignItems:'center', gap:14, flexWrap:'wrap' }}>
        <div style={{ fontSize:28, lineHeight:1 }}>✅</div>
        <div style={{ flex:1, minWidth:220 }}>
          <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:14, color:'#1a1c5e' }}>Documentos enviados — sua homologação com a Horizonte Mineração está em análise</div>
          <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#64748b', marginTop:2 }}>Na fila desde {fmtBR(FICHA.naFilaDesde)}. Prazo padrão de 3 dias úteis por documento; você será avisado por e-mail quando houver resultado.</div>
        </div>
        <Button variant="neutral" size="sm" onClick={() => navigate('documentos')}>Ver meus documentos</Button>
      </div>
      {all.miss > 0 && (
        <div style={{ background:'rgba(239,68,68,.08)', border:'1px solid rgba(239,68,68,.25)', borderRadius:14, padding:'14px 20px', marginBottom:20, display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
          <span style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, color:'#dc2626' }}>⚠ {all.miss} documento(s) pendente(s) — Seu Selo pode ser suspenso.</span>
          <Button variant="danger" size="sm" onClick={() => navigate('documentos')}>Resolver agora</Button>
        </div>
      )}

      {/* ── KPIs ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))', gap:16, marginBottom:28 }}>
        <KpiCard label="Processos Ativos" value={ativos} sub={`de ${DEMO_SEALS.length} total`} subColor="#9B9B9B" icon="🔄" iconBg="rgba(46,49,146,.1)" />
        <KpiCard label="Docs Válidos" value={`${all.ok}/${DOCS.length}`} sub={docsWarn > 0 ? `${docsWarn} vencendo` : all.miss > 0 ? `${all.miss} pendente${all.miss > 1 ? 's' : ''}` : 'Em dia'} subColor={docsWarn > 0 || all.miss > 0 ? '#f59e0b' : '#22c55e'} icon="📋" iconBg="rgba(34,197,94,.1)" />
        <KpiCard label="Em Análise" value={all.pend} sub="Aguardando backoffice" subColor="#8b5cf6" icon="⏳" iconBg="rgba(139,92,246,.1)" />
        <KpiCard label="Plano" value={planName(s.activePlan.type)} sub={`${planCycle(s.activePlan.type)} · Válido até ${fmtBR(s.activePlan.ends_at)}`} subColor="#22c55e" icon="⭐" iconBg="rgba(244,126,47,.1)" />
      </div>

      {/* ── Carteira de Selos ── */}
      <Card style={{ borderRadius:16, padding:'24px 28px', marginBottom:24 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20, gap:10, flexWrap:'wrap' }}>
          <div>
            <SectionTitle>Carteira de Selos</SectionTitle>
            <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#64748b', marginTop:2 }}>{ativos} selo{ativos !== 1 ? 's' : ''} ativo{ativos !== 1 ? 's' : ''}</div>
          </div>
          <Button variant="orange" size="sm" onClick={() => navigate('planos')}>⭐ Ver planos</Button>
        </div>
        <div style={{ display:'flex', gap:24, flexWrap:'wrap' }}>
          {DEMO_SEALS.map(seal => (
            <div key={seal.id} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8 }}>
              <div style={{ cursor:'pointer' }} onClick={() => navigate(seal.client_id ? 'processo' : 'certificado')}>
                <SealBadge seal={seal} size="md" showClient showScore/>
              </div>
              {seal.status === 'ACTIVE' && (
                <button onClick={() => navigate('certificado')} title="Abrir certificado de homologação para impressão"
                  style={{ display:'flex', alignItems:'center', gap:5, background:'rgba(184,134,11,.1)', border:'1px solid rgba(184,134,11,.35)', borderRadius:20, padding:'4px 12px', cursor:'pointer', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:10.5, color:'#92600a', whiteSpace:'nowrap' }}>
                  🎓 Certificado disponível
                </button>
              )}
            </div>
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
          {processos.map(proc => {
            const sc = STATUS_C[proc.status] || '#9B9B9B'
            return (
              <Card key={proc.id} style={{ borderRadius:14, padding:'20px 22px', display:'flex', flexDirection:'column', gap:12, border:`1px solid ${proc.status==='ACTIVE'?'rgba(34,197,94,.2)':'rgba(46,49,146,.1)'}` }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                  <div>
                    <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:14, color:'#1a1c5e', lineHeight:1.2 }}>{proc.name}</div>
                    <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:12, color:'#64748b', marginTop:2 }}>{proc.clientName}</div>
                  </div>
                  <span style={{ fontSize:10, fontWeight:700, color:sc, background:`${sc}18`, padding:'3px 10px', borderRadius:20, fontFamily:'Montserrat,sans-serif', flexShrink:0 }}>{STATUS_L[proc.status]}</span>
                </div>
                <div>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                    <span style={{ fontFamily:'DM Sans,sans-serif', fontSize:11, color:'#9B9B9B' }}>Score</span>
                    <span style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:11, color:'#1a1c5e' }}>{proc.score}/100</span>
                  </div>
                  <ScoreBar score={proc.score}/>
                </div>
                <div style={{ display:'flex', gap:8 }}>
                  {[['✓', proc.cnt.ok, '#22c55e'], ['⏳', proc.cnt.pend, '#f59e0b'], ['✗', proc.cnt.miss, '#ef4444']].map(([icon, val, color], j) => (
                    <div key={j} style={{ flex:1, textAlign:'center', padding:5, borderRadius:8, background:`${color}10`, border:`1px solid ${color}22` }}>
                      <div style={{ fontSize:13 }}>{icon}</div>
                      <div style={{ fontSize:11, fontWeight:700, color, fontFamily:'Montserrat,sans-serif' }}>{val}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div style={{ fontSize:10, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>
                    {proc.expires_at ? `Válido até ${fmtBR(proc.expires_at)}` : 'Aguardando análise'}
                  </div>
                  <Button variant="primary" size="sm" onClick={() => navigate(proc.client_id ? 'processo' : 'certificado')}>{proc.client_id ? 'Ver Processo →' : 'Ver Certificado →'}</Button>
                </div>
              </Card>
            )
          })}
        </div>
        <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:11.5, color:'#9B9B9B', marginTop:10 }}>ℹ️ {SCORE_NOTE}</div>
      </div>

      {/* ── Documentos Recentes ── */}
      <Card style={{ borderRadius:16, padding:'20px 24px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <SectionTitle>Documentos Recentes</SectionTitle>
          <Button variant="neutral" size="sm" onClick={() => navigate('documentos')}>Ver todos →</Button>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))', gap:8 }}>
          {[...DOCS].filter(d => d.sent).sort((a, b) => b.sent.localeCompare(a.sent)).slice(0, 6).map(doc => {
            const st = effStatus(doc); const cfg = DOC_STATUS[st] || DOC_STATUS.MISSING
            return (
              <div key={doc.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 12px', borderRadius:10, background:cfg.bg, border:`1px solid ${cfg.bd}` }}>
                <StatusDot status={st}/>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:12, fontWeight:600, color:'#1a1c5e', fontFamily:'Montserrat,sans-serif', lineHeight:1.2 }}>{doc.label}</div>
                  <div style={{ fontSize:10, color:'#9B9B9B' }}>{cfg.label} · {doc.source === 'AUTO' ? 'automático' : 'manual'} · enviado {fmtBR(doc.sent)}</div>
                </div>
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}
