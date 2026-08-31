// Métricas — reformulada (31/08/2026) para o modelo atual:
//   · Visão Geral: KPIs reais (assinaturas Stripe, selos, fornecedores)
//   · Assinaturas: planos Stripe (pago × cupom/trial), renovações
//   · Subsidiados: relatório p/ o financeiro faturar os clientes
//     (seals.flow_id → preço subsidiado do fluxo; convite subsidiado)
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase.js'
import { Card, KpiCard, Spinner, PageHeader, SectionTitle, Button } from '../../components/ui.jsx'
import { planLabel, planName } from '../../lib/planLabels.js'

const font   = { fontFamily:'DM Sans,sans-serif' }
const titleF = { fontFamily:'Montserrat,sans-serif' }
const fmtBRL = v => v == null ? '—' : `R$ ${Number(v).toFixed(2).replace('.', ',')}`
const fmtD   = d => d ? new Date(d).toLocaleDateString('pt-BR') : '—'

async function fetchAllRows(build) {
  // PostgREST corta em 1000 — pagina sempre
  const all = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999)
    if (error) throw error
    all.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return all
}

function downloadCsv(filename, header, rows) {
  const esc = v => {
    const s = String(v ?? '')
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = '﻿' + [header, ...rows].map(r => r.map(esc).join(';')).join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type:'text/csv;charset=utf-8' }))
  const a = Object.assign(document.createElement('a'), { href:url, download:filename })
  a.click(); URL.revokeObjectURL(url)
}

const TabBtn = ({ active, onClick, children }) => (
  <button onClick={onClick} style={{ padding:'9px 18px', borderRadius:10, border:`1.5px solid ${active?'#2E3192':'#e2e4ef'}`,
    background:active?'#2E3192':'#fff', color:active?'#fff':'#64748b', ...titleF, fontWeight:700, fontSize:13, cursor:'pointer' }}>
    {children}
  </button>
)

// ── Aba 1: Visão Geral ─────────────────────────────────────────────────────
const SEAL_STATUS_PT = { ACTIVE:'Ativos', PENDING:'Pendentes', SUSPENDED:'Suspensos', EXPIRED:'Vencidos' }

function OverviewTab({ data }) {
  const { stripePlans, sealCounts, supplierCount, subsidized } = data
  const active = stripePlans.filter(p => p.status === 'ACTIVE')
  const mrr = active.reduce((s, p) => {
    const v = Number(p.price_yearly || 0)
    return s + (p.type?.includes('mensal') ? v : v / 12)
  }, 0)
  const paid   = active.filter(p => p.paidFlag)
  const coupon = active.filter(p => !p.paidFlag)
  const subsPendentes = subsidized.filter(r => r.status !== 'ACTIVE').length

  return (
    <>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16, marginBottom:24 }}>
        <KpiCard label="Assinaturas Stripe" value={active.length} sub={`${paid.length} pagas · ${coupon.length} cupom/trial`} subColor="#2E3192" icon="💳" iconBg="rgba(46,49,146,.1)"/>
        <KpiCard label="MRR (Stripe)" value={fmtBRL(mrr)} sub="Assinaturas ativas" subColor="#22c55e" icon="💰" iconBg="rgba(244,126,47,.1)"/>
        <KpiCard label="Homologações subsidiadas" value={subsidized.length} sub={subsPendentes ? `${subsPendentes} em processo` : 'faturáveis ao cliente'} subColor="#f59e0b" icon="🤝" iconBg="rgba(245,158,11,.1)"/>
        <KpiCard label="Fornecedores" value={supplierCount.toLocaleString('pt-BR')} sub={`${sealCounts.activeSuppliers.toLocaleString('pt-BR')} homologados`} subColor="#9B9B9B" icon="🏭" iconBg="rgba(46,49,146,.1)"/>
      </div>
      <Card style={{ borderRadius:16, padding:'20px 24px' }}>
        <SectionTitle>Selos por status</SectionTitle>
        <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginTop:8 }}>
          {Object.entries(sealCounts.byStatus).map(([st, v]) => (
            <div key={st} style={{ padding:'10px 18px', borderRadius:12, background:'#f8f9fc', textAlign:'center' }}>
              <div style={{ ...titleF, fontWeight:900, fontSize:20, color:'#1a1c5e' }}>{(v.processos||0).toLocaleString('pt-BR')}</div>
              <div style={{ ...font, fontSize:11, color:'#9B9B9B' }}>{SEAL_STATUS_PT[st] || st}</div>
              <div style={{ ...font, fontSize:10.5, color:'#c0c2d4' }}>{(v.fornecedores||0).toLocaleString('pt-BR')} fornecedores</div>
            </div>
          ))}
        </div>
        <div style={{ ...font, fontSize:11.5, color:'#9B9B9B', marginTop:10 }}>
          Um fornecedor pode ter mais de um processo (um por cliente) — por isso o nº de processos é maior que o de fornecedores.
        </div>
      </Card>
    </>
  )
}

// ── Aba 2: Assinaturas Stripe ──────────────────────────────────────────────
function SubscriptionsTab({ data }) {
  const { stripePlans } = data
  const soon = new Date(); soon.setDate(soon.getDate() + 30)
  return (
    <Card style={{ borderRadius:16, padding:'20px 24px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
        <SectionTitle>Assinaturas via Stripe</SectionTitle>
        <Button variant="neutral" size="sm" onClick={() => downloadCsv('assinaturas_elos.csv',
          ['Fornecedor','CNPJ','Plano','Status','Pagamento','Valor','Início','Fim','NFSe'],
          stripePlans.map(p => [p.supplier?.razao_social, p.supplier?.cnpj, planLabel(p.type) || p.type, p.status,
            p.paidFlag ? 'Pago' : 'Cupom/Trial', p.price_yearly ?? '', fmtD(p.starts_at), fmtD(p.ends_at), p.nfse || '']))}>
          ⬇️ CSV
        </Button>
      </div>
      {!stripePlans.length ? (
        <div style={{ ...font, fontSize:13, color:'#9B9B9B', padding:'20px 0' }}>Nenhuma assinatura Stripe ainda.</div>
      ) : (
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', ...font, fontSize:13 }}>
            <thead>
              <tr style={{ textAlign:'left', color:'#9B9B9B', ...titleF, fontSize:10, textTransform:'uppercase', letterSpacing:.5 }}>
                {['Fornecedor','Plano','Status','Pagamento','Valor','Vigência','NFSe'].map(h => <th key={h} style={{ padding:'8px 10px', borderBottom:'1px solid #e2e4ef' }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {stripePlans.map(p => {
                const expiring = p.status === 'ACTIVE' && p.ends_at && new Date(p.ends_at) < soon
                return (
                  <tr key={p.id} style={{ borderBottom:'1px solid #f1f2f8' }}>
                    <td style={{ padding:'10px', fontWeight:700, color:'#1a1c5e' }}>{p.supplier?.razao_social || '—'}
                      <div style={{ fontWeight:400, fontSize:11, color:'#9B9B9B' }}>{p.supplier?.cnpj}</div></td>
                    <td style={{ padding:'10px' }}>{planLabel(p.type) || planName(p.type) || p.type}</td>
                    <td style={{ padding:'10px' }}>
                      <span style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:20, ...titleF,
                        color: p.status==='ACTIVE' ? '#15803d' : '#92400e', background: p.status==='ACTIVE' ? '#dcfce7' : '#fef3c7' }}>
                        {p.status}
                      </span>
                    </td>
                    <td style={{ padding:'10px' }}>{p.paidFlag
                      ? <span style={{ color:'#15803d', fontWeight:700 }}>💳 Pago</span>
                      : <span style={{ color:'#92400e', fontWeight:700 }}>🎟️ Cupom/Trial</span>}</td>
                    <td style={{ padding:'10px', whiteSpace:'nowrap' }}>{fmtBRL(p.price_yearly)}{p.type?.includes('mensal') ? '/mês' : '/ano'}</td>
                    <td style={{ padding:'10px', whiteSpace:'nowrap' }}>
                      {fmtD(p.starts_at)} → {fmtD(p.ends_at)}
                      {expiring && <span title="Renova/vence em até 30 dias" style={{ marginLeft:6 }}>⏰</span>}
                    </td>
                    <td style={{ padding:'10px', fontSize:12 }}>{p.nfse || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ ...font, fontSize:11.5, color:'#9B9B9B', marginTop:12 }}>
        Cupom/Trial = assinatura ativa sem fatura Stripe paga (ex.: FREETRIALELOS). Ao virar a cobrança, passa a "Pago" automaticamente via webhook.
      </div>
    </Card>
  )
}

// ── Aba 3: Subsidiados (faturamento ao cliente) ────────────────────────────
function SubsidizedTab({ data, period, setPeriod }) {
  const { subsidized } = data
  const filtered = useMemo(() => subsidized.filter(r => {
    if (!period.from && !period.to) return true
    const d = r.issued_at ? r.issued_at.slice(0, 10) : null
    if (period.from && (!d || d < period.from)) return false
    if (period.to && (!d || d > period.to)) return false
    return true
  }), [subsidized, period])

  const byClient = useMemo(() => {
    const map = {}
    for (const r of filtered) {
      const k = r.clientName || '—'
      ;(map[k] = map[k] || { rows: [], total: 0 })
      map[k].rows.push(r)
      map[k].total += Number(r.valor || 0)
    }
    return map
  }, [filtered])

  const grandTotal = filtered.reduce((s, r) => s + Number(r.valor || 0), 0)
  const inp = { padding:'8px 10px', borderRadius:10, border:'1px solid #e2e4ef', ...font, fontSize:13 }

  return (
    <Card style={{ borderRadius:16, padding:'20px 24px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, flexWrap:'wrap', marginBottom:6 }}>
        <SectionTitle>Homologações subsidiadas — faturar ao cliente</SectionTitle>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <input type="date" value={period.from} onChange={e => setPeriod(p => ({ ...p, from: e.target.value }))} style={inp}/>
          <span style={{ ...font, fontSize:12, color:'#9B9B9B' }}>até</span>
          <input type="date" value={period.to} onChange={e => setPeriod(p => ({ ...p, to: e.target.value }))} style={inp}/>
          <Button variant="neutral" size="sm" onClick={() => downloadCsv('subsidiados_elos.csv',
            ['Cliente','Fornecedor','CNPJ','Fluxo','Status do selo','Homologado em','Valor subsidiado'],
            filtered.map(r => [r.clientName, r.supplierName, r.cnpj, r.flowName, r.status, fmtD(r.issued_at), r.valor ?? '']))}>
            ⬇️ CSV p/ financeiro
          </Button>
        </div>
      </div>
      <div style={{ ...font, fontSize:12, color:'#9B9B9B', marginBottom:16 }}>
        Convites subsidiados com processo vinculado a fluxo — valor = preço subsidiado do fluxo. O período filtra pela data de homologação (issued_at).
      </div>

      {!filtered.length ? (
        <div style={{ ...font, fontSize:13, color:'#9B9B9B', padding:'16px 0' }}>
          Nenhuma homologação subsidiada {period.from || period.to ? 'no período' : 'ainda'} — as do lote VIX aparecerão aqui automaticamente.
        </div>
      ) : (
        <>
          {Object.entries(byClient).map(([client, g]) => (
            <div key={client} style={{ marginBottom:20 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                <span style={{ ...titleF, fontWeight:800, fontSize:14, color:'#1a1c5e' }}>🏢 {client} <span style={{ fontWeight:400, fontSize:12, color:'#9B9B9B' }}>({g.rows.length})</span></span>
                <span style={{ ...titleF, fontWeight:900, fontSize:14, color:'#15803d' }}>{fmtBRL(g.total)}</span>
              </div>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', ...font, fontSize:12.5 }}>
                  <tbody>
                    {g.rows.map(r => (
                      <tr key={r.sealId} style={{ borderBottom:'1px solid #f1f2f8' }}>
                        <td style={{ padding:'7px 10px', fontWeight:600, color:'#1a1c5e' }}>{r.supplierName}<span style={{ fontWeight:400, color:'#9B9B9B', marginLeft:8, fontSize:11 }}>{r.cnpj}</span></td>
                        <td style={{ padding:'7px 10px' }}>{r.flowName || <em style={{ color:'#dc2626' }}>sem fluxo</em>}</td>
                        <td style={{ padding:'7px 10px' }}>
                          <span style={{ fontSize:10.5, fontWeight:700, padding:'2px 9px', borderRadius:20, ...titleF,
                            color: r.status==='ACTIVE' ? '#15803d' : '#92400e', background: r.status==='ACTIVE' ? '#dcfce7' : '#fef3c7' }}>
                            {r.status === 'ACTIVE' ? 'Homologado' : r.status}
                          </span>
                        </td>
                        <td style={{ padding:'7px 10px', whiteSpace:'nowrap' }}>{fmtD(r.issued_at)}</td>
                        <td style={{ padding:'7px 10px', textAlign:'right', fontWeight:700, whiteSpace:'nowrap' }}>{r.valor != null ? fmtBRL(r.valor) : <em style={{ color:'#dc2626' }}>sem preço</em>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          <div style={{ textAlign:'right', ...titleF, fontWeight:900, fontSize:16, color:'#1a1c5e', borderTop:'2px solid #e2e4ef', paddingTop:12 }}>
            Total do período: <span style={{ color:'#15803d' }}>{fmtBRL(grandTotal)}</span>
          </div>
        </>
      )}
    </Card>
  )
}

// ── Página ─────────────────────────────────────────────────────────────────
export default function BackofficeMetrics() {
  const [tab, setTab]       = useState('geral')
  const [data, setData]     = useState(null)
  const [error, setError]   = useState('')
  const firstOfMonth = new Date(); firstOfMonth.setDate(1)
  const [period, setPeriod] = useState({ from: firstOfMonth.toISOString().slice(0, 10), to: '' })

  useEffect(() => {
    (async () => {
      try {
        // Assinaturas Stripe + pagamento (nfe_invoices) em paralelo
        const [plansRes, nfeRes, supCountRes] = await Promise.all([
          supabase.from('plans')
            .select('id, type, status, price_yearly, starts_at, ends_at, stripe_sub_id, suppliers(razao_social, cnpj)')
            .eq('source', 'STRIPE').order('starts_at', { ascending: false }),
          supabase.from('nfe_invoices').select('supplier_id, status, amount_cents, numero'),
          supabase.from('suppliers').select('*', { count:'estimated', head:true }),
        ])
        const nfeBySupplier = {}
        for (const n of (nfeRes.data || [])) (nfeBySupplier[n.supplier_id] = nfeBySupplier[n.supplier_id] || []).push(n)
        const stripePlans = (plansRes.data || []).map(p => {
          const nfes = []  // nfe é por supplier — mapeia via embed abaixo
          return { ...p, supplier: p.suppliers, nfes }
        })
        // paidFlag: existe NFSe emitida/na fila com valor > 0 para o fornecedor
        const { data: planSup } = await supabase.from('plans').select('id, supplier_id').eq('source', 'STRIPE')
        const supByPlan = Object.fromEntries((planSup || []).map(r => [r.id, r.supplier_id]))
        for (const p of stripePlans) {
          const list = nfeBySupplier[supByPlan[p.id]] || []
          const paidNfe = list.find(n => (n.amount_cents || 0) > 0)
          p.paidFlag = !!paidNfe
          const emitted = list.find(n => n.status === 'EMITTED' && n.numero)
          p.nfse = emitted ? `nº ${emitted.numero}` : null
        }

        // Contagens EXATAS via RPC (patch_057) — 'estimated' mostrava números defasados
        const { data: rpc } = await supabase.rpc('admin_metrics')
        const byStatus = rpc?.seals_by_status || {}
        const exactSuppliers = rpc?.suppliers_total

        // Subsidiados: convites subsidiado=true com selo do mesmo (fornecedor, cliente)
        const subInvites = await fetchAllRows(() => supabase.from('invitations')
          .select('supplier_id, client_id, flow_id')
          .eq('subsidiado', true).not('supplier_id', 'is', null).not('client_id', 'is', null)
          .order('id'))
        const pairKey = r => `${r.supplier_id}|${r.client_id}`
        const invByPair = {}
        for (const i of subInvites) invByPair[pairKey(i)] = i

        let subsidized = []
        if (subInvites.length) {
          const supplierIds = [...new Set(subInvites.map(i => i.supplier_id))]
          let seals = []
          for (let i = 0; i < supplierIds.length; i += 100) {
            const chunk = await fetchAllRows(() => supabase.from('seals')
              .select('id, supplier_id, client_id, status, issued_at, flow_id, clients(razao_social), suppliers(razao_social, cnpj), client_flows(name, price, price_subsidized)')
              .in('supplier_id', supplierIds.slice(i, i + 100)).not('client_id', 'is', null)
              .order('id'))
            seals = seals.concat(chunk)
          }
          subsidized = seals
            .filter(s => invByPair[pairKey(s)])
            .map(s => ({
              sealId:       s.id,
              clientName:   s.clients?.razao_social,
              supplierName: s.suppliers?.razao_social,
              cnpj:         s.suppliers?.cnpj,
              status:       s.status,
              issued_at:    s.issued_at,
              flowName:     s.client_flows?.name || null,
              valor:        s.client_flows ? (s.client_flows.price_subsidized ?? s.client_flows.price) : null,
            }))
        }

        setData({
          stripePlans,
          sealCounts: { byStatus, active: byStatus.ACTIVE?.processos || 0, activeSuppliers: byStatus.ACTIVE?.fornecedores || 0 },
          supplierCount: exactSuppliers ?? supCountRes.count ?? 0,
          subsidized,
        })
      } catch (e) { setError(e.message) }
    })()
  }, [])

  if (error) return <div style={{ padding:40, ...font, color:'#dc2626' }}>Erro: {error}</div>
  if (!data) return <div style={{ display:'flex', justifyContent:'center', alignItems:'center', height:'50vh' }}><Spinner size={48}/></div>

  return (
    <div style={{ padding:'28px 32px', maxWidth:1100, margin:'0 auto' }}>
      <PageHeader title="Métricas e Faturamento" subtitle="Assinaturas Stripe, homologações subsidiadas e visão operacional"/>
      <div style={{ display:'flex', gap:8, marginBottom:20 }}>
        <TabBtn active={tab==='geral'} onClick={() => setTab('geral')}>📊 Visão Geral</TabBtn>
        <TabBtn active={tab==='assinaturas'} onClick={() => setTab('assinaturas')}>💳 Assinaturas</TabBtn>
        <TabBtn active={tab==='subsidiados'} onClick={() => setTab('subsidiados')}>🤝 Subsidiados</TabBtn>
      </div>
      {tab === 'geral'        && <OverviewTab data={data}/>}
      {tab === 'assinaturas'  && <SubscriptionsTab data={data}/>}
      {tab === 'subsidiados'  && <SubsidizedTab data={data} period={period} setPeriod={setPeriod}/>}
    </div>
  )
}
