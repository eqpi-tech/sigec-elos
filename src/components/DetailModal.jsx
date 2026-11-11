// Lista por trás de um indicador (11/11, chamado #755248): abre ao clicar num
// número do Dashboard ou dos Relatórios, com busca e "Exportar Excel" — o Excel
// leva exatamente as linhas filtradas. As linhas chegam prontas (lib/reportRows).
import { useState, useEffect, useMemo } from 'react'
import { Button, Spinner } from './ui.jsx'
import { exportXlsx } from '../lib/exportXlsx.js'

const MAX_TELA = 300

export default function DetailModal({ title, subtitle, load, rows: rowsProp, fileBase = 'lista', onClose }) {
  const [rows, setRows] = useState(rowsProp || null)
  const [err, setErr] = useState('')
  const [busca, setBusca] = useState('')

  useEffect(() => {
    if (rowsProp || !load) return
    load().then(setRows).catch(e => setErr(e.message))
  }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return rows || []
    const qd = q.replace(/\D/g, '')
    return (rows || []).filter(r => Object.values(r).some(v => {
      const t = String(v ?? '').toLowerCase()
      return t.includes(q) || (qd.length >= 3 && t.replace(/\D/g, '').includes(qd))
    }))
  }, [rows, busca])
  const cols = Object.keys((rows || [])[0] || {})

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,17,60,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: 'min(1100px, 100%)', maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,.3)' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid #eef0f6', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: 16, color: '#1a1c5e' }}>{title}</div>
            <div style={{ fontSize: 12, color: '#6b7280', fontFamily: 'DM Sans,sans-serif', marginTop: 2 }}>
              {rows ? `${filtradas.length.toLocaleString('pt-BR')} de ${rows.length.toLocaleString('pt-BR')} registro(s)` : 'Carregando…'}{subtitle ? ` · ${subtitle}` : ''}
            </div>
          </div>
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome, CNPJ…"
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e4ef', fontSize: 13, fontFamily: 'DM Sans,sans-serif', minWidth: 220 }} />
          <Button variant="primary" size="sm" disabled={!rows?.length} onClick={() => exportXlsx(fileBase, title, filtradas)}>⬇ Exportar Excel</Button>
          <button onClick={onClose} aria-label="Fechar" style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#9B9B9B' }}>×</button>
        </div>
        <div style={{ overflow: 'auto', padding: '4px 0' }}>
          {err ? <div style={{ padding: 20, color: '#dc2626', fontSize: 13 }}>Erro ao carregar: {err}</div>
          : !rows ? <div style={{ display: 'flex', justifyContent: 'center', padding: 50 }}><Spinner size={32} /></div>
          : !rows.length ? <div style={{ padding: 30, textAlign: 'center', color: '#9B9B9B', fontSize: 13, fontFamily: 'DM Sans,sans-serif' }}>Nenhum registro.</div>
          : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, fontFamily: 'DM Sans,sans-serif' }}>
              <thead><tr>{cols.map(c => <th key={c} style={{ textAlign: 'left', padding: '8px 12px', borderBottom: '2px solid #eef0f6', color: '#6b7280', fontWeight: 700, whiteSpace: 'nowrap', position: 'sticky', top: 0, background: '#fff' }}>{c}</th>)}</tr></thead>
              <tbody>{filtradas.slice(0, MAX_TELA).map((r, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f4f5f9' }}>{cols.map(c => <td key={c} style={{ padding: '7px 12px', color: '#1a1c5e', whiteSpace: c === 'Razão social' ? 'normal' : 'nowrap', minWidth: c === 'Razão social' ? 240 : undefined }}>{String(r[c] ?? '')}</td>)}</tr>
              ))}</tbody>
            </table>
          )}
          {rows && filtradas.length > MAX_TELA && (
            <div style={{ padding: '10px 14px', fontSize: 12, color: '#6b7280', fontFamily: 'DM Sans,sans-serif' }}>
              Mostrando {MAX_TELA} de {filtradas.length.toLocaleString('pt-BR')} na tela — o Excel leva todos.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
