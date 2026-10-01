// Demo · telas novas do refresh (30/09) para cliente e fornecedor:
// Relatórios (dashboard executivo), Compliance e Carta de Exceção.
// Dados fictícios.
import { useState } from 'react'
import { Card, Button, KpiCard, PageHeader, SectionTitle } from '../../components/ui.jsx'
import { DEMO_CLIENT_REPORTS, DEMO_COMPLIANCE } from './demoData.js'

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

// ── Cliente · Relatórios ────────────────────────────────────────────────────
export function DemoClientRelatorios() {
  const r = DEMO_CLIENT_REPORTS
  const maxMes = Math.max(...r.porMes.map(([, v]) => v))
  return (
    <div style={wrap}>
      <PageHeader title="Relatórios" subtitle="Visão executiva da sua homologação de fornecedores"/>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 12, marginBottom: 18 }}>
        <KpiCard label="Fornecedores" value={r.kpis.fornecedores} icon="🏭" iconBg="rgba(46,49,146,.1)"/>
        <KpiCard label="Homologados vigentes" value={r.kpis.homologados} icon="🏅" iconBg="rgba(34,197,94,.12)"/>
        <KpiCard label="Em homologação" value={r.kpis.emHomologacao} icon="⏳" iconBg="rgba(245,158,11,.12)"/>
        <KpiCard label="Docs a vencer (30d)" value={r.kpis.docsAVencer30} icon="📄" iconBg="rgba(244,126,47,.12)"/>
        <KpiCard label="Processos a vencer (60d)" value={r.kpis.processosAVencer60} icon="📅" iconBg="rgba(124,58,237,.1)"/>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(420px,1fr))', gap: 14 }}>
        <Card style={{ borderRadius: 16, padding: '18px 22px' }}>
          <SectionTitle>Funil de convites</SectionTitle>
          {r.funil.map((f) => <Barra key={f.label} label={f.label} value={f.value} max={r.funil[0].value}/>)}
        </Card>
        <Card style={{ borderRadius: 16, padding: '18px 22px' }}>
          <SectionTitle>Situação dos processos</SectionTitle>
          {r.situacao.map((s) => <Barra key={s.label} label={s.label} value={s.value} max={r.kpis.fornecedores} color={s.color}/>)}
        </Card>
        <Card style={{ borderRadius: 16, padding: '18px 22px' }}>
          <SectionTitle>Homologações por mês</SectionTitle>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, height: 140, paddingTop: 8 }}>
            {r.porMes.map(([m, v]) => (
              <div key={m} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontFamily: M, fontSize: 11, fontWeight: 700, color: '#1a1c5e' }}>{v}</div>
                <div style={{ height: `${(v / maxMes) * 100}px`, background: '#2E3192', borderRadius: '6px 6px 0 0', marginTop: 4 }}/>
                <div style={{ fontFamily: D, fontSize: 11, color: '#6b7280', marginTop: 4 }}>{m}</div>
              </div>
            ))}
          </div>
        </Card>
        <Card style={{ borderRadius: 16, padding: '18px 22px' }}>
          <SectionTitle>Questionários e cotações</SectionTitle>
          <Barra label="✅ Responderam" value={r.questionarios.responderam} max={r.kpis.homologados} color="#22c55e"/>
          <Barra label="⚠️ Não responderam" value={r.questionarios.naoResponderam} max={r.kpis.homologados} color="#f59e0b"/>
          <Barra label="📝 Cotações abertas" value={r.rfq.abertas} max={20} color="#7c3aed"/>
          <Barra label="💬 Respostas recebidas" value={r.rfq.respostas} max={20} color="#7c3aed"/>
        </Card>
      </div>
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
        As regras de alerta são configuradas por pergunta no editor de questionários — cada cliente define o que exige revisão.
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
