// Demo · base das fichas do processo: dados fictícios de UM processo completo
// (Primatus × Horizonte — Suprimentos, EM ANÁLISE), no mesmo formato das telas
// reais, e as peças comuns: abas, leitor de documento, histórico do documento
// (versões), aviso (toast), confirmação na própria tela e exportação Excel.
// Usado pelas fichas do fornecedor, do cliente, do comprador e do backoffice,
// para as quatro contarem a mesma história. Todas as datas são relativas a hoje.
import { useEffect, useState } from 'react'
import { Button, StatusDot } from '../../components/ui.jsx'
import { DOC_STATUS } from '../../components/ProcessDocuments.jsx'
import { exportXlsx } from '../../lib/exportXlsx.js'
import { PRIMATUS, HORIZONTE, isoD, isoDT, fmtBR, fmtBRDT, DEMO_QUESTIONNAIRES, DEMO_SUPPLIER_ANSWERS, respostaTexto } from './demoData.js'

export const M = 'Montserrat,sans-serif'
export const D = 'DM Sans,sans-serif'
export const pill = (color, bg) => ({ fontSize: 10, fontWeight: 700, color, background: bg, padding: '2px 8px', borderRadius: 20, fontFamily: M, whiteSpace: 'nowrap' })
export const fmt = fmtBR
export { DOC_STATUS }

// mesma regra das telas reais: VALID que vence em até 30 dias = "Vence em
// breve"; vencido no passado = "Vencido"
export function effStatus(d) {
  const st = d?.status || 'MISSING'
  if (st === 'VALID' && d.expires) {
    const dias = (new Date(`${d.expires}T23:59:59`) - new Date()) / 86400000
    if (dias < 0) return 'EXPIRED'
    if (dias <= 30) return 'EXPIRING'
  }
  return st
}
const addIso = (iso, n) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
// nome de pessoa mascarado como no banco (mask_person_name): "João P. S."
export const maskName = (n) => { const w = String(n || '').trim().split(/\s+/); return [w[0], ...w.slice(1).filter(x => x.length > 2).map(x => `${x[0].toUpperCase()}.`)].join(' ') }

// ── o processo de demonstração ─────────────────────────────────────────────
// source: AUTO (coletado automaticamente) | MANUAL (enviado pelo fornecedor)
// kind: instant (Cartão CNPJ, Simples, CNAEs) | assertiva | emitir (link da fonte) | bank | dre
// soEqpi: documento que a EQPI obtém (Inscrição Estadual) — o fornecedor não envia
const P = PRIMATUS
export const FICHA = {
  razao: P.razao, fantasia: P.fantasia, cnpj: P.cnpj,
  cidade: P.endereco.cidade, uf: P.endereco.uf, email: 'lucas@primatus.com.br', matriz: 'Matriz',
  cliente: HORIZONTE.razao, clienteCnpj: HORIZONTE.cnpj, processo: 'Horizonte — Suprimentos', nivel: 'Suprimentos – Nível 2',
  score: P.scoreProcesso, scoreGeral: P.score,
  convite: { tipo: 'Serviço', subsidiado: true, contato: 'Rafael Costa · (31) 3290-4400', escopo: 'Manutenção preventiva de correias transportadoras — unidade Itabira/MG', em: isoD(-51), por: 'rafael@horizonte.com.br' },
  naFilaDesde: isoD(-6),
  cnpjData: { situacao: 'ATIVA', desde: P.abertura, abertura: P.abertura, porte: 'Demais', capital: 'R$ 850.000,00', natureza: '206-2 — Sociedade Empresária Limitada', municipio: 'São Paulo / SP', consultado: fmtBRDT(isoDT(-50, '10:14')) },
  endereco: { logradouro: P.endereco.logradouro, bairro: P.endereco.bairro, cidade: `${P.endereco.cidade} / ${P.endereco.uf}`, cep: P.endereco.cep },
  contato: { telefone: P.telefone, telefone2: P.telefone2, email: P.email },
  regime: { simples: true, desde: '01/01/2013' },
  cnaePrincipal: { codigo: '3314-7/10', desc: 'Manutenção e reparação de máquinas e equipamentos para uso geral' },
  cnaesSec: [
    { codigo: '3321-0/00', desc: 'Instalação de máquinas e equipamentos industriais' },
    { codigo: '4321-5/00', desc: 'Instalação e manutenção elétrica' },
    { codigo: '3313-9/99', desc: 'Manutenção e reparação de máquinas, aparelhos e materiais elétricos' },
  ],
  qsa: P.socios,
  categorias: P.categorias,
  servicos: ['Manutenção de correias', 'Montagem mecânica', 'Painéis elétricos', 'Soldagem'],
  capacidade: { faturamento: 'R$ 4,8 a 10 milhões/ano', funcionarios: '50 a 99', plano: 'ELOS Verificado' },
  docs: [
    { id: 'd37',  label: 'Cartão de Inscrição no CNPJ', status: 'VALID', source: 'AUTO', kind: 'instant', expires: null, sent: isoD(-50) },
    { id: 'd62',  label: 'Comprovante de Deferimento do Simples Nacional', status: 'VALID', source: 'AUTO', kind: 'instant', expires: null, sent: isoD(-50) },
    { id: 'd61',  label: 'Análise CNAEs', status: 'VALID', source: 'AUTO', kind: 'instant', expires: null, sent: isoD(-50), meta: '3 de 4 categorias vinculadas · Caldeiraria reprovada (sem CNAE)' },
    { id: 'd578', label: 'Relatório Assertiva 360 — Análise Restritiva PJ', status: 'VALID', source: 'AUTO', kind: 'assertiva', expires: isoD(131), sent: isoD(-50), meta: 'Prot. 88412 · Classe B · 742 pts' },
    { id: 'd42',  label: 'CND Tributos Federais e Dívida Ativa da União', status: 'VALID', source: 'MANUAL', kind: 'emitir', expires: isoD(158), sent: isoD(-49) },
    { id: 'd7',   label: 'Certidão de Regularidade do FGTS (CRF)', status: 'VALID', source: 'MANUAL', kind: 'emitir', expires: isoD(27), sent: isoD(-3), meta: `Cert. nº ${isoD(-3).replace(/-/g, '')}11423871 · ${fmtBR(isoD(-3))} a ${fmtBR(isoD(27))}` },
    { id: 'd8',   label: 'CNDT Certidão Negativa de Débitos Trabalhistas', status: 'PENDING', source: 'MANUAL', kind: 'emitir', expires: isoD(178), sent: isoD(-2) },
    { id: 'd6',   label: 'CND Tributos Municipais', status: 'VALID', source: 'MANUAL', expires: isoD(9), sent: isoD(-171) },
    { id: 'd15',  label: 'Inscrição Estadual', status: 'MISSING', source: 'MANUAL', soEqpi: true, responsibility: 'eqpi', expires: null, sent: null },
    { id: 'd16',  label: 'Inscrição Municipal', status: 'VALID', source: 'MANUAL', isento: true, expires: null, sent: isoD(-49), meta: `Inscrição ${P.im}` },
    { id: 'd40',  label: 'Alvará de Funcionamento', status: 'REJECTED', source: 'MANUAL', expires: null, sent: isoD(-20), note: 'Documento vencido — envie o alvará do exercício atual' },
    { id: 'd39',  label: 'Contrato Social (último consolidado)', status: 'VALID', source: 'MANUAL', expires: isoD(320), sent: isoD(-345), reused: true },
    { id: 'd10',  label: 'Comprovante de Conta Bancária', status: 'PENDING', source: 'MANUAL', kind: 'bank', expires: null, sent: isoD(-6) },
    { id: 'd11',  label: 'DRE — Demonstração do Resultado do Exercício 2025', status: 'PENDING', source: 'MANUAL', kind: 'dre', expires: null, sent: isoD(-6) },
    { id: 'd31',  label: 'Apólice de Seguro de Responsabilidade Civil', status: 'PENDING', source: 'MANUAL', expires: isoD(230), sent: isoD(-6) },
  ],
  // documento que o CLIENTE anexa (não o fornecedor)
  docCliente: { id: 'd900', label: 'Laudo técnico de visita (engenharia Horizonte)', status: 'MISSING', responsibility: 'cliente', source: 'MANUAL', expires: null, sent: null },
  mobilizacao: {
    posto: 'PORTARIA', cidade: 'Itabira', uf: 'MG', armado: false, funcao: 'Porteiro', postos: 2, pessoas: 2,
    docsPosto: [
      { id: 'm1', label: 'PGR do posto', status: 'VALID', expires: isoD(200), sent: isoD(-30) },
      { id: 'm2', label: 'PCMSO do posto', status: 'PENDING', expires: null, sent: isoD(-6) },
    ],
    colaboradores: [
      { id: 'pe1', nome: 'João Pereira Silva', cpf: '***.221.908-**', docs: [
        { id: 'm3', label: 'ASO', status: 'VALID', expires: isoD(100), sent: isoD(-30) },
        { id: 'm4', label: 'Certificado de reciclagem', status: 'PENDING', expires: null, sent: isoD(-6) } ] },
      { id: 'pe2', nome: 'Carla Mendes Souza', cpf: '***.874.110-**', docs: [
        { id: 'm5', label: 'ASO', status: 'VALID', expires: isoD(81), sent: isoD(-30) },
        { id: 'm6', label: 'Certificado de reciclagem', status: 'VALID', expires: isoD(-4), sent: isoD(-369) } ] },
    ],
  },
  convites: [
    { cliente: HORIZONTE.razao, quando: isoDT(-51, '09:12'), status: 'Cadastrado', cor: '#15803d' },
    { cliente: 'Serra Azul Agroflorestal', quando: isoDT(-27, '15:40'), status: 'Visualizado', cor: '#2563eb' },
  ],
  banco: { banco: 'Banco do Brasil', compe: '001', agencia: '3321-4', conta: '48210-7', pix: P.cnpj, tipo: 'Corrente' },
  dre: [{ ano: 2025, receita: 'R$ 6.420.000', ativo: 'R$ 3.910.000', passivo: 'R$ 1.870.000', lucro: 'R$ 612.000', ebitda: 'R$ 905.000', estoque: 'R$ 214.000' }],
}

// respostas dos questionários da Horizonte, agrupadas (cliente e backoffice)
FICHA.questionario = DEMO_QUESTIONNAIRES.filter(q => q.active).map(q => ({
  titulo: q.title,
  itens: q.questions.map(qq => ({ q: qq.text, r: respostaTexto(DEMO_SUPPLIER_ANSWERS[qq.id]) })),
}))

// Log do processo no formato do audit_log (mesmo componente ProcessLog das telas reais)
export const LOG_ROWS = [
  { action: 'DOCUMENT_DECISION_REVERTED', created_at: isoDT(-1, '11:02'), metadata: { label: 'CNDT Certidão Negativa de Débitos Trabalhistas — reprovado por engano, era o documento correto', autor: 'Ana Ribeiro (EQPI)' } },
  { action: 'DOCUMENT_REPLACED',          created_at: isoDT(-2, '09:40'), metadata: { label: 'CNDT Certidão Negativa de Débitos Trabalhistas — nova versão (Versão 2)', autor: 'Lucas Andrade' } },
  { action: 'ANALYSIS_STARTED',           created_at: isoDT(-5, '08:50'), metadata: { razao_social: P.razao, autor: 'sistema' } },
  { action: 'AUTO_COLLECT_DONE',          created_at: isoDT(-6, '17:20'), metadata: { label: '7 documentos obtidos nas fontes oficiais · 2 com o fornecedor', autor: 'sistema' } },
  { action: 'DOCUMENT_EXPIRY_CHANGED',    created_at: isoDT(-18, '16:31'), metadata: { label: `CND Tributos Municipais → validade ${fmtBR(isoD(9))}`, autor: 'Ana Ribeiro (EQPI)' } },
  { action: 'SUPPLIER_PROFILE_UPDATED',   created_at: isoDT(-20, '10:05'), metadata: { label: 'Telefone e e-mail financeiro', autor: 'Lucas Andrade' } },
  { action: 'DOC_PENDING_REMINDER',       created_at: isoDT(-30, '08:00'), metadata: { label: '3 documentos pendentes', autor: 'sistema' } },
  { action: 'SUPPLIER_PARTNER_UPDATED',   created_at: isoDT(-44, '14:22'), metadata: { label: 'Maria Ferreira — participação 40%', autor: 'Lucas Andrade' } },
]
const LOG_TEXT = { DOCUMENT_DECISION_REVERTED: 'decisão revertida', DOCUMENT_REPLACED: 'documento substituído', ANALYSIS_STARTED: 'análise iniciada', AUTO_COLLECT_DONE: 'coleta automática', DOCUMENT_EXPIRY_CHANGED: 'vencimento alterado', SUPPLIER_PROFILE_UPDATED: 'dados cadastrais', DOC_PENDING_REMINDER: 'lembrete pendências', SUPPLIER_PARTNER_UPDATED: 'sócio alterado' }
// "fetcher" do ProcessLog: filtra os eventos fictícios por período e descrição
export const logFetcher = ({ dateFrom, dateTo, description }) => {
  const q = (description || '').toLowerCase()
  return Promise.resolve(LOG_ROWS.filter(r => {
    const d = r.created_at.slice(0, 10)
    if (dateFrom && d < dateFrom) return false
    if (dateTo && d > dateTo) return false
    if (q && !`${LOG_TEXT[r.action] || ''} ${r.metadata.label || ''} ${r.metadata.razao_social || ''}`.toLowerCase().includes(q)) return false
    return true
  }))
}

// ── dados no formato da RPC process_documents (componente ProcessDocuments) ─
const asItem = (d) => ({
  key: d.id, name: d.label, status: d.status, responsibility: d.responsibility || null, auto_collect: d.source === 'AUTO',
  document: d.sent ? { type: d.id, submitted_at: d.sent, expires_at: d.expires || null, review_note: d.note || null, storage_path: 'demo', source: d.source || 'MANUAL' } : null,
})
const OK = ['VALID', 'EXPIRING', 'NOT_APPLICABLE']
// viewer CLIENT recebe nome das pessoas mascarado (como o banco entrega)
export function processData({ docs = FICHA.docs, mob = FICHA.mobilizacao, viewer = 'SUPPLIER', clienteDoc = FICHA.docCliente } = {}) {
  const masked = viewer === 'CLIENT'
  const pjDocs = [...docs, ...(clienteDoc ? [clienteDoc] : [])]
  const posts = [{
    post_id: 'p1', category: mob.posto, city: mob.cidade, uf: mob.uf, armado: mob.armado, funcao: mob.funcao,
    qty_people: mob.pessoas, people_count: mob.colaboradores.length,
    post_docs: mob.docsPosto.map(asItem),
    people: mob.colaboradores.map(p => ({ person_id: p.id, name: masked ? maskName(p.nome) : p.nome, cpf: p.cpf, docs: p.docs.map(asItem) })),
  }]
  const slots = [...pjDocs, ...mob.docsPosto, ...mob.colaboradores.flatMap(p => p.docs)]
  const st = slots.map(effStatus)
  const n = (s) => st.filter(x => x === s).length
  const shortfall = Math.max(0, mob.pessoas - mob.colaboradores.length)
  const supplierTodo = slots.filter(s => s.responsibility !== 'cliente' && !s.soEqpi && ['MISSING', 'REJECTED', 'EXPIRED'].includes(effStatus(s))).length
  const clientTodo = pjDocs.filter(s => s.responsibility === 'cliente' && effStatus(s) === 'MISSING').length
  const valid = st.filter(x => OK.includes(x)).length
  return {
    masked,
    pj: pjDocs.map(asItem),
    mobility: posts,
    totals: { required: slots.length, valid, in_review: n('PENDING'), missing: n('MISSING'), rejected: n('REJECTED'), expired: n('EXPIRED'),
      people_shortfall: shortfall, supplier_todo: supplierTodo, client_todo: clientTodo, complete: valid === slots.length && !shortfall },
  }
}
// localiza o documento (PJ ou mobilização) pelo id
export function findDoc(id, docs = FICHA.docs, mob = FICHA.mobilizacao) {
  return [...docs, FICHA.docCliente, ...mob.docsPosto, ...mob.colaboradores.flatMap(p => p.docs)].find(d => d && d.id === id)
}

// histórico do documento — cada envio é uma VERSÃO (como na tela real)
export function historyOf(d) {
  if (!d?.sent) return []
  const t = (iso, hm) => `${iso}T${hm}:00`
  if (d.id === 'd40') return [
    { ev: 'REJECTED', em: t(addIso(d.sent, 2), '16:40'), note: d.note },
    { ev: 'UPLOADED', em: t(d.sent, '14:05'), versao: 2 },
    { ev: 'REJECTED', em: t(addIso(d.sent, -22), '11:10'), note: 'Documento ilegível ou com baixa qualidade' },
    { ev: 'UPLOADED', em: t(addIso(d.sent, -24), '09:12'), versao: 1 },
    { ev: 'CREATED',  em: isoDT(-50, '10:14') },
  ]
  if (d.id === 'd8') return [
    { ev: 'UPDATED',  em: isoDT(-1, '11:02'), validade: d.expires, note: 'Decisão revertida — o documento volta para análise' },
    { ev: 'REJECTED', em: isoDT(-1, '09:30'), validade: d.expires, note: 'Documento vencido (reprovado por engano)' },
    { ev: 'UPLOADED', em: t(d.sent, '09:40'), versao: 2, validade: d.expires },
    { ev: 'APPROVED', em: isoDT(-176, '10:20'), validade: isoD(4), note: 'Documento válido e dentro do prazo' },
    { ev: 'UPLOADED', em: isoDT(-178, '15:02'), versao: 1, validade: isoD(4) },
    { ev: 'CREATED',  em: isoDT(-281, '09:00') },
  ]
  const out = []
  if (d.status === 'VALID') out.push({ ev: 'APPROVED', em: t(addIso(d.sent, d.source === 'AUTO' ? 0 : 2), '09:18'), validade: d.expires, note: d.source === 'AUTO' ? 'Coletado na fonte oficial e conferido pela EQPI' : 'Documento válido e dentro do prazo' })
  if (d.status === 'REJECTED') out.push({ ev: 'REJECTED', em: t(addIso(d.sent, 2), '16:00'), note: d.note })
  out.push({ ev: 'UPLOADED', em: t(d.sent, '17:22'), versao: d.reused ? 2 : 1, validade: d.expires })
  if (d.reused) out.push({ ev: 'EXPIRED', em: t(addIso(d.sent, -3), '00:00') }, { ev: 'UPLOADED', em: t(addIso(d.sent, -368), '10:40'), versao: 1, validade: addIso(d.sent, -3) })
  out.push({ ev: 'CREATED', em: t(addIso(d.sent, d.reused ? -370 : -1), '10:14') })
  return out
}

// ── peças comuns ───────────────────────────────────────────────────────────
export function Tabs({ tabs, value, onChange, pills = false }) {
  return (
    <div style={{ display: 'flex', gap: pills ? 8 : 0, borderBottom: pills ? 'none' : '1.5px solid #eef0f6', marginBottom: 16, flexWrap: 'wrap' }}>
      {tabs.map(([k, l]) => {
        const on = value === k
        return pills ? (
          <button key={k} onClick={() => onChange(k)} style={{ padding: '7px 14px', borderRadius: 20, cursor: 'pointer', fontFamily: M, fontWeight: 700, fontSize: 12, border: `1.5px solid ${on ? '#2E3192' : '#e2e4ef'}`, background: on ? 'rgba(46,49,146,.08)' : '#fff', color: on ? '#2E3192' : '#64748b' }}>{l}</button>
        ) : (
          <button key={k} onClick={() => onChange(k)} style={{ padding: '10px 18px', background: 'none', border: 'none', borderBottom: `2.5px solid ${on ? '#2E3192' : 'transparent'}`, marginBottom: -1.5, cursor: 'pointer', fontFamily: M, fontWeight: on ? 800 : 600, fontSize: 13, color: on ? '#2E3192' : '#9B9B9B' }}>{l}</button>
        )
      })}
    </div>
  )
}

// aviso no canto da tela (nada de alert/confirm — não aparecem em alguns visualizadores)
export function Toast({ msg, onDone }) {
  useEffect(() => {
    if (!msg) return undefined
    const t = setTimeout(onDone, 3000)
    return () => clearTimeout(t)
  }, [msg])   // eslint-disable-line react-hooks/exhaustive-deps
  if (!msg) return null
  const ok = msg.startsWith('✅') || msg.startsWith('✓')
  const info = msg.startsWith('ℹ')
  return (
    <div style={{ position: 'fixed', top: 76, right: 24, zIndex: 1300, maxWidth: 420, background: ok ? '#15803d' : info ? '#1e3a8a' : msg.startsWith('⚠') || msg.startsWith('✕') ? '#b91c1c' : '#1a1c5e', color: '#fff', borderRadius: 12, padding: '12px 18px', fontFamily: D, fontSize: 13.5, lineHeight: 1.45, boxShadow: '0 10px 30px rgba(0,0,0,.2)' }}>{msg}</div>
  )
}
// hook curto: const [toast, show, ToastEl] = useToast()
export function useToast() {
  const [msg, setMsg] = useState('')
  return [msg, setMsg, <Toast key="toast" msg={msg} onDone={() => setMsg('')}/>]
}
export const SO_REAL = 'ℹ️ Demonstração: esta ação funciona no ambiente real.'

// confirmação na própria tela (substitui window.confirm)
export function InlineConfirm({ msg, confirmLabel = 'Confirmar', variant = 'primary', onConfirm, onCancel }) {
  return (
    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 12px', margin: '8px 0', fontFamily: D, fontSize: 12.5, color: '#78350f', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <span style={{ flex: 1, minWidth: 200, lineHeight: 1.45 }}>{msg}</span>
      <Button variant="neutral" size="sm" onClick={onCancel}>Cancelar</Button>
      <Button variant={variant} size="sm" onClick={onConfirm}>{confirmLabel}</Button>
    </div>
  )
}

// exporta as linhas JÁ FILTRADAS para .xlsx real (mesmo helper da produção);
// se o navegador bloquear o download, só avisa
export function exportRows(fileBase, sheetName, rows, toast) {
  try {
    exportXlsx(fileBase, sheetName, rows)
    toast?.(`✅ Excel gerado com ${rows.length} linha${rows.length !== 1 ? 's' : ''} (dados fictícios).`)
  } catch { toast?.('ℹ️ O download foi bloqueado neste navegador — no ambiente real a planilha é baixada normalmente.') }
}
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true } catch { return false }
}

function Modal({ children, onClose, max = 520 }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 24, maxWidth: max, width: '100%', maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 24px 60px rgba(0,0,0,.3)' }}>{children}</div>
    </div>
  )
}
export { Modal }

// "👁 Ver" — leitura do documento (fornecedor, cliente e backoffice abrem o
// arquivo; o comprador vê só a situação). Página fictícia no lugar do PDF.
export function DocViewer({ doc, onClose }) {
  const [nota, setNota] = useState('')
  if (!doc) return null
  const auto = doc.source === 'AUTO'
  return (
    <Modal onClose={onClose} max={720}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8 }}>
        <div>
          <div style={{ fontFamily: M, fontWeight: 800, fontSize: 15, color: '#1a1c5e' }}>📄 {doc.label}</div>
          <div style={{ fontFamily: D, fontSize: 11.5, color: '#9B9B9B' }}>
            {doc.versao ? `Versão ${doc.versao} · ` : ''}{auto ? '⚡ Coletado automaticamente na fonte oficial' : `Enviado em ${fmt(doc.sent)}`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <Button variant="neutral" size="sm" onClick={() => setNota('Na demonstração o arquivo abre aqui mesmo — no ambiente real, em nova aba.')}>↗ Abrir em nova aba</Button>
          <Button variant="neutral" size="sm" onClick={onClose}>✕</Button>
        </div>
      </div>
      {nota && <div style={{ fontFamily: D, fontSize: 12, color: '#1e40af', background: '#eff6ff', borderRadius: 8, padding: '6px 10px', marginBottom: 10 }}>ℹ️ {nota}</div>}
      <div style={{ background: '#e8eaf0', borderRadius: 10, padding: 18 }}>
        <div style={{ position: 'relative', background: '#fff', borderRadius: 4, padding: '34px 40px', minHeight: 380, boxShadow: '0 2px 10px rgba(0,0,0,.08)', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: '38%', left: 0, right: 0, textAlign: 'center', fontFamily: M, fontWeight: 900, fontSize: 64, color: 'rgba(46,49,146,.06)', transform: 'rotate(-18deg)' }}>DEMONSTRAÇÃO</div>
          <div style={{ textAlign: 'center', fontFamily: M, fontWeight: 800, fontSize: 11, letterSpacing: 1.5, color: '#475569' }}>{auto ? 'REPÚBLICA FEDERATIVA DO BRASIL' : 'DOCUMENTO ENVIADO PELO FORNECEDOR'}</div>
          <div style={{ textAlign: 'center', fontFamily: M, fontWeight: 800, fontSize: 16, color: '#1a1c5e', margin: '10px 0 22px' }}>{doc.label.toUpperCase()}</div>
          {[['Razão social', FICHA.razao], ['CNPJ', FICHA.cnpj], ['Endereço', `${FICHA.endereco.logradouro} · ${FICHA.endereco.cidade}`],
            ['Emissão', fmt(doc.sent)], ['Validade', doc.expires ? fmt(doc.expires) : 'não se aplica'], ['Código de controle', 'A7F3.91C2.0B44.E812']].map(([k, v]) => (
            <div key={k} style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 10, padding: '6px 0', borderBottom: '1px dashed #e2e8f0', fontFamily: D, fontSize: 12.5 }}>
              <span style={{ color: '#64748b' }}>{k}</span><strong style={{ color: '#1a1c5e' }}>{v}</strong>
            </div>
          ))}
          <div style={{ fontFamily: D, fontSize: 11.5, color: '#475569', marginTop: 18, lineHeight: 1.6 }}>
            Certifica-se, para os devidos fins, que o contribuinte acima identificado encontra-se em situação regular perante o órgão emissor na data desta emissão. Arquivo fictício, gerado para demonstração do SIGEC-ELOS.
          </div>
        </div>
      </div>
    </Modal>
  )
}

// "🕓" — histórico do documento: cada envio é uma versão com o arquivo guardado
const EV_LABEL = { CREATED: 'Registrado', UPLOADED: 'Novo arquivo', APPROVED: 'Aprovado', REJECTED: 'Rejeitado', REVOKED: 'Revogado', EXPIRED: 'Vencido', UPDATED: 'Atualizado' }
const EV_COLOR = { CREATED: '#64748b', UPLOADED: '#2E3192', APPROVED: '#22c55e', REJECTED: '#ef4444', REVOKED: '#f59e0b', EXPIRED: '#ef4444', UPDATED: '#64748b' }
export function HistoryModal({ doc, onClose, onView }) {
  if (!doc) return null
  const itens = doc.history || historyOf(doc)
  return (
    <Modal onClose={onClose} max={560}>
      <div style={{ fontFamily: M, fontWeight: 800, fontSize: 16, color: '#1a1c5e', marginBottom: 2 }}>🕓 Histórico do Documento</div>
      <div style={{ fontFamily: D, fontSize: 12, color: '#9B9B9B', marginBottom: 16 }}>{doc.label}</div>
      {itens.length === 0 ? (
        <div style={{ fontFamily: D, fontSize: 13, color: '#9B9B9B', padding: '16px 0' }}>Sem eventos registrados para este documento.</div>
      ) : itens.map((h, i) => (
        <div key={i} style={{ borderLeft: `3px solid ${EV_COLOR[h.ev] || '#64748b'}`, background: '#f8f9fd', borderRadius: '0 8px 8px 0', padding: '8px 12px', marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: EV_COLOR[h.ev] || '#64748b', fontFamily: M }}>{EV_LABEL[h.ev] || h.ev}</span>
            {h.versao && <span style={{ fontSize: 10, fontWeight: 700, color: '#2E3192', background: '#eef0ff', padding: '1px 7px', borderRadius: 20, fontFamily: M }}>Versão {h.versao}</span>}
            <span style={{ flex: 1 }}/>
            <span style={{ fontSize: 11, color: '#9B9B9B', fontFamily: D }}>{fmtBRDT(h.em)}</span>
            {h.versao && onView && (
              <button onClick={() => onView({ ...doc, versao: h.versao, sent: h.em.slice(0, 10), expires: h.validade || doc.expires })}
                style={{ border: '1px solid #c7c9e2', background: '#fff', color: '#2E3192', borderRadius: 8, padding: '2px 9px', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: D }}>👁 Ver arquivo</button>
            )}
          </div>
          <div style={{ fontSize: 11.5, color: '#64748b', fontFamily: D, marginTop: 2 }}>
            {h.validade ? `Validade: ${fmt(h.validade)}` : 'Sem validade definida'}{h.note ? ` · ${h.note}` : ''}
          </div>
        </div>
      ))}
      <div style={{ marginTop: 10 }}><Button variant="neutral" full onClick={onClose}>Fechar</Button></div>
    </Modal>
  )
}

export function Field({ label, value, strong }) {
  return (
    <div style={{ background: '#fafbff', border: '1px solid #eef0f6', borderRadius: 10, padding: '8px 12px' }}>
      <div style={{ fontFamily: M, fontWeight: 700, fontSize: 9.5, color: '#9B9B9B', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontFamily: D, fontSize: 13, color: strong ? '#2E3192' : '#1a1c5e', fontWeight: strong ? 700 : 500, marginTop: 2 }}>{value || '—'}</div>
    </div>
  )
}

// contagem pelos status efetivos (Vence em breve conta como aprovado)
export const contar = (docs) => {
  const st = docs.filter((d) => !d.soEqpi).map(effStatus)   // Inscrição Estadual fica com a EQPI
  return {
    ok: st.filter((s) => ['VALID', 'EXPIRING', 'NOT_APPLICABLE'].includes(s)).length,
    analise: st.filter((s) => s === 'PENDING').length,
    falta: st.filter((s) => ['MISSING', 'EXPIRED'].includes(s)).length,
    rej: st.filter((s) => s === 'REJECTED').length,
  }
}

export { StatusDot }
