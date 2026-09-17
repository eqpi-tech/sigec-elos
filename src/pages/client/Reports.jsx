// Relatórios do CLIENTE (17/09) — dashboard executivo do escopo do cliente
// (patch_072, RPC client_exec_dashboard): processos, vencimentos, fornecedores,
// convites, RFQ e questionários. O client_id é resolvido no servidor a partir
// do usuário logado — nada vem do navegador.
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase.js'
import { Card, Spinner, PageHeader, SectionTitle } from '../../components/ui.jsx'
import { Tile, HBars, LineChart } from '../../components/charts.jsx'

const fmt = (n) => (n ?? 0).toLocaleString('pt-BR')
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0)

export default function ClientReports() {
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    supabase.rpc('client_exec_dashboard')
      .then(({ data, error }) => error ? setErr(error.message) : setD(data))
  }, [])

  if (err) return <div style={{ padding: 40 }}><Card style={{ padding: 20, borderRadius: 14, color: '#dc2626', fontSize: 13 }}>Erro ao carregar: {err}</Card></div>
  if (!d) return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><Spinner size={40} /></div>

  const p = d.processos || {}, f = d.fornecedores || {}, doc = d.documentos || {}
  const cv = d.convites || {}, rfq = d.rfq || {}
  const quests = d.questionarios || []

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100, margin: '0 auto' }}>
      <PageHeader title="Relatórios" subtitle="Visão executiva da sua homologação de fornecedores" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
        <Tile label="Fornecedores" value={fmt(f.total)} sub={f.novos_30d ? `+${fmt(f.novos_30d)} nos últimos 30 dias` : undefined} />
        <Tile label="Homologados vigentes" value={fmt(p.homologados)} accent="#15803d" />
        <Tile label="Em homologação" value={fmt(p.em_homologacao)} accent="#b45309" />
        <Tile label="Processos a vencer (60d)" value={fmt(p.a_vencer_60d)} accent={p.a_vencer_60d ? '#b45309' : undefined} />
        <Tile label="Processos vencidos" value={fmt(p.vencidos)} accent={p.vencidos ? '#dc2626' : undefined}
          sub={p.suspensos ? `${fmt(p.suspensos)} suspensos` : undefined} />
        <Tile label="Docs a vencer (30d)" value={fmt(doc.a_vencer_30d)} accent={doc.a_vencer_30d ? '#b45309' : undefined}
          sub={`${fmt(doc.vencidos)} vencidos · ${fmt(doc.em_analise)} em análise`} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
        <Card style={{ borderRadius: 14, padding: '18px 22px' }}>
          <SectionTitle>Situação dos processos</SectionTitle>
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
            {fmt(cv.ultimos_30d)} convites nos últimos 30 dias · conversão {pct(cv.cadastrados, cv.total)}%
          </div>
        </Card>

        <Card style={{ borderRadius: 14, padding: '18px 22px' }}>
          <SectionTitle>Homologações por mês</SectionTitle>
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
            {fmt(rfq.ultimas_30d)} cotações nos últimos 30 dias
          </div>
        </Card>

        <Card style={{ borderRadius: 14, padding: '18px 22px', gridColumn: quests.length > 2 ? '1 / -1' : undefined }}>
          <SectionTitle>Questionários — respostas dos homologados</SectionTitle>
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
