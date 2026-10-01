// Demo · base das fichas do processo (refresh 30/09): dados fictícios de UM
// processo completo (Primatus × Horizonte — Suprimentos), no mesmo formato das
// telas reais, e as peças comuns: abas, leitor de documento, histórico do
// documento e aviso (toast). Usado pelas fichas do fornecedor, do cliente, do
// comprador e do backoffice, para as quatro contarem a mesma história.
import { useEffect } from 'react'
import { Button, StatusDot } from '../../components/ui.jsx'

export const M = 'Montserrat,sans-serif'
export const D = 'DM Sans,sans-serif'
export const pill = (color, bg) => ({ fontSize: 10, fontWeight: 700, color, background: bg, padding: '2px 8px', borderRadius: 20, fontFamily: M, whiteSpace: 'nowrap' })
export const ROW = {
  VALID: { bg: '#f8fffe', bd: '#dcfce7' }, PENDING: { bg: '#fff7ed', bd: '#fed7aa' },
  MISSING: { bg: '#fff5f5', bd: '#fee2e2' }, REJECTED: { bg: '#fff5f5', bd: '#fee2e2' },
  EXPIRED: { bg: '#fff5f5', bd: '#fee2e2' }, EXPIRING: { bg: '#fffbeb', bd: '#fef3c7' },
  NOT_APPLICABLE: { bg: '#f8fafc', bd: '#e2e8f0' },
}
export const fmt = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—')

// ── o processo de demonstração ─────────────────────────────────────────────
// source: AUTO (coletado automaticamente) | MANUAL (enviado pelo fornecedor)
// kind: instant (Cartão CNPJ, Simples, CNAEs) | assertiva | emitir (link da fonte) | bank | dre
export const FICHA = {
  razao: 'Primatus Serviços Técnicos Ltda', fantasia: 'Primatus', cnpj: '34.218.904/0001-72',
  cidade: 'São Paulo', uf: 'SP', email: 'lucas@primatus.com.br', matriz: 'Matriz',
  cliente: 'Horizonte Mineração S/A', processo: 'Horizonte — Suprimentos', score: 72,
  convite: { tipo: 'Serviço', subsidiado: true, contato: 'Rafael Costa · (31) 3290-4400', escopo: 'Manutenção preventiva de correias transportadoras — unidade Itabira/MG', em: '2026-09-02', por: 'rafael@horizonte.com.br' },
  cnpjData: { situacao: 'ATIVA', desde: '10/03/2012', abertura: '10/03/2012', porte: 'Demais', capital: 'R$ 850.000,00', natureza: '206-2 — Sociedade Empresária Limitada', municipio: 'São Paulo / SP', consultado: '2026-09-02 10:14' },
  endereco: { logradouro: 'Av. das Indústrias, 1450 — Galpão 3', bairro: 'Distrito Industrial', cidade: 'São Paulo / SP', cep: '04710-020' },
  contato: { telefone: '(11) 3421-8900', telefone2: '(11) 97410-2231', email: 'contato@primatus.com.br' },
  regime: { simples: true, desde: '01/01/2013' },
  cnaePrincipal: { codigo: '3314-7/10', desc: 'Manutenção e reparação de máquinas e equipamentos para uso geral' },
  cnaesSec: [
    { codigo: '3321-0/00', desc: 'Instalação de máquinas e equipamentos industriais' },
    { codigo: '4321-5/00', desc: 'Instalação e manutenção elétrica' },
    { codigo: '2513-6/00', desc: 'Fabricação de obras de caldeiraria pesada' },
  ],
  qsa: [
    { nome: 'Lucas Andrade', qual: 'Sócio-Administrador', pct: '60%', desde: '10/03/2012', cpf: '***.482.918-**', fone: '(11) 9****-8821', nac: 'Brasileira', faixa: '41 a 50 anos' },
    { nome: 'Maria Ferreira', qual: 'Sócia', pct: '40%', desde: '22/07/2015', cpf: '***.107.334-**', fone: '(11) 9****-1907', nac: 'Brasileira', faixa: '31 a 40 anos' },
  ],
  categorias: [
    { nome: 'Manutenção Industrial', cnae: '3314-7/10' }, { nome: 'Serviços Elétricos', cnae: '4321-5/00' },
    { nome: 'Automação & Controle', cnae: '3321-0/00' }, { nome: 'Caldeiraria', cnae: '2513-6/00' },
  ],
  servicos: ['Manutenção de correias', 'Montagem mecânica', 'Painéis elétricos', 'Soldagem'],
  capacidade: { faturamento: 'R$ 4,8 a 10 milhões/ano', funcionarios: '50 a 99', plano: 'ELOS Verificado' },
  docs: [
    { id: 'd37', label: 'Cartão de Inscrição no CNPJ', status: 'VALID', source: 'AUTO', kind: 'instant', expires: null, sent: '2026-09-02' },
    { id: 'd62', label: 'Comprovante de Deferimento do Simples Nacional', status: 'VALID', source: 'AUTO', kind: 'instant', expires: null, sent: '2026-09-02' },
    { id: 'd61', label: 'Análise CNAEs', status: 'PENDING', source: 'AUTO', kind: 'instant', expires: null, sent: '2026-09-02' },
    { id: 'd578', label: 'Relatório Assertiva 360 — Análise Restritiva PJ', status: 'VALID', source: 'AUTO', kind: 'assertiva', expires: '2027-03-02', sent: '2026-09-02', meta: 'Prot. 88412 · Classe B · 742 pts' },
    { id: 'd42', label: 'CND Tributos Federais e Dívida Ativa da União', status: 'VALID', source: 'MANUAL', kind: 'emitir', expires: '2027-03-30', sent: '2026-09-03' },
    { id: 'd7', label: 'Certidão de Regularidade do FGTS (CRF)', status: 'VALID', source: 'MANUAL', kind: 'emitir', expires: '2026-10-14', sent: '2026-09-15', meta: 'Cert. nº 2026091511423871 · 15/09/2026 a 14/10/2026' },
    { id: 'd8', label: 'CNDT Certidão Negativa de Débitos Trabalhistas', status: 'PENDING', source: 'MANUAL', kind: 'emitir', expires: '2027-03-27', sent: '2026-09-28' },
    { id: 'd6', label: 'CND Tributos Municipais', status: 'EXPIRING', source: 'MANUAL', expires: '2026-10-20', sent: '2026-04-20' },
    { id: 'd40', label: 'Alvará de Funcionamento', status: 'REJECTED', source: 'MANUAL', expires: null, sent: '2026-09-10', note: 'Documento vencido — envie o alvará do exercício atual' },
    { id: 'd39', label: 'Contrato Social (último consolidado)', status: 'VALID', source: 'MANUAL', expires: '2027-09-03', sent: '2025-11-12', reused: true },
    { id: 'd10', label: 'Comprovante de Conta Bancária', status: 'PENDING', source: 'MANUAL', kind: 'bank', expires: null, sent: '2026-09-28' },
    { id: 'd11', label: 'DRE — Demonstração do Resultado do Exercício 2025', status: 'PENDING', source: 'MANUAL', kind: 'dre', expires: null, sent: '2026-09-28' },
    { id: 'd31', label: 'Apólice de Seguro de Responsabilidade Civil', status: 'MISSING', source: 'MANUAL', expires: null, sent: null },
  ],
  mobilidade: {
    posto: 'PORTARIA', cidade: 'Itabira', uf: 'MG', armado: false, funcao: 'Porteiro', postos: 2, pessoas: 2,
    docsPosto: [ { id: 'm1', label: 'PGR do posto', status: 'VALID', expires: '2027-05-10' }, { id: 'm2', label: 'PCMSO do posto', status: 'MISSING' } ],
    colaboradores: [
      { nome: 'João P. Silva', cpf: '***.221.908-**', docs: [ { id: 'm3', label: 'ASO', status: 'VALID', expires: '2027-02-01' }, { id: 'm4', label: 'Certificado de reciclagem', status: 'PENDING' } ] },
      { nome: 'Carla M. Souza', cpf: '***.874.110-**', docs: [ { id: 'm5', label: 'ASO', status: 'VALID', expires: '2027-01-12' }, { id: 'm6', label: 'Certificado de reciclagem', status: 'EXPIRING', expires: '2026-10-28' } ] },
    ],
  },
  questionario: [
    { titulo: 'Questionário de Integridade — Horizonte', q: 'A empresa possui programa de integridade (compliance) formalizado?', r: 'Sim' },
    { titulo: 'Questionário de Integridade — Horizonte', q: 'Algum sócio é pessoa politicamente exposta (PEP)?', r: 'Não' },
    { titulo: 'Questionário de Integridade — Horizonte', q: 'Quantos colaboradores serão alocados no contrato?', r: '12 colaboradores' },
    { titulo: 'Questionário de SSMA', q: 'A empresa possui SESMT próprio?', r: 'Não' },
  ],
  log: [
    { icon: '↩️', label: 'Decisão de documento revertida', det: 'CNDT — reprovado por engano, era o documento correto', quando: '2026-09-29 11:02', por: 'ana.ribeiro@eqpitech.com.br', cor: '#f59e0b' },
    { icon: '✕', label: 'Documento rejeitado', det: 'Alvará de Funcionamento — Documento vencido', quando: '2026-09-12 16:40', por: 'ana.ribeiro@eqpitech.com.br', cor: '#ef4444' },
    { icon: '📅', label: 'Vencimento alterado', det: 'CND Tributos Municipais → 20/10/2026', quando: '2026-09-12 16:31', por: 'ana.ribeiro@eqpitech.com.br', cor: '#2E3192' },
    { icon: '✓', label: 'Documento aprovado', det: 'CND Federal — válida até 30/03/2027', quando: '2026-09-05 09:18', por: 'ana.ribeiro@eqpitech.com.br', cor: '#22c55e' },
    { icon: '🔍', label: 'Análise iniciada', det: 'Primatus Serviços Técnicos Ltda', quando: '2026-09-04 08:50', por: 'sistema', cor: '#2E3192' },
  ],
  convites: [
    { cliente: 'Horizonte Mineração S/A', quando: '2026-09-02 09:12', status: 'Cadastrado', cor: '#15803d' },
    { cliente: 'Vale do Aço Engenharia', quando: '2026-08-14 15:40', status: 'Visualizado', cor: '#2563eb' },
  ],
  banco: { banco: 'Banco do Brasil', compe: '001', agencia: '3321-4', conta: '48210-7', pix: '34.218.904/0001-72', tipo: 'Corrente' },
  dre: [ { ano: 2025, receita: 'R$ 6.420.000', ativo: 'R$ 3.910.000', passivo: 'R$ 1.870.000', lucro: 'R$ 612.000', ebitda: 'R$ 905.000', estoque: 'R$ 214.000' } ],
}

export const HIST = {
  d40: [
    { ev: 'Rejeitado', cor: '#ef4444', em: '2026-09-12 16:40', det: 'Sem validade definida · Documento vencido — envie o alvará do exercício atual' },
    { ev: 'Novo arquivo', cor: '#2E3192', em: '2026-09-10 14:05', det: 'Sem validade definida' },
    { ev: 'Registrado', cor: '#9B9B9B', em: '2026-09-02 10:14', det: 'Sem validade definida' },
  ],
  default: [
    { ev: 'Aprovado', cor: '#22c55e', em: '2026-09-05 09:18', det: 'Validade: 30/03/2027 · Documento válido e dentro do prazo' },
    { ev: 'Novo arquivo', cor: '#2E3192', em: '2026-09-03 17:22', det: 'Validade: 30/03/2027' },
    { ev: 'Registrado', cor: '#9B9B9B', em: '2026-09-02 10:14', det: 'Sem validade definida' },
  ],
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

export function Toast({ msg, onDone }) {
  useEffect(() => {
    if (!msg) return undefined
    const t = setTimeout(onDone, 2600)
    return () => clearTimeout(t)
  }, [msg])   // eslint-disable-line react-hooks/exhaustive-deps
  if (!msg) return null
  return (
    <div style={{ position: 'fixed', top: 76, right: 24, zIndex: 1200, background: msg.startsWith('✅') ? '#15803d' : '#b91c1c', color: '#fff', borderRadius: 12, padding: '12px 18px', fontFamily: D, fontSize: 13.5, boxShadow: '0 10px 30px rgba(0,0,0,.2)' }}>{msg}</div>
  )
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
  if (!doc) return null
  const auto = doc.source === 'AUTO'
  return (
    <Modal onClose={onClose} max={720}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <div style={{ fontFamily: M, fontWeight: 800, fontSize: 15, color: '#1a1c5e' }}>📄 {doc.label}</div>
          <div style={{ fontFamily: D, fontSize: 11.5, color: '#9B9B9B' }}>{auto ? '⚡ Coletado automaticamente na fonte oficial' : `Enviado pelo fornecedor em ${fmt(doc.sent)}`}</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <Button variant="neutral" size="sm">↗ Abrir em nova aba</Button>
          <Button variant="neutral" size="sm" onClick={onClose}>✕</Button>
        </div>
      </div>
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

// "🕓" — histórico do documento (cada envio, aprovação, rejeição e vencimento)
export function HistoryModal({ doc, onClose }) {
  if (!doc) return null
  const itens = HIST[doc.id] || HIST.default
  return (
    <Modal onClose={onClose}>
      <div style={{ fontFamily: M, fontWeight: 800, fontSize: 16, color: '#1a1c5e' }}>🕓 Histórico do Documento</div>
      <div style={{ fontFamily: D, fontSize: 13, color: '#64748b', marginBottom: 14 }}>{doc.label}</div>
      {itens.map((h, i) => (
        <div key={i} style={{ borderLeft: `3px solid ${h.cor}`, background: '#fafbff', borderRadius: '0 10px 10px 0', padding: '8px 12px', marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: M, fontWeight: 700, fontSize: 12.5, color: h.cor }}>
            <span>{h.ev}</span><span style={{ fontFamily: D, fontWeight: 400, color: '#9B9B9B' }}>{h.em.split(' ')[0].split('-').reverse().join('/')} {h.em.split(' ')[1]}</span>
          </div>
          <div style={{ fontFamily: D, fontSize: 12, color: '#374151', marginTop: 2 }}>{h.det}</div>
        </div>
      ))}
      <div style={{ textAlign: 'right', marginTop: 8 }}><Button variant="neutral" size="sm" onClick={onClose}>Fechar</Button></div>
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

export const contar = (docs) => ({
  ok: docs.filter((d) => d.status === 'VALID').length,
  analise: docs.filter((d) => d.status === 'PENDING').length,
  falta: docs.filter((d) => ['MISSING', 'EXPIRED'].includes(d.status)).length,
  rej: docs.filter((d) => d.status === 'REJECTED').length,
})

export { StatusDot }
