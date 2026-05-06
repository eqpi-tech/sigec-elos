import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminApi } from '../../services/api.js'
import { Button, Card, KpiCard, Spinner, PageHeader, SectionTitle } from '../../components/ui.jsx'

// ─── Donut Chart (SVG puro) ───────────────────────────────────────────────────
function DonutChart({ segments, size = 160 }) {
  const r    = size * 0.375
  const cx   = size / 2
  const cy   = size / 2
  const circ = 2 * Math.PI * r
  const total = segments.reduce((s, seg) => s + seg.count, 0)

  let cumulative = 0
  const rings = segments.map(seg => {
    const len = total > 0 ? (seg.count / total) * circ : 0
    const off = cumulative
    cumulative += len
    return { ...seg, len, off }
  })

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <g transform={`rotate(-90 ${cx} ${cy})`}>
        {total === 0 ? (
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f0f0f0" strokeWidth={18}/>
        ) : rings.map((seg, i) => (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none"
            stroke={seg.color} strokeWidth={18}
            strokeDasharray={`${seg.len} ${circ - seg.len}`}
            strokeDashoffset={-seg.off}
          />
        ))}
      </g>
      <text x={cx} y={cy - 8} textAnchor="middle" fill="#1a1c5e"
        fontSize={size * 0.18} fontWeight="800" fontFamily="Montserrat,sans-serif">{total}</text>
      <text x={cx} y={cy + size * 0.1} textAnchor="middle" fill="#9B9B9B"
        fontSize={size * 0.075} fontFamily="DM Sans,sans-serif">documentos</text>
    </svg>
  )
}

// ─── Exportar CSV ─────────────────────────────────────────────────────────────
function exportCsv(docs) {
  const today  = new Date(); today.setHours(0, 0, 0, 0)
  const todayE = new Date(); todayE.setHours(23, 59, 59, 999)

  const label = (d) => {
    const dt = new Date(d.expires_at)
    if (dt < today)  return 'Vencido'
    if (dt <= todayE) return 'Vence Hoje'
    return 'No Prazo'
  }

  const rows = [
    ['Fornecedor', 'CNPJ', 'Documento', 'Status', 'Vencimento', 'Situação'],
    ...docs.map(d => [
      d.suppliers?.razao_social || '—',
      d.suppliers?.cnpj || '—',
      d.label || '—',
      d.status || '—',
      d.expires_at?.slice(0, 10) || '—',
      label(d),
    ]),
  ]

  const csv  = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `farol-documentos-${new Date().toISOString().slice(0,10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Overview ─────────────────────────────────────────────────────────────────
export default function BackofficeOverview() {
  const navigate = useNavigate()
  const [metrics, setMetrics] = useState(null)
  const [queue,   setQueue]   = useState([])
  const [farol,   setFarol]   = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.allSettled([adminApi.getMetrics(), adminApi.getQueue(), adminApi.getDocumentFarol()])
      .then(([metricsRes, queueRes, farolRes]) => {
        setMetrics(metricsRes.status === 'fulfilled' ? metricsRes.value : {
          totalSuppliers:0, activeSeals:0, pendingAnalysis:0, mrrBrl:0, mrrGrowth:0,
          byPlan:{ Simples:{count:0,rev:0}, Premium:{count:0,rev:0} }, newThisMonth:0, churnRate:0,
        })
        setQueue(queueRes.status  === 'fulfilled' ? queueRes.value  : [])
        setFarol(farolRes.status  === 'fulfilled' ? farolRes.value  : null)
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ display:'flex',justifyContent:'center',alignItems:'center',height:'50vh' }}><Spinner size={48}/></div>

  const riskColor = { Alto:'#ef4444', Médio:'#f59e0b', Baixo:'#22c55e' }

  const farolSegments = farol ? [
    { label:'Vencidos',         count: farol.vencidos.length, color:'#ef4444' },
    { label:'Vencem hoje',      count: farol.hoje.length,     color:'#f59e0b' },
    { label:'Vencimento futuro',count: farol.futuro.length,   color:'#22c55e' },
  ] : []

  const atRisk = farol ? [...farol.vencidos, ...farol.hoje] : []

  return (
    <div style={{ padding:'28px 32px', maxWidth:1200, margin:'0 auto' }}>
      <PageHeader title="Painel Backoffice" subtitle="EQPI Tech · Ecossistema SIGEC-ELOS"
        action={<div style={{ display:'flex',gap:8 }}>
          <Button variant="neutral" onClick={()=>navigate('/backoffice/criar-usuario')}>+ Novo Usuário</Button>
          <Button variant="primary" onClick={()=>navigate('/backoffice/fila')}>Ver Fila</Button>
        </div>}/>

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16, marginBottom:24 }}>
        <KpiCard label="Fornecedores" value={metrics.totalSuppliers.toLocaleString()} sub={`+${metrics.newThisMonth} este mês`} subColor="#2E3192" icon="🏭" iconBg="rgba(46,49,146,.1)"/>
        <KpiCard label="Selos Ativos"  value={metrics.activeSeals.toLocaleString()}    sub="homologados"                          subColor="#22c55e" icon="✅" iconBg="rgba(34,197,94,.1)"/>
        <KpiCard label="MRR"           value={metrics.mrrBrl>0?`R$ ${(metrics.mrrBrl/1000).toFixed(1)}k`:'R$ 0'} sub={`+${metrics.mrrGrowth}% vs mês ant.`} subColor="#F47E2F" icon="💰" iconBg="rgba(244,126,47,.1)"/>
        <KpiCard label="Pendentes"     value={metrics.pendingAnalysis}                 sub="Aguardando análise"                   subColor="#f59e0b" icon="⏳" iconBg="rgba(245,158,11,.1)"/>
      </div>

      {/* ── Farol de Documentos ── */}
      {farol && (
        <Card style={{ borderRadius:16, padding:'20px 24px', marginBottom:20 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <SectionTitle style={{ marginBottom:0 }}>Farol de Documentos</SectionTitle>
              {(farol.vencidos.length > 0 || farol.hoje.length > 0) && (
                <span style={{ fontSize:11, fontWeight:700, color:'#dc2626', background:'rgba(239,68,68,.1)', padding:'2px 8px', borderRadius:20 }}>
                  ⚠ {farol.vencidos.length + farol.hoje.length} requerem atenção
                </span>
              )}
            </div>
            <Button variant="neutral" size="sm" onClick={() => exportCsv(farol.all)}>
              ⬇ Exportar CSV
            </Button>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'auto 1fr', gap:24, alignItems:'center' }}>
            {/* Donut + Legenda */}
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:12 }}>
              <DonutChart segments={farolSegments} size={160}/>
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {farolSegments.map(s => (
                  <div key={s.label} style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <div style={{ width:10, height:10, borderRadius:3, background:s.color, flexShrink:0 }}/>
                    <span style={{ fontSize:12, color:'#1a1c5e', fontFamily:'DM Sans,sans-serif' }}>
                      {s.label} <strong>({s.count})</strong>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Lista de documentos em risco */}
            <div>
              {atRisk.length === 0 ? (
                <div style={{ display:'flex', alignItems:'center', gap:10, padding:'16px', background:'rgba(34,197,94,.06)', border:'1px solid rgba(34,197,94,.2)', borderRadius:12 }}>
                  <span style={{ fontSize:24 }}>✅</span>
                  <div>
                    <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:14, color:'#15803d' }}>Nenhum documento vencido ou vencendo hoje</div>
                    <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:12, color:'#9B9B9B' }}>{farol.futuro.length} documento{farol.futuro.length !== 1 ? 's' : ''} com vencimento futuro</div>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ fontSize:11, fontWeight:700, color:'#9B9B9B', fontFamily:'Montserrat,sans-serif', textTransform:'uppercase', letterSpacing:.5, marginBottom:8 }}>
                    Documentos que requerem atenção
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                    {atRisk.slice(0, 6).map((d, i) => {
                      const isVencido = new Date(d.expires_at) < new Date().setHours(0,0,0,0)
                      return (
                        <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 12px', borderRadius:10, background: isVencido ? 'rgba(239,68,68,.05)' : 'rgba(245,158,11,.05)', border:`1px solid ${isVencido?'rgba(239,68,68,.2)':'rgba(245,158,11,.2)'}` }}>
                          <div style={{ width:8, height:8, borderRadius:4, background: isVencido?'#ef4444':'#f59e0b', flexShrink:0 }}/>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:12, fontWeight:700, color:'#1a1c5e', fontFamily:'Montserrat,sans-serif', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                              {d.suppliers?.razao_social || '—'}
                            </div>
                            <div style={{ fontSize:11, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>{d.label}</div>
                          </div>
                          <span style={{ fontSize:11, fontWeight:700, color: isVencido?'#dc2626':'#d97706', whiteSpace:'nowrap', fontFamily:'Montserrat,sans-serif' }}>
                            {isVencido ? 'Vencido' : 'Hoje'} · {d.expires_at?.slice(0,10)}
                          </span>
                        </div>
                      )
                    })}
                    {atRisk.length > 6 && (
                      <div style={{ fontSize:11, color:'#9B9B9B', textAlign:'center', fontFamily:'DM Sans,sans-serif', paddingTop:4 }}>
                        + {atRisk.length - 6} outros documentos com problemas
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* ── Grid Principal ── */}
      <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:20 }}>
        <Card style={{ borderRadius:16, padding:'20px 24px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
            <SectionTitle>Fila de Análise</SectionTitle>
            <Button variant="neutral" size="sm" onClick={()=>navigate('/backoffice/fila')}>Ver todos →</Button>
          </div>
          {queue.length === 0
            ? <div style={{ textAlign:'center', padding:'30px', color:'#9B9B9B' }}>✅ Fila vazia</div>
            : queue.slice(0, 4).map((s, i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:14, padding:'12px 14px', borderRadius:12, marginBottom:8, background:'#f4f5f9', border:'1px solid #e2e4ef' }}>
                <div style={{ width:40, height:40, borderRadius:10, background:'rgba(46,49,146,.1)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:16, color:'#2E3192', fontFamily:'Montserrat,sans-serif', flexShrink:0 }}>{s.razaoSocial?.[0]}</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:'#1a1c5e', fontFamily:'Montserrat,sans-serif', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.razaoSocial}</div>
                  <div style={{ fontSize:11, color:'#9B9B9B' }}>{s.cnpj}</div>
                </div>
                <span style={{ fontSize:10, fontWeight:700, color:riskColor[s.riskLevel], background:`${riskColor[s.riskLevel]}18`, padding:'2px 8px', borderRadius:20, fontFamily:'Montserrat,sans-serif', whiteSpace:'nowrap' }}>Risco {s.riskLevel}</span>
                <Button variant="primary" size="sm" onClick={()=>navigate(`/backoffice/analise/${s.id}`)}>Analisar</Button>
              </div>
            ))
          }
        </Card>

        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <Card style={{ borderRadius:16, padding:'20px 24px' }}>
            <SectionTitle>Receita por Plano</SectionTitle>
            {Object.entries(metrics.byPlan).map(([plan, d]) => (
              <div key={plan} style={{ marginBottom:14 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                  <span style={{ fontSize:13, fontWeight:600, color:'#1a1c5e' }}>{plan==='Premium'?'⭐':'🏷️'} {plan}</span>
                  <span style={{ fontSize:13, fontWeight:700, color:plan==='Premium'?'#ea580c':'#2E3192' }}>R$ {(d.rev/1000).toFixed(1)}k</span>
                </div>
                <div style={{ height:8, borderRadius:8, background:'#f4f5f9', overflow:'hidden' }}>
                  <div style={{ width:`${metrics.mrrBrl>0?(d.rev/metrics.mrrBrl*100):0}%`, height:'100%', background:plan==='Premium'?'#F47E2F':'#2E3192', borderRadius:8 }}/>
                </div>
              </div>
            ))}
          </Card>

          <div style={{ background:'linear-gradient(135deg,#2E3192,#3d40b5)', borderRadius:16, padding:'20px 24px', color:'#fff' }}>
            <SectionTitle style={{ color:'#fff', marginBottom:12 }}>Ações Rápidas</SectionTitle>
            {[
              ['⏳','Fila de Análise',   '/backoffice/fila'],
              ['🏅','Homologados',        '/backoffice/homologados'],
              ['📊','Métricas',           '/backoffice/metricas'],
              ['👤','Criar Usuário',      '/backoffice/criar-usuario'],
            ].map(([icon, label, path], idx) => (
              <button key={idx} onClick={()=>navigate(path)}
                style={{ display:'flex', alignItems:'center', gap:10, width:'100%', background:'rgba(255,255,255,.1)', border:'1px solid rgba(255,255,255,.15)', color:'#fff', borderRadius:10, padding:'10px 14px', fontFamily:'DM Sans,sans-serif', fontSize:13, fontWeight:600, cursor:'pointer', marginBottom:8, textAlign:'left', transition:'all .15s' }}>
                <span>{icon}</span> {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
