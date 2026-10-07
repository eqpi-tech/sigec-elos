// Quadro "Pré-análise por IA" (Rota B — evidência para o backoffice, 28/09):
// por arquivo enviado, a sugestão da IA, a confiança, a decisão do analista
// (concorda/diverge) e o custo; ao clicar, a checklist com as evidências.
// Mesmo formato do quadro da Rota A (AutoCollectPanel); sempre inicia fechado.
import { useState } from 'react'
import { ROUTE_B_ENABLED } from '../services/api.js'
import { SUG_IA, Checklist } from './RouteBReview.jsx'

const SITUACAO = {
  done:    { label: '✅ Analisado',   color: '#15803d', bg: '#dcfce7' },
  queued:  { label: '⏳ Na fila',     color: '#6b7280', bg: '#f3f4f6' },
  running: { label: '🔎 Analisando',  color: '#2E3192', bg: 'rgba(46,49,146,.08)' },
  retry:   { label: '🔁 Nova tentativa', color: '#2563eb', bg: '#dbeafe' },
  skipped: { label: '⤼ Não analisado', color: '#6b7280', bg: '#f3f4f6' },
  error:   { label: '⚠ Falhou',       color: '#b91c1c', bg: '#fee2e2' },
}
const DECISAO = { VALID: 'aprovou', REJECTED: 'reprovou', NOT_APPLICABLE: 'não se aplica' }
const MODO = { texto: 'texto (CPF/RG mascarados)', pdf: 'PDF escaneado', imagem: 'imagem' }
const dt = (v) => (v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—')
const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 3 })

// concordância: aprovar×aprovou e reprovar×reprovou concordam; "revisar" não conta
function concordancia(j) {
  if (!j.analyst_decision || j.status !== 'done') return null
  if (j.verdict === 'revisar') return 'revisar'
  const ia = j.verdict === 'aprovar' ? 'VALID' : 'REJECTED'
  return ia === j.analyst_decision ? 'concorda' : 'diverge'
}

export default function AiReviewPanel({ reviews = [] }) {
  const [aberto, setAberto] = useState(null)
  const [recolhido, setRecolhido] = useState(true)
  if (!ROUTE_B_ENABLED || !reviews.length) return null

  const conta = (f) => reviews.filter(f).length
  const custo = reviews.reduce((a, j) => a + Number(j.cost_brl || 0), 0)
  const decididos = reviews.filter((j) => concordancia(j) && concordancia(j) !== 'revisar')
  const concordam = decididos.filter((j) => concordancia(j) === 'concorda').length
  const th = { textAlign: 'left', padding: '6px 8px', fontSize: 10, color: '#9B9B9B', fontFamily: 'Montserrat,sans-serif', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, borderBottom: '1px solid #eef0f6' }
  const td = { padding: '7px 8px', fontSize: 12, color: '#374151', fontFamily: 'DM Sans,sans-serif', borderBottom: '1px solid #f4f5f9', verticalAlign: 'top' }

  return (
    <div style={{ border: '1px solid rgba(46,49,146,.18)', borderRadius: 12, padding: '12px 14px', marginBottom: 12, background: '#fafbff' }}>
      <div onClick={() => setRecolhido((r) => !r)} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: 13, color: '#1a1c5e' }}>🤖 Pré-análise por IA dos documentos enviados (Rota B)</div>
          <div style={{ fontFamily: 'DM Sans,sans-serif', fontSize: 11.5, color: '#6b7280', marginTop: 2 }}>
            {conta((j) => j.status === 'done')} analisado(s)
            {' '}({conta((j) => j.verdict === 'aprovar')} aprovar · {conta((j) => j.verdict === 'reprovar')} reprovar · {conta((j) => j.verdict === 'revisar')} revisar)
            {' · '}{conta((j) => ['queued', 'running', 'retry'].includes(j.status))} em andamento
            {decididos.length ? ` · analista concordou em ${concordam}/${decididos.length}` : ''}
            {' · '}custo {brl(custo)}
          </div>
        </div>
        <span style={{ color: '#9B9B9B', fontSize: 12 }}>{recolhido ? '▼' : '▲'}</span>
      </div>
      {!recolhido && (
        <div style={{ overflowX: 'auto', marginTop: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={th}>Documento</th><th style={th}>Situação</th><th style={th}>Sugestão da IA</th>
              <th style={th}>Analista</th><th style={th}>Leitura</th><th style={th}>Custo</th><th style={th}>Analisado</th>
            </tr></thead>
            <tbody>
              {reviews.map((j) => {
                const st = SITUACAO[j.status] || SITUACAO.queued
                const s = SUG_IA[j.verdict]
                const c = concordancia(j)
                const motivo = j.status === 'done' ? (j.result?.motivo_texto || '') : (j.last_error || '')
                return [
                  <tr key={j.id} onClick={() => setAberto(aberto === j.id ? null : j.id)} style={{ cursor: j.result ? 'pointer' : 'default' }}>
                    <td style={{ ...td, fontWeight: 700, color: '#1a1c5e', maxWidth: 260 }} title={j.doc_name || ''}>
                      {(j.doc_name || `Doc ${j.doc_type}`).slice(0, 60)}{(j.doc_name || '').length > 60 ? '…' : ''}
                      <div style={{ fontSize: 10, color: '#9B9B9B', fontWeight: 400 }}>enviado em {dt(j.created_at)}{j.requested_by ? ' · reanálise pedida' : ''}</div>
                    </td>
                    <td style={td}><span style={{ fontSize: 10.5, fontWeight: 700, color: st.color, background: st.bg, padding: '2px 8px', borderRadius: 20, whiteSpace: 'nowrap' }}>{st.label}</span></td>
                    <td style={{ ...td, maxWidth: 360 }} title={motivo}>
                      {s && <span style={{ fontWeight: 700, color: s.color }}>{s.icon} {s.label.replace('IA sugere ', '').replace('IA: ', '')}</span>}
                      {j.confidence != null && <span style={{ color: '#9B9B9B' }}> · {Math.round(j.confidence * 100)}%</span>}
                      {motivo && <div style={{ fontSize: 11, color: '#6b7280' }}>{motivo.length > 160 ? `${motivo.slice(0, 157)}…` : motivo}</div>}
                    </td>
                    <td style={td}>
                      {j.analyst_decision ? DECISAO[j.analyst_decision] || j.analyst_decision : '—'}
                      {c === 'concorda' && <div style={{ fontSize: 10.5, color: '#15803d', fontWeight: 700 }}>✓ concorda</div>}
                      {c === 'diverge' && <div style={{ fontSize: 10.5, color: '#b91c1c', fontWeight: 700 }}>✕ diverge</div>}
                    </td>
                    <td style={{ ...td, fontSize: 11 }}>{MODO[j.input_mode] || '—'}{j.pages ? ` · ${j.pages} pág.` : ''}</td>
                    <td style={td}>{brl(j.cost_brl)}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{dt(j.finished_at)}</td>
                  </tr>,
                  aberto === j.id && j.result && (
                    <tr key={`${j.id}-c`}><td colSpan={7} style={{ ...td, background: '#fff' }}>
                      <Checklist r={j.result}/>
                      <div style={{ fontSize: 10, color: '#9B9B9B', marginTop: 4 }}>
                        {j.model} · prompt {j.prompt_version}{j.result?.data_referencia ? ` · data de referência ${j.result.data_referencia.split('-').reverse().join('/')}` : ''}
                        {j.analyst_note ? ` · nota do analista: ${j.analyst_note}` : ''}
                      </div>
                    </td></tr>
                  ),
                ]
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
