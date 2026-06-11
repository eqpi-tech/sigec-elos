import { useState } from 'react'
import { Card, KpiCard, ScoreBar, Button } from '../../components/ui.jsx'
import { DEMO_FORNECEDOR, DEMO_PROCESSES } from './demoData.js'

const STATUS_COLORS = { ACTIVE:'#22c55e', PENDING:'#f59e0b', SUSPENDED:'#f59e0b', EXPIRED:'#9B9B9B' }
const STATUS_LABELS = { ACTIVE:'Ativo', PENDING:'Em análise', SUSPENDED:'Suspenso', EXPIRED:'Expirado' }

export default function FornecedorView() {
  const [screen, setScreen] = useState('dashboard')
  const f = DEMO_FORNECEDOR
  const scoreColor = f.score >= 90 ? '#22c55e' : f.score >= 70 ? '#f59e0b' : '#ef4444'

  if (screen === 'perfil') {
    return (
      <div>
        {/* Navy header */}
        <div style={{ background:'#1a1c5e', borderRadius:14, padding:'20px 18px', marginBottom:14 }}>
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14 }}>
            <div style={{ width:50, height:50, borderRadius:12, background:'#F47E2F', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:24, color:'#fff', flexShrink:0 }}>P</div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:15, color:'#fff', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{f.razaoSocial}</div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,.5)', marginTop:2 }}>{f.cnpj} · {f.cidade}/{f.uf}</div>
            </div>
            <div style={{ textAlign:'right', flexShrink:0 }}>
              <div style={{ fontSize:11, color:'rgba(255,255,255,.5)', fontFamily:'DM Sans,sans-serif' }}>Score</div>
              <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:26, color:scoreColor, lineHeight:1 }}>{f.score}</div>
            </div>
          </div>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            <span style={{ background:'rgba(244,126,47,.28)', border:'1px solid rgba(244,126,47,.55)', borderRadius:20, padding:'3px 12px', fontSize:10, color:'#F47E2F', fontFamily:'Montserrat,sans-serif', fontWeight:700 }}>{f.seloStatus}</span>
            <span style={{ background:'rgba(255,255,255,.1)', borderRadius:20, padding:'3px 12px', fontSize:10, color:'rgba(255,255,255,.7)', fontFamily:'DM Sans,sans-serif' }}>{f.categoria}</span>
            <span style={{ background:'rgba(255,255,255,.1)', borderRadius:20, padding:'3px 12px', fontSize:10, color:'rgba(255,255,255,.7)', fontFamily:'DM Sans,sans-serif' }}>Membro desde {f.membroDesde}</span>
          </div>
        </div>

        {/* 2-col: docs + conformidade */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
          <Card style={{ padding:'14px 12px', borderRadius:12 }}>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:10, color:'#9B9B9B', letterSpacing:1, textTransform:'uppercase', marginBottom:10 }}>Docs validados</div>
            {f.documentos.map(doc => (
              <div key={doc.nome} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8 }}>
                <span style={{ color:doc.status==='VALID'?'#22c55e':'#f59e0b', fontWeight:700, fontSize:13, flexShrink:0 }}>{doc.status==='VALID'?'✓':'⏳'}</span>
                <span style={{ fontSize:11, color:'#333', fontFamily:'DM Sans,sans-serif', lineHeight:1.3 }}>{doc.nome}</span>
              </div>
            ))}
          </Card>
          <Card style={{ padding:'14px 12px', borderRadius:12 }}>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:10, color:'#9B9B9B', letterSpacing:1, textTransform:'uppercase', marginBottom:10 }}>Conformidade</div>
            {['Regularidade fiscal','Reg. trabalhista','Sem sanções ativas','Simples Nacional'].map(item => (
              <div key={item} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8 }}>
                <span style={{ color:'#2E3192', fontSize:13, flexShrink:0 }}>🛡️</span>
                <span style={{ fontSize:11, color:'#333', fontFamily:'DM Sans,sans-serif', lineHeight:1.3 }}>{item}</span>
              </div>
            ))}
          </Card>
        </div>

        {/* Última verificação */}
        <div style={{ background:'rgba(34,197,94,.12)', border:'1px solid rgba(34,197,94,.33)', borderRadius:30, padding:'9px 16px', display:'flex', alignItems:'center', gap:8, marginBottom:18, fontSize:12, color:'#22c55e', fontFamily:'DM Sans,sans-serif' }}>
          <span>⚡</span> Última verificação automática: hoje, 09:14
        </div>

        {/* Botões */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
          <Button variant="neutral" onClick={() => setScreen('dashboard')}>← Voltar</Button>
          <Button variant="neutral" style={{ color:'#2E3192', border:'2px solid #2E3192' }}>Cotação</Button>
          <Button variant="orange">Homologar</Button>
        </div>
      </div>
    )
  }

  // Screen: dashboard
  return (
    <div>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
        <div>
          <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:20, color:'#1a1c5e' }}>Boa tarde, Lucas! 👋</div>
          <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#9B9B9B', marginTop:2 }}>{f.razaoSocial} · CNPJ {f.cnpj}</div>
        </div>
        <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4, flexShrink:0, marginLeft:8 }}>
          <div style={{ fontSize:11, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>Score geral</div>
          <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:22, color:scoreColor, lineHeight:1 }}>
            {f.score}<span style={{ fontSize:13, color:'#9B9B9B', fontWeight:400 }}>/100</span>
          </div>
          <div style={{ width:80 }}><ScoreBar score={f.score} /></div>
        </div>
      </div>

      {/* Alert: doc pendente */}
      <div style={{ background:'rgba(239,68,68,.08)', border:'1px solid rgba(239,68,68,.25)', borderRadius:14, padding:'12px 18px', marginBottom:20, display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
        <span style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, color:'#dc2626' }}>⚠ 1 documento pendente — Apólice de Seguro</span>
        <Button variant="danger" size="sm">Resolver</Button>
      </div>

      {/* KPIs 2×2 */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:22 }}>
        <KpiCard label="Processos Ativos" value={2}        sub="de 2 total"             icon="🔄" />
        <KpiCard label="Docs Válidos"     value="4/5"      sub="1 pendente" subColor="#f59e0b" icon="📋" iconBg="rgba(34,197,94,.1)" />
        <KpiCard label="Em Análise"       value={1}        sub="Aguardando backoffice"  subColor="#8b5cf6" icon="⏳" iconBg="rgba(139,92,246,.1)" />
        <KpiCard label="Plano"            value="Verificado" sub="Válido até Jan/2026" subColor="#22c55e" icon="⭐" iconBg="rgba(244,126,47,.1)" />
      </div>

      {/* Meus Processos */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
        <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:15, color:'#1a1c5e' }}>Meus Processos</div>
        <Button variant="neutral" size="sm">📋 Gerenciar Docs</Button>
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:12, marginBottom:20 }}>
        {DEMO_PROCESSES.map(proc => {
          const sColor = STATUS_COLORS[proc.status] || '#9B9B9B'
          const sLabel = STATUS_LABELS[proc.status] || proc.status
          return (
            <Card key={proc.id} style={{ borderRadius:14, padding:'18px 20px', border:`1px solid ${proc.status === 'ACTIVE' ? 'rgba(34,197,94,.2)' : 'rgba(46,49,146,.1)'}` }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
                <div>
                  <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:14, color:'#1a1c5e' }}>{proc.name}</div>
                  <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:12, color:'#64748b', marginTop:2 }}>{proc.client}</div>
                </div>
                <span style={{ fontSize:10, fontWeight:700, color:sColor, background:`${sColor}18`, padding:'3px 10px', borderRadius:20, fontFamily:'Montserrat,sans-serif', flexShrink:0 }}>
                  {sLabel}
                </span>
              </div>
              <div style={{ marginBottom:10 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                  <span style={{ fontFamily:'DM Sans,sans-serif', fontSize:11, color:'#9B9B9B' }}>Score</span>
                  <span style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:11, color:'#1a1c5e' }}>{proc.score}/100</span>
                </div>
                <ScoreBar score={proc.score} />
              </div>
              <div style={{ display:'flex', gap:8, marginBottom:10 }}>
                {[['✓', proc.docsOk, '#22c55e'], ['⏳', proc.docsPending, '#f59e0b'], ['✗', proc.docsMissing, '#ef4444']].map(([icon, val, color], j) => (
                  <div key={j} style={{ flex:1, textAlign:'center', padding:'5px', borderRadius:8, background:`${color}10`, border:`1px solid ${color}22` }}>
                    <div style={{ fontSize:13 }}>{icon}</div>
                    <div style={{ fontSize:11, fontWeight:700, color, fontFamily:'Montserrat,sans-serif' }}>{val}</div>
                  </div>
                ))}
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div style={{ fontSize:10, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>{proc.date}</div>
                <Button variant="primary" size="sm">Ver Processo →</Button>
              </div>
            </Card>
          )
        })}
      </div>

      {/* CTA */}
      <Button variant="orange" full onClick={() => setScreen('perfil')}>Ver meu perfil no marketplace →</Button>
    </div>
  )
}
