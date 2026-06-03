import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminApi, documentApi } from '../../services/api.js'
import { supabase } from '../../lib/supabase.js'
import { Card, Spinner, Button, StatusDot, SectionTitle, PageHeader } from '../../components/ui.jsx'

const STATUS_OPTIONS = [
  { value: 'todos',    label: 'Todos os status' },
  { value: 'pendente', label: 'Pendente (aguardando envio)' },
  { value: 'analise',  label: 'Em análise (PENDING)' },
  { value: 'vencido',  label: 'Vencido' },
  { value: 'hoje',     label: 'Vence hoje' },
  { value: '5dias',    label: 'Próximos 5 dias' },
  { value: 'VALID',    label: 'Aprovado' },
  { value: 'REJECTED', label: 'Rejeitado' },
]

const SORT_OPTIONS = [
  { value: 'expires_asc',  label: 'Vencimento ↑' },
  { value: 'expires_desc', label: 'Vencimento ↓' },
  { value: 'status',       label: 'Status' },
  { value: 'recent',       label: 'Mais recente' },
]

const STATUS_COLOR = { VALID:'#22c55e', PENDING:'#f59e0b', MISSING:'#9B9B9B', REJECTED:'#ef4444', EXPIRED:'#ef4444', EXPIRING:'#f59e0b' }
const STATUS_LABEL = { VALID:'Aprovado', PENDING:'Em análise', MISSING:'Não enviado', REJECTED:'Rejeitado', EXPIRED:'Vencido', EXPIRING:'Vence em breve' }

// Modal de rejeição com motivos parametrizados
function RejectModal({ doc, reasons, onConfirm, onClose }) {
  const [reasonCode, setReasonCode] = useState('')
  const [customNote, setCustomNote]  = useState('')
  const [saving, setSaving]          = useState(false)

  const selectedReason = reasons.find(r => r.code === reasonCode)
  const finalNote = reasonCode === 'OUTRO' ? customNote : (selectedReason?.label || '')

  async function confirm() {
    if (!reasonCode) return
    setSaving(true)
    await onConfirm(doc.id, finalNote || 'Rejeitado pelo backoffice')
    setSaving(false)
    onClose()
  }

  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:16 }}>
      <div style={{ background:'#fff',borderRadius:16,padding:24,maxWidth:460,width:'100%',boxShadow:'0 24px 60px rgba(0,0,0,.3)' }}>
        <div style={{ fontFamily:'Montserrat,sans-serif',fontWeight:800,fontSize:16,color:'#dc2626',marginBottom:4 }}>Rejeitar Documento</div>
        <div style={{ fontFamily:'DM Sans,sans-serif',fontSize:13,color:'#64748b',marginBottom:16 }}>
          {doc.label} · {doc.suppliers?.razao_social}
        </div>

        <div style={{ fontFamily:'Montserrat,sans-serif',fontWeight:700,fontSize:11,color:'#9B9B9B',textTransform:'uppercase',letterSpacing:.5,marginBottom:6 }}>Motivo</div>
        <select value={reasonCode} onChange={e => setReasonCode(e.target.value)}
          style={{ width:'100%',padding:'10px 12px',borderRadius:10,border:'1px solid #e2e4ef',fontFamily:'DM Sans,sans-serif',fontSize:13,color:'#1a1c5e',marginBottom:12,boxSizing:'border-box' }}>
          <option value="">Selecione um motivo...</option>
          {reasons.filter(r => r.applies_to !== 'seal').map(r => (
            <option key={r.code} value={r.code}>{r.label}</option>
          ))}
        </select>

        {reasonCode === 'OUTRO' && (
          <textarea value={customNote} onChange={e => setCustomNote(e.target.value)}
            placeholder="Descreva o motivo..."
            rows={3}
            style={{ width:'100%',padding:'10px 12px',borderRadius:10,border:'1px solid #e2e4ef',fontFamily:'DM Sans,sans-serif',fontSize:13,resize:'vertical',boxSizing:'border-box',marginBottom:12 }}
          />
        )}

        <div style={{ display:'flex',gap:8,marginTop:4 }}>
          <Button variant="neutral" full onClick={onClose}>Cancelar</Button>
          <Button variant="danger"  full disabled={!reasonCode || saving || (reasonCode==='OUTRO' && !customNote.trim())} onClick={confirm}>
            {saving ? <Spinner size={14}/> : 'Confirmar Rejeição'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// Modal de aprovação com data de expiração
function ApproveModal({ doc, onConfirm, onClose }) {
  const [expiry, setExpiry] = useState('')
  const [saving, setSaving] = useState(false)

  async function confirm() {
    setSaving(true)
    await onConfirm(doc.id, expiry || null)
    setSaving(false)
    onClose()
  }

  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:16 }}>
      <div style={{ background:'#fff',borderRadius:16,padding:24,maxWidth:400,width:'100%',boxShadow:'0 24px 60px rgba(0,0,0,.3)' }}>
        <div style={{ fontFamily:'Montserrat,sans-serif',fontWeight:800,fontSize:16,color:'#15803d',marginBottom:4 }}>✓ Aprovar Documento</div>
        <div style={{ fontFamily:'DM Sans,sans-serif',fontSize:13,color:'#64748b',marginBottom:16 }}>
          {doc.label} · {doc.suppliers?.razao_social}
        </div>
        <div style={{ fontFamily:'Montserrat,sans-serif',fontWeight:700,fontSize:11,color:'#9B9B9B',textTransform:'uppercase',letterSpacing:.5,marginBottom:6 }}>Data de Vencimento (opcional)</div>
        <input type="date" value={expiry} onChange={e => setExpiry(e.target.value)}
          style={{ width:'100%',padding:'10px 12px',borderRadius:10,border:'1px solid #e2e4ef',fontFamily:'DM Sans,sans-serif',fontSize:13,marginBottom:16,boxSizing:'border-box' }}/>
        <div style={{ display:'flex',gap:8 }}>
          <Button variant="neutral" full onClick={onClose}>Cancelar</Button>
          <Button variant="success" full disabled={saving} onClick={confirm}>
            {saving ? <Spinner size={14}/> : 'Confirmar Aprovação'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function DocumentAnalysis() {
  const navigate = useNavigate()

  // Filtros
  const [docType,       setDocType]       = useState('')
  const [supplierSearch,setSupplierSearch] = useState('')
  const [statusFilter,  setStatusFilter]  = useState('analise')
  const [expiresUntil,  setExpiresUntil]  = useState('')
  const [sortBy,        setSortBy]        = useState('expires_asc')

  // Dados
  const [rows,        setRows]        = useState([])
  const [total,       setTotal]       = useState(0)
  const [page,        setPage]        = useState(0)
  const [loading,     setLoading]     = useState(false)
  const [catalog,     setCatalog]     = useState([])
  const [reasons,     setReasons]     = useState([])

  // Ações inline
  const [docStatus,   setDocStatus]   = useState({}) // docId → status local
  const [saving,      setSaving]      = useState(new Set())
  const [rejectModal, setRejectModal] = useState(null) // doc object
  const [approveModal,setApproveModal] = useState(null)

  const PAGE_SIZE = 50

  useEffect(() => {
    Promise.all([
      supabase.from('documents_catalog').select('id, name').order('name'),
      adminApi.getRejectionReasons(),
    ]).then(([catRes, reasonsData]) => {
      setCatalog(catRes.data || [])
      setReasons(reasonsData)
    })
  }, [])

  const fetchDocs = useCallback(async (pg = 0) => {
    setLoading(true)
    try {
      const result = await adminApi.listDocumentsForAnalysis({
        docType: docType || undefined,
        supplierSearch: supplierSearch || undefined,
        status: statusFilter !== 'todos' ? statusFilter : undefined,
        expiresUntil: expiresUntil || undefined,
        sortBy,
        page: pg,
        pageSize: PAGE_SIZE,
      })
      setRows(result.rows)
      setTotal(result.total)
      setPage(pg)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [docType, supplierSearch, statusFilter, expiresUntil, sortBy])

  useEffect(() => { fetchDocs(0) }, [fetchDocs])

  async function handleApprove(docId, expiry) {
    setSaving(p => new Set([...p, docId]))
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/.netlify/functions/admin-approve-document', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', Authorization:`Bearer ${session.access_token}` },
        body: JSON.stringify({ documentId: docId, status: 'VALID', expiresAt: expiry || undefined }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setDocStatus(p => ({ ...p, [docId]: 'VALID' }))
      setRows(p => p.map(d => d.id === docId ? { ...d, status: 'VALID', expires_at: expiry || d.expires_at } : d))
    } catch (e) { alert('Erro ao aprovar: ' + e.message) }
    finally { setSaving(p => { const n = new Set(p); n.delete(docId); return n }) }
  }

  async function handleReject(docId, note) {
    setSaving(p => new Set([...p, docId]))
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/.netlify/functions/admin-approve-document', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', Authorization:`Bearer ${session.access_token}` },
        body: JSON.stringify({ documentId: docId, status: 'REJECTED', note }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setDocStatus(p => ({ ...p, [docId]: 'REJECTED' }))
      setRows(p => p.map(d => d.id === docId ? { ...d, status: 'REJECTED', review_note: note } : d))
    } catch (e) { alert('Erro ao rejeitar: ' + e.message) }
    finally { setSaving(p => { const n = new Set(p); n.delete(docId); return n }) }
  }

  const lbl = { display:'block',fontFamily:'Montserrat,sans-serif',fontWeight:700,fontSize:10,color:'#9B9B9B',letterSpacing:.5,textTransform:'uppercase',marginBottom:4 }
  const inp = { padding:'8px 10px',borderRadius:8,border:'1px solid #e2e4ef',fontFamily:'DM Sans,sans-serif',fontSize:13,width:'100%',boxSizing:'border-box',outline:'none' }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div style={{ padding:'24px 32px', maxWidth:1200, margin:'0 auto' }}>
      <PageHeader title="Análise de Documentos" subtitle="Aprovação e rejeição em lote · independente de fornecedor"
        action={<Button variant="neutral" onClick={() => navigate('/backoffice')}>← Painel</Button>}
      />

      {/* Filtros */}
      <Card style={{ borderRadius:14, padding:'16px 20px', marginBottom:16 }}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:12 }}>
          <div>
            <span style={lbl}>Tipo de documento</span>
            <select value={docType} onChange={e => setDocType(e.target.value)} style={inp}>
              <option value="">Todos os tipos</option>
              {catalog.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <span style={lbl}>Fornecedor (nome ou CNPJ)</span>
            <input value={supplierSearch} onChange={e => setSupplierSearch(e.target.value)}
              placeholder="Buscar fornecedor..." style={inp}/>
          </div>
          <div>
            <span style={lbl}>Status</span>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={inp}>
              {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <span style={lbl}>Vencimento até</span>
            <input type="date" value={expiresUntil} onChange={e => setExpiresUntil(e.target.value)} style={inp}/>
          </div>
          <div>
            <span style={lbl}>Ordenar por</span>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={inp}>
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div style={{ display:'flex', alignItems:'flex-end' }}>
            <Button variant="neutral" full onClick={() => { setDocType(''); setSupplierSearch(''); setStatusFilter('analise'); setExpiresUntil(''); setSortBy('expires_asc') }}>
              Limpar filtros
            </Button>
          </div>
        </div>
      </Card>

      {/* Contagem */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
        <span style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#64748b' }}>
          {loading ? 'Carregando...' : `${total.toLocaleString('pt-BR')} documento${total !== 1 ? 's' : ''} encontrado${total !== 1 ? 's' : ''}`}
        </span>
        {totalPages > 1 && (
          <div style={{ display:'flex', gap:6, alignItems:'center' }}>
            <Button variant="neutral" size="sm" disabled={page === 0} onClick={() => fetchDocs(page - 1)}>‹</Button>
            <span style={{ fontSize:12, color:'#64748b', fontFamily:'DM Sans,sans-serif' }}>
              Pág. {page + 1} / {totalPages}
            </span>
            <Button variant="neutral" size="sm" disabled={page >= totalPages - 1} onClick={() => fetchDocs(page + 1)}>›</Button>
          </div>
        )}
      </div>

      {/* Lista */}
      {loading ? (
        <div style={{ display:'flex', justifyContent:'center', padding:60 }}><Spinner size={40}/></div>
      ) : rows.length === 0 ? (
        <Card style={{ borderRadius:14, padding:'40px', textAlign:'center' }}>
          <div style={{ fontSize:32, marginBottom:8 }}>✅</div>
          <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:14, color:'#1a1c5e' }}>Nenhum documento encontrado</div>
          <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#9B9B9B', marginTop:4 }}>Ajuste os filtros ou selecione outro status</div>
        </Card>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {/* Cabeçalho da lista */}
          <div style={{ display:'grid', gridTemplateColumns:'1.2fr 1.3fr 100px 100px 120px', gap:8, padding:'6px 16px', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:10, color:'#9B9B9B', letterSpacing:.5, textTransform:'uppercase' }}>
            <span>Fornecedor</span>
            <span>Documento</span>
            <span>Status</span>
            <span>Vencimento</span>
            <span style={{ textAlign:'right' }}>Ações</span>
          </div>

          {rows.map(doc => {
            const status    = docStatus[doc.id] || doc.status
            const isSaving  = saving.has(doc.id)
            const isExpired = doc.expires_at && new Date(doc.expires_at) < new Date()
            const isToday   = doc.expires_at && new Date(doc.expires_at).toDateString() === new Date().toDateString()

            return (
              <Card key={doc.id} style={{
                borderRadius:10, padding:'10px 16px',
                borderLeft: `3px solid ${STATUS_COLOR[status] || '#e2e4ef'}`,
                opacity: status === 'VALID' || status === 'REJECTED' ? 0.75 : 1,
              }}>
                <div style={{ display:'grid', gridTemplateColumns:'1.2fr 1.3fr 100px 100px 120px', gap:8, alignItems:'start' }}>
                  {/* Fornecedor */}
                  <div>
                    <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, fontWeight:700, color:'#1a1c5e', wordBreak:'break-word', lineHeight:1.3 }}>
                      {doc.suppliers?.razao_social || '—'}
                    </div>
                    <div style={{ fontSize:11, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>
                      {doc.suppliers?.cnpj || '—'}
                    </div>
                  </div>

                  {/* Documento */}
                  <div>
                    <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#1a1c5e', wordBreak:'break-word', lineHeight:1.3 }}>
                      {doc.label}
                    </div>
                    <div style={{ fontSize:10, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>
                      {doc.source === 'AUTO' ? '⚡ Auto' : '📎 Manual'}
                      {doc.review_note && ` · ${doc.review_note}`}
                    </div>
                  </div>

                  {/* Status */}
                  <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                    <StatusDot status={status}/>
                    <span style={{ fontSize:11, color: STATUS_COLOR[status] || '#9B9B9B', fontFamily:'DM Sans,sans-serif', fontWeight:600 }}>
                      {STATUS_LABEL[status] || status}
                    </span>
                  </div>

                  {/* Vencimento */}
                  <div style={{ fontSize:12, fontFamily:'DM Sans,sans-serif', color: isExpired ? '#dc2626' : isToday ? '#d97706' : '#64748b', fontWeight: (isExpired || isToday) ? 700 : 400 }}>
                    {doc.expires_at ? doc.expires_at.slice(0, 10) : '—'}
                    {isExpired && <div style={{ fontSize:10, color:'#dc2626' }}>Vencido</div>}
                    {isToday   && <div style={{ fontSize:10, color:'#d97706' }}>Hoje</div>}
                  </div>

                  {/* Ações */}
                  <div style={{ display:'flex', gap:5, justifyContent:'flex-end' }}>
                    {doc.storage_path && (
                      <Button variant="neutral" size="sm" onClick={async () => {
                        const url = await documentApi.getSignedUrl(doc.storage_path)
                        window.open(url, '_blank')
                      }}>👁</Button>
                    )}
                    {isSaving ? <Spinner size={16}/> : (
                      <>
                        {(status === 'PENDING' || status === 'MISSING' || status === 'EXPIRED' || status === 'EXPIRING') && (
                          <Button variant="success" size="sm" onClick={() => setApproveModal(doc)}>✓</Button>
                        )}
                        {(status === 'PENDING' || status === 'VALID' || status === 'EXPIRING') && (
                          <Button variant="danger" size="sm" onClick={() => setRejectModal(doc)}>✕</Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Paginação inferior */}
      {totalPages > 1 && (
        <div style={{ display:'flex', justifyContent:'center', gap:8, marginTop:16 }}>
          <Button variant="neutral" size="sm" disabled={page === 0} onClick={() => fetchDocs(0)}>«</Button>
          <Button variant="neutral" size="sm" disabled={page === 0} onClick={() => fetchDocs(page - 1)}>‹ Anterior</Button>
          <span style={{ fontSize:12, color:'#64748b', fontFamily:'DM Sans,sans-serif', lineHeight:'32px' }}>
            {page + 1} / {totalPages}
          </span>
          <Button variant="neutral" size="sm" disabled={page >= totalPages - 1} onClick={() => fetchDocs(page + 1)}>Próxima ›</Button>
          <Button variant="neutral" size="sm" disabled={page >= totalPages - 1} onClick={() => fetchDocs(totalPages - 1)}>»</Button>
        </div>
      )}

      {/* Modais */}
      {rejectModal  && <RejectModal  doc={rejectModal}  reasons={reasons} onConfirm={handleReject}  onClose={() => setRejectModal(null)}/>}
      {approveModal && <ApproveModal doc={approveModal} onConfirm={handleApprove} onClose={() => setApproveModal(null)}/>}
    </div>
  )
}
