// Relatório de aceite dos termos (11/11, chamado #755248 — pedido VIX): os
// fornecedores com processo ativo ou em andamento × termos vigentes do cliente.
// O mesmo componente no cliente e no backoffice (clientId só no backoffice).
// Excel: Resumo, Por fornecedor (uma coluna por termo) e Detalhe (um aceite por linha).
import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { reportsApi } from '../../services/api.js'
import { Card, Spinner, Button } from '../ui.jsx'
import { Tile } from '../charts.jsx'
import { exportXlsxSheets } from '../../lib/exportXlsx.js'
import { formatCnpj, normalizeCnpj } from '../../lib/cnpj.js'
import { dataBR } from '../../lib/reportRows.js'

const GERAL = {
  todos:     { label: 'Aceitou todos',        color: '#15803d' },
  parcial:   { label: 'Aceite parcial',       color: '#b45309' },
  nao:       { label: 'Não aceitou',          color: '#dc2626' },
  nao_acessou: { label: 'Ainda não acessou',  color: '#64748b' },
}
const PROC = { ACTIVE: 'Homologado', PENDING: 'Em homologação' }
const situacaoItem = (r) => r.versao_aceita == null ? 'Não aceito' : r.versao_aceita >= r.versao_atual ? 'Aceito' : `Aceitou versão anterior (v${r.versao_aceita})`

export default function TermsAcceptanceReport({ clientId, admin = false }) {
  const navigate = useNavigate()
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState('')
  const [busca, setBusca] = useState('')
  const [fGeral, setFGeral] = useState('')

  useEffect(() => {
    setRows(null)
    reportsApi.termsAcceptance(admin ? clientId : undefined).then(setRows).catch(e => setErr(e.message))
  }, [clientId, admin])

  // termos (colunas) e fornecedores (linhas)
  const termos = useMemo(() => {
    const m = new Map()
    for (const r of rows || []) if (!m.has(r.item_id)) m.set(r.item_id, { id: r.item_id, titulo: r.termo, versao: r.versao_atual, obrigatorio: r.obrigatorio, ordem: r.ordem })
    return [...m.values()].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || a.titulo.localeCompare(b.titulo, 'pt-BR'))
  }, [rows])
  const fornecedores = useMemo(() => {
    const m = new Map()
    for (const r of rows || []) {
      if (!m.has(r.supplier_id)) m.set(r.supplier_id, { id: r.supplier_id, razao: r.razao_social, cnpj: r.cnpj, processo: r.processo, acessou: r.acessou, itens: {} })
      m.get(r.supplier_id).itens[r.item_id] = r
    }
    const lista = [...m.values()]
    for (const f of lista) {
      const its = Object.values(f.itens)
      const obrig = its.filter(i => i.obrigatorio)
      const base = obrig.length ? obrig : its
      const vigentes = base.filter(i => i.versao_aceita != null && i.versao_aceita >= i.versao_atual).length
      const algum = its.some(i => i.versao_aceita != null)
      f.geral = vigentes === base.length && base.length ? 'todos' : algum ? 'parcial' : f.acessou ? 'nao' : 'nao_acessou'
    }
    return lista
  }, [rows])
  const filtrados = useMemo(() => fornecedores.filter(f => {
    const q = busca.trim().toLowerCase()
    if (q && !(f.razao || '').toLowerCase().includes(q) && !(normalizeCnpj(q) && normalizeCnpj(f.cnpj || '').includes(normalizeCnpj(q)))) return false
    if (fGeral && f.geral !== fGeral) return false
    return true
  }), [fornecedores, busca, fGeral])

  if (err) return <Card style={{ padding: 20, borderRadius: 14, color: '#dc2626', fontSize: 13 }}>Erro ao carregar: {err}</Card>
  if (!rows) return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner size={36} /></div>
  if (!termos.length) return <Card style={{ padding: 24, borderRadius: 14, fontSize: 13, color: '#6b7280' }}>Nenhum termo de aceite ativo para este cliente.</Card>

  const conta = (g) => fornecedores.filter(f => f.geral === g).length

  const exportar = () => {
    const contaF = (g) => filtrados.filter(f => f.geral === g).length
    const resumo = [
      { 'Indicador': 'Fornecedores considerados (processo ativo ou em andamento)', 'Quantidade': filtrados.length },
      ...Object.entries(GERAL).map(([k, v]) => ({ 'Indicador': v.label, 'Quantidade': contaF(k) })),
      ...termos.map(t => ({ 'Indicador': `Termo: ${t.titulo} (v${t.versao}) — aceitaram`, 'Quantidade': filtrados.filter(f => (f.itens[t.id]?.versao_aceita ?? -1) >= t.versao).length })),
      ...termos.map(t => ({ 'Indicador': `Termo: ${t.titulo} (v${t.versao}) — não aceitaram`, 'Quantidade': filtrados.filter(f => (f.itens[t.id]?.versao_aceita ?? -1) < t.versao).length })),
    ]
    const porFornecedor = filtrados.map(f => ({
      'Razão social': f.razao || '', 'CNPJ': formatCnpj(f.cnpj || ''), 'Processo': PROC[f.processo] || f.processo || '',
      'Situação do aceite': GERAL[f.geral].label,
      ...Object.fromEntries(termos.map(t => {
        const r = f.itens[t.id]
        const s = r ? situacaoItem(r) : 'Não aceito'
        return [t.titulo, s === 'Aceito' ? `Aceito em ${dataBR(r.aceito_em)}` : s]
      })),
    }))
    const detalhe = filtrados.flatMap(f => termos.map(t => {
      const r = f.itens[t.id] || {}
      return {
        'Razão social': f.razao || '', 'CNPJ': formatCnpj(f.cnpj || ''), 'Termo': t.titulo, 'Obrigatório': t.obrigatorio ? 'Sim' : 'Não',
        'Versão vigente': t.versao, 'Situação': r.item_id ? situacaoItem(r) : 'Não aceito',
        'Versão aceita': r.versao_aceita ?? '', 'Aceito em': dataBR(r.aceito_em), 'Aceito por': r.aceito_por || '', 'E-mail': r.aceito_email || '',
      }
    }))
    exportXlsxSheets('aceite-dos-termos', [
      { name: 'Resumo', rows: resumo }, { name: 'Por fornecedor', rows: porFornecedor }, { name: 'Detalhe', rows: detalhe },
    ])
  }

  const marca = (r, t) => {
    if (!r || r.versao_aceita == null) return <span style={{ color: '#dc2626' }} title="Não aceito">—</span>
    if (r.versao_aceita < t.versao) return <span style={{ color: '#b45309' }} title={`Aceitou a versão ${r.versao_aceita}; a vigente é a ${t.versao}`}>↺ v{r.versao_aceita}</span>
    return <span style={{ color: '#15803d' }} title={`Aceito em ${dataBR(r.aceito_em)} por ${r.aceito_por || r.aceito_email || ''}`}>✓ {dataBR(r.aceito_em)}</span>
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
        <Tile label="Fornecedores" value={fornecedores.length.toLocaleString('pt-BR')} sub="processo ativo ou em andamento" onClick={() => setFGeral('')} />
        {Object.entries(GERAL).map(([k, v]) => (
          <Tile key={k} label={v.label} value={conta(k).toLocaleString('pt-BR')} accent={v.color} onClick={() => setFGeral(fGeral === k ? '' : k)}
            sub={fGeral === k ? 'filtro aplicado — clique para limpar' : 'clique para filtrar'} />
        ))}
      </div>

      <Card style={{ borderRadius: 14, padding: '14px 18px', marginBottom: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por razão social ou CNPJ"
          style={{ flex: 1, minWidth: 220, padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e4ef', fontSize: 13, fontFamily: 'DM Sans,sans-serif' }} />
        {fGeral && <Button variant="neutral" size="sm" onClick={() => setFGeral('')}>Limpar filtro: {GERAL[fGeral].label}</Button>}
        <Button variant="primary" size="sm" onClick={exportar}>⬇ Exportar Excel ({filtrados.length})</Button>
      </Card>

      <Card style={{ borderRadius: 14, padding: 0, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, fontFamily: 'DM Sans,sans-serif' }}>
          <thead><tr>
            {['Fornecedor', 'Situação do aceite', ...termos.map(t => t.titulo)].map((c, i) => (
              <th key={i} title={c} style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '2px solid #eef0f6', color: '#6b7280', fontWeight: 700, maxWidth: i > 1 ? 130 : undefined, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c}</th>
            ))}
          </tr></thead>
          <tbody>{filtrados.slice(0, 500).map(f => (
            <tr key={f.id} style={{ borderBottom: '1px solid #f4f5f9' }}>
              <td style={{ padding: '8px 12px' }}>
                <button onClick={() => navigate(admin ? `/backoffice/analise/${f.id}` : `/cliente/fornecedor/${f.id}`)}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', color: '#1a1c5e', fontWeight: 700, fontFamily: 'DM Sans,sans-serif', fontSize: 12.5 }}>{f.razao}</button>
                <div style={{ fontSize: 11, color: '#9B9B9B' }}>{formatCnpj(f.cnpj || '')} · {PROC[f.processo] || f.processo}</div>
              </td>
              <td style={{ padding: '8px 12px', color: GERAL[f.geral].color, fontWeight: 700, whiteSpace: 'nowrap' }}>{GERAL[f.geral].label}</td>
              {termos.map(t => <td key={t.id} style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{marca(f.itens[t.id], t)}</td>)}
            </tr>
          ))}</tbody>
        </table>
        {filtrados.length > 500 && <div style={{ padding: '10px 14px', fontSize: 12, color: '#6b7280' }}>Mostrando 500 de {filtrados.length} na tela — o Excel leva todos.</div>}
      </Card>
      <div style={{ fontSize: 11.5, color: '#6b7280', fontFamily: 'DM Sans,sans-serif', marginTop: 8, lineHeight: 1.5 }}>
        "Ainda não acessou": fornecedor cadastrado que ainda não entrou na plataforma (por exemplo, pré-cadastro feito pela EQPI) — o aceite acontece no primeiro acesso.
        "Aceitou versão anterior": o termo foi atualizado depois do aceite.
      </div>
    </div>
  )
}
