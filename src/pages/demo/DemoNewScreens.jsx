// Demo · telas novas do refresh (30/09) para cliente e fornecedor:
// Relatórios (dashboard executivo), Compliance e Carta de Exceção.
// Dados fictícios.
import { useState } from 'react'
import { Card, Button, KpiCard, PageHeader, SectionTitle } from '../../components/ui.jsx'
import { MultiChips, FilterPanel } from '../../components/FilterChips.jsx'
import { DEMO_CLIENT_REPORTS, DEMO_COMPLIANCE, DEMO_CLIENT_SUPPLIERS, PRIMATUS, isoD, fmtBR } from './demoData.js'
import { FICHA, effStatus, useToast, exportRows } from './DemoFichaKit.jsx'

const M = 'Montserrat,sans-serif'
const D = 'DM Sans,sans-serif'
const wrap = { padding: '28px 32px', maxWidth: 1200, margin: '0 auto' }

function Barra({ label, value, max, color = '#2E3192' }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr 48px', gap: 10, alignItems: 'center', marginBottom: 8 }}>
      <span style={{ fontFamily: D, fontSize: 12.5, color: '#374151' }}>{label}</span>
      <div style={{ background: '#f1f2f8', borderRadius: 6, height: 12, overflow: 'hidden' }}>
        <div style={{ width: `${Math.round((value / max) * 100)}%`, height: '100%', background: color, borderRadius: 6 }}/>
      </div>
      <strong style={{ fontFamily: M, fontSize: 13, color: '#1a1c5e', textAlign: 'right' }}>{value}</strong>
    </div>
  )
}

// ── Cliente · Relatórios › 📄 Status dos documentos ────────────────────────
// (src/pages/client/DocumentsStatusReport.jsx) fornecedor × documento exigido
// no processo. Primatus = os documentos da ficha do processo; os demais são
// linhas fictícias. Situação "A vencer"/"Vencido" sai da data (relativa a hoje).
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
const CND = 'CND Tributos Federais e Dívida Ativa da União', CRF = 'Certidão de Regularidade do FGTS (CRF)', CNDT = 'CNDT Certidão Negativa de Débitos Trabalhistas', ALV = 'Alvará de Funcionamento'
// [fornecedor id, documento, status, vencimento (dias de hoje), enviado (dias de hoje), motivo, responsável]
const OUTRAS = [
  [2, CND, 'VALID', 140, -10], [2, CRF, 'VALID', 22, -10], [2, CNDT, 'VALID', 165, -10], [2, ALV, 'VALID', 300, -10],
  [2, 'Apólice de Seguro de Responsabilidade Civil', 'VALID', 210, -10], [2, 'Inscrição Municipal', 'NOT_APPLICABLE', null, null],
  [3, CND, 'PENDING', 170, -1], [3, CRF, 'MISSING', null, null], [3, CNDT, 'MISSING', null, null], [3, ALV, 'PENDING', null, -1],
  [4, CND, 'VALID', 120, -8], [4, CRF, 'VALID', 18, -8], [4, CNDT, 'VALID', 150, -8], [4, ALV, 'REJECTED', null, -30, 'Alvará não inclui a atividade de manutenção mecânica (coberto por carta de exceção)'],
  [5, CND, 'VALID', 90, -5], [5, CRF, 'PENDING', null, -2], [5, 'Contrato Social (último consolidado)', 'MISSING', null, null],
  [6, CND, 'VALID', 40, -120], [6, CRF, 'VALID', -5, -125], [6, 'Licença de Operação', 'VALID', 12, -120], [6, CNDT, 'VALID', 60, -120],
  [7, CND, 'VALID', -12, -190], [7, CNDT, 'REJECTED', null, -40, 'Certidão positiva — há débitos trabalhistas em aberto'], [7, CRF, 'VALID', -30, -60],
  [8, CND, 'VALID', 160, -14], [8, CRF, 'VALID', 25, -14], [8, 'Registro Nacional de Transportadores (RNTRC)', 'VALID', 700, -14], [8, CNDT, 'VALID', 170, -14],
]
const PRIMATUS_DOCS = ['d42', 'd7', 'd8', 'd6', 'd15', 'd40', 'd39', 'd10']
function linhasStatus() {
  const sup = Object.fromEntries(DEMO_CLIENT_SUPPLIERS.map(s => [s.id, s]))
  const linha = (s, documento, d, motivo, responsavel = 'fornecedor') => ({
    supplier_id: s.id, razao_social: s.razao_social, cnpj: s.cnpj, processo: s.sealStatus, nivel: s.nivel, documento, responsavel,
    situacao: effStatus(d), vencimento: d.expires || null, enviado_em: d.sent || null, motivo: motivo || '',
  })
  const prim = sup[1]
  return [
    ...PRIMATUS_DOCS.map(id => FICHA.docs.find(d => d.id === id)).filter(Boolean)
      .map(d => linha(prim, d.label, d, d.status === 'REJECTED' ? d.note : '', d.soEqpi ? 'interna' : 'fornecedor')),
    linha(prim, FICHA.docCliente.label, FICHA.docCliente, '', 'cliente'),
    ...OUTRAS.map(([id, documento, status, venc, env, motivo]) => linha(sup[id], documento,
      { status, expires: venc == null ? null : isoD(venc), sent: env == null ? null : isoD(env) }, motivo)),
  ]
}

function DocumentsStatusDemo({ navigate, toast }) {
  const [rows] = useState(linhasStatus)
  const [busca, setBusca] = useState('')
  const [fSit, setFSit] = useState([])
  const [fProc, setFProc] = useState([])
  const [fResp, setFResp] = useState([])
  const [fDoc, setFDoc] = useState('')
  const [venceAte, setVenceAte] = useState('')
  const docs = [...new Set(rows.map(r => r.documento))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  const filtrados = rows.filter(r => {
    const q = busca.trim().toLowerCase()
    if (q && !r.razao_social.toLowerCase().includes(q) && !(q.replace(/\D/g, '') && r.cnpj.replace(/\D/g, '').includes(q.replace(/\D/g, '')))) return false
    if (fSit.length && !fSit.includes(r.situacao)) return false
    if (fProc.length && !fProc.includes(r.processo)) return false
    if (fResp.length && !fResp.includes(r.responsavel)) return false
    if (fDoc && r.documento !== fDoc) return false
    if (venceAte && !(r.vencimento && r.vencimento <= venceAte)) return false
    return true
  })
  const conta = (fn) => rows.filter(fn).length
  const ativos = !!(busca || fSit.length || fProc.length || fResp.length || fDoc || venceAte)
  const limpar = () => { setBusca(''); setFSit([]); setFProc([]); setFResp([]); setFDoc(''); setVenceAte('') }
  const fornecedores = new Set(filtrados.map(r => r.supplier_id)).size
  const exportar = () => exportRows('status-dos-documentos', 'Status dos documentos', filtrados.map(r => ({
    'Fornecedor': r.razao_social, 'CNPJ': r.cnpj, 'Processo': PROC[r.processo] || r.processo, 'Nível': r.nivel || '',
    'Documento': r.documento, 'Responsável': RESP[r.responsavel] || '', 'Situação': SIT[r.situacao]?.label || r.situacao,
    'Vencimento': r.vencimento ? fmtBR(r.vencimento) : '', 'Enviado em': r.enviado_em && r.situacao !== 'MISSING' ? fmtBR(r.enviado_em) : '',
    'Motivo da reprovação': r.motivo,
  })), toast)
  const abrir = (r) => r.supplier_id === 1 ? navigate?.('processo') : toast(`ℹ️ Na demonstração, a ficha completa do processo é a da ${PRIMATUS.razao}.`)
  const inp = { padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e4ef', fontFamily: D, fontSize: 13, color: '#1a1c5e' }
  const td = { padding: '9px 12px', color: '#374151', whiteSpace: 'nowrap' }
  return (
    <div>
      <FilterPanel total={rows.length} shown={filtrados.length} active={ativos} onClear={limpar}>
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar fornecedor por nome ou CNPJ..." style={{ ...inp, width: '100%', boxSizing: 'border-box' }}/>
        <MultiChips label="Situação" value={fSit} onChange={setFSit}
          options={Object.entries(SIT).map(([v, o]) => ({ value: v, label: o.label, color: o.color, count: conta(r => r.situacao === v) })).filter(o => o.count > 0)}/>
        <MultiChips label="Processo" value={fProc} onChange={setFProc}
          options={Object.entries(PROC).map(([v, l]) => ({ value: v, label: l, count: conta(r => r.processo === v) })).filter(o => o.count > 0)}/>
        <MultiChips label="Responsável" value={fResp} onChange={setFResp}
          options={Object.entries(RESP).map(([v, l]) => ({ value: v, label: l, count: conta(r => r.responsavel === v) })).filter(o => o.count > 0)}/>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <select value={fDoc} onChange={e => setFDoc(e.target.value)} style={{ ...inp, maxWidth: 420 }}>
            <option value="">Todos os documentos</option>
            {docs.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <span style={{ fontFamily: D, fontSize: 12, color: '#64748b' }}>Vence até</span>
          <input type="date" value={venceAte} onChange={e => setVenceAte(e.target.value)} style={{ ...inp, width: 160 }}/>
        </div>
      </FilterPanel>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '-4px 0 12px', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: D, fontSize: 12, color: '#64748b' }}>{filtrados.length} documentos de {fornecedores} fornecedor{fornecedores !== 1 ? 'es' : ''}</span>
        <Button variant="neutral" size="sm" onClick={exportar} title="Exporta a lista com os filtros aplicados">⬇ Exportar Excel ({filtrados.length})</Button>
      </div>
      <Card style={{ borderRadius: 14, padding: 0, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: D, fontSize: 12.5 }}>
          <thead>
            <tr style={{ background: '#f8faff', textAlign: 'left', color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: .4 }}>
              {['Fornecedor', 'Documento', 'Situação', 'Vencimento', 'Enviado em', 'Processo'].map(h => <th key={h} style={{ padding: '10px 12px', fontWeight: 700 }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {filtrados.map((r, i) => {
              const c = SIT[r.situacao]?.color || '#64748b'
              return (
                <tr key={`${r.supplier_id}-${r.documento}-${i}`} style={{ borderTop: '1px solid #f0f2f8', cursor: 'pointer' }} onClick={() => abrir(r)} title="Abrir o processo do fornecedor">
                  <td style={{ padding: '9px 12px', color: '#1a1c5e', fontWeight: 600 }}>{r.razao_social}<div style={{ fontWeight: 400, fontSize: 11, color: '#9B9B9B' }}>{r.cnpj}</div></td>
                  <td style={{ padding: '9px 12px', color: '#374151' }}>{r.documento}{r.responsavel !== 'fornecedor' && <span style={{ fontSize: 10, color: '#9B9B9B' }}> · {RESP[r.responsavel]}</span>}
                    {r.motivo && <div style={{ fontSize: 11, color: '#dc2626', marginTop: 2 }}>Motivo: {r.motivo}</div>}</td>
                  <td style={{ padding: '9px 12px' }}><span style={{ fontSize: 11, fontWeight: 700, color: c, background: `${c}14`, padding: '3px 9px', borderRadius: 20, whiteSpace: 'nowrap' }}>{SIT[r.situacao]?.label || r.situacao}</span></td>
                  <td style={td}>{r.vencimento ? fmtBR(r.vencimento) : '—'}</td>
                  <td style={td}>{r.enviado_em && r.situacao !== 'MISSING' ? fmtBR(r.enviado_em) : '—'}</td>
                  <td style={{ ...td, color: '#64748b' }}>{PROC[r.processo] || r.processo}</td>
                </tr>
              )
            })}
            {filtrados.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 28, textAlign: 'center', color: '#9B9B9B' }}>Nenhum documento com os filtros aplicados.</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

// ── Cliente · Relatórios (src/pages/client/Reports.jsx) ────────────────────
// Abas 📊 Visão executiva · 📄 Status dos documentos. Filtro de período Data
// início / Data fim / Aplicar / Limpar: filtra a série mensal fictícia (que
// sempre termina no mês corrente); "⬇ Exportar Excel" leva os indicadores
const fmtDia = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR')
export function DemoClientRelatorios({ navigate }) {
  const r = DEMO_CLIENT_REPORTS
  const [aba, setAba] = useState('executivo')
  const [, setToast, ToastEl] = useToast()
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')
  const [periodo, setPeriodo] = useState({ de: '', ate: '' })
  const comPeriodo = !!(periodo.de || periodo.ate)
  const txtPeriodo = comPeriodo ? `${periodo.de ? fmtDia(periodo.de) : 'início'} a ${periodo.ate ? fmtDia(periodo.ate) : 'hoje'}` : 'todo o período'
  const meses = r.porMes.filter(m => (!periodo.de || m.key >= periodo.de.slice(0, 7)) && (!periodo.ate || m.key <= periodo.ate.slice(0, 7)))
  const maxMes = Math.max(1, ...meses.map(m => m.value))
  const noPeriodo = meses.reduce((a, m) => a + m.value, 0)
  const inpData = { padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e4ef', fontFamily: D, fontSize: 13, color: '#1a1c5e' }
  const lblData = { display: 'block', fontSize: 11, fontWeight: 700, color: '#9B9B9B', fontFamily: M, textTransform: 'uppercase', letterSpacing: .5, marginBottom: 4 }
  const exportarExecutivo = () => {
    const L = (secao, indicador, valor) => ({ 'Seção': secao, 'Indicador': indicador, 'Valor': valor ?? 0, 'Período': txtPeriodo })
    exportRows('relatorio-executivo', 'Visão executiva', [
      L('Fornecedores', comPeriodo ? 'Homologações no período' : 'Fornecedores', comPeriodo ? noPeriodo : r.kpis.fornecedores),
      L('Processos', 'Homologados vigentes', r.kpis.homologados), L('Processos', 'Em homologação', r.kpis.emHomologacao),
      L('Processos', 'Vencidos', r.kpis.vencidos), L('Processos', 'A vencer (60 dias)', r.kpis.processosAVencer60),
      L('Documentos (hoje)', 'A vencer (30 dias)', r.kpis.docsAVencer30),
      ...r.funil.map(f => L('Convites', f.label.replace(/^\S+\s/, ''), f.value)),
      L('Cotações (RFQ)', 'Cotações abertas', r.rfq.abertas), L('Cotações (RFQ)', 'Respostas recebidas', r.rfq.respostas),
      ...meses.map(m => L('Homologações por mês', m.label, m.value)),
      L('Questionários', 'Responderam', r.questionarios.responderam), L('Questionários', 'Não responderam', r.questionarios.naoResponderam),
    ], setToast)
  }
  const abaBtn = (k, txt) => (
    <button onClick={() => setAba(k)} style={{ padding: '10px 18px', background: 'none', border: 'none', borderBottom: `2px solid ${aba === k ? '#2E3192' : 'transparent'}`, marginBottom: -2,
      color: aba === k ? '#2E3192' : '#9B9B9B', fontFamily: M, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>{txt}</button>
  )
  return (
    <div style={wrap}>
      {ToastEl}
      <PageHeader title="Relatórios" subtitle={aba === 'executivo' ? `Visão executiva da sua homologação de fornecedores · ${txtPeriodo}` : 'Situação de cada documento exigido nos processos dos seus fornecedores'}/>
      <div style={{ display: 'flex', gap: 4, marginBottom: 18, borderBottom: '2px solid #e2e4ef' }}>
        {abaBtn('executivo', '📊 Visão executiva')}
        {abaBtn('documentos', '📄 Status dos documentos')}
      </div>
      {aba === 'documentos' ? <DocumentsStatusDemo navigate={navigate} toast={setToast}/> : <>
      <Card style={{ borderRadius: 14, padding: '14px 18px', marginBottom: 16, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div><label style={lblData}>Data início</label><input type="date" value={de} max={ate || undefined} onChange={e => setDe(e.target.value)} style={inpData}/></div>
        <div><label style={lblData}>Data fim</label><input type="date" value={ate} min={de || undefined} onChange={e => setAte(e.target.value)} style={inpData}/></div>
        <Button variant="primary" size="sm" onClick={() => setPeriodo({ de, ate })}>Aplicar</Button>
        {comPeriodo && <Button variant="neutral" size="sm" onClick={() => { setDe(''); setAte(''); setPeriodo({ de: '', ate: '' }) }}>Limpar</Button>}
        <span style={{ fontFamily: D, fontSize: 12, color: '#9B9B9B', flex: 1, minWidth: 220 }}>Os indicadores de documentos e processos a vencer são sempre de hoje.</span>
        <Button variant="neutral" size="sm" onClick={exportarExecutivo} title="Exporta os indicadores com o período aplicado">⬇ Exportar Excel</Button>
      </Card>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 12, marginBottom: 18 }}>
        <KpiCard label={comPeriodo ? 'Homologações no período' : 'Fornecedores'} value={comPeriodo ? noPeriodo : r.kpis.fornecedores} icon="🏭" iconBg="rgba(46,49,146,.1)"/>
        <KpiCard label="Homologados vigentes" value={r.kpis.homologados} icon="🏅" iconBg="rgba(34,197,94,.12)"/>
        <KpiCard label="Em homologação" value={r.kpis.emHomologacao} icon="⏳" iconBg="rgba(245,158,11,.12)"/>
        <KpiCard label="Docs a vencer (30d) · hoje" value={r.kpis.docsAVencer30} icon="📄" iconBg="rgba(244,126,47,.12)"/>
        <KpiCard label="Processos a vencer (60d)" value={r.kpis.processosAVencer60} icon="📅" iconBg="rgba(124,58,237,.1)"/>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(420px,1fr))', gap: 14 }}>
        <Card style={{ borderRadius: 16, padding: '18px 22px' }}>
          <SectionTitle>Situação dos processos{comPeriodo ? ' iniciados no período' : ''}</SectionTitle>
          {r.situacao.map((s) => <Barra key={s.label} label={s.label} value={s.value} max={r.kpis.fornecedores} color={s.color}/>)}
        </Card>
        <Card style={{ borderRadius: 16, padding: '18px 22px' }}>
          <SectionTitle>Funil de convites</SectionTitle>
          {r.funil.map((f) => <Barra key={f.label} label={f.label} value={f.value} max={r.funil[0].value}/>)}
        </Card>
        <Card style={{ borderRadius: 16, padding: '18px 22px' }}>
          <SectionTitle>Homologações por mês{comPeriodo ? '' : ' (últimos 12 meses)'}</SectionTitle>
          {meses.length === 0 ? (
            <div style={{ fontFamily: D, fontSize: 13, color: '#9B9B9B', padding: '30px 0', textAlign: 'center' }}>Nenhuma homologação no período.</div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 150, paddingTop: 8 }}>
              {meses.map((m) => (
                <div key={m.key} style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
                  <div style={{ fontFamily: M, fontSize: 11, fontWeight: 700, color: '#1a1c5e' }}>{m.value}</div>
                  <div style={{ height: `${(m.value / maxMes) * 100}px`, background: '#2E3192', borderRadius: '6px 6px 0 0', marginTop: 4 }}/>
                  <div style={{ fontFamily: D, fontSize: 10, color: '#6b7280', marginTop: 4, whiteSpace: 'nowrap' }}>{m.label}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card style={{ borderRadius: 16, padding: '18px 22px' }}>
          <SectionTitle>Questionários e cotações</SectionTitle>
          <Barra label="✅ Responderam" value={r.questionarios.responderam} max={r.kpis.homologados} color="#22c55e"/>
          <Barra label="⚠️ Não responderam" value={r.questionarios.naoResponderam} max={r.kpis.homologados} color="#f59e0b"/>
          <Barra label="📝 Cotações abertas" value={r.rfq.abertas} max={20} color="#7c3aed"/>
          <Barra label="💬 Respostas recebidas" value={r.rfq.respostas} max={20} color="#7c3aed"/>
        </Card>
      </div>
      </>}
    </div>
  )
}

// ── Cliente · Compliance ────────────────────────────────────────────────────
export function DemoClientCompliance() {
  return (
    <div style={wrap}>
      <PageHeader title="Compliance" subtitle="Fornecedores com respostas que exigem avaliação da área de compliance"/>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(200px,260px))', gap: 12, marginBottom: 16 }}>
        <KpiCard label="Fornecedores em atenção" value={DEMO_COMPLIANCE.length} icon="🛡️" iconBg="rgba(239,68,68,.1)"/>
        <KpiCard label="Respostas sinalizadas" value={DEMO_COMPLIANCE.length} icon="🚩" iconBg="rgba(245,158,11,.12)"/>
      </div>
      <Card style={{ borderRadius: 16, padding: '8px 0' }}>
        {DEMO_COMPLIANCE.map((c, i) => (
          <div key={c.fornecedor} style={{ padding: '14px 22px', borderTop: i ? '1px solid #f4f5f9' : 'none' }}>
            <div style={{ fontFamily: M, fontWeight: 700, fontSize: 13, color: '#1a1c5e' }}>{c.fornecedor} <span style={{ fontFamily: D, fontWeight: 400, fontSize: 11, color: '#9B9B9B' }}>· {c.cnpj}</span></div>
            <div style={{ fontFamily: D, fontSize: 12.5, color: '#374151', marginTop: 4 }}>❓ {c.pergunta}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontFamily: D, fontSize: 12.5, fontWeight: 700, color: '#b91c1c' }}>Resposta: {c.resposta}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#b45309', background: '#fef3c7', padding: '2px 8px', borderRadius: 20, fontFamily: M }}>🚩 {c.regra}</span>
            </div>
          </div>
        ))}
      </Card>
      <div style={{ fontFamily: D, fontSize: 12, color: '#9B9B9B', marginTop: 10 }}>
        As regras de alerta são configuradas por pergunta pela equipe EQPI, conforme o que cada cliente define como ponto de revisão.
      </div>
    </div>
  )
}

// ── Cliente · Carta de Exceção (modal) ──────────────────────────────────────
export function CartaExcecaoModal({ fornecedor, onClose }) {
  const [enviada, setEnviada] = useState(false)
  const venc = new Date(); venc.setMonth(venc.getMonth() + 6)
  return (
    <div onClick={(e) => e.stopPropagation()} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 18, padding: 26, maxWidth: 480, width: '100%' }}>
        {enviada ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 44 }}>📜</div>
            <div style={{ fontFamily: M, fontWeight: 800, fontSize: 18, color: '#15803d', margin: '6px 0' }}>Exceção aplicada</div>
            <div style={{ fontFamily: D, fontSize: 13, color: '#374151', marginBottom: 14 }}>
              O documento pendente de <strong>{fornecedor}</strong> passa a valer pela carta até {venc.toLocaleDateString('pt-BR')}. No vencimento, a exceção é suspensa automaticamente.
            </div>
            <Button variant="primary" full onClick={onClose}>Fechar</Button>
          </div>
        ) : (
          <>
            <div style={{ fontFamily: M, fontWeight: 800, fontSize: 17, color: '#1a1c5e', marginBottom: 4 }}>📜 Carta de Exceção</div>
            <div style={{ fontFamily: D, fontSize: 13, color: '#64748b', marginBottom: 14 }}>
              {fornecedor} · o cliente aprova o fornecedor mesmo com uma pendência, assumindo formalmente o risco.
            </div>
            <div style={{ fontFamily: M, fontWeight: 700, fontSize: 10, color: '#9B9B9B', textTransform: 'uppercase', marginBottom: 4 }}>Documento coberto</div>
            <select style={{ width: '100%', padding: '9px 10px', borderRadius: 10, border: '1px solid #e2e4ef', marginBottom: 10, fontFamily: D }}><option>Alvará de Funcionamento</option></select>
            <div style={{ fontFamily: M, fontWeight: 700, fontSize: 10, color: '#9B9B9B', textTransform: 'uppercase', marginBottom: 4 }}>Carta assinada (PDF) e validade</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <div style={{ flex: 1, border: '1.5px dashed #c7c9e2', borderRadius: 10, padding: '9px 10px', fontFamily: D, fontSize: 12, color: '#6b7280' }}>📎 carta_excecao.pdf</div>
              <input type="date" defaultValue={venc.toISOString().slice(0, 10)} style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid #e2e4ef', fontFamily: D }}/>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="neutral" full onClick={onClose}>Cancelar</Button>
              <Button variant="primary" full onClick={() => setEnviada(true)}>Aplicar exceção</Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
