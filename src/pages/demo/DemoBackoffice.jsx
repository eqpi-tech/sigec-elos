// Demo · perfil Backoffice EQPI (refresh 30/09): a operação por trás da
// homologação — Farol, fila de análise, ficha do processo, convites, BC
// Report e Financeiro. Dados fictícios. A automação (Rota A: certidões nas
// fontes oficiais; Rota B: pré-análise por IA) aparece marcada "Em breve".
//
// ACESSO RESTRITO (30/09): este arquivo é carregado sob demanda (React.lazy)
// só depois que o código de acesso é validado no servidor (demo-unlock) —
// o /demo é público e clientes/concorrentes não devem ver a operação.
// Os dados do backoffice ficam AQUI (não em demoData.js) para não irem no
// pacote principal do site.
import { useState } from 'react'
import { Card, Button, KpiCard, PageHeader, SectionTitle } from '../../components/ui.jsx'
import { FICHA, ROW, Tabs, Toast, Modal, DocViewer, HistoryModal, Field, StatusDot } from './DemoFichaKit.jsx'

// Backoffice · fila de análise de documentos (padrão HOC: envio + 3 dias úteis)
const DEMO_ADMIN_FILA = [
  { id: 'f1', fornecedor: 'Primatus Serviços Técnicos Ltda', cnpj: '34.218.904/0001-72', cliente: 'Horizonte Mineração', doc: 'Apólice de Seguro', limite: 'ultrapassada', rota: null },
  { id: 'f2', fornecedor: 'Ômega Engenharia Ltda', cnpj: '41.090.118/0001-30', cliente: 'Horizonte Mineração', doc: 'Alvará de Funcionamento', limite: 'hoje', rota: { r: 'B', s: 'reprovar', m: 'Documento vencido em 04/09/2026 e de outra filial (0006-51).' } },
  { id: 'f3', fornecedor: 'TechFix Industrial S.A.', cnpj: '07.332.910/0001-41', cliente: 'Horizonte Mineração', doc: 'CND Tributos Federais', limite: 'hoje', rota: { r: 'A', s: 'aprovar', m: 'Receita/PGFN: certidão negativa emitida na fonte oficial.' } },
  { id: 'f4', fornecedor: 'Sulbras Serviços Ltda', cnpj: '19.554.203/0001-88', cliente: 'Horizonte Mineração', doc: 'CNDT Certidão Trabalhista', limite: 'futura', rota: { r: 'A', s: 'reprovar', m: 'TST: POSITIVA — consta no BNDT (débitos trabalhistas).' } },
  { id: 'f5', fornecedor: 'Norte Industrial Ltda', cnpj: '28.119.340/0001-55', cliente: 'ELOS', doc: 'Licença de Operação', limite: 'futura', rota: { r: 'B', s: 'aprovar', m: 'LO do órgão ambiental, CNPJ confere, válida até 2028.' } },
  { id: 'f6', fornecedor: 'BioTech Serviços Ambientais', cnpj: '22.781.604/0001-17', cliente: 'Horizonte Mineração', doc: 'Contrato Social', limite: 'futura', rota: null },
]

// Backoffice · convites (telefone informado pelo cliente ao lado do e-mail)
const DEMO_ADMIN_CONVITES = [
  { fornecedor: 'Vértice Montagens Ltda', cnpj: '33.901.227/0001-60', email: 'contato@vertice.com.br', telefone: '(31) 98765-4321', cliente: 'Horizonte Mineração', fluxo: 'Suprimentos', status: 'SENT', quando: '29/09 14:27', subsidiado: true },
  { fornecedor: 'Rota Sul Transportes', cnpj: '10.228.551/0001-02', email: 'comercial@rotasul.com.br', telefone: '', cliente: 'Horizonte Mineração', fluxo: 'Transporte', status: 'VIEWED', quando: '28/09 10:05', subsidiado: false },
  { fornecedor: 'Primatus Serviços Técnicos Ltda', cnpj: '34.218.904/0001-72', email: 'lucas@primatus.com.br', telefone: '(11) 3421-8900', cliente: 'Horizonte Mineração', fluxo: 'Suprimentos', status: 'ACCEPTED', quando: '15/01 09:12', subsidiado: false },
  { fornecedor: 'Delta Serviços Gerais', cnpj: '05.448.310/0001-91', email: 'adm@deltaservicos.com.br', telefone: '', cliente: 'Horizonte Mineração', fluxo: 'Suprimentos', status: 'CANCELLED', quando: '20/09 16:40', subsidiado: true },
]

// Backoffice · BC Report (fontes consultadas e resultado de exemplo)
const DEMO_BC_FONTES = [
  { grupo: 'Cadastro', fontes: ['Receita Federal (CNPJ, QSA, CNAE)', 'Simples Nacional', 'Sintegra'] },
  { grupo: 'Fiscal e trabalhista', fontes: ['CND Federal / PGFN', 'Dívida Ativa da União', 'CRF FGTS', 'CNDT (TST)', 'CND Estadual', 'CND Municipal'] },
  { grupo: 'Listas restritivas', fontes: ['CEIS', 'CNEP', 'CEPIM', 'Acordos de Leniência', 'Trabalho Escravo (MTE)', 'OFAC', 'ONU', 'PEP'] },
  { grupo: 'Judicial e integridade', fontes: ['Falência e Recuperação Judicial', 'CNJ Improbidade', 'DataJud (processos)', 'CGU Correcional', 'MPF / MPT'] },
  { grupo: 'Ambiental e reputação', fontes: ['IBAMA (embargos)', 'Mídia negativa', 'ICIJ (vazamentos offshore)', 'TSE (candidaturas de sócios)'] },
]
const DEMO_BC_RESULTADO = {
  empresa: 'Ômega Engenharia Ltda', cnpj: '41.090.118/0001-30', tipo: 'Full', score: 78, faixa: 'medio',
  achados: [
    { ok: true,  t: 'Situação cadastral ATIVA desde 2009; sócios sem restrição' },
    { ok: true,  t: 'Sem registros em CEIS, CNEP, CEPIM, OFAC e ONU' },
    { ok: true,  t: 'Certidões federal, FGTS e trabalhista negativas' },
    { ok: false, t: 'CND estadual indisponível na fonte no momento da consulta — faixa limitada a "médio"' },
    { ok: false, t: '2 processos cíveis em andamento (DataJud) — valor agregado baixo' },
  ],
}

const M = 'Montserrat,sans-serif'
const D = 'DM Sans,sans-serif'
const wrap = { padding: '28px 32px', maxWidth: 1200, margin: '0 auto' }
const pill = (color, bg) => ({ fontSize: 10, fontWeight: 700, color, background: bg, padding: '2px 8px', borderRadius: 20, fontFamily: M, whiteSpace: 'nowrap' })

export function EmBreve({ style }) {
  return <span style={{ ...pill('#7c3aed', '#ede9fe'), ...style }} title="Em lançamento — já em testes, entra em produção em breve">✨ Em breve</span>
}

const LIMITE = {
  ultrapassada: { label: 'Ultrapassada', color: '#FC4970' },
  hoje:         { label: 'Hoje',         color: '#F2A516' },
  futura:       { label: 'No prazo',     color: '#00A000' },
}
const SUG = {
  aprovar:  { t: '✓ sugere aprovar',  c: '#15803d', b: '#dcfce7' },
  reprovar: { t: '✕ sugere reprovar', c: '#b91c1c', b: '#fee2e2' },
  revisar:  { t: '? revisar',         c: '#b45309', b: '#fef3c7' },
}

function Sugestao({ rota }) {
  if (!rota) return null
  const s = SUG[rota.s]
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
      <span style={pill('#2E3192', 'rgba(46,49,146,.08)')}>{rota.r === 'A' ? '🏛 Fonte oficial' : '🤖 IA'}</span>
      <span style={pill(s.c, s.b)}>{s.t}</span>
      <EmBreve/>
    </div>
  )
}

// ── Início: Farol de análise ────────────────────────────────────────────────
export function DemoAdminInicio({ navigate }) {
  const farol = [
    { label: 'Data limite ultrapassada', value: 7,  color: '#FC4970' },
    { label: 'Data limite hoje',         value: 12, color: '#F2A516' },
    { label: 'Data limite futura',       value: 41, color: '#00A000' },
  ]
  return (
    <div style={wrap}>
      <PageHeader title="Painel Backoffice" subtitle="EQPI Tech · Ecossistema SIGEC-ELOS"/>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14, marginBottom: 20 }}>
        <KpiCard label="Fornecedores" value="12.480" sub="base ELOS + HOC" icon="🏭" iconBg="rgba(46,49,146,.1)"/>
        <KpiCard label="Homologados" value="8.912" sub="selos vigentes" icon="🏅" iconBg="rgba(34,197,94,.12)"/>
        <KpiCard label="Pendentes" value="60" sub="documentos na fila" icon="⏳" iconBg="rgba(245,158,11,.12)"/>
        <KpiCard label="MRR (Stripe)" value="R$ 38,4 mil" sub="assinaturas ativas" icon="💰" iconBg="rgba(244,126,47,.12)"/>
      </div>
      <Card style={{ borderRadius: 16, padding: '20px 24px', marginBottom: 16 }}>
        <SectionTitle>Farol de Análise — fila do analista</SectionTitle>
        <div style={{ fontFamily: D, fontSize: 12.5, color: '#6b7280', marginBottom: 14 }}>
          Mesma regra do HOC: cada documento enviado tem data limite de análise de 3 dias úteis (feriados considerados).
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
          {farol.map((f) => (
            <button key={f.label} onClick={() => navigate('analise')}
              style={{ background: `${f.color}12`, border: `1.5px solid ${f.color}55`, borderRadius: 14, padding: '16px 18px', textAlign: 'left', cursor: 'pointer' }}>
              <div style={{ fontFamily: M, fontWeight: 900, fontSize: 30, color: f.color }}>{f.value}</div>
              <div style={{ fontFamily: D, fontSize: 12.5, color: '#374151' }}>{f.label}</div>
            </button>
          ))}
        </div>
      </Card>
      <Card style={{ borderRadius: 16, padding: '18px 24px', background: 'linear-gradient(135deg,#2E3192,#1a1c5e)' }}>
        <SectionTitle style={{ color: '#fff', marginBottom: 12 }}>Ações Rápidas</SectionTitle>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[['📋 Análise de documentos', 'analise'], ['🔍 Ficha de um processo', 'processo'], ['✉️ Convites', 'convites'], ['🕵️ Emitir BC Report', 'bc'], ['💰 Financeiro', 'financeiro']].map(([t, k]) => (
            <button key={k} onClick={() => navigate(k)} style={{ background: 'rgba(255,255,255,.12)', color: '#fff', border: '1px solid rgba(255,255,255,.25)', borderRadius: 10, padding: '9px 14px', cursor: 'pointer', fontFamily: D, fontSize: 13 }}>{t}</button>
          ))}
        </div>
      </Card>
    </div>
  )
}

// ── Análise de Documentos (fila do analista) ────────────────────────────────
export function DemoAdminAnalise({ navigate }) {
  const [sug, setSug] = useState('')
  const [feito, setFeito] = useState({})
  const [aceitar, setAceitar] = useState(null)
  const lista = DEMO_ADMIN_FILA.filter((d) => !sug || (sug === 'nenhuma' ? !d.rota : d.rota?.s === sug || d.rota?.r === sug))
  const sel = { padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e4ef', fontFamily: D, fontSize: 13, width: '100%' }
  const lbl = { display: 'block', fontFamily: M, fontWeight: 700, fontSize: 10, color: '#9B9B9B', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 }
  return (
    <div style={wrap}>
      <PageHeader title="Análise de Documentos" subtitle="Aprovação e rejeição em lote · independente de fornecedor"/>
      <Card style={{ borderRadius: 14, padding: '16px 20px', marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 12 }}>
          <div><span style={lbl}>Tipo de documento</span><select style={sel}><option>Todos os tipos</option></select></div>
          <div><span style={lbl}>Fornecedor (nome ou CNPJ)</span><input placeholder="Buscar fornecedor..." style={{ ...sel, boxSizing: 'border-box' }}/></div>
          <div><span style={lbl}>Limite de análise</span><select style={sel}><option>📥 Fila de análise (todos)</option><option>🔴 Data limite ultrapassada</option><option>🟠 Data limite hoje</option><option>🟢 Data limite futura</option></select></div>
          <div>
            <span style={lbl}>Sugestão <EmBreve style={{ marginLeft: 4 }}/></span>
            <select value={sug} onChange={(e) => setSug(e.target.value)} style={sel}>
              <option value="">Todas</option><option value="A">🏛 Rota A — fonte oficial</option><option value="B">🤖 Rota B — IA</option>
              <option value="aprovar">✓ Sugere aprovar</option><option value="reprovar">✕ Sugere reprovar</option><option value="nenhuma">Sem sugestão</option>
            </select>
          </div>
        </div>
      </Card>
      <div style={{ fontFamily: D, fontSize: 13, color: '#6b7280', marginBottom: 10 }}>{lista.length} documentos encontrados</div>
      {lista.map((d) => {
        const l = LIMITE[d.limite]
        const st = feito[d.id]
        return (
          <Card key={d.id} style={{ borderRadius: 12, padding: '14px 18px', marginBottom: 8, borderLeft: `4px solid ${st === 'VALID' ? '#22c55e' : st === 'REJECTED' ? '#ef4444' : '#F2A516'}` }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.4fr 110px 190px', gap: 12, alignItems: 'start' }}>
              <div>
                <div style={{ fontFamily: M, fontWeight: 700, fontSize: 13, color: '#1a1c5e' }}>{d.fornecedor}</div>
                <div style={{ fontFamily: D, fontSize: 11, color: '#9B9B9B' }}>{d.cnpj}</div>
                <div style={{ fontFamily: D, fontSize: 11, color: '#2E3192', fontWeight: 600 }}>🏢 {d.cliente}</div>
              </div>
              <div>
                <div style={{ fontFamily: D, fontSize: 13, color: '#1a1c5e' }}>{d.doc}</div>
                <Sugestao rota={d.rota}/>
                {d.rota && <div style={{ fontFamily: D, fontSize: 11, color: '#6b7280', marginTop: 3 }}>{d.rota.m}</div>}
              </div>
              <div style={{ fontFamily: D, fontSize: 12, fontWeight: 700, color: st ? '#9B9B9B' : l.color }}>
                {st === 'VALID' ? '✓ Aprovado' : st === 'REJECTED' ? '✕ Reprovado' : l.label}
              </div>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <Button variant="neutral" size="sm">👁</Button>
                {!st && d.rota && (
                  <Button variant={d.rota.s === 'aprovar' ? 'success' : 'danger'} size="sm" onClick={() => setAceitar(d)}>
                    {d.rota.s === 'aprovar' ? '✓' : '✕'} Aceitar sugestão
                  </Button>
                )}
                {!st && <Button variant="primary" size="sm" onClick={() => navigate('processo')}>✏️ Editar</Button>}
                {st && <Button variant="neutral" size="sm" onClick={() => setFeito((f) => ({ ...f, [d.id]: undefined }))}>↩ Reverter decisão</Button>}
              </div>
            </div>
          </Card>
        )
      })}
      {aceitar && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 26, maxWidth: 520, width: '100%' }}>
            <div style={{ fontFamily: M, fontWeight: 800, fontSize: 17, color: '#1a1c5e', marginBottom: 4 }}>✏️ {aceitar.doc}</div>
            <div style={{ fontFamily: D, fontSize: 13, color: '#64748b', marginBottom: 12 }}>{aceitar.fornecedor}</div>
            <div style={{ border: '1px solid rgba(46,49,146,.18)', background: '#fafbff', borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}>
              <div style={{ fontFamily: M, fontSize: 10, fontWeight: 700, color: '#2E3192', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {aceitar.rota.r === 'A' ? '🏛 Sugestão — Rota A (fonte oficial)' : '🤖 Sugestão — Rota B (pré-análise por IA)'} <EmBreve style={{ marginLeft: 4 }}/>
              </div>
              <div style={{ fontFamily: D, fontSize: 12.5, color: '#374151', marginTop: 4 }}>{aceitar.rota.m}</div>
            </div>
            <div style={{ fontFamily: D, fontSize: 12, color: '#92400e', background: '#fef3c7', borderRadius: 8, padding: '8px 12px', marginBottom: 14 }}>
              {aceitar.rota.s === 'aprovar'
                ? 'Status "Aprovado" e validade preenchidos pela sugestão (validade da fonte/documento; sem ela, análise + 1 ano). Confira e salve.'
                : 'Status "Reprovado" e motivo da recusa preenchidos pela sugestão — o fornecedor recebe o motivo por e-mail. Confira e salve.'}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="neutral" full onClick={() => setAceitar(null)}>Cancelar</Button>
              <Button variant="primary" full onClick={() => { setFeito((f) => ({ ...f, [aceitar.id]: aceitar.rota.s === 'aprovar' ? 'VALID' : 'REJECTED' })); setAceitar(null) }}>💾 Salvar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Ficha do processo (fiel à tela real do backoffice) ──────────────────────
const MOTIVOS = ['Documento vencido', 'Documento ilegível ou com baixa qualidade', 'Documento diferente do solicitado', 'CNPJ/Razão social divergente do cadastro', 'Ausência de assinatura', 'Documento incompleto (páginas faltando)']
const ASSERTIVA = { A: ['Excelente', '#15803d'], B: ['Bom', '#22c55e'], C: ['Médio', '#f59e0b'], D: ['Baixo', '#f97316'], E: ['Alto risco', '#ef4444'], F: ['Altíssimo risco', '#b91c1c'] }

export function DemoAdminProcesso() {
  const [docs, setDocs] = useState(FICHA.docs)
  const [tab, setTab] = useState('docs')
  const [aberto, setAberto] = useState({ a: false, b: false })
  const [catAberta, setCatAberta] = useState(null)
  const [ver, setVer] = useState(null)
  const [hist, setHist] = useState(null)
  const [aprovar, setAprovar] = useState(null)       // doc
  const [validade, setValidade] = useState('')
  const [rejeitar, setRejeitar] = useState(null)     // doc
  const [motivo, setMotivo] = useState('')
  const [reverter, setReverter] = useState(null)     // doc
  const [motivoRev, setMotivoRev] = useState('')
  const [cnae, setCnae] = useState(null)             // doc 61
  const [vinculos, setVinculos] = useState({})
  const [ia, setIa] = useState(null)                 // { doc, tipo, fase }
  const [banco, setBanco] = useState({ banco: '', compe: '', agencia: '', conta: '', pix: '', tipo: 'Corrente' })
  const [dre, setDre] = useState([])
  const [assertiva, setAssertiva] = useState(true)
  const [logCarregado, setLogCarregado] = useState(false)
  const [toast, setToast] = useState('')
  const umAno = (() => { const d = new Date(); d.setFullYear(d.getFullYear() + 1); return d.toISOString().slice(0, 10) })()
  const setStatus = (id, status, note = null, expires) => setDocs((ds) => ds.map((d) => (d.id === id ? { ...d, status, note, ...(expires ? { expires } : {}) } : d)))
  const pendentes = docs.filter((d) => d.status !== 'VALID').length
  const ok = docs.filter((d) => d.status === 'VALID').length
  // mesmo score das outras visões (72) e sobe conforme o analista aprova
  const okInicial = FICHA.docs.filter((d) => d.status === 'VALID').length
  const score = Math.max(0, Math.min(100, FICHA.score + (ok - okInicial) * 4))
  const lbl = { display: 'block', fontFamily: M, fontWeight: 700, fontSize: 10, color: '#9B9B9B', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }
  const inp = { width: '100%', padding: '9px 11px', borderRadius: 10, border: '1px solid #e2e4ef', fontFamily: D, fontSize: 13, boxSizing: 'border-box' }
  const extrair = (tipo) => {
    setIa((x) => ({ ...x, fase: 'extraindo' }))
    setTimeout(() => {
      if (tipo === 'bank') setBanco({ ...FICHA.banco })
      else setDre(FICHA.dre)
      setIa((x) => x && { ...x, fase: 'pronto' })
    }, 1600)
  }
  const quadro = (k, icon, titulo, resumo, linhas) => (
    <div style={{ border: '1px solid rgba(46,49,146,.18)', borderRadius: 12, padding: '12px 14px', marginBottom: 12, background: '#fafbff' }}>
      <div onClick={() => setAberto((a) => ({ ...a, [k]: !a[k] }))} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: M, fontWeight: 800, fontSize: 13, color: '#1a1c5e' }}>{icon} {titulo} <EmBreve style={{ marginLeft: 6 }}/></div>
          <div style={{ fontFamily: D, fontSize: 11.5, color: '#6b7280', marginTop: 2 }}>{resumo}</div>
        </div>
        <span style={{ color: '#9B9B9B' }}>{aberto[k] ? '▲' : '▼'}</span>
      </div>
      {aberto[k] && linhas.map(([doc, fonte, res]) => (
        <div key={doc} style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1.4fr', gap: 10, padding: '6px 0', borderTop: '1px solid #eef0f6', fontFamily: D, fontSize: 12, color: '#374151', marginTop: 6 }}>
          <strong style={{ color: '#1a1c5e' }}>{doc}</strong><span>{fonte}</span><span>{res}</span>
        </div>
      ))}
    </div>
  )
  const botoes = (d) => {
    const podeDecidir = ['PENDING', 'EXPIRING', 'EXPIRED'].includes(d.status)
    return (<>
      {(d.kind === 'bank' || d.kind === 'dre') && d.sent
        ? <Button variant="primary" size="sm" onClick={() => setIa({ doc: d, tipo: d.kind, fase: 'inicio' })}>🤖 Analisar</Button>
        : d.sent && <Button variant="neutral" size="sm" onClick={() => setVer(d)}>👁 Ver</Button>}
      <Button variant="neutral" size="sm" title="Histórico do documento" onClick={() => setHist(d)}>🕓</Button>
      {podeDecidir && <Button variant="success" size="sm" onClick={() => { if (d.id === 'd61') { setCnae(d); return } setValidade(d.expires && d.expires > new Date().toISOString().slice(0, 10) ? d.expires : umAno); setAprovar(d) }}>✓ Aprovar</Button>}
      {(podeDecidir || d.status === 'VALID') && <Button variant="danger" size="sm" onClick={() => { setMotivo(''); setRejeitar(d) }}>{d.status === 'VALID' ? '✕ Revogar' : '✕ Rejeitar'}</Button>}
      {['VALID', 'REJECTED', 'NOT_APPLICABLE'].includes(d.status) && <Button variant="neutral" size="sm" title="Desfaz a decisão e devolve o documento para análise" onClick={() => { setMotivoRev(''); setReverter(d) }}>↩ Reverter decisão</Button>}
    </>)
  }
  const docRow = (d, extraLabel) => (
    <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderRadius: 12, marginBottom: 7, background: (ROW[d.status] || ROW.MISSING).bg, border: `1px solid ${(ROW[d.status] || ROW.MISSING).bd}`, flexWrap: 'wrap' }}>
      <StatusDot status={d.status}/>
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ fontFamily: M, fontWeight: 700, fontSize: 13, color: '#1a1c5e' }}>{d.label}{extraLabel}</div>
        <div style={{ fontFamily: D, fontSize: 11, color: '#9B9B9B' }}>
          {d.status === 'MISSING' ? 'não enviado pelo fornecedor' : d.source === 'AUTO' ? '⚡ Auto-coletado' : 'Upload manual'}{d.expires ? ` · vence ${d.expires}` : ''}{d.meta ? ` · ${d.meta}` : ''}
        </div>
        {d.note && <div style={{ fontFamily: D, fontSize: 11, color: '#dc2626', marginTop: 2 }}>⚠ {d.note}</div>}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>{botoes(d)}</div>
    </div>
  )
  const mob = FICHA.mobilidade
  return (
    <div style={wrap}>
      <Toast msg={toast} onDone={() => setToast('')}/>
      <div style={{ fontFamily: D, fontSize: 13, color: '#2E3192', fontWeight: 600, marginBottom: 12 }}>← Voltar à busca de processos</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(280px,1fr)', gap: 16, alignItems: 'start' }}>
        <div>
          {/* cabeçalho */}
          <Card style={{ borderRadius: 16, padding: '18px 22px', marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ width: 52, height: 52, borderRadius: 14, background: '#EEF0FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: M, fontWeight: 900, fontSize: 20, color: '#2E3192' }}>P</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: M, fontWeight: 900, fontSize: 18, color: '#1a1c5e' }}>{FICHA.razao}</div>
                <div style={{ fontFamily: D, fontSize: 12.5, color: '#64748b' }}>{FICHA.cnpj} · {FICHA.cidade}/{FICHA.uf}</div>
                <div style={{ fontFamily: D, fontSize: 12.5, color: '#2563eb' }}>{FICHA.email}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: M, fontWeight: 900, fontSize: 30, color: score >= 70 ? '#22c55e' : '#f59e0b' }}>{score}</div>
                <div style={{ fontFamily: D, fontSize: 10.5, color: '#9B9B9B' }}>Score ELOS</div>
                <Button variant="neutral" size="sm">📁 Arquivar cadastro</Button>
              </div>
            </div>
          </Card>
          {/* inteligência CNPJ */}
          <Card style={{ borderRadius: 16, padding: '18px 22px', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <SectionTitle style={{ marginBottom: 0 }}>Inteligência CNPJ</SectionTitle><span style={pill('#2E3192', 'rgba(46,49,146,.08)')}>BrasilAPI + Transparência</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 12 }}>
              {[['Situação', FICHA.cnpjData.situacao], ['Abertura', FICHA.cnpjData.abertura], ['Porte', FICHA.cnpjData.porte], ['Capital Social', FICHA.cnpjData.capital], ['Natureza Jurídica', FICHA.cnpjData.natureza], ['Município/UF', FICHA.cnpjData.municipio]].map(([k, v]) => <Field key={k} label={k} value={v}/>)}
            </div>
            <div style={lbl}>Regime tributário</div>
            <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: '8px 12px', fontFamily: D, fontSize: 12.5, color: '#166534', marginBottom: 12 }}>✅ <strong>Simples Nacional</strong> · Optante desde {FICHA.regime.desde}</div>
            <div style={lbl}>CNAE principal</div>
            <div style={{ fontFamily: D, fontSize: 12.5, color: '#1a1c5e', marginBottom: 10 }}><strong>{FICHA.cnaePrincipal.codigo}</strong> — {FICHA.cnaePrincipal.desc}</div>
            <div style={lbl}>CNAEs secundários ({FICHA.cnaesSec.length})</div>
            {FICHA.cnaesSec.map((c) => <div key={c.codigo} style={{ fontFamily: D, fontSize: 12, color: '#374151' }}>{c.codigo} — {c.desc}</div>)}
            <div style={{ ...lbl, marginTop: 12 }}>Quadro societário ({FICHA.qsa.length})</div>
            {FICHA.qsa.map((s) => <div key={s.nome} style={{ display: 'flex', justifyContent: 'space-between', fontFamily: D, fontSize: 12.5, padding: '3px 0' }}><strong style={{ color: '#1a1c5e' }}>{s.nome}</strong><span style={{ color: '#64748b' }}>{s.qual} · CPF {s.cpf} · {s.pct}</span></div>)}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
              <span style={lbl}>Sanções CEIS / CNEP (API Transparência)</span><Button variant="danger" size="sm">+ Nova Sanção</Button>
            </div>
            <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: '8px 12px', fontFamily: D, fontSize: 12.5, color: '#166534' }}>✅ Sem ocorrências em CEIS e CNEP</div>
            <div style={{ fontFamily: D, fontSize: 11, color: '#9B9B9B', marginTop: 8 }}>Consultado: {FICHA.cnpjData.consultado} · BrasilAPI + Portal da Transparência</div>
          </Card>
          {/* categorias */}
          <Card style={{ borderRadius: 16, padding: '18px 22px', marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}><SectionTitle style={{ marginBottom: 0 }}>Categorias de Atuação</SectionTitle><span style={{ fontFamily: D, fontSize: 12, color: '#9B9B9B' }}>{FICHA.categorias.length} categorias</span></div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {FICHA.categorias.map((c) => (
                <button key={c.nome} onClick={() => setCatAberta(catAberta === c.nome ? null : c.nome)} style={{ border: '1px solid #e2e4ef', background: catAberta === c.nome ? 'rgba(46,49,146,.06)' : '#fff', borderRadius: 20, padding: '6px 12px', cursor: 'pointer', fontFamily: D, fontSize: 12.5, color: '#1a1c5e', fontWeight: 600 }}>
                  {c.nome} <span style={pill('#7c3aed', '#ede9fe')}>CNAE {c.cnae}</span> {catAberta === c.nome ? '▲' : '▾'}
                </button>
              ))}
            </div>
            {catAberta && (
              <div style={{ marginTop: 10, background: '#fafbff', border: '1px solid #eef0f6', borderRadius: 10, padding: '8px 12px' }}>
                {docs.slice(4, 10).map((d) => <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', fontFamily: D, fontSize: 12, padding: '3px 0' }}><span>{d.label}</span><span style={{ color: d.status === 'VALID' ? '#15803d' : d.status === 'REJECTED' ? '#dc2626' : '#b45309', fontWeight: 700 }}>{({ VALID: 'Aprovado', PENDING: 'Pendente', MISSING: 'Ausente', REJECTED: 'Reprovado', EXPIRED: 'Vencido', EXPIRING: 'Vencendo' })[d.status]}</span></div>)}
              </div>
            )}
          </Card>
          {/* assertiva */}
          <Card style={{ borderRadius: 16, padding: '18px 22px', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              <SectionTitle style={{ marginBottom: 0 }}>Análise Assertiva</SectionTitle><span style={pill('#2E3192', 'rgba(46,49,146,.08)')}>Análise Restritiva PJ</span>
              <div style={{ flex: 1 }}/><Button variant="neutral" size="sm" onClick={() => { setAssertiva(false); setTimeout(() => setAssertiva(true), 1200) }}>{assertiva ? '↺ Atualizar' : '⏳ Consultando...'}</Button>
            </div>
            {assertiva && (<>
              <div style={{ fontFamily: D, fontSize: 11.5, color: '#9B9B9B', marginBottom: 8 }}>Consultado: 02/09/2026 10:15 · Protocolo: 88412</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                <div style={{ background: '#f0fdf4', borderRadius: 10, padding: '10px 12px' }}><div style={lbl}>Score de Crédito</div><div style={{ fontFamily: M, fontWeight: 900, fontSize: 22, color: ASSERTIVA.B[1] }}>B <span style={{ fontSize: 12 }}>{ASSERTIVA.B[0]}</span></div><div style={{ fontFamily: D, fontSize: 11.5, color: '#64748b' }}>742 pontos</div></div>
                <div style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 12px' }}><div style={lbl}>Protestos</div><div style={{ fontFamily: M, fontWeight: 900, fontSize: 22, color: '#1a1c5e' }}>0</div><div style={{ fontFamily: D, fontSize: 11.5, color: '#64748b' }}>R$ 0,00</div></div>
                <div style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 12px' }}><div style={lbl}>Faturamento Est.</div><div style={{ fontFamily: M, fontWeight: 900, fontSize: 22, color: '#1a1c5e' }}>R$ 6,4 mi</div></div>
              </div>
              <div style={{ fontFamily: D, fontSize: 11.5, color: '#64748b', marginTop: 8 }}>📋 3 consultas recentes · Última: 28/08/2026</div>
            </>)}
          </Card>
          {/* abas */}
          <Card style={{ borderRadius: 16, padding: '6px 22px 18px' }}>
            <Tabs value={tab} onChange={setTab} tabs={[['docs', 'Documentos'], ['quest', `Questionário (${FICHA.questionario.length})`], ['banco', `Dados Bancários${banco.banco ? ' ✓' : ''}`], ['dre', `DRE / Financeiro (${dre.length})`], ['log', 'Log do Processo'], ['conv', `Convites (${FICHA.convites.length})`]]}/>
            {tab === 'docs' && (<>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <SectionTitle style={{ marginBottom: 0 }}>Documentos para Validação</SectionTitle>
                <span style={{ fontFamily: D, fontSize: 12 }}><span style={{ color: '#15803d' }}>✓ {ok} ok</span> <span style={{ color: '#dc2626' }}>✕ {pendentes} pendente</span></span>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
                <span style={lbl}>Processo:</span>
                <span style={pill('#2E3192', 'rgba(46,49,146,.1)')}>⏳ Horizonte Mineração</span><span style={pill('#64748b', '#f1f5f9')}>🏅 ELOS</span><span style={pill('#64748b', '#f1f5f9')}>Todos</span>
              </div>
              {quadro('a', '⚙️', 'Coleta automática nas fontes oficiais (Rota A)', '7 obtidos · 2 com o fornecedor · custo R$ 2,08 · 02/09 10:15 → 10:37', [
                ['CND Federal', 'Receita/PGFN', '✓ sugere aprovar — negativa'], ['CRF FGTS', 'Caixa', '✓ sugere aprovar — regular'], ['CNDT', 'TST', '✓ sugere aprovar — negativa'],
                ['CND Municipal', 'Prefeitura', '📤 com o fornecedor — prefeitura exige inscrição municipal']])}
              {quadro('b', '🤖', 'Pré-análise por IA dos documentos enviados (Rota B)', '2 analisados (1 aprovar · 1 reprovar) · analista concordou em 2/2 · custo R$ 0,12', [
                ['Alvará de Funcionamento', 'Regra do cliente + checklist', '✕ reprovar — vencido (pág. 1)'], ['Contrato Social', 'Regra do cliente + checklist', '✓ aprovar — 5/5 itens atendidos']])}
              {docs.map((d) => docRow(d))}
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1.5px dashed #c7c9e2' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}><SectionTitle style={{ marginBottom: 0 }}>👷 Documentos de Mobilidade</SectionTitle><span style={pill('#2E3192', 'rgba(46,49,146,.08)')}>1 posto</span></div>
                <div style={{ border: '1px solid #e2e4ef', borderRadius: 12, padding: '10px 14px' }}>
                  <div style={{ fontFamily: M, fontWeight: 700, fontSize: 13, color: '#1a1c5e' }}>📍 {mob.posto} — {mob.cidade}/{mob.uf}</div>
                  <div style={{ fontFamily: D, fontSize: 11.5, color: '#9B9B9B', marginBottom: 8 }}>Processo {FICHA.cliente} · {mob.funcao} · {mob.postos} postos / {mob.pessoas} pessoas · {mob.colaboradores.length}/{mob.pessoas} cadastradas</div>
                  {mob.docsPosto.map((d) => docRow({ ...d, sent: d.status !== 'MISSING' ? '2026-09-20' : null, source: 'MANUAL' }, ' — doc. do posto'))}
                  {mob.colaboradores.map((p) => (
                    <div key={p.nome} style={{ marginLeft: 10, marginTop: 8 }}>
                      <div style={{ fontFamily: D, fontWeight: 700, fontSize: 12.5, color: '#374151', marginBottom: 6 }}>👤 {p.nome} · CPF {p.cpf}</div>
                      {p.docs.map((d) => docRow({ ...d, sent: d.status !== 'MISSING' ? '2026-09-21' : null, source: 'MANUAL' }))}
                    </div>
                  ))}
                </div>
              </div>
            </>)}
            {tab === 'quest' && FICHA.questionario.map((q) => (
              <div key={q.q} style={{ border: '1px solid #eef0f6', borderRadius: 10, padding: '9px 12px', marginBottom: 8 }}>
                <div style={{ fontFamily: D, fontSize: 11, color: '#9B9B9B' }}>{FICHA.cliente} · {q.titulo}</div>
                <div style={{ fontFamily: D, fontWeight: 700, fontSize: 13, color: '#1a1c5e' }}>{q.q}</div>
                <div style={{ fontFamily: D, fontSize: 13, color: q.r === 'Não' ? '#dc2626' : '#15803d' }}>{q.r}</div>
              </div>
            ))}
            {tab === 'banco' && (<>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <SectionTitle style={{ marginBottom: 0 }}>Dados Bancários</SectionTitle>
                <Button variant="primary" size="sm" onClick={() => { setIa({ doc: docs.find((d) => d.kind === 'bank'), tipo: 'bank', fase: 'inicio' }) }}>🤖 Extrair com IA</Button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[['banco', 'Nome do Banco'], ['compe', 'Código COMPE'], ['agencia', 'Agência'], ['conta', 'Conta c/ dígito'], ['pix', 'Chave PIX']].map(([k, l]) => (
                  <div key={k}><span style={lbl}>{l}</span><input value={banco[k]} onChange={(e) => setBanco({ ...banco, [k]: e.target.value })} style={inp}/></div>
                ))}
                <div><span style={lbl}>Tipo de Conta</span><select value={banco.tipo} onChange={(e) => setBanco({ ...banco, tipo: e.target.value })} style={inp}><option>Corrente</option><option>Poupança</option></select></div>
              </div>
              <div style={{ marginTop: 12 }}><Button variant="primary" size="sm" onClick={() => setToast('✅ Dados bancários salvos.')}>💾 Salvar Dados Bancários</Button></div>
            </>)}
            {tab === 'dre' && (<>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <SectionTitle style={{ marginBottom: 0 }}>DRE / Dados Financeiros</SectionTitle>
                <Button variant="orange" size="sm" onClick={() => setIa({ doc: docs.find((d) => d.kind === 'dre'), tipo: 'dre', fase: 'inicio' })}>+ Adicionar exercício</Button>
              </div>
              {dre.length === 0 ? <div style={{ fontFamily: D, fontSize: 13, color: '#9B9B9B' }}>Nenhum dado financeiro registrado ainda.</div> : dre.map((y) => (
                <div key={y.ano} style={{ border: '1px solid #eef0f6', borderRadius: 12, padding: '10px 14px' }}>
                  <div style={{ fontFamily: M, fontWeight: 800, fontSize: 13, color: '#1a1c5e', marginBottom: 8 }}>Exercício {y.ano} <span style={pill('#15803d', '#dcfce7')}>✓ Verificado</span></div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                    {[['Receita', y.receita], ['Ativo', y.ativo], ['Passivo', y.passivo], ['Lucro', y.lucro], ['EBITDA', y.ebitda], ['Estoque', y.estoque]].map(([k, v]) => <Field key={k} label={k} value={v}/>)}
                  </div>
                </div>
              ))}
            </>)}
            {tab === 'log' && (<>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                <input type="date" style={{ ...inp, width: 150 }}/><input type="date" style={{ ...inp, width: 150 }}/>
                <input placeholder="Filtrar por ação ou descrição..." style={{ ...inp, flex: 1, minWidth: 180 }}/>
                <Button variant="primary" size="sm" onClick={() => setLogCarregado(true)}>🔍 Pesquisar</Button>
              </div>
              {!logCarregado ? <div style={{ fontFamily: D, fontSize: 13, color: '#9B9B9B' }}>Clique em Pesquisar para carregar o histórico.</div> : FICHA.log.map((l) => (
                <div key={l.quando} style={{ display: 'flex', gap: 10, padding: '9px 0', borderTop: '1px solid #f4f5f9' }}>
                  <div style={{ width: 32, height: 32, borderRadius: 10, background: `${l.cor}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{l.icon}</div>
                  <div>
                    <div style={{ fontFamily: M, fontWeight: 700, fontSize: 12.5, color: l.cor }}>{l.label}</div>
                    <div style={{ fontFamily: D, fontSize: 12.5, color: '#374151' }}>{l.det}</div>
                    <div style={{ fontFamily: D, fontSize: 11, color: '#9B9B9B' }}>{l.quando.split(' ')[0].split('-').reverse().join('/')} {l.quando.split(' ')[1]} · por {l.por}</div>
                  </div>
                </div>
              ))}
            </>)}
            {tab === 'conv' && (<>
              <div style={{ fontFamily: D, fontSize: 12.5, color: '#64748b', marginBottom: 8 }}>{FICHA.convites.length} convites enviados por clientes/compradores</div>
              {FICHA.convites.map((c) => (
                <div key={c.cliente} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid #f4f5f9', fontFamily: D, fontSize: 13 }}>
                  🏢 <strong style={{ flex: 1, color: '#1a1c5e' }}>{c.cliente}</strong><span style={{ color: '#9B9B9B', fontSize: 12 }}>{c.quando.split(' ')[0].split('-').reverse().join('/')}</span><span style={pill(c.cor, `${c.cor}18`)}>{c.status}</span>
                </div>
              ))}
            </>)}
          </Card>
        </div>

        {/* painel de decisão */}
        <Card style={{ borderRadius: 16, padding: '18px 20px', position: 'sticky', top: 74 }}>
          <div style={{ fontFamily: M, fontWeight: 800, fontSize: 16, color: '#1a1c5e', marginBottom: 12 }}>Decisão de Homologação</div>
          <div style={{ background: pendentes ? '#fff5f5' : '#f0fdf4', border: `1px solid ${pendentes ? '#fecaca' : '#86efac'}`, borderRadius: 12, padding: '10px 12px', textAlign: 'center', marginBottom: 14 }}>
            <div style={{ fontFamily: M, fontWeight: 800, fontSize: 13.5, color: pendentes ? '#dc2626' : '#15803d' }}>{pendentes ? `⚠ ${pendentes} doc(s) pendente(s)` : '✅ Documentação completa'}</div>
            <div style={{ fontFamily: D, fontSize: 11.5, color: '#9B9B9B' }}>{ok}/{docs.length} documentos válidos</div>
          </div>
          <div style={lbl}>Tipo de selo do processo</div>
          <div style={{ border: '1.5px solid #2E3192', borderRadius: 12, padding: '10px 12px', textAlign: 'center', marginBottom: 14 }}>
            <div style={{ fontFamily: M, fontWeight: 800, fontSize: 13.5, color: '#2E3192' }}>🏅 Homologado — Horizonte Mineração</div>
            <div style={{ fontFamily: D, fontSize: 11, color: '#9B9B9B' }}>Selo leva o nome do cliente</div>
          </div>
          <div style={lbl}>Selos deste fornecedor</div>
          <div style={{ border: '1px solid #eef0f6', borderRadius: 10, padding: '8px 10px', marginBottom: 6, fontFamily: D, fontSize: 12.5 }}>⏳ <strong>Horizonte Mineração</strong> <span style={{ color: '#b45309' }}>· Em análise</span></div>
          <div style={{ border: '1px solid #eef0f6', borderRadius: 10, padding: '8px 10px', marginBottom: 14, fontFamily: D, fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}>🏅 <strong style={{ flex: 1 }}>ELOS Verificado</strong><span style={{ color: '#15803d' }}>Ativo · score 87</span><Button variant="neutral" size="sm">🎓 Certificado</Button></div>
          <div style={lbl}>Motivo de rejeição</div>
          <select style={{ ...inp, marginBottom: 8 }}><option>Selecione ou escreva abaixo...</option>{MOTIVOS.map((m) => <option key={m}>{m}</option>)}</select>
          <textarea rows={2} placeholder="Observações adicionais ou motivo personalizado..." style={{ ...inp, marginBottom: 12, resize: 'vertical' }}/>
          <Button variant="success" full disabled={pendentes > 0} onClick={() => setToast('✅ Homologação aprovada — certificado emitido e fornecedor avisado.')}>{pendentes ? `🚫 ${pendentes} doc(s) impeditivo(s)` : '✅ Homologar — Horizonte Mineração'}</Button>
          <div style={{ height: 8 }}/>
          <Button variant="danger" full>❌ Rejeitar</Button>
          <div style={{ height: 8 }}/>
          <Button variant="neutral" full onClick={() => setToast(`✅ Solicitação de ${pendentes} documento(s) enviada ao fornecedor.`)}>📧 Solicitar Documentos ({pendentes})</Button>
          <div style={{ fontFamily: D, fontSize: 11, color: '#9B9B9B', marginTop: 10 }}>Quando o último documento é analisado, o processo fecha sozinho: todos aprovados → homologado; algum reprovado → o fornecedor recebe o motivo por e-mail.</div>
        </Card>
      </div>

      {/* modais */}
      <DocViewer doc={ver} onClose={() => setVer(null)}/>
      <HistoryModal doc={hist} onClose={() => setHist(null)}/>
      {aprovar && (
        <Modal onClose={() => setAprovar(null)} max={440}>
          <div style={{ fontFamily: M, fontWeight: 800, fontSize: 18, color: '#15803d' }}>✓ Aprovar Documento</div>
          <div style={{ fontFamily: D, fontSize: 13, color: '#64748b', marginBottom: 16 }}>{aprovar.label}</div>
          <span style={lbl}>Válido até *</span>
          <input type="date" value={validade} onChange={(e) => setValidade(e.target.value)} style={inp}/>
          <div style={{ fontFamily: D, fontSize: 11, color: '#9B9B9B', margin: '4px 0 12px' }}>{aprovar.expires ? 'Validade informada no documento' : 'Sem validade no documento — análise + 1 ano'}</div>
          <span style={lbl}>Observação (opcional)</span>
          <input placeholder="Ex: Documento válido e dentro do prazo" style={{ ...inp, marginBottom: 16 }}/>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="neutral" full onClick={() => setAprovar(null)}>Cancelar</Button>
            <Button variant="success" full onClick={() => { setStatus(aprovar.id, 'VALID', null, validade); setAprovar(null) }}>✓ Confirmar Aprovação</Button>
          </div>
        </Modal>
      )}
      {rejeitar && (
        <Modal onClose={() => setRejeitar(null)} max={460}>
          <div style={{ fontFamily: M, fontWeight: 800, fontSize: 18, color: '#dc2626' }}>✕ Rejeitar Documento</div>
          <div style={{ fontFamily: D, fontSize: 13, color: '#64748b', marginBottom: 16 }}>{rejeitar.label}</div>
          <span style={lbl}>Motivo da rejeição * <span style={{ textTransform: 'none', fontWeight: 400 }}>(digite para buscar — motivos do HOC)</span></span>
          <input list="demo-motivos" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Digite para buscar ou escreva um motivo..." style={{ ...inp, marginBottom: 16 }}/>
          <datalist id="demo-motivos">{MOTIVOS.map((m) => <option key={m} value={m}/>)}</datalist>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="neutral" full onClick={() => setRejeitar(null)}>Cancelar</Button>
            <Button variant="danger" full disabled={!motivo.trim()} onClick={() => { setStatus(rejeitar.id, 'REJECTED', motivo.trim()); setRejeitar(null); setToast('✅ Documento rejeitado — o fornecedor recebeu o motivo por e-mail.') }}>✕ Confirmar Rejeição</Button>
          </div>
        </Modal>
      )}
      {reverter && (
        <Modal onClose={() => setReverter(null)} max={480}>
          <div style={{ fontFamily: M, fontWeight: 800, fontSize: 18, color: '#b45309' }}>↩ Reverter decisão do documento</div>
          <div style={{ fontFamily: D, fontSize: 13, color: '#64748b', marginBottom: 10 }}>{reverter.label}</div>
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 12px', fontFamily: D, fontSize: 12.5, color: '#374151', marginBottom: 12 }}>
            O documento está <strong>{reverter.status === 'VALID' ? 'aprovado' : 'reprovado'}</strong>. Ao reverter, ele volta para <strong>Em análise</strong>. A decisão desfeita fica registrada no Log do Processo.
          </div>
          <textarea rows={3} value={motivoRev} onChange={(e) => setMotivoRev(e.target.value)} placeholder="Motivo da reversão (obrigatório) — ex.: reprovado por engano" style={{ ...inp, marginBottom: 14, resize: 'vertical' }}/>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="neutral" full onClick={() => setReverter(null)}>Cancelar</Button>
            <Button variant="primary" full disabled={!motivoRev.trim()} onClick={() => { setStatus(reverter.id, 'PENDING'); setReverter(null) }}>↩ Confirmar reversão</Button>
          </div>
        </Modal>
      )}
      {cnae && (
        <Modal onClose={() => setCnae(null)} max={560}>
          <div style={{ fontFamily: M, fontWeight: 800, fontSize: 17, color: '#1a1c5e' }}>🧩 Validação do CNAE</div>
          <div style={{ fontFamily: D, fontSize: 12.5, color: '#64748b', margin: '4px 0 14px' }}>Vincule cada categoria da homologação a um CNAE do fornecedor (principal ou secundário).</div>
          {FICHA.categorias.map((c) => (
            <div key={c.nome} style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 10, alignItems: 'center', padding: '6px 8px', borderRadius: 8, background: vinculos[c.nome] ? '#f0fdf4' : 'transparent', marginBottom: 4 }}>
              <strong style={{ fontFamily: D, fontSize: 12.5, color: '#1a1c5e' }}>{c.nome} →</strong>
              <select value={vinculos[c.nome] || ''} onChange={(e) => setVinculos((v) => ({ ...v, [c.nome]: e.target.value }))} style={inp}>
                <option value="">Selecionar CNAE...</option>
                <option>★ {FICHA.cnaePrincipal.codigo} — {FICHA.cnaePrincipal.desc}</option>
                {FICHA.cnaesSec.map((s) => <option key={s.codigo}>{s.codigo} — {s.desc}</option>)}
              </select>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <Button variant="neutral" full onClick={() => setCnae(null)}>Cancelar</Button>
            <Button variant="success" full disabled={Object.keys(vinculos).length < FICHA.categorias.length} onClick={() => { setValidade(umAno); setAprovar(cnae); setCnae(null) }}>✓ Validar vínculos e aprovar CNAE</Button>
          </div>
        </Modal>
      )}
      {ia && (
        <Modal onClose={() => setIa(null)} max={560}>
          <div style={{ fontFamily: M, fontWeight: 800, fontSize: 17, color: '#1a1c5e' }}>🤖 {ia.tipo === 'bank' ? 'Dados Bancários' : 'DRE / Dados Financeiros'}</div>
          <div style={{ fontFamily: D, fontSize: 12.5, color: '#64748b', margin: '2px 0 12px' }}>{ia.doc?.label}</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <Button variant="neutral" size="sm" onClick={() => setVer(ia.doc)}>👁 Ver documento</Button>
            <Button variant="primary" size="sm" disabled={ia.fase === 'extraindo'} onClick={() => extrair(ia.tipo)}>{ia.fase === 'extraindo' ? 'Extraindo...' : '🤖 Extrair com IA'}</Button>
          </div>
          {ia.fase === 'extraindo' && <div style={{ fontFamily: D, fontSize: 12.5, color: '#2E3192', marginBottom: 10 }}>Analisando documento com IA — aguarde alguns segundos...</div>}
          {ia.fase === 'pronto' && <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '7px 10px', fontFamily: D, fontSize: 12, color: '#166534', marginBottom: 10 }}>🤖 Campos preenchidos pela IA a partir do documento — confira antes de salvar.</div>}
          {ia.tipo === 'bank' ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[['banco', 'Nome do Banco'], ['compe', 'Código COMPE'], ['agencia', 'Agência'], ['conta', 'Conta c/ dígito'], ['pix', 'Chave PIX'], ['tipo', 'Tipo de Conta']].map(([k, l]) => (
                <div key={k}><span style={lbl}>{l}</span><input value={banco[k]} onChange={(e) => setBanco({ ...banco, [k]: e.target.value })} style={inp}/></div>
              ))}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
              {[['ano', 'Ano'], ['receita', 'Receita'], ['ativo', 'Ativo'], ['passivo', 'Passivo'], ['lucro', 'Lucro'], ['ebitda', 'EBITDA'], ['estoque', 'Estoque']].map(([k, l]) => (
                <div key={k}><span style={lbl}>{l}</span><input readOnly value={dre[0]?.[k] ?? ''} style={inp}/></div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <Button variant="neutral" full onClick={() => setIa(null)}>Fechar</Button>
            <Button variant="primary" full onClick={() => { setIa(null); setToast('✅ Dados salvos.') }}>💾 Salvar dados</Button>
            <Button variant="success" full onClick={() => { const d = ia.doc; setIa(null); setValidade(umAno); setAprovar(d) }}>✓ Aprovar documento</Button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Convites ────────────────────────────────────────────────────────────────
const ST_CONV = {
  SENT: { l: 'Enviado', c: '#2563eb' }, VIEWED: { l: 'Visualizado', c: '#7c3aed' },
  ACCEPTED: { l: 'Cadastrado', c: '#15803d' }, CANCELLED: { l: 'Cancelado', c: '#9B9B9B' },
}
export function DemoAdminConvites() {
  const [aviso, setAviso] = useState('')
  return (
    <div style={wrap}>
      <PageHeader title="Convites" subtitle="Convites enviados pelos clientes — ver, reenviar, cancelar e copiar o link"/>
      {aviso && <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontFamily: D, fontSize: 13, color: '#166534' }}>{aviso}</div>}
      {DEMO_ADMIN_CONVITES.map((inv) => {
        const st = ST_CONV[inv.status]
        return (
          <Card key={inv.cnpj + inv.status} style={{ borderRadius: 12, padding: '14px 18px', marginBottom: 8, opacity: inv.status === 'CANCELLED' ? 0.7 : 1 }}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 260 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: M, fontWeight: 700, fontSize: 13, color: '#1a1c5e' }}>{inv.fornecedor}</span>
                  <span style={pill(st.c, `${st.c}18`)}>{st.l}</span>
                  {inv.subsidiado && <span style={pill('#065f46', '#d1fae5')}>SUBSIDIADO</span>}
                </div>
                <div style={{ fontFamily: D, fontSize: 12, color: '#6b7280', marginTop: 3 }}>
                  CNPJ {inv.cnpj} · {inv.email}{inv.telefone ? ` · 📞 ${inv.telefone}` : ''}
                </div>
                <div style={{ fontFamily: D, fontSize: 11.5, color: '#2E3192', fontWeight: 600, marginTop: 3 }}>🏢 {inv.cliente} · {inv.fluxo}</div>
                <div style={{ fontFamily: D, fontSize: 11, color: '#9B9B9B', marginTop: 3 }}>Enviado {inv.quando}</div>
              </div>
              {['SENT', 'VIEWED'].includes(inv.status) && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <Button variant="neutral" size="sm" onClick={() => setAviso(`Convite reenviado para ${inv.email}.`)}>↻ Reenviar</Button>
                  <Button variant="neutral" size="sm" onClick={() => setAviso('Link do convite copiado.')}>🔗 Copiar link</Button>
                  <Button variant="danger" size="sm" onClick={() => setAviso(`Convite para ${inv.email} cancelado — o link enviado não vale mais.`)}>✕ Cancelar</Button>
                </div>
              )}
            </div>
          </Card>
        )
      })}
    </div>
  )
}

// ── BC Report ───────────────────────────────────────────────────────────────
const FAIXA = { baixo: ['Risco baixo', '#15803d'], medio: ['Risco médio', '#b45309'], alto: ['Risco alto', '#dc2626'], critico: ['Crítico', '#7f1d1d'] }
export function DemoAdminBcReport() {
  const [cnpj, setCnpj] = useState('41.090.118/0001-30')
  const [tipo, setTipo] = useState('Full')
  const [fase, setFase] = useState(null)   // null | coletando | pdf | pronto
  const emitir = () => {
    setFase('coletando')
    setTimeout(() => setFase('pdf'), 1800)
    setTimeout(() => setFase('pronto'), 3000)
  }
  const r = DEMO_BC_RESULTADO
  const [faixaLabel, faixaCor] = FAIXA[r.faixa]
  const totalFontes = DEMO_BC_FONTES.reduce((a, g) => a + g.fontes.length, 0)
  return (
    <div style={wrap}>
      <PageHeader title="BC Report" subtitle="Background check automatizado — emita o relatório digitando o CNPJ"/>
      <Card style={{ borderRadius: 16, padding: '20px 24px', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontFamily: M, fontWeight: 700, fontSize: 10, color: '#9B9B9B', textTransform: 'uppercase', marginBottom: 4 }}>CNPJ</div>
            <input value={cnpj} onChange={(e) => setCnpj(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e2e4ef', fontFamily: D, fontSize: 14, boxSizing: 'border-box' }}/>
          </div>
          {['Light', 'Full'].map((t) => (
            <button key={t} onClick={() => setTipo(t)} style={{ padding: '10px 16px', borderRadius: 10, cursor: 'pointer', fontFamily: M, fontWeight: 700, fontSize: 12, border: `1.5px solid ${tipo === t ? '#2E3192' : '#e2e4ef'}`, background: tipo === t ? 'rgba(46,49,146,.08)' : '#fff', color: tipo === t ? '#2E3192' : '#64748b' }}>
              {t === 'Light' ? '⚡ Light — cadastro, listas e certidões' : '🔎 Full — tudo + judicial, ambiental e mídia'}
            </button>
          ))}
          <Button variant="primary" onClick={emitir} disabled={fase && fase !== 'pronto'}>🕵️ Emitir</Button>
        </div>
        <div style={{ fontFamily: D, fontSize: 12, color: '#6b7280', marginTop: 10 }}>
          {totalFontes} fontes oficiais e bases públicas · Score EQPI de 0 a 100 com parecer · PDF com índice de evidências anexadas
        </div>
      </Card>

      {fase && fase !== 'pronto' && (
        <Card style={{ borderRadius: 16, padding: '18px 24px', marginBottom: 16 }}>
          <div style={{ fontFamily: M, fontWeight: 700, fontSize: 14, color: '#2E3192' }}>
            {fase === 'coletando' ? `🔄 Coletando fontes… (${totalFontes} consultas em paralelo)` : '🖨️ Gerando PDF…'}
          </div>
        </Card>
      )}

      {fase === 'pronto' && (
        <Card style={{ borderRadius: 16, padding: '20px 24px', marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ width: 110, height: 110, borderRadius: '50%', border: `8px solid ${faixaCor}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ fontFamily: M, fontWeight: 900, fontSize: 30, color: faixaCor }}>{r.score}</div>
              <div style={{ fontFamily: D, fontSize: 10, color: '#6b7280' }}>Score EQPI</div>
            </div>
            <div style={{ flex: 1, minWidth: 260 }}>
              <div style={{ fontFamily: M, fontWeight: 800, fontSize: 16, color: '#1a1c5e' }}>{r.empresa} · BC Report {tipo}</div>
              <div style={{ fontFamily: D, fontSize: 12, color: '#6b7280' }}>CNPJ {r.cnpj} · <strong style={{ color: faixaCor }}>{faixaLabel}</strong></div>
              {r.achados.map((a) => (
                <div key={a.t} style={{ fontFamily: D, fontSize: 12.5, color: '#374151', marginTop: 5 }}>{a.ok ? '✅' : '⚠️'} {a.t}</div>
              ))}
            </div>
            <Button variant="primary">📄 Baixar PDF</Button>
          </div>
        </Card>
      )}

      <Card style={{ borderRadius: 16, padding: '20px 24px' }}>
        <SectionTitle>Fontes consultadas</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 12 }}>
          {DEMO_BC_FONTES.map((g) => (
            <div key={g.grupo} style={{ background: '#fafbff', border: '1px solid #eef0f6', borderRadius: 12, padding: '10px 12px' }}>
              <div style={{ fontFamily: M, fontWeight: 700, fontSize: 12, color: '#2E3192', marginBottom: 4 }}>{g.grupo}</div>
              {g.fontes.map((f) => <div key={f} style={{ fontFamily: D, fontSize: 12, color: '#374151' }}>· {f}</div>)}
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

// ── Financeiro ──────────────────────────────────────────────────────────────
export function DemoAdminFinanceiro() {
  const subs = [
    ['Primatus Serviços Técnicos', 'ELOS Verificado — anual', 'R$ 199,00', 'Pago · NFS-e emitida', '#15803d'],
    ['LogFlex Transportes', 'Horizonte — Suprimentos', 'R$ 690,00', 'Pago · repasse previsto 03/10', '#15803d'],
    ['Inova Sistemas', 'Comprador Pro — mensal', 'R$ 199,00', 'Renova em 12 dias', '#b45309'],
  ]
  return (
    <div style={wrap}>
      <PageHeader title="Financeiro" subtitle="Assinaturas Stripe, homologações subsidiadas e visão operacional · valores ilustrativos"/>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14, marginBottom: 20 }}>
        <KpiCard label="MRR (Stripe)" value="R$ 38,4 mil" sub="+12% no mês" icon="💰" iconBg="rgba(244,126,47,.12)"/>
        <KpiCard label="Assinaturas Stripe" value="312" sub="fornecedores e compradores" icon="💳" iconBg="rgba(46,49,146,.1)"/>
        <KpiCard label="Homologações subsidiadas" value="46" sub="a faturar aos clientes" icon="🏢" iconBg="rgba(34,197,94,.12)"/>
      </div>
      <Card style={{ borderRadius: 16, padding: '20px 24px', marginBottom: 16 }}>
        <SectionTitle>Assinaturas via Stripe</SectionTitle>
        {subs.map(([f, p, v, s, c]) => (
          <div key={f} style={{ display: 'grid', gridTemplateColumns: '1.3fr 1.3fr 100px 1.2fr', gap: 10, padding: '9px 0', borderTop: '1px solid #f4f5f9', fontFamily: D, fontSize: 12.5, color: '#374151' }}>
            <strong style={{ color: '#1a1c5e' }}>{f}</strong><span>{p}</span><span>{v}</span><span style={{ color: c, fontWeight: 600 }}>{s}</span>
          </div>
        ))}
        <div style={{ fontFamily: D, fontSize: 11.5, color: '#9B9B9B', marginTop: 8 }}>
          Cada pagamento gera a nota fiscal de serviço automaticamente. Previsão de repasse: pagamento + 3 dias úteis. Aceita cupom de desconto no checkout.
        </div>
      </Card>
      <Card style={{ borderRadius: 16, padding: '20px 24px' }}>
        <SectionTitle>Homologações subsidiadas — faturar ao cliente</SectionTitle>
        <div style={{ fontFamily: D, fontSize: 12.5, color: '#374151' }}>
          Horizonte Mineração · 46 fornecedores subsidiados no período · <strong>exportar Excel</strong> para faturamento
        </div>
      </Card>
    </div>
  )
}

// Tela do backoffice pedida pelo DemoPage (carregado sob demanda)
export default function DemoBackofficeScreen({ screen, navigate }) {
  if (screen === 'analise')    return <DemoAdminAnalise navigate={navigate}/>
  if (screen === 'processo')   return <DemoAdminProcesso/>
  if (screen === 'convites')   return <DemoAdminConvites/>
  if (screen === 'bc')         return <DemoAdminBcReport/>
  if (screen === 'financeiro') return <DemoAdminFinanceiro/>
  return <DemoAdminInicio navigate={navigate}/>
}
