// BC Report — starter de emissão (backoffice) · handoff docs/BC_REPORT_AUTO_HANDOFF.md
// Digita o CNPJ, escolhe o modelo (Light/Full) e a emissão entra na fila
// report_requests. A coleta/render é do orquestrador (estágios 2–7); esta
// tela mostra o status honesto de cada request e o histórico por CNPJ.
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase.js'
import { Button, Card, Spinner, PageHeader, SectionTitle } from '../../components/ui.jsx'

const fmtCnpj = (v) => {
  const d = String(v || '').replace(/\D/g, '').slice(0, 14)
  if (d.length <= 2) return d
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}

const STATUS_META = {
  pending:      { label: 'Na fila',            color: '#64748b', icon: '⏳' },
  collecting:   { label: 'Coletando fontes',   color: '#2E3192', icon: '🔎' },
  rendering:    { label: 'Gerando PDF',        color: '#7c3aed', icon: '🖨' },
  done:         { label: 'Concluído',          color: '#15803d', icon: '✅' },
  done_partial: { label: 'Concluído (parcial)',color: '#b45309', icon: '⚠️' },
  failed:       { label: 'Falhou',             color: '#dc2626', icon: '✕' },
  canceled:     { label: 'Cancelado',          color: '#9B9B9B', icon: '◌' },
}
const BAND_COLOR = { baixo: '#15803d', medio: '#b45309', alto: '#ea580c', critico: '#dc2626' }

async function callApi(method, payload) {
  const { data: { session } } = await supabase.auth.getSession()
  const url = method === 'GET' && payload?.cnpj
    ? `/.netlify/functions/bc-report?cnpj=${payload.cnpj}` : '/.netlify/functions/bc-report'
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
    body: method === 'POST' ? JSON.stringify(payload) : undefined,
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Erro')
  return data
}

const MODELS = [
  {
    tipo: 'light', nome: 'BC Report Light', icone: '⚡',
    desc: '1 página · identidade fiscal, certidões federais, listas restritivas, score de crédito e parecer resumido.',
    fontes: 'CNPJ · CND Federal · FGTS · CNDT · CEIS/CNEP/CEPIM · Lista Suja · OFAC/ONU · Assertiva · mídia negativa',
  },
  {
    tipo: 'full', nome: 'BC Report Full', icone: '📚',
    desc: 'Dossiê multi-página em 5 aspectos — Identidade, Integridade, Listas Restritivas, Jurídico e Financeiro — com evidências anexadas.',
    fontes: 'Tudo do Light + Sefaz/Prefeitura · CGU · CNJ · MPT/MPF · IBAMA · Simples · Sintegra · DataJud · PEP/TSE/ICIJ · mídia de sócios',
  },
]

export default function BcReport() {
  const [cnpj, setCnpj]     = useState('')
  const [tipo, setTipo]     = useState('light')
  const [prices, setPrices] = useState({})
  const [busy, setBusy]     = useState(false)
  const [msg, setMsg]       = useState(null)     // { ok, texto }
  const [rows, setRows]     = useState(null)
  const [filterCnpj, setFilterCnpj] = useState('')

  useEffect(() => {
    supabase.from('bc_config').select('key, value')
      .in('key', ['price_light', 'price_full', 'price_full_conv'])
      .then(({ data }) => setPrices(Object.fromEntries((data || []).map(r => [r.key, r.value?.brl]))))
  }, [])

  const load = useCallback(async (cnpjFilter) => {
    try {
      const d = await callApi('GET', cnpjFilter ? { cnpj: cnpjFilter.replace(/\D/g, '') } : undefined)
      setRows(d.rows)
    } catch (e) { setMsg({ ok: false, texto: e.message }) }
  }, [])
  useEffect(() => { load(filterCnpj) }, [load, filterCnpj])

  // enquanto houver request em andamento, cutuca o worker e atualiza a cada
  // 10s (no branch deploy não há scheduled function — o gatilho é a tela;
  // em produção o cron 1/min cobre mesmo com a tela fechada)
  useEffect(() => {
    if (!rows?.some(r => ['pending', 'collecting', 'rendering'].includes(r.status))) return
    let tick = 0
    const kick = async () => {
      if (tick++ % 3 === 0) { // worker a cada ~30s; refresh a cada 10s
        try {
          const { data: { session } } = await supabase.auth.getSession()
          fetch('/.netlify/functions/bc-report-worker', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
            body: '{}',
          }).catch(() => {})
        } catch { /* melhor-esforço */ }
      }
      load(filterCnpj)
    }
    kick()
    const t = setInterval(kick, 10000)
    return () => clearInterval(t)
  }, [rows, load, filterCnpj])

  const emitir = async () => {
    const digits = cnpj.replace(/\D/g, '')
    if (digits.length !== 14) { setMsg({ ok: false, texto: 'Informe um CNPJ válido (14 dígitos).' }); return }
    setBusy(true); setMsg(null)
    try {
      const d = await callApi('POST', { cnpj: digits, tipo })
      setMsg(d.duplicated
        ? { ok: true, texto: 'Já existe uma emissão em andamento para este CNPJ/modelo — acompanhe abaixo.' }
        : { ok: true, texto: `Emissão ${tipo === 'light' ? 'Light' : 'Full'} enfileirada (R$ ${Number(d.request.price_brl || 0).toFixed(2).replace('.', ',')}).` })
      setFilterCnpj(cnpj)
      await load(cnpj)
    } catch (e) { setMsg({ ok: false, texto: e.message }) }
    setBusy(false)
  }

  const abrirPdf = async (r) => {
    const { data } = await supabase.storage.from('bc-reports').createSignedUrl(r.pdf_path, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1000, margin: '0 auto' }}>
      <PageHeader title="BC Report" subtitle="Background check automatizado — emita o relatório digitando o CNPJ" />

      {/* ── Starter de emissão ── */}
      <Card style={{ borderRadius: 16, padding: '24px 28px', marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginBottom: 16 }}>
          {MODELS.map(mdl => {
            const sel = tipo === mdl.tipo
            const preco = mdl.tipo === 'light' ? prices.price_light : prices.price_full
            return (
              <button key={mdl.tipo} onClick={() => setTipo(mdl.tipo)}
                style={{ textAlign: 'left', padding: '16px 18px', borderRadius: 14, cursor: 'pointer',
                  border: `2px solid ${sel ? '#2E3192' : '#e2e4ef'}`,
                  background: sel ? 'rgba(46,49,146,.05)' : '#fff', transition: 'all .15s' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: 15, color: '#1a1c5e' }}>
                    {mdl.icone} {mdl.nome}
                  </span>
                  {preco != null && (
                    <span style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: 14, color: '#F47E2F' }}>
                      R$ {Number(preco).toFixed(0)}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12.5, color: '#374151', fontFamily: 'DM Sans,sans-serif', lineHeight: 1.5 }}>{mdl.desc}</div>
                <div style={{ fontSize: 11, color: '#9B9B9B', fontFamily: 'DM Sans,sans-serif', marginTop: 8, lineHeight: 1.4 }}>
                  <strong>Fontes:</strong> {mdl.fontes}
                </div>
              </button>
            )
          })}
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <span style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#9B9B9B', fontFamily: 'Montserrat,sans-serif', letterSpacing: .5, textTransform: 'uppercase', marginBottom: 4 }}>CNPJ da empresa</span>
            <input value={cnpj} onChange={e => setCnpj(fmtCnpj(e.target.value))}
              placeholder="00.000.000/0000-00"
              onKeyDown={e => { if (e.key === 'Enter') emitir() }}
              style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '1px solid #e2e4ef', fontFamily: 'DM Sans,sans-serif', fontSize: 15, boxSizing: 'border-box', outline: 'none' }} />
          </div>
          <Button variant="orange" size="lg" disabled={busy} onClick={emitir} style={{ borderRadius: 10 }}>
            {busy ? '⏳ Enfileirando...' : `🚀 Emitir ${tipo === 'light' ? 'Light' : 'Full'}`}
          </Button>
        </div>

        {msg && (
          <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 10, fontSize: 13, fontFamily: 'DM Sans,sans-serif',
            background: msg.ok ? 'rgba(34,197,94,.08)' : '#fee2e2',
            border: `1px solid ${msg.ok ? '#86efac' : '#fca5a5'}`,
            color: msg.ok ? '#15803d' : '#dc2626' }}>
            {msg.texto}
          </div>
        )}
        <div style={{ marginTop: 12, fontSize: 11, color: '#9B9B9B', fontFamily: 'DM Sans,sans-serif' }}>
          🔧 Pipeline de coleta em desenvolvimento (estágios 2–7 do handoff): as emissões entram na fila e serão
          processadas automaticamente quando o orquestrador estiver no ar. Assertiva reaproveita consultas com
          menos de 30 dias; Full emitido até 30 dias após um Light do mesmo CNPJ sai pelo preço de conversão.
        </div>
      </Card>

      {/* ── Histórico ── */}
      <Card style={{ borderRadius: 16, padding: '20px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <SectionTitle style={{ marginBottom: 0 }}>Emissões</SectionTitle>
          <input value={filterCnpj} onChange={e => setFilterCnpj(fmtCnpj(e.target.value))}
            placeholder="Filtrar por CNPJ..."
            style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid #e2e4ef', fontFamily: 'DM Sans,sans-serif', fontSize: 12, width: 200 }} />
        </div>
        {!rows ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}><Spinner size={28} /></div>
        ) : rows.length === 0 ? (
          <div style={{ fontSize: 13, color: '#9B9B9B', fontStyle: 'italic', padding: '16px 0' }}>Nenhuma emissão ainda.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, fontFamily: 'DM Sans,sans-serif' }}>
            <thead>
              <tr style={{ color: '#9B9B9B', textAlign: 'left', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: .5, fontFamily: 'Montserrat,sans-serif' }}>
                <th style={{ padding: '6px 4px' }}>CNPJ</th>
                <th style={{ padding: '6px 4px' }}>Modelo</th>
                <th style={{ padding: '6px 4px' }}>Status</th>
                <th style={{ padding: '6px 4px' }}>Score</th>
                <th style={{ padding: '6px 4px', textAlign: 'right' }}>Custo</th>
                <th style={{ padding: '6px 4px', textAlign: 'right' }}>Preço</th>
                <th style={{ padding: '6px 4px' }}>Solicitado</th>
                <th style={{ padding: '6px 4px', textAlign: 'right' }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const meta = STATUS_META[r.status] || STATUS_META.pending
                return (
                  <tr key={r.id} style={{ borderTop: '1px solid #eef0f6', color: '#1a1c5e' }}>
                    <td style={{ padding: '8px 4px', whiteSpace: 'nowrap' }}>{fmtCnpj(r.cnpj)}</td>
                    <td style={{ padding: '8px 4px' }}>{r.tipo === 'light' ? '⚡ Light' : '📚 Full'}</td>
                    <td style={{ padding: '8px 4px' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: meta.color, background: `${meta.color}15`, padding: '2px 10px', borderRadius: 20, fontFamily: 'Montserrat,sans-serif', whiteSpace: 'nowrap' }}>
                        {meta.icon} {meta.label}
                      </span>
                      {r.error && <div style={{ fontSize: 10, color: '#dc2626', marginTop: 2 }}>{String(r.error).slice(0, 60)}</div>}
                    </td>
                    <td style={{ padding: '8px 4px' }}>
                      {r.score_eqpi != null
                        ? <span style={{ fontWeight: 800, color: BAND_COLOR[r.risk_band] || '#1a1c5e', fontFamily: 'Montserrat,sans-serif' }}>
                            {r.score_eqpi}<span style={{ fontWeight: 400, color: '#9B9B9B' }}>/100 · {r.risk_band}</span>
                          </span>
                        : '—'}
                    </td>
                    <td style={{ padding: '8px 4px', textAlign: 'right', color: '#64748b' }}>
                      {r.cost_brl > 0 ? `R$ ${Number(r.cost_brl).toFixed(2).replace('.', ',')}` : '—'}
                    </td>
                    <td style={{ padding: '8px 4px', textAlign: 'right' }}>
                      {r.price_brl != null ? `R$ ${Number(r.price_brl).toFixed(0)}` : '—'}
                    </td>
                    <td style={{ padding: '8px 4px', whiteSpace: 'nowrap', color: '#64748b' }}>
                      {new Date(r.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td style={{ padding: '8px 4px', textAlign: 'right' }}>
                      {r.pdf_path && <Button variant="primary" size="sm" onClick={() => abrirPdf(r)}>📄 PDF</Button>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
