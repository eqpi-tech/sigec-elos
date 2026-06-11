import { useState } from 'react'
import { Card, Button, Spinner, PageHeader } from '../../components/ui.jsx'

// ── Dados demo ────────────────────────────────────────────────────────────────
const DEMO_RFQS = [
  { id:1, title:'Fornecimento de EPI — T2 2026', category:'Segurança do Trabalho', created:'2026-05-10', deadline:'2026-06-20', sent:8, responded:5, description:'Cotação de equipamentos de proteção individual para operações de campo.' },
  { id:2, title:'Manutenção Elétrica — Unidade MG', category:'Serviços Elétricos',  created:'2026-04-22', deadline:'2026-05-30', sent:6, responded:6, description:'Serviços de manutenção preventiva e corretiva de painéis elétricos.' },
  { id:3, title:'Fornecimento de Ferramentas',     category:'Manutenção Industrial', created:'2026-04-05', deadline:null,        sent:4, responded:2, description:'Cotação de ferramentas e consumíveis para manutenção industrial.' },
]

const DEMO_RESPONSES = [
  { id:1, razao_social:'Primatus Serviços Técnicos Ltda', city:'São Paulo',      state:'SP', status:'ACCEPTED',  price:28500, message:'Podemos atender ao escopo completo com entrega em até 5 dias úteis.' },
  { id:2, razao_social:'Ômega Engenharia Ltda',           city:'Belo Horizonte', state:'MG', status:'SENT',      price:null,  message:null },
  { id:3, razao_social:'TechFix Industrial S.A.',          city:'Campinas',       state:'SP', status:'READ',      price:31200, message:'Proposta incluída. Prazo de execução: 7 dias úteis.' },
  { id:4, razao_social:'Sulbras Serviços Ltda',            city:'Porto Alegre',   state:'RS', status:'DECLINED',  price:null,  message:'Não temos disponibilidade no período solicitado.' },
  { id:5, razao_social:'Norte Industrial Ltda',            city:'Parauapebas',    state:'PA', status:'ACCEPTED',  price:26800, message:'Aprovado. Enviamos proposta técnica por e-mail.' },
]

const CATEGORIES = ['Manutenção Industrial','Serviços Elétricos','Automação & Controle','Segurança do Trabalho','Construção Civil','Logística','TI e Telecomunicações','Gestão Ambiental']

const STATUS_COLOR = { SENT:'#9B9B9B', ACCEPTED:'#22c55e', DECLINED:'#ef4444', READ:'#f59e0b' }
const STATUS_LABEL = { SENT:'Enviada', ACCEPTED:'Aceita', DECLINED:'Recusada', READ:'Visualizada' }

const inp = { width:'100%', padding:'10px 12px', borderRadius:10, border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:13, boxSizing:'border-box', outline:'none', color:'#1a1c5e' }
const lbl = { display:'block', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:10, color:'#9B9B9B', letterSpacing:.5, textTransform:'uppercase', marginBottom:5 }

// ── Modal nova RFQ ────────────────────────────────────────────────────────────
function NewRFQModal({ onClose, onCreated }) {
  const [form,    setForm]    = useState({ title:'', category:'', description:'', deadline:'' })
  const [saving,  setSaving]  = useState(false)
  const [done,    setDone]    = useState(false)
  const eligible = form.category ? Math.floor(Math.random() * 8) + 4 : null

  const submit = () => {
    if (!form.title || !form.category) return
    setSaving(true)
    setTimeout(() => { setSaving(false); setDone(true); setTimeout(() => { onCreated(form); onClose() }, 1000) }, 900)
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:16 }}>
      <div style={{ background:'#fff', borderRadius:20, padding:28, maxWidth:520, width:'100%', boxShadow:'0 24px 80px rgba(0,0,0,.3)', maxHeight:'90vh', overflowY:'auto' }}>
        {done ? (
          <div style={{ textAlign:'center', padding:'20px 0' }}>
            <div style={{ fontSize:52, marginBottom:12 }}>📤</div>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:18, color:'#15803d', marginBottom:6 }}>Cotação enviada!</div>
            <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#9B9B9B' }}>Fornecedores homologados foram notificados.</div>
          </div>
        ) : (
          <>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:18, color:'#1a1c5e', marginBottom:20 }}>Nova Solicitação de Cotação</div>
            <div style={{ marginBottom:14 }}>
              <span style={lbl}>Título</span>
              <input value={form.title} onChange={e => setForm(p=>({...p, title:e.target.value}))} placeholder="Ex: Fornecimento de EPI" style={inp}/>
            </div>
            <div style={{ marginBottom:14 }}>
              <span style={lbl}>Categoria</span>
              <select value={form.category} onChange={e => setForm(p=>({...p, category:e.target.value}))} style={inp}>
                <option value="">Selecione uma categoria...</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              {eligible !== null && (
                <div style={{ fontSize:11, color:'#22c55e', fontFamily:'DM Sans,sans-serif', marginTop:4 }}>
                  ✓ {eligible} fornecedores homologados nesta categoria receberão a solicitação
                </div>
              )}
            </div>
            <div style={{ marginBottom:14 }}>
              <span style={lbl}>Descrição</span>
              <textarea value={form.description} onChange={e => setForm(p=>({...p, description:e.target.value}))}
                placeholder="Descreva o produto/serviço, especificações, volumes..." rows={4}
                style={{ ...inp, resize:'vertical' }}/>
            </div>
            <div style={{ marginBottom:20 }}>
              <span style={lbl}>Prazo para resposta (opcional)</span>
              <input type="date" value={form.deadline} onChange={e => setForm(p=>({...p, deadline:e.target.value}))} style={inp}/>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <Button variant="neutral" full onClick={onClose}>Cancelar</Button>
              <Button variant="primary" full disabled={saving || !form.title || !form.category} onClick={submit}>
                {saving ? <><Spinner size={14}/> Enviando...</> : `📤 Enviar para ${eligible ?? '...'} fornecedores`}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Modal detalhe RFQ ─────────────────────────────────────────────────────────
function RFQDetailModal({ rfq, onClose }) {
  const [responses, setResponses] = useState(DEMO_RESPONSES.slice(0, rfq.sent))
  const respondidas = responses.filter(r => r.message || r.price).length

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:16 }}>
      <div style={{ background:'#fff', borderRadius:20, padding:28, maxWidth:640, width:'100%', boxShadow:'0 24px 80px rgba(0,0,0,.3)', maxHeight:'90vh', overflowY:'auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
          <div>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:16, color:'#1a1c5e' }}>{rfq.title}</div>
            <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:12, color:'#9B9B9B', marginTop:2 }}>
              {rfq.category} · Criado em {rfq.created}{rfq.deadline ? ` · Prazo: ${rfq.deadline}` : ''}
            </div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#9B9B9B', fontSize:20 }}>✕</button>
        </div>

        {rfq.description && (
          <div style={{ background:'rgba(46,49,146,.04)', border:'1px solid rgba(46,49,146,.1)', borderRadius:10, padding:'12px 14px', marginBottom:16, fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#1a1c5e', lineHeight:1.5 }}>
            {rfq.description}
          </div>
        )}

        <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:12, color:'#9B9B9B', letterSpacing:.5, textTransform:'uppercase', marginBottom:10 }}>
          {respondidas} de {responses.length} fornecedores responderam
        </div>

        {responses.map(r => (
          <div key={r.id} style={{ padding:'14px 16px', borderRadius:12, border:`1px solid ${r.message||r.price?'#e2e4ef':'#f4f5f9'}`, background:r.message||r.price?'#fff':'#fafbff', marginBottom:8 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:r.message||r.price?10:0 }}>
              <div>
                <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, fontWeight:700, color:'#1a1c5e' }}>{r.razao_social}</div>
                <div style={{ fontSize:11, color:'#9B9B9B' }}>{r.city}/{r.state}</div>
              </div>
              <span style={{ fontSize:11, fontWeight:700, color:STATUS_COLOR[r.status], background:`${STATUS_COLOR[r.status]}18`, padding:'3px 10px', borderRadius:20, fontFamily:'Montserrat,sans-serif' }}>
                {STATUS_LABEL[r.status]}
              </span>
            </div>
            {(r.message || r.price) && (
              <div style={{ borderTop:'1px solid #f4f5f9', paddingTop:10 }}>
                {r.price && (
                  <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:16, color:'#1a1c5e', marginBottom:4 }}>
                    R$ {r.price.toLocaleString('pt-BR')}
                  </div>
                )}
                {r.message && (
                  <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#374151', lineHeight:1.5, marginBottom:r.status==='SENT'||r.status==='READ'?10:0 }}>{r.message}</div>
                )}
                {(r.status === 'SENT' || r.status === 'READ') && (
                  <div style={{ display:'flex', gap:6 }}>
                    <button onClick={() => setResponses(prev => prev.map(x => x.id===r.id ? {...x, status:'ACCEPTED'} : x))}
                      style={{ padding:'5px 12px', borderRadius:8, background:'#f0fdf4', border:'1px solid #86efac', color:'#15803d', fontSize:11, fontFamily:'Montserrat,sans-serif', fontWeight:700, cursor:'pointer' }}>✓ Aceitar</button>
                    <button onClick={() => setResponses(prev => prev.map(x => x.id===r.id ? {...x, status:'DECLINED'} : x))}
                      style={{ padding:'5px 12px', borderRadius:8, background:'#fef2f2', border:'1px solid #fca5a5', color:'#dc2626', fontSize:11, fontFamily:'Montserrat,sans-serif', fontWeight:700, cursor:'pointer' }}>✕ Recusar</button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function DemoRFQ({ navigate, profile = 'CLIENT' }) {
  const [rfqs,      setRfqs]      = useState(DEMO_RFQS)
  const [showNew,   setShowNew]   = useState(false)
  const [detailRfq, setDetailRfq] = useState(null)

  const backTo = profile === 'BUYER' ? 'marketplace' : 'dashboard'

  return (
    <div style={{ padding:'24px 32px', maxWidth:900, margin:'0 auto' }}>
      <PageHeader
        title="Solicitações de Cotação (RFQ)"
        subtitle="Envie cotações para todos os fornecedores homologados em uma categoria"
        action={{ label:'+ Nova Cotação', onClick: () => setShowNew(true) }}
      />

      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        {rfqs.map(rfq => (
          <Card key={rfq.id} hover style={{ borderRadius:12, padding:'18px 20px', cursor:'pointer', transition:'box-shadow .15s' }}
            onClick={() => setDetailRfq(rfq)}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, flexWrap:'wrap' }}>
              <div style={{ flex:1 }}>
                <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:14, color:'#1a1c5e' }}>{rfq.title}</div>
                <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:12, color:'#9B9B9B', marginTop:2 }}>
                  {rfq.category} · {rfq.created}{rfq.deadline ? ` · Prazo: ${rfq.deadline}` : ''}
                </div>
                {rfq.description && (
                  <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:12, color:'#64748b', marginTop:4, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:400 }}>{rfq.description}</div>
                )}
              </div>
              <div style={{ textAlign:'right', flexShrink:0 }}>
                <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, color:'#2E3192' }}>
                  {rfq.responded}/{rfq.sent} responderam
                </div>
                <div style={{ fontSize:11, color:'#9B9B9B', marginTop:2 }}>Ver respostas →</div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {showNew && (
        <NewRFQModal
          onClose={() => setShowNew(false)}
          onCreated={f => setRfqs(prev => [{ id:Date.now(), title:f.title, category:f.category, created:new Date().toISOString().slice(0,10), deadline:f.deadline||null, sent:5, responded:0, description:f.description }, ...prev])}
        />
      )}
      {detailRfq && <RFQDetailModal rfq={detailRfq} onClose={() => setDetailRfq(null)}/>}
    </div>
  )
}
