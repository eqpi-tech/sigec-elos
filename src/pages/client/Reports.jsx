// Relatórios do CLIENTE (17/09) — dashboard executivo do escopo do cliente
// (patch_072, RPC client_exec_dashboard): processos, vencimentos, fornecedores,
// convites, RFQ e questionários. O client_id é resolvido no servidor a partir
// do usuário logado — nada vem do navegador.
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase.js'
import { Card, Spinner, PageHeader, SectionTitle, Button } from '../../components/ui.jsx'
import { Tile, HBars, LineChart } from '../../components/charts.jsx'

const fmt = (n) => (n ?? 0).toLocaleString('pt-BR')
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0)

export default function ClientReports() {
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  // período (patch_143): filtra o que é movimento; a foto do momento segue atual
  const [de, setDe]   = useState('')
  const [ate, setAte] = useState('')
  const [periodo, setPeriodo] = useState({ de: '', ate: '' })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    supabase.rpc('client_exec_dashboard', { p_from: periodo.de || null, p_to: periodo.ate || null })
      .then(({ data, error }) => error ? setErr(error.message) : setD(data))
      .finally(() => setLoading(false))
  }, [periodo])
  const comPeriodo = !!(periodo.de || periodo.ate)
  const txtPeriodo = comPeriodo
    ? `${periodo.de ? new Date(periodo.de + 'T12:00:00').toLocaleDateString('pt-BR') : 'início'} a ${periodo.ate ? new Date(periodo.ate + 'T12:00:00').toLocaleDateString('pt-BR') : 'hoje'}`
    : 'todo o período'
  const inpData = { padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e4ef', fontFamily: 'DM Sans,sans-serif', fontSize: 13, color: '#1a1c5e' }
  const lblData = { display: 'block', fontSize: 11, fontWeight: 700, color: '#9B9B9B', fontFamily: 'Montserrat,sans-serif', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 4 }

  if (err) return <div style={{ padding: 40 }}><Card style={{ padding: 20, borderRadius: 14, color: '#dc2626', fontSize: 13 }}>Erro ao carregar: {err}</Card></div>
  if (!d) return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><Spinner size={40} /></div>

  const p = d.processos || {}, f = d.fornecedores || {}, doc = d.documentos || {}
  const cv = d.convites || {}, rfq = d.rfq || {}
  const quests = d.questionarios || []

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100, margin: '0 auto' }}>
      <PageHeader title="Relatórios" subtitle={`Visão executiva da sua homologação de fornecedores · ${txtPeriodo}`} />

      <Card style={{ borderRadius: 14, padding: '14px 18px', marginBottom: 16, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div><label style={lblData}>Data início</label><input type="date" value={de} max={ate || undefined} onChange={e => setDe(e.target.value)} style={inpData}/></div>
        <div><label style={lblData}>Data fim</label><input type="date" value={ate} min={de || undefined} onChange={e => setAte(e.target.value)} style={inpData}/></div>
        <Button variant="primary" size="sm" disabled={loading} onClick={() => setPeriodo({ de, ate })}>{loading ? 'Carregando…' : 'Aplicar'}</Button>
        {comPeriodo && <Button variant="neutral" size="sm" onClick={() => { setDe(''); setAte(''); setPeriodo({ de: '', ate: '' }) }}>Limpar</Button>}
        <div style={{ flex: 1, minWidth: 220, fontSize: 11.5, color: '#6b7280', fontFamily: 'DM Sans,sans-serif' }}>
          O período vale para processos e fornecedores iniciados, convites, cotações e homologações por mês. Documentos a vencer e questionários mostram a situação atual.
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
        <Tile label={comPeriodo ? 'Fornecedores no período' : 'Fornecedores'} value={fmt(f.total)} sub={!comPeriodo && f.novos_30d ? `+${fmt(f.novos_30d)} nos últimos 30 dias` : undefined} />
        <Tile label="Homologados vigentes" value={fmt(p.homologados)} accent="#15803d" />
        <Tile label="Em homologação" value={fmt(p.em_homologacao)} accent="#b45309" />
        <Tile label="Processos a vencer (60d)" value={fmt(p.a_vencer_60d)} accent={p.a_vencer_60d ? '#b45309' : undefined} />
        <Tile label="Processos vencidos" value={fmt(p.vencidos)} accent={p.vencidos ? '#dc2626' : undefined}
          sub={p.suspensos ? `${fmt(p.suspensos)} suspensos` : undefined} />
        <Tile label="Docs a vencer (30d) · hoje" value={fmt(doc.a_vencer_30d)} accent={doc.a_vencer_30d ? '#b45309' : undefined}
          sub={`${fmt(doc.vencidos)} vencidos · ${fmt(doc.em_analise)} em análise`} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
        <Card style={{ borderRadius: 14, padding: '18px 22px' }}>
          <SectionTitle>Situação dos processos{comPeriodo ? ' iniciados no período' : ''}</SectionTitle>
          <HBars rows={[
            { label: '🏅 Homologados vigentes', n: p.homologados || 0, color: '#22c55e' },
            { label: '⏳ Em homologação',       n: p.em_homologacao || 0, color: '#f59e0b' },
            { label: '⛔ Suspensos',            n: p.suspensos || 0, color: '#ef4444' },
            { label: '💤 Vencidos',             n: p.vencidos || 0, color: '#64748b' },
          ]} />
        </Card>

        <Card style={{ borderRadius: 14, padding: '18px 22px' }}>
          <SectionTitle>Funil de convites</SectionTitle>
          <HBars rows={[
            { label: '✉️ Enviados', n: cv.total || 0 },
            { label: '👁 Visualizados', n: (cv.visualizados || 0) + (cv.cadastrados || 0) },
            { label: '✅ Cadastrados', n: cv.cadastrados || 0, color: '#22c55e' },
          ]} />
          <div style={{ fontSize: 11, color: '#9B9B9B', fontFamily: 'DM Sans,sans-serif', marginTop: 8 }}>
            {comPeriodo ? `${fmt(cv.total)} convites no período` : `${fmt(cv.ultimos_30d)} convites nos últimos 30 dias`} · conversão {pct(cv.cadastrados, cv.total)}%
          </div>
        </Card>

        <Card style={{ borderRadius: 14, padding: '18px 22px' }}>
          <SectionTitle>Homologações por mês{comPeriodo ? '' : ' (últimos 12 meses)'}</SectionTitle>
          <LineChart points={(d.homologacoes_por_mes || []).map(r => ({ x: r.mes, n: r.n }))}
            fmtX={(x) => new Date(x + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })} />
        </Card>

        <Card style={{ borderRadius: 14, padding: '18px 22px' }}>
          <SectionTitle>Cotações (RFQ)</SectionTitle>
          <HBars rows={[
            { label: '📝 Cotações abertas', n: rfq.total || 0 },
            { label: '💬 Respostas recebidas', n: rfq.respostas || 0, color: '#22c55e' },
          ]} />
          <div style={{ fontSize: 11, color: '#9B9B9B', fontFamily: 'DM Sans,sans-serif', marginTop: 8 }}>
            {comPeriodo ? `${fmt(rfq.total)} cotações no período` : `${fmt(rfq.ultimas_30d)} cotações nos últimos 30 dias`}
          </div>
        </Card>

        <Card style={{ borderRadius: 14, padding: '18px 22px', gridColumn: quests.length > 2 ? '1 / -1' : undefined }}>
          <SectionTitle>Questionários — respostas dos homologados (hoje)</SectionTitle>
          {quests.length === 0 ? (
            <div style={{ fontSize: 12, color: '#9B9B9B', fontStyle: 'italic' }}>Nenhum questionário ativo.</div>
          ) : quests.map(q => (
            <div key={q.titulo} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontFamily: 'Montserrat,sans-serif', fontWeight: 700, color: '#1a1c5e', marginBottom: 6 }}>{q.titulo}</div>
              <HBars labelWidth={130} rows={[
                { label: '✅ Responderam', n: q.respondidos || 0, color: '#22c55e' },
                { label: '⚠️ Não responderam', n: q.nao_respondidos || 0, color: '#f59e0b' },
              ]} />
            </div>
          ))}
        </Card>
      </div>
    </div>
  )
}
