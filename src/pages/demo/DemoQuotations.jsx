// Demo · Cotações — espelha src/pages/supplier/Quotations.jsx (caixa do
// fornecedor: cotações de clientes e de compradores Pro) e
// src/pages/buyer/Quotations.jsx (Minhas Cotações do Comprador Pro), além do
// modal "📝 Solicitar Cotação" do Marketplace. Tudo em memória (dados fictícios).
import { useState } from 'react'
import { Card, Spinner, Button, PageHeader, EmptyState } from '../../components/ui.jsx'
import { DEMO_SUPPLIER_RFQ_INBOX, DEMO_BUYER_RFQS, isoD, fmtBR } from './demoData.js'
import { InlineConfirm } from './DemoFichaKit.jsx'

const money = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const parseMoneyBR = (s) => { const n = Number(String(s).replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '')); return Number.isFinite(n) ? n : NaN }
const inp = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e2e4ef', fontFamily: 'DM Sans,sans-serif', fontSize: 13, boxSizing: 'border-box', outline: 'none' }
const lbl = { display: 'block', fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 10, color: '#9B9B9B', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 5 }

// cotações enviadas pelo comprador nesta sessão da demo (Marketplace → Minhas Cotações)
const buyerStore = { rfqs: DEMO_BUYER_RFQS.map(r => ({ ...r, responses: r.responses.map(x => ({ ...x })) })) }

// ══ FORNECEDOR · Cotações recebidas ════════════════════════════════════════
const STATUS = {
  SENT:     { label: 'Nova',                color: '#2E3192' },
  READ:     { label: 'Aguardando você',     color: '#b45309' },
  ACCEPTED: { label: 'Aceita pelo cliente', color: '#15803d' },
  DECLINED: { label: 'Não selecionada',     color: '#9B9B9B' },
}
const quemDecide = (it) => (it?.requester_role === 'BUYER' ? 'comprador' : 'cliente')
const rotulo = (it) => (it?.status === 'ACCEPTED' ? `Aceita pelo ${quemDecide(it)}` : (STATUS[it?.status] || STATUS.READ).label)
const quem = (it) => (it.requester_role === 'BUYER' ? `🛒 ${it.client_name} · comprador` : it.client_name)

function RespondModal({ item, onClose, onSaved }) {
  const [message, setMessage] = useState(item.message || '')
  const [price, setPrice] = useState(item.price != null ? Number(item.price).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const encerrada = item.deadline && new Date(`${item.deadline}T23:59:59`) < new Date()
  const decidida = ['ACCEPTED', 'DECLINED'].includes(item.status)

  function save() {
    const valor = price.trim() ? parseMoneyBR(price) : null
    if (price.trim() && (valor == null || isNaN(valor) || valor < 0)) { setError('Valor inválido — use o formato 1.234,56'); return }
    if (!message.trim() && valor == null) { setError('Escreva a proposta ou informe o valor.'); return }
    setSaving(true); setError('')
    setTimeout(() => { onSaved({ ...item, message: message.trim(), price: valor, status: 'READ' }); onClose() }, 600)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 20, padding: 28, maxWidth: 560, width: '100%', boxShadow: '0 24px 80px rgba(0,0,0,.3)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <div style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: 16, color: '#1a1c5e' }}>{item.title}</div>
            <div style={{ fontFamily: 'DM Sans,sans-serif', fontSize: 12, color: '#9B9B9B', marginTop: 2 }}>
              {quem(item)} · {item.category_name} · recebida em {fmtBR(item.created_at)}{item.deadline ? ` · prazo ${fmtBR(item.deadline)}` : ''}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9B9B9B', fontSize: 20, lineHeight: 1 }}>✕</button>
        </div>
        {item.description && (
          <div style={{ background: 'rgba(46,49,146,.04)', border: '1px solid rgba(46,49,146,.1)', borderRadius: 10, padding: '12px 14px', marginBottom: 16, fontFamily: 'DM Sans,sans-serif', fontSize: 13, color: '#1a1c5e', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
            {item.description}
          </div>
        )}
        {decidida || encerrada ? (
          <div style={{ fontFamily: 'DM Sans,sans-serif', fontSize: 13, color: '#374151' }}>
            {item.price != null && <div style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: 16, color: '#1a1c5e' }}>{money(item.price)}</div>}
            {item.message && <div style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{item.message}</div>}
            <div style={{ marginTop: 12, fontSize: 12, color: '#9B9B9B' }}>
              {decidida ? `Decisão do ${quemDecide(item)}: ${rotulo(item)}.` : 'Prazo de resposta encerrado.'}
            </div>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 14 }}>
              <span style={lbl}>Sua proposta</span>
              <textarea value={message} onChange={e => setMessage(e.target.value)} rows={5} style={{ ...inp, resize: 'vertical' }}
                placeholder="Condições, escopo, prazo de entrega, validade da proposta..."/>
            </div>
            <div style={{ marginBottom: 18 }}>
              <span style={lbl}>Valor total (opcional)</span>
              <input value={price} onChange={e => setPrice(e.target.value)} placeholder="Ex.: 12.500,00" style={inp}/>
            </div>
            {error && <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: '#dc2626' }}>{error}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="neutral" full onClick={onClose}>Cancelar</Button>
              <Button variant="primary" full disabled={saving} onClick={save}>
                {saving ? <><Spinner size={14}/> Enviando...</> : (item.message || item.price != null ? '💾 Atualizar proposta' : '📤 Enviar proposta')}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export function DemoSupplierCotacoes() {
  const [items, setItems] = useState(DEMO_SUPPLIER_RFQ_INBOX)
  const [open, setOpen] = useState(null)
  const abrir = (item) => {
    // abrir uma cotação nova marca como lida ("Aguardando você")
    const it = item.status === 'SENT' ? { ...item, status: 'READ' } : item
    if (it !== item) setItems(p => p.map(x => (x.response_id === item.response_id ? it : x)))
    setOpen(it)
  }
  return (
    <div style={{ padding: '24px 32px', maxWidth: 900, margin: '0 auto' }}>
      <PageHeader title="Cotações recebidas" subtitle="Solicitações de cotação dos clientes que homologaram sua empresa e de compradores do marketplace"/>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map(it => {
          const st = STATUS[it.status] || STATUS.READ
          const respondida = it.message || it.price != null
          return (
            <Card key={it.response_id} hover onClick={() => abrir(it)} style={{ borderRadius: 12, padding: '16px 20px', cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 14, color: '#1a1c5e' }}>{it.title}</div>
                  <div style={{ fontFamily: 'DM Sans,sans-serif', fontSize: 12, color: '#9B9B9B', marginTop: 2 }}>
                    {quem(it)} · {it.category_name} · {fmtBR(it.created_at)}{it.deadline ? ` · prazo ${fmtBR(it.deadline)}` : ''}
                  </div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: st.color, background: `${st.color}18`, padding: '3px 10px', borderRadius: 20, fontFamily: 'Montserrat,sans-serif', whiteSpace: 'nowrap' }}>
                  {it.status === 'READ' && respondida ? 'Proposta enviada' : rotulo(it)}
                </span>
              </div>
            </Card>
          )
        })}
      </div>
      <div style={{ fontFamily: 'DM Sans,sans-serif', fontSize: 11.5, color: '#9B9B9B', marginTop: 12 }}>
        As cotações de clientes também chegam por e-mail. Depois da decisão (ou do prazo), a proposta fica só para consulta.
      </div>
      {open && <RespondModal item={open} onClose={() => setOpen(null)} onSaved={(novo) => setItems(p => p.map(x => (x.response_id === novo.response_id ? novo : x)))}/>}
    </div>
  )
}

// ══ COMPRADOR · Minhas Cotações ════════════════════════════════════════════
const RESP = {
  SENT:     { label: 'Não lida', color: '#9B9B9B' },
  READ:     { label: 'Lida', color: '#b45309' },
  PROPOSTA: { label: 'Proposta recebida', color: '#2E3192' },
  ACCEPTED: { label: '✓ Aceita', color: '#15803d' },
  DECLINED: { label: 'Recusada', color: '#9B9B9B' },
}

function Responses({ rfq, onChange, onProfile }) {
  const [recusar, setRecusar] = useState(null)
  const decidir = (r, status) => { onChange(rfq.id, r.id, status); setRecusar(null) }
  return (
    <div style={{ marginTop: 12, borderTop: '1px solid #f0f0f7' }}>
      {rfq.responses.map(r => {
        const temProposta = r.message || r.price != null
        const decidida = r.status === 'ACCEPTED' || r.status === 'DECLINED'
        const st = decidida ? RESP[r.status] : temProposta ? RESP.PROPOSTA : (RESP[r.status] || RESP.READ)
        return (
          <div key={r.id} style={{ padding: '12px 0', borderBottom: '1px solid #f3f4f6' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 13, color: '#1a1c5e' }}>{r.razao_social}</div>
                <div style={{ fontFamily: 'DM Sans,sans-serif', fontSize: 12, color: '#9B9B9B' }}>
                  {[r.city, r.state].filter(Boolean).join(' / ')}{temProposta && r.updated_at ? ` · respondida em ${fmtBR(r.updated_at)}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: st.color, background: `${st.color}18`, padding: '3px 10px', borderRadius: 20, fontFamily: 'Montserrat,sans-serif', whiteSpace: 'nowrap' }}>{st.label}</span>
                <Button variant="neutral" size="sm" onClick={() => onProfile(r.supplier_id)}>Ver perfil</Button>
              </div>
            </div>
            {temProposta && (
              <div style={{ marginTop: 8, background: 'rgba(46,49,146,.04)', border: '1px solid rgba(46,49,146,.1)', borderRadius: 10, padding: '10px 14px', fontFamily: 'DM Sans,sans-serif', fontSize: 13, color: '#1a1c5e' }}>
                {r.price != null && <div style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: 15 }}>{money(r.price)}</div>}
                {r.message && <div style={{ marginTop: r.price != null ? 4 : 0, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{r.message}</div>}
                {!decidida && (recusar === r.id ? (
                  <InlineConfirm msg={`Recusar a proposta de ${r.razao_social}? O fornecedor vê a decisão na caixa de cotações dele.`}
                    confirmLabel="✕ Recusar" variant="danger" onCancel={() => setRecusar(null)} onConfirm={() => decidir(r, 'DECLINED')}/>
                ) : (
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <Button variant="success" size="sm" onClick={() => decidir(r, 'ACCEPTED')}>✓ Aceitar</Button>
                    <Button variant="neutral" size="sm" onClick={() => setRecusar(r.id)}>✕ Recusar</Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export function DemoBuyerCotacoes({ navigate }) {
  const [rfqs, setRfqs] = useState(buyerStore.rfqs)
  const [open, setOpen] = useState(rfqs[0]?.id || null)
  const onChange = (rfqId, respId, status) => {
    const next = rfqs.map(q => (q.id !== rfqId ? q : { ...q, responses: q.responses.map(x => (x.id === respId ? { ...x, status } : x)) }))
    buyerStore.rfqs = next; setRfqs(next)
  }
  return (
    <div style={{ padding: '28px 32px', maxWidth: 960, margin: '0 auto' }}>
      <PageHeader title="Minhas Cotações" subtitle={`${rfqs.length} solicitaç${rfqs.length !== 1 ? 'ões' : 'ão'}`}/>
      {rfqs.length === 0 ? (
        <EmptyState icon="📝" title="Nenhuma cotação" subtitle="No Marketplace, selecione fornecedores e clique em Cotação para solicitar propostas."/>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rfqs.map(rfq => {
            const propostas = rfq.responses.filter(r => r.message || r.price != null).length
            const lidas = rfq.responses.filter(r => r.status !== 'SENT').length
            return (
              <Card key={rfq.id} style={{ borderRadius: 14, padding: '16px 20px' }}>
                <div onClick={() => setOpen(o => (o === rfq.id ? null : rfq.id))} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 14, color: '#1a1c5e' }}>{rfq.title || `Cotação #${rfq.id}`}</div>
                    <div style={{ fontSize: 13, color: '#9B9B9B', marginTop: 2 }}>
                      {fmtBR(rfq.created_at)} · {rfq.responses.length} fornecedor{rfq.responses.length !== 1 ? 'es' : ''} · {lidas} leram{rfq.deadline ? ` · prazo ${fmtBR(rfq.deadline)}` : ''}
                    </div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: propostas ? '#15803d' : '#2E3192', background: propostas ? '#15803d18' : '#2E319218', padding: '4px 12px', borderRadius: 20, fontFamily: 'Montserrat,sans-serif', whiteSpace: 'nowrap' }}>
                    {propostas ? `${propostas} proposta${propostas !== 1 ? 's' : ''}` : 'Aguardando propostas'} {open === rfq.id ? '▲' : '▼'}
                  </span>
                </div>
                {open === rfq.id && (<>
                  {rfq.description && <div style={{ marginTop: 12, fontFamily: 'DM Sans,sans-serif', fontSize: 13, color: '#374151', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{rfq.description}</div>}
                  <Responses rfq={rfq} onChange={onChange} onProfile={(id) => navigate('perfil', { supplierId: id })}/>
                </>)}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ══ MARKETPLACE · modal "📝 Solicitar Cotação" (Comprador Pro) ═════════════
export function BuyerRFQModal({ suppliers, onClose, onOpenList }) {
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [deadline, setDeadline] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(0)
  const i2 = { ...inp, fontSize: 14, padding: '10px 14px', color: '#1a1c5e', marginBottom: 12 }
  const l2 = { fontSize: 11, fontWeight: 700, color: '#9B9B9B', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }
  const send = () => {
    if (!message.trim()) { setError('Descreva o que você precisa.'); return }
    setSending(true); setError('')
    setTimeout(() => {
      const id = `b${Date.now()}`
      buyerStore.rfqs = [{ id, title: title.trim() || 'Cotação', created_at: isoD(0), deadline: deadline || null, description: message.trim(),
        responses: suppliers.map(s => ({ id: `${id}-${s.id}`, supplier_id: s.id, razao_social: s.razao_social, city: s.city, state: s.state, status: 'SENT', message: '', price: null })) }, ...buyerStore.rfqs]
      setSending(false); setSent(suppliers.length)
    }, 700)
  }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 20, padding: 28, width: '100%', maxWidth: 480, boxShadow: '0 20px 60px rgba(0,0,0,.2)', maxHeight: '92vh', overflowY: 'auto' }}>
        {sent ? (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{ fontSize: 46, marginBottom: 8 }}>📤</div>
            <div style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: 18, color: '#15803d', marginBottom: 6 }}>Cotação enviada para {sent} fornecedor{sent !== 1 ? 'es' : ''}!</div>
            <div style={{ fontFamily: 'DM Sans,sans-serif', fontSize: 13, color: '#64748b', marginBottom: 18 }}>Acompanhar as respostas agora?</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <Button variant="neutral" full onClick={onClose}>Agora não</Button>
              <Button variant="primary" full onClick={onOpenList}>💬 Abrir Minhas Cotações</Button>
            </div>
          </div>
        ) : (<>
          <div style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: 18, color: '#1a1c5e', marginBottom: 6 }}>📝 Solicitar Cotação</div>
          <div style={{ fontSize: 13, color: '#9B9B9B', marginBottom: 12, fontFamily: 'DM Sans,sans-serif' }}>
            Para <strong style={{ color: '#2E3192' }}>{suppliers.length} fornecedor{suppliers.length !== 1 ? 'es' : ''}</strong> selecionado{suppliers.length !== 1 ? 's' : ''}.
            {' '}Cada um recebe a solicitação na área de cotações e as propostas aparecem em <strong>Cotações</strong>.
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
            {suppliers.map(s => <span key={s.id} style={{ fontSize: 11, fontFamily: 'DM Sans,sans-serif', background: '#EEF0FF', color: '#2E3192', padding: '3px 9px', borderRadius: 20 }}>{s.razao_social}</span>)}
          </div>
          <div style={l2}>Assunto</div>
          <input value={title} onChange={e => setTitle(e.target.value)} maxLength={200} placeholder="Ex: Serviço de manutenção elétrica" style={i2}/>
          <div style={l2}>Mensagem *</div>
          <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Descreva o que precisa, prazo, volume, local..." rows={5} style={{ ...i2, resize: 'vertical' }}/>
          <div style={l2}>Prazo para resposta (opcional)</div>
          <input type="date" value={deadline} min={isoD(0)} onChange={e => setDeadline(e.target.value)} style={i2}/>
          {error && <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: '#dc2626' }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <Button variant="neutral" style={{ flex: 1 }} onClick={onClose}>Cancelar</Button>
            <Button variant="primary" style={{ flex: 1 }} onClick={send} disabled={sending}>{sending ? '⏳ Enviando...' : '📨 Enviar'}</Button>
          </div>
        </>)}
      </div>
    </div>
  )
}
