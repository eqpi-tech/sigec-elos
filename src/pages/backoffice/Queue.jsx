import { useState, useEffect } from 'react'
import { useIsMobile } from '../../hooks/useIsMobile.js'
import { useNavigate, useParams } from 'react-router-dom'
import { adminApi, documentApi, questionnaireApi, assertivaApi } from '../../services/api.js'
import { Badge, Button, Card, ScoreBar, StatusDot, Spinner, PageHeader, SectionTitle, EmptyState } from '../../components/ui.jsx'
import { supabase } from '../../lib/supabase.js'

const RISK_COLOR = { Alto:'#ef4444', Médio:'#f59e0b', Baixo:'#22c55e' }

/** Converte qualquer valor para string segura para renderização React.
 *  Previne o erro "Objects are not valid as a React child" quando a BrasilAPI
 *  retorna campos como objetos {codigo, descricao} em vez de strings. */
function safeStr(val, fallback = '—') {
  if (val === null || val === undefined) return fallback
  if (typeof val === 'string') return val.trim() || fallback
  if (typeof val === 'number') return String(val)
  if (typeof val === 'boolean') return val ? 'Sim' : 'Não'
  if (Array.isArray(val)) return val.map(v => safeStr(v, '')).filter(Boolean).join(', ') || fallback
  if (typeof val === 'object') {
    // Portal da Transparência: {descricaoPortal, descricaoResumida}
    // BrasilAPI: {codigo, descricao}, {nome, poder, esfera, siglaUf}
    return val.descricaoPortal
      || val.descricaoResumida
      || val.descricao
      || val.nome
      || val.texto
      || val.sigla
      || val.codigo
      || JSON.stringify(val).slice(0, 80)
  }
  return String(val).trim() || fallback
}

// ─── Filtro de sanções ativas ────────────────────────────────────────────────
// Aplica dois filtros cumulativos:
// 1. CNPJ exato — descarta sanções de outras filiais do mesmo grupo econômico
// 2. Data/situação — descarta sanções históricas expiradas
function filterActiveSanctions(list, supplierCnpj) {
  if (!Array.isArray(list)) return []
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const cnpjNums = (supplierCnpj || '').replace(/\D/g, '')

  return list.filter(s => {
    // ── Filtro 1: CNPJ exato ──────────────────────────────────────────────
    // A API do Portal da Transparência pode retornar sanções de outras filiais
    // (mesmo grupo econômico). Descarta qualquer registro que não seja do CNPJ exato.
    if (cnpjNums) {
      // O CNPJ do sancionado pode estar aninhado em diferentes campos
      const cnpjRecord = (
        s.sancionado?.codigoFormatado ||
        s.pessoa?.cnpjFormatado       ||
        s.cnpjSancionado              ||
        s.cpfCnpj                     ||
        ''
      ).replace(/\D/g, '')
      if (cnpjRecord && cnpjRecord !== cnpjNums) return false
    }

    // ── Filtro 2: sanção realmente ativa ─────────────────────────────────
    const situacao = (s.situacaoDoSancionado || '').toLowerCase().trim()
    const situacaoAtiva = situacao === 'ativo' || situacao === 'vigente'
    let dataFimFutura = false
    if (s.dataFimSancao) {
      try {
        let end
        if (String(s.dataFimSancao).includes('/')) {
          const [d, m, y] = String(s.dataFimSancao).split('/')
          end = new Date(Number(y), Number(m) - 1, Number(d))
        } else { end = new Date(s.dataFimSancao) }
        if (!isNaN(end.getTime())) dataFimFutura = end >= today
      } catch {}
    }
    return situacaoAtiva || dataFimFutura
  })
}

// ─── Fila de homologação ──────────────────────────────────────────────────────
export function BackofficeQueue() {
  const navigate = useNavigate()
  const [queue, setQueue]   = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter]   = useState('Todos')
  useEffect(() => { adminApi.getQueue().then(setQueue).finally(()=>setLoading(false)) }, [])
  const filtered = filter==='Todos' ? queue : queue.filter(s=>s.riskLevel===filter)
  if (loading) return <div style={{ display:'flex',justifyContent:'center',alignItems:'center',height:'50vh' }}><Spinner size={48}/></div>
  return (
    <div style={{ padding:'28px 32px', maxWidth:1100, margin:'0 auto' }}>
      <PageHeader title="Fila de Análise" subtitle={`${queue.length} fornecedores aguardando aprovação`}/>
      <div style={{ display:'flex', gap:8, marginBottom:20 }}>
        {['Todos','Alto','Médio','Baixo'].map(f=>(
          <button key={f} onClick={()=>setFilter(f)} style={{ padding:'8px 16px',borderRadius:20,border:`1px solid ${filter===f?RISK_COLOR[f]||'#2E3192':'#e2e4ef'}`,background:filter===f?`${RISK_COLOR[f]||'#2E3192'}12`:'#fff',color:filter===f?RISK_COLOR[f]||'#2E3192':'#9B9B9B',fontFamily:'Montserrat,sans-serif',fontWeight:700,fontSize:12,cursor:'pointer' }}>
            {f==='Todos'?`Todos (${queue.length})`:`Risco ${f} (${queue.filter(s=>s.riskLevel===f).length})`}
          </button>
        ))}
      </div>
      {filtered.length===0 ? <EmptyState icon="✅" title="Fila vazia" subtitle="Nenhum item para o filtro selecionado"/> : filtered.map((s,i)=>(
        <Card key={i} hover style={{ borderRadius:14, padding:'16px 20px', marginBottom:12 }}>
          <div style={{ display:'flex', alignItems:'center', gap:16 }}>
            <div style={{ width:48,height:48,borderRadius:12,background:'rgba(46,49,146,.1)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:800,fontSize:18,color:'#2E3192',fontFamily:'Montserrat,sans-serif',flexShrink:0 }}>{s.razaoSocial?.[0]}</div>
            <div style={{ flex:1 }}>
              <div style={{ display:'flex',alignItems:'center',gap:10 }}>
                <div style={{ fontSize:15,fontWeight:700,color:'#1a1c5e',fontFamily:'Montserrat,sans-serif' }}>{s.razaoSocial}</div>
                <span style={{ fontSize:10,fontWeight:700,color:RISK_COLOR[s.riskLevel],background:`${RISK_COLOR[s.riskLevel]}18`,padding:'2px 10px',borderRadius:20,fontFamily:'Montserrat,sans-serif' }}>Risco {s.riskLevel}</span>
                {s.hasSanctions && <span style={{ fontSize:10,fontWeight:700,color:'#dc2626',background:'rgba(239,68,68,.1)',padding:'2px 8px',borderRadius:20,fontFamily:'Montserrat,sans-serif' }}>⚠ SANÇÕES</span>}
              </div>
              <div style={{ fontSize:12, color:'#9B9B9B', marginTop:2 }}>{s.cnpj} · {s.requestedAt}</div>
              <div style={{ display:'flex',gap:12,marginTop:6,alignItems:'center' }}>
                <div style={{ width:160 }}><ScoreBar score={s.score||0}/></div>
                <span style={{ fontSize:11,color:'#9B9B9B' }}>{s.documents?.filter(d=>d.status==='VALID').length||0}/{s.documents?.length||0} docs válidos</span>
              </div>
            </div>
            <Button variant="primary" size="md" onClick={()=>navigate(`/backoffice/analise/${s.id}`)}>Analisar →</Button>
          </div>
        </Card>
      ))}
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function SanctionCard({ sanctions, cnpj }) {
  // Re-filtra no cliente: CNPJ exato + data/situação
  const rawCeis  = sanctions?.ceis  || []
  const rawCnep  = sanctions?.cnep  || []
  const activeCeis  = filterActiveSanctions(rawCeis, cnpj)
  const activeCnep  = filterActiveSanctions(rawCnep, cnpj)
  // Histórico = todos os registros retornados (ceisHistory/cnepHistory ou raw sem filtro)
  const historyCeis = sanctions?.ceisHistory?.length ? sanctions.ceisHistory : rawCeis
  const historyCnep = sanctions?.cnepHistory?.length ? sanctions.cnepHistory : rawCnep
  const totalActive  = activeCeis.length + activeCnep.length
  const totalHistory = historyCeis.length + historyCnep.length
  const expiredCount = totalHistory - totalActive

  if (totalHistory === 0) {
    return <div style={{ display:'flex',alignItems:'center',gap:8,padding:'8px 12px',background:'rgba(34,197,94,.06)',border:'1px solid rgba(34,197,94,.2)',borderRadius:10,fontSize:13,color:'#15803d',fontFamily:'Montserrat,sans-serif',fontWeight:600 }}>✅ Sem ocorrências em CEIS e CNEP</div>
  }

  return (
    <div>
      {totalActive > 0 && (
        <div style={{ background:'rgba(239,68,68,.06)',border:'1px solid rgba(239,68,68,.25)',borderRadius:10,padding:'12px 14px',marginBottom:8 }}>
          <div style={{ fontFamily:'Montserrat,sans-serif',fontWeight:700,fontSize:13,color:'#dc2626',marginBottom:8 }}>
            ⚠ {totalActive} sanção{totalActive>1?'ões':''} ATIVA{totalActive>1?'S':''} detectada{totalActive>1?'s':''}
          </div>
          {[...activeCeis.map(s=>({...s,_src:'CEIS'})), ...activeCnep.map(s=>({...s,_src:'CNEP'}))].map((s,i)=>(
            <div key={i} style={{ background:'#fff',borderRadius:8,padding:'8px 10px',marginBottom:4,fontSize:12,border:'1px solid rgba(239,68,68,.15)' }}>
              <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:2 }}>
                <span style={{ fontWeight:700,color:'#dc2626',fontFamily:'Montserrat,sans-serif' }}>{s._src}</span>
                <span style={{ fontSize:10,color:'#9B9B9B' }}>
                  {s.dataInicioSancao && `Início: ${safeStr(s.dataInicioSancao)}`}
                  {s.dataFimSancao   && ` · Fim: ${safeStr(s.dataFimSancao)}`}
                  {!s.dataFimSancao  && ' · Sem prazo determinado'}
                </span>
              </div>
              <div style={{ color:'#1a1c5e',fontFamily:'DM Sans,sans-serif' }}>
                {safeStr(s.nomeOrgaoSancionador || s.orgaoSancionador, '—')}
              </div>
              {(s.fundamentacaoLegal || s.tipoSancao) && (
                <div style={{ color:'#9B9B9B',fontSize:11,marginTop:2 }}>
                  {safeStr(s.tipoSancao, '')}
                  {s.fundamentacaoLegal && ` · ${safeStr(s.fundamentacaoLegal)}`}
                </div>
              )}
              {s.situacaoDoSancionado && (
                <div style={{ marginTop:2,fontSize:10,color:'#f59e0b',fontWeight:700 }}>Situação: {safeStr(s.situacaoDoSancionado)}</div>
              )}
            </div>
          ))}
        </div>
      )}
      {expiredCount > 0 && (
        <div style={{ fontSize:11,color:'#9B9B9B',fontFamily:'DM Sans,sans-serif',padding:'6px 10px',background:'rgba(0,0,0,.03)',borderRadius:8,border:'1px solid #f0f0f0' }}>
          📋 {expiredCount} sanção{expiredCount>1?'ões':''} histórica{expiredCount>1?'s':''} expirada{expiredCount>1?'s':''} (não afetam a homologação atual)
        </div>
      )}
    </div>
  )
}

function SimplesCard({ cnpjData }) {
  if (!cnpjData) return null
  const isOptante   = cnpjData.opcao_pelo_simples === true && !cnpjData.data_exclusao_do_simples
  const isMei       = cnpjData.opcao_pelo_mei === true
  const dataOpcao   = safeStr(cnpjData.data_opcao_pelo_simples, '')
  const dataExclusao= safeStr(cnpjData.data_exclusao_do_simples, '')

  const color   = isOptante ? '#15803d' : '#9B9B9B'
  const bg      = isOptante ? 'rgba(34,197,94,.06)' : 'rgba(0,0,0,.03)'
  const border  = isOptante ? 'rgba(34,197,94,.2)'  : '#e2e4ef'
  const label   = isMei ? 'MEI' : isOptante ? 'Simples Nacional' : 'Lucro Presumido / Real'
  const icon    = isOptante ? '✅' : isMei ? '🏪' : 'ℹ️'

  return (
    <div style={{ display:'flex',gap:10,alignItems:'flex-start',padding:'10px 12px',background:bg,border:`1px solid ${border}`,borderRadius:10 }}>
      <span style={{ fontSize:18,flexShrink:0,marginTop:1 }}>{icon}</span>
      <div>
        <div style={{ fontFamily:'Montserrat,sans-serif',fontWeight:700,fontSize:13,color }}>
          {label}
        </div>
        <div style={{ fontSize:11,color:'#9B9B9B',fontFamily:'DM Sans,sans-serif',marginTop:1 }}>
          {isOptante && dataOpcao && `Optante desde ${dataOpcao}`}
          {!isOptante && dataExclusao && `Excluído em ${dataExclusao}`}
          {!isOptante && !dataExclusao && !isMei && 'Não optante pelo Simples Nacional'}
        </div>
      </div>
    </div>
  )
}

// ─── Análise individual ───────────────────────────────────────────────────────
export function BackofficeAnalysis() {
  const mobile = useIsMobile()
  const { id } = useParams()
  const navigate = useNavigate()
  const [data, setData]         = useState(null)
  const [loading, setLoading]   = useState(true)
  const [level, setLevel]       = useState('homologado')  // 'verificado' | 'homologado'
  const [obs, setObs]           = useState('')
  const [done, setDone]         = useState(null)
  const [processing, setProcessing] = useState(false)
  const [docActions, setDocActions] = useState({})
  const [revertModal, setRevertModal] = useState(false)
  const [revertReason, setRevertReason] = useState('')
  const [activeTab, setActiveTab] = useState('docs')  // 'docs' | 'questionario' | 'banco' | 'dre'
  const [docAiModal, setDocAiModal] = useState(null)  // { doc, extractType: 'bank'|'dre' }
  // Dados bancários
  const [bankData,     setBankData]     = useState(null)  // { bank_name, bank_code, bank_agency, bank_account, account_type, pix_key }
  const [bankLoading,  setBankLoading]  = useState(false)
  const [bankSaving,   setBankSaving]   = useState(false)
  const [bankAiLoading,setBankAiLoading]= useState(false)
  // Dados financeiros DRE
  const [dreList,      setDreList]      = useState([])    // array de { id, year, receita, ativo, passivo, lucro, ebitda, estoque }
  const [dreLoading,   setDreLoading]   = useState(false)
  const [dreEditing,   setDreEditing]   = useState(null)  // objeto em edição
  const [dreSaving,    setDreSaving]    = useState(false)
  const [dreAiLoading, setDreAiLoading] = useState(false)
  const [qaAnswers, setQaAnswers] = useState([])
  const [assertivaReport,  setAssertivaReport]  = useState(undefined)
  const [assertivaLoading, setAssertivaLoading] = useState(false)
  const [assertivaError,   setAssertivaError]   = useState('')
  // Modal de aprovação de documento com data de expiração
  const [approveModal, setApproveModal] = useState(null)  // { docId, docLabel }
  const [approveExpiry, setApproveExpiry] = useState('')
  const [approveNote, setApproveNote] = useState('')
  const [autoFinalized, setAutoFinalized] = useState(null)  // 'approved' | 'rejected'
  const [cnaeMap, setCnaeMap] = useState({})
  // Modal de rejeição com motivos parametrizados
  const [rejectDocModal, setRejectDocModal] = useState(null)   // { docId, docLabel }
  const [rejectReasons,  setRejectReasons]  = useState([])
  const [rejectCode,     setRejectCode]     = useState('')
  const [rejectCustom,   setRejectCustom]   = useState('')
  // Número de inscrição (Municipal/Estadual)
  const [approveInscription, setApproveInscription] = useState('')
  // Log do Processo
  const [logData,       setLogData]       = useState([])
  const [logLoading,    setLogLoading]    = useState(false)
  const [logDateFrom,   setLogDateFrom]   = useState('')
  const [logDateTo,     setLogDateTo]     = useState('')
  const [logDesc,       setLogDesc]       = useState('')
  // Convites recebidos pelo fornecedor
  const [inviteLog,     setInviteLog]     = useState([])
  // Categorias: expandir/recolher "Ver mais" + expandir docs por categoria
  const [catsExpanded,  setCatsExpanded]  = useState(false)
  const [expandedCat,   setExpandedCat]   = useState(null)  // category id
  // Sócios manuais (Item 7)
  const [partners,      setPartners]      = useState([])
  const [partnerModal,  setPartnerModal]  = useState(false)
  const [partnerForm,   setPartnerForm]   = useState({ tipo:'pf', cpf_cnpj:'', nome:'', cargo:'', nacionalidade:'', participacao:'' })
  const [partnerSaving, setPartnerSaving] = useState(false)
  // Sanções manuais (Item 9)
  const [manualSanc,    setManualSanc]    = useState([])
  const [sancModal,     setSancModal]     = useState(false)
  const [sancForm,      setSancForm]      = useState({ tipo:'', data_final:'', orgao:'', uf:'' })
  const [sancSaving,    setSancSaving]    = useState(false)
  // Arquivamento (Item 10)
  const [archiveModal,  setArchiveModal]  = useState(false)
  const [archiveReason, setArchiveReason] = useState('')
  const [archiving,     setArchiving]     = useState(false)
  const [isArchived,    setIsArchived]    = useState(false)

  useEffect(() => {
    adminApi.getSealAnalysis(id)
      .then(d => {
        setData(d)
        setLevel(d.seals?.[0]?.seal_type || d.seals?.[0]?.level === 'Premium' ? 'homologado' : 'homologado')
        // Sugere data de expiração = fim do plano do fornecedor
        if (d.plan?.ends_at) setApproveExpiry(d.plan.ends_at.slice(0, 10))
        // Email de início de análise (único por ciclo — deduplica via audit_log)
        sendAnalysisStartEmail(d)
      })
      .finally(() => setLoading(false))
    questionnaireApi.getAnswersForSupplier(id)
      .then(setQaAnswers)
      .catch(() => {})
    assertivaApi.getLast(id)
      .then(setAssertivaReport)
      .catch(() => setAssertivaReport(null))
    // Carrega motivos de recusa parametrizados
    adminApi.getRejectionReasons()
      .then(setRejectReasons)
      .catch(() => {})
    // Carrega dados bancários e DRE
    supabase.from('supplier_bank_accounts').select('*').eq('supplier_id', id).maybeSingle()
      .then(({ data }) => setBankData(data || {}))
    supabase.from('supplier_financials').select('*').eq('supplier_id', id).order('year', { ascending: false })
      .then(({ data }) => setDreList(data || []))
    // Carrega convites recebidos pelo fornecedor
    adminApi.getSupplierInvitations(id).then(setInviteLog).catch(() => {})
    // Carrega sócios manuais (Item 7)
    supabase.from('supplier_partners').select('*').eq('supplier_id', id).order('created_at')
      .then(({ data: rows }) => setPartners(rows || []))
    // Carrega sanções manuais (Item 9)
    supabase.from('supplier_sanctions_manual').select('*').eq('supplier_id', id).order('created_at', { ascending: false })
      .then(({ data: rows }) => setManualSanc(rows || []))
    // Verifica se arquivado (Item 10)
    supabase.from('suppliers').select('archived_at').eq('id', id).maybeSingle()
      .then(({ data: s }) => setIsArchived(!!s?.archived_at))
  }, [id])

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

  const savePartner = async () => {
    if (!partnerForm.nome.trim()) return
    setPartnerSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    await supabase.from('supplier_partners').insert({
      supplier_id:   id,
      tipo:          partnerForm.tipo,
      cpf_cnpj:      partnerForm.cpf_cnpj || null,
      nome:          partnerForm.nome.trim(),
      cargo:         partnerForm.cargo || null,
      nacionalidade: partnerForm.nacionalidade || null,
      participacao:  partnerForm.participacao ? Number(partnerForm.participacao) : null,
      registered_by: session?.user?.id,
    })
    const { data: rows } = await supabase.from('supplier_partners').select('*').eq('supplier_id', id).order('created_at')
    setPartners(rows || [])
    setPartnerForm({ tipo:'pf', cpf_cnpj:'', nome:'', cargo:'', nacionalidade:'', participacao:'' })
    setPartnerModal(false)
    setPartnerSaving(false)
  }

  const deletePartner = async (pid) => {
    await supabase.from('supplier_partners').delete().eq('id', pid)
    setPartners(p => p.filter(x => x.id !== pid))
  }

  const saveSanction = async () => {
    if (!sancForm.tipo.trim()) return
    setSancSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    await supabase.from('supplier_sanctions_manual').insert({
      supplier_id:   id,
      tipo:          sancForm.tipo.trim(),
      data_final:    sancForm.data_final || null,
      orgao:         sancForm.orgao || null,
      uf:            sancForm.uf || null,
      registered_by: session?.user?.id,
    })
    const { data: rows } = await supabase.from('supplier_sanctions_manual').select('*').eq('supplier_id', id).order('created_at', { ascending: false })
    setManualSanc(rows || [])
    setSancForm({ tipo:'', data_final:'', orgao:'', uf:'' })
    setSancModal(false)
    setSancSaving(false)
  }

  const deleteSanction = async (sid) => {
    await supabase.from('supplier_sanctions_manual').delete().eq('id', sid)
    setManualSanc(p => p.filter(x => x.id !== sid))
  }

  const handleArchive = async () => {
    setArchiving(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (isArchived) {
      await supabase.from('suppliers').update({ archived_at: null, archived_by: null, archive_reason: null }).eq('id', id)
      setIsArchived(false)
    } else {
      await supabase.from('suppliers').update({
        archived_at:     new Date().toISOString(),
        archived_by:     session?.user?.id,
        archive_reason:  archiveReason || null,
      }).eq('id', id)
      setIsArchived(true)
    }
    setArchiveModal(false)
    setArchiveReason('')
    setArchiving(false)
  }

  const sendAnalysisStartEmail = async (supplierData) => {
    if (!supplierData?.user_id) return
    try {
      // Verifica se já enviamos este email hoje (audit_log)
      const { data: existing } = await supabase
        .from('audit_log')
        .select('id')
        .eq('entity_id', id)
        .eq('action', 'ANALYSIS_STARTED')
        .gte('created_at', new Date(Date.now() - 86400000).toISOString())
        .limit(1)
      if (existing?.length > 0) return
      await supabase.from('audit_log').insert({
        action: 'ANALYSIS_STARTED', entity_type: 'supplier', entity_id: id,
        metadata: { razao_social: supplierData.razao_social },
      })
      // Envia email
      await fetch('/.netlify/functions/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: supplierData.user_id,
          subject: '🔍 Sua homologação entrou em análise — SIGEC-ELOS',
          html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto">
            <div style="background:#2E3192;padding:28px;border-radius:12px 12px 0 0;text-align:center">
              <h1 style="color:#fff;margin:0;font-size:22px">SIGEC-ELOS</h1>
            </div>
            <div style="background:#fff;padding:28px;border:1px solid #e2e8f0;border-top:none">
              <p>Ola, <strong>${supplierData.razao_social}</strong>!</p>
              <p>Sua solicitacao de homologacao esta sendo analisada pela equipe EQPI. Em breve voce recebera o resultado.</p>
              <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px;margin:20px 0">
                <strong style="color:#1d4ed8">O que acontece agora?</strong>
                <ul style="margin:8px 0 0;padding-left:20px;color:#374151;font-size:13px">
                  <li>Nossa equipe revisa cada documento enviado</li>
                  <li>Se houver pendencias, voce sera notificado</li>
                  <li>Ao final, voce recebe o resultado por email</li>
                </ul>
              </div>
              <a href="https://sigecelos.com.br/fornecedor/documentos" style="display:inline-block;background:#2E3192;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold">Ver meus documentos →</a>
            </div>
            <div style="background:#f8fafc;padding:14px;border-radius:0 0 12px 12px;text-align:center;font-size:12px;color:#9B9B9B">EQPI Tech - SIGEC-ELOS</div>
          </div>`,
        }),
      })
    } catch (e) { console.warn('Email início análise:', e.message) }
  }

  const handleGenerateAssertiva = async () => {
    setAssertivaLoading(true)
    setAssertivaError('')
    try {
      const result = await assertivaApi.generate(id)
      setAssertivaReport(result.report)
    } catch(e) {
      setAssertivaError(e.message)
    }
    setAssertivaLoading(false)
  }

  // Verifica documentos impeditivos antes de aprovar
  const blockingMissing = data?.documents?.filter(d =>
    d.source === 'REQUIRED' && d.status === 'MISSING'
  ) || []
  // Considera impeditivo apenas documentos obrigatórios não-auto que ainda não foram enviados
  const hardBlocked = blockingMissing.filter(d => d.source !== 'AUTO' && !['37','61','62'].includes(String(d.type)))

  const handleApprove = async () => {
    if (hardBlocked.length > 0) {
      alert(`Não é possível homologar: ${hardBlocked.length} documento(s) obrigatório(s) ainda não enviado(s):\n${hardBlocked.map(d=>d.label).join('\n')}`)
      return
    }
    setProcessing(true)
    await adminApi.approveSeal(id, level)
    // Notificação de resultado
    try {
      await fetch('/.netlify/functions/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: data.user_id,  // send-email resolve o e-mail server-side via auth.admin
          subject: `✅ Parabéns! Selo ELOS ${level} emitido — ${data.razao_social}`,
          html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto">
            <div style="background:#2E3192;padding:32px;border-radius:12px 12px 0 0;text-align:center">
              <h1 style="color:#fff;margin:0 0 4px;font-size:24px">SIGEC-ELOS</h1>
              <p style="color:#C7D2FE;margin:0;font-size:13px">Plataforma de Homologação de Fornecedores</p>
            </div>
            <div style="background:#fff;padding:32px;border:1px solid #e2e8f0;border-top:none">
              <div style="text-align:center;margin-bottom:24px">
                <div style="font-size:48px">🏅</div>
                <h2 style="color:#15803d;margin:8px 0 4px;font-size:20px">Homologação Aprovada!</h2>
              </div>
              <p style="color:#374151;margin:0 0 16px">Olá, <strong>${data.razao_social}</strong>!</p>
              <p style="color:#374151;margin:0 0 20px">Sua empresa foi <strong>homologada</strong> e está apta a participar de processos de fornecimento com empresas compradoras da rede SIGEC-ELOS.</p>
              <table style="width:100%;border-collapse:collapse;margin:0 0 24px">
                <tr><td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:bold;width:40%;font-size:13px">Empresa</td><td style="padding:10px;border:1px solid #e2e8f0;font-size:13px">${data.razao_social}</td></tr>
                <tr><td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:bold;font-size:13px">CNPJ</td><td style="padding:10px;border:1px solid #e2e8f0;font-size:13px;font-family:monospace">${data.cnpj}</td></tr>
                <tr><td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:bold;font-size:13px">Nível do Selo</td><td style="padding:10px;border:1px solid #e2e8f0;font-size:14px;color:#F47E2F;font-weight:bold">Selo ELOS ${level}</td></tr>
                <tr><td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:bold;font-size:13px">Data de Emissão</td><td style="padding:10px;border:1px solid #e2e8f0;font-size:13px">${new Date().toLocaleDateString('pt-BR')}</td></tr>
              </table>
              <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:16px;margin-bottom:24px">
                <p style="margin:0;font-size:13px;color:#15803d">✅ <strong>Sua empresa já está visível no marketplace</strong> para compradores qualificados da plataforma.</p>
              </div>
              <div style="text-align:center">
                <a href="https://elos.eqpitech.com.br/fornecedor/dashboard" style="display:inline-block;background:#F47E2F;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px">Acessar meu painel →</a>
              </div>
            </div>
            <div style="background:#f8fafc;padding:16px;border-radius:0 0 12px 12px;text-align:center;font-size:12px;color:#9B9B9B">EQPI Tech · SIGEC-ELOS · elos.eqpitech.com.br</div>
          </div>`,
        })
      })
    } catch (e) { console.warn('Email notif:', e.message) }
    setDone('approved')
    setProcessing(false)
  }
  const handleReject = async () => {
    if (!obs) { alert('Informe o motivo da rejeição'); return }
    setProcessing(true)
    await adminApi.rejectSeal(id, obs)
    try {
      await fetch('/.netlify/functions/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: data.user_id,  // send-email resolve o e-mail server-side via auth.admin
          subject: '❌ Atualização sobre sua homologação SIGEC-ELOS',
          html: `<p>Olá, <strong>${data.razao_social}</strong>!</p>
            <p>Após análise, sua solicitação de homologação foi <strong>reprovada</strong> pelo seguinte motivo:</p>
            <blockquote style="border-left:4px solid #dc2626;padding-left:16px;color:#374151">${obs}</blockquote>
            <p>Corrija as pendências e solicite uma nova análise pelo painel do fornecedor.</p>
            <p><a href="${window.location.origin}/fornecedor/documentos">Acessar meus documentos →</a></p>`,
        })
      })
    } catch (e) { console.warn('Email notif:', e.message) }
    setDone('rejected')
    setProcessing(false)
  }
  const openApproveModal = (doc) => {
    setApproveModal({ docId: doc.id, docLabel: doc.label, docLabelLower: (doc.label || '').toLowerCase() })
    setApproveNote('')
    setApproveInscription('')
    // mantém a sugestão de expiração já definida no load
  }

  const fetchLog = async () => {
    setLogLoading(true)
    try {
      const rows = await adminApi.getProcessLog(id, { dateFrom: logDateFrom, dateTo: logDateTo, description: logDesc })
      setLogData(rows)
    } catch(e) { console.error(e) }
    finally { setLogLoading(false) }
  }

  const handleDocApprove = async () => {
    if (!approveModal) return
    setDocActions(prev => ({ ...prev, [approveModal.docId]: 'loading' }))
    setApproveModal(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/.netlify/functions/admin-approve-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          documentId: approveModal.docId,
          status: 'VALID',
          expiresAt: approveExpiry || undefined,
          note: approveNote || 'Aprovado pelo backoffice',
          inscriptionNumber: approveInscription || undefined,
        }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error)
      setDocActions(prev => ({ ...prev, [approveModal.docId]: 'VALID' }))
      setData(prev => ({
        ...prev,
        documents: prev.documents.map(d => d.id === approveModal.docId ? { ...d, status: 'VALID', expires_at: approveExpiry } : d),
      }))
      if (result.autoFinalized) setAutoFinalized(result.outcome)
    } catch (e) {
      alert('Erro ao aprovar: ' + e.message)
      setDocActions(prev => ({ ...prev, [approveModal.docId]: undefined }))
    }
  }

  const handleDocReject = (docId, docLabel) => {
    setRejectCode('')
    setRejectCustom('')
    setRejectDocModal({ docId, docLabel })
  }

  const confirmDocReject = async () => {
    if (!rejectDocModal || !rejectCode) return
    const { docId } = rejectDocModal
    const selectedReason = rejectReasons.find(r => r.code === rejectCode)
    const motivo = rejectCode === 'OUTRO' ? rejectCustom : (selectedReason?.label || 'Rejeitado pelo backoffice')
    setRejectDocModal(null)
    setDocActions(prev => ({ ...prev, [docId]: 'loading' }))
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/.netlify/functions/admin-approve-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ documentId: docId, status: 'REJECTED', note: motivo }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error)
      setDocActions(prev => ({ ...prev, [docId]: 'REJECTED' }))
      setData(prev => ({
        ...prev,
        documents: prev.documents.map(d => d.id === docId ? { ...d, status: 'REJECTED', review_note: motivo } : d),
      }))
      if (result.autoFinalized) setAutoFinalized(result.outcome)
    } catch (e) {
      alert('Erro ao rejeitar: ' + e.message)
      setDocActions(prev => ({ ...prev, [docId]: undefined }))
    }
  }

  // ── Dados Bancários ──────────────────────────────────────────────────────────
  const saveBankData = async () => {
    if (!bankData) return
    setBankSaving(true)
    try {
      const userId = (await supabase.auth.getUser()).data.user?.id
      const { error } = await supabase.from('supplier_bank_accounts').upsert(
        { ...bankData, supplier_id: id, verified_by: userId, verified_at: new Date().toISOString() },
        { onConflict: 'supplier_id' }
      )
      if (error) throw error
    } catch (e) { alert('Erro ao salvar: ' + e.message) }
    finally { setBankSaving(false) }
  }

  const extractBankWithAI = async () => {
    const bankDoc = data?.documents?.find(d =>
      (d.label?.toLowerCase().includes('banco') || d.label?.toLowerCase().includes('conta') || d.label?.toLowerCase().includes('bancár')) && d.storage_path
    ) || data?.documents?.find(d => d.storage_path && d.status !== 'MISSING')
    if (!bankDoc?.storage_path) { alert('Nenhum documento com arquivo encontrado para análise.'); return }
    setBankAiLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/.netlify/functions/ai-extract-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ storagePath: bankDoc.storage_path, extractType: 'bank', supplierId: id }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error)
      if (result.extracted) setBankData(prev => ({ ...(prev || {}), ...result.extracted }))
      if (result.warning) alert('⚠️ ' + result.warning)
    } catch (e) { alert('Erro na extração: ' + e.message) }
    finally { setBankAiLoading(false) }
  }

  // ── DRE ──────────────────────────────────────────────────────────────────────
  const saveDre = async () => {
    if (!dreEditing) return
    setDreSaving(true)
    try {
      const { id: dreId, supplier_id: _sid, verified_by: _vby, verified_at: _vat, created_at: _ca, updated_at: _ua, ...fields } = dreEditing
      const userId = (await supabase.auth.getUser()).data.user?.id
      if (dreId) {
        const { error } = await supabase.from('supplier_financials')
          .update({ ...fields, verified_by: userId, verified_at: new Date().toISOString() }).eq('id', dreId)
        if (error) throw error
        setDreList(prev => prev.map(d => d.id === dreId ? { ...d, ...fields } : d))
      } else {
        const { data: inserted, error } = await supabase.from('supplier_financials')
          .insert({ ...fields, supplier_id: id, verified_by: userId, verified_at: new Date().toISOString() }).select().single()
        if (error) throw error
        setDreList(prev => [inserted, ...prev].sort((a, b) => b.year - a.year))
      }
      setDreEditing(null)
    } catch (e) { alert('Erro ao salvar DRE: ' + e.message) }
    finally { setDreSaving(false) }
  }

  const extractDreWithAI = async (storagePath) => {
    if (!storagePath) { alert('Selecione um documento DRE com arquivo.'); return }
    setDreAiLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/.netlify/functions/ai-extract-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ storagePath, extractType: 'dre', supplierId: id }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error)
      if (result.extracted) setDreEditing(prev => ({ ...(prev || {}), ...result.extracted }))
      if (result.warning) alert('⚠️ ' + result.warning)
    } catch (e) { alert('Erro na extração: ' + e.message) }
    finally { setDreAiLoading(false) }
  }

  // Detecta se o doc é de dados bancários ou DRE (para modal de extração IA)
  function getDocAiType(doc) {
    const label = (doc.label || '').toLowerCase()
    if (label.includes('bancár') || label.includes('banco') || label.includes('conta corrente') || label.includes('conta poupan') || label.includes('comprovante de conta'))
      return 'bank'
    if (label.includes('dre') || label.includes('balanço') || label.includes('balanco') || label.includes('resultado do exerc') || label.includes('demonstração de resultado'))
      return 'dre'
    return null
  }

  if (loading) return <div style={{ display:'flex',justifyContent:'center',alignItems:'center',height:'50vh' }}><Spinner size={48}/></div>
  if (!data) return null

  const docs    = data.documents || []
  const ok      = docs.filter(d=>d.status==='VALID').length
  const miss    = docs.filter(d=>['MISSING','EXPIRED','REJECTED'].includes(d.status)).length
  const cnpjC   = data.cnpj_consultation
  const cnpjDat = cnpjC?.cnpj_data
  const sanctions = cnpjC?.sanctions_data  // { ceis, cnep, ceisHistory, cnepHistory }

  // Re-filtra no cliente: CNPJ exato + data/situação
  // Corrige dados históricos onde a API retornou sanções de outras filiais
  const supplierCnpj = data.cnpj || ''
  const activeSancCeis = filterActiveSanctions(sanctions?.ceis || [], supplierCnpj)
  const activeSancCnep = filterActiveSanctions(sanctions?.cnep || [], supplierCnpj)
  const hasActiveSanctions = activeSancCeis.length > 0 || activeSancCnep.length > 0

  // Score dinâmico: docs VALID / total exigidos × 100
  const allDocs        = data?.documents || []
  const totalRequired  = allDocs.length
  const validCount     = allDocs.filter(d => d.status === 'VALID').length
  const liveScore      = totalRequired > 0 ? Math.round((validCount / totalRequired) * 100) : 0

  // Guard: selo já emitido?
  const sealAlreadyActive = data?.seals?.[0]?.status === 'ACTIVE'

  if (done || autoFinalized) {
    const outcome = done || autoFinalized
    const isAuto  = !done && !!autoFinalized
    return (
      <div style={{ maxWidth:600,margin:'80px auto',padding:24,textAlign:'center' }}>
        <div style={{ fontSize:64,marginBottom:16 }}>{outcome==='approved'?'✅':'❌'}</div>
        <div style={{ fontFamily:'Montserrat,sans-serif',fontWeight:800,fontSize:22,color:'#1a1c5e',marginBottom:8 }}>
          {outcome==='approved'?`Selo ELOS ${level} emitido!`:'Solicitação rejeitada'}
        </div>
        {isAuto && (
          <div style={{ background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:10,padding:'10px 16px',marginBottom:16,fontSize:13,color:'#1d4ed8' }}>
            ⚡ Homologação finalizada automaticamente após revisão de todos os documentos
          </div>
        )}
        <div style={{ fontFamily:'DM Sans,sans-serif',fontSize:15,color:'#9B9B9B',marginBottom:24 }}>
          {outcome==='approved'?'Fornecedor agora visível no marketplace.':`Notificação enviada ao fornecedor por e-mail.`}
        </div>
        <Button variant="primary" onClick={()=>navigate('/backoffice/fila')}>← Voltar à fila</Button>
      </div>
    )
  }

  return (
    <div style={{ maxWidth:980,margin:'0 auto',padding:'24px' }}>
      <button onClick={()=>navigate('/backoffice/fila')} style={{ background:'none',border:'none',cursor:'pointer',color:'#2E3192',fontSize:14,fontFamily:'DM Sans,sans-serif',fontWeight:600,marginBottom:16,display:'flex',alignItems:'center',gap:6,padding:0 }}>
        ← Voltar à fila
      </button>

      {/* Banner de alerta de sanção no topo */}
      {hasActiveSanctions && (
        <div style={{ background:'#fee2e2',border:'1px solid #fca5a5',borderRadius:12,padding:'12px 18px',marginBottom:16,display:'flex',alignItems:'center',gap:10,fontFamily:'Montserrat,sans-serif',fontWeight:700,fontSize:13,color:'#dc2626' }}>
          ⚠️ ATENÇÃO — Este fornecedor possui sanções ativas em CEIS/CNEP. A homologação requer análise especial obrigatória.
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:20 }}>
        <div>
          {/* Header do fornecedor */}
          <Card style={{ borderRadius:16,padding:'20px 24px',marginBottom:16 }}>
            <div style={{ display:'flex',gap:16,alignItems:'center' }}>
              <div style={{ width:56,height:56,borderRadius:14,background:'rgba(46,49,146,.1)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:800,fontSize:22,color:'#2E3192',fontFamily:'Montserrat,sans-serif' }}>
                {data.razao_social?.[0]}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:18,fontWeight:800,color:'#1a1c5e',fontFamily:'Montserrat,sans-serif' }}>{data.razao_social}</div>
                <div style={{ fontSize:13,color:'#9B9B9B' }}>{data.cnpj} · {data.city}/{data.state}</div>
                {cnpjDat?.email && <div style={{ fontSize:12,color:'#2E3192',marginTop:2 }}>{safeStr(cnpjDat.email)}</div>}
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize:28,fontWeight:900,color:data.score>=70?'#22c55e':data.score>=50?'#f59e0b':'#ef4444',fontFamily:'Montserrat,sans-serif' }}>{liveScore}</div>
                <div style={{ fontSize:10,color:'#9B9B9B' }}>Score ELOS</div>
                {isArchived && <div style={{ fontSize:10,fontWeight:700,color:'#dc2626',marginTop:4 }}>ARQUIVADO</div>}
              </div>
            </div>
            <div style={{ marginTop:12,display:'flex',justifyContent:'flex-end' }}>
              <button onClick={() => setArchiveModal(true)}
                style={{ fontSize:11,fontFamily:'DM Sans,sans-serif',fontWeight:600,color:isArchived?'#059669':'#9B9B9B',background:'none',border:`1px solid ${isArchived?'#86efac':'#e2e4ef'}`,borderRadius:8,padding:'4px 12px',cursor:'pointer' }}>
                {isArchived ? '↺ Desarquivar' : '📁 Arquivar cadastro'}
              </button>
            </div>
          </Card>

          {/* Inteligência CNPJ — sanções + Simples + dados cadastrais */}
          {cnpjC && (
            <Card style={{ borderRadius:16,padding:'20px 24px',marginBottom:16,border:'1px solid rgba(46,49,146,.15)' }}>
              <div style={{ display:'flex',alignItems:'center',gap:10,marginBottom:16 }}>
                <SectionTitle style={{ marginBottom:0 }}>Inteligência CNPJ</SectionTitle>
                <span style={{ fontSize:10,background:'rgba(46,49,146,.08)',color:'#2E3192',padding:'3px 10px',borderRadius:20,fontFamily:'Montserrat,sans-serif',fontWeight:700 }}>BrasilAPI + Transparência</span>
              </div>

              {/* Grid de dados cadastrais */}
              {cnpjDat && (
                <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:16 }}>
                  {[
                    ['Situação',    safeStr(cnpjDat.descricao_situacao_cadastral)],
                    ['Abertura',    safeStr(cnpjDat.data_inicio_atividade)],
                    ['Porte',       safeStr(cnpjDat.porte)],
                    ['Capital Social', cnpjDat.capital_social ? `R$ ${Number(cnpjDat.capital_social).toLocaleString('pt-BR')}` : '—'],
                    ['Natureza Jurídica', safeStr(cnpjDat.natureza_juridica)],
                    ['Município/UF', `${safeStr(cnpjDat.municipio,'?')}/${safeStr(cnpjDat.uf,'?')}`],
                  ].map(([l,v])=>(
                    <div key={l} style={{ padding:'8px 10px',background:'rgba(46,49,146,.04)',borderRadius:8 }}>
                      <div style={{ fontSize:10,color:'#9B9B9B',fontFamily:'Montserrat,sans-serif' }}>{l}</div>
                      <div style={{ fontSize:12,fontWeight:600,color:'#1a1c5e',marginTop:2,wordBreak:'break-word' }}>{v}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Regime Tributário — Simples Nacional */}
              <div style={{ marginBottom:16 }}>
                <div style={{ fontSize:11,fontWeight:700,color:'#9B9B9B',fontFamily:'Montserrat,sans-serif',textTransform:'uppercase',letterSpacing:.5,marginBottom:8 }}>Regime Tributário</div>
                <SimplesCard cnpjData={cnpjDat}/>
              </div>

              {/* CNAE principal */}
              {cnpjDat?.cnae_fiscal_descricao && (
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontSize:11,fontWeight:700,color:'#9B9B9B',fontFamily:'Montserrat,sans-serif',textTransform:'uppercase',letterSpacing:.5,marginBottom:6 }}>CNAE Principal</div>
                  <div style={{ fontSize:12,background:'rgba(46,49,146,.05)',border:'1px solid rgba(46,49,146,.1)',padding:'8px 10px',borderRadius:8,color:'#1a1c5e' }}>
                    <strong>{safeStr(cnpjDat.cnae_fiscal)}</strong> — {safeStr(cnpjDat.cnae_fiscal_descricao)}
                  </div>
                </div>
              )}

              {/* CNAEs secundários */}
              {cnpjDat?.cnaes_secundarios?.length > 0 && (
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontSize:11,fontWeight:700,color:'#9B9B9B',fontFamily:'Montserrat,sans-serif',textTransform:'uppercase',letterSpacing:.5,marginBottom:6 }}>
                    CNAEs Secundários ({cnpjDat.cnaes_secundarios.length})
                  </div>
                  <div style={{ display:'flex',flexWrap:'wrap',gap:5 }}>
                    {cnpjDat.cnaes_secundarios.map((c,i)=>(
                      <span key={i} title={cnaeMap[String(c.codigo)] || safeStr(c.descricao)} style={{ fontSize:11,background:'rgba(46,49,146,.07)',color:'#2E3192',padding:'3px 8px',borderRadius:20,cursor:'default' }}>{safeStr(c.codigo)}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Quadro Societário */}
              {cnpjDat?.qsa?.length > 0 && (
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontSize:11,fontWeight:700,color:'#9B9B9B',fontFamily:'Montserrat,sans-serif',textTransform:'uppercase',letterSpacing:.5,marginBottom:6 }}>
                    Quadro Societário ({cnpjDat.qsa.length})
                  </div>
                  {cnpjDat.qsa.map((s,i)=>(
                    <div key={i} style={{ display:'flex',justifyContent:'space-between',padding:'6px 10px',background:'#f9f9fb',borderRadius:8,marginBottom:3,fontSize:12 }}>
                      <span style={{ fontWeight:600,color:'#1a1c5e' }}>{safeStr(s.nome_socio)}</span>
                      <span style={{ color:'#9B9B9B' }}>{safeStr(s.qualificacao_socio)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Quadro Societário Manual (Item 7) */}
              <div style={{ marginBottom:16 }}>
                <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8 }}>
                  <div style={{ fontSize:11,fontWeight:700,color:'#9B9B9B',fontFamily:'Montserrat,sans-serif',textTransform:'uppercase',letterSpacing:.5 }}>
                    Quadro Societário {partners.length > 0 ? `(${partners.length} registrado${partners.length!==1?'s':''})` : '— Registro Manual'}
                  </div>
                  <button onClick={() => setPartnerModal(true)}
                    style={{ fontSize:11,fontFamily:'DM Sans,sans-serif',fontWeight:700,color:'#2E3192',background:'rgba(46,49,146,.07)',border:'1px solid rgba(46,49,146,.2)',borderRadius:8,padding:'3px 10px',cursor:'pointer' }}>
                    + Adicionar Sócio
                  </button>
                </div>
                {partners.length === 0 && (
                  <div style={{ fontSize:11,color:'#9B9B9B',fontFamily:'DM Sans,sans-serif',fontStyle:'italic' }}>
                    Nenhum sócio registrado manualmente. Os dados do QSA acima vêm da consulta BrasilAPI.
                  </div>
                )}
                {partners.map((p, i) => (
                  <div key={p.id} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 12px',background:'rgba(46,49,146,.04)',border:'1px solid rgba(46,49,146,.1)',borderRadius:8,marginBottom:4 }}>
                    <div>
                      <div style={{ fontSize:12,fontWeight:700,color:'#1a1c5e',fontFamily:'DM Sans,sans-serif' }}>{p.nome}</div>
                      <div style={{ fontSize:11,color:'#9B9B9B' }}>
                        {p.cargo || p.tipo?.toUpperCase()} {p.cpf_cnpj ? `· ${p.cpf_cnpj}` : ''} {p.participacao ? `· ${p.participacao}%` : ''} {p.nacionalidade ? `· ${p.nacionalidade}` : ''}
                      </div>
                    </div>
                    <button onClick={() => deletePartner(p.id)} style={{ background:'none',border:'none',cursor:'pointer',color:'#dc2626',fontSize:14,padding:'2px 6px' }}>✕</button>
                  </div>
                ))}
              </div>

              {/* Sanções CEIS / CNEP */}
              <div>
                <div style={{ fontSize:11,fontWeight:700,color:'#9B9B9B',fontFamily:'Montserrat,sans-serif',textTransform:'uppercase',letterSpacing:.5,marginBottom:8 }}>Sanções CEIS / CNEP (API Transparência)</div>
                <SanctionCard sanctions={{ ceis: activeSancCeis, cnep: activeSancCnep, ceisHistory: sanctions?.ceisHistory, cnepHistory: sanctions?.cnepHistory }} cnpj={supplierCnpj}/>
              </div>

              {/* Sanções Manuais (Item 9) */}
              <div style={{ marginTop:14 }}>
                <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8 }}>
                  <div style={{ fontSize:11,fontWeight:700,color:'#9B9B9B',fontFamily:'Montserrat,sans-serif',textTransform:'uppercase',letterSpacing:.5 }}>
                    Sanções Registradas Manualmente {manualSanc.length > 0 ? `(${manualSanc.length})` : ''}
                  </div>
                  <button onClick={() => setSancModal(true)}
                    style={{ fontSize:11,fontFamily:'DM Sans,sans-serif',fontWeight:700,color:'#dc2626',background:'rgba(239,68,68,.08)',border:'1px solid rgba(239,68,68,.2)',borderRadius:8,padding:'3px 10px',cursor:'pointer' }}>
                    + Nova Sanção
                  </button>
                </div>
                {manualSanc.length === 0 ? (
                  <div style={{ fontSize:11,color:'#9B9B9B',fontFamily:'DM Sans,sans-serif',fontStyle:'italic' }}>Nenhuma sanção registrada manualmente.</div>
                ) : manualSanc.map(s => (
                  <div key={s.id} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 12px',background:'rgba(239,68,68,.05)',border:'1px solid rgba(239,68,68,.15)',borderRadius:8,marginBottom:4 }}>
                    <div>
                      <div style={{ fontSize:12,fontWeight:700,color:'#dc2626',fontFamily:'DM Sans,sans-serif' }}>{s.tipo}</div>
                      <div style={{ fontSize:11,color:'#9B9B9B' }}>
                        {s.orgao || ''}  {s.uf ? `· ${s.uf}` : ''} {s.data_final ? `· Até ${new Date(s.data_final).toLocaleDateString('pt-BR')}` : '· Sem data final'}
                      </div>
                    </div>
                    <button onClick={() => deleteSanction(s.id)} style={{ background:'none',border:'none',cursor:'pointer',color:'#dc2626',fontSize:14,padding:'2px 6px' }}>✕</button>
                  </div>
                ))}
              </div>

              <div style={{ fontSize:10,color:'#9B9B9B',marginTop:12,fontFamily:'DM Sans,sans-serif' }}>
                Consultado: {cnpjC.consulted_at?.slice(0,16).replace('T',' ')} · BrasilAPI + Portal da Transparência
              </div>
            </Card>
          )}

          {/* Categorias do Fornecedor */}
          {data.categories?.length > 0 && (() => {
            const INITIAL = 5
            const cats    = data.categories
            const visible = catsExpanded ? cats : cats.slice(0, INITIAL)
            const extra   = cats.length - INITIAL
            return (
              <Card style={{ borderRadius:16,padding:'20px 24px',marginBottom:16,border:'1px solid rgba(46,49,146,.15)' }}>
                <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12 }}>
                  <SectionTitle style={{ marginBottom:0 }}>Categorias de Atuação</SectionTitle>
                  <span style={{ fontSize:11,color:'#9B9B9B',fontFamily:'DM Sans,sans-serif' }}>{cats.length} categoria{cats.length!==1?'s':''}</span>
                </div>
                <div style={{ display:'flex',flexWrap:'wrap',gap:8 }}>
                  {visible.map(cat => {
                    const isOpen = expandedCat === cat.id
                    const catDocs = allDocs.filter(d => {
                      const label = (d.label || d.type || '').toLowerCase()
                      const catName = (cat.name || '').toLowerCase()
                      return d.category_id === cat.id || label.includes(catName.split(' ')[0])
                    })
                    return (
                      <div key={cat.id} style={{ width:'100%' }}>
                        <button onClick={() => setExpandedCat(isOpen ? null : cat.id)}
                          style={{ display:'flex',alignItems:'center',gap:6,background:isOpen?'rgba(46,49,146,.12)':'rgba(46,49,146,.06)',border:`1px solid ${isOpen?'#2E3192':'rgba(46,49,146,.15)'}`,borderRadius:isOpen?'10px 10px 0 0':20,padding:'4px 12px',cursor:'pointer',textAlign:'left' }}>
                          <span style={{ fontSize:12,fontFamily:'DM Sans,sans-serif',color:isOpen?'#2E3192':'#1a1c5e',fontWeight:600 }}>{cat.name}</span>
                          <span style={{ fontSize:10,color:'#9B9B9B' }}>{isOpen ? '▲' : '▾'}</span>
                        </button>
                        {isOpen && (
                          <div style={{ border:'1px solid rgba(46,49,146,.15)',borderTop:'none',borderRadius:'0 0 10px 10px',background:'#f9faff',padding:'8px 12px' }}>
                            {allDocs.length === 0 ? (
                              <div style={{ fontSize:11,color:'#9B9B9B',fontStyle:'italic' }}>Nenhum documento carregado.</div>
                            ) : (
                              allDocs.map(d => {
                                const ST_COLOR = { VALID:'#22c55e', PENDING:'#f59e0b', MISSING:'#ef4444', REJECTED:'#ef4444', EXPIRED:'#9B9B9B', EXPIRING:'#f59e0b' }
                                const ST_LABEL = { VALID:'Aprovado', PENDING:'Pendente', MISSING:'Ausente', REJECTED:'Reprovado', EXPIRED:'Vencido', EXPIRING:'Vencendo' }
                                return (
                                  <div key={d.id} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'5px 4px',borderBottom:'1px solid rgba(46,49,146,.06)',fontSize:11 }}>
                                    <span style={{ color:'#1a1c5e',fontFamily:'DM Sans,sans-serif' }}>{d.label || `Doc ${d.type}`}</span>
                                    <span style={{ fontWeight:700,color:ST_COLOR[d.status]||'#9B9B9B',fontFamily:'Montserrat,sans-serif',fontSize:10 }}>
                                      {ST_LABEL[d.status] || d.status}
                                      {d.expires_at ? ` · ${new Date(d.expires_at).toLocaleDateString('pt-BR')}` : ''}
                                    </span>
                                  </div>
                                )
                              })
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
                {cats.length > INITIAL && (
                  <button onClick={() => setCatsExpanded(x => !x)}
                    style={{ marginTop:10,background:'none',border:'none',cursor:'pointer',fontSize:12,color:'#2E3192',fontFamily:'Montserrat,sans-serif',fontWeight:700,padding:0 }}>
                    {catsExpanded ? '▲ Ver menos' : `+ ${extra} categoria${extra!==1?'s':''} | Ver mais`}
                  </button>
                )}
              </Card>
            )
          })()}

          {/* Assertiva */}
          <Card style={{ borderRadius:16,padding:'20px 24px',border:'1px solid rgba(46,49,146,.15)' }}>
            <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14 }}>
              <div style={{ display:'flex',alignItems:'center',gap:8 }}>
                <SectionTitle style={{ marginBottom:0 }}>Análise Assertiva</SectionTitle>
                <span style={{ fontSize:10,background:'rgba(46,49,146,.08)',color:'#2E3192',padding:'3px 10px',borderRadius:20,fontFamily:'Montserrat,sans-serif',fontWeight:700 }}>Análise Restritiva PJ</span>
              </div>
              <Button variant="neutral" size="sm" disabled={assertivaLoading} onClick={handleGenerateAssertiva}>
                {assertivaLoading ? '⏳ Consultando...' : assertivaReport ? '↺ Atualizar' : '📊 Gerar Relatório'}
              </Button>
            </div>
            {assertivaError && <div style={{ fontSize:12,color:'#dc2626',marginBottom:10 }}>⚠ {assertivaError}</div>}
            {assertivaReport === undefined && !assertivaLoading && (
              <div style={{ fontSize:12,color:'#9B9B9B',fontFamily:'DM Sans,sans-serif' }}>Carregando...</div>
            )}
            {assertivaReport === null && !assertivaLoading && (
              <div style={{ fontSize:12,color:'#9B9B9B',fontFamily:'DM Sans,sans-serif' }}>Nenhum relatório gerado ainda. Clique em "Gerar Relatório" para consultar.</div>
            )}
            {assertivaReport && (() => {
              const resp = assertivaReport.report_data?.resposta || assertivaReport.resposta
              const cab  = assertivaReport.report_data?.cabecalho || assertivaReport.cabecalho
              const score = resp?.score
              const protestos = resp?.protestosPublicos
              const fatur = resp?.faturamentoEstimado
              const consultas = resp?.ultimasConsultas
              const SCOLOR = { A:'#22c55e',B:'#84cc16',C:'#f59e0b',D:'#fb923c',E:'#ef4444',F:'#dc2626' }
              const SLABEL = { A:'Excelente',B:'Bom',C:'Médio',D:'Baixo',E:'Alto risco',F:'Altíssimo risco' }
              const sc = score?.classe
              return (
                <div>
                  <div style={{ fontSize:10,color:'#9B9B9B',fontFamily:'DM Sans,sans-serif',marginBottom:12 }}>
                    Consultado: {new Date(assertivaReport.generated_at).toLocaleString('pt-BR')} · Protocolo: {assertivaReport.protocol||cab?.protocolo||'—'}
                  </div>
                  <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:14 }}>
                    {/* Score */}
                    {score && (
                      <div style={{ padding:'12px',background:`${SCOLOR[sc]||'#9B9B9B'}10`,border:`1px solid ${SCOLOR[sc]||'#9B9B9B'}30`,borderRadius:10,gridColumn:'1' }}>
                        <div style={{ fontSize:10,color:'#9B9B9B',marginBottom:4 }}>Score de Crédito</div>
                        <div style={{ display:'flex',alignItems:'center',gap:6 }}>
                          <span style={{ fontSize:22,fontWeight:900,color:SCOLOR[sc]||'#9B9B9B',fontFamily:'Montserrat,sans-serif' }}>{sc}</span>
                          <div>
                            <div style={{ fontSize:11,fontWeight:700,color:SCOLOR[sc]||'#9B9B9B',fontFamily:'Montserrat,sans-serif' }}>{SLABEL[sc]}</div>
                            <div style={{ fontSize:10,color:'#9B9B9B' }}>{score.pontos} pontos</div>
                          </div>
                        </div>
                        {score.faixa?.descricao && <div style={{ fontSize:10,color:'#64748b',marginTop:4 }}>{score.faixa.descricao}</div>}
                      </div>
                    )}
                    {/* Protestos */}
                    {protestos && (
                      <div style={{ padding:'12px',background:protestos.qtdProtestos>0?'rgba(239,68,68,.06)':'rgba(34,197,94,.06)',border:`1px solid ${protestos.qtdProtestos>0?'rgba(239,68,68,.2)':'rgba(34,197,94,.2)'}`,borderRadius:10 }}>
                        <div style={{ fontSize:10,color:'#9B9B9B',marginBottom:4 }}>Protestos</div>
                        <div style={{ fontSize:15,fontWeight:800,color:protestos.qtdProtestos>0?'#dc2626':'#15803d',fontFamily:'Montserrat,sans-serif' }}>{protestos.qtdProtestos}</div>
                        {protestos.qtdProtestos>0 && <div style={{ fontSize:10,color:'#dc2626',marginTop:2 }}>R$ {Number(protestos.valorTotal||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>}
                      </div>
                    )}
                    {/* Faturamento */}
                    {fatur?.valor && (
                      <div style={{ padding:'12px',background:'rgba(46,49,146,.04)',border:'1px solid rgba(46,49,146,.1)',borderRadius:10 }}>
                        <div style={{ fontSize:10,color:'#9B9B9B',marginBottom:4 }}>Faturamento Est.</div>
                        <div style={{ fontSize:12,fontWeight:700,color:'#1a1c5e',fontFamily:'Montserrat,sans-serif' }}>
                          R$ {Number(fatur.valor).toLocaleString('pt-BR',{notation:'compact',maximumFractionDigits:1})}
                        </div>
                      </div>
                    )}
                  </div>
                  {/* Últimas consultas */}
                  {consultas?.qtdUltConsultas > 0 && (
                    <div style={{ fontSize:11,color:'#64748b',fontFamily:'DM Sans,sans-serif' }}>
                      📋 {consultas.qtdUltConsultas} consulta{consultas.qtdUltConsultas>1?'s':''} recente{consultas.qtdUltConsultas>1?'s':''} · Última: {consultas.ultimaOcorrencia}
                    </div>
                  )}
                  {protestos?.list?.length > 0 && (
                    <div style={{ marginTop:10 }}>
                      <div style={{ fontSize:10,fontWeight:700,color:'#9B9B9B',textTransform:'uppercase',letterSpacing:.5,marginBottom:6 }}>Protestos Detalhados</div>
                      {protestos.list.map((p,i)=>(
                        <div key={i} style={{ fontSize:11,padding:'8px 10px',background:'rgba(239,68,68,.04)',border:'1px solid rgba(239,68,68,.15)',borderRadius:8,marginBottom:4 }}>
                          <strong>{p.cartorio}</strong> — {p.cidade}/{p.uf} · {p.data} · R$ {Number(p.valor||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })()}
          </Card>

          {/* Abas: Documentos | Questionário */}
          <Card style={{ borderRadius:16,padding:'20px 24px' }}>
            <div style={{ display:'flex',gap:0,marginBottom:20,borderBottom:'1px solid #e2e4ef' }}>
              {[
                ['docs','Documentos'],
                ['questionario','Questionário'],
                ['banco','Dados Bancários'],
                ['dre','DRE / Financeiro'],
                ['log','Log do Processo'],
                ['convites','Convites'],
              ].map(([tab,label])=>(
                <button key={tab} onClick={()=>{ setActiveTab(tab); if(tab==='log' && logData.length===0) fetchLog() }}
                  style={{ padding:'8px 18px',background:'none',border:'none',borderBottom:`2px solid ${activeTab===tab?'#2E3192':'transparent'}`,color:activeTab===tab?'#2E3192':'#9B9B9B',fontFamily:'Montserrat,sans-serif',fontWeight:700,fontSize:13,cursor:'pointer',marginBottom:-1,whiteSpace:'nowrap' }}>
                  {label}{tab==='questionario'&&qaAnswers.length>0?` (${qaAnswers.length})`:''}
                  {tab==='banco'&&bankData?.bank_name?` ✓`:''}
                  {tab==='dre'&&dreList.length>0?` (${dreList.length})`:''}
                  {tab==='convites'&&inviteLog.length>0?` (${inviteLog.length})`:''}
                </button>
              ))}
            </div>

            {activeTab === 'questionario' && (
              <div>
                {qaAnswers.length === 0 ? (
                  <div style={{ textAlign:'center',padding:'32px',color:'#9B9B9B',fontFamily:'DM Sans,sans-serif',fontSize:13 }}>
                    Nenhuma resposta de questionário registrada para este fornecedor.
                  </div>
                ) : (
                  <div style={{ display:'flex',flexDirection:'column',gap:10 }}>
                    {qaAnswers.map((a,i) => {
                      const q = a.questionnaire_questions
                      const clientName = q?.questionnaires?.clients?.razao_social
                      const qTitle     = q?.questionnaires?.title
                      const answer     = a.answer_boolean !== null && a.answer_boolean !== undefined
                        ? (a.answer_boolean ? 'Sim' : 'Não')
                        : (a.answer_text || '—')
                      return (
                        <div key={i} style={{ padding:'12px 14px',borderRadius:10,background:'#f8faff',border:'1px solid #e2e4ef' }}>
                          <div style={{ fontSize:11,color:'#9B9B9B',fontFamily:'DM Sans,sans-serif',marginBottom:4 }}>
                            {clientName} · {qTitle}
                          </div>
                          <div style={{ fontSize:13,fontWeight:600,color:'#1a1c5e',fontFamily:'DM Sans,sans-serif',marginBottom:4 }}>{q?.text}</div>
                          <div style={{ fontSize:13,color: a.answer_boolean===true?'#15803d':a.answer_boolean===false?'#dc2626':'#1a1c5e',fontWeight:600,fontFamily:'Montserrat,sans-serif' }}>
                            {answer}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'docs' && (<>
            <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16 }}>
              <SectionTitle style={{ marginBottom:0 }}>Documentos para Validação</SectionTitle>
              <div style={{ display:'flex',gap:8,fontSize:12 }}>
                <span style={{ color:'#22c55e' }}>✓ {ok} ok</span>
                {miss>0 && <span style={{ color:'#ef4444' }}>✕ {miss} pendente</span>}
              </div>
            </div>
            {docs.map((doc,i)=>{
              const actn   = docActions[doc.id]
              const status = actn && actn!=='loading' ? actn : doc.status
              const colors  = { VALID:'#f8fffe',PENDING:'#fff7ed',MISSING:'#fff5f5',REJECTED:'#fff5f5' }
              const borders = { VALID:'#dcfce7',PENDING:'#fed7aa',MISSING:'#fee2e2',REJECTED:'#fee2e2' }
              return (
                <div key={i} style={{ display:'flex',alignItems:'center',gap:12,padding:'12px 14px',borderRadius:12,marginBottom:8,background:colors[status]||'#f4f5f9',border:`1px solid ${borders[status]||'#e2e4ef'}` }}>
                  <StatusDot status={status}/>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13,fontWeight:700,color:'#1a1c5e',fontFamily:'Montserrat,sans-serif' }}>{doc.label}</div>
                    <div style={{ fontSize:11,color:'#9B9B9B' }}>
                      {doc.source==='AUTO' ? '⚡ Auto-coletado' : 'Upload manual'}
                      {doc.expires_at ? ` · vence ${doc.expires_at.slice(0,10)}` : ''}
                    </div>
                    {doc.review_note && <div style={{ fontSize:11,color:'#dc2626',marginTop:2 }}>⚠ {doc.review_note}</div>}
                  </div>
                  {(() => {
                    const aiType = getDocAiType(doc)
                    if (aiType && doc.storage_path) {
                      // Docs bancários e DRE: botão especial que abre modal de extração IA
                      return (
                        <Button variant="primary" size="sm"
                          onClick={() => {
                            if (aiType === 'dre') setDreEditing({ year: new Date().getFullYear() - 1 })
                            setDocAiModal({ doc, extractType: aiType })
                          }}>
                          🤖 Analisar
                        </Button>
                      )
                    }
                    // Docs normais: botão Ver
                    return doc.storage_path ? (
                      <Button variant="neutral" size="sm" onClick={async()=>{ const url=await documentApi.getSignedUrl(doc.storage_path); window.open(url,'_blank') }}>👁 Ver</Button>
                    ) : null
                  })()}
                  {(['PENDING','VALID','EXPIRING','EXPIRED'].includes(status)) && (
                    <>
                      {actn==='loading' ? <Spinner size={16}/> : <>
                        {['PENDING','EXPIRING','EXPIRED'].includes(status) && (
                          <Button variant="success" size="sm" onClick={()=>openApproveModal(doc)}>✓ Aprovar</Button>
                        )}
                        <Button variant="danger" size="sm" onClick={()=>handleDocReject(doc.id, doc.label)}>
                          {status==='VALID' ? '✕ Revogar' : '✕ Rejeitar'}
                        </Button>
                      </>}
                    </>
                  )}
                </div>
              )
            })}
            </>)}

            {/* ── Aba: Dados Bancários ── */}
            {activeTab === 'banco' && (
              <div>
                <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16 }}>
                  <SectionTitle style={{ marginBottom:0 }}>Dados Bancários</SectionTitle>
                  <Button variant="neutral" size="sm" disabled={bankAiLoading} onClick={extractBankWithAI}>
                    {bankAiLoading ? <><Spinner size={14}/> Extraindo...</> : '🤖 Extrair com IA'}
                  </Button>
                </div>
                {bankAiLoading && (
                  <div style={{ fontSize:12,color:'#9B9B9B',fontFamily:'DM Sans,sans-serif',marginBottom:12 }}>
                    Analisando documento com IA — aguarde alguns segundos...
                  </div>
                )}
                {[
                  ['bank_name',    'Nome do Banco',         'text',   'Ex: Banco do Brasil'],
                  ['bank_code',    'Código COMPE',          'text',   'Ex: 001'],
                  ['bank_agency',  'Agência',               'text',   'Ex: 1234'],
                  ['bank_account', 'Conta c/ dígito',       'text',   'Ex: 12345-6'],
                  ['pix_key',      'Chave PIX',             'text',   'CNPJ, e-mail, telefone ou aleatória'],
                ].map(([field, label, type, placeholder]) => (
                  <div key={field} style={{ marginBottom:12 }}>
                    <label style={{ display:'block',fontSize:11,fontWeight:700,color:'#9B9B9B',fontFamily:'Montserrat,sans-serif',letterSpacing:.5,textTransform:'uppercase',marginBottom:4 }}>{label}</label>
                    <input type={type} value={bankData?.[field] || ''} placeholder={placeholder}
                      onChange={e => setBankData(p => ({ ...p, [field]: e.target.value }))}
                      style={{ width:'100%',padding:'9px 12px',borderRadius:10,border:'1px solid #e2e4ef',fontFamily:'DM Sans,sans-serif',fontSize:13,boxSizing:'border-box' }}/>
                  </div>
                ))}
                <div style={{ marginBottom:16 }}>
                  <label style={{ display:'block',fontSize:11,fontWeight:700,color:'#9B9B9B',fontFamily:'Montserrat,sans-serif',letterSpacing:.5,textTransform:'uppercase',marginBottom:4 }}>Tipo de Conta</label>
                  <select value={bankData?.account_type || ''} onChange={e => setBankData(p => ({ ...p, account_type: e.target.value }))}
                    style={{ width:'100%',padding:'9px 12px',borderRadius:10,border:'1px solid #e2e4ef',fontFamily:'DM Sans,sans-serif',fontSize:13 }}>
                    <option value="">Selecione...</option>
                    <option value="corrente">Corrente</option>
                    <option value="poupanca">Poupança</option>
                  </select>
                </div>
                {bankData?.verified_at && (
                  <div style={{ fontSize:11,color:'#22c55e',fontFamily:'DM Sans,sans-serif',marginBottom:12 }}>
                    ✓ Verificado em {bankData.verified_at.slice(0,10)}
                  </div>
                )}
                <Button variant="primary" full disabled={bankSaving} onClick={saveBankData}>
                  {bankSaving ? <Spinner size={14}/> : '💾 Salvar Dados Bancários'}
                </Button>
              </div>
            )}

            {/* ── Aba: DRE / Financeiro ── */}
            {activeTab === 'dre' && (
              <div>
                <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16 }}>
                  <SectionTitle style={{ marginBottom:0 }}>DRE / Dados Financeiros</SectionTitle>
                  <Button variant="orange" size="sm" onClick={() => setDreEditing({ year: new Date().getFullYear() - 1 })}>
                    + Adicionar exercício
                  </Button>
                </div>

                {dreList.length === 0 && !dreEditing && (
                  <div style={{ textAlign:'center',padding:'24px',color:'#9B9B9B',fontFamily:'DM Sans,sans-serif',fontSize:13 }}>
                    Nenhum dado financeiro registrado ainda.
                  </div>
                )}

                {dreList.map(dre => (
                  <div key={dre.id} style={{ padding:'12px 16px',borderRadius:12,border:'1px solid #e2e4ef',marginBottom:8,background:'#fafbff' }}>
                    <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center' }}>
                      <div style={{ fontFamily:'Montserrat,sans-serif',fontWeight:700,fontSize:13,color:'#1a1c5e' }}>
                        Exercício {dre.year}
                        {dre.verified_at && <span style={{ fontSize:10,color:'#22c55e',marginLeft:8 }}>✓ Verificado</span>}
                      </div>
                      <Button variant="neutral" size="sm" onClick={() => setDreEditing({ ...dre })}>Editar</Button>
                    </div>
                    <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginTop:8 }}>
                      {[['Receita',dre.receita],['Ativo',dre.ativo],['Passivo',dre.passivo],['Lucro',dre.lucro],['EBITDA',dre.ebitda],['Estoque',dre.estoque]].map(([l,v]) => (
                        v != null && <div key={l}>
                          <div style={{ fontSize:9,color:'#9B9B9B',fontFamily:'Montserrat,sans-serif',fontWeight:700,textTransform:'uppercase',letterSpacing:.5 }}>{l}</div>
                          <div style={{ fontSize:12,color:'#1a1c5e',fontFamily:'DM Sans,sans-serif',fontWeight:600 }}>
                            R$ {Number(v).toLocaleString('pt-BR',{minimumFractionDigits:0})}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {dreEditing && (
                  <div style={{ padding:'16px',border:'2px solid #2E3192',borderRadius:14,background:'rgba(46,49,146,.03)',marginTop:8 }}>
                    <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12 }}>
                      <div style={{ fontFamily:'Montserrat,sans-serif',fontWeight:700,fontSize:13,color:'#1a1c5e' }}>
                        {dreEditing.id ? `Editando exercício ${dreEditing.year}` : 'Novo exercício'}
                      </div>
                      {(() => {
                        const dreDoc = data?.documents?.find(d =>
                          (d.label?.toLowerCase().includes('dre') || d.label?.toLowerCase().includes('balanço') || d.label?.toLowerCase().includes('balanco')) && d.storage_path
                        )
                        return dreDoc ? (
                          <Button variant="neutral" size="sm" disabled={dreAiLoading} onClick={() => extractDreWithAI(dreDoc.storage_path)}>
                            {dreAiLoading ? <><Spinner size={14}/> Extraindo...</> : '🤖 Extrair com IA'}
                          </Button>
                        ) : null
                      })()}
                    </div>
                    <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:10 }}>
                      {[
                        ['year',    'Ano de referência', 'number'],
                        ['receita', 'Receita Bruta (R$)', 'number'],
                        ['ativo',   'Total do Ativo (R$)', 'number'],
                        ['passivo', 'Total do Passivo (R$)', 'number'],
                        ['lucro',   'Lucro Líquido (R$)', 'number'],
                        ['ebitda',  'EBITDA (R$)', 'number'],
                        ['estoque', 'Estoque (R$)', 'number'],
                      ].map(([field, label]) => (
                        <div key={field}>
                          <label style={{ display:'block',fontSize:10,fontWeight:700,color:'#9B9B9B',fontFamily:'Montserrat,sans-serif',textTransform:'uppercase',letterSpacing:.5,marginBottom:3 }}>{label}</label>
                          <input type="number" value={dreEditing[field] ?? ''} placeholder="0"
                            onChange={e => setDreEditing(p => ({ ...p, [field]: e.target.value ? Number(e.target.value) : null }))}
                            style={{ width:'100%',padding:'8px 10px',borderRadius:8,border:'1px solid #e2e4ef',fontFamily:'DM Sans,sans-serif',fontSize:13,boxSizing:'border-box' }}/>
                        </div>
                      ))}
                    </div>
                    <div style={{ display:'flex',gap:8,marginTop:12 }}>
                      <Button variant="neutral" full onClick={() => setDreEditing(null)}>Cancelar</Button>
                      <Button variant="primary" full disabled={dreSaving} onClick={saveDre}>
                        {dreSaving ? <Spinner size={14}/> : '💾 Salvar'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Tab: Log do Processo ──────────────────────────────────────── */}
            {activeTab === 'log' && (
              <div>
                {/* Filtros */}
                <div style={{ display:'flex',gap:10,marginBottom:16,flexWrap:'wrap',alignItems:'flex-end' }}>
                  <div>
                    <label style={{ display:'block',fontSize:11,fontWeight:700,color:'#9B9B9B',fontFamily:'Montserrat,sans-serif',textTransform:'uppercase',letterSpacing:.5,marginBottom:4 }}>Data início</label>
                    <input type="date" value={logDateFrom} onChange={e=>setLogDateFrom(e.target.value)}
                      style={{ padding:'8px 10px',borderRadius:8,border:'1px solid #e2e4ef',fontFamily:'DM Sans,sans-serif',fontSize:12 }}/>
                  </div>
                  <div>
                    <label style={{ display:'block',fontSize:11,fontWeight:700,color:'#9B9B9B',fontFamily:'Montserrat,sans-serif',textTransform:'uppercase',letterSpacing:.5,marginBottom:4 }}>Data fim</label>
                    <input type="date" value={logDateTo} onChange={e=>setLogDateTo(e.target.value)}
                      style={{ padding:'8px 10px',borderRadius:8,border:'1px solid #e2e4ef',fontFamily:'DM Sans,sans-serif',fontSize:12 }}/>
                  </div>
                  <div style={{ flex:1,minWidth:160 }}>
                    <label style={{ display:'block',fontSize:11,fontWeight:700,color:'#9B9B9B',fontFamily:'Montserrat,sans-serif',textTransform:'uppercase',letterSpacing:.5,marginBottom:4 }}>Descrição</label>
                    <input value={logDesc} onChange={e=>setLogDesc(e.target.value)} placeholder="Filtrar por ação ou descrição..."
                      style={{ width:'100%',padding:'8px 10px',borderRadius:8,border:'1px solid #e2e4ef',fontFamily:'DM Sans,sans-serif',fontSize:12,boxSizing:'border-box' }}/>
                  </div>
                  <Button variant="primary" size="sm" disabled={logLoading} onClick={fetchLog}>
                    {logLoading ? <Spinner size={14}/> : '🔍 Pesquisar'}
                  </Button>
                </div>

                {logLoading ? (
                  <div style={{ textAlign:'center',padding:32 }}><Spinner size={32}/></div>
                ) : logData.length === 0 ? (
                  <div style={{ textAlign:'center',padding:'32px',color:'#9B9B9B',fontFamily:'DM Sans,sans-serif',fontSize:13 }}>
                    {logData.length === 0 && !logLoading ? 'Clique em Pesquisar para carregar o histórico.' : 'Nenhum evento encontrado para os filtros aplicados.'}
                  </div>
                ) : (
                  <div style={{ display:'flex',flexDirection:'column',gap:0 }}>
                    {logData.map((entry,i) => {
                      const ACTION_MAP = {
                        ANALYSIS_STARTED:   { label:'Análise iniciada',         color:'#2E3192', icon:'🔍' },
                        SEAL_APPROVED:      { label:'Homologação aprovada',      color:'#22c55e', icon:'✅' },
                        SEAL_REJECTED:      { label:'Homologação rejeitada',     color:'#ef4444', icon:'❌' },
                        SEAL_REVERTED:      { label:'Análise revertida',         color:'#f59e0b', icon:'↩️' },
                        SEAL_AUTO_APPROVED: { label:'Aprovação automática',      color:'#22c55e', icon:'⚡' },
                        SEAL_AUTO_REJECTED: { label:'Rejeição automática',       color:'#ef4444', icon:'⚡' },
                      }
                      const info    = ACTION_MAP[entry.action] || { label: entry.action, color:'#9B9B9B', icon:'📋' }
                      const meta    = entry.metadata || {}
                      const dt      = new Date(entry.created_at)
                      const dateStr = dt.toLocaleDateString('pt-BR') + ' ' + dt.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})
                      let detail    = ''
                      if (meta.reason)       detail = `Motivo: ${meta.reason}`
                      if (meta.score)        detail = `Score: ${meta.score}%`
                      if (meta.level)        detail = (detail ? detail + ' · ' : '') + `Nível: ${meta.level}`
                      if (meta.razao_social) detail = (detail ? detail + ' · ' : '') + meta.razao_social
                      return (
                        <div key={i} style={{ display:'flex',gap:12,padding:'12px 0',borderBottom:i<logData.length-1?'1px solid #f0f2f8':'' }}>
                          <div style={{ width:32,height:32,borderRadius:8,background:`${info.color}15`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,flexShrink:0,marginTop:2 }}>
                            {info.icon}
                          </div>
                          <div style={{ flex:1 }}>
                            <div style={{ fontFamily:'Montserrat,sans-serif',fontWeight:700,fontSize:13,color:info.color }}>{info.label}</div>
                            {detail && <div style={{ fontFamily:'DM Sans,sans-serif',fontSize:12,color:'#64748b',marginTop:2 }}>{detail}</div>}
                            <div style={{ fontFamily:'DM Sans,sans-serif',fontSize:11,color:'#9B9B9B',marginTop:3 }}>{dateStr}</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── Tab: Convites recebidos ──────────────────────────────────── */}
            {activeTab === 'convites' && (
              <div>
                {inviteLog.length === 0 ? (
                  <div style={{ textAlign:'center',padding:'40px',color:'#9B9B9B',fontFamily:'DM Sans,sans-serif',fontSize:13 }}>
                    Nenhum convite enviado para este fornecedor.
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize:12,color:'#9B9B9B',fontFamily:'DM Sans,sans-serif',marginBottom:14 }}>
                      {inviteLog.length} convite{inviteLog.length!==1?'s':''} enviados por clientes/compradores
                    </div>
                    {inviteLog.map((inv,i) => {
                      const STATUS_INFO = {
                        SENT:       { label:'Enviado',      color:'#f59e0b', bg:'#fef3c7' },
                        VIEWED:     { label:'Visualizado',  color:'#2563eb', bg:'#dbeafe' },
                        REGISTERED: { label:'Cadastrado',   color:'#22c55e', bg:'#dcfce7' },
                      }
                      const si   = STATUS_INFO[inv.status] || { label: inv.status, color:'#9B9B9B', bg:'#f0f0f0' }
                      const dt   = new Date(inv.created_at)
                      const dtStr = dt.toLocaleDateString('pt-BR') + ' ' + dt.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})
                      return (
                        <div key={i} style={{ display:'flex',alignItems:'center',gap:14,padding:'12px 14px',borderRadius:10,background:'#f8faff',border:'1px solid #e2e4ef',marginBottom:8 }}>
                          <div style={{ width:36,height:36,borderRadius:10,background:'#EEF0FF',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,flexShrink:0 }}>🏢</div>
                          <div style={{ flex:1 }}>
                            <div style={{ fontFamily:'Montserrat,sans-serif',fontWeight:700,fontSize:13,color:'#1a1c5e' }}>
                              {inv.clients?.razao_social || `Cliente ${inv.client_id?.slice(0,8)}`}
                            </div>
                            <div style={{ fontFamily:'DM Sans,sans-serif',fontSize:11,color:'#9B9B9B',marginTop:2 }}>{dtStr}</div>
                          </div>
                          <span style={{ fontSize:11,fontWeight:700,color:si.color,background:si.bg,borderRadius:20,padding:'3px 10px',fontFamily:'Montserrat,sans-serif' }}>
                            {si.label}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>

        {/* Painel de decisão */}
        <div style={{ position:'sticky',top:80,alignSelf:'flex-start' }}>
          <Card style={{ borderRadius:16,padding:'20px 24px',border:'2px solid #e2e4ef' }}>
            <SectionTitle>Decisão de Homologação</SectionTitle>

            {hasActiveSanctions && (
              <div style={{ background:'rgba(239,68,68,.08)',border:'1px solid rgba(239,68,68,.3)',borderRadius:10,padding:'10px 12px',marginBottom:14,fontSize:12,color:'#dc2626',fontFamily:'DM Sans,sans-serif' }}>
                ⚠ Sanções ativas detectadas. Requer validação especial antes de aprovar.
              </div>
            )}

            <div style={{ padding:'12px',background:miss>0?'rgba(239,68,68,.08)':'rgba(34,197,94,.08)',borderRadius:10,border:`1px solid ${miss>0?'rgba(239,68,68,.2)':'rgba(34,197,94,.2)'}`,marginBottom:16,textAlign:'center' }}>
              <div style={{ fontFamily:'Montserrat,sans-serif',fontWeight:700,fontSize:13,color:miss>0?'#dc2626':'#16a34a' }}>
                {miss>0 ? `⚠ ${miss} doc(s) pendente(s)` : '✅ Documentação completa'}
              </div>
              <div style={{ fontSize:11,color:'#9B9B9B',marginTop:2 }}>{ok}/{docs.length} documentos válidos</div>
            </div>

            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:11,fontFamily:'Montserrat,sans-serif',fontWeight:700,color:'#9B9B9B',marginBottom:8,letterSpacing:.5,textTransform:'uppercase' }}>Tipo de Selo</div>
              <div style={{ display:'flex',gap:8 }}>
                {[
                  ['verificado','🔵 Verificado','Pré-homologação automática'],
                  ['homologado','🏅 Homologado','Análise profissional'],
                ].map(([val,label,desc])=>(
                  <button key={val} onClick={()=>setLevel(val)}
                    style={{ flex:1,padding:'10px 8px',borderRadius:10,border:`2px solid ${level===val?'#2E3192':'#e2e4ef'}`,background:level===val?'rgba(46,49,146,.08)':'#fff',cursor:'pointer',textAlign:'center' }}>
                    <div style={{ fontFamily:'Montserrat,sans-serif',fontWeight:700,fontSize:12,color:level===val?'#2E3192':'#9B9B9B' }}>{label}</div>
                    <div style={{ fontSize:10,color:'#9B9B9B',fontFamily:'DM Sans,sans-serif',marginTop:2 }}>{desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:11,fontFamily:'Montserrat,sans-serif',fontWeight:700,color:'#9B9B9B',marginBottom:6,letterSpacing:.5,textTransform:'uppercase' }}>Motivo de Rejeição</div>
              <select value={obs.startsWith('_') ? obs : ''} onChange={e => {
                  const v = e.target.value
                  if (v && v !== 'OUTRO') setObs(rejectReasons.find(r=>r.code===v)?.label || '')
                  else if (v === 'OUTRO') setObs('_outro_')
                  else setObs('')
                }}
                style={{ width:'100%',padding:'9px 12px',borderRadius:10,border:'1px solid #e2e4ef',fontFamily:'DM Sans,sans-serif',fontSize:13,marginBottom:6 }}>
                <option value="">Selecione ou escreva abaixo...</option>
                {rejectReasons.filter(r=>r.applies_to!=='document').map(r=>(
                  <option key={r.code} value={r.code}>{r.label}</option>
                ))}
              </select>
              <textarea value={obs.startsWith('_outro_') ? '' : obs} onChange={e=>setObs(e.target.value)}
                placeholder="Observações adicionais ou motivo personalizado..."
                rows={2} style={{ width:'100%',padding:'9px 12px',borderRadius:10,border:'1px solid #e2e4ef',fontFamily:'DM Sans,sans-serif',fontSize:13,color:'#1a1c5e',resize:'vertical',boxSizing:'border-box' }}/>
            </div>

            <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
              {sealAlreadyActive ? (
                <>
                  <div style={{ background:'rgba(34,197,94,.08)', border:'1px solid #86efac', borderRadius:10, padding:'12px 16px', textAlign:'center', fontSize:13, color:'#15803d', fontFamily:'Montserrat,sans-serif', fontWeight:700 }}>
                    ✅ Selo ELOS {data?.seals?.[0]?.level} já emitido em {data?.seals?.[0]?.issued_at?.slice(0,10)||'—'}
                  </div>
                  <Button variant="danger" full size="sm" style={{ borderRadius:10 }} disabled={processing} onClick={() => setRevertModal(true)}>
                    ↩ Reverter Análise
                  </Button>
                </>
              ) : (
                <Button variant="success" full size="lg" style={{ borderRadius:10 }} disabled={processing} onClick={handleApprove}>
                  {processing ? '⏳...' : hardBlocked.length > 0 ? `🚫 ${hardBlocked.length} doc(s) impeditivo(s)` : `✅ Emitir Selo ELOS ${level === 'verificado' ? 'Verificado' : 'Homologado'}`}
                </Button>
              )}
              <Button variant="danger" full size="md" style={{ borderRadius:10 }} disabled={processing} onClick={handleReject}>
                ❌ Rejeitar
              </Button>
              <Button variant="neutral" full size="sm" style={{ borderRadius:10 }}>
                📧 Solicitar Documentos
              </Button>
            </div>
          </Card>
        </div>
      </div>

      {/* Modal Reverter Análise */}
      {revertModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'#fff', borderRadius:16, padding:32, maxWidth:480, width:'90%', boxShadow:'0 20px 60px rgba(0,0,0,.2)' }}>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:18, color:'#dc2626', marginBottom:8 }}>↩ Reverter Análise</div>
            <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#64748b', marginBottom:16 }}>
              O fornecedor voltará para a fila com status <strong>PENDENTE</strong>. O Selo ELOS será revogado e uma nova análise será necessária.
            </div>
            <textarea
              value={revertReason} onChange={e => setRevertReason(e.target.value)}
              placeholder="Motivo da reversão (obrigatório)..."
              rows={3}
              style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:13, resize:'vertical', boxSizing:'border-box', marginBottom:16 }}
            />
            <div style={{ display:'flex', gap:8 }}>
              <Button variant="neutral" full onClick={() => { setRevertModal(false); setRevertReason('') }}>Cancelar</Button>
              <Button variant="danger" full disabled={!revertReason.trim() || processing} onClick={async () => {
                if (!revertReason.trim()) return
                setProcessing(true)
                try {
                  await adminApi.revertSeal(id, revertReason.trim())
                  navigate('/backoffice/fila')
                } catch(e) {
                  alert('Erro ao reverter: ' + e.message)
                  setProcessing(false)
                }
              }}>
                {processing ? '⏳...' : 'Confirmar Reversão'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Aprovar Documento com Data de Expiração */}
      {approveModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'#fff', borderRadius:16, padding:32, maxWidth:440, width:'90%', boxShadow:'0 20px 60px rgba(0,0,0,.2)' }}>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:18, color:'#15803d', marginBottom:6 }}>✓ Aprovar Documento</div>
            <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#64748b', marginBottom:20 }}>{approveModal.docLabel}</div>

            <div style={{ marginBottom:16 }}>
              <label style={{ display:'block', fontSize:12, fontWeight:700, color:'#1a1c5e', fontFamily:'Montserrat,sans-serif', marginBottom:6 }}>
                Válido até <span style={{ color:'#dc2626' }}>*</span>
              </label>
              <input
                type="date"
                value={approveExpiry}
                onChange={e => setApproveExpiry(e.target.value)}
                style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:14, boxSizing:'border-box' }}
              />
              <div style={{ fontSize:11, color:'#9B9B9B', marginTop:4 }}>Sugestão: data de vencimento da assinatura do fornecedor</div>
            </div>

            {approveModal && (approveModal.docLabelLower?.includes('inscrição municipal') || approveModal.docLabelLower?.includes('inscricao municipal') || approveModal.docLabelLower?.includes('inscrição estadual') || approveModal.docLabelLower?.includes('inscricao estadual')) && (
              <div style={{ marginBottom:16 }}>
                <label style={{ display:'block', fontSize:12, fontWeight:700, color:'#1a1c5e', fontFamily:'Montserrat,sans-serif', marginBottom:6 }}>
                  Número da Inscrição
                </label>
                <input
                  type="text"
                  value={approveInscription}
                  onChange={e => setApproveInscription(e.target.value)}
                  placeholder="Ex: 606005028116"
                  style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:13, boxSizing:'border-box' }}
                />
              </div>
            )}

            <div style={{ marginBottom:20 }}>
              <label style={{ display:'block', fontSize:12, fontWeight:700, color:'#1a1c5e', fontFamily:'Montserrat,sans-serif', marginBottom:6 }}>Observação (opcional)</label>
              <input
                type="text"
                value={approveNote}
                onChange={e => setApproveNote(e.target.value)}
                placeholder="Ex: Documento válido e dentro do prazo"
                style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:13, boxSizing:'border-box' }}
              />
            </div>

            <div style={{ display:'flex', gap:8 }}>
              <Button variant="neutral" full onClick={() => setApproveModal(null)}>Cancelar</Button>
              <Button variant="success" full disabled={!approveExpiry} onClick={handleDocApprove}>✓ Confirmar Aprovação</Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Análise IA — Banco/DRE durante aprovação de documento */}
      {docAiModal && (
        <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.55)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16 }}>
          <div style={{ background:'#fff',borderRadius:18,padding:28,maxWidth:560,width:'100%',boxShadow:'0 24px 80px rgba(0,0,0,.3)',maxHeight:'90vh',overflowY:'auto' }}>
            <div style={{ fontFamily:'Montserrat,sans-serif',fontWeight:800,fontSize:16,color:'#1a1c5e',marginBottom:4 }}>
              🤖 {docAiModal.extractType==='bank' ? 'Dados Bancários' : 'DRE / Dados Financeiros'}
            </div>
            <div style={{ fontFamily:'DM Sans,sans-serif',fontSize:12,color:'#9B9B9B',marginBottom:16 }}>
              {docAiModal.doc.label}
            </div>

            {/* Preview + botão IA */}
            <div style={{ display:'flex',gap:8,marginBottom:20 }}>
              <Button variant="neutral" size="sm" onClick={async()=>{
                const url = await documentApi.getSignedUrl(docAiModal.doc.storage_path)
                window.open(url,'_blank')
              }}>👁 Ver documento</Button>
              <Button variant="primary" size="sm"
                disabled={docAiModal.extractType==='bank' ? bankAiLoading : dreAiLoading}
                onClick={() => docAiModal.extractType==='bank' ? extractBankWithAI() : extractDreWithAI(docAiModal.doc.storage_path)}>
                {(docAiModal.extractType==='bank' ? bankAiLoading : dreAiLoading)
                  ? <><Spinner size={14}/> Extraindo...</>
                  : '🤖 Extrair com IA'}
              </Button>
            </div>

            {/* Campos banco */}
            {docAiModal.extractType === 'bank' && (
              <div>
                {[['bank_name','Nome do Banco',''],['bank_code','Código COMPE','Ex: 001'],['bank_agency','Agência',''],['bank_account','Conta c/ dígito',''],['pix_key','Chave PIX','']].map(([field,label,placeholder])=>(
                  <div key={field} style={{ marginBottom:10 }}>
                    <label style={{ display:'block',fontSize:10,fontWeight:700,color:'#9B9B9B',fontFamily:'Montserrat,sans-serif',letterSpacing:.5,textTransform:'uppercase',marginBottom:3 }}>{label}</label>
                    <input value={bankData?.[field]||''} placeholder={placeholder} onChange={e=>setBankData(p=>({...p,[field]:e.target.value}))}
                      style={{ width:'100%',padding:'8px 10px',borderRadius:8,border:'1px solid #e2e4ef',fontFamily:'DM Sans,sans-serif',fontSize:13,boxSizing:'border-box' }}/>
                  </div>
                ))}
                <div style={{ marginBottom:14 }}>
                  <label style={{ display:'block',fontSize:10,fontWeight:700,color:'#9B9B9B',fontFamily:'Montserrat,sans-serif',letterSpacing:.5,textTransform:'uppercase',marginBottom:3 }}>Tipo de Conta</label>
                  <select value={bankData?.account_type||''} onChange={e=>setBankData(p=>({...p,account_type:e.target.value}))}
                    style={{ width:'100%',padding:'8px 10px',borderRadius:8,border:'1px solid #e2e4ef',fontFamily:'DM Sans,sans-serif',fontSize:13 }}>
                    <option value="">Selecione...</option><option value="corrente">Corrente</option><option value="poupanca">Poupança</option>
                  </select>
                </div>
              </div>
            )}

            {/* Campos DRE */}
            {docAiModal.extractType === 'dre' && dreEditing && (
              <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:10 }}>
                {[['year','Ano'],['receita','Receita (R$)'],['ativo','Ativo (R$)'],['passivo','Passivo (R$)'],['lucro','Lucro (R$)'],['ebitda','EBITDA (R$)'],['estoque','Estoque (R$)']].map(([field,label])=>(
                  <div key={field}>
                    <label style={{ display:'block',fontSize:10,fontWeight:700,color:'#9B9B9B',fontFamily:'Montserrat,sans-serif',letterSpacing:.5,textTransform:'uppercase',marginBottom:3 }}>{label}</label>
                    <input type="number" value={dreEditing[field]??''} placeholder="0" onChange={e=>setDreEditing(p=>({...p,[field]:e.target.value?Number(e.target.value):null}))}
                      style={{ width:'100%',padding:'8px 10px',borderRadius:8,border:'1px solid #e2e4ef',fontFamily:'DM Sans,sans-serif',fontSize:13,boxSizing:'border-box' }}/>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display:'flex',gap:8,marginTop:20 }}>
              <Button variant="neutral" full onClick={()=>setDocAiModal(null)}>Fechar</Button>
              <Button variant="neutral" full disabled={docAiModal.extractType==='bank'?bankSaving:dreSaving}
                onClick={()=>{ docAiModal.extractType==='bank' ? saveBankData() : saveDre() }}>
                {(docAiModal.extractType==='bank'?bankSaving:dreSaving) ? <Spinner size={14}/> : '💾 Salvar dados'}
              </Button>
              <Button variant="success" full onClick={()=>{ setDocAiModal(null); openApproveModal(docAiModal.doc) }}>
                ✓ Aprovar documento
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Rejeitar Documento com Motivos Parametrizados */}
      {rejectDocModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'#fff', borderRadius:16, padding:28, maxWidth:460, width:'90%', boxShadow:'0 20px 60px rgba(0,0,0,.2)' }}>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:18, color:'#dc2626', marginBottom:6 }}>✕ Rejeitar Documento</div>
            <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#64748b', marginBottom:20 }}>{rejectDocModal.docLabel}</div>

            <div style={{ marginBottom:16 }}>
              <label style={{ display:'block', fontSize:12, fontWeight:700, color:'#1a1c5e', fontFamily:'Montserrat,sans-serif', marginBottom:6 }}>
                Motivo da rejeição <span style={{ color:'#dc2626' }}>*</span>
              </label>
              <select value={rejectCode} onChange={e => setRejectCode(e.target.value)}
                style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:13, boxSizing:'border-box' }}>
                <option value="">Selecione um motivo...</option>
                {rejectReasons.filter(r => r.applies_to !== 'seal').map(r => (
                  <option key={r.code} value={r.code}>{r.label}</option>
                ))}
              </select>
            </div>

            {rejectCode === 'OUTRO' && (
              <div style={{ marginBottom:16 }}>
                <label style={{ display:'block', fontSize:12, fontWeight:700, color:'#1a1c5e', fontFamily:'Montserrat,sans-serif', marginBottom:6 }}>Descreva o motivo</label>
                <textarea value={rejectCustom} onChange={e => setRejectCustom(e.target.value)}
                  rows={3} placeholder="Informe o motivo detalhado..."
                  style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:13, resize:'vertical', boxSizing:'border-box' }}
                />
              </div>
            )}

            <div style={{ display:'flex', gap:8 }}>
              <Button variant="neutral" full onClick={() => setRejectDocModal(null)}>Cancelar</Button>
              <Button variant="danger" full
                disabled={!rejectCode || (rejectCode === 'OUTRO' && !rejectCustom.trim())}
                onClick={confirmDocReject}>
                ✕ Confirmar Rejeição
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Arquivar Fornecedor (Item 10) */}
      {archiveModal && (
        <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.5)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center' }}>
          <div style={{ background:'#fff',borderRadius:16,padding:28,maxWidth:420,width:'90%',boxShadow:'0 20px 60px rgba(0,0,0,.25)' }}>
            <div style={{ fontFamily:'Montserrat,sans-serif',fontWeight:800,fontSize:17,color:isArchived?'#059669':'#1a1c5e',marginBottom:8 }}>
              {isArchived ? '↺ Desarquivar Cadastro' : '📁 Arquivar Cadastro'}
            </div>
            <div style={{ fontFamily:'DM Sans,sans-serif',fontSize:13,color:'#64748b',marginBottom:16 }}>
              {isArchived
                ? 'O cadastro voltará a aparecer normalmente nas buscas e relatórios.'
                : 'O fornecedor será ocultado das buscas e relatórios, mas os dados são preservados.'}
            </div>
            {!isArchived && (
              <div style={{ marginBottom:16 }}>
                <label style={{ display:'block',fontSize:11,fontWeight:700,color:'#9B9B9B',fontFamily:'Montserrat,sans-serif',letterSpacing:.5,textTransform:'uppercase',marginBottom:5 }}>Motivo (opcional)</label>
                <input value={archiveReason} onChange={e => setArchiveReason(e.target.value)}
                  placeholder="Ex: encerrou atividades, contrato encerrado..."
                  style={{ width:'100%',padding:'10px 12px',borderRadius:10,border:'1px solid #e2e4ef',fontFamily:'DM Sans,sans-serif',fontSize:13,boxSizing:'border-box' }}/>
              </div>
            )}
            <div style={{ display:'flex',gap:8 }}>
              <Button variant="neutral" full onClick={() => setArchiveModal(false)}>Cancelar</Button>
              <Button variant={isArchived?'success':'danger'} full disabled={archiving} onClick={handleArchive}>
                {archiving ? <Spinner size={14}/> : isArchived ? '↺ Desarquivar' : '📁 Arquivar'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Adicionar Sócio (Item 7) */}
      {partnerModal && (
        <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.5)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center' }}>
          <div style={{ background:'#fff',borderRadius:16,padding:28,maxWidth:460,width:'90%',boxShadow:'0 20px 60px rgba(0,0,0,.25)',maxHeight:'90vh',overflowY:'auto' }}>
            <div style={{ fontFamily:'Montserrat,sans-serif',fontWeight:800,fontSize:17,color:'#1a1c5e',marginBottom:16 }}>+ Adicionar Sócio</div>
            {[
              { label:'Tipo', field:'tipo', type:'select', opts:[['pf','Pessoa Física'],['pj','Pessoa Jurídica'],['estrangeiro','Estrangeiro']] },
              { label:'CPF / CNPJ', field:'cpf_cnpj', placeholder:'000.000.000-00' },
              { label:'Nome *', field:'nome', placeholder:'Nome completo' },
              { label:'Cargo / Qualificação', field:'cargo', placeholder:'Sócio administrador' },
              { label:'Nacionalidade', field:'nacionalidade', placeholder:'Brasileiro' },
              { label:'% Participação', field:'participacao', type:'number', placeholder:'0.00' },
            ].map(({ label, field, type, opts, placeholder }) => (
              <div key={field} style={{ marginBottom:12 }}>
                <label style={{ display:'block',fontSize:11,fontWeight:700,color:'#9B9B9B',fontFamily:'Montserrat,sans-serif',letterSpacing:.5,textTransform:'uppercase',marginBottom:4 }}>{label}</label>
                {type === 'select' ? (
                  <select value={partnerForm[field]} onChange={e => setPartnerForm(p => ({...p, [field]: e.target.value}))}
                    style={{ width:'100%',padding:'10px 12px',borderRadius:10,border:'1px solid #e2e4ef',fontFamily:'DM Sans,sans-serif',fontSize:13,boxSizing:'border-box' }}>
                    {opts.map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                ) : (
                  <input type={type||'text'} value={partnerForm[field]} placeholder={placeholder}
                    onChange={e => setPartnerForm(p => ({...p, [field]: e.target.value}))}
                    style={{ width:'100%',padding:'10px 12px',borderRadius:10,border:'1px solid #e2e4ef',fontFamily:'DM Sans,sans-serif',fontSize:13,boxSizing:'border-box' }}/>
                )}
              </div>
            ))}
            <div style={{ display:'flex',gap:8,marginTop:16 }}>
              <Button variant="neutral" full onClick={() => setPartnerModal(false)}>Cancelar</Button>
              <Button variant="primary" full disabled={partnerSaving || !partnerForm.nome.trim()} onClick={savePartner}>
                {partnerSaving ? <Spinner size={14}/> : 'Salvar Sócio'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Nova Sanção Manual (Item 9) */}
      {sancModal && (
        <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.5)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center' }}>
          <div style={{ background:'#fff',borderRadius:16,padding:28,maxWidth:420,width:'90%',boxShadow:'0 20px 60px rgba(0,0,0,.25)' }}>
            <div style={{ fontFamily:'Montserrat,sans-serif',fontWeight:800,fontSize:17,color:'#dc2626',marginBottom:16 }}>+ Nova Sanção Manual</div>
            <div style={{ fontFamily:'DM Sans,sans-serif',fontSize:12,color:'#9B9B9B',marginBottom:16 }}>
              Use para registrar sanções encontradas em pesquisa manual que não apareceram na consulta automática de CEIS/CNEP.
            </div>
            {[
              { label:'Tipo de Sanção *', field:'tipo', placeholder:'Impedimento de licitar, Inabilitação...' },
              { label:'Data Final', field:'data_final', type:'date' },
              { label:'Órgão Sancionador', field:'orgao', placeholder:'TCU, CGU, Ministério...' },
              { label:'UF', field:'uf', placeholder:'SP', maxLength:2 },
            ].map(({ label, field, type, placeholder, maxLength }) => (
              <div key={field} style={{ marginBottom:12 }}>
                <label style={{ display:'block',fontSize:11,fontWeight:700,color:'#9B9B9B',fontFamily:'Montserrat,sans-serif',letterSpacing:.5,textTransform:'uppercase',marginBottom:4 }}>{label}</label>
                <input type={type||'text'} value={sancForm[field]} placeholder={placeholder} maxLength={maxLength}
                  onChange={e => setSancForm(p => ({...p, [field]: e.target.value}))}
                  style={{ width:'100%',padding:'10px 12px',borderRadius:10,border:'1px solid #e2e4ef',fontFamily:'DM Sans,sans-serif',fontSize:13,boxSizing:'border-box' }}/>
              </div>
            ))}
            <div style={{ display:'flex',gap:8,marginTop:16 }}>
              <Button variant="neutral" full onClick={() => setSancModal(false)}>Cancelar</Button>
              <Button variant="danger" full disabled={sancSaving || !sancForm.tipo.trim()} onClick={saveSanction}>
                {sancSaving ? <Spinner size={14}/> : 'Registrar Sanção'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
