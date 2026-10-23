// Demo · perfil Backoffice EQPI (refresh 30/09): a operação por trás da
// homologação — Farol, fila de análise, ficha do processo, convites, BC
// Report e Financeiro. Dados fictícios. A automação (Rota A: certidões nas
// fontes oficiais; Rota B: pré-análise por IA) está em produção desde
// 07/10/2026 e aparece marcada "Novo" (antes: "Em breve").
//
// ACESSO RESTRITO (30/09): este arquivo é carregado sob demanda (React.lazy)
// só depois que o código de acesso é validado no servidor (demo-unlock) —
// o /demo é público e clientes/concorrentes não devem ver a operação.
// Os dados do backoffice ficam AQUI (não em demoData.js) para não irem no
// pacote principal do site.
import { useState, useMemo } from 'react'
import { Card, Button, KpiCard, PageHeader, SectionTitle } from '../../components/ui.jsx'
import ProcessLog from '../../components/ProcessLog.jsx'
import { FICHA, Tabs, Modal, DocViewer, HistoryModal, Field, StatusDot, effStatus, DOC_STATUS, logFetcher, useToast, SO_REAL, InlineConfirm, exportRows, fmt } from './DemoFichaKit.jsx'
import { pickFile } from './DemoFichas.jsx'
import { PRIMATUS, HORIZONTE, MERIDIANO, isoD, isoDT, brD, fmtBR, fmtBRDT, addBusinessDaysIso, toBusinessDayIso } from './demoData.js'

// Backoffice · fila de análise de documentos (padrão HOC: envio + 3 dias úteis)
const DEMO_ADMIN_FILA = [
  { id: 'f1', fornecedor: PRIMATUS.razao, cnpj: PRIMATUS.cnpj, cliente: 'Horizonte Mineração', doc: 'Apólice de Seguro de Responsabilidade Civil', limite: 'ultrapassada', rota: null, primatus: true },
  { id: 'f2', fornecedor: 'Ômega Engenharia Ltda', cnpj: '41.090.118/0001-30', cliente: 'Horizonte Mineração', doc: 'Alvará de Funcionamento', limite: 'hoje', rota: { r: 'B', s: 'reprovar', m: `Documento vencido em ${brD(-19)} e de outra filial (0006-51).` } },
  { id: 'f3', fornecedor: 'TechFix Industrial S.A.', cnpj: '07.332.910/0001-41', cliente: 'Horizonte Mineração', doc: 'CND Tributos Federais', limite: 'hoje', rota: { r: 'A', s: 'aprovar', m: 'Receita/PGFN: certidão negativa emitida na fonte oficial.' } },
  { id: 'f4', fornecedor: 'Sulbras Serviços Ltda', cnpj: '19.554.203/0001-88', cliente: 'Horizonte Mineração', doc: 'CNDT Certidão Trabalhista', limite: 'futura', rota: { r: 'A', s: 'reprovar', m: 'TST: POSITIVA — consta no BNDT (débitos trabalhistas).' } },
  { id: 'f5', fornecedor: 'Norte Industrial Ltda', cnpj: '28.119.340/0001-55', cliente: 'ELOS', doc: 'Licença de Operação', limite: 'futura', rota: { r: 'B', s: 'aprovar', m: `LO do órgão ambiental, CNPJ confere, válida até ${brD(612)}.` } },
  { id: 'f6', fornecedor: 'BioTech Serviços Ambientais', cnpj: '22.781.604/0001-17', cliente: 'Horizonte Mineração', doc: 'Contrato Social', limite: 'futura', rota: null },
]

// Backoffice · convites (telefone informado pelo cliente ao lado do e-mail)
const DEMO_ADMIN_CONVITES = [
  { fornecedor: 'Vértice Montagens Ltda', cnpj: '33.901.227/0001-60', email: 'contato@vertice.com.br', telefone: '(31) 98765-4321', cliente: 'Horizonte Mineração', fluxo: 'Suprimentos – Nível 2', status: 'VIEWED', quando: fmtBRDT(isoDT(-9, '14:27')), subsidiado: true },
  { fornecedor: 'NovaTech Serviços Ltda', cnpj: '64.123.789/0001-99', email: 'novo@novatech.com.br', telefone: '', cliente: 'Horizonte Mineração', fluxo: 'Suprimentos – Nível 1', status: 'SENT', quando: fmtBRDT(isoDT(-3, '10:05')), subsidiado: false },
  { fornecedor: PRIMATUS.razao, cnpj: PRIMATUS.cnpj, email: 'lucas@primatus.com.br', telefone: PRIMATUS.telefone, cliente: 'Horizonte Mineração', fluxo: 'Suprimentos – Nível 2', status: 'ACCEPTED', quando: fmtBRDT(isoDT(-51, '09:12')), subsidiado: true },
  { fornecedor: 'Delta Serviços Gerais Ltda', cnpj: '05.448.310/0001-91', email: 'adm@deltaservicos.com.br', telefone: '', cliente: 'Horizonte Mineração', fluxo: 'Suprimentos – Nível 1', status: 'CANCELLED', quando: fmtBRDT(isoDT(-44, '16:40')), subsidiado: true },
]

// Backoffice · BC Report (fontes consultadas e resultado de exemplo)
const DEMO_BC_FONTES = [
  { grupo: 'Cadastro', fontes: ['Receita Federal (CNPJ, QSA, CNAE)', 'Simples Nacional', 'Sintegra'] },
  { grupo: 'Fiscal e trabalhista', fontes: ['CND Federal / PGFN', 'Dívida Ativa da União', 'CRF FGTS', 'CNDT (TST)', 'CND Estadual', 'CND Municipal'] },
  { grupo: 'Listas restritivas', fontes: ['CEIS', 'CNEP', 'CEPIM', 'Acordos de Leniência', 'Trabalho Escravo (MTE)', 'OFAC', 'ONU', 'PEP'] },
  { grupo: 'Judicial e integridade', fontes: ['Falência e Recuperação Judicial', 'CNJ Improbidade', 'DataJud (processos)', 'CGU Correcional', 'MPF / MPT'] },
  { grupo: 'Ambiental e reputação', fontes: ['IBAMA (embargos)', 'Mídia negativa', 'ICIJ (vazamentos offshore)', 'TSE (candidaturas de sócios)'] },
]
// empresas fictícias conhecidas da demo (o resultado usa o CNPJ digitado)
const BC_EMPRESAS = {
  [PRIMATUS.cnpj]: PRIMATUS.razao, '41.090.118/0001-30': 'Ômega Engenharia Ltda', '07.332.910/0001-41': 'TechFix Industrial S.A.',
  '19.554.203/0001-88': 'Sulbras Serviços Ltda', '28.119.340/0001-55': 'Norte Industrial Ltda', [HORIZONTE.cnpj]: HORIZONTE.razao,
}
const DEMO_BC_RESULTADO = {
  score: 78, faixa: 'medio',
  achados: [
    { ok: true,  t: 'Situação cadastral ATIVA; sócios sem restrição' },
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

// selo da automação: em produção desde 07/10/2026 (nome mantido p/ não mexer nos usos)
export function EmBreve({ style }) {
  return <span style={{ ...pill('#15803d', '#dcfce7'), ...style }} title="Novidade — em produção para os processos do ELOS">✨ Novo</span>
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
  const [cli, setCli] = useState('')   // filtro de cliente (produção: 08/10)
  const [, setToast, ToastEl] = useToast()
  const clientesFila = [...new Set(DEMO_ADMIN_FILA.map((d) => d.cliente))]
  const lista = DEMO_ADMIN_FILA.filter((d) => (!sug || (sug === 'nenhuma' ? !d.rota : d.rota?.s === sug || d.rota?.r === sug)) && (!cli || d.cliente === cli))
  const sel = { padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e4ef', fontFamily: D, fontSize: 13, width: '100%' }
  const lbl = { display: 'block', fontFamily: M, fontWeight: 700, fontSize: 10, color: '#9B9B9B', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 }
  return (
    <div style={wrap}>
      {ToastEl}
      <PageHeader title="Análise de Documentos" subtitle="Aprovação e rejeição em lote · independente de fornecedor"/>
      <Card style={{ borderRadius: 14, padding: '16px 20px', marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 12 }}>
          <div><span style={lbl}>Tipo de documento</span><select style={sel}><option>Todos os tipos</option></select></div>
          <div><span style={lbl}>Fornecedor (nome ou CNPJ)</span><input placeholder="Buscar fornecedor..." style={{ ...sel, boxSizing: 'border-box' }}/></div>
          <div>
            <span style={lbl}>Cliente</span>
            <select value={cli} onChange={(e) => setCli(e.target.value)} style={sel}>
              <option value="">Todos os clientes</option>
              {clientesFila.map((c) => <option key={c} value={c}>{c === 'ELOS' ? 'ELOS (selo próprio, sem cliente)' : c}</option>)}
            </select>
          </div>
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
                <Button variant="neutral" size="sm" title="Ver documento" onClick={() => setToast('ℹ️ Demonstração: abre o arquivo do documento enviado.')}>👁</Button>
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
                : 'Status "Reprovado", motivo da recusa e vencimento em 4 meses (nova checagem do documento) preenchidos pela sugestão — o fornecedor recebe o motivo por e-mail. Confira e salve.'}
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
const agoraBR = () => `${brD(0)} ${new Date().toTimeString().slice(0, 5)}`

// Validação do CNAE — espelha src/components/CnaeValidationModal.jsx: contador,
// "mostrar só as sem CNAE", repetir o último CNAE, e categoria sem CNAE fica
// REPROVADA no processo (o processo segue)
function CnaeModal({ cats, onValidated, onClose }) {
  const opcoes = [{ code: FICHA.cnaePrincipal.codigo, desc: FICHA.cnaePrincipal.desc, main: true }, ...FICHA.cnaesSec.map(c => ({ code: c.codigo, desc: c.desc, main: false }))]
  const [lista, setLista] = useState(cats)
  const [ultimo, setUltimo] = useState('')
  const [soPendentes, setSoPendentes] = useState(false)
  const [confirmar, setConfirmar] = useState(null)   // 'todas' | 'validar'
  const descDe = (code) => opcoes.find(o => o.code === code)
  const escolher = (nome, cnae) => { setLista(p => p.map(x => (x.nome === nome ? { ...x, cnae } : x))); if (cnae) setUltimo(cnae) }
  const repetir = (substituir) => { setLista(p => p.map(x => ((substituir || !x.cnae) ? { ...x, cnae: ultimo } : x))); setConfirmar(null) }
  const vinculadas = lista.filter(c => c.cnae).length
  const semCnae = lista.length - vinculadas
  const visiveis = lista.filter(c => !soPendentes || !c.cnae)
  const ult = descDe(ultimo)
  const font = { fontFamily: D }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: '#fff', borderRadius: 16, maxWidth: 1040, width: '96%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,.2)' }}>
        <div style={{ padding: '24px 28px 12px' }}>
          <div style={{ fontFamily: M, fontWeight: 800, fontSize: 18, color: '#1a1c5e', marginBottom: 4 }}>🧩 Validação do CNAE</div>
          <div style={{ ...font, fontSize: 13, color: '#64748b' }}>
            Vincule cada categoria da homologação a um CNAE do fornecedor (principal ou secundário).
            O vínculo garante que a atividade da empresa cobre a categoria contratada.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginTop: 12, ...font, fontSize: 12.5, color: '#475569' }}>
            <strong style={{ color: semCnae ? '#b45309' : '#15803d' }}>{vinculadas} de {lista.length} categorias vinculadas</strong>
            {semCnae > 0 && <span style={{ color: '#dc2626' }}>{semCnae} sem CNAE → ficarão reprovadas no processo</span>}
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
              <input type="checkbox" checked={soPendentes} onChange={e => setSoPendentes(e.target.checked)}/> mostrar só as sem CNAE
            </label>
          </div>
          {ultimo && lista.length > 1 && (
            <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 10, background: '#eef2ff', border: '1px solid #c7d2fe', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 320px', ...font, fontSize: 12.5, color: '#1e1b4b', lineHeight: 1.4 }}>
                Último CNAE escolhido: <strong>{ultimo}</strong>{ult?.desc ? ` — ${ult.desc}` : ''}
              </div>
              <Button variant="primary" size="sm" disabled={!semCnae} onClick={() => repetir(false)}>↻ Repetir nas {semCnae} sem CNAE</Button>
              <Button variant="neutral" size="sm" onClick={() => setConfirmar('todas')}>Aplicar em todas</Button>
            </div>
          )}
          {confirmar === 'todas' && (
            <InlineConfirm msg={`Aplicar ${ultimo} em TODAS as ${lista.length} categorias, substituindo as já vinculadas?`} confirmLabel="Aplicar em todas"
              onCancel={() => setConfirmar(null)} onConfirm={() => repetir(true)}/>
          )}
        </div>
        <div style={{ padding: '4px 28px', overflowY: 'auto', flex: 1 }}>
          {visiveis.map(c => {
            const o = descDe(c.cnae)
            return (
              <div key={c.nome} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.25fr)', gap: 12, alignItems: 'start', padding: '10px 12px', borderRadius: 10, border: '1px solid #eef0f6', marginBottom: 8, background: c.cnae ? 'rgba(34,197,94,.04)' : '#fff' }}>
                <div style={{ fontSize: 13, ...font, fontWeight: 600, color: '#1a1c5e', lineHeight: 1.35, paddingTop: 6 }}>{c.nome}</div>
                <div style={{ minWidth: 0 }}>
                  <select value={c.cnae || ''} onChange={e => escolher(c.nome, e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${c.cnae ? '#86efac' : '#e2e4ef'}`, ...font, fontSize: 12, background: '#fff' }}>
                    <option value="">Selecionar CNAE...</option>
                    {opcoes.map(op => <option key={op.code} value={op.code}>{op.main ? '★ ' : ''}{op.code} — {op.desc}</option>)}
                  </select>
                  {o ? (
                    <div style={{ ...font, fontSize: 11.5, color: '#475569', marginTop: 4, lineHeight: 1.35 }}>{o.main ? '★ Principal' : 'Secundário'} · {o.code} — {o.desc}</div>
                  ) : (
                    <div style={{ ...font, fontSize: 11.5, color: '#dc2626', marginTop: 4 }}>{c.reprovada ? '✕ Reprovada no processo (sem CNAE compatível)' : 'Sem CNAE → fica reprovada no processo'}</div>
                  )}
                </div>
              </div>
            )
          })}
          {!visiveis.length && <div style={{ ...font, fontSize: 13, color: '#15803d', padding: 12 }}>✓ Todas as categorias já têm CNAE.</div>}
        </div>
        <div style={{ padding: '12px 28px 22px', borderTop: '1px solid #eef0f6' }}>
          {confirmar === 'validar' && (
            <InlineConfirm msg={`${semCnae} de ${lista.length} categoria(s) sem CNAE ficarão REPROVADAS neste processo (a atividade do fornecedor não cobre a categoria). O processo segue normalmente. Confirmar?`}
              confirmLabel="Confirmar" variant="danger" onCancel={() => setConfirmar(null)} onConfirm={() => onValidated(lista)}/>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="neutral" full onClick={onClose}>Cancelar</Button>
            <Button variant="success" full onClick={() => (semCnae ? setConfirmar('validar') : onValidated(lista))}>
              {semCnae ? `✓ Validar (${semCnae} reprovada${semCnae > 1 ? 's' : ''}) e aprovar CNAE` : '✓ Validar vínculos e aprovar CNAE'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function DemoAdminProcesso() {
  // a ficha do backoffice começa no momento em que a analista valida o CNAE
  // (nas demais visões a validação já foi feita: Caldeiraria reprovada)
  const [docs, setDocs] = useState(() => FICHA.docs.map(d => (d.id === 'd61' ? { ...d, status: 'PENDING', meta: null } : d)))
  const [cats, setCats] = useState(() => FICHA.categorias.map(c => ({ nome: c.nome, cnae: '', validada: false, reprovada: false })))
  const [mobPost, setMobPost] = useState(FICHA.mobilizacao.docsPosto)
  const [mobPessoas, setMobPessoas] = useState(FICHA.mobilizacao.colaboradores)
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
  const [ia, setIa] = useState(null)                 // { doc, tipo, fase }
  const [banco, setBanco] = useState({ banco: '', compe: '', agencia: '', conta: '', pix: '', tipo: 'Corrente' })
  const [bancoSalvo, setBancoSalvo] = useState(null)  // 'dd/mm/aaaa hh:mm'
  const [dre, setDre] = useState([])
  const [assertiva, setAssertiva] = useState(true)
  const [, setToast, ToastEl] = useToast()
  const umAno = isoD(365)
  const upd = (id, fn) => {
    const f = (d) => (d.id === id ? fn(d) : d)
    setDocs(ds => ds.map(f)); setMobPost(ds => ds.map(f)); setMobPessoas(ps => ps.map(p => ({ ...p, docs: p.docs.map(f) })))
  }
  const setStatus = (id, status, note = null, expires) => upd(id, (d) => ({ ...d, status, note, ...(expires ? { expires } : {}) }))
  const pj = docs
  const okSt = ['VALID', 'EXPIRING', 'NOT_APPLICABLE']
  const ok = pj.filter(d => okSt.includes(effStatus(d))).length
  const pendentes = pj.length - ok
  // mesmo score das outras visões (72) e sobe conforme o analista aprova
  const okInicial = FICHA.docs.filter(d => okSt.includes(effStatus(d))).length - 1
  const score = Math.max(0, Math.min(100, FICHA.score + (ok - okInicial) * 3))
  const lbl = { display: 'block', fontFamily: M, fontWeight: 700, fontSize: 10, color: '#9B9B9B', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }
  const inp = { width: '100%', padding: '9px 11px', borderRadius: 10, border: '1px solid #e2e4ef', fontFamily: D, fontSize: 13, boxSizing: 'border-box' }
  const salvarBanco = () => setBancoSalvo(agoraBR())
  const extrair = (tipo) => {
    setIa((x) => ({ ...x, fase: 'extraindo' }))
    setTimeout(() => {
      if (tipo === 'bank') setBanco({ ...FICHA.banco })
      else setDre(FICHA.dre)
      setIa((x) => x && { ...x, fase: 'pronto' })
    }, 1600)
  }
  const anexar = (d) => pickFile(() => { upd(d.id, (x) => ({ ...x, status: 'PENDING', note: null, sent: isoD(0), source: 'MANUAL' })); setToast(`✅ Arquivo anexado pela EQPI — ${d.label} em análise.`) })
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
    const st = effStatus(d)
    const podeDecidir = ['PENDING', 'EXPIRING', 'EXPIRED'].includes(st)
    return (<>
      {(d.kind === 'bank' || d.kind === 'dre') && d.sent
        ? <Button variant="primary" size="sm" onClick={() => setIa({ doc: d, tipo: d.kind, fase: 'inicio' })}>🤖 Analisar</Button>
        : d.sent && <Button variant="neutral" size="sm" onClick={() => setVer(d)}>👁 Ver</Button>}
      {d.sent && <Button variant="neutral" size="sm" title="Histórico e versões do documento" onClick={() => setHist(d)}>🕓</Button>}
      {['MISSING', 'REJECTED', 'EXPIRED'].includes(st) && <Button variant="neutral" size="sm" title="A EQPI anexa o arquivo no lugar do fornecedor" onClick={() => anexar(d)}>📎 Anexar arquivo</Button>}
      {podeDecidir && <Button variant="success" size="sm" onClick={() => { if (d.id === 'd61') { setCnae(d); return } setValidade(d.expires && d.expires > isoD(0) ? d.expires : umAno); setAprovar(d) }}>✓ Aprovar</Button>}
      {(podeDecidir || st === 'VALID') && <Button variant="danger" size="sm" onClick={() => { setMotivo(''); setRejeitar(d) }}>{st === 'VALID' ? '✕ Revogar' : '✕ Rejeitar'}</Button>}
      {['VALID', 'REJECTED', 'NOT_APPLICABLE'].includes(st) && <Button variant="neutral" size="sm" title="Desfaz a decisão e devolve o documento para análise" onClick={() => { setMotivoRev(''); setReverter(d) }}>↩ Reverter decisão</Button>}
    </>)
  }
  const docRow = (d, extraLabel) => {
    const st = effStatus(d)
    const cfg = DOC_STATUS[st] || DOC_STATUS.MISSING
    return (
      <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderRadius: 12, marginBottom: 7, background: cfg.bg, border: `1px solid ${cfg.bd}`, flexWrap: 'wrap' }}>
        <StatusDot status={st}/>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontFamily: M, fontWeight: 700, fontSize: 13, color: '#1a1c5e' }}>{d.label}{extraLabel}</div>
          <div style={{ fontFamily: D, fontSize: 11, color: '#9B9B9B', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 2 }}>
            <span style={pill(cfg.color, `${cfg.color}18`)}>{cfg.label}</span>
            {d.soEqpi && <span style={pill('#64748b', '#f1f5f9')}>Obtido pela EQPI</span>}
            <span>{d.status === 'MISSING' && !d.sent ? (d.soEqpi ? 'a equipe EQPI obtém (Sintegra)' : 'não enviado pelo fornecedor') : d.source === 'AUTO' ? '⚡ Auto-coletado' : 'Upload manual'}{d.expires ? ` · vence ${fmt(d.expires)}` : ''}{d.meta ? ` · ${d.meta}` : ''}</span>
          </div>
          {d.note && <div style={{ fontFamily: D, fontSize: 11, color: '#dc2626', marginTop: 2 }}>⚠ {d.note}</div>}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>{botoes(d)}</div>
      </div>
    )
  }
  const mob = FICHA.mobilizacao
  const docCats = docs.filter(d => d.source === 'MANUAL').slice(0, 6)
  return (
    <div style={wrap}>
      {ToastEl}
      <div style={{ fontFamily: D, fontSize: 13, color: '#2E3192', fontWeight: 600, marginBottom: 12 }}>← Voltar à busca de processos</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(280px,1fr)', gap: 16, alignItems: 'start' }}>
        <div>
          {/* cabeçalho */}
          <Card style={{ borderRadius: 16, padding: '18px 22px', marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ width: 52, height: 52, borderRadius: 14, background: '#EEF0FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: M, fontWeight: 900, fontSize: 20, color: '#2E3192' }}>P</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: M, fontWeight: 900, fontSize: 18, color: '#1a1c5e' }}>{FICHA.razao}</div>
                <div style={{ fontFamily: D, fontSize: 12.5, color: '#64748b' }}>{FICHA.cnpj} · {FICHA.cidade}/{FICHA.uf} · {FICHA.endereco.logradouro}</div>
                <div style={{ fontFamily: D, fontSize: 12.5, color: '#2563eb' }}>{FICHA.email} · {PRIMATUS.telefone}</div>
              </div>
              <div style={{ textAlign: 'right' }} title="Score do processo Horizonte (o score geral ELOS da Primatus é 87)">
                <div style={{ fontFamily: M, fontWeight: 900, fontSize: 30, color: score >= 70 ? '#22c55e' : '#f59e0b' }}>{score}</div>
                <div style={{ fontFamily: D, fontSize: 10.5, color: '#9B9B9B' }}>Score do processo</div>
                <Button variant="neutral" size="sm" onClick={() => setToast(SO_REAL)}>📁 Arquivar cadastro</Button>
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
              <span style={lbl}>Sanções CEIS / CNEP (API Transparência)</span><Button variant="danger" size="sm" onClick={() => setToast(SO_REAL)}>+ Nova Sanção</Button>
            </div>
            <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: '8px 12px', fontFamily: D, fontSize: 12.5, color: '#166534' }}>✅ Sem ocorrências em CEIS e CNEP</div>
            <div style={{ fontFamily: D, fontSize: 11, color: '#9B9B9B', marginTop: 8 }}>Consultado: {FICHA.cnpjData.consultado} · BrasilAPI + Portal da Transparência</div>
          </Card>
          {/* categorias */}
          <Card style={{ borderRadius: 16, padding: '18px 22px', marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}><SectionTitle style={{ marginBottom: 0 }}>Categorias de Atuação</SectionTitle><span style={{ fontFamily: D, fontSize: 12, color: '#9B9B9B' }}>{cats.length} categorias</span></div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {cats.map((c) => (
                <button key={c.nome} onClick={() => setCatAberta(catAberta === c.nome ? null : c.nome)} style={{ border: `1px solid ${c.reprovada ? '#fecaca' : '#e2e4ef'}`, background: catAberta === c.nome ? 'rgba(46,49,146,.06)' : c.reprovada ? '#fff5f5' : '#fff', borderRadius: 20, padding: '6px 12px', cursor: 'pointer', fontFamily: D, fontSize: 12.5, color: '#1a1c5e', fontWeight: 600 }}>
                  {c.nome} {c.reprovada ? <span style={pill('#b91c1c', '#fee2e2')}>✕ Reprovada no processo</span> : c.cnae ? <span style={pill('#7c3aed', '#ede9fe')}>CNAE {c.cnae}</span> : <span style={pill('#b45309', '#fef3c7')}>CNAE a validar</span>} {catAberta === c.nome ? '▲' : '▾'}
                </button>
              ))}
            </div>
            {catAberta && (
              <div style={{ marginTop: 10, background: '#fafbff', border: '1px solid #eef0f6', borderRadius: 10, padding: '8px 12px' }}>
                {cats.find(c => c.nome === catAberta)?.reprovada && <div style={{ fontFamily: D, fontSize: 12, color: '#b91c1c', marginBottom: 6 }}>Sem CNAE compatível — a atividade do fornecedor não cobre a categoria. O processo segue com as demais.</div>}
                {docCats.map((d) => { const cfg = DOC_STATUS[effStatus(d)] || DOC_STATUS.MISSING; return <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', fontFamily: D, fontSize: 12, padding: '3px 0' }}><span>{d.label}</span><span style={{ color: cfg.color, fontWeight: 700 }}>{cfg.label}</span></div> })}
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
              <div style={{ fontFamily: D, fontSize: 11.5, color: '#9B9B9B', marginBottom: 8 }}>Consultado: {fmtBRDT(isoDT(-50, '10:15'))} · Protocolo: 88412</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                <div style={{ background: '#f0fdf4', borderRadius: 10, padding: '10px 12px' }}><div style={lbl}>Score de Crédito</div><div style={{ fontFamily: M, fontWeight: 900, fontSize: 22, color: ASSERTIVA.B[1] }}>B <span style={{ fontSize: 12 }}>{ASSERTIVA.B[0]}</span></div><div style={{ fontFamily: D, fontSize: 11.5, color: '#64748b' }}>742 pontos</div></div>
                <div style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 12px' }}><div style={lbl}>Protestos</div><div style={{ fontFamily: M, fontWeight: 900, fontSize: 22, color: '#1a1c5e' }}>0</div><div style={{ fontFamily: D, fontSize: 11.5, color: '#64748b' }}>R$ 0,00</div></div>
                <div style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 12px' }}><div style={lbl}>Faturamento Est.</div><div style={{ fontFamily: M, fontWeight: 900, fontSize: 22, color: '#1a1c5e' }}>R$ 6,4 mi</div></div>
              </div>
              <div style={{ fontFamily: D, fontSize: 11.5, color: '#64748b', marginTop: 8 }}>📋 3 consultas recentes · Última: {brD(-54)}</div>
            </>)}
          </Card>
          {/* abas */}
          <Card style={{ borderRadius: 16, padding: '6px 22px 18px' }}>
            <Tabs value={tab} onChange={setTab} tabs={[['docs', 'Documentos'], ['quest', `Questionário (${FICHA.questionario.length})`], ['banco', `Dados Bancários${bancoSalvo ? ' ✓' : ''}`], ['dre', `DRE / Financeiro (${dre.length})`], ['log', 'Log do Processo'], ['conv', `Convites (${FICHA.convites.length})`]]}/>
            {tab === 'docs' && (<>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <SectionTitle style={{ marginBottom: 0 }}>Documentos para Validação</SectionTitle>
                <span style={{ fontFamily: D, fontSize: 12 }}><span style={{ color: '#15803d' }}>✓ {ok} ok</span> <span style={{ color: '#dc2626' }}>✕ {pendentes} pendente</span></span>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
                <span style={lbl}>Processo:</span>
                <span style={pill('#2E3192', 'rgba(46,49,146,.1)')}>⏳ Horizonte Mineração</span><span style={pill('#64748b', '#f1f5f9')}>🏅 ELOS</span><span style={pill('#64748b', '#f1f5f9')}>Todos</span>
              </div>
              {quadro('a', '⚙️', 'Coleta automática nas fontes oficiais (Rota A)', `7 obtidos · 2 com o fornecedor · custo R$ 2,08 · ${brD(-50)} 10:15 → 10:37`, [
                ['CND Federal', 'Receita/PGFN', '✓ sugere aprovar — negativa'], ['CRF FGTS', 'Caixa', '✓ sugere aprovar — regular'], ['CNDT', 'TST', '✓ sugere aprovar — negativa'],
                ['Inscrição Estadual', 'Sintegra', '📤 com a EQPI — fonte indisponível, a equipe obtém'], ['CND Municipal', 'Prefeitura', '📤 com o fornecedor — prefeitura exige inscrição municipal']])}
              {quadro('b', '🤖', 'Pré-análise por IA dos documentos enviados (Rota B)', '2 analisados (1 aprovar · 1 reprovar) · analista concordou em 2/2 · custo R$ 0,12', [
                ['Alvará de Funcionamento', 'Regra do cliente + checklist', '✕ reprovar — vencido (pág. 1)'], ['Contrato Social', 'Regra do cliente + checklist', '✓ aprovar — 5/5 itens atendidos']])}
              {docs.map((d) => docRow(d))}
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1.5px dashed #c7c9e2' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}><SectionTitle style={{ marginBottom: 0 }}>👷 Documentos de Mobilização</SectionTitle><span style={pill('#2E3192', 'rgba(46,49,146,.08)')}>1 posto</span></div>
                <div style={{ border: '1px solid #e2e4ef', borderRadius: 12, padding: '10px 14px' }}>
                  <div style={{ fontFamily: M, fontWeight: 700, fontSize: 13, color: '#1a1c5e' }}>📍 {mob.posto} — {mob.cidade}/{mob.uf}</div>
                  <div style={{ fontFamily: D, fontSize: 11.5, color: '#9B9B9B', marginBottom: 8 }}>Processo {FICHA.cliente} · {mob.funcao} · {mob.postos} postos / {mob.pessoas} pessoas · {mobPessoas.length}/{mob.pessoas} cadastradas</div>
                  {mobPost.map((d) => docRow({ ...d, source: 'MANUAL' }, ' — doc. do posto'))}
                  {mobPessoas.map((p) => (
                    <div key={p.id} style={{ marginLeft: 10, marginTop: 8 }}>
                      <div style={{ fontFamily: D, fontWeight: 700, fontSize: 12.5, color: '#374151', marginBottom: 6 }}>👤 {p.nome} · CPF {p.cpf}</div>
                      {p.docs.map((d) => docRow({ ...d, source: 'MANUAL' }))}
                    </div>
                  ))}
                </div>
              </div>
            </>)}
            {tab === 'quest' && FICHA.questionario.flatMap((qq) => qq.itens.map((q) => (
              <div key={q.q} style={{ border: '1px solid #eef0f6', borderRadius: 10, padding: '9px 12px', marginBottom: 8 }}>
                <div style={{ fontFamily: D, fontSize: 11, color: '#9B9B9B' }}>{FICHA.cliente} · {qq.titulo}</div>
                <div style={{ fontFamily: D, fontWeight: 700, fontSize: 13, color: '#1a1c5e' }}>{q.q}</div>
                <div style={{ fontFamily: D, fontSize: 13, color: q.r ? '#15803d' : '#cbd5e1' }}>{q.r || 'sem resposta'}</div>
              </div>
            )))}
            {tab === 'banco' && (<>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <SectionTitle style={{ marginBottom: 0 }}>Dados Bancários</SectionTitle>
                <Button variant="primary" size="sm" onClick={() => setIa({ doc: docs.find((d) => d.kind === 'bank'), tipo: 'bank', fase: 'inicio' })}>🤖 Extrair com IA</Button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[['banco', 'Nome do Banco'], ['compe', 'Código COMPE'], ['agencia', 'Agência'], ['conta', 'Conta c/ dígito'], ['pix', 'Chave PIX']].map(([k, l]) => (
                  <div key={k}><span style={lbl}>{l}</span><input value={banco[k]} onChange={(e) => setBanco({ ...banco, [k]: e.target.value })} style={inp}/></div>
                ))}
                <div><span style={lbl}>Tipo de Conta</span><select value={banco.tipo} onChange={(e) => setBanco({ ...banco, tipo: e.target.value })} style={inp}><option>Corrente</option><option>Poupança</option></select></div>
              </div>
              <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <Button variant="primary" size="sm" onClick={salvarBanco}>💾 Salvar dados</Button>
                {bancoSalvo && <span style={{ fontFamily: D, fontSize: 12.5, color: '#15803d', fontWeight: 600 }}>✓ Dados bancários salvos em {bancoSalvo}</span>}
              </div>
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
            {tab === 'log' && <ProcessLog fetcher={logFetcher}/>}
            {tab === 'conv' && (<>
              <div style={{ fontFamily: D, fontSize: 12.5, color: '#64748b', marginBottom: 8 }}>{FICHA.convites.length} convites enviados por clientes/compradores</div>
              {FICHA.convites.map((c) => (
                <div key={c.cliente} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid #f4f5f9', fontFamily: D, fontSize: 13 }}>
                  🏢 <strong style={{ flex: 1, color: '#1a1c5e' }}>{c.cliente}</strong><span style={{ color: '#9B9B9B', fontSize: 12 }}>{fmtBRDT(c.quando)}</span><span style={pill(c.cor, `${c.cor}18`)}>{c.status}</span>
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
            <div style={{ fontFamily: D, fontSize: 11.5, color: '#9B9B9B' }}>{ok}/{pj.length} documentos válidos</div>
          </div>
          <div style={lbl}>Tipo de selo do processo</div>
          <div style={{ border: '1.5px solid #2E3192', borderRadius: 12, padding: '10px 12px', textAlign: 'center', marginBottom: 14 }}>
            <div style={{ fontFamily: M, fontWeight: 800, fontSize: 13.5, color: '#2E3192' }}>🏅 Homologado — Horizonte Mineração</div>
            <div style={{ fontFamily: D, fontSize: 11, color: '#9B9B9B' }}>Selo leva o nome do cliente</div>
          </div>
          <div style={lbl}>Selos deste fornecedor</div>
          <div style={{ border: '1px solid #eef0f6', borderRadius: 10, padding: '8px 10px', marginBottom: 6, fontFamily: D, fontSize: 12.5 }}>⏳ <strong>Horizonte Mineração</strong> <span style={{ color: '#b45309' }}>· Em análise · score {score}</span></div>
          <div style={{ border: '1px solid #eef0f6', borderRadius: 10, padding: '8px 10px', marginBottom: 14, fontFamily: D, fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}>🏅 <strong style={{ flex: 1 }}>ELOS Verificado</strong><span style={{ color: '#15803d' }}>Ativo · score {PRIMATUS.score}</span><Button variant="neutral" size="sm" onClick={() => setToast('ℹ️ Demonstração: abre o certificado do selo ELOS Verificado para impressão.')}>🎓 Certificado</Button></div>
          <div style={lbl}>Motivo de rejeição</div>
          <select style={{ ...inp, marginBottom: 8 }}><option>Selecione ou escreva abaixo...</option>{MOTIVOS.map((m) => <option key={m}>{m}</option>)}</select>
          <textarea rows={2} placeholder="Observações adicionais ou motivo personalizado..." style={{ ...inp, marginBottom: 12, resize: 'vertical' }}/>
          <Button variant="success" full disabled={pendentes > 0} onClick={() => setToast('✅ Homologação aprovada — certificado emitido e fornecedor avisado.')}>{pendentes ? `🚫 ${pendentes} doc(s) impeditivo(s)` : '✅ Homologar — Horizonte Mineração'}</Button>
          <div style={{ height: 8 }}/>
          <Button variant="danger" full onClick={() => setToast('ℹ️ Demonstração: reprova o processo e envia o motivo ao fornecedor por e-mail.')}>❌ Rejeitar</Button>
          <div style={{ height: 8 }}/>
          <Button variant="neutral" full onClick={() => setToast(`✅ Solicitação de ${pendentes} documento(s) enviada ao fornecedor.`)}>📧 Solicitar Documentos ({pendentes})</Button>
          <div style={{ fontFamily: D, fontSize: 11, color: '#9B9B9B', marginTop: 10 }}>Quando o último documento é analisado, o processo fecha sozinho: todos aprovados → homologado; algum reprovado → o fornecedor recebe o motivo por e-mail.</div>
        </Card>
      </div>

      {/* modais */}
      <DocViewer doc={ver} onClose={() => setVer(null)}/>
      <HistoryModal doc={hist} onClose={() => setHist(null)} onView={(v) => { setHist(null); setVer(v) }}/>
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
            <Button variant="success" full onClick={() => { setStatus(aprovar.id, 'VALID', null, aprovar.id === 'd61' ? null : validade); setAprovar(null); setToast(`✅ ${aprovar.label} aprovado.`) }}>✓ Confirmar Aprovação</Button>
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
            <Button variant="primary" full disabled={!motivoRev.trim()} onClick={() => { setStatus(reverter.id, 'PENDING'); setReverter(null); setToast('✅ Decisão revertida — o documento voltou para análise.') }}>↩ Confirmar reversão</Button>
          </div>
        </Modal>
      )}
      {cnae && (
        <CnaeModal cats={cats} onClose={() => setCnae(null)}
          onValidated={(lista) => {
            setCats(lista.map(c => ({ ...c, validada: true, reprovada: !c.cnae })))
            const rej = lista.filter(c => !c.cnae).length
            setCnae(null); setValidade(umAno); setAprovar(cnae)
            if (rej) setToast(`✅ Vínculos salvos — ${rej} categoria${rej > 1 ? 's' : ''} reprovada${rej > 1 ? 's' : ''} no processo (sem CNAE compatível).`)
          }}/>
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
          {ia.tipo === 'bank' && bancoSalvo && <div style={{ fontFamily: D, fontSize: 12.5, color: '#15803d', fontWeight: 600, marginTop: 10 }}>✓ Dados bancários salvos em {bancoSalvo}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <Button variant="neutral" full onClick={() => setIa(null)}>Fechar</Button>
            <Button variant="primary" full onClick={() => { if (ia.tipo === 'bank') salvarBanco(); else setToast('✅ Dados financeiros salvos.') }}>💾 Salvar dados</Button>
            {/* aprovar sempre salva antes (os dados digitados não se perdem) */}
            <Button variant="success" full onClick={() => { const d = ia.doc; if (ia.tipo === 'bank') salvarBanco(); setIa(null); setValidade(umAno); setAprovar(d) }}>✓ Aprovar documento</Button>
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
  const [emitido, setEmitido] = useState(null)   // { cnpj, tipo, empresa } no momento da emissão
  const [, setToast, ToastEl] = useToast()
  const emitir = () => {
    const dig = cnpj.replace(/\D/g, '')
    if (dig.length !== 14) { setToast('⚠ Informe um CNPJ com 14 dígitos.'); return }
    const fmtC = dig.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
    setEmitido({ cnpj: fmtC, tipo, empresa: BC_EMPRESAS[fmtC] || 'Empresa consultada (demonstração)' })
    setFase('coletando')
    setTimeout(() => setFase('pdf'), 1800)
    setTimeout(() => setFase('pronto'), 3000)
  }
  const r = DEMO_BC_RESULTADO
  const [faixaLabel, faixaCor] = FAIXA[r.faixa]
  const totalFontes = DEMO_BC_FONTES.reduce((a, g) => a + g.fontes.length, 0)
  return (
    <div style={wrap}>
      {ToastEl}
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
              <div style={{ fontFamily: M, fontWeight: 800, fontSize: 16, color: '#1a1c5e' }}>{emitido?.empresa} · BC Report {emitido?.tipo}</div>
              <div style={{ fontFamily: D, fontSize: 12, color: '#6b7280' }}>CNPJ {emitido?.cnpj} · emitido em {brD(0)} · <strong style={{ color: faixaCor }}>{faixaLabel}</strong></div>
              {r.achados.map((a) => (
                <div key={a.t} style={{ fontFamily: D, fontSize: 12.5, color: '#374151', marginTop: 5 }}>{a.ok ? '✅' : '⚠️'} {a.t}</div>
              ))}
            </div>
            <Button variant="primary" onClick={() => setToast('ℹ️ Demonstração: no ambiente real baixa o PDF com o índice de evidências anexadas.')}>📄 Baixar PDF</Button>
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

// ── Financeiro (src/pages/backoffice/Metrics.jsx) ───────────────────────────
// Repasse do Stripe: cartão = pagamento + 30 dias corridos (no próximo dia
// útil) · Pix e boleto = pagamento + 2 dias úteis. * = estimativa pelo meio.
const fmtBRL = (v) => (v == null ? '—' : `R$ ${Number(v).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`)
const repasse = (pago, meio) => (!pago ? null : meio === 'Cartão' ? toBusinessDayIso(addDaysIso(pago, 30)) : addBusinessDaysIso(pago, 2))
function addDaysIso(iso, n) { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
const ASSINATURAS = [
  { id: 's1', fornecedor: PRIMATUS.razao, cnpj: PRIMATUS.cnpj, plano: 'ELOS Verificado · Anual', status: 'ACTIVE', pag: 'pago', meio: 'Cartão', valor: 199, ciclo: '/ano', pago: isoD(-281), ini: isoD(-281), fim: isoD(84), nfse: 'nº 1043' },
  { id: 's2', fornecedor: 'Delta Caldeiraria Ltda', cnpj: '46.302.118/0001-74', plano: 'ELOS Verificado · Mensal', status: 'ACTIVE', pag: 'pago', meio: 'Pix', valor: 29, ciclo: '/mês', pago: isoD(-1), ini: isoD(-1), fim: isoD(29), nfse: 'nº 1187' },
  { id: 's3', fornecedor: 'ProServ Facilities S.A.', cnpj: '08.719.553/0001-20', plano: 'ELOS Homologado · Anual', status: 'ACTIVE', pag: 'pago', meio: 'Boleto', valor: 690, ciclo: '/ano', pago: isoD(-3), ini: isoD(-3), fim: isoD(362), nfse: 'nº 1185' },
  { id: 's4', fornecedor: 'Andaimes Rocha ME', cnpj: '37.051.229/0001-08', plano: 'ELOS Verificado · Anual', status: 'PENDING', pag: 'aguardando', meio: 'Boleto', valor: 199, ciclo: '/ano', pago: null, ini: isoD(-2), fim: isoD(363), nfse: null },
  { id: 's5', fornecedor: 'Inova Sistemas Ltda', cnpj: '31.774.052/0001-63', plano: 'ELOS Verificado · Anual', status: 'ACTIVE', pag: 'cupom', meio: null, valor: 199, ciclo: '/ano', pago: null, ini: isoD(-20), fim: isoD(10), nfse: null },
  { id: 's6', fornecedor: `${MERIDIANO.razao} (comprador)`, cnpj: '22.615.380/0001-47', plano: 'ELOS Comprador Pro · Anual', status: 'ACTIVE', pag: 'pago', meio: 'Cartão', valor: 1990, ciclo: '/ano', pago: isoD(-122), ini: isoD(-122), fim: isoD(243), nfse: 'nº 1102' },
].map(a => ({ ...a, repasse: repasse(a.pago, a.meio) }))
// processos subsidiados que ENTRARAM NA ESTEIRA (cobráveis seja qual for o resultado)
const SUBSIDIADOS = [
  { seal_id: 'z1', client_name: HORIZONTE.razao, supplier_name: PRIMATUS.razao, cnpj: PRIMATUS.cnpj, flow_name: 'Suprimentos – Nível 2', queued_at: isoD(-6), resultado: 'Em análise', valor: 590, pago_em: null, referencia: '' },
  { seal_id: 'z2', client_name: HORIZONTE.razao, supplier_name: 'Ômega Engenharia Ltda', cnpj: '41.090.118/0001-30', flow_name: 'Suprimentos – Nível 3', queued_at: isoD(-40), resultado: 'Homologado', valor: 690, pago_em: isoD(-12), referencia: 'NF 2291' },
  { seal_id: 'z3', client_name: HORIZONTE.razao, supplier_name: 'LogFlex Transportes', cnpj: '10.228.551/0001-02', flow_name: 'Suprimentos – Nível 1', queued_at: isoD(-28), resultado: 'Homologado', valor: 450, pago_em: isoD(-12), referencia: 'NF 2291' },
  { seal_id: 'z4', client_name: HORIZONTE.razao, supplier_name: 'Sulbras Serviços Ltda', cnpj: '19.554.203/0001-88', flow_name: 'Suprimentos – Nível 3', queued_at: isoD(-33), resultado: 'Homologado', valor: 690, pago_em: null, referencia: '' },
  { seal_id: 'z5', client_name: HORIZONTE.razao, supplier_name: 'Metalmax Ind. Ltda', cnpj: '12.408.771/0001-09', flow_name: 'Suprimentos – Nível 1', queued_at: isoD(-45), resultado: 'Reprovado', valor: 450, pago_em: null, referencia: '' },
  { seal_id: 'z6', client_name: 'Serra Azul Agroflorestal', supplier_name: 'Delta Caldeiraria Ltda', cnpj: '46.302.118/0001-74', flow_name: 'Agro — Serviços Gerais', queued_at: isoD(-15), resultado: 'Em análise', valor: 520, pago_em: null, referencia: '' },
  { seal_id: 'z7', client_name: 'Serra Azul Agroflorestal', supplier_name: 'BioTech Serviços Ambientais', cnpj: '22.781.604/0001-17', flow_name: 'Agro — Ambiental', queued_at: isoD(-52), resultado: 'Homologado', valor: 520, pago_em: isoD(-20), referencia: 'Boleto 88231' },
]
const TabBtn = ({ active, onClick, children }) => (
  <button onClick={onClick} style={{ padding: '9px 18px', borderRadius: 10, border: `1.5px solid ${active ? '#2E3192' : '#e2e4ef'}`, background: active ? '#2E3192' : '#fff', color: active ? '#fff' : '#64748b', fontFamily: M, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>{children}</button>
)

function SubsidizedTab({ rows, setRows, toast }) {
  const [clientFilter, setClientFilter] = useState('')
  const [pagFilter, setPagFilter] = useState('aberto')
  const [period, setPeriod] = useState({ from: '', to: '' })
  const [sel, setSel] = useState(() => new Set())
  const [baixa, setBaixa] = useState(null)
  const [msg, setMsg] = useState('')
  const clientNames = useMemo(() => [...new Set(rows.map(r => r.client_name))].sort(), [rows])
  const filtered = rows.filter(r => {
    if (clientFilter && r.client_name !== clientFilter) return false
    if (pagFilter === 'aberto' && r.pago_em) return false
    if (pagFilter === 'pago' && !r.pago_em) return false
    if (period.from && r.queued_at < period.from) return false
    if (period.to && r.queued_at > period.to) return false
    return true
  })
  const byClient = {}
  for (const r of filtered) { const g = (byClient[r.client_name] = byClient[r.client_name] || { rows: [], total: 0, aberto: 0 }); g.rows.push(r); g.total += r.valor; if (!r.pago_em) g.aberto += r.valor }
  const grandTotal = filtered.reduce((a, r) => a + r.valor, 0)
  const grandAberto = filtered.filter(r => !r.pago_em).reduce((a, r) => a + r.valor, 0)
  const selecionados = filtered.filter(r => sel.has(r.seal_id))
  const toggle = (id) => setSel(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const inp = { padding: '8px 10px', borderRadius: 10, border: '1px solid #e2e4ef', fontFamily: D, fontSize: 13 }
  const registrar = () => {
    if (!baixa?.paid_on) { setMsg('Informe a data do pagamento.'); return }
    const ids = new Set(selecionados.map(r => r.seal_id))
    setRows(p => p.map(r => (ids.has(r.seal_id) ? { ...r, pago_em: baixa.paid_on, referencia: baixa.reference } : r)))
    setMsg(`Pagamento registrado em ${ids.size} processo(s).`); setBaixa(null); setSel(new Set())
  }
  const desfazer = () => {
    const ids = new Set(selecionados.filter(r => r.pago_em).map(r => r.seal_id))
    setRows(p => p.map(r => (ids.has(r.seal_id) ? { ...r, pago_em: null, referencia: '' } : r)))
    setMsg(`Baixa desfeita em ${ids.size} processo(s).`); setSel(new Set())
  }
  return (
    <Card style={{ borderRadius: 16, padding: '20px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
        <SectionTitle>Homologações subsidiadas — faturar ao cliente</SectionTitle>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={clientFilter} onChange={e => setClientFilter(e.target.value)} style={inp}>
            <option value="">Todos os clientes</option>
            {clientNames.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <select value={pagFilter} onChange={e => { setPagFilter(e.target.value); setSel(new Set()) }} style={inp}>
            <option value="aberto">Em aberto</option><option value="pago">Pagos pelo cliente</option><option value="todos">Todos</option>
          </select>
          <input type="date" value={period.from} onChange={e => setPeriod(p => ({ ...p, from: e.target.value }))} style={inp} title="Entrou na esteira a partir de"/>
          <span style={{ fontFamily: D, fontSize: 12, color: '#9B9B9B' }}>até</span>
          <input type="date" value={period.to} onChange={e => setPeriod(p => ({ ...p, to: e.target.value }))} style={inp} title="Entrou na esteira até"/>
          <Button variant="neutral" size="sm" onClick={() => exportRows(`subsidiados_${(clientFilter || 'todos_clientes').normalize('NFD').replace(/[^a-zA-Z0-9]+/g, '_')}`, clientFilter || 'Subsidiados', filtered.map(r => ({
            'Cliente': r.client_name, 'Fornecedor': r.supplier_name, 'CNPJ': r.cnpj, 'Fluxo': r.flow_name, 'Entrou na esteira': fmtBR(r.queued_at),
            'Resultado': r.resultado, 'Valor': r.valor, 'Pago pelo cliente em': r.pago_em ? fmtBR(r.pago_em) : '', 'Referência do pagamento': r.referencia || '',
          })), toast)}>⬇️ Excel p/ financeiro</Button>
        </div>
      </div>
      <div style={{ fontFamily: D, fontSize: 12, color: '#9B9B9B', marginBottom: 14, lineHeight: 1.5 }}>
        Cobrável do cliente: processo subsidiado que <strong>entrou na esteira</strong> (envio de documentos completo e questionário respondido), seja qual for o resultado da homologação.
        Clientes do ELOS e clientes migrados (só o que entrou na esteira depois da migração). O período filtra pela data de entrada na esteira. Valor = preço subsidiado do fluxo.
      </div>
      {selecionados.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 14px', borderRadius: 12, background: '#eef2ff', border: '1px solid #c7d2fe', marginBottom: 14, fontFamily: D, fontSize: 13 }}>
          <strong>{selecionados.length} selecionado(s) · {fmtBRL(selecionados.reduce((a, r) => a + r.valor, 0))}</strong>
          {baixa ? (<>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>Pago em
              <input type="date" value={baixa.paid_on} onChange={e => setBaixa(b => ({ ...b, paid_on: e.target.value }))} style={inp}/></label>
            <input placeholder="Referência (nota fiscal, boleto, fatura)" value={baixa.reference} onChange={e => setBaixa(b => ({ ...b, reference: e.target.value }))} style={{ ...inp, minWidth: 240 }}/>
            <Button variant="success" size="sm" onClick={registrar}>✓ Registrar pagamento</Button>
            <Button variant="neutral" size="sm" onClick={() => setBaixa(null)}>Cancelar</Button>
          </>) : (<>
            <Button variant="primary" size="sm" onClick={() => setBaixa({ paid_on: isoD(0), reference: '' })}>💰 Dar baixa (cliente pagou)</Button>
            {selecionados.some(r => r.pago_em) && <Button variant="neutral" size="sm" onClick={desfazer}>Desfazer baixa</Button>}
          </>)}
        </div>
      )}
      {msg && <div style={{ fontFamily: D, fontSize: 12.5, color: msg.startsWith('Informe') ? '#dc2626' : '#15803d', marginBottom: 10 }}>{msg}</div>}
      {!filtered.length ? (
        <div style={{ fontFamily: D, fontSize: 13, color: '#9B9B9B', padding: '16px 0' }}>
          Nenhum processo subsidiado {pagFilter === 'aberto' ? 'em aberto ' : pagFilter === 'pago' ? 'pago ' : ''}{period.from || period.to ? 'no período' : ''}.
        </div>
      ) : (<>
        {Object.entries(byClient).map(([client, g]) => (
          <div key={client} style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: M, fontWeight: 800, fontSize: 14, color: '#1a1c5e' }}>🏢 {client} <span style={{ fontWeight: 400, fontSize: 12, color: '#9B9B9B' }}>({g.rows.length})</span></span>
              <span style={{ fontFamily: M, fontWeight: 900, fontSize: 14, color: '#15803d' }}>{fmtBRL(g.total)}{g.aberto > 0 && g.aberto !== g.total ? <span style={{ fontWeight: 600, fontSize: 12, color: '#b45309' }}> · em aberto {fmtBRL(g.aberto)}</span> : ''}</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: D, fontSize: 12.5 }}>
                <thead>
                  <tr style={{ color: '#9B9B9B', fontSize: 11, textAlign: 'left' }}>
                    <th style={{ padding: '4px 10px', width: 28 }}></th><th style={{ padding: '4px 10px' }}>Fornecedor</th><th style={{ padding: '4px 10px' }}>Fluxo</th>
                    <th style={{ padding: '4px 10px' }}>Entrou na esteira</th><th style={{ padding: '4px 10px' }}>Resultado</th>
                    <th style={{ padding: '4px 10px' }}>Pagamento do cliente</th><th style={{ padding: '4px 10px', textAlign: 'right' }}>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map(r => (
                    <tr key={r.seal_id} style={{ borderBottom: '1px solid #f1f2f8', background: sel.has(r.seal_id) ? '#f5f7ff' : 'transparent' }}>
                      <td style={{ padding: '7px 10px' }}><input type="checkbox" checked={sel.has(r.seal_id)} onChange={() => toggle(r.seal_id)} aria-label={`Selecionar ${r.supplier_name}`}/></td>
                      <td style={{ padding: '7px 10px', fontWeight: 600, color: '#1a1c5e' }}>{r.supplier_name}<span style={{ fontWeight: 400, color: '#9B9B9B', marginLeft: 8, fontSize: 11 }}>{r.cnpj}</span></td>
                      <td style={{ padding: '7px 10px' }}>{r.flow_name}</td>
                      <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>{fmtBR(r.queued_at)}</td>
                      <td style={{ padding: '7px 10px' }}>
                        <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 9px', borderRadius: 20, fontFamily: M,
                          color: r.resultado === 'Homologado' ? '#15803d' : r.resultado === 'Reprovado' ? '#b91c1c' : '#92400e',
                          background: r.resultado === 'Homologado' ? '#dcfce7' : r.resultado === 'Reprovado' ? '#fee2e2' : '#fef3c7' }}>{r.resultado}</span>
                      </td>
                      <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>{r.pago_em
                        ? <span style={{ color: '#15803d', fontWeight: 700 }}>✓ Pago em {fmtBR(r.pago_em)}{r.referencia ? <span style={{ fontWeight: 400, color: '#64748b' }}> · {r.referencia}</span> : ''}</span>
                        : <span style={{ color: '#b45309', fontWeight: 700 }}>Em aberto</span>}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>{fmtBRL(r.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
        <div style={{ textAlign: 'right', fontFamily: M, fontWeight: 900, fontSize: 16, color: '#1a1c5e', borderTop: '2px solid #e2e4ef', paddingTop: 12 }}>
          Total: <span style={{ color: '#15803d' }}>{fmtBRL(grandTotal)}</span>
          {grandAberto > 0 && grandAberto !== grandTotal && <span style={{ fontSize: 13, color: '#b45309' }}> · em aberto {fmtBRL(grandAberto)}</span>}
        </div>
      </>)}
    </Card>
  )
}

export function DemoAdminFinanceiro() {
  const [tab, setTab] = useState('geral')
  const [subs, setSubs] = useState(SUBSIDIADOS)
  const [, setToast, ToastEl] = useToast()
  const ativas = ASSINATURAS.filter(a => a.status === 'ACTIVE')
  const pagas = ativas.filter(a => a.pag === 'pago').length
  const abertos = subs.filter(r => !r.pago_em).length
  const soon = isoD(30)
  return (
    <div style={wrap}>
      {ToastEl}
      <PageHeader title="Financeiro" subtitle="Assinaturas Stripe, homologações subsidiadas e visão operacional · valores ilustrativos"/>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <TabBtn active={tab === 'geral'} onClick={() => setTab('geral')}>📊 Visão Geral</TabBtn>
        <TabBtn active={tab === 'assinaturas'} onClick={() => setTab('assinaturas')}>💳 Assinaturas</TabBtn>
        <TabBtn active={tab === 'subsidiados'} onClick={() => setTab('subsidiados')}>🤝 Subsidiados</TabBtn>
      </div>
      {tab === 'geral' && (<>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14, marginBottom: 20 }}>
          <KpiCard label="Assinaturas Stripe" value={312} sub={`${pagas * 50 + 12} pagas · ${(ativas.length - pagas) * 14} cupom/trial`} subColor="#2E3192" icon="💳" iconBg="rgba(46,49,146,.1)"/>
          <KpiCard label="MRR (Stripe)" value="R$ 38,4 mil" sub="Assinaturas ativas" subColor="#22c55e" icon="💰" iconBg="rgba(244,126,47,.12)"/>
          <KpiCard label="Subsidiados cobráveis" value={subs.length} sub={abertos ? `${abertos} em aberto (cliente não pagou)` : 'todos pagos pelo cliente'} subColor="#f59e0b" icon="🤝" iconBg="rgba(245,158,11,.1)"/>
          <KpiCard label="Fornecedores" value="12.480" sub="8.912 homologados" subColor="#9B9B9B" icon="🏭" iconBg="rgba(46,49,146,.1)"/>
        </div>
        <Card style={{ borderRadius: 16, padding: '20px 24px' }}>
          <SectionTitle>Custos da operação — mês atual</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12, marginBottom: 14 }}>
            {[['🕵️ Custos BC', 'R$ 412,30', '43 relatórios · listas restritivas e crédito'],
              ['📥 Captura de documentos', 'R$ 38,60', '214 certidões obtidas nas fontes oficiais'],
              ['🤖 IA', 'R$ 6,90', '118 pré-análises · concordância do analista 91%']].map(([t, v, s]) => (
              <div key={t} style={{ background: '#fafbff', border: '1px solid rgba(46,49,146,.12)', borderRadius: 12, padding: '12px 14px' }}>
                <div style={{ fontFamily: M, fontWeight: 700, fontSize: 11, color: '#9B9B9B', textTransform: 'uppercase', letterSpacing: 0.5 }}>{t} <EmBreve style={{ marginLeft: 4 }}/></div>
                <div style={{ fontFamily: M, fontWeight: 800, fontSize: 20, color: '#1a1c5e' }}>{v}</div>
                <div style={{ fontFamily: D, fontSize: 11.5, color: '#6b7280', marginTop: 2 }}>{s}</div>
              </div>
            ))}
          </div>
          {[['FGTS (CRF)', 62, 'R$ 16,12'], ['CNDT (Justiça do Trabalho)', 58, 'R$ 16,24'], ['CND Federal (PGFN)', 21, 'R$ 6,24'], ['Receita · Cartão CNPJ, Simples · "Lista suja"', 73, 'gratuitas']].map(([f, q, c]) => (
            <div key={f} style={{ display: 'grid', gridTemplateColumns: '1.6fr 110px 110px', gap: 10, padding: '8px 0', borderTop: '1px solid #f4f5f9', fontFamily: D, fontSize: 12.5, color: '#374151' }}>
              <span>{f}</span><span>{q} consultas</span><strong style={{ color: '#1a1c5e' }}>{c}</strong>
            </div>
          ))}
          <div style={{ fontFamily: D, fontSize: 11.5, color: '#9B9B9B', marginTop: 8 }}>
            Fonte paga só cobra quando devolve a certidão; documento válido ou enviado pelo fornecedor não gera consulta. A IA tem teto diário de gasto e só sugere — quem decide é o analista.
          </div>
        </Card>
      </>)}
      {tab === 'assinaturas' && (
        <Card style={{ borderRadius: 16, padding: '20px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <SectionTitle>Assinaturas via Stripe</SectionTitle>
            <Button variant="neutral" size="sm" onClick={() => exportRows('assinaturas_elos', 'Assinaturas', ASSINATURAS.map(a => ({
              'Fornecedor': a.fornecedor, 'CNPJ': a.cnpj, 'Plano': a.plano, 'Status': a.status, 'Pagamento': a.pag === 'pago' ? 'Pago' : a.pag === 'aguardando' ? 'Aguardando pagamento' : 'Cupom/Trial',
              'Meio': a.meio || '', 'Valor': a.valor, 'Pago em': a.pago ? fmtBR(a.pago) : '', 'Repasse Stripe (prev.)': a.repasse ? fmtBR(a.repasse) : '', 'Início': fmtBR(a.ini), 'Fim': fmtBR(a.fim), 'NFSe': a.nfse || '',
            })), setToast)}>⬇️ Excel</Button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: D, fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#9B9B9B', fontFamily: M, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {['Fornecedor', 'Plano', 'Status', 'Pagamento', 'Meio', 'Valor', 'Pago em', 'Repasse Stripe (prev.)', 'Vigência', 'NFSe'].map(h => <th key={h} style={{ padding: '8px 10px', borderBottom: '1px solid #e2e4ef' }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {ASSINATURAS.map(a => (
                  <tr key={a.id} style={{ borderBottom: '1px solid #f1f2f8' }}>
                    <td style={{ padding: 10, fontWeight: 700, color: '#1a1c5e' }}>{a.fornecedor}<div style={{ fontWeight: 400, fontSize: 11, color: '#9B9B9B' }}>{a.cnpj}</div></td>
                    <td style={{ padding: 10 }}>{a.plano}</td>
                    <td style={{ padding: 10 }}><span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, fontFamily: M, color: a.status === 'ACTIVE' ? '#15803d' : '#92400e', background: a.status === 'ACTIVE' ? '#dcfce7' : '#fef3c7' }}>{a.status}</span></td>
                    <td style={{ padding: 10, whiteSpace: 'nowrap' }}>{a.pag === 'pago'
                      ? <span style={{ color: '#15803d', fontWeight: 700 }}>💳 Pago</span>
                      : a.pag === 'aguardando' ? <span style={{ color: '#1d4ed8', fontWeight: 700 }}>⏳ Aguardando pagamento</span>
                      : <span style={{ color: '#92400e', fontWeight: 700 }}>🎟️ Cupom/Trial</span>}</td>
                    <td style={{ padding: 10 }}>{a.meio || '—'}</td>
                    <td style={{ padding: 10, whiteSpace: 'nowrap' }}>{fmtBRL(a.valor)}{a.ciclo}</td>
                    <td style={{ padding: 10, whiteSpace: 'nowrap' }}>{a.pago ? fmtBR(a.pago) : '—'}</td>
                    <td style={{ padding: 10, whiteSpace: 'nowrap' }} title="Estimativa: cartão 30 dias corridos · Pix e boleto 2 dias úteis">{a.repasse ? `${fmtBR(a.repasse)} *` : '—'}</td>
                    <td style={{ padding: 10, whiteSpace: 'nowrap' }}>{fmtBR(a.ini)} → {fmtBR(a.fim)}{a.status === 'ACTIVE' && a.fim < soon && <span title="Renova/vence em até 30 dias" style={{ marginLeft: 6 }}>⏰</span>}</td>
                    <td style={{ padding: 10, fontSize: 12 }}>{a.nfse || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontFamily: D, fontSize: 11.5, color: '#9B9B9B', marginTop: 12 }}>
            Cupom/Trial = assinatura ativa sem fatura Stripe paga. Aguardando pagamento = boleto emitido e ainda não compensado. Os dois passam a "Pago" automaticamente quando o pagamento é confirmado. Repasse: data em que o Stripe libera o valor (cartão 30 dias corridos · Pix e boleto 2 dias úteis; o repasse é diário). * = estimativa pelo meio de pagamento. Cada pagamento gera a nota fiscal de serviço automaticamente.
          </div>
        </Card>
      )}
      {tab === 'subsidiados' && <SubsidizedTab rows={subs} setRows={setSubs} toast={setToast}/>}
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
