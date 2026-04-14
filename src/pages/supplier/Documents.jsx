import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../../context/AuthContext.jsx'
import { supplierApi, documentApi, categoriesApi } from '../../services/api.js'
import { supabase } from '../../lib/supabase.js'
import { Button, Card, Spinner, PageHeader, SectionTitle, StatusDot } from '../../components/ui.jsx'

// Documentos coletados automaticamente pelo sistema (por document_id do catálogo EQPI)
// 'INSTANT'   = coletado no cadastro via BrasilAPI, sem interação do usuário
// 'LINK'      = upload manual com link direto para o site emissor
const AUTO_COLLECT = {
  37: 'INSTANT',  // Cartão CNPJ — BrasilAPI
  61: 'INSTANT',  // Análise CNAEs — BrasilAPI
  62: 'INSTANT',  // Simples Nacional — BrasilAPI
}

// Links diretos para emissão dos documentos que precisam de upload manual
const DOC_LINKS = {
  7:  'https://consulta-crf.caixa.gov.br/consultacrf/pages/consultaEmpregador.jsf',
  8:  'https://cndt-certidao.tst.jus.br/inicio.faces',
  42: 'https://solucoes.receita.fazenda.gov.br/servicos/certidaointernet/PJ/Emitir',
  40: null, // Alvará — emitido pela prefeitura (varia por município)
  19: null, // Licença ambiental — emitida pelo órgão estadual
}

const STATUS_CONFIG = {
  VALID:    { bg:'#f8fffe', bd:'#dcfce7', color:'#22c55e', label:'Válido' },
  EXPIRING: { bg:'#fffbeb', bd:'#fef3c7', color:'#f59e0b', label:'Vencendo' },
  MISSING:  { bg:'#fff5f5', bd:'#fee2e2', color:'#ef4444', label:'Pendente' },
  PENDING:  { bg:'#fff7ed', bd:'#fed7aa', color:'#f59e0b', label:'Em análise' },
  EXPIRED:  { bg:'#fff5f5', bd:'#fee2e2', color:'#ef4444', label:'Vencido' },
  REJECTED: { bg:'#fff5f5', bd:'#fee2e2', color:'#ef4444', label:'Rejeitado' },
}

export default function SupplierDocuments() {
  const { user }   = useAuth()
  const [supplier, setSupplier] = useState(null)
  const [reqDocs, setReqDocs]   = useState([])   // docs exigidos pelas categorias
  const [uploaded, setUploaded] = useState([])   // docs já no banco
  const [loading, setLoading]   = useState(true)
  const [uploading, setUploading] = useState(null)
  const [toast, setToast]       = useState(null)
  const fileRefs = useRef({})

  const [collecting, setCollecting] = useState(null)

  // Reservado para integração futura via proxy residencial (ScrapingBee/Zyte)
  // Por ora FGTS e CND usam upload manual com link direto para o site emissor
  const handleCollect = async (docId, docLabel) => {
    const link = DOC_LINKS[docId]
    if (link) window.open(link, '_blank')
  }

  const loadAll = async () => {
    if (!user?.supplierId) { setLoading(false); return }
    try {
      // 1. Dados do fornecedor
      const s = await supplierApi.me(user.supplierId)
      setSupplier(s)

      // 2. Categorias selecionadas → documentos exigidos
      const cats = await categoriesApi.getSupplierCategories(user.supplierId)
      let docs = []
      if (cats.length > 0) {
        docs = await categoriesApi.getRequiredDocuments(cats.map(c => c.id))
        docs.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
      }
      setReqDocs(docs)

      // 3. Documentos já enviados
      const d = await documentApi.list(user.supplierId)
      setUploaded(d)

      // 4. Auto-validar CNPJ (doc_id 37) se ainda não estiver no banco
      const alreadyHasCnpj = d.some(u => u.type === '37' || u.type === 'CNPJ_CARD')
      const cnpjInReqs = docs.find(r => r.id === 37)
      if (cnpjInReqs && !alreadyHasCnpj) {
        await autoValidateDocs(user.supplierId, docs)
        // Recarrega após auto-validar
        const d2 = await documentApi.list(user.supplierId)
        setUploaded(d2)
      }
    } finally { setLoading(false) }
  }

  const autoValidateDocs = async (supplierId, allReqDocs) => {
    try {
      const { data: consult } = await supabase
        .from('cnpj_consultations')
        .select('cnpj_data, consulted_at')
        .eq('supplier_id', supplierId)
        .order('consulted_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const cnpj = consult?.cnpj_data
      const docsToCreate = []

      // Doc 37 — Cartão CNPJ
      if (allReqDocs.find(d => d.id === 37)) {
        docsToCreate.push({
          supplier_id:  supplierId,
          type:         '37',
          label:        'Cartão de Inscrição no CNPJ',
          source:       'AUTO',
          status:       cnpj?.descricao_situacao_cadastral === 'ATIVA' ? 'VALID' : 'PENDING',
          storage_path: null,
          metadata:     { auto_collect: true, source: 'BrasilAPI', situacao: cnpj?.descricao_situacao_cadastral },
        })
      }
      // Doc 62 — Simples Nacional
      if (allReqDocs.find(d => d.id === 62)) {
        const isOptante = cnpj?.opcao_pelo_simples === true && !cnpj?.data_exclusao_do_simples
        docsToCreate.push({
          supplier_id:  supplierId,
          type:         '62',
          label:        'Comprovante de Deferimento do Simples Nacional',
          source:       'AUTO',
          status:       isOptante ? 'VALID' : 'MISSING',
          storage_path: null,
          metadata:     { auto_collect: true, source: 'BrasilAPI', optante: isOptante },
        })
      }
      // Doc 61 — Análise CNAEs
      if (allReqDocs.find(d => d.id === 61) && cnpj?.cnae_fiscal) {
        docsToCreate.push({
          supplier_id:  supplierId,
          type:         '61',
          label:        'Analise CNAES',
          source:       'AUTO',
          status:       'VALID',
          storage_path: null,
          metadata:     { auto_collect: true, source: 'BrasilAPI', cnae: cnpj?.cnae_fiscal, descricao: cnpj?.cnae_fiscal_descricao },
        })
      }

      for (const doc of docsToCreate) {
        try {
          const { error: docErr } = await supabase
            .from('documents')
            .upsert(doc, { onConflict: 'supplier_id,type' })
          if (docErr) console.warn(`auto-doc ${doc.type}:`, docErr.message)
        } catch (e) { console.warn(`auto-doc ${doc.type} catch:`, e.message) }
      }
    } catch (err) {
      console.warn('autoValidateDocs warn:', err.message)
    }
  }

  useEffect(() => { loadAll() }, [user?.supplierId])

  const showToast = (msg, type='success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  const handleUpload = async (docId, docLabel, file) => {
    if (!file) return
    if (file.size > 10*1024*1024) { showToast('Arquivo muito grande. Máx 10MB', 'error'); return }
    const ok = ['application/pdf','image/jpeg','image/jpg','image/png']
    if (!ok.includes(file.type)) { showToast('Use PDF, JPG ou PNG', 'error'); return }

    setUploading(docId)
    try {
      const typeKey = String(docId)
      const uploaded = await documentApi.upload(user.supplierId, user.id, file, typeKey)
      // Override label with catalog name
      await supabase.from('documents')
        .update({ label: docLabel })
        .eq('id', uploaded.id)

      setUploaded(prev => {
        const i = prev.findIndex(d => d.type === typeKey)
        return i >= 0 ? prev.map(d => d.type === typeKey ? { ...uploaded, label: docLabel } : d)
                      : [...prev, { ...uploaded, label: docLabel }]
      })
      showToast('✅ Documento enviado! Aguardando validação.')
    } catch (err) { showToast('Erro: ' + err.message, 'error') }
    finally { setUploading(null) }
  }

  const getDoc = (docId) => uploaded.find(d => d.type === String(docId) || d.type === `CNPJ_CARD` && docId === 37)

  if (loading) return <div style={{ display:'flex',justifyContent:'center',alignItems:'center',height:'50vh' }}><Spinner size={48}/></div>

  if (!user?.supplierId) return (
    <div style={{ padding:'60px 32px', textAlign:'center' }}>
      <div style={{ fontSize:48, marginBottom:12 }}>📋</div>
      <div style={{ fontFamily:'Montserrat,sans-serif',fontWeight:700,fontSize:18,color:'#1a1c5e',marginBottom:8 }}>Complete o cadastro primeiro</div>
      <Button variant="orange" onClick={()=>window.location.href='/cadastro'}>Ir para cadastro →</Button>
    </div>
  )

  const okCount  = reqDocs.filter(d => { const up = getDoc(d.id); return up?.status === 'VALID' }).length
  const totCount = reqDocs.length

  const renderDocRow = (doc) => {
    const up      = getDoc(doc.id)
    const status  = up?.status || 'MISSING'
    const cfg     = STATUS_CONFIG[status] || STATUS_CONFIG.MISSING
    const autoType  = AUTO_COLLECT[doc.id]  // 'INSTANT' | undefined
    const isInstant = autoType === 'INSTANT'
    const isOnDemand= false // reservado para futura integração com proxy residencial
    const busy      = uploading === doc.id
    const busyCollect = collecting === doc.id

    return (
      <div key={doc.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', borderRadius:12, background:cfg.bg, border:`1px solid ${cfg.bd}`, marginBottom:8 }}>
        <StatusDot status={status} />
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:13, fontWeight:700, color:'#1a1c5e', fontFamily:'Montserrat,sans-serif', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{doc.name}</div>
          <div style={{ display:'flex', gap:6, marginTop:2, alignItems:'center', flexWrap:'wrap' }}>
            <span style={{ fontSize:10, fontWeight:700, color:cfg.color, background:`${cfg.color}18`, padding:'1px 7px', borderRadius:20, fontFamily:'Montserrat,sans-serif' }}>{cfg.label}</span>
            {isInstant   && <span style={{ fontSize:9, color:'#22c55e', background:'rgba(34,197,94,.1)', padding:'1px 6px', borderRadius:20, fontWeight:700 }}>⚡ Auto</span>}
            {isOnDemand  && <span style={{ fontSize:9, color:'#2E3192', background:'rgba(46,49,146,.08)', padding:'1px 6px', borderRadius:20, fontWeight:700 }}>🤖 Automático</span>}
            {up?.expires_at && <span style={{ fontSize:10, color:'#9B9B9B' }}>vence {up.expires_at.slice(0,10)}</span>}
          </div>
          {up?.review_note && <div style={{ fontSize:11,color:'#dc2626',marginTop:2 }}>⚠ {up.review_note}</div>}
          {/* Metadados do certificado FGTS */}
          {doc.id===7 && up?.metadata?.numeroCertificado && (
            <div style={{ fontSize:10,color:'#9B9B9B',marginTop:3 }}>
              Cert. nº {up.metadata.numeroCertificado} · {up.metadata.validadeInicio} a {up.metadata.validadeFim}
            </div>
          )}
        </div>

        {/* Link direto para emissão (documentos com site externo) */}
        {DOC_LINKS[doc.id] && (
          <a href={DOC_LINKS[doc.id]} target="_blank" rel="noopener noreferrer"
            style={{ textDecoration:'none' }}
            title="Abrir site emissor para baixar o documento">
            <Button variant={status==='VALID'?'neutral':'orange'} size="sm">
              🌐 Emitir
            </Button>
          </a>
        )}

        {/* Upload manual (só para docs não automáticos) */}
        {!isInstant && !isOnDemand && (
          <>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png"
              ref={el => fileRefs.current[doc.id] = el}
              style={{ display:'none' }}
              onChange={e => handleUpload(doc.id, doc.name, e.target.files[0])}
            />
            {busy ? <Spinner size={20}/> : (
              <Button variant={status==='VALID'?'neutral':'orange'} size="sm"
                onClick={() => fileRefs.current[doc.id]?.click()}>
                {status==='VALID' ? '↑ Atualizar' : '↑ Enviar'}
              </Button>
            )}
          </>
        )}
      </div>
    )
  }

  return (
    <div style={{ padding:'28px 32px', maxWidth:960, margin:'0 auto' }}>
      {toast && (
        <div style={{ position:'fixed',top:80,right:24,background:toast.type==='error'?'#ef4444':'#22c55e',color:'#fff',padding:'12px 20px',borderRadius:12,zIndex:9999,fontFamily:'Montserrat,sans-serif',fontWeight:700,fontSize:13,boxShadow:'0 8px 24px rgba(0,0,0,.2)',maxWidth:340 }}>
          {toast.msg}
        </div>
      )}

      <PageHeader title="Meus Documentos" subtitle={`${supplier?.razao_social} · ${okCount}/${totCount} documentos válidos`} />

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16, marginBottom:24 }}>
        {[
          ['Válidos', okCount, '#22c55e', '✅'],
          ['Pendentes', totCount - okCount, totCount - okCount > 0 ? '#f59e0b' : '#22c55e', '⏳'],
          ['Score ELOS', `${supplier?.score||0}/100`, supplier?.score >= 70 ? '#22c55e' : '#f59e0b', '📊'],
        ].map(([l,v,c,i]) => (
          <Card key={l}><div style={{ display:'flex',alignItems:'center',gap:12 }}><div style={{ fontSize:28 }}>{i}</div><div><div style={{ fontSize:22,fontWeight:800,color:c,fontFamily:'Montserrat,sans-serif' }}>{v}</div><div style={{ fontSize:11,color:'#9B9B9B' }}>{l}</div></div></div></Card>
        ))}
      </div>

      {/* Lista de documentos exigidos pelas categorias */}
      {reqDocs.length === 0 ? (
        <Card style={{ borderRadius:16, padding:'32px', textAlign:'center' }}>
          <div style={{ fontSize:40, marginBottom:12 }}>📦</div>
          <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:16, color:'#1a1c5e', marginBottom:8 }}>Nenhuma categoria selecionada</div>
          <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#9B9B9B', marginBottom:16 }}>
            Selecione as categorias de atuação para ver quais documentos são necessários.
          </div>
          <Button variant="orange" onClick={()=>window.location.href='/fornecedor/categorias'}>
            📦 Selecionar Categorias →
          </Button>
        </Card>
      ) : (
        <Card style={{ borderRadius:16, padding:'20px 24px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16, justifyContent:'space-between' }}>
            <SectionTitle style={{ marginBottom:0 }}>Documentos Exigidos para Homologação</SectionTitle>
            <a href="/fornecedor/categorias" style={{ fontSize:12, color:'#2E3192', fontFamily:'Montserrat,sans-serif', fontWeight:600 }}>
              Editar categorias →
            </a>
          </div>
          {reqDocs.map(renderDocRow)}
          <div style={{ marginTop:10, padding:'10px 14px', background:'rgba(46,49,146,.04)', borderRadius:10, fontSize:12, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>
            ⚡ Auto = coletado automaticamente · 🌐 Emitir = abre o site oficial para download · PDF, JPG ou PNG · Máx 10MB
          </div>
        </Card>
      )}
    </div>
  )
}
