// Respostas dos questionários (11/11, chamado #755248 — pedido VIX): todas as
// respostas de todos os fornecedores com processo ativo ou em andamento. O mesmo
// componente no cliente e no backoffice. No cliente, só perfis com o módulo
// Compliance (respostas sensíveis — o servidor também confere).
// Excel: Resumo, Por fornecedor (uma coluna por pergunta) e Detalhe (uma resposta por linha).
import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { reportsApi } from '../../services/api.js'
import { Card, Spinner, Button } from '../ui.jsx'
import { Tile } from '../charts.jsx'
import { exportXlsxSheets } from '../../lib/exportXlsx.js'
import { formatCnpj, normalizeCnpj } from '../../lib/cnpj.js'
import { dataBR } from '../../lib/reportRows.js'

const ST = {
  completo: { label: 'Respondeu tudo',     color: '#15803d' },
  parcial:  { label: 'Respondeu em parte', color: '#b45309' },
  nao:      { label: 'Não respondeu',      color: '#64748b' },
}
const PROC = { ACTIVE: 'Homologado', PENDING: 'Em homologação' }

export default function QuestionnaireAnswersReport({ clientId, admin = false }) {
  const navigate = useNavigate()
  const [quests, setQuests] = useState(null)
  const [qid, setQid] = useState('')
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState('')
  const [busca, setBusca] = useState('')
  const [fSt, setFSt] = useState('')
  const [soAlerta, setSoAlerta] = useState(false)

  useEffect(() => {
    if (!clientId) return
    setQuests(null); setQid(''); setRows(null)
    reportsApi.questionnaires(clientId).then(qs => {
      setQuests(qs)
      const ativo = qs.find(q => q.active !== false) || qs[0]
      if (ativo) setQid(ativo.id)
    }).catch(e => setErr(e.message))
  }, [clientId])

  useEffect(() => {
    if (!qid) return
    setRows(null); setErr('')
    reportsApi.questionnaireAnswers(qid).then(setRows).catch(e => setErr(e.message))
  }, [qid])

  const perguntas = useMemo(() => {
    const m = new Map()
    for (const r of rows || []) if (!m.has(r.question_id)) m.set(r.question_id, { id: r.question_id, ordem: r.ordem, texto: r.pergunta, obrigatoria: r.obrigatoria })
    return [...m.values()].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
  }, [rows])
  const fornecedores = useMemo(() => {
    const m = new Map()
    for (const r of rows || []) {
      if (!m.has(r.supplier_id)) m.set(r.supplier_id, { id: r.supplier_id, razao: r.razao_social, cnpj: r.cnpj, processo: r.processo, resp: {} })
      m.get(r.supplier_id).resp[r.question_id] = r
    }
    const lista = [...m.values()]
    for (const f of lista) {
      const rs = Object.values(f.resp)
      const obrig = rs.filter(r => r.obrigatoria)
      const respondidas = rs.filter(r => r.respondida).length
      f.respondidas = respondidas
      f.alertas = rs.filter(r => r.alerta).length
      f.st = respondidas === 0 ? 'nao' : (obrig.length ? obrig.every(r => r.respondida) : respondidas === rs.length) ? 'completo' : 'parcial'
    }
    return lista
  }, [rows])
  const filtrados = useMemo(() => fornecedores.filter(f => {
    const q = busca.trim().toLowerCase()
    if (q && !(f.razao || '').toLowerCase().includes(q) && !(normalizeCnpj(q) && normalizeCnpj(f.cnpj || '').includes(normalizeCnpj(q)))) return false
    if (fSt && f.st !== fSt) return false
    if (soAlerta && !f.alertas) return false
    return true
  }), [fornecedores, busca, fSt, soAlerta])

  if (err) return <Card style={{ padding: 20, borderRadius: 14, color: '#dc2626', fontSize: 13 }}>{err}</Card>
  if (!quests) return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner size={36} /></div>
  if (!quests.length) return <Card style={{ padding: 24, borderRadius: 14, fontSize: 13, color: '#6b7280' }}>Nenhum questionário cadastrado para este cliente.</Card>

  const titulo = quests.find(q => q.id === qid)?.title || 'questionario'
  const col = (p) => `${(p.ordem ?? 0) + 1}. ${p.texto}`.slice(0, 250)

  const exportar = () => {
    const resumo = [
      { 'Indicador': 'Questionário', 'Valor': titulo },
      { 'Indicador': 'Fornecedores considerados (processo ativo ou em andamento)', 'Valor': filtrados.length },
      ...Object.entries(ST).map(([k, v]) => ({ 'Indicador': v.label, 'Valor': filtrados.filter(f => f.st === k).length })),
      { 'Indicador': 'Fornecedores com resposta que exige revisão de compliance', 'Valor': filtrados.filter(f => f.alertas).length },
      { 'Indicador': 'Perguntas', 'Valor': perguntas.length },
    ]
    const porFornecedor = filtrados.map(f => ({
      'Razão social': f.razao || '', 'CNPJ': formatCnpj(f.cnpj || ''), 'Processo': PROC[f.processo] || f.processo || '',
      'Situação': ST[f.st].label, 'Respondidas': `${f.respondidas} de ${perguntas.length}`, 'Alertas de compliance': f.alertas,
      ...Object.fromEntries(perguntas.map(p => [col(p), f.resp[p.id]?.resposta ?? ''])),
    }))
    const detalhe = filtrados.flatMap(f => perguntas.map(p => {
      const r = f.resp[p.id] || {}
      return {
        'Razão social': f.razao || '', 'CNPJ': formatCnpj(f.cnpj || ''), 'Nº': (p.ordem ?? 0) + 1, 'Pergunta': p.texto,
        'Resposta': r.respondida ? (r.resposta ?? '') : 'Não respondida', 'Respondida em': dataBR(r.respondido_em),
        'Alerta de compliance': r.alerta ? 'Sim' : '', 'Origem': r.replicada ? 'Replicada de outra filial' : '',
      }
    }))
    exportXlsxSheets(`respostas-${titulo.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`, [
      { name: 'Resumo', rows: resumo }, { name: 'Por fornecedor', rows: porFornecedor }, { name: 'Detalhe', rows: detalhe },
    ])
  }

  return (
    <div>
      <Card style={{ borderRadius: 14, padding: '14px 18px', marginBottom: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={qid} onChange={e => setQid(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e4ef', fontSize: 13, fontFamily: 'DM Sans,sans-serif', minWidth: 260 }}>
          {quests.map(q => <option key={q.id} value={q.id}>{q.title}{q.active === false ? ' (inativo)' : ''}</option>)}
        </select>
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por razão social ou CNPJ"
          style={{ flex: 1, minWidth: 200, padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e4ef', fontSize: 13, fontFamily: 'DM Sans,sans-serif' }} />
        <label style={{ fontSize: 12.5, fontFamily: 'DM Sans,sans-serif', color: '#1a1c5e', display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
          <input type="checkbox" checked={soAlerta} onChange={e => setSoAlerta(e.target.checked)} /> só com alerta de compliance
        </label>
        <Button variant="primary" size="sm" disabled={!rows} onClick={exportar}>⬇ Exportar Excel ({filtrados.length})</Button>
      </Card>

      {!rows ? <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner size={36} /></div> : <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 12 }}>
          <Tile label="Fornecedores" value={fornecedores.length.toLocaleString('pt-BR')} sub={`${perguntas.length} perguntas`} onClick={() => { setFSt(''); setSoAlerta(false) }} />
          {Object.entries(ST).map(([k, v]) => (
            <Tile key={k} label={v.label} value={fornecedores.filter(f => f.st === k).length.toLocaleString('pt-BR')} accent={v.color}
              onClick={() => setFSt(fSt === k ? '' : k)} sub={fSt === k ? 'filtro aplicado — clique para limpar' : 'clique para filtrar'} />
          ))}
          <Tile label="Com alerta de compliance" value={fornecedores.filter(f => f.alertas).length.toLocaleString('pt-BR')} accent="#dc2626"
            onClick={() => setSoAlerta(!soAlerta)} sub="respostas que exigem revisão" />
        </div>
        <Card style={{ borderRadius: 14, padding: 0, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, fontFamily: 'DM Sans,sans-serif' }}>
            <thead><tr>{['Fornecedor', 'Situação', 'Respondidas', 'Alertas'].map(c => (
              <th key={c} style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '2px solid #eef0f6', color: '#6b7280', fontWeight: 700 }}>{c}</th>
            ))}</tr></thead>
            <tbody>{filtrados.slice(0, 500).map(f => (
              <tr key={f.id} style={{ borderBottom: '1px solid #f4f5f9' }}>
                <td style={{ padding: '8px 12px' }}>
                  <button onClick={() => navigate(admin ? `/backoffice/analise/${f.id}` : `/cliente/fornecedor/${f.id}`)} title="Abrir o processo (aba Questionários)"
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', color: '#1a1c5e', fontWeight: 700, fontFamily: 'DM Sans,sans-serif', fontSize: 12.5 }}>{f.razao}</button>
                  <div style={{ fontSize: 11, color: '#9B9B9B' }}>{formatCnpj(f.cnpj || '')} · {PROC[f.processo] || f.processo}</div>
                </td>
                <td style={{ padding: '8px 12px', color: ST[f.st].color, fontWeight: 700, whiteSpace: 'nowrap' }}>{ST[f.st].label}</td>
                <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{f.respondidas} de {perguntas.length}</td>
                <td style={{ padding: '8px 12px', color: f.alertas ? '#dc2626' : '#9B9B9B', fontWeight: f.alertas ? 700 : 400 }}>{f.alertas || '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </Card>
        <div style={{ fontSize: 11.5, color: '#6b7280', fontFamily: 'DM Sans,sans-serif', marginTop: 8 }}>
          As respostas completas, pergunta a pergunta, estão no Excel (abas "Por fornecedor" e "Detalhe").
        </div>
      </>}
    </div>
  )
}
