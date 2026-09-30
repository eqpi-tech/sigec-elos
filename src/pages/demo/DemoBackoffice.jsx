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
import { Card, Button, KpiCard, PageHeader, SectionTitle, StatusDot, ScoreBar } from '../../components/ui.jsx'
import { DEMO_PROCESSO, DEMO_MOBILIDADE } from './demoData.js'

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

// ── Ficha do processo ───────────────────────────────────────────────────────
export function DemoAdminProcesso() {
  const [aberto, setAberto] = useState({ a: false, b: false })
  const [status, setStatus] = useState(() => Object.fromEntries(DEMO_PROCESSO.docs.map((d) => [d.label, d.status])))
  const cor = { VALID: '#f8fffe', PENDING: '#fff7ed', MISSING: '#fff5f5', REJECTED: '#fff5f5', EXPIRING: '#fffbeb' }
  const quadro = (k, icon, titulo, resumo, linhas) => (
    <div style={{ border: '1px solid rgba(46,49,146,.18)', borderRadius: 12, padding: '12px 14px', marginBottom: 12, background: '#fafbff' }}>
      <div onClick={() => setAberto((a) => ({ ...a, [k]: !a[k] }))} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: M, fontWeight: 800, fontSize: 13, color: '#1a1c5e' }}>{icon} {titulo} <EmBreve style={{ marginLeft: 6 }}/></div>
          <div style={{ fontFamily: D, fontSize: 11.5, color: '#6b7280', marginTop: 2 }}>{resumo}</div>
        </div>
        <span style={{ color: '#9B9B9B' }}>{aberto[k] ? '▲' : '▼'}</span>
      </div>
      {aberto[k] && (
        <div style={{ marginTop: 10 }}>
          {linhas.map(([doc, fonte, res]) => (
            <div key={doc} style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1.4fr', gap: 10, padding: '6px 0', borderTop: '1px solid #eef0f6', fontFamily: D, fontSize: 12, color: '#374151' }}>
              <strong style={{ color: '#1a1c5e' }}>{doc}</strong><span>{fonte}</span><span>{res}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
  return (
    <div style={wrap}>
      <PageHeader title="Primatus Serviços Técnicos Ltda" subtitle="34.218.904/0001-72 · Processo Horizonte — Suprimentos · Em análise"/>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16, alignItems: 'start' }}>
        <Card style={{ borderRadius: 16, padding: '20px 24px' }}>
          <SectionTitle>Documentos para Validação</SectionTitle>
          {quadro('a', '⚙️', 'Coleta automática nas fontes oficiais (Rota A)', '7 obtidos · 2 com o fornecedor · custo R$ 2,08 · 28/09 15:12 → 15:34', [
            ['CND Federal', 'Receita/PGFN', '✓ sugere aprovar — negativa'], ['CRF FGTS', 'Caixa', '✓ sugere aprovar — regular'],
            ['CNDT', 'TST', '✓ sugere aprovar — negativa'], ['Cartão CNPJ', 'Receita Federal (base pública, grátis)', '✓ ATIVA'],
            ['Lista Suja', 'MTE (grátis)', '✓ nada consta'], ['CND Municipal', 'Prefeitura', '📤 com o fornecedor — prefeitura exige inscrição municipal'],
          ])}
          {quadro('b', '🤖', 'Pré-análise por IA dos documentos enviados (Rota B)', '2 analisados (1 aprovar · 1 reprovar) · analista concordou em 2/2 · custo R$ 0,12', [
            ['Alvará de Funcionamento', 'Regra do cliente + checklist', '✕ reprovar — vencido em 04/09/2026 (pág. 1)'],
            ['Licença de Operação', 'Regra do cliente + checklist', '✓ aprovar — 5/5 itens atendidos'],
          ])}
          {DEMO_PROCESSO.docs.map((d) => {
            const st = status[d.label]
            const decidido = ['VALID', 'REJECTED'].includes(st)
            return (
              <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderRadius: 12, marginBottom: 8, background: cor[st] || '#f4f5f9', border: '1px solid #eef0f6' }}>
                <StatusDot status={st}/>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: M, fontWeight: 700, fontSize: 13, color: '#1a1c5e' }}>{d.label}</div>
                  <div style={{ fontFamily: D, fontSize: 11, color: '#9B9B9B' }}>{d.source === 'AUTO' ? '⚡ Auto-coletado' : 'Upload manual'}</div>
                </div>
                <Button variant="neutral" size="sm">👁 Ver</Button>
                <Button variant="neutral" size="sm" title="Histórico do documento">🕓</Button>
                {['PENDING', 'EXPIRING'].includes(st) && <>
                  <Button variant="success" size="sm" onClick={() => setStatus((s) => ({ ...s, [d.label]: 'VALID' }))}>✓ Aprovar</Button>
                  <Button variant="danger" size="sm" onClick={() => setStatus((s) => ({ ...s, [d.label]: 'REJECTED' }))}>✕ Rejeitar</Button>
                </>}
                {decidido && <Button variant="neutral" size="sm" title="Desfaz a decisão e devolve o documento para análise" onClick={() => setStatus((s) => ({ ...s, [d.label]: 'PENDING' }))}>↩ Reverter decisão</Button>}
              </div>
            )
          })}
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1.5px dashed #c7c9e2' }}>
            <SectionTitle>👷 Documentos de Mobilidade</SectionTitle>
            {DEMO_MOBILIDADE.map((p) => (
              <div key={p.posto} style={{ border: '1px solid #eef0f6', borderRadius: 12, padding: '10px 14px' }}>
                <div style={{ fontFamily: M, fontWeight: 700, fontSize: 13, color: '#1a1c5e' }}>📍 {p.posto}</div>
                {p.pessoas.map((pe) => (
                  <div key={pe.nome} style={{ fontFamily: D, fontSize: 12, color: '#374151', marginTop: 6 }}>
                    👤 {pe.nome}: {pe.docs.map((x) => `${x.label} ${x.status === 'VALID' ? '✓' : x.status === 'PENDING' ? '⏳' : '⚠'}`).join(' · ')}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Card>
        <Card style={{ borderRadius: 16, padding: '20px 20px' }}>
          <div style={{ fontFamily: M, fontWeight: 800, fontSize: 15, color: '#1a1c5e', marginBottom: 12 }}>Decisão de Homologação</div>
          <ScoreBar score={DEMO_PROCESSO.score}/>
          <div style={{ fontFamily: D, fontSize: 12, color: '#6b7280', margin: '12px 0' }}>
            Quando o último documento é analisado, o processo fecha sozinho: todos aprovados → homologado (certificado emitido e e-mail ao fornecedor); algum reprovado → o fornecedor recebe o motivo e corrige.
          </div>
          <Button variant="neutral" full size="sm">📜 Carta de exceção do cliente</Button>
          <div style={{ height: 8 }}/>
          <Button variant="neutral" full size="sm">🕓 Log do processo</Button>
        </Card>
      </div>
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
