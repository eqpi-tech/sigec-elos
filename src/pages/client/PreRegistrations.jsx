import { useState, useEffect } from 'react'
import { preRegistrationsApi } from '../../services/api.js'
import { isCnpjComplete, formatCnpj } from '../../lib/cnpj.js'
import { Card, Spinner, EmptyState, Button } from '../../components/ui.jsx'

// Aba "Pré-cadastros" do cliente (patch_126): empresas que entraram pelo portal
// do cliente e escolheram o pré-cadastro sem custo — sem processo, sem
// documentos. O cliente vê a ficha e o questionário, convida ou arquiva.

// CNPJ numérico ou alfanumérico: mascara quando completo, senão mostra como veio
const fmtCnpj = (c) => isCnpjComplete(c) ? formatCnpj(c) : (c || '')
const resposta = (a) => a.answer_boolean === true ? 'Sim' : a.answer_boolean === false ? 'Não' : (a.answer_text || '—')

const FILTROS = [['ACTIVE', 'Ativos'], ['ARCHIVED', 'Arquivados'], ['todos', 'Todos']]

export default function PreRegistrationsReport({ clientId, navigate }) {
  const [status,  setStatus]  = useState('ACTIVE')
  const [rows,    setRows]    = useState(null)
  const [acting,  setActing]  = useState(null)
  const [aberto,  setAberto]  = useState(null)     // supplier_id com questionário aberto
  const [answers, setAnswers] = useState({})       // supplier_id → respostas

  useEffect(() => {
    if (!clientId) return
    setRows(null)
    preRegistrationsApi.list(clientId, status).then(setRows).catch(() => setRows([]))
  }, [clientId, status])

  const toggleQuestionario = async (row) => {
    if (aberto === row.supplier_id) { setAberto(null); return }
    setAberto(row.supplier_id)
    if (!answers[row.supplier_id]) {
      try {
        const a = await preRegistrationsApi.answers(clientId, row.supplier_id)
        setAnswers(p => ({ ...p, [row.supplier_id]: a }))
      } catch { setAnswers(p => ({ ...p, [row.supplier_id]: [] })) }
    }
  }

  const mudarStatus = async (row, novo) => {
    if (novo === 'ARCHIVED' && !confirm(`Arquivar o pré-cadastro de ${row.razao_social}? Ele sai da lista inicial, mas continua em "Arquivados".`)) return
    setActing(row.id)
    try {
      await preRegistrationsApi.setStatus(row.id, novo)
      setRows(prev => status === 'todos'
        ? prev.map(r => r.id === row.id ? { ...r, status: novo } : r)
        : prev.filter(r => r.id !== row.id))
    } catch (e) { alert('Erro: ' + e.message) }
    setActing(null)
  }

  const invite = (row) => {
    navigate('/cliente/convites', { state: { prefill: {
      razao_social: row.razao_social || '', cnpj: row.cnpj || '',
      email: row.email || '', contato: row.contact_name || '', telefone: row.phone || '',
    } } })
  }

  return (
    <>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16, flexWrap:'wrap' }}>
        <div style={{ fontSize:13, color:'#64748b', fontFamily:'DM Sans,sans-serif', flex:1, minWidth:240 }}>
          Empresas que se cadastraram pelo seu portal sem iniciar a homologação. Veja o cadastro e o questionário, convide para a homologação ou arquive.
        </div>
        <div style={{ display:'flex', gap:6 }}>
          {FILTROS.map(([v, l]) => (
            <button key={v} onClick={() => setStatus(v)}
              style={{ padding:'6px 14px', borderRadius:20, border:`1.5px solid ${status===v?'#2E3192':'#e2e4ef'}`, background:status===v?'rgba(46,49,146,.08)':'#fff', color:status===v?'#2E3192':'#64748b', fontFamily:'DM Sans,sans-serif', fontSize:12.5, fontWeight:status===v?700:500, cursor:'pointer' }}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {rows === null && <div style={{ display:'flex', justifyContent:'center', padding:40 }}><Spinner size={36}/></div>}

      {rows?.length === 0 && (
        <EmptyState icon="📝" title={status === 'ARCHIVED' ? 'Nenhum pré-cadastro arquivado' : 'Nenhum pré-cadastro'}
          subtitle="Quem entra pelo seu portal pode fazer um pré-cadastro sem custo — as empresas aparecem aqui."/>
      )}

      {rows?.length > 0 && (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {rows.map(row => {
            const qa = answers[row.supplier_id]
            return (
              <Card key={row.id} style={{ borderRadius:14, padding:'16px 20px', opacity: row.status === 'ARCHIVED' ? .75 : 1 }}>
                <div style={{ display:'flex', alignItems:'flex-start', gap:14, flexWrap:'wrap' }}>
                  <div style={{ width:44, height:44, borderRadius:10, background:'rgba(46,49,146,.08)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:17, color:'#2E3192', flexShrink:0 }}>
                    {row.razao_social?.[0] || '?'}
                  </div>
                  <div style={{ flex:1, minWidth:220 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                      <span style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:14, color:'#1a1c5e' }}>{row.razao_social || 'Fornecedor'}</span>
                      {row.in_process && <span style={{ fontSize:9.5, fontWeight:700, color:'#15803d', background:'#dcfce7', padding:'2px 8px', borderRadius:20 }}>EM HOMOLOGAÇÃO</span>}
                      {!row.in_process && row.invited && <span style={{ fontSize:9.5, fontWeight:700, color:'#1d4ed8', background:'#dbeafe', padding:'2px 8px', borderRadius:20 }}>CONVIDADO</span>}
                      {row.status === 'ARCHIVED' && <span style={{ fontSize:9.5, fontWeight:700, color:'#64748b', background:'#f1f5f9', padding:'2px 8px', borderRadius:20 }}>ARQUIVADO</span>}
                    </div>
                    <div style={{ fontSize:12, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', marginTop:2 }}>
                      {[fmtCnpj(row.cnpj), row.city && row.state ? `${row.city}/${row.state}` : null,
                        `Pré-cadastro em ${new Date(row.created_at).toLocaleDateString('pt-BR')}`].filter(Boolean).join(' · ')}
                    </div>
                    {row.cnae_main && <div style={{ fontSize:12, color:'#64748b', fontFamily:'DM Sans,sans-serif', marginTop:2 }}>CNAE principal: {row.cnae_main}</div>}
                    {row.q_total > 0 && (
                      <button onClick={() => toggleQuestionario(row)}
                        style={{ marginTop:8, background:'none', border:'none', padding:0, cursor:'pointer', fontSize:12.5, fontWeight:700, fontFamily:'DM Sans,sans-serif',
                          color: row.q_answered >= row.q_total ? '#15803d' : row.q_answered > 0 ? '#b45309' : '#9B9B9B' }}>
                        ❓ Questionário: {row.q_answered} de {row.q_total} respondidas {aberto === row.supplier_id ? '▴' : '▾'}
                      </button>
                    )}
                  </div>
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap', justifyContent:'flex-end' }}>
                    <Button variant="neutral" size="sm" onClick={() => navigate(`/cliente/perfil-fornecedor/${row.supplier_id}`)}>👁 Ficha</Button>
                    {!row.in_process && <Button variant="primary" size="sm" onClick={() => invite(row)}>📨 {row.invited ? 'Convidar de novo' : 'Enviar Convite'}</Button>}
                    {row.status === 'ARCHIVED'
                      ? <Button variant="neutral" size="sm" disabled={acting === row.id} onClick={() => mudarStatus(row, 'ACTIVE')}>{acting === row.id ? '⏳' : '↩ Reativar'}</Button>
                      : <Button variant="danger"  size="sm" disabled={acting === row.id} onClick={() => mudarStatus(row, 'ARCHIVED')}>{acting === row.id ? '⏳' : '🗄 Arquivar'}</Button>}
                  </div>
                </div>
                {aberto === row.supplier_id && (
                  <div style={{ marginTop:14, borderTop:'1px solid #eef0f6', paddingTop:12 }}>
                    {!qa ? <Spinner size={20}/> : qa.length === 0
                      ? <div style={{ fontSize:12.5, color:'#9B9B9B' }}>Sem questionário ativo.</div>
                      : qa.map((a, i) => (
                        <div key={i} style={{ display:'flex', gap:10, padding:'6px 0', borderBottom: i < qa.length - 1 ? '1px dashed #eef0f6' : 'none', fontSize:12.5, fontFamily:'DM Sans,sans-serif' }}>
                          <span style={{ flex:1, color:'#374151' }}>{a.question}{a.required && <span style={{ color:'#dc2626' }}> *</span>}</span>
                          <span style={{ flex:1, fontWeight:600, color: a.answered_at ? '#1a1c5e' : '#cbd5e1', whiteSpace:'pre-wrap' }}>{a.answered_at ? resposta(a) : 'sem resposta'}</span>
                        </div>
                      ))}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </>
  )
}
