// Relatório de status dos documentos do CLIENTE (29/10, pedido VIX — patch_165):
// fornecedor × documento exigido no processo, com situação, vencimento, envio e
// motivo da reprovação. Filtros na tela; o Excel leva exatamente o que está
// filtrado (mesmo padrão de Meus Fornecedores e Convites).
import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { clientApi } from '../../services/api.js'
import { Card, Spinner, Button } from '../../components/ui.jsx'
import { MultiChips, FilterPanel } from '../../components/FilterChips.jsx'
import { exportXlsx } from '../../lib/exportXlsx.js'
import { formatCnpj, normalizeCnpj } from '../../lib/cnpj.js'

const SIT = {
  VALID:          { label: 'Válido',        color: '#15803d' },
  EXPIRING:       { label: 'A vencer',      color: '#b45309' },
  PENDING:        { label: 'Em análise',    color: '#2563eb' },
  MISSING:        { label: 'Não enviado',   color: '#64748b' },
  REJECTED:       { label: 'Reprovado',     color: '#dc2626' },
  EXPIRED:        { label: 'Vencido',       color: '#9f1239' },
  NOT_APPLICABLE: { label: 'Não se aplica', color: '#94a3b8' },
}
const PROC = { ACTIVE: 'Homologado', PENDING: 'Em homologação', SUSPENDED: 'Suspenso / reprovado' }
const RESP = { fornecedor: 'Fornecedor', interna: 'EQPI', cliente: 'Cliente' }
// data sem hora ('AAAA-MM-DD') em pt-BR, sem o deslocamento de fuso
const fmtD = (v) => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '')
const MAX_TELA = 500

export default function DocumentsStatusReport({ flowNames = {} }) {
  const navigate = useNavigate()
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState('')
  const [busca, setBusca] = useState('')
  const [fSit, setFSit] = useState([])
  const [fProc, setFProc] = useState([])
  const [fResp, setFResp] = useState([])
  const [fNivel, setFNivel] = useState([])
  const [fDoc, setFDoc] = useState('')
  const [venceAte, setVenceAte] = useState('')

  useEffect(() => {
    clientApi.documentsStatus().then(setRows).catch(e => setErr(e.message))
  }, [])

  const docs = useMemo(() => [...new Set((rows || []).map(r => r.documento))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [rows])
  const filtrados = useMemo(() => (rows || []).filter(r => {
    const q = busca.trim().toLowerCase()
    if (q && !(r.razao_social || '').toLowerCase().includes(q) && !(normalizeCnpj(q) && normalizeCnpj(r.cnpj || '').includes(normalizeCnpj(q)))) return false
    if (fSit.length && !fSit.includes(r.situacao)) return false
    if (fProc.length && !fProc.includes(r.processo)) return false
    if (fResp.length && !fResp.includes(r.responsavel)) return false
    if (fNivel.length && !fNivel.includes(r.flow_id || 'sem')) return false
    if (fDoc && r.documento !== fDoc) return false
    if (venceAte && !(r.vencimento && r.vencimento <= venceAte)) return false
    return true
  }), [rows, busca, fSit, fProc, fResp, fNivel, fDoc, venceAte])

  if (err) return <Card style={{ padding: 20, borderRadius: 14, color: '#dc2626', fontSize: 13 }}>Erro ao carregar: {err}</Card>
  if (!rows) return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner size={36} /></div>

  const conta = (fn) => rows.filter(fn).length
  const ativos = !!(busca || fSit.length || fProc.length || fResp.length || fNivel.length || fDoc || venceAte)
  const limpar = () => { setBusca(''); setFSit([]); setFProc([]); setFResp([]); setFNivel([]); setFDoc(''); setVenceAte('') }
  const niveis = [...new Set(rows.map(r => r.flow_id || 'sem'))]
  const fornecedores = new Set(filtrados.map(r => r.supplier_id)).size

  const exportar = () => exportXlsx('status-dos-documentos', 'Status dos documentos', filtrados.map(r => ({
    'Fornecedor': r.razao_social || '',
    'CNPJ': formatCnpj(r.cnpj || ''),
    'Processo': PROC[r.processo] || r.processo,
    'Nível': r.flow_id ? (flowNames[r.flow_id] || '') : '',
    'Documento': r.documento,
    'Responsável': RESP[r.responsavel] || r.responsavel || '',
    'Situação': SIT[r.situacao]?.label || r.situacao,
    'Vencimento': fmtD(r.vencimento),
    'Enviado em': r.enviado_em && r.situacao !== 'MISSING' ? new Date(r.enviado_em).toLocaleDateString('pt-BR') : '',
    'Analisado em': r.analisado_em ? new Date(r.analisado_em).toLocaleDateString('pt-BR') : '',
    'Motivo da reprovação': r.motivo || '',
  })))

  const inp = { padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e4ef', fontFamily: 'DM Sans,sans-serif', fontSize: 13, color: '#1a1c5e' }
  return (
    <div>
      <FilterPanel total={rows.length} shown={filtrados.length} active={ativos} onClear={limpar}>
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar fornecedor por nome ou CNPJ..." style={{ ...inp, width: '100%', boxSizing: 'border-box' }} />
        <MultiChips label="Situação" value={fSit} onChange={setFSit}
          options={Object.entries(SIT).map(([v, o]) => ({ value: v, label: o.label, color: o.color, count: conta(r => r.situacao === v) })).filter(o => o.count > 0)} />
        <MultiChips label="Processo" value={fProc} onChange={setFProc}
          options={Object.entries(PROC).map(([v, l]) => ({ value: v, label: l, count: conta(r => r.processo === v) })).filter(o => o.count > 0)} />
        {niveis.length > 1 && (
          <MultiChips label="Nível" value={fNivel} onChange={setFNivel}
            options={niveis.map(v => ({ value: v, label: v === 'sem' ? 'Sem nível' : (flowNames[v] || 'Nível'), count: conta(r => (r.flow_id || 'sem') === v) }))} />
        )}
        <MultiChips label="Responsável" value={fResp} onChange={setFResp}
          options={Object.entries(RESP).map(([v, l]) => ({ value: v, label: l, count: conta(r => r.responsavel === v) })).filter(o => o.count > 0)} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <select value={fDoc} onChange={e => setFDoc(e.target.value)} style={{ ...inp, maxWidth: 420 }}>
            <option value="">Todos os documentos</option>
            {docs.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <span style={{ fontFamily: 'DM Sans,sans-serif', fontSize: 12, color: '#64748b' }}>Vence até</span>
          <input type="date" value={venceAte} onChange={e => setVenceAte(e.target.value)} style={{ ...inp, width: 160 }} />
        </div>
      </FilterPanel>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '-4px 0 12px', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'DM Sans,sans-serif', fontSize: 12, color: '#64748b' }}>
          {filtrados.length.toLocaleString('pt-BR')} documentos de {fornecedores.toLocaleString('pt-BR')} fornecedor{fornecedores !== 1 ? 'es' : ''}
          {filtrados.length > MAX_TELA ? ` · a tela mostra os ${MAX_TELA} primeiros; o Excel leva todos` : ''}
        </span>
        <Button variant="neutral" size="sm" onClick={exportar} title="Exporta a lista com os filtros aplicados">⬇ Exportar Excel ({filtrados.length.toLocaleString('pt-BR')})</Button>
      </div>

      <Card style={{ borderRadius: 14, padding: 0, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'DM Sans,sans-serif', fontSize: 12.5 }}>
          <thead>
            <tr style={{ background: '#f8faff', textAlign: 'left', color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: .4 }}>
              {['Fornecedor', 'Documento', 'Situação', 'Vencimento', 'Enviado em', 'Processo'].map(h => <th key={h} style={{ padding: '10px 12px', fontWeight: 700 }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {filtrados.slice(0, MAX_TELA).map((r, i) => (
              <tr key={`${r.seal_id}-${r.doc_id}-${i}`} style={{ borderTop: '1px solid #f0f2f8', cursor: 'pointer' }}
                onClick={() => navigate(`/cliente/fornecedor/${r.supplier_id}`)} title="Abrir o processo do fornecedor">
                <td style={{ padding: '9px 12px', color: '#1a1c5e', fontWeight: 600 }}>{r.razao_social}<div style={{ fontWeight: 400, fontSize: 11, color: '#9B9B9B' }}>{formatCnpj(r.cnpj || '')}</div></td>
                <td style={{ padding: '9px 12px', color: '#374151' }}>{r.documento}{r.responsavel && r.responsavel !== 'fornecedor' && <span style={{ fontSize: 10, color: '#9B9B9B' }}> · {RESP[r.responsavel]}</span>}
                  {r.motivo && <div style={{ fontSize: 11, color: '#dc2626', marginTop: 2 }}>Motivo: {r.motivo}</div>}</td>
                <td style={{ padding: '9px 12px' }}><span style={{ fontSize: 11, fontWeight: 700, color: SIT[r.situacao]?.color || '#64748b', background: `${SIT[r.situacao]?.color || '#64748b'}14`, padding: '3px 9px', borderRadius: 20, whiteSpace: 'nowrap' }}>{SIT[r.situacao]?.label || r.situacao}</span></td>
                <td style={{ padding: '9px 12px', color: '#374151', whiteSpace: 'nowrap' }}>{fmtD(r.vencimento) || '—'}</td>
                <td style={{ padding: '9px 12px', color: '#374151', whiteSpace: 'nowrap' }}>{r.enviado_em && r.situacao !== 'MISSING' ? new Date(r.enviado_em).toLocaleDateString('pt-BR') : '—'}</td>
                <td style={{ padding: '9px 12px', color: '#64748b', whiteSpace: 'nowrap' }}>{PROC[r.processo] || r.processo}</td>
              </tr>
            ))}
            {filtrados.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 28, textAlign: 'center', color: '#9B9B9B' }}>Nenhum documento com os filtros aplicados.</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
