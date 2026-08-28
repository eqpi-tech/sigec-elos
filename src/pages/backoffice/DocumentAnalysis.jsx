import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminApi, documentApi } from '../../services/api.js'
import { supabase } from '../../lib/supabase.js'
import { getHolidaySet, adjustToBusinessDay } from '../../lib/businessDays.js'
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
  { value: 'NOT_APPLICABLE', label: 'Não se aplica' },
]

const SORT_OPTIONS = [
  { value: 'expires_asc',  label: 'Vencimento ↑' },
  { value: 'expires_desc', label: 'Vencimento ↓' },
  { value: 'status',       label: 'Status' },
  { value: 'recent',       label: 'Mais recente' },
]

const STATUS_COLOR = { VALID:'#22c55e', PENDING:'#f59e0b', MISSING:'#9B9B9B', REJECTED:'#ef4444', EXPIRED:'#ef4444', EXPIRING:'#f59e0b', NOT_APPLICABLE:'#64748b' }
const STATUS_LABEL = { VALID:'Aprovado', PENDING:'Em análise', MISSING:'Não enviado', REJECTED:'Rejeitado', EXPIRED:'Vencido', EXPIRING:'Vence em breve', NOT_APPLICABLE:'Não se aplica' }

function getDocAiType(doc) {
  const label = (doc.label || '').toLowerCase()
  if (label.includes('bancár') || label.includes('banco') || label.includes('conta corrente') || label.includes('conta poupan') || label.includes('comprovante de conta'))
    return 'bank'
  if (label.includes('dre') || label.includes('balanço') || label.includes('balanco') || label.includes('resultado do exerc') || label.includes('demonstração de resultado'))
    return 'dre'
  return null
}

// Modal de extração IA para banco/DRE
function DocAiModal({ doc, extractType, onApprove, onClose }) {
  const [bankData,  setBankData]  = useState({})
  const [dreData,   setDreData]   = useState({ year: new Date().getFullYear() - 1 })
  const [aiLoading, setAiLoading] = useState(false)
  const [saving,    setSaving]    = useState(false)

  async function extractWithAI() {
    setAiLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/.netlify/functions/ai-extract-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ storagePath: doc.storage_path, extractType, supplierId: doc.supplier_id }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error)
      if (result.extracted) {
        if (extractType === 'bank') setBankData(p => ({ ...p, ...result.extracted }))
        else setDreData(p => ({ ...p, ...result.extracted }))
      }
      if (result.warning) alert('⚠️ ' + result.warning)
    } catch (e) { alert('Erro na extração: ' + e.message) }
    finally { setAiLoading(false) }
  }

  async function saveData() {
    setSaving(true)
    try {
      const userId = (await supabase.auth.getUser()).data.user?.id
      if (extractType === 'bank') {
        const { error } = await supabase.from('supplier_bank_accounts').upsert(
          { ...bankData, supplier_id: doc.supplier_id, verified_by: userId, verified_at: new Date().toISOString() },
          { onConflict: 'supplier_id' }
        )
        if (error) throw error
      } else {
        const { error } = await supabase.from('supplier_financials')
          .upsert({ ...dreData, supplier_id: doc.supplier_id, verified_by: userId, verified_at: new Date().toISOString() },
            { onConflict: 'supplier_id,year' })
        if (error) throw error
      }
      alert('Dados salvos com sucesso!')
    } catch (e) { alert('Erro ao salvar: ' + e.message) }
    finally { setSaving(false) }
  }

  const inp = { width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:13, boxSizing:'border-box', outline:'none' }
  const lbl = { display:'block', fontSize:10, fontWeight:700, color:'#9B9B9B', fontFamily:'Montserrat,sans-serif', letterSpacing:.5, textTransform:'uppercase', marginBottom:3 }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'#fff', borderRadius:18, padding:28, maxWidth:540, width:'100%', boxShadow:'0 24px 80px rgba(0,0,0,.3)', maxHeight:'90vh', overflowY:'auto' }}>
        <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:16, color:'#1a1c5e', marginBottom:4 }}>
          🤖 {extractType === 'bank' ? 'Dados Bancários' : 'DRE / Dados Financeiros'}
        </div>
        <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:12, color:'#9B9B9B', marginBottom:16 }}>
          {doc.label} · {doc.suppliers?.razao_social}
        </div>

        <div style={{ display:'flex', gap:8, marginBottom:20 }}>
          <Button variant="neutral" size="sm" onClick={async () => {
            const url = await documentApi.getSignedUrl(doc.storage_path)
            window.open(url, '_blank')
          }}>👁 Ver documento</Button>
          <Button variant="primary" size="sm" disabled={aiLoading} onClick={extractWithAI}>
            {aiLoading ? <><Spinner size={14}/> Extraindo...</> : '🤖 Extrair com IA'}
          </Button>
        </div>

        {extractType === 'bank' && (
          <>
            {[
              ['bank_name',    'Nome do Banco',      ''],
              ['bank_code',    'Código COMPE',        'Ex: 001'],
              ['bank_agency',  'Agência',             ''],
              ['bank_account', 'Conta c/ dígito',     ''],
              ['pix_key',      'Chave PIX',           ''],
            ].map(([field, label, placeholder]) => (
              <div key={field} style={{ marginBottom:10 }}>
                <label style={lbl}>{label}</label>
                <input value={bankData[field] || ''} placeholder={placeholder}
                  onChange={e => setBankData(p => ({ ...p, [field]: e.target.value }))} style={inp}/>
              </div>
            ))}
            <div style={{ marginBottom:14 }}>
              <label style={lbl}>Tipo de Conta</label>
              <select value={bankData.account_type || ''} onChange={e => setBankData(p => ({ ...p, account_type: e.target.value }))}
                style={{ ...inp }}>
                <option value="">Selecione...</option>
                <option value="corrente">Corrente</option>
                <option value="poupanca">Poupança</option>
              </select>
            </div>
          </>
        )}

        {extractType === 'dre' && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
            {[
              ['year',    'Ano de referência'],
              ['receita', 'Receita (R$)'],
              ['ativo',   'Ativo (R$)'],
              ['passivo', 'Passivo (R$)'],
              ['lucro',   'Lucro (R$)'],
              ['ebitda',  'EBITDA (R$)'],
              ['estoque', 'Estoque (R$)'],
            ].map(([field, label]) => (
              <div key={field}>
                <label style={lbl}>{label}</label>
                <input type="number" value={dreData[field] ?? ''} placeholder="0"
                  onChange={e => setDreData(p => ({ ...p, [field]: e.target.value ? Number(e.target.value) : null }))}
                  style={inp}/>
              </div>
            ))}
          </div>
        )}

        <div style={{ display:'flex', gap:8, marginTop:8 }}>
          <Button variant="neutral" full onClick={onClose}>Fechar</Button>
          <Button variant="neutral" full disabled={saving} onClick={saveData}>
            {saving ? <Spinner size={14}/> : '💾 Salvar dados'}
          </Button>
          <Button variant="success" full onClick={() => { onApprove(doc); onClose() }}>
            ✓ Aprovar documento
          </Button>
        </div>
      </div>
    </div>
  )
}

// Modal ÚNICO de edição (paridade HOC): ver, substituir arquivo, vencimento,
// status (Aprovado/Reprovado/Não se aplica) e motivo — tudo em um lugar.
function EditDocModal({ doc, reasons, rule, onView, onSubmit, onClose }) {
  const [file, setFile]           = useState(null)
  const [expiry, setExpiry]       = useState(doc.expires_at ? doc.expires_at.slice(0, 10) : '')
  const [status, setStatus]       = useState('')       // '' = manter atual
  const [reasonCode, setReasonCode] = useState('')
  const [customNote, setCustomNote] = useState('')
  const [saving, setSaving]       = useState(false)

  const selectedReason = reasons.find(r => r.code === reasonCode)
  const note = status === 'REJECTED'
    ? (reasonCode === 'OUTRO' ? customNote.trim() : (selectedReason?.label || ''))
    : customNote.trim()

  const rejectSemMotivo = status === 'REJECTED' && (!reasonCode || (reasonCode === 'OUTRO' && !customNote.trim()))
  const nadaMudou       = !file && !status && expiry === (doc.expires_at ? doc.expires_at.slice(0, 10) : '')

  async function confirm() {
    if (rejectSemMotivo || nadaMudou) return
    if (file && file.size > 4.5 * 1024 * 1024) { alert('Arquivo acima de 4,5MB — reduza o tamanho'); return }
    setSaving(true)
    try {
      await onSubmit(doc.id, { file, expiry: expiry || null, status: status || null, note })
      onClose()
    } catch (e) { alert('Erro ao salvar: ' + e.message) }
    finally { setSaving(false) }
  }

  const lbl = { fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:11, color:'#9B9B9B', textTransform:'uppercase', letterSpacing:.5, marginBottom:6, display:'block' }
  const inp = { width:'100%', padding:'10px 12px', borderRadius:10, border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:13, boxSizing:'border-box' }

  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:16 }}>
      <div style={{ background:'#fff',borderRadius:16,padding:24,maxWidth:480,width:'100%',boxShadow:'0 24px 60px rgba(0,0,0,.3)',maxHeight:'92vh',overflowY:'auto' }}>
        <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:4 }}>
          <div style={{ fontFamily:'Montserrat,sans-serif',fontWeight:800,fontSize:16,color:'#1a1c5e' }}>✏️ Editar Documento</div>
          <button onClick={onClose} style={{ background:'none',border:'none',cursor:'pointer',color:'#9B9B9B',fontSize:18,lineHeight:1 }}>✕</button>
        </div>
        <div style={{ fontFamily:'DM Sans,sans-serif',fontSize:13,color:'#64748b',marginBottom:6 }}>
          {doc.label} · {doc.suppliers?.razao_social}
        </div>
        <div style={{ fontFamily:'DM Sans,sans-serif',fontSize:12,color:'#9B9B9B',marginBottom:16 }}>
          Status atual: <strong style={{ color: STATUS_COLOR[doc.status]||'#64748b' }}>{STATUS_LABEL[doc.status]||doc.status}</strong>
          {doc.expires_at && ` · vence em ${doc.expires_at.slice(0,10)}`}
        </div>

        {rule && (
          <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:12, color:'#1e40af', background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:10, padding:'10px 14px', marginBottom:14, whiteSpace:'pre-line' }}>
            <strong style={{ fontFamily:'Montserrat,sans-serif', fontSize:10, letterSpacing:.5, textTransform:'uppercase', display:'block', marginBottom:4 }}>📋 Como validar este documento</strong>
            {rule}
          </div>
        )}

        {(doc.storage_path || doc.hoc_arquivo_id) && (
          <Button variant="neutral" size="sm" style={{ marginBottom:16 }} onClick={() => onView(doc)}>
            👁 Ver documento atual
          </Button>
        )}

        <span style={lbl}>Substituir documento</span>
        <input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={e => setFile(e.target.files?.[0] || null)}
          style={{ width:'100%', fontFamily:'DM Sans,sans-serif', fontSize:13, marginBottom:14 }}/>

        <span style={lbl}>Data de vencimento</span>
        <input type="date" value={expiry} onChange={e => setExpiry(e.target.value)} style={{ ...inp, marginBottom:14 }}/>

        <span style={lbl}>Status</span>
        <select value={status} onChange={e => { setStatus(e.target.value); setReasonCode(''); setCustomNote('') }} style={{ ...inp, marginBottom:14 }}>
          <option value="">Manter status atual</option>
          <option value="VALID">✓ Aprovado</option>
          <option value="REJECTED">✕ Reprovado</option>
          <option value="NOT_APPLICABLE">◌ Não se aplica</option>
        </select>

        {status === 'REJECTED' ? (
          <>
            <span style={lbl}>Motivo da reprovação *</span>
            <select value={reasonCode} onChange={e => setReasonCode(e.target.value)} style={{ ...inp, marginBottom:10 }}>
              <option value="">Selecione um motivo...</option>
              {reasons.filter(r => r.applies_to !== 'seal').map(r => (
                <option key={r.code} value={r.code}>{r.label}</option>
              ))}
            </select>
            {reasonCode === 'OUTRO' && (
              <textarea value={customNote} onChange={e => setCustomNote(e.target.value)} rows={2}
                placeholder="Descreva o motivo..." style={{ ...inp, resize:'vertical', marginBottom:10 }}/>
            )}
          </>
        ) : (
          <>
            <span style={lbl}>Observação</span>
            <textarea value={customNote} onChange={e => setCustomNote(e.target.value)} rows={2}
              placeholder="Opcional" style={{ ...inp, resize:'vertical', marginBottom:10 }}/>
          </>
        )}

        {file && !status && (
          <div style={{ background:'#FFF3E8', border:'1px solid #F47E2F55', borderRadius:8, padding:'8px 12px', fontFamily:'DM Sans,sans-serif', fontSize:12, color:'#9a5b1f', marginBottom:12 }}>
            Documento substituído pelo analista fica <strong>Aprovado</strong>. A versão anterior permanece no histórico.
          </div>
        )}

        <div style={{ display:'flex', gap:8, marginTop:8 }}>
          <Button variant="neutral" full onClick={onClose}>Cancelar</Button>
          <Button variant="primary" full disabled={saving || rejectSemMotivo || nadaMudou} onClick={confirm}>
            {saving ? <Spinner size={14}/> : '💾 Salvar'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// Persistência dos filtros na sessão — sobrevive a navegação/remontagem da página
const FILTERS_KEY = 'docanalysis_filters'
function loadSavedFilters() {
  try { return JSON.parse(sessionStorage.getItem(FILTERS_KEY)) || {} } catch { return {} }
}

// Prazo (dias corridos) entre o envio do documento e a data limite de análise
const ANALYSIS_SLA_DAYS = 5

export default function DocumentAnalysis() {
  const navigate = useNavigate()
  const saved = loadSavedFilters()

  // Filtros
  const [docType,       setDocType]       = useState(saved.docType ?? '')
  const [supplierSearch,setSupplierSearch] = useState(saved.supplierSearch ?? '')
  const [statusFilter,  setStatusFilter]  = useState(saved.statusFilter ?? 'analise')
  const [expiresUntil,  setExpiresUntil]  = useState(saved.expiresUntil ?? '')
  const [sortBy,        setSortBy]        = useState(saved.sortBy ?? 'expires_asc')

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
  const [aiModal,     setAiModal]     = useState(null) // { doc, extractType }
  const [editModal,   setEditModal]   = useState(null) // doc object

  const PAGE_SIZE = 50

  useEffect(() => {
    Promise.all([
      // select('*') tolera a ausência das colunas do patch_031 (analysis_sla_days, responsibility)
      supabase.from('documents_catalog').select('*').order('name'),
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

  // Salva os filtros a cada mudança
  useEffect(() => {
    sessionStorage.setItem(FILTERS_KEY, JSON.stringify({ docType, supplierSearch, statusFilter, expiresUntil, sortBy }))
  }, [docType, supplierSearch, statusFilter, expiresUntil, sortBy])

  async function handleApprove(docId, expiry, status = 'VALID', note) {
    setSaving(p => new Set([...p, docId]))
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/.netlify/functions/admin-approve-document', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', Authorization:`Bearer ${session.access_token}` },
        body: JSON.stringify({ documentId: docId, status, expiresAt: expiry || undefined, note: note || undefined }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setDocStatus(p => ({ ...p, [docId]: status }))
      setRows(p => p.map(d => d.id === docId ? { ...d, status, expires_at: expiry || d.expires_at, review_note: note || d.review_note } : d))
    } catch (e) { alert('Erro ao salvar: ' + e.message); throw e }
    finally { setSaving(p => { const n = new Set(p); n.delete(docId); return n }) }
  }

  // Abre o arquivo (Storage ELOS ou S3 legado do HOC)
  async function viewDoc(doc) {
    try {
      const url = doc.storage_path
        ? await documentApi.getSignedUrl(doc.storage_path)
        : await documentApi.getHocFileUrl(doc.id)
      window.open(url, '_blank')
    } catch (e) { alert(e.message) }
  }

  // Modal único: orquestra substituição de arquivo, vencimento e status.
  // 1) arquivo → replace_file (fica VALID) · 2) status → approve-document
  // (dispara auto-finalização) · 3) só vencimento → set_expiry
  async function handleEditSubmit(docId, { file, expiry, status, note }) {
    if (file) {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload  = () => resolve(reader.result.split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      await handleUpdateDoc(docId, {
        action: 'replace_file',
        file: { name: file.name, mime: file.type, base64 },
        expiresAt: expiry || undefined,
        note: note || undefined,
      })
      if (!status || status === 'VALID') return
    }
    if (status) {
      if (status === 'REJECTED') await handleReject(docId, note)
      else await handleApprove(docId, expiry, status, note)
      return
    }
    // só a data mudou
    await handleUpdateDoc(docId, { action: 'set_expiry', expiresAt: expiry, note: note || undefined })
  }

  // Substituir arquivo / alterar vencimento (admin-update-document)
  async function handleUpdateDoc(docId, payload) {
    setSaving(p => new Set([...p, docId]))
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/.netlify/functions/admin-update-document', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', Authorization:`Bearer ${session.access_token}` },
        body: JSON.stringify({ documentId: docId, ...payload }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error)
      const upd = result.document || {}
      setDocStatus(p => ({ ...p, [docId]: upd.status }))
      setRows(p => p.map(d => d.id === docId ? { ...d, ...upd } : d))
    } finally {
      setSaving(p => { const n = new Set(p); n.delete(docId); return n })
    }
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

  const handleExportCsv = async (scope = 'filtered') => {
    let exportRows = rows
    if (scope === 'all' && total > rows.length) {
      // Busca todos os registros sem paginação
      try {
        const result = await adminApi.listDocumentsForAnalysis({
          docType: docType || undefined,
          supplierSearch: supplierSearch || undefined,
          status: statusFilter !== 'todos' ? statusFilter : undefined,
          expiresUntil: expiresUntil || undefined,
          sortBy: 'expires_asc',
          page: 0,
          pageSize: 9999,
        })
        exportRows = result.rows
      } catch(e) { alert('Erro ao exportar: ' + e.message); return }
    }
    // CNPJ com máscara — evita que o Excel converta para notação científica
    const fmtCnpj = (c) => {
      const d = String(c || '').replace(/\D/g, '')
      return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : (c || '')
    }
    const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('pt-BR') : ''
    // Data limite de análise = envio + SLA do tipo (patch_031, fallback padrão),
    // rolada para o próximo dia útil (feriados/fins de semana)
    const holidaySet = await getHolidaySet()
    const slaByType = Object.fromEntries(catalog.map(c => [String(c.id), c.analysis_sla_days]))
    const analysisDeadline = (d) => {
      if (!d.created_at || d.status === 'VALID' || d.status === 'REJECTED') return ''
      const dt = new Date(d.created_at)
      dt.setDate(dt.getDate() + (slaByType[String(d.type)] || ANALYSIS_SLA_DAYS))
      return adjustToBusinessDay(dt, holidaySet).toLocaleDateString('pt-BR')
    }
    const BOM     = '﻿'
    const headers = ['Fornecedor', 'CNPJ', 'Documento', 'Status', 'Enviado em', 'Data limite de análise', 'Vencimento', 'Fonte']
    const csvRows = exportRows.map(d => [
      d.suppliers?.razao_social || '',
      fmtCnpj(d.suppliers?.cnpj),
      d.label || '',
      STATUS_LABEL[d.status] || d.status || '',
      fmtDate(d.created_at),
      analysisDeadline(d),
      d.expires_at ? fmtDate(d.expires_at) : '',
      d.source === 'AUTO' ? 'Automático' : 'Manual',
    ].map(v => `"${String(v).replace(/"/g,'""')}"`).join(';'))
    const csv  = BOM + [headers.join(';'), ...csvRows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `analise_documentos_${new Date().toISOString().slice(0,10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ padding:'24px 32px', maxWidth:1200, margin:'0 auto' }}>
      <PageHeader title="Análise de Documentos" subtitle="Aprovação e rejeição em lote · independente de fornecedor"
        action={
          <div style={{ display:'flex', gap:8 }}>
            {rows.length > 0 && (
              <div style={{ display:'flex', gap:6 }}>
                <Button variant="neutral" size="sm" onClick={() => handleExportCsv('filtered')}>
                  ⬇ Exportar página ({rows.length})
                </Button>
                {total > rows.length && (
                  <Button variant="neutral" size="sm" onClick={() => handleExportCsv('all')}>
                    ⬇ Exportar tudo ({total})
                  </Button>
                )}
              </div>
            )}
            <Button variant="neutral" onClick={() => navigate('/backoffice')}>← Painel</Button>
          </div>
        }
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

                  {/* Ações: 👁 ver rápido · 🤖 extração IA · ✏️ modal único */}
                  <div style={{ display:'flex', gap:5, justifyContent:'flex-end', flexWrap:'wrap' }}>
                    {(doc.storage_path || doc.hoc_arquivo_id) && (
                      <Button variant="neutral" size="sm" title="Ver documento" onClick={() => viewDoc(doc)}>👁</Button>
                    )}
                    {doc.storage_path && getDocAiType(doc) && (
                      <Button variant="primary" size="sm" title="Extração IA"
                        onClick={() => setAiModal({ doc, extractType: getDocAiType(doc) })}>🤖</Button>
                    )}
                    {isSaving ? <Spinner size={16}/> : (
                      <Button variant="primary" size="sm" onClick={() => setEditModal(doc)}>✏️ Editar</Button>
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
      {editModal && (
        <EditDocModal doc={editModal} reasons={reasons}
          rule={catalog.find(c => String(c.id) === String(editModal.type))?.validation_rule}
          onView={viewDoc} onSubmit={handleEditSubmit} onClose={() => setEditModal(null)}/>
      )}
      {aiModal && (
        <DocAiModal
          doc={aiModal.doc}
          extractType={aiModal.extractType}
          onApprove={doc => setEditModal(doc)}
          onClose={() => setAiModal(null)}
        />
      )}
    </div>
  )
}
