// Cotações do comprador (patch_131). O Comprador Pro envia a cotação pelo
// marketplace (fornecedores selecionados); aqui acompanha quem leu e as
// propostas recebidas. Dados via RPCs buyer_rfq_list / buyer_rfq_responses.
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { rfqApi } from '../../services/api.js'
import { Card, Spinner, PageHeader, EmptyState, Button } from '../../components/ui.jsx'

// status da resposta de cada fornecedor (rfq_responses)
const RESP = {
  SENT:     { label:'Não lida',  color:'#9B9B9B' },
  READ:     { label:'Lida',      color:'#b45309' },
  PROPOSTA: { label:'Proposta recebida', color:'#2E3192' },
  ACCEPTED: { label:'✓ Aceita', color:'#15803d' },
  DECLINED: { label:'Recusada', color:'#9B9B9B' },
}
const fmt   = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '')
const money = (v) => Number(v).toLocaleString('pt-BR', { style:'currency', currency:'BRL' })

function Responses({ rfqId, onProfile }) {
  const [items, setItems]     = useState(null)
  const [error, setError]     = useState('')
  const [acting, setActing]   = useState(null)
  useEffect(() => { rfqApi.responses(rfqId).then(setItems).catch(e => setError(e.message)) }, [rfqId])
  // aceitar / recusar a proposta (patch_133) — o fornecedor vê a decisão na caixa dele
  const decidir = async (r, status) => {
    if (status === 'DECLINED' && !confirm(`Recusar a proposta de ${r.razao_social}?`)) return
    setActing(r.id); setError('')
    try { await rfqApi.decide(r.id, status); setItems(prev => prev.map(x => x.id === r.id ? { ...x, status } : x)) }
    catch (e) { setError(e.message) }
    setActing(null)
  }
  if (error) return <div style={{ padding:'12px 0', color:'#dc2626', fontSize:13 }}>{error}</div>
  if (!items) return <div style={{ display:'flex', justifyContent:'center', padding:16 }}><Spinner size={24}/></div>
  return (
    <div style={{ marginTop:12, borderTop:'1px solid #f0f0f7' }}>
      {items.map(r => {
        const temProposta = r.message || r.price != null
        const decidida = r.status === 'ACCEPTED' || r.status === 'DECLINED'
        const st = decidida ? RESP[r.status] : temProposta ? RESP.PROPOSTA : (RESP[r.status] || RESP.READ)
        return (
          <div key={r.id} style={{ padding:'12px 0', borderBottom:'1px solid #f3f4f6' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:10 }}>
              <div style={{ minWidth:0 }}>
                <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, color:'#1a1c5e' }}>{r.razao_social}</div>
                <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:12, color:'#9B9B9B' }}>
                  {[r.city, r.state].filter(Boolean).join(' / ')}{temProposta && r.updated_at ? ` · respondida em ${fmt(r.updated_at)}` : ''}
                </div>
              </div>
              <div style={{ display:'flex', gap:8, alignItems:'center', flexShrink:0 }}>
                <span style={{ fontSize:11, fontWeight:700, color:st.color, background:`${st.color}18`, padding:'3px 10px', borderRadius:20, fontFamily:'Montserrat,sans-serif', whiteSpace:'nowrap' }}>{st.label}</span>
                <Button variant="neutral" size="sm" onClick={() => onProfile(r.supplier_id)}>Ver perfil</Button>
              </div>
            </div>
            {temProposta && (
              <div style={{ marginTop:8, background:'rgba(46,49,146,.04)', border:'1px solid rgba(46,49,146,.1)', borderRadius:10, padding:'10px 14px', fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#1a1c5e' }}>
                {r.price != null && <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:15 }}>{money(r.price)}</div>}
                {r.message && <div style={{ marginTop: r.price != null ? 4 : 0, whiteSpace:'pre-wrap', lineHeight:1.5 }}>{r.message}</div>}
                {!decidida && (
                  <div style={{ display:'flex', gap:8, marginTop:10 }}>
                    <Button variant="success" size="sm" disabled={acting === r.id} onClick={() => decidir(r, 'ACCEPTED')}>✓ Aceitar</Button>
                    <Button variant="neutral" size="sm" disabled={acting === r.id} onClick={() => decidir(r, 'DECLINED')}>✕ Recusar</Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function BuyerQuotations() {
  const { user }  = useAuth()
  const navigate  = useNavigate()
  const [rfqs, setRfqs]       = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [open, setOpen]       = useState(null)   // id da cotação expandida
  const isPro = user?.buyerPlan === 'pro'

  useEffect(() => {
    rfqApi.list().then(setRfqs).catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [user.id])

  if (loading) return <div style={{ display:'flex',justifyContent:'center',alignItems:'center',height:'50vh' }}><Spinner size={48}/></div>
  return (
    <div style={{ padding:'28px 32px',maxWidth:960,margin:'0 auto' }}>
      <PageHeader title="Minhas Cotações" subtitle={`${rfqs.length} solicitaç${rfqs.length !== 1 ? 'ões' : 'ão'}`} />
      {!isPro && (
        <Card style={{ borderRadius:14, padding:'16px 20px', marginBottom:16, border:'2px dashed #F47E2F', background:'rgba(244,126,47,.04)' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, flexWrap:'wrap' }}>
            <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#1a1c5e' }}>
              🔒 Enviar cotações para fornecedores é um recurso do plano <strong>Comprador Pro</strong>.
            </div>
            <Button variant="orange" size="sm" onClick={() => navigate('/comprador/plano')}>Conhecer o Pro →</Button>
          </div>
        </Card>
      )}
      {error ? (
        <Card style={{ borderRadius:14, padding:24, color:'#dc2626', fontFamily:'DM Sans,sans-serif', fontSize:13 }}>{error}</Card>
      ) : rfqs.length===0 ? (
        <EmptyState icon="📝" title="Nenhuma cotação" subtitle="No Marketplace, selecione fornecedores e clique em Cotação para solicitar propostas." />
      ) : (
        <div style={{ display:'flex',flexDirection:'column',gap:12 }}>
          {rfqs.map(rfq => (
            <Card key={rfq.id} style={{ borderRadius:14,padding:'16px 20px' }}>
              <div onClick={() => setOpen(o => o === rfq.id ? null : rfq.id)}
                style={{ display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,cursor:'pointer' }}>
                <div style={{ minWidth:0 }}>
                  <div style={{ fontFamily:'Montserrat,sans-serif',fontWeight:700,fontSize:14,color:'#1a1c5e' }}>{rfq.title || `Cotação #${rfq.id?.slice(-6)}`}</div>
                  <div style={{ fontSize:13,color:'#9B9B9B',marginTop:2 }}>
                    {fmt(rfq.created_at)} · {rfq.fornecedores} fornecedor{rfq.fornecedores !== 1 ? 'es' : ''} · {rfq.lidas} leram
                    {rfq.deadline ? ` · prazo ${fmt(rfq.deadline)}` : ''}
                  </div>
                </div>
                <span style={{ fontSize:11,fontWeight:700,color:rfq.propostas ? '#15803d' : '#2E3192',background:rfq.propostas ? '#15803d18' : '#2E319218',padding:'4px 12px',borderRadius:20,fontFamily:'Montserrat,sans-serif',whiteSpace:'nowrap' }}>
                  {rfq.propostas ? `${rfq.propostas} proposta${rfq.propostas !== 1 ? 's' : ''}` : 'Aguardando propostas'} {open === rfq.id ? '▲' : '▼'}
                </span>
              </div>
              {open === rfq.id && (
                <>
                  {rfq.description && (
                    <div style={{ marginTop:12, fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#374151', whiteSpace:'pre-wrap', lineHeight:1.5 }}>{rfq.description}</div>
                  )}
                  <Responses rfqId={rfq.id} onProfile={(id) => navigate(`/comprador/fornecedor/${id}`)}/>
                </>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
