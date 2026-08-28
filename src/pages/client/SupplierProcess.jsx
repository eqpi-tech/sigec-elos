import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { clientApi, documentApi } from '../../services/api.js'
import { supabase } from '../../lib/supabase.js'
import { Card, Spinner, StatusDot, ScoreBar, SectionTitle, Button } from '../../components/ui.jsx'
import SealBadge from '../../components/SealBadge.jsx'

function safeStr(val, fallback = '—') {
  if (val === null || val === undefined) return fallback
  if (typeof val === 'string') return val.trim() || fallback
  if (typeof val === 'number') return String(val)
  if (typeof val === 'boolean') return val ? 'Sim' : 'Não'
  if (Array.isArray(val)) return val.map(v => safeStr(v, '')).filter(Boolean).join(', ') || fallback
  if (typeof val === 'object') {
    return val.descricaoPortal || val.descricaoResumida || val.descricao
        || val.nome || val.texto || val.sigla || val.codigo
        || JSON.stringify(val).slice(0, 80)
  }
  return String(val).trim() || fallback
}

function filterActiveSanctions(list, cnpj) {
  if (!Array.isArray(list)) return []
  const today = new Date(); today.setHours(0,0,0,0)
  const cnpjNums = (cnpj||'').replace(/\D/g,'')
  return list.filter(s => {
    if (cnpjNums) {
      const rec = (s.sancionado?.codigoFormatado||s.pessoa?.cnpjFormatado||s.cnpjSancionado||s.cpfCnpj||'').replace(/\D/g,'')
      if (rec && rec !== cnpjNums) return false
    }
    const sit = (s.situacaoDoSancionado||'').toLowerCase().trim()
    let futuro = false
    if (s.dataFimSancao) {
      try {
        let end; const v = String(s.dataFimSancao)
        if (v.includes('/')) { const [d,m,y]=v.split('/'); end=new Date(+y,+m-1,+d) } else { end=new Date(v) }
        if (!isNaN(end)) futuro = end >= today
      } catch {}
    }
    return sit==='ativo'||sit==='vigente'||futuro
  })
}

const SEAL_COLOR = { ACTIVE:'#22c55e', PENDING:'#f59e0b', SUSPENDED:'#ef4444', EXPIRED:'#9B9B9B' }
const SEAL_LABEL = { ACTIVE:'Homologado', PENDING:'Em Análise', SUSPENDED:'Suspenso', EXPIRED:'Expirado' }
const DOC_STATUS_LABEL = { VALID:'Aprovado', PENDING:'Aguardando análise', MISSING:'Não enviado', REJECTED:'Rejeitado', EXPIRED:'Vencido', EXPIRING:'Vence em breve' }
const DOC_BG = { VALID:'#f0fdf4', PENDING:'#fff7ed', MISSING:'#f9fafb', REJECTED:'#fff5f5', EXPIRED:'#fff5f5', EXPIRING:'#fffbeb' }
const DOC_BORDER = { VALID:'#dcfce7', PENDING:'#fed7aa', MISSING:'#e2e4ef', REJECTED:'#fee2e2', EXPIRED:'#fee2e2', EXPIRING:'#fde68a' }

const TABS = ['Resumo', 'Documentos', 'Inteligência CNPJ']


// ── Carta de Exceção: cliente aprova categoria específica mesmo com doc
//    reprovado/faltante; backoffice então homologa com exceção ────────────
function ExceptionLetters({ seal, supplierId, clientId }) {
  const [cats, setCats]       = useState([])
  const [letters, setLetters] = useState({})   // category_id → row
  const [busy, setBusy]       = useState(null)
  const [open, setOpen]       = useState(false)

  useEffect(() => {
    if (!seal?.id) return
    supabase.from('supplier_categories')
      .select('category_id, categories!inner(id, name, client_id)')
      .eq('supplier_id', supplierId).eq('categories.client_id', clientId)
      .then(({ data }) => setCats((data || []).map(r => r.categories)))
    supabase.from('supplier_category_approvals')
      .select('category_id, status, letter_name, approved_at')
      .eq('seal_id', seal.id)
      .then(({ data }) => setLetters(Object.fromEntries((data || []).map(r => [r.category_id, r]))))
  }, [seal?.id])

  if (!seal || seal.status === 'ACTIVE' && !Object.keys(letters).length && !open) {
    // processo já homologado sem exceção pendente → seção discreta
  }
  if (!seal || !cats.length) return null

  async function upload(cat, file) {
    setBusy(cat.id)
    try {
      const base64 = await new Promise((res, rej) => {
        const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.onerror = rej; r.readAsDataURL(file)
      })
      const { data: { session } } = await supabase.auth.getSession()
      const resp = await fetch('/.netlify/functions/exception-letter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ action: 'upload', sealId: seal.id, categoryId: cat.id,
          file: { name: file.name, mime: file.type, base64 } }),
      })
      const out = await resp.json()
      if (!resp.ok) throw new Error(out.error)
      setLetters(p => ({ ...p, [cat.id]: { category_id: cat.id, status: 'EXCEPTION_REQUESTED', letter_name: file.name } }))
    } catch (e) { alert('Erro ao anexar carta: ' + e.message) }
    finally { setBusy(null) }
  }

  return (
    <Card style={{ borderRadius:14, padding:'18px 22px', marginBottom:16, border:'1px solid rgba(245,158,11,.35)' }}>
      <button onClick={() => setOpen(o => !o)} style={{ width:'100%', background:'none', border:'none', cursor:'pointer', display:'flex', alignItems:'center', gap:10, textAlign:'left', padding:0 }}>
        <span style={{ fontSize:18 }}>📜</span>
        <div style={{ flex:1 }}>
          <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:14, color:'#92400e' }}>Carta de Exceção</div>
          <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:12, color:'#9B9B9B' }}>
            Aprove uma categoria específica mesmo com documento reprovado — anexe a carta e o backoffice homologa com exceção
          </div>
        </div>
        <span style={{ color:'#9B9B9B', fontSize:12 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ marginTop:14, display:'flex', flexDirection:'column', gap:8 }}>
          {cats.map(cat => {
            const l = letters[cat.id]
            return (
              <div key={cat.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:10, border:'1px solid #eef0f6' }}>
                <span style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#1a1c5e', flex:1 }}>{cat.name}</span>
                {l?.status === 'EXCEPTION_APPROVED' ? (
                  <span style={{ fontSize:10, fontWeight:700, fontFamily:'Montserrat,sans-serif', color:'#15803d', background:'#dcfce7', padding:'3px 10px', borderRadius:20 }}>✓ Exceção aprovada</span>
                ) : l ? (
                  <span style={{ fontSize:10, fontWeight:700, fontFamily:'Montserrat,sans-serif', color:'#b45309', background:'#fef3c7', padding:'3px 10px', borderRadius:20 }}>📜 Carta anexada — aguardando backoffice</span>
                ) : (
                  <label style={{ fontSize:11, fontWeight:700, fontFamily:'Montserrat,sans-serif', color:'#2E3192', border:'1px dashed #2E319266', padding:'6px 12px', borderRadius:8, cursor: busy ? 'wait' : 'pointer' }}>
                    {busy === cat.id ? 'Enviando…' : '📎 Anexar carta'}
                    <input type="file" accept=".pdf,.png,.jpg,.jpeg" style={{ display:'none' }} disabled={!!busy}
                      onChange={e => e.target.files?.[0] && upload(cat, e.target.files[0])}/>
                  </label>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

export default function ClientSupplierProcess() {
  const { supplierId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [tab, setTab]         = useState('Resumo')
  const [bankModal, setBankModal] = useState(false)
  const [bankUrl, setBankUrl]   = useState(null)
  const [bankLoading, setBankLoading] = useState(false)
  const [cnaeMap, setCnaeMap] = useState({})

  useEffect(() => {
    if (!user?.clientId || !supplierId) return
    clientApi.getSupplierProcess(supplierId, user.clientId)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [supplierId, user?.clientId])

  useEffect(() => {
    const codes = data?.cnpj_consultation?.cnpj_data?.cnaes_secundarios?.map(c => String(c.codigo)).filter(Boolean)
    if (!codes?.length) return
    supabase.from('cnaes').select('codigo,descricao').in('codigo', codes)
      .then(({ data: rows }) => {
        if (!rows?.length) return
        const m = {}
        rows.forEach(r => { m[r.codigo] = r.descricao })
        setCnaeMap(m)
      })
      .catch(() => {})
  }, [data])

  if (loading) return <div style={{ display:'flex', justifyContent:'center', padding:80 }}><Spinner size={40}/></div>
  if (error)   return <div style={{ padding:32, color:'#dc2626', fontFamily:'DM Sans,sans-serif' }}>{error}</div>
  if (!data)   return null

  const seal    = data.seals?.[0] || null
  const cnpjC   = data.cnpj_consultation
  const cnpjDat = cnpjC?.cnpj_data
  const sanctions = cnpjC?.sanctions_data
  const supplierCnpj = data.cnpj || ''
  const activeSancCeis = filterActiveSanctions(sanctions?.ceis || [], supplierCnpj)
  const activeSancCnep = filterActiveSanctions(sanctions?.cnep || [], supplierCnpj)
  const hasActiveSanctions = activeSancCeis.length > 0 || activeSancCnep.length > 0

  const docs        = data.documents || []
  const validDocs   = docs.filter(d => d.status === 'VALID').length
  const pendingDocs = docs.filter(d => d.status === 'PENDING').length
  const missingDocs = docs.filter(d => d.status === 'MISSING').length
  const rejDocs     = docs.filter(d => d.status === 'REJECTED').length
  const score       = docs.length > 0 ? Math.round((validDocs / docs.length) * 100) : 0

  const inv = data.invitation

  const bankDoc = docs.find(d => String(d.type) === '10' && d.storage_path)

  const handleOpenBank = async () => {
    if (!bankDoc) return
    setBankLoading(true)
    setBankModal(true)
    try {
      const url = await documentApi.getSignedUrl(bankDoc.storage_path)
      setBankUrl(url)
    } finally {
      setBankLoading(false)
    }
  }

  const lbl  = { display:'block', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:10, color:'#9B9B9B', letterSpacing:.5, textTransform:'uppercase', marginBottom:4 }
  const val  = { fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#1a1c5e', fontWeight:600 }

  return (
    <div style={{ padding:'24px 32px', maxWidth:1000, margin:'0 auto' }}>
      {/* Voltar */}
      <button onClick={() => navigate('/cliente/fornecedores')}
        style={{ background:'none', border:'none', cursor:'pointer', color:'#2E3192', fontSize:14, fontFamily:'DM Sans,sans-serif', fontWeight:600, marginBottom:16, display:'flex', alignItems:'center', gap:6, padding:0 }}>
        ← Voltar a Meus Fornecedores
      </button>

      {/* Header */}
      <Card style={{ borderRadius:16, padding:'20px 24px', marginBottom:16 }}>
        <div style={{ display:'flex', gap:16, alignItems:'center' }}>
          <div style={{ width:56, height:56, borderRadius:14, background:'#EEF0FF', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:22, color:'#2E3192', flexShrink:0 }}>
            {data.razao_social?.slice(0,2).toUpperCase() || '??'}
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:18, color:'#1a1c5e' }}>{data.razao_social}</div>
            <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#9B9B9B', marginTop:2 }}>
              CNPJ {data.cnpj || '—'}
              {data.city && data.state && ` · ${data.city} / ${data.state}`}
            </div>
            {inv?.escopo && (
              <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:12, color:'#64748b', marginTop:4, background:'#f8faff', borderRadius:6, padding:'4px 8px', display:'inline-block' }}>
                Escopo: {inv.escopo}
              </div>
            )}
          </div>
          <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:8, flexShrink:0 }}>
            {seal ? (
              <SealBadge seal={seal} size="sm" showClient={false} showScore />
            ) : (
              <div style={{ fontSize:11, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>Aguardando análise</div>
            )}
            {inv?.subsidiado && (
              <div style={{ fontSize:10, background:'#d1fae5', color:'#065f46', borderRadius:20, padding:'2px 8px', fontFamily:'Montserrat,sans-serif', fontWeight:700 }}>
                SUBSIDIADO
              </div>
            )}
            {bankDoc && (
              <button onClick={handleOpenBank}
                style={{ display:'flex', alignItems:'center', gap:6, background:'#1a1c5e', color:'#fff', border:'none', borderRadius:10, padding:'8px 14px', cursor:'pointer', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:12 }}>
                🏦 Dados Bancários
              </button>
            )}
          </div>
        </div>
      </Card>

      <ExceptionLetters seal={seal} supplierId={supplierId} clientId={user?.clientId}/>

      {/* Modal Dados Bancários */}
      {bankModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={() => { setBankModal(false); setBankUrl(null) }}>
          <div style={{ background:'#fff', borderRadius:18, padding:'24px 28px', width:'min(92vw,700px)', maxHeight:'85vh', overflow:'auto' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:16, color:'#1a1c5e' }}>🏦 Comprovante de Conta Bancária</div>
              <button onClick={() => { setBankModal(false); setBankUrl(null) }}
                style={{ background:'none', border:'none', cursor:'pointer', fontSize:20, color:'#9B9B9B', lineHeight:1 }}>✕</button>
            </div>
            {bankLoading ? (
              <div style={{ textAlign:'center', padding:'40px 0' }}><Spinner size={32}/></div>
            ) : bankUrl ? (
              <div>
                {/\.(jpg|jpeg|png|gif|webp)$/i.test(bankDoc.storage_path) ? (
                  <img src={bankUrl} alt="Comprovante bancário" style={{ width:'100%', borderRadius:10 }} />
                ) : (
                  <iframe src={bankUrl} title="Comprovante bancário" style={{ width:'100%', height:500, border:'none', borderRadius:10 }} />
                )}
                <div style={{ marginTop:12, textAlign:'right' }}>
                  <a href={bankUrl} target="_blank" rel="noopener noreferrer"
                    style={{ color:'#2E3192', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, textDecoration:'none' }}>
                    ↗ Abrir em nova aba
                  </a>
                </div>
              </div>
            ) : (
              <div style={{ textAlign:'center', color:'#dc2626', padding:24 }}>Erro ao carregar documento.</div>
            )}
          </div>
        </div>
      )}

      {/* Banner sanções */}
      {hasActiveSanctions && (
        <div style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:12, padding:'12px 18px', marginBottom:16, display:'flex', alignItems:'center', gap:10, fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, color:'#dc2626' }}>
          ⚠️ Este fornecedor possui sanções ativas em CEIS/CNEP. A EQPI está ciente e realizará análise especial.
        </div>
      )}

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, marginBottom:20, borderBottom:'2px solid #e2e4ef', paddingBottom:0 }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding:'10px 18px', background:'none', border:'none', borderBottom:`2px solid ${tab===t?'#2E3192':'transparent'}`, marginBottom:-2, color:tab===t?'#2E3192':'#9B9B9B', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, cursor:'pointer', transition:'color .15s' }}>
            {t}
          </button>
        ))}
      </div>

      {/* ── Tab: Resumo ── */}
      {tab === 'Resumo' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>

          {/* Progresso documentos */}
          <Card style={{ borderRadius:14, padding:'18px 20px' }}>
            <SectionTitle>Progresso dos Documentos</SectionTitle>
            <div style={{ marginBottom:12 }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                <span style={{ fontFamily:'DM Sans,sans-serif', fontSize:12, color:'#9B9B9B' }}>Conformidade documental</span>
                <span style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, color:'#1a1c5e' }}>{score}%</span>
              </div>
              <ScoreBar value={score} />
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              {[
                { label:'Aprovados', count:validDocs,   color:'#22c55e' },
                { label:'Em análise', count:pendingDocs, color:'#f59e0b' },
                { label:'Não enviados', count:missingDocs, color:'#9B9B9B' },
                { label:'Rejeitados', count:rejDocs,    color:'#ef4444' },
              ].map(({ label, count, color }) => (
                <div key={label} style={{ textAlign:'center', padding:'10px 8px', background:`${color}10`, borderRadius:10, border:`1px solid ${color}30` }}>
                  <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:20, color }}>{count}</div>
                  <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:11, color:'#9B9B9B', marginTop:2 }}>{label}</div>
                </div>
              ))}
            </div>
          </Card>

          {/* Detalhes do convite */}
          <Card style={{ borderRadius:14, padding:'18px 20px' }}>
            <SectionTitle>Detalhes do Convite</SectionTitle>
            <div style={{ display:'grid', gap:12 }}>
              <div>
                <span style={lbl}>Tipo de Fornecimento</span>
                <span style={val}>
                  {inv?.tipo_fornecedor === 'produto' ? 'Produto'
                    : inv?.tipo_fornecedor === 'ambos' ? 'Produto & Serviço'
                    : inv?.tipo_fornecedor === 'servico' ? 'Serviço'
                    : '—'}
                </span>
              </div>
              <div>
                <span style={lbl}>Custeio</span>
                <span style={val}>{inv?.subsidiado ? '🟢 Subsidiado' : '⚪ Não subsidiado'}</span>
              </div>
              {data.city && (
                <div>
                  <span style={lbl}>Localização</span>
                  <span style={val}>{data.city} / {data.state}</span>
                </div>
              )}
              <div>
                <span style={lbl}>Convidado em</span>
                <span style={val}>{inv?.created_at ? new Date(inv.created_at).toLocaleDateString('pt-BR') : '—'}</span>
              </div>
              {seal?.issued_at && (
                <div>
                  <span style={lbl}>Homologado em</span>
                  <span style={{ ...val, color:'#22c55e' }}>{new Date(seal.issued_at).toLocaleDateString('pt-BR')}</span>
                </div>
              )}
            </div>
          </Card>

          {/* Dados gerais do fornecedor */}
          {cnpjDat && (
            <Card style={{ borderRadius:14, padding:'18px 20px', gridColumn:'1 / -1' }}>
              <SectionTitle>Dados Cadastrais</SectionTitle>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
                {[
                  ['Situação Cadastral', safeStr(cnpjDat.descricao_situacao_cadastral)],
                  ['Data de Abertura',   safeStr(cnpjDat.data_inicio_atividade)],
                  ['Porte',             safeStr(cnpjDat.porte)],
                  ['Capital Social',    cnpjDat.capital_social ? `R$ ${Number(cnpjDat.capital_social).toLocaleString('pt-BR')}` : '—'],
                  ['Natureza Jurídica', safeStr(cnpjDat.natureza_juridica)],
                  ['Município / UF',    `${safeStr(cnpjDat.municipio,'?')} / ${safeStr(cnpjDat.uf,'?')}`],
                ].map(([l, v]) => (
                  <div key={l} style={{ padding:'10px 12px', background:'#f8faff', borderRadius:10, border:'1px solid #e2e4ef' }}>
                    <div style={{ fontSize:10, color:'#9B9B9B', fontFamily:'Montserrat,sans-serif', fontWeight:700, textTransform:'uppercase', letterSpacing:.5, marginBottom:4 }}>{l}</div>
                    <div style={{ fontSize:13, fontWeight:600, color:'#1a1c5e', fontFamily:'DM Sans,sans-serif' }}>{v}</div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Endereço completo */}
          {cnpjDat && (cnpjDat.logradouro || cnpjDat.municipio) && (() => {
            const tipoLogr  = safeStr(cnpjDat.descricao_tipo_de_logradouro, '')
            const rua       = [tipoLogr, cnpjDat.logradouro, cnpjDat.numero, cnpjDat.complemento].filter(Boolean).join(' ') || '—'
            const bairro    = safeStr(cnpjDat.bairro)
            const cidade    = safeStr(cnpjDat.municipio)
            const uf        = safeStr(cnpjDat.uf)
            const cep       = cnpjDat.cep ? String(cnpjDat.cep).replace(/^(\d{5})(\d{3})$/, '$1-$2') : '—'
            return (
              <Card style={{ borderRadius:14, padding:'18px 20px', gridColumn:'1 / -1' }}>
                <SectionTitle>Endereço</SectionTitle>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
                  {[
                    ['Logradouro', rua],
                    ['Bairro',     bairro],
                    ['Cidade / UF', `${cidade} / ${uf}`],
                    ['CEP',        cep],
                  ].map(([l, v]) => (
                    <div key={l} style={{ padding:'10px 12px', background:'#f8faff', borderRadius:10, border:'1px solid #e2e4ef' }}>
                      <div style={{ fontSize:10, color:'#9B9B9B', fontFamily:'Montserrat,sans-serif', fontWeight:700, textTransform:'uppercase', letterSpacing:.5, marginBottom:4 }}>{l}</div>
                      <div style={{ fontSize:13, fontWeight:600, color:'#1a1c5e', fontFamily:'DM Sans,sans-serif' }}>{v}</div>
                    </div>
                  ))}
                </div>
              </Card>
            )
          })()}
        </div>
      )}

      {/* ── Tab: Documentos ── */}
      {tab === 'Documentos' && (
        <Card style={{ borderRadius:14, padding:'20px 24px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
            <SectionTitle>Documentos</SectionTitle>
            <div style={{ display:'flex', gap:10, fontSize:12, fontFamily:'DM Sans,sans-serif' }}>
              <span style={{ color:'#22c55e' }}>✓ {validDocs} aprovados</span>
              {pendingDocs > 0 && <span style={{ color:'#f59e0b' }}>⏳ {pendingDocs} em análise</span>}
              {missingDocs > 0 && <span style={{ color:'#9B9B9B' }}>○ {missingDocs} não enviados</span>}
              {rejDocs > 0     && <span style={{ color:'#ef4444' }}>✕ {rejDocs} rejeitados</span>}
            </div>
          </div>

          {docs.length === 0 ? (
            <div style={{ textAlign:'center', padding:'32px 0', color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>
              <div style={{ fontSize:32, marginBottom:8 }}>📄</div>
              <div>Nenhum documento encontrado.</div>
            </div>
          ) : (
            <div style={{ display:'grid', gap:8 }}>
              {docs.map((doc, i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', borderRadius:12, background:DOC_BG[doc.status]||'#f9fafb', border:`1px solid ${DOC_BORDER[doc.status]||'#e2e4ef'}` }}>
                  <StatusDot status={doc.status} />
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:'#1a1c5e', fontFamily:'Montserrat,sans-serif' }}>{doc.label}</div>
                    <div style={{ fontSize:11, color:'#9B9B9B', marginTop:2, fontFamily:'DM Sans,sans-serif' }}>
                      {DOC_STATUS_LABEL[doc.status] || doc.status}
                      {doc.source === 'AUTO' && ' · Auto-coletado'}
                      {doc.expires_at && ` · Vence ${new Date(doc.expires_at).toLocaleDateString('pt-BR')}`}
                      {doc.created_at && ` · Enviado ${new Date(doc.created_at).toLocaleDateString('pt-BR')}`}
                    </div>
                    {doc.review_note && (
                      <div style={{ fontSize:11, color:'#dc2626', marginTop:3, fontFamily:'DM Sans,sans-serif' }}>
                        ⚠ {doc.review_note}
                      </div>
                    )}
                  </div>
                  {doc.storage_path && (
                    <Button variant="neutral" size="sm" onClick={async () => {
                      const url = await documentApi.getSignedUrl(doc.storage_path)
                      window.open(url, '_blank')
                    }}>
                      👁 Ver
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* ── Tab: Inteligência CNPJ ── */}
      {tab === 'Inteligência CNPJ' && (
        <div style={{ display:'grid', gap:16 }}>

          {!cnpjC ? (
            <Card style={{ borderRadius:14, padding:'32px', textAlign:'center' }}>
              <div style={{ fontSize:32, marginBottom:8 }}>🔍</div>
              <div style={{ fontFamily:'DM Sans,sans-serif', color:'#9B9B9B' }}>Consulta CNPJ ainda não realizada.</div>
            </Card>
          ) : (
            <>
              {/* Sanções */}
              <Card style={{ borderRadius:14, padding:'20px 24px' }}>
                <SectionTitle>Sanções CEIS / CNEP</SectionTitle>
                {activeSancCeis.length === 0 && activeSancCnep.length === 0 ? (
                  <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 14px', background:'rgba(34,197,94,.06)', border:'1px solid rgba(34,197,94,.2)', borderRadius:10, fontSize:13, color:'#15803d', fontFamily:'Montserrat,sans-serif', fontWeight:600 }}>
                    ✅ Sem ocorrências em CEIS e CNEP
                  </div>
                ) : (
                  <div>
                    {[...activeSancCeis.map(s=>({...s,_src:'CEIS'})), ...activeSancCnep.map(s=>({...s,_src:'CNEP'}))].map((s,i) => (
                      <div key={i} style={{ background:'rgba(239,68,68,.05)', border:'1px solid rgba(239,68,68,.15)', borderRadius:10, padding:'10px 14px', marginBottom:8 }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                          <span style={{ fontWeight:700, color:'#dc2626', fontFamily:'Montserrat,sans-serif', fontSize:12 }}>{s._src}</span>
                          <span style={{ fontSize:11, color:'#9B9B9B' }}>
                            {s.dataInicioSancao && `Início: ${safeStr(s.dataInicioSancao)}`}
                            {s.dataFimSancao    && ` · Fim: ${safeStr(s.dataFimSancao)}`}
                          </span>
                        </div>
                        <div style={{ fontSize:12, color:'#1a1c5e', fontFamily:'DM Sans,sans-serif' }}>{safeStr(s.nomeOrgaoSancionador || s.orgaoSancionador, '—')}</div>
                        {s.tipoSancao && <div style={{ fontSize:11, color:'#9B9B9B', marginTop:2 }}>{safeStr(s.tipoSancao)}</div>}
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ fontSize:10, color:'#9B9B9B', marginTop:10, fontFamily:'DM Sans,sans-serif' }}>
                  Consultado: {cnpjC.consulted_at?.slice(0,16).replace('T',' ')} · Portal da Transparência
                </div>
              </Card>

              {/* Regime tributário */}
              {cnpjDat && (
                <Card style={{ borderRadius:14, padding:'20px 24px' }}>
                  <SectionTitle>Regime Tributário</SectionTitle>
                  {(() => {
                    const isOptante = cnpjDat.opcao_pelo_simples === true && !cnpjDat.data_exclusao_do_simples
                    const isMei     = cnpjDat.opcao_pelo_mei === true
                    const color  = isOptante ? '#15803d' : '#9B9B9B'
                    const bg     = isOptante ? 'rgba(34,197,94,.06)' : 'rgba(0,0,0,.03)'
                    const border = isOptante ? 'rgba(34,197,94,.2)' : '#e2e4ef'
                    const label  = isMei ? 'MEI' : isOptante ? 'Simples Nacional' : 'Lucro Presumido / Real'
                    const icon   = isOptante ? '✅' : isMei ? '🏪' : 'ℹ️'
                    return (
                      <div style={{ display:'flex', gap:10, alignItems:'flex-start', padding:'10px 12px', background:bg, border:`1px solid ${border}`, borderRadius:10 }}>
                        <span style={{ fontSize:20, flexShrink:0 }}>{icon}</span>
                        <div>
                          <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, color }}>{label}</div>
                          <div style={{ fontSize:11, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', marginTop:2 }}>
                            {isOptante && cnpjDat.data_opcao_pelo_simples && `Optante desde ${safeStr(cnpjDat.data_opcao_pelo_simples)}`}
                            {!isOptante && cnpjDat.data_exclusao_do_simples && `Excluído em ${safeStr(cnpjDat.data_exclusao_do_simples)}`}
                          </div>
                        </div>
                      </div>
                    )
                  })()}
                </Card>
              )}

              {/* CNAEs */}
              {cnpjDat?.cnae_fiscal && (
                <Card style={{ borderRadius:14, padding:'20px 24px' }}>
                  <SectionTitle>CNAEs</SectionTitle>
                  <div style={{ marginBottom:10 }}>
                    <div style={{ fontSize:10, color:'#9B9B9B', fontFamily:'Montserrat,sans-serif', fontWeight:700, textTransform:'uppercase', letterSpacing:.5, marginBottom:6 }}>Principal</div>
                    <div style={{ fontSize:13, background:'rgba(46,49,146,.05)', border:'1px solid rgba(46,49,146,.1)', padding:'8px 12px', borderRadius:8, color:'#1a1c5e', fontFamily:'DM Sans,sans-serif' }}>
                      <strong>{safeStr(cnpjDat.cnae_fiscal)}</strong> — {safeStr(cnpjDat.cnae_fiscal_descricao)}
                    </div>
                  </div>
                  {cnpjDat.cnaes_secundarios?.length > 0 && (
                    <div>
                      <div style={{ fontSize:10, color:'#9B9B9B', fontFamily:'Montserrat,sans-serif', fontWeight:700, textTransform:'uppercase', letterSpacing:.5, marginBottom:6 }}>
                        Secundários ({cnpjDat.cnaes_secundarios.length})
                      </div>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
                        {cnpjDat.cnaes_secundarios.map((c,i) => (
                          <span key={i} title={cnaeMap[String(c.codigo)] || safeStr(c.descricao)} style={{ fontSize:11, background:'rgba(46,49,146,.07)', color:'#2E3192', padding:'3px 8px', borderRadius:20, fontFamily:'DM Sans,sans-serif', cursor:'default' }}>
                            {safeStr(c.codigo)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </Card>
              )}

              {/* Quadro Societário */}
              {cnpjDat?.qsa?.length > 0 && (
                <Card style={{ borderRadius:14, padding:'20px 24px' }}>
                  <SectionTitle>Quadro Societário ({cnpjDat.qsa.length})</SectionTitle>
                  {cnpjDat.qsa.map((s, i) => (
                    <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'8px 12px', background:'#f9f9fb', borderRadius:8, marginBottom:4, fontSize:13 }}>
                      <span style={{ fontWeight:600, color:'#1a1c5e', fontFamily:'DM Sans,sans-serif' }}>{safeStr(s.nome_socio)}</span>
                      <span style={{ color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>{safeStr(s.qualificacao_socio)}</span>
                    </div>
                  ))}
                </Card>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
