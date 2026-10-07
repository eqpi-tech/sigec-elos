// Quadro "Coleta automática" (Rota A — evidência para o backoffice, 28/09):
// por documento, a fonte oficial consultada, a situação, o resultado, as
// tentativas e o custo; ao clicar, o histórico de cada tentativa.
import { useState, useEffect } from 'react'
import { routeAApi, ROUTE_A_ENABLED } from '../services/api.js'

const FONTE = {
  receita_cadastro: 'Receita Federal — base pública (grátis)', receita_simples: 'Receita Federal — Simples (base pública, grátis)',
  cartao_cnpj: 'Receita Federal — Cartão CNPJ (Infosimples)', simples: 'Receita Federal — Simples (Infosimples)',
  sintegra: 'Sintegra — Sefaz da UF', pgfn_cnd: 'Receita/PGFN — CND Federal', fgts_crf: 'Caixa — CRF FGTS', cndt: 'TST — CNDT',
  sefaz_cnd: 'Sefaz — CND Estadual', pref_cnd: 'Prefeitura — CND Municipal', pgfn_devedores: 'PGFN — Dívida Ativa da União',
  trabalho_escravo: 'MTE — Lista Suja (base local, grátis)', falencia_rj: 'TST — Banco Nacional de Falências',
  ibama_cr: 'IBAMA — Certificado de Regularidade (CTF)', pf_seguranca: 'Polícia Federal — Segurança Privada (gov.br)',
}
const SITUACAO = {
  done:     { label: '✅ Obtido',            color: '#15803d', bg: '#dcfce7' },
  fallback: { label: '📤 Com o fornecedor',  color: '#b45309', bg: '#fef3c7' },
  retry:    { label: '🔁 Nova tentativa',    color: '#2563eb', bg: '#dbeafe' },
  queued:   { label: '⏳ Na fila',           color: '#6b7280', bg: '#f3f4f6' },
  running:  { label: '🔎 Consultando',       color: '#2E3192', bg: 'rgba(46,49,146,.08)' },
}
const SUG = { aprovar: '✓ sugere aprovar', reprovar: '✕ sugere reprovar', revisar: '? revisar' }
const dt = (v) => (v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—')
const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function AutoCollectPanel({ supplierId, sealId = null, docNames = {}, docs = [] }) {
  const [jobs, setJobs] = useState([])
  const [aberto, setAberto] = useState(null)
  const [recolhido, setRecolhido] = useState(true)   // sempre inicia fechado (pedido 28/09)
  useEffect(() => { if (supplierId) routeAApi.collectJobs(supplierId).then(setJobs) }, [supplierId])
  if (!ROUTE_A_ENABLED) return null
  const lista = sealId ? jobs.filter((j) => j.seal_id === sealId) : jobs
  if (!lista.length) return null

  const porTipo = Object.fromEntries((docs || []).map((d) => [String(d.type), d]))
  const conta = (s) => lista.filter((j) => j.status === s).length
  const custo = lista.reduce((a, j) => a + Number(j.cost_brl || 0), 0)
  const inicio = lista.reduce((m, j) => (!m || j.created_at < m ? j.created_at : m), null)
  const fim = lista.every((j) => j.finished_at) ? lista.reduce((m, j) => (!m || j.finished_at > m ? j.finished_at : m), null) : null
  const th = { textAlign: 'left', padding: '6px 8px', fontSize: 10, color: '#9B9B9B', fontFamily: 'Montserrat,sans-serif', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, borderBottom: '1px solid #eef0f6' }
  const td = { padding: '7px 8px', fontSize: 12, color: '#374151', fontFamily: 'DM Sans,sans-serif', borderBottom: '1px solid #f4f5f9', verticalAlign: 'top' }

  return (
    <div style={{ border: '1px solid rgba(46,49,146,.18)', borderRadius: 12, padding: '12px 14px', marginBottom: 12, background: '#fafbff' }}>
      <div onClick={() => setRecolhido((r) => !r)} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: 13, color: '#1a1c5e' }}>⚙️ Coleta automática nas fontes oficiais (Rota A)</div>
          <div style={{ fontFamily: 'DM Sans,sans-serif', fontSize: 11.5, color: '#6b7280', marginTop: 2 }}>
            {conta('done')} obtido(s) · {conta('fallback')} com o fornecedor · {conta('retry') + conta('queued') + conta('running')} em andamento
            {' · '}custo {brl(custo)} · {dt(inicio)}{fim ? ` → ${dt(fim)}` : ' → em andamento'}
          </div>
        </div>
        <span style={{ color: '#9B9B9B', fontSize: 12 }}>{recolhido ? '▼' : '▲'}</span>
      </div>
      {!recolhido && (
        <div style={{ overflowX: 'auto', marginTop: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={th}>Documento</th><th style={th}>Fonte consultada</th><th style={th}>Situação</th>
              <th style={th}>Resultado</th><th style={th}>Tent.</th><th style={th}>Custo</th><th style={th}>Atualizado</th>
            </tr></thead>
            <tbody>
              {lista.map((j) => {
                const st = SITUACAO[j.status] || SITUACAO.queued
                const d = porTipo[j.doc_type]
                const c = d?.metadata?.route === 'A' ? d.metadata.consulta : null
                const resultado = c ? `${SUG[c.sugestao] || c.sugestao} — ${c.motivo || ''}` : (j.last_error || '—')
                const hist = Array.isArray(j.history) ? j.history : []
                return [
                  <tr key={j.id} onClick={() => setAberto(aberto === j.id ? null : j.id)} style={{ cursor: hist.length ? 'pointer' : 'default' }}>
                    <td style={{ ...td, fontWeight: 700, color: '#1a1c5e' }}>{j.doc_name || docNames[j.doc_type] || d?.label || `Doc ${j.doc_type}`}</td>
                    <td style={td}>{FONTE[j.fonte] || j.fonte || '—'}</td>
                    <td style={td}>
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: st.color, background: st.bg, padding: '2px 8px', borderRadius: 20, whiteSpace: 'nowrap' }}>{st.label}</span>
                      {j.status === 'retry' && j.next_attempt_at && <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>às {dt(j.next_attempt_at)}</div>}
                    </td>
                    <td style={{ ...td, maxWidth: 380 }} title={resultado}>{resultado.length > 160 ? `${resultado.slice(0, 157)}…` : resultado}</td>
                    <td style={td}>{j.attempts}{hist.length ? ' ▾' : ''}</td>
                    <td style={td}>{brl(j.cost_brl)}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{dt(j.finished_at || j.created_at)}</td>
                  </tr>,
                  aberto === j.id && hist.length > 0 && (
                    <tr key={`${j.id}-h`}><td colSpan={7} style={{ ...td, background: '#fff' }}>
                      {hist.map((h, i) => (
                        <div key={i} style={{ fontSize: 11.5, padding: '3px 0' }}>
                          <strong>{dt(h.em)}</strong> · {(SITUACAO[h.resultado] || {}).label || h.resultado}
                          {h.sugestao ? ` · ${SUG[h.sugestao] || h.sugestao}` : ''}{h.motivo ? ` · ${h.motivo}` : ''}
                          {' · '}{brl(h.custo)}{h.resumo ? ` · (resumo de ${h.tentativas || 1} tentativa(s) anteriores ao histórico)` : ''}
                        </div>
                      ))}
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
