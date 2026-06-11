import { useState, useEffect } from 'react'
import { KpiCard, Card, ScoreBar, Button, Spinner } from '../../components/ui.jsx'
import { DEMO_CLIENTE } from './demoData.js'

const sealColor = s => s === 'ACTIVE' ? '#22c55e' : s === 'PENDING' ? '#f59e0b' : '#9B9B9B'
const sealLabel = s => s === 'ACTIVE' ? 'Homologado' : s === 'PENDING' ? 'Em análise' : 'Pendente'

const CATS_RFQ = ['Manutenção Industrial','Serviços Elétricos','Construção Civil','Automação & Controle','Limpeza e Conservação','Tecnologia']

/* ── Modal base ── */
function Modal({ onClose, title, children }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:999, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
      <div style={{ background:'#fff', borderRadius:'20px 20px 0 0', width:'100%', maxWidth:480, boxShadow:'0 -8px 40px rgba(0,0,0,.15)', maxHeight:'90vh', overflowY:'auto', position:'relative' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'24px 24px 0' }}>
          <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:16, color:'#1a1c5e' }}>{title}</div>
          <button onClick={onClose} style={{ background:'#f4f5f9', border:'none', borderRadius:8, padding:'6px 10px', cursor:'pointer', color:'#9B9B9B', fontSize:16 }}>✕</button>
        </div>
        <div style={{ padding:'20px 24px 40px' }}>{children}</div>
      </div>
    </div>
  )
}

/* ── Modal Convidar ── */
function InviteModal({ onClose }) {
  const [step, setStep] = useState('form')
  useEffect(() => {
    if (step === 'sending') { const t = setTimeout(() => setStep('done'), 1500); return () => clearTimeout(t) }
  }, [step])

  const inp = { padding:'11px 14px', borderRadius:10, border:'1.5px solid rgba(46,49,146,.2)', fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#1a1c5e', background:'#fff', width:'100%', boxSizing:'border-box', marginBottom:14, outline:'none' }
  const lbl = { fontSize:11, fontWeight:700, color:'#9B9B9B', textTransform:'uppercase', letterSpacing:.5, marginBottom:6, fontFamily:'Montserrat,sans-serif', display:'block' }

  if (step === 'sending') return (
    <div style={{ textAlign:'center', padding:'40px 0' }}>
      <div style={{ display:'flex', justifyContent:'center', marginBottom:20 }}><Spinner size={48}/></div>
      <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:15, color:'#1a1c5e', marginBottom:6 }}>Enviando convite...</div>
      <div style={{ fontSize:13, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>Preparando e-mail com link de cadastro personalizado</div>
    </div>
  )

  if (step === 'done') return (
    <div style={{ textAlign:'center', padding:'24px 0' }}>
      <div style={{ fontSize:52, marginBottom:12 }}>📨</div>
      <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:20, color:'#1a1c5e', marginBottom:8 }}>Convite enviado!</div>
      <div style={{ fontSize:13, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', marginBottom:20, lineHeight:1.6 }}>
        <strong style={{ color:'#1a1c5e' }}>TechFix Industrial</strong> receberá um link personalizado para cadastro na plataforma ELOS.
      </div>
      {['Convite registrado no sistema','Link exclusivo gerado','Fornecedor avisado por e-mail','Acompanhe o status em Meus Convites'].map(item => (
        <div key={item} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8, fontSize:13, color:'#166534', fontFamily:'DM Sans,sans-serif', textAlign:'left' }}>
          <span style={{ color:'#22c55e', fontWeight:700 }}>✓</span> {item}
        </div>
      ))}
      <Button variant="primary" full style={{ marginTop:20 }} onClick={onClose}>Fechar</Button>
    </div>
  )

  return (
    <div>
      <div style={{ fontSize:13, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', marginBottom:20 }}>
        O fornecedor receberá um link com o portal exclusivo da sua empresa para cadastro.
      </div>
      <label style={lbl}>CNPJ do fornecedor</label>
      <div style={inp}>33.445.566/0001-88</div>
      <label style={lbl}>Razão Social</label>
      <div style={inp}>TechFix Industrial Ltda</div>
      <label style={lbl}>E-mail do responsável</label>
      <div style={inp}>carlos@techfix.com.br</div>
      <Button variant="primary" full size="lg" onClick={() => setStep('sending')}>📨 Enviar Convite</Button>
    </div>
  )
}

/* ── Modal RFQ ── */
function RFQModal({ onClose }) {
  const [step, setStep] = useState('form')
  const [cat, setCat]   = useState('')
  useEffect(() => {
    if (step === 'sending') { const t = setTimeout(() => setStep('done'), 1600); return () => clearTimeout(t) }
  }, [step])

  const inp = { padding:'11px 14px', borderRadius:10, border:'1.5px solid rgba(46,49,146,.2)', fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#1a1c5e', background:'#fff', width:'100%', boxSizing:'border-box', marginBottom:14, outline:'none' }
  const lbl = { fontSize:11, fontWeight:700, color:'#9B9B9B', textTransform:'uppercase', letterSpacing:.5, marginBottom:6, fontFamily:'Montserrat,sans-serif', display:'block' }

  if (step === 'sending') return (
    <div style={{ textAlign:'center', padding:'40px 0' }}>
      <div style={{ display:'flex', justifyContent:'center', marginBottom:20 }}><Spinner size={48}/></div>
      <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:15, color:'#1a1c5e', marginBottom:6 }}>Enviando RFQ...</div>
      <div style={{ fontSize:13, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>Notificando fornecedores homologados na categoria</div>
    </div>
  )

  if (step === 'done') return (
    <div style={{ textAlign:'center', padding:'24px 0' }}>
      <div style={{ fontSize:52, marginBottom:12 }}>💬</div>
      <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:20, color:'#1a1c5e', marginBottom:8 }}>RFQ enviada com sucesso!</div>
      <div style={{ fontSize:13, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', marginBottom:20, lineHeight:1.6 }}>
        Sua solicitação foi enviada para <strong style={{ color:'#2E3192' }}>12 fornecedores homologados</strong> na categoria Manutenção Industrial.
      </div>
      <Card style={{ marginBottom:20 }}>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:10 }}>
          <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:12, color:'#9B9B9B' }}>Fornecedores notificados</div>
          <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:18, color:'#2E3192' }}>12</div>
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:10 }}>
          <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:12, color:'#9B9B9B' }}>Prazo de resposta</div>
          <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, color:'#1a1c5e' }}>7 dias</div>
        </div>
        <div style={{ display:'flex', justifyContent:'space-between' }}>
          <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:12, color:'#9B9B9B' }}>Status</div>
          <span style={{ background:'rgba(245,158,11,.15)', color:'#d97706', fontSize:10, fontFamily:'Montserrat,sans-serif', fontWeight:700, padding:'3px 10px', borderRadius:20 }}>Aguardando respostas</span>
        </div>
      </Card>
      <Button variant="primary" full onClick={onClose}>Fechar</Button>
    </div>
  )

  return (
    <div>
      <div style={{ fontSize:13, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', marginBottom:20 }}>
        A solicitação será enviada automaticamente para todos os fornecedores homologados na categoria selecionada.
      </div>
        <label style={lbl}>Título da solicitação</label>
        <div style={inp}>Manutenção preventiva — Planta Carajás Q2/2026</div>
        <label style={lbl}>Categoria</label>
        <div style={{ ...inp, display:'flex', alignItems:'center', flexWrap:'wrap', gap:6, height:'auto', minHeight:44, cursor:'default', background:'#fff' }}>
          <span style={{ background:'#EEF0FF', color:'#2E3192', fontSize:11, fontFamily:'Montserrat,sans-serif', fontWeight:700, padding:'3px 10px', borderRadius:20 }}>✓ Manutenção Industrial</span>
        </div>
        <label style={lbl}>Prazo para propostas</label>
        <div style={inp}>2026-06-20</div>
        <label style={lbl}>Descrição / Escopo</label>
        <div style={{ ...inp, minHeight:70 }}>Necessitamos de serviços de manutenção preventiva em equipamentos industriais na Planta Carajás. Volume estimado: 3.000 h/mês. Início previsto: julho/2026.</div>
        <div style={{ background:'#EEF0FF', borderRadius:10, padding:'10px 14px', marginBottom:14, fontSize:12, color:'#2E3192', fontFamily:'DM Sans,sans-serif' }}>
          💡 Esta RFQ será enviada para <strong>12 fornecedores homologados</strong> em Manutenção Industrial
        </div>
        <Button variant="primary" full size="lg" onClick={() => setStep('sending')}>💬 Enviar para 12 fornecedores</Button>
    </div>
  )
}

/* ── Main ── */
export default function ClienteView() {
  const [modal, setModal] = useState(null) // null | 'invite' | 'rfq'
  const c = DEMO_CLIENTE

  return (
    <div>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:24 }}>
        <div>
          <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:20, color:'#1a1c5e' }}>Olá, Rafael! 👋</div>
          <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#9B9B9B', marginTop:4 }}>Acompanhe o processo de homologação dos seus fornecedores</div>
        </div>
        <Button variant="primary" size="sm" style={{ flexShrink:0 }} onClick={() => setModal('invite')}>📨 Convidar</Button>
      </div>

      {/* KPIs 2×2 */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:22 }}>
        <KpiCard label="Fornecedores"  value={c.totalFornecedores} sub="Convidados"      icon="🤝" />
        <KpiCard label="Homologados"   value={c.verificados}       sub="Selo ELOS ativo" subColor="#22c55e" icon="✅" iconBg="rgba(34,197,94,.1)" />
        <KpiCard label="Em Análise"    value={c.emAnalise}         sub="Aguardando EQPI" subColor="#f59e0b" icon="⏳" iconBg="rgba(139,92,246,.1)" />
        <KpiCard label="Subsidiados"   value={c.subsidiados}       sub="Custo assumido"  subColor="#2E3192" icon="💰" iconBg="rgba(46,49,146,.1)" />
      </div>

      {/* Saúde da cadeia */}
      <Card style={{ borderRadius:14, padding:'16px 18px', marginBottom:18, display:'flex', alignItems:'center', gap:14 }}>
        <div style={{ width:46, height:46, borderRadius:12, background:'rgba(34,197,94,.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0 }}>🛡️</div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:15, color:'#1a1c5e', marginBottom:2 }}>Saúde da cadeia: {c.saudeGeral}%</div>
          <div style={{ fontSize:12, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', marginBottom:6 }}>Baseada em documentos válidos e conformidade</div>
          <ScoreBar score={c.saudeGeral}/>
        </div>
        <span style={{ background:'#EEF0FF', color:'#2E3192', fontSize:10, fontFamily:'Montserrat,sans-serif', fontWeight:700, padding:'4px 10px', borderRadius:20, flexShrink:0, cursor:'default' }}>Ver relatório</span>
      </Card>

      {/* Fornecedores Recentes */}
      <Card style={{ borderRadius:16, padding:'18px 20px', marginBottom:16 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:15, color:'#1a1c5e' }}>Fornecedores Recentes</div>
          <button style={{ background:'none', border:'none', color:'#2E3192', fontFamily:'DM Sans,sans-serif', fontSize:13, fontWeight:600, cursor:'pointer' }}>Ver todos →</button>
        </div>
        <div style={{ display:'grid', gap:10 }}>
          {c.fornecedoresRecentes.map((s, i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:14, padding:'12px 16px', background:'#f8faff', borderRadius:12, border:'1px solid #e2e4ef' }}>
              <div style={{ width:40, height:40, borderRadius:10, background:'#EEF0FF', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:14, color:'#2E3192', flexShrink:0, fontFamily:'Montserrat,sans-serif' }}>
                {s.initials}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, color:'#1a1c5e', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{s.empresa}</div>
                <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:11, color:'#9B9B9B' }}>{s.cidade} / {s.uf}</div>
              </div>
              {s.subsidiado && (
                <span style={{ fontSize:10, background:'#d1fae5', color:'#065f46', borderRadius:20, padding:'2px 8px', fontFamily:'Montserrat,sans-serif', fontWeight:700, flexShrink:0 }}>SUBSIDIADO</span>
              )}
              <div style={{ textAlign:'right', flexShrink:0 }}>
                <div style={{ fontSize:11, fontWeight:700, color:sealColor(s.sealStatus), fontFamily:'DM Sans,sans-serif' }}>{sealLabel(s.sealStatus)}</div>
                {s.sealStatus === 'ACTIVE' && s.score && <div style={{ fontSize:11, color:'#9B9B9B' }}>Score {s.score}%</div>}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Ações rápidas */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        {[
          { label:'Enviar Convite', icon:'📨', desc:'Convidar fornecedor', action:() => setModal('invite') },
          { label:'Solicitar Cotação', icon:'💬', desc:'Criar nova RFQ', action:() => setModal('rfq') },
        ].map(a => (
          <Card key={a.label} hover onClick={a.action} style={{ borderRadius:14, padding:'18px 16px', cursor:'pointer' }}>
            <div style={{ fontSize:24, marginBottom:6 }}>{a.icon}</div>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, color:'#1a1c5e' }}>{a.label}</div>
            <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:12, color:'#9B9B9B', marginTop:2 }}>{a.desc}</div>
          </Card>
        ))}
      </div>

      {/* Modais */}
      {modal === 'invite' && (
        <Modal onClose={() => setModal(null)} title="📨 Convidar Fornecedor">
          <InviteModal onClose={() => setModal(null)}/>
        </Modal>
      )}
      {modal === 'rfq' && (
        <Modal onClose={() => setModal(null)} title="💬 Solicitar Cotação (RFQ)">
          <RFQModal onClose={() => setModal(null)}/>
        </Modal>
      )}
    </div>
  )
}
