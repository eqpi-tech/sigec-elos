import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext.jsx'
import { supabase } from '../../lib/supabase.js'
import { clientRfqApi } from '../../services/api.js'
import { Card, Spinner, Button, SectionTitle, PageHeader } from '../../components/ui.jsx'

const STATUS_COLOR = { SENT:'#9B9B9B', ACCEPTED:'#22c55e', DECLINED:'#ef4444', READ:'#f59e0b' }
const STATUS_LABEL = { SENT:'Enviada', ACCEPTED:'Aceita', DECLINED:'Recusada', READ:'Visualizada' }

function NewRFQModal({ clientId, onClose, onCreated }) {
  const [categories, setCategories] = useState([])
  const [form, setForm] = useState({ title:'', description:'', categoryId:'', deadline:'' })
  const [eligibleCount, setEligibleCount] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  useEffect(() => {
    supabase.from('categories').select('id, name').order('name').then(({ data }) => setCategories(data || []))
  }, [])

  useEffect(() => {
    if (!form.categoryId) { setEligibleCount(null); return }
    clientRfqApi.getEligibleCount(Number(form.categoryId)).then(setEligibleCount)
  }, [form.categoryId])

  async function submit() {
    if (!form.title.trim() || !form.categoryId) { setError('Preencha o título e a categoria.'); return }
    setSaving(true); setError('')
    try {
      const rfq = await clientRfqApi.create({
        clientId,
        title: form.title.trim(),
        description: form.description.trim(),
        categoryId: Number(form.categoryId),
        deadline: form.deadline || null,
      })
      onCreated(rfq)
      onClose()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  const inp = { width:'100%', padding:'10px 12px', borderRadius:10, border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:13, boxSizing:'border-box', outline:'none' }
  const lbl = { display:'block', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:10, color:'#9B9B9B', letterSpacing:.5, textTransform:'uppercase', marginBottom:5 }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:16 }}>
      <div style={{ background:'#fff', borderRadius:20, padding:28, maxWidth:520, width:'100%', boxShadow:'0 24px 80px rgba(0,0,0,.3)', maxHeight:'90vh', overflowY:'auto' }}>
        <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:18, color:'#1a1c5e', marginBottom:20 }}>Nova Solicitação de Cotação</div>

        <div style={{ marginBottom:14 }}>
          <span style={lbl}>Título</span>
          <input value={form.title} onChange={e => setForm(p => ({...p, title:e.target.value}))} placeholder="Ex: Fornecimento de EPI" style={inp}/>
        </div>

        <div style={{ marginBottom:14 }}>
          <span style={lbl}>Categoria</span>
          <select value={form.categoryId} onChange={e => setForm(p => ({...p, categoryId:e.target.value}))} style={inp}>
            <option value="">Selecione uma categoria...</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {eligibleCount !== null && (
            <div style={{ fontSize:11, color: eligibleCount > 0 ? '#22c55e' : '#f59e0b', fontFamily:'DM Sans,sans-serif', marginTop:4 }}>
              {eligibleCount > 0
                ? `✓ ${eligibleCount} fornecedor${eligibleCount !== 1 ? 'es' : ''} homologado${eligibleCount !== 1 ? 's' : ''} nesta categoria receberão a solicitação`
                : '⚠ Nenhum fornecedor homologado nesta categoria no momento'}
            </div>
          )}
        </div>

        <div style={{ marginBottom:14 }}>
          <span style={lbl}>Descrição</span>
          <textarea value={form.description} onChange={e => setForm(p => ({...p, description:e.target.value}))}
            placeholder="Descreva o produto ou serviço que deseja cotar, especificações, volumes estimados..."
            rows={4} style={{ ...inp, resize:'vertical' }}/>
        </div>

        <div style={{ marginBottom:20 }}>
          <span style={lbl}>Prazo para resposta (opcional)</span>
          <input type="date" value={form.deadline} onChange={e => setForm(p => ({...p, deadline:e.target.value}))} style={inp}/>
        </div>

        {error && <div style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:10, padding:'10px 14px', marginBottom:12, fontSize:13, color:'#dc2626' }}>{error}</div>}

        <div style={{ display:'flex', gap:8 }}>
          <Button variant="neutral" full onClick={onClose}>Cancelar</Button>
          <Button variant="primary" full disabled={saving || !form.title || !form.categoryId} onClick={submit}>
            {saving ? <><Spinner size={14}/> Enviando...</> : `📤 Enviar para ${eligibleCount ?? '...'} fornecedores`}
          </Button>
        </div>
      </div>
    </div>
  )
}

function RFQDetailModal({ rfq, onClose }) {
  const [responses, setResponses]   = useState([])
  const [loading,   setLoading]     = useState(true)
  const [updating,  setUpdating]    = useState(null)

  useEffect(() => {
    clientRfqApi.getResponses(rfq.id).then(r => { setResponses(r); setLoading(false) })
  }, [rfq.id])

  async function updateStatus(responseId, status) {
    setUpdating(responseId)
    try {
      await clientRfqApi.updateResponseStatus(responseId, status)
      setResponses(prev => prev.map(r => r.id === responseId ? { ...r, status } : r))
    } catch (e) { alert(e.message) }
    finally { setUpdating(null) }
  }

  const respondidas = responses.filter(r => r.message || r.price).length

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:16 }}>
      <div style={{ background:'#fff', borderRadius:20, padding:28, maxWidth:640, width:'100%', boxShadow:'0 24px 80px rgba(0,0,0,.3)', maxHeight:'90vh', overflowY:'auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
          <div>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:16, color:'#1a1c5e' }}>{rfq.title}</div>
            <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:12, color:'#9B9B9B', marginTop:2 }}>
              {rfq.categories?.name} · Criado em {rfq.created_at?.slice(0,10)}
              {rfq.deadline ? ` · Prazo: ${rfq.deadline.slice(0,10)}` : ''}
            </div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#9B9B9B', fontSize:20, lineHeight:1 }}>✕</button>
        </div>

        {rfq.description && (
          <div style={{ background:'rgba(46,49,146,.04)', border:'1px solid rgba(46,49,146,.1)', borderRadius:10, padding:'12px 14px', marginBottom:16, fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#1a1c5e', lineHeight:1.5 }}>
            {rfq.description}
          </div>
        )}

        <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:12, color:'#9B9B9B', letterSpacing:.5, textTransform:'uppercase', marginBottom:10 }}>
          {loading ? 'Carregando...' : `${respondidas} de ${responses.length} fornecedores responderam`}
        </div>

        {loading ? (
          <div style={{ display:'flex', justifyContent:'center', padding:32 }}><Spinner size={28}/></div>
        ) : responses.length === 0 ? (
          <div style={{ textAlign:'center', padding:32, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', fontSize:13 }}>Nenhuma resposta ainda.</div>
        ) : (
          responses.map(r => (
            <div key={r.id} style={{ padding:'14px 16px', borderRadius:12, border:`1px solid ${r.message||r.price ? '#e2e4ef' : '#f4f5f9'}`, background: r.message||r.price ? '#fff' : '#fafbff', marginBottom:8 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: (r.message||r.price) ? 10 : 0 }}>
                <div>
                  <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, fontWeight:700, color:'#1a1c5e' }}>
                    {r.suppliers?.razao_social || '—'}
                  </div>
                  <div style={{ fontSize:11, color:'#9B9B9B' }}>{r.suppliers?.cnpj} · {r.suppliers?.city}/{r.suppliers?.state}</div>
                </div>
                <span style={{ fontSize:11, fontWeight:700, color: STATUS_COLOR[r.status], background:`${STATUS_COLOR[r.status]}18`, padding:'3px 10px', borderRadius:20, fontFamily:'Montserrat,sans-serif' }}>
                  {STATUS_LABEL[r.status] || r.status}
                </span>
              </div>
              {(r.message || r.price) && (
                <div style={{ borderTop:'1px solid #f4f5f9', paddingTop:10 }}>
                  {r.price && (
                    <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:16, color:'#1a1c5e', marginBottom:4 }}>
                      R$ {Number(r.price).toLocaleString('pt-BR', {minimumFractionDigits:2})}
                    </div>
                  )}
                  {r.message && (
                    <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#374151', lineHeight:1.5, marginBottom:10 }}>{r.message}</div>
                  )}
                  {r.status === 'SENT' || r.status === 'READ' ? (
                    <div style={{ display:'flex', gap:6 }}>
                      {updating === r.id ? <Spinner size={16}/> : (
                        <>
                          <Button variant="success" size="sm" onClick={() => updateStatus(r.id, 'ACCEPTED')}>✓ Aceitar</Button>
                          <Button variant="danger"  size="sm" onClick={() => updateStatus(r.id, 'DECLINED')}>✕ Recusar</Button>
                        </>
                      )}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default function ClientRFQ() {
  const { user } = useAuth()
  const [rfqs,        setRfqs]        = useState([])
  const [loading,     setLoading]     = useState(true)
  const [showNew,     setShowNew]     = useState(false)
  const [detailRfq,   setDetailRfq]   = useState(null)

  useEffect(() => {
    if (!user?.clientId) return
    clientRfqApi.list(user.clientId).then(r => { setRfqs(r); setLoading(false) })
  }, [user?.clientId])

  return (
    <div style={{ padding:'24px 32px', maxWidth:900, margin:'0 auto' }}>
      <PageHeader title="Solicitações de Cotação (RFQ)"
        subtitle="Envie cotações para todos os fornecedores homologados em uma categoria"
        action={<Button variant="primary" onClick={() => setShowNew(true)}>+ Nova Cotação</Button>}
      />

      {loading ? (
        <div style={{ display:'flex', justifyContent:'center', padding:60 }}><Spinner size={40}/></div>
      ) : rfqs.length === 0 ? (
        <Card style={{ borderRadius:14, padding:'48px', textAlign:'center' }}>
          <div style={{ fontSize:40, marginBottom:12 }}>📋</div>
          <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:16, color:'#1a1c5e', marginBottom:6 }}>Nenhuma cotação enviada ainda</div>
          <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#9B9B9B', marginBottom:20 }}>
            Crie uma solicitação de cotação e ela será enviada automaticamente para todos os fornecedores homologados na categoria escolhida.
          </div>
          <Button variant="primary" onClick={() => setShowNew(true)}>+ Criar primeira cotação</Button>
        </Card>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {rfqs.map(rfq => (
            <Card key={rfq.id} style={{ borderRadius:12, padding:'16px 20px', cursor:'pointer', transition:'box-shadow .15s' }}
              hover onClick={() => setDetailRfq(rfq)}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:14, color:'#1a1c5e' }}>{rfq.title}</div>
                  <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:12, color:'#9B9B9B', marginTop:2 }}>
                    {rfq.categories?.name} · {rfq.created_at?.slice(0,10)}
                    {rfq.deadline ? ` · Prazo: ${rfq.deadline.slice(0,10)}` : ''}
                  </div>
                  {rfq.description && (
                    <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:12, color:'#64748b', marginTop:4, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:400 }}>
                      {rfq.description}
                    </div>
                  )}
                </div>
                <div style={{ textAlign:'right', flexShrink:0 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:'#2E3192', fontFamily:'Montserrat,sans-serif' }}>Ver respostas →</div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {showNew && (
        <NewRFQModal
          clientId={user?.clientId}
          onClose={() => setShowNew(false)}
          onCreated={rfq => setRfqs(prev => [rfq, ...prev])}
        />
      )}
      {detailRfq && <RFQDetailModal rfq={detailRfq} onClose={() => setDetailRfq(null)}/>}
    </div>
  )
}
