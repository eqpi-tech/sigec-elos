import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { adminApi } from '../../services/mockApi.js'
import { Badge, Button, Card, ScoreBar, StatusDot, Spinner, PageHeader, SectionTitle, EmptyState } from '../../components/ui.jsx'

const RISK_COLOR = { Alto:'#ef4444', Médio:'#f59e0b', Baixo:'#22c55e' }

// ── Fila de análise ──────────────────────────────────────────────────────────
export function BackofficeQueue() {
  const navigate = useNavigate()
  const [queue, setQueue]   = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('Todos')

  useEffect(() => { adminApi.getQueue().then(setQueue).finally(() => setLoading(false)) }, [])

  const filtered = filter === 'Todos' ? queue : queue.filter(s => s.riskLevel === filter)

  if (loading) return <div style={{ display:'flex', justifyContent:'center', alignItems:'center', height:'50vh' }}><Spinner size={48} /></div>

  return (
    <div style={{ padding:'28px 32px', maxWidth:1100, margin:'0 auto' }}>
      <PageHeader title="Fila de Análise" subtitle={`${queue.length} fornecedores aguardando aprovação`} />

      {/* Filters */}
      <div style={{ display:'flex', gap:8, marginBottom:20 }}>
        {['Todos','Alto','Médio','Baixo'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ padding:'8px 16px', borderRadius:20, border:`1px solid ${filter===f?RISK_COLOR[f]||'#2E3192':'#e2e4ef'}`, background:filter===f?`${RISK_COLOR[f]||'#2E3192'}12`:'#fff', color:filter===f?RISK_COLOR[f]||'#2E3192':'#9B9B9B', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:12, cursor:'pointer', transition:'all .15s' }}>
            {f === 'Todos' ? `Todos (${queue.length})` : `Risco ${f} (${queue.filter(s=>s.riskLevel===f).length})`}
          </button>
        ))}
      </div>

      {filtered.length === 0
        ? <EmptyState icon="✅" title="Nenhum item pendente" subtitle="A fila está vazia para o filtro selecionado." />
        : filtered.map((s,i) => (
          <Card key={i} hover style={{ borderRadius:14, padding:'16px 20px', marginBottom:12 }}>
            <div style={{ display:'flex', alignItems:'center', gap:16 }}>
              <div style={{ width:48, height:48, borderRadius:12, background:'rgba(46,49,146,.1)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:18, color:'#2E3192', fontFamily:'Montserrat,sans-serif', flexShrink:0 }}>{s.razaoSocial[0]}</div>
              <div style={{ flex:1 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ fontSize:15, fontWeight:700, color:'#1a1c5e', fontFamily:'Montserrat,sans-serif' }}>{s.razaoSocial}</div>
                  <span style={{ fontSize:10, fontWeight:700, color:RISK_COLOR[s.riskLevel], background:`${RISK_COLOR[s.riskLevel]}18`, padding:'2px 10px', borderRadius:20, fontFamily:'Montserrat,sans-serif' }}>Risco {s.riskLevel}</span>
                </div>
                <div style={{ fontSize:12, color:'#9B9B9B', marginTop:2 }}>{s.cnpj} · Solicitado em {s.requestedAt}</div>
                <div style={{ display:'flex', gap:12, marginTop:6, alignItems:'center' }}>
                  <div style={{ width:160 }}><ScoreBar score={s.score||0} /></div>
                  <span style={{ fontSize:11, color:'#9B9B9B' }}>{s.documents?.filter(d=>d.status==='VALID').length || 0}/{s.documents?.length || 0} docs válidos</span>
                </div>
              </div>
              <Button variant="primary" size="md" onClick={() => navigate(`/backoffice/analise/${s.id}`)}>Analisar →</Button>
            </div>
          </Card>
        ))
      }
    </div>
  )
}

// ── Análise individual do fornecedor ────────────────────────────────────────
export function BackofficeAnalysis() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [level, setLevel]     = useState('Simples')
  const [obs, setObs]         = useState('')
  const [done, setDone]       = useState(null)
  const [processing, setProcessing] = useState(false)

  useEffect(() => { adminApi.getSealAnalysis(id).then(setData).finally(() => setLoading(false)) }, [id])

  const handleApprove = async () => {
    setProcessing(true)
    await adminApi.approveSeal(id, level)
    setDone('approved')
    setProcessing(false)
  }
  const handleReject = async () => {
    if (!obs) { alert('Informe o motivo da rejeição'); return }
    setProcessing(true)
    await adminApi.rejectSeal(id, obs)
    setDone('rejected')
    setProcessing(false)
  }

  if (loading) return <div style={{ display:'flex', justifyContent:'center', alignItems:'center', height:'50vh' }}><Spinner size={48} /></div>
  if (!data) return null

  const docs = data.documents || []
  const ok   = docs.filter(d=>d.status==='VALID').length
  const miss = docs.filter(d=>['MISSING','EXPIRED'].includes(d.status)).length

  if (done) return (
    <div style={{ maxWidth:600, margin:'80px auto', padding:24, textAlign:'center' }}>
      <div style={{ fontSize:64, marginBottom:16 }}>{done==='approved'?'✅':'❌'}</div>
      <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:22, color:'#1a1c5e', marginBottom:8 }}>
        {done==='approved' ? `Selo ELOS ${level} emitido com sucesso!` : 'Solicitação rejeitada'}
      </div>
      <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:15, color:'#9B9B9B', marginBottom:24 }}>
        {done==='approved' ? `O fornecedor ${data.razaoSocial} agora está visível no marketplace.` : `Motivo registrado: "${obs}"`}
      </div>
      <Button variant="primary" onClick={() => navigate('/backoffice/fila')}>← Voltar à fila</Button>
    </div>
  )

  return (
    <div style={{ maxWidth:980, margin:'0 auto', padding:'24px' }}>
      <button onClick={() => navigate('/backoffice/fila')} style={{ background:'none', border:'none', cursor:'pointer', color:'#2E3192', fontSize:14, fontFamily:'DM Sans,sans-serif', fontWeight:600, marginBottom:16, display:'flex', alignItems:'center', gap:6, padding:0 }}>← Voltar à fila</button>

      <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:20 }}>
        {/* Left: supplier data */}
        <div>
          {/* Header */}
          <Card style={{ borderRadius:16, padding:'20px 24px', marginBottom:16 }}>
            <div style={{ display:'flex', gap:16, alignItems:'center', marginBottom:16 }}>
              <div style={{ width:56, height:56, borderRadius:14, background:'rgba(46,49,146,.1)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:22, color:'#2E3192', fontFamily:'Montserrat,sans-serif' }}>{data.razaoSocial[0]}</div>
              <div>
                <div style={{ fontSize:18, fontWeight:800, color:'#1a1c5e', fontFamily:'Montserrat,sans-serif' }}>{data.razaoSocial}</div>
                <div style={{ fontSize:13, color:'#9B9B9B' }}>{data.cnpj} · {data.city}, {data.state}</div>
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
              {[['CNAE',data.cnaeMain],['Colaboradores',data.employeeRange||'—'],['Faturamento',data.revenueRange||'—']].map(([l,v])=>(
                <div key={l} style={{ padding:'10px', background:'rgba(46,49,146,.04)', borderRadius:10 }}>
                  <div style={{ fontSize:10, color:'#9B9B9B', fontFamily:'Montserrat,sans-serif', textTransform:'uppercase', letterSpacing:.5 }}>{l}</div>
                  <div style={{ fontSize:13, fontWeight:700, color:'#1a1c5e', marginTop:2 }}>{v}</div>
                </div>
              ))}
            </div>
          </Card>

          {/* Documents checklist */}
          <Card style={{ borderRadius:16, padding:'20px 24px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <SectionTitle>Checklist de Documentos</SectionTitle>
              <div style={{ display:'flex', gap:8, fontSize:12 }}>
                <span style={{ color:'#22c55e' }}>✓ {ok} ok</span>
                {miss>0 && <span style={{ color:'#ef4444' }}>✕ {miss} pendente</span>}
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              {docs.map((doc,i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:10, background:doc.status==='VALID'?'#f8fffe':'#fff5f5', border:`1px solid ${doc.status==='VALID'?'#dcfce7':'#fee2e2'}` }}>
                  <StatusDot status={doc.status} />
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:12, fontWeight:600, color:'#1a1c5e', fontFamily:'Montserrat,sans-serif' }}>{doc.label}</div>
                    <div style={{ fontSize:10, color:'#9B9B9B' }}>{doc.source==='AUTO'?'Auto':'Manual'}{doc.expires?` · vence ${doc.expires}`:''}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Right: decision panel */}
        <div style={{ position:'sticky', top:80, alignSelf:'flex-start' }}>
          <Card style={{ borderRadius:16, padding:'20px 24px', border:'2px solid #e2e4ef' }}>
            <SectionTitle>Decisão de Homologação</SectionTitle>

            {/* Risk indicator */}
            <div style={{ padding:'12px', background:miss>0?'rgba(239,68,68,.08)':'rgba(34,197,94,.08)', borderRadius:10, border:`1px solid ${miss>0?'rgba(239,68,68,.2)':'rgba(34,197,94,.2)'}`, marginBottom:16, textAlign:'center' }}>
              <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, color:miss>0?'#dc2626':'#16a34a' }}>
                {miss>0 ? `⚠ ${miss} documento(s) pendente(s)` : '✅ Documentação completa'}
              </div>
              <div style={{ fontSize:11, color:'#9B9B9B', marginTop:2 }}>{ok} de {docs.length} documentos válidos</div>
            </div>

            {/* Seal level selector */}
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:12, fontFamily:'Montserrat,sans-serif', fontWeight:600, color:'#1a1c5e', marginBottom:8 }}>Nível do Selo</div>
              <div style={{ display:'flex', gap:8 }}>
                {['Simples','Premium'].map(l => (
                  <button key={l} onClick={() => setLevel(l)} style={{ flex:1, padding:'10px', borderRadius:10, border:`2px solid ${level===l?'#2E3192':'#e2e4ef'}`, background:level===l?'rgba(46,49,146,.08)':'#fff', color:level===l?'#2E3192':'#9B9B9B', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, cursor:'pointer', transition:'all .15s' }}>
                    {l === 'Premium' ? '⭐' : '🏷️'} {l}
                  </button>
                ))}
              </div>
            </div>

            {/* Observation */}
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:12, fontFamily:'Montserrat,sans-serif', fontWeight:600, color:'#1a1c5e', marginBottom:8 }}>Observação (obrigatório para rejeição)</div>
              <textarea value={obs} onChange={e=>setObs(e.target.value)} placeholder="Registre observações ou motivo de rejeição..." rows={3} style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#1a1c5e', resize:'vertical', boxSizing:'border-box' }} />
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              <Button variant="success" full size="lg" style={{ borderRadius:10 }} disabled={processing} onClick={handleApprove}>
                {processing ? '⏳...' : `✅ Aprovar Selo ${level}`}
              </Button>
              <Button variant="danger" full size="md" style={{ borderRadius:10 }} disabled={processing} onClick={handleReject}>
                ❌ Rejeitar Solicitação
              </Button>
              <Button variant="neutral" full size="sm" style={{ borderRadius:10 }}>📧 Solicitar Documentos</Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
