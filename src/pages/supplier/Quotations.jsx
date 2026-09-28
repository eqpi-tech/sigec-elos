// Cotações recebidas (RFQ de clientes — patch_102). O fornecedor lê a
// solicitação, envia proposta (texto e/ou valor) e acompanha a decisão do
// cliente (aceita/recusada). Dados via RPCs supplier_rfq_*.
import { useState, useEffect } from 'react'
import { supplierRfqApi } from '../../services/api.js'
import { parseMoneyBR } from '../../lib/money.js'
import { Card, Spinner, Button, PageHeader } from '../../components/ui.jsx'

const STATUS = {
  SENT:     { label:'Nova',              color:'#2E3192' },
  READ:     { label:'Aguardando você',   color:'#b45309' },
  ACCEPTED: { label:'Aceita pelo cliente', color:'#15803d' },
  DECLINED: { label:'Não selecionada',   color:'#9B9B9B' },
}
const fmt = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '')
const money = (v) => Number(v).toLocaleString('pt-BR', { style:'currency', currency:'BRL' })

function RespondModal({ item, onClose, onSaved }) {
  const [message, setMessage] = useState(item.message || '')
  const [price, setPrice]     = useState(item.price != null ? String(item.price).replace('.', ',') : '')
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const encerrada = item.deadline && new Date(item.deadline) < new Date(Date.now() - 864e5)
  const decidida  = ['ACCEPTED', 'DECLINED'].includes(item.status)

  async function save() {
    const valor = price.trim() ? parseMoneyBR(price) : null
    if (price.trim() && (valor == null || isNaN(valor) || valor < 0)) { setError('Valor inválido — use o formato 1.234,56'); return }
    if (!message.trim() && valor == null) { setError('Escreva a proposta ou informe o valor.'); return }
    setSaving(true); setError('')
    try { await supplierRfqApi.respond(item.response_id, message.trim(), valor); onSaved(); onClose() }
    catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  const inp = { width:'100%', padding:'10px 12px', borderRadius:10, border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:13, boxSizing:'border-box', outline:'none' }
  const lbl = { display:'block', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:10, color:'#9B9B9B', letterSpacing:.5, textTransform:'uppercase', marginBottom:5 }
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:16 }}>
      <div style={{ background:'#fff', borderRadius:20, padding:28, maxWidth:560, width:'100%', boxShadow:'0 24px 80px rgba(0,0,0,.3)', maxHeight:'90vh', overflowY:'auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14 }}>
          <div>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:16, color:'#1a1c5e' }}>{item.title}</div>
            <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:12, color:'#9B9B9B', marginTop:2 }}>
              {item.client_name} · {item.category_name} · recebida em {fmt(item.created_at)}{item.deadline ? ` · prazo ${fmt(item.deadline)}` : ''}
            </div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#9B9B9B', fontSize:20, lineHeight:1 }}>✕</button>
        </div>
        {item.description && (
          <div style={{ background:'rgba(46,49,146,.04)', border:'1px solid rgba(46,49,146,.1)', borderRadius:10, padding:'12px 14px', marginBottom:16, fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#1a1c5e', lineHeight:1.5, whiteSpace:'pre-wrap' }}>
            {item.description}
          </div>
        )}
        {decidida || encerrada ? (
          <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#374151' }}>
            {item.price != null && <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:16, color:'#1a1c5e' }}>{money(item.price)}</div>}
            {item.message && <div style={{ marginTop:6, whiteSpace:'pre-wrap' }}>{item.message}</div>}
            <div style={{ marginTop:12, fontSize:12, color:'#9B9B9B' }}>
              {decidida ? `Decisão do cliente: ${STATUS[item.status].label}.` : 'Prazo de resposta encerrado.'}
            </div>
          </div>
        ) : (
          <>
            <div style={{ marginBottom:14 }}>
              <span style={lbl}>Sua proposta</span>
              <textarea value={message} onChange={e => setMessage(e.target.value)} rows={5} style={{ ...inp, resize:'vertical' }}
                placeholder="Condições, escopo, prazo de entrega, validade da proposta..."/>
            </div>
            <div style={{ marginBottom:18 }}>
              <span style={lbl}>Valor total (opcional)</span>
              <input value={price} onChange={e => setPrice(e.target.value)} placeholder="Ex.: 12.500,00" style={inp}/>
            </div>
            {error && <div style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:10, padding:'10px 14px', marginBottom:12, fontSize:13, color:'#dc2626' }}>{error}</div>}
            <div style={{ display:'flex', gap:8 }}>
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

export default function SupplierQuotations() {
  const [items, setItems]     = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [open, setOpen]       = useState(null)

  const load = () => supplierRfqApi.inbox()
    .then(r => { setItems(r); setError('') })
    .catch(e => setError(e.message))
    .finally(() => setLoading(false))
  useEffect(() => { load() }, [])

  async function abrir(item) {
    setOpen(item)
    if (item.status === 'SENT') {
      await supplierRfqApi.markRead(item.response_id)
      setItems(p => p.map(x => x.response_id === item.response_id ? { ...x, status:'READ' } : x))
    }
  }

  return (
    <div style={{ padding:'24px 32px', maxWidth:900, margin:'0 auto' }}>
      <PageHeader title="Cotações recebidas" subtitle="Solicitações de cotação dos clientes que homologaram sua empresa"/>
      {loading ? (
        <div style={{ display:'flex', justifyContent:'center', padding:60 }}><Spinner size={40}/></div>
      ) : error ? (
        <Card style={{ borderRadius:14, padding:24, color:'#dc2626', fontFamily:'DM Sans,sans-serif', fontSize:13 }}>{error}</Card>
      ) : items.length === 0 ? (
        <Card style={{ borderRadius:14, padding:'48px', textAlign:'center' }}>
          <div style={{ fontSize:40, marginBottom:12 }}>💬</div>
          <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:16, color:'#1a1c5e', marginBottom:6 }}>Nenhuma cotação recebida ainda</div>
          <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#9B9B9B' }}>
            Quando um cliente enviar uma solicitação de cotação para a sua categoria, ela aparece aqui e você recebe um e-mail.
          </div>
        </Card>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {items.map(it => {
            const st = STATUS[it.status] || STATUS.READ
            const respondida = it.message || it.price != null
            return (
              <Card key={it.response_id} hover onClick={() => abrir(it)} style={{ borderRadius:12, padding:'16px 20px', cursor:'pointer' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12 }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:14, color:'#1a1c5e' }}>{it.title}</div>
                    <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:12, color:'#9B9B9B', marginTop:2 }}>
                      {it.client_name} · {it.category_name} · {fmt(it.created_at)}{it.deadline ? ` · prazo ${fmt(it.deadline)}` : ''}
                    </div>
                  </div>
                  <span style={{ fontSize:11, fontWeight:700, color:st.color, background:`${st.color}18`, padding:'3px 10px', borderRadius:20, fontFamily:'Montserrat,sans-serif', whiteSpace:'nowrap' }}>
                    {it.status === 'READ' && respondida ? 'Proposta enviada' : st.label}
                  </span>
                </div>
              </Card>
            )
          })}
        </div>
      )}
      {open && <RespondModal item={open} onClose={() => setOpen(null)} onSaved={load}/>}
    </div>
  )
}
