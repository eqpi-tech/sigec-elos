// Relatórios do CLIENTE (17/09) — dashboard executivo do escopo do cliente
// (patch_072, RPC client_exec_dashboard): processos, vencimentos, fornecedores,
// convites, RFQ e questionários. O client_id é resolvido no servidor a partir
// do usuário logado — nada vem do navegador.
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase.js'
import { Card, Spinner, PageHeader, SectionTitle, Button } from '../../components/ui.jsx'
import { Tile, HBars, LineChart } from '../../components/charts.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { exportXlsxSheets } from '../../lib/exportXlsx.js'
import { clientApi, invitationsApi } from '../../services/api.js'
import { SITUACAO, clientSealStatus } from '../../lib/clientSituacao.js'
import { formatCnpj } from '../../lib/cnpj.js'
import DocumentsStatusReport from './DocumentsStatusReport.jsx'

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
  // 29/10 (pedido VIX): aba do relatório de status dos documentos + Excel da visão executiva
  const { user } = useAuth()
  const [aba, setAba] = useState('executivo')
  const [flowNames, setFlowNames] = useState({})
  const [exportando, setExportando] = useState(false)
  useEffect(() => {
    if (!user?.clientId) return
    supabase.from('client_flows').select('id, name').eq('client_id', user.clientId)
      .then(({ data }) => setFlowNames(Object.fromEntries((data || []).map(f => [f.id, f.name]))))
  }, [user?.clientId])

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

  // Excel da visão executiva com o período aplicado (29/10) — 30/10 (retorno da
  // Victoria): além dos indicadores, o DETALHE com razão social e CNPJ
  // (fornecedores, homologações e convites), no período escolhido
  const noPeriodo = (v) => {
    if (!comPeriodo) return true
    const dia = v ? String(v).slice(0, 10) : ''
    return !!dia && (!periodo.de || dia >= periodo.de) && (!periodo.ate || dia <= periodo.ate)
  }
  const exportarExecutivo = async () => {
    setExportando(true)
    try {
    const [forn, convs] = await Promise.all([clientApi.getSuppliers(user.clientId), invitationsApi.listByClient(user.clientId)])
    const dt = (v) => (v ? new Date(v).toLocaleDateString('pt-BR') : '')
    const linhaForn = (item) => {
      const seal = item.seal || {}, sup = item.supplier || {}
      return {
        'Razão social': sup.razao_social || item.inviteRazaoSocial || '',
        'CNPJ': formatCnpj(sup.cnpj || item.inviteCnpj || ''),
        'Situação': seal.client_suspended_at ? 'Inativado pela empresa' : (SITUACAO.find(o => o.value === clientSealStatus(seal))?.label || seal.status || ''),
        'Nível': item.flowId ? (flowNames[item.flowId] || '') : '',
        'Custeio': item.subsidiado ? 'Subsidiado' : 'Pago pelo fornecedor',
        'Categorias': (sup.categorias || []).filter(c => !c.reprovada).map(c => c.nome).join('; '),
        'Homologado em': seal.status === 'ACTIVE' ? dt(seal.issued_at) : '',
        'Validade': dt(seal.expires_at),
        'Convidado em': dt(item.invitedAt),
        'Cidade': sup.city || '', 'UF': sup.state || '',
      }
    }
    const fornecedores = forn.filter(i => noPeriodo(i.invitedAt || i.seal?.issued_at)).map(linhaForn)
    const homologacoes = forn.filter(i => i.seal?.status === 'ACTIVE' && noPeriodo(i.seal?.issued_at)).map(linhaForn)
    const ST = { SENT: 'Enviado', VIEWED: 'Visualizado', REGISTERED: 'Cadastrado', CANCELLED: 'Cancelado', EXPIRED: 'Expirado' }
    const convites = convs.filter(c => noPeriodo(c.created_at)).map(c => ({
      'Razão social': c.supplier_razao_social || '', 'CNPJ': formatCnpj(c.supplier_cnpj || ''), 'E-mail': c.supplier_email || '',
      'Situação': ST[c.status] || c.status, 'Nível': c.flow_id ? (flowNames[c.flow_id] || '') : '',
      'Custeio': c.subsidiado ? 'Subsidiado' : 'Pago pelo fornecedor', 'Enviado em': dt(c.created_at),
      'Lembretes': c.reminder_count || 0, 'Origem': c.hoc_id ? 'Histórico do HOC' : 'ELOS',
    }))
    const L = (secao, indicador, valor) => ({ 'Seção': secao, 'Indicador': indicador, 'Valor': valor ?? 0, 'Período': txtPeriodo })
    const indicadores = [
      L('Fornecedores', comPeriodo ? 'Fornecedores no período' : 'Fornecedores', f.total),
      L('Processos', 'Homologados vigentes', p.homologados), L('Processos', 'Em homologação', p.em_homologacao),
      L('Processos', 'Suspensos', p.suspensos), L('Processos', 'Vencidos', p.vencidos), L('Processos', 'A vencer (60 dias)', p.a_vencer_60d),
      L('Documentos (hoje)', 'A vencer (30 dias)', doc.a_vencer_30d), L('Documentos (hoje)', 'Vencidos', doc.vencidos), L('Documentos (hoje)', 'Em análise', doc.em_analise),
      L('Convites', 'Enviados', cv.total), L('Convites', 'Visualizados', (cv.visualizados || 0) + (cv.cadastrados || 0)), L('Convites', 'Cadastrados', cv.cadastrados),
      L('Cotações (RFQ)', 'Cotações abertas', rfq.total), L('Cotações (RFQ)', 'Respostas recebidas', rfq.respostas),
      ...(d.homologacoes_por_mes || []).map(r => L('Homologações por mês', String(r.mes).slice(0, 7).split('-').reverse().join('/'), r.n)),
      ...quests.flatMap(q => [L(`Questionário: ${q.titulo}`, 'Responderam', q.respondidos), L(`Questionário: ${q.titulo}`, 'Não responderam', q.nao_respondidos)]),
    ]
    exportXlsxSheets('relatorio-executivo', [
      { name: 'Indicadores', rows: indicadores },
      { name: comPeriodo ? 'Fornecedores (no período)' : 'Fornecedores', rows: fornecedores },
      { name: comPeriodo ? 'Homologações (no período)' : 'Homologados', rows: homologacoes },
      { name: comPeriodo ? 'Convites (no período)' : 'Convites', rows: convites },
    ])
    } catch (e) { alert('Não foi possível gerar o Excel: ' + e.message) }
    finally { setExportando(false) }
  }
  const abaBtn = (k, txt) => (
    <button onClick={() => setAba(k)} style={{ padding: '10px 18px', background: 'none', border: 'none', borderBottom: `2px solid ${aba === k ? '#2E3192' : 'transparent'}`, marginBottom: -2,
      color: aba === k ? '#2E3192' : '#9B9B9B', fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>{txt}</button>
  )

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100, margin: '0 auto' }}>
      <PageHeader title="Relatórios" subtitle={aba === 'executivo' ? `Visão executiva da sua homologação de fornecedores · ${txtPeriodo}` : 'Situação de cada documento exigido nos processos dos seus fornecedores'} />
      <div style={{ display: 'flex', gap: 4, marginBottom: 18, borderBottom: '2px solid #e2e4ef' }}>
        {abaBtn('executivo', '📊 Visão executiva')}
        {abaBtn('documentos', '📄 Status dos documentos')}
      </div>
      {aba === 'documentos' ? <DocumentsStatusReport flowNames={flowNames} /> : <>

      <Card style={{ borderRadius: 14, padding: '14px 18px', marginBottom: 16, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div><label style={lblData}>Data início</label><input type="date" value={de} max={ate || undefined} onChange={e => setDe(e.target.value)} style={inpData}/></div>
        <div><label style={lblData}>Data fim</label><input type="date" value={ate} min={de || undefined} onChange={e => setAte(e.target.value)} style={inpData}/></div>
        <Button variant="primary" size="sm" disabled={loading} onClick={() => setPeriodo({ de, ate })}>{loading ? 'Carregando…' : 'Aplicar'}</Button>
        {comPeriodo && <Button variant="neutral" size="sm" onClick={() => { setDe(''); setAte(''); setPeriodo({ de: '', ate: '' }) }}>Limpar</Button>}
        <div style={{ flex: 1, minWidth: 220, fontSize: 11.5, color: '#6b7280', fontFamily: 'DM Sans,sans-serif' }}>
          O período vale para processos e fornecedores iniciados, convites, cotações e homologações por mês. Documentos a vencer e questionários mostram a situação atual.
        </div>
        <Button variant="neutral" size="sm" disabled={exportando} onClick={exportarExecutivo} title="Indicadores e o detalhe (fornecedores, homologações e convites, com razão social e CNPJ) no período aplicado">{exportando ? 'Gerando…' : '⬇ Exportar Excel'}</Button>
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
      </>}
    </div>
  )
}
