import { useState } from 'react'
import { Card, Button, Spinner, PageHeader } from '../../components/ui.jsx'
import { PRIMATUS, isoD, fmtBR } from './demoData.js'

// ── Dados demo (Horizonte Mineração) — as cotações com a Primatus são as
// mesmas que ela vê na caixa "Cotações" do fornecedor ─────────────────────────
const DEMO_RFQS = [
  { id:1, title:'Manutenção Elétrica — Unidade Itabira', category:'Serviços Elétricos', created:isoD(-3), deadline:isoD(9), sent:6, description:'Manutenção preventiva e corretiva de painéis elétricos de média tensão (2 subestações). Atendimento em turno, 6 meses, com relatório mensal de inspeção termográfica.' },
  { id:2, title:'Manutenção preventiva de correias — parada geral', category:'Manutenção Industrial', created:isoD(-12), deadline:isoD(2), sent:4, description:'Parada geral programada das correias TC-01 a TC-04. Escopo: inspeção, troca de roletes danificados e alinhamento.' },
  { id:3, title:'Manutenção Elétrica — Unidade MG', category:'Serviços Elétricos', created:isoD(-34), deadline:isoD(-14), sent:5, description:'Serviços de manutenção preventiva e corretiva de painéis elétricos.' },
]

// respostas por cotação (Primatus em todas, coerente com a caixa dela)
const DEMO_RESPONSES = {
  1: [
    { id:11, razao_social:PRIMATUS.razao,           city:'São Paulo',      state:'SP', status:'SENT',     price:null,  message:null },
    { id:12, razao_social:'Ômega Engenharia Ltda',  city:'Belo Horizonte', state:'MG', status:'READ',     price:52300, message:'Equipe dedicada em turno; inclui termografia mensal.' },
    { id:13, razao_social:'TechFix Industrial S.A.', city:'Campinas',      state:'SP', status:'SENT',     price:null,  message:null },
    { id:14, razao_social:'Sulbras Serviços Ltda',  city:'Porto Alegre',   state:'RS', status:'DECLINED', price:null,  message:'Não temos disponibilidade no período solicitado.' },
    { id:15, razao_social:'Norte Industrial Ltda',  city:'Parauapebas',    state:'PA', status:'SENT',     price:null,  message:null },
    { id:16, razao_social:'LogFlex Transportes',    city:'Santos',         state:'SP', status:'SENT',     price:null,  message:null },
  ],
  2: [
    { id:21, razao_social:PRIMATUS.razao,           city:'São Paulo',      state:'SP', status:'READ',     price:46800, message:'Equipe de 8 técnicos, 5 dias de parada, inclui troca de roletes e alinhamento. Validade da proposta: 30 dias.' },
    { id:22, razao_social:'Ômega Engenharia Ltda',  city:'Belo Horizonte', state:'MG', status:'SENT',     price:null,  message:null },
    { id:23, razao_social:'Sulbras Serviços Ltda',  city:'Porto Alegre',   state:'RS', status:'READ',     price:49900, message:'Execução em 6 dias com equipe própria.' },
    { id:24, razao_social:'Norte Industrial Ltda',  city:'Parauapebas',    state:'PA', status:'SENT',     price:null,  message:null },
  ],
  3: [
    { id:31, razao_social:PRIMATUS.razao,           city:'São Paulo',      state:'SP', status:'ACCEPTED', price:28500, message:'Podemos atender ao escopo completo com mobilização em até 5 dias úteis.' },
    { id:32, razao_social:'Ômega Engenharia Ltda',  city:'Belo Horizonte', state:'MG', status:'DECLINED', price:31200, message:'Proposta incluída. Prazo de execução: 7 dias úteis.' },
    { id:33, razao_social:'TechFix Industrial S.A.', city:'Campinas',      state:'SP', status:'DECLINED', price:33900, message:'Execução em 10 dias úteis.' },
    { id:34, razao_social:'Sulbras Serviços Ltda',  city:'Porto Alegre',   state:'RS', status:'DECLINED', price:null,  message:'Não temos disponibilidade no período solicitado.' },
    { id:35, razao_social:'LogFlex Transportes',    city:'Santos',         state:'SP', status:'SENT',     price:null,  message:null },
  ],
}
// fornecedores homologados por categoria (determinístico — nada de sorteio a cada render)
const ELEGIVEIS = { 'Manutenção Industrial':9, 'Serviços Elétricos':6, 'Automação & Controle':4, 'Segurança do Trabalho':5, 'Construção Civil':7, 'Logística':3, 'TI e Telecomunicações':2, 'Gestão Ambiental':4 }

const CATEGORIES = ['Manutenção Industrial','Serviços Elétricos','Automação & Controle','Segurança do Trabalho','Construção Civil','Logística','TI e Telecomunicações','Gestão Ambiental']

const STATUS_COLOR = { SENT:'#9B9B9B', ACCEPTED:'#22c55e', DECLINED:'#ef4444', READ:'#f59e0b' }
const STATUS_LABEL = { SENT:'Enviada', ACCEPTED:'Aceita', DECLINED:'Recusada', READ:'Visualizada' }
const respondidasDe = (list) => list.filter(r => r.message || r.price).length

const inp = { width:'100%', padding:'10px 12px', borderRadius:10, border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:13, boxSizing:'border-box', outline:'none', color:'#1a1c5e' }
const lbl = { display:'block', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:10, color:'#9B9B9B', letterSpacing:.5, textTransform:'uppercase', marginBottom:5 }

// ── Modal nova RFQ ────────────────────────────────────────────────────────────
function NewRFQModal({ onClose, onCreated }) {
  const [form,    setForm]    = useState({ title:'', category:'', description:'', deadline:'' })
  const [saving,  setSaving]  = useState(false)
  const [done,    setDone]    = useState(false)
  const eligible = form.category ? (ELEGIVEIS[form.category] ?? 3) : null

  const submit = () => {
    if (!form.title || !form.category) return
    setSaving(true)
    setTimeout(() => { setSaving(false); setDone(true); setTimeout(() => { onCreated({ ...form, sent: eligible }); onClose() }, 1000) }, 900)
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
              <input type="date" value={form.deadline} min={isoD(0)} onChange={e => setForm(p=>({...p, deadline:e.target.value}))} style={inp}/>
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
function RFQDetailModal({ rfq, responses, setResponses, onClose }) {
  const respondidas = respondidasDe(responses)

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:16 }}>
      <div style={{ background:'#fff', borderRadius:20, padding:28, maxWidth:640, width:'100%', boxShadow:'0 24px 80px rgba(0,0,0,.3)', maxHeight:'90vh', overflowY:'auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
          <div>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:16, color:'#1a1c5e' }}>{rfq.title}</div>
            <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:12, color:'#9B9B9B', marginTop:2 }}>
              {rfq.category} · Criado em {fmtBR(rfq.created)}{rfq.deadline ? ` · Prazo: ${fmtBR(rfq.deadline)}` : ''}
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
                    <button onClick={() => setResponses(responses.map(x => x.id===r.id ? {...x, status:'ACCEPTED'} : x))}
                      style={{ padding:'5px 12px', borderRadius:8, background:'#f0fdf4', border:'1px solid #86efac', color:'#15803d', fontSize:11, fontFamily:'Montserrat,sans-serif', fontWeight:700, cursor:'pointer' }}>✓ Aceitar</button>
                    <button onClick={() => setResponses(responses.map(x => x.id===r.id ? {...x, status:'DECLINED'} : x))}
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
export default function DemoRFQ() {
  const [rfqs,      setRfqs]      = useState(DEMO_RFQS)
  const [resps,     setResps]     = useState(DEMO_RESPONSES)
  const [showNew,   setShowNew]   = useState(false)
  const [detailRfq, setDetailRfq] = useState(null)

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
                  {rfq.category} · {fmtBR(rfq.created)}{rfq.deadline ? ` · Prazo: ${fmtBR(rfq.deadline)}` : ''}{rfq.deadline && rfq.deadline < isoD(0) ? ' · encerrada' : ''}
                </div>
                {rfq.description && (
                  <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:12, color:'#64748b', marginTop:4, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:400 }}>{rfq.description}</div>
                )}
              </div>
              <div style={{ textAlign:'right', flexShrink:0 }}>
                <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, color:'#2E3192' }}>
                  {respondidasDe(resps[rfq.id] || [])}/{rfq.sent} responderam
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
          onCreated={f => { const id = Date.now(); setResps(p => ({ ...p, [id]: [] })); setRfqs(prev => [{ id, title:f.title, category:f.category, created:isoD(0), deadline:f.deadline||null, sent:f.sent, description:f.description }, ...prev]) }}
        />
      )}
      {detailRfq && <RFQDetailModal rfq={detailRfq} responses={resps[detailRfq.id] || []} setResponses={(l) => setResps(p => ({ ...p, [detailRfq.id]: l }))} onClose={() => setDetailRfq(null)}/>}
    </div>
  )
}
