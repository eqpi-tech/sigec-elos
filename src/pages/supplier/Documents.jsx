import { useState, useEffect, useRef } from 'react'
import { useIsMobile } from '../../hooks/useIsMobile.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { supplierApi, documentApi, categoriesApi, assertivaApi, mobilityApi, getRequiredTypesBySeal } from '../../services/api.js'
import { supabase } from '../../lib/supabase.js'
import { hasAction } from '../../lib/modules.js'
import { Button, Card, Spinner, PageHeader, SectionTitle, StatusDot } from '../../components/ui.jsx'

// Relatório Assertiva 360 — emissão via API interna (on-demand)
const ASSERTIVA_DOC_ID = 578

// Documentos coletados automaticamente pelo sistema (por document_id do catálogo EQPI)
// 'INSTANT'   = coletado no cadastro via BrasilAPI, sem interação do usuário
// 'LINK'      = upload manual com link direto para o site emissor
const AUTO_COLLECT = {
  37: 'INSTANT',  // Cartão CNPJ — BrasilAPI
  61: 'INSTANT',  // Análise CNAEs — BrasilAPI
  62: 'INSTANT',  // Simples Nacional — BrasilAPI
}

// Documentos que aceitam declaração de ISENÇÃO (ao invés de upload obrigatório)
// Formato: doc.label deve conter as palavras-chave abaixo
const ISENTO_KEYWORDS = ['inscrição estadual', 'inscrição municipal', 'ie estadual', 'im municipal', 'inscricao estadual', 'inscricao municipal']

// Links diretos para emissão dos documentos que precisam de upload manual
const DOC_LINKS = {
  7:  'https://consulta-crf.caixa.gov.br/consultacrf/pages/consultaEmpregador.jsf',
  8:  'https://cndt-certidao.tst.jus.br/inicio.faces',
  // Receita migrou o portal de certidões (endereço antigo → 404)
  42: 'https://servicos.receitafederal.gov.br/servico/certidoes/#/home',
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
  NOT_APPLICABLE: { bg:'#f8fafc', bd:'#e2e8f0', color:'#64748b', label:'Não se aplica' },
}

// Documento dispensado pelo backoffice conta como satisfeito (mesma regra do score)
const isSatisfied = (up) => up?.status === 'VALID' || up?.status === 'NOT_APPLICABLE'

export default function SupplierDocuments() {
  const mobile = useIsMobile()
  const { user }   = useAuth()
  const [supplier, setSupplier] = useState(null)
  const [reqDocs, setReqDocs]   = useState([])   // união dos docs exigidos (todos os fluxos)
  const [docGroups, setDocGroups] = useState([]) // [{ key, title, ids:Set }] — um por processo/cliente
  const [uploaded, setUploaded] = useState([])   // docs já no banco
  const [loading, setLoading]   = useState(true)
  const [uploading, setUploading] = useState(null)
  const [toast, setToast]       = useState(null)
  const fileRefs = useRef({})
  const presentationRef = useRef(null)
  const [uploadingPresentation, setUploadingPresentation] = useState(false)

  const [collecting, setCollecting] = useState(null)

  // ── Mobilidade (SPEC_MOBILIDADE.md): postos abertos para o CNPJ ──
  const [mobPosts, setMobPosts]   = useState([])
  const [mobPeople, setMobPeople] = useState([])   // pessoas ativas de todos os postos
  const [mobMatrix, setMobMatrix] = useState([])   // matriz de mobilidade das categorias
  const [mobOpen, setMobOpen]     = useState({})   // post_id → aberto?
  const [personForm, setPersonForm] = useState(null) // { postId, nome, cpf }
  const [personBusy, setPersonBusy] = useState(false)

  // Conclusão da homologação: prontidão do servidor (docs + questionário) +
  // mobilidade completa, com processo aguardando análise (pedido 25/09)
  const [completion, setCompletion] = useState(null) // { ready, mobComplete, pendingSeal }

  // Reservado para integração futura via proxy residencial (ScrapingBee/Zyte)
  // Por ora FGTS e CND usam upload manual com link direto para o site emissor
  const handleCollect = async (docId, docLabel) => {
    const link = DOC_LINKS[docId]
    if (link) window.open(link, '_blank')
  }

  const handleEmitirAssertiva = async (docId) => {
    setCollecting(docId)
    try {
      await assertivaApi.generate()
      const d = await documentApi.list(user.supplierId)
      setUploaded(d)
      showToast('✅ Relatório Assertiva emitido e salvo!')
    } catch (err) {
      showToast('Erro: ' + err.message, 'error')
    }
    setCollecting(null)
  }

  const refreshCompletion = async (cnpj, pendingSeal) => {
    try {
      const [{ data: rdy }, mob] = await Promise.all([
        supabase.rpc('supplier_ready_for_analysis', { p_supplier: user.supplierId }),
        mobilityApi.pendingFor(cnpj, user.supplierId),
      ])
      setCompletion(prev => ({
        ready: rdy === true,
        mobComplete: mob.complete,
        pendingSeal: pendingSeal !== undefined ? pendingSeal : (prev?.pendingSeal ?? false),
      }))
    } catch { /* não crítico */ }
  }

  const loadAll = async () => {
    if (!user?.supplierId) { setLoading(false); return }
    try {
      // 1. Dados do fornecedor
      const s = await supplierApi.me(user.supplierId)
      setSupplier(s)

      // 2. Documentos exigidos POR PROCESSO: fluxo do cliente para selos de
      //    cliente (categorias com client_id), fluxo padrão para o selo ELOS
      let docs = []
      let groups = []
      let pendingSealFound = false
      try {
        const { requiredBySeal, seals } = await getRequiredTypesBySeal(user.supplierId)
        const unionIds = new Set()
        requiredBySeal.forEach(list => list.forEach(id => unionIds.add(id)))

        if (unionIds.size) {
          const ids = [...unionIds]
          for (let i = 0; i < ids.length; i += 200) {
            const { data: catalogRows } = await supabase
              .from('documents_catalog').select('id, name, auto_collect').in('id', ids.slice(i, i + 200))
            docs = docs.concat(catalogRows || [])
          }
          docs.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
        }

        // processo aguardando análise (para o aviso de conclusão)
        pendingSealFound = seals.some(x => x.status === 'PENDING' && !x.client_suspended_at)
        // Um grupo por cliente (dedup) + um para o fluxo padrão
        const seenOwner = new Set()
        for (const seal of seals) {
          const owner = seal.client_id || 'global'
          if (seenOwner.has(owner)) continue
          seenOwner.add(owner)
          const idSet = new Set(requiredBySeal.get(seal.id) || [])
          if (!idSet.size) continue
          groups.push({
            key: owner,
            title: seal.client_id
              ? `Processo — ${seal.clients?.razao_social || seal.seal_name || 'Cliente'}`
              : 'Fluxo padrão ELOS',
            ids: idSet,
          })
        }
      } catch (err) {
        // Fallback: comportamento anterior (união das categorias, sem grupos)
        console.warn('Fluxos por selo indisponíveis, usando união de categorias:', err?.message)
        const cats = await categoriesApi.getSupplierCategories(user.supplierId)
        if (cats.length > 0) {
          docs = await categoriesApi.getRequiredDocuments(cats.map(c => c.id))
          docs.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
        }
      }
      setReqDocs(docs)
      setDocGroups(groups)

      // 3. Documentos já enviados
      const d = await documentApi.list(user.supplierId)
      setUploaded(d)

      // 3b. Mobilidade: postos abertos para o CNPJ deste fornecedor
      try {
        const posts = await mobilityApi.myPosts(s.cnpj)
        setMobPosts(posts)
        if (posts.length) {
          const catIds = [...new Set(posts.map(p => p.category_id))]
          const [matrix, people] = await Promise.all([
            mobilityApi.matrixFor(catIds),
            mobilityApi.listPeople(posts.map(p => p.id)),
          ])
          setMobMatrix(matrix)
          setMobPeople(people)
          setMobOpen(Object.fromEntries(posts.map(p => [p.id, posts.length === 1])))
        }
      } catch (err) { console.warn('mobilidade:', err.message) }

      await refreshCompletion(s.cnpj, pendingSealFound)

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
      // Doc 62 — Simples Nacional (VALID sempre que a consulta foi feita)
      if (allReqDocs.find(d => d.id === 62)) {
        const isOptante = cnpj?.opcao_pelo_simples === true && !cnpj?.data_exclusao_do_simples
        docsToCreate.push({
          supplier_id:  supplierId,
          type:         '62',
          label:        'Comprovante de Deferimento do Simples Nacional',
          source:       'AUTO',
          // VALID independente de ser optante: a consulta confirma o regime tributário
          status:       'VALID',
          storage_path: null,
          metadata: {
            auto_collect: true,
            source: 'BrasilAPI',
            optante: isOptante,
            regime: isOptante ? 'Simples Nacional' : 'Lucro Presumido / Real',
          },
        })
      }
      // Doc 61 — Análise CNAEs: coleta auto, APROVAÇÃO HUMANA (regra 09/09)
      if (allReqDocs.find(d => d.id === 61) && cnpj?.cnae_fiscal) {
        docsToCreate.push({
          supplier_id:  supplierId,
          type:         '61',
          label:        'Analise CNAES',
          source:       'AUTO',
          status:       'PENDING',
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

  const ALLOWED_EXTS = ['pdf', 'jpg', 'jpeg', 'png', 'docx']
  const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document']

  const validateZip = async (file) => {
    // Importa JSZip dinamicamente (evita adicionar ao bundle principal)
    const JSZip = (await import('jszip')).default
    const zip = await JSZip.loadAsync(file)
    const entries = Object.keys(zip.files).filter(n => !zip.files[n].dir)
    const bad = entries.filter(name => {
      const ext = name.split('.').pop()?.toLowerCase()
      return !ALLOWED_EXTS.includes(ext)
    })
    if (bad.length > 0) {
      throw new Error(`ZIP contém arquivos não permitidos: ${bad.join(', ')}. Permitidos: ${ALLOWED_EXTS.join(', ')}`)
    }
    return entries
  }

  const handleUpload = async (docId, docLabel, file) => {
    if (!file) return
    if (file.size > 20*1024*1024) { showToast('Arquivo muito grande. Máx 20MB', 'error'); return }

    const ext = file.name.split('.').pop()?.toLowerCase()
    const isZip = ext === 'zip' || file.type === 'application/zip' || file.type === 'application/x-zip-compressed'

    if (isZip) {
      try {
        await validateZip(file)
        showToast('✅ ZIP validado — enviando...', 'success')
      } catch (err) {
        showToast(err.message, 'error')
        return
      }
    } else if (!ALLOWED_MIME.includes(file.type) && !ALLOWED_EXTS.includes(ext)) {
      showToast(`Formato não permitido. Use: ${ALLOWED_EXTS.join(', ')} ou ZIP`, 'error')
      return
    }

    setUploading(docId)
    try {
      const typeKey = String(docId)
      const uploadedDoc = await documentApi.upload(user.supplierId, user.id, file, typeKey)
      await supabase.from('documents')
        .update({ label: docLabel })
        .eq('id', uploadedDoc.id)

      setUploaded(prev => {
        const i = prev.findIndex(d => d.type === typeKey)
        return i >= 0 ? prev.map(d => d.type === typeKey ? { ...uploadedDoc, label: docLabel } : d)
                      : [...prev, { ...uploadedDoc, label: docLabel }]
      })
      showToast('✅ Documento enviado! Aguardando validação.')
      refreshCompletion(supplier?.cnpj)
    } catch (err) { showToast('Erro: ' + err.message, 'error') }
    finally { setUploading(null) }
  }

  // Abre arquivo do storage novo OU migrado do HOC (S3, via get-hoc-file)
  const handleViewDoc = async (doc) => {
    try {
      const url = doc?.storage_path
        ? await documentApi.getSignedUrl(doc.storage_path)
        : await documentApi.getHocFileUrl(doc.id)
      window.open(url, '_blank')
    } catch (e) { showToast('Erro ao abrir documento', 'error') }
  }

  const handlePresentationUpload = async (file) => {
    if (!file) return
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!['pdf','pptx','ppt'].includes(ext)) {
      showToast('Formato não permitido. Use PDF, PPTX ou PPT', 'error'); return
    }
    if (file.size > 50*1024*1024) { showToast('Arquivo muito grande. Máx 50MB', 'error'); return }
    setUploadingPresentation(true)
    try {
      const doc = await documentApi.upload(user.supplierId, user.id, file, 'presentation')
      // Apresentação é aprovada automaticamente — sem revisão do backoffice
      await supabase.from('documents').update({ status: 'VALID', label: 'Apresentação da Empresa' }).eq('id', doc.id)
      setUploaded(prev => {
        const i = prev.findIndex(d => d.type === 'presentation')
        const updated = { ...doc, status: 'VALID', label: 'Apresentação da Empresa' }
        return i >= 0 ? prev.map((d, idx) => idx === i ? updated : d) : [...prev, updated]
      })
      showToast('✅ Apresentação enviada!')
    } catch (err) { showToast('Erro: ' + err.message, 'error') }
    finally { setUploadingPresentation(false) }
  }

  const getDoc = (docId) => uploaded.find(d => d.type === String(docId) || d.type === `CNPJ_CARD` && docId === 37)

  // ── Mobilidade: pessoas e uploads por posto/pessoa ──
  const handleAddPerson = async () => {
    if (!personForm?.nome?.trim() || !personForm?.cpf) return
    setPersonBusy(true)
    try {
      const p = await mobilityApi.addPerson({
        postId: personForm.postId, supplierId: user.supplierId,
        nome: personForm.nome, cpf: personForm.cpf,
      })
      setMobPeople(prev => [...prev, p])
      setPersonForm(null)
      showToast('✅ Colaborador cadastrado — envie os documentos dele abaixo.')
      refreshCompletion(supplier?.cnpj)
    } catch (err) { showToast(err.message, 'error') }
    finally { setPersonBusy(false) }
  }

  const handleRemovePerson = async (person) => {
    if (!window.confirm(`Remover ${person.nome} deste posto? Os documentos já enviados ficam no histórico.`)) return
    try {
      await mobilityApi.removePerson(person.id)
      setMobPeople(prev => prev.filter(p => p.id !== person.id))
      refreshCompletion(supplier?.cnpj)
    } catch (err) { showToast(err.message, 'error') }
  }

  const handleMobUpload = async (typeKey, label, file, { personId = null, postId = null }) => {
    if (!file) return
    if (file.size > 20 * 1024 * 1024) { showToast('Arquivo muito grande. Máx 20MB', 'error'); return }
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!ALLOWED_MIME.includes(file.type) && !ALLOWED_EXTS.includes(ext)) {
      showToast(`Formato não permitido. Use: ${ALLOWED_EXTS.join(', ')}`, 'error'); return
    }
    setUploading(typeKey)
    try {
      const uploadedDoc = await documentApi.upload(user.supplierId, user.id, file, typeKey)
      await supabase.from('documents')
        .update({ label, mobility_person_id: personId, mobility_post_id: postId })
        .eq('id', uploadedDoc.id)
      const enriched = { ...uploadedDoc, label, mobility_person_id: personId, mobility_post_id: postId }
      setUploaded(prev => {
        const i = prev.findIndex(d => d.type === typeKey)
        return i >= 0 ? prev.map(d => d.type === typeKey ? enriched : d) : [...prev, enriched]
      })
      showToast('✅ Documento enviado! Aguardando validação.')
      refreshCompletion(supplier?.cnpj)
    } catch (err) { showToast('Erro: ' + err.message, 'error') }
    finally { setUploading(null) }
  }

  if (loading) return <div style={{ display:'flex',justifyContent:'center',alignItems:'center',height:'50vh' }}><Spinner size={48}/></div>

  if (!user?.supplierId) return (
    <div style={{ padding:'60px 32px', textAlign:'center' }}>
      <div style={{ fontSize:48, marginBottom:12 }}>📋</div>
      <div style={{ fontFamily:'Montserrat,sans-serif',fontWeight:700,fontSize:18,color:'#1a1c5e',marginBottom:8 }}>Complete o cadastro primeiro</div>
      <Button variant="orange" onClick={()=>window.location.href='/cadastro'}>Ir para cadastro →</Button>
    </div>
  )

  const okCount  = reqDocs.filter(d => isSatisfied(getDoc(d.id))).length
  const totCount = reqDocs.length

  const renderDocRow = (doc) => {
    const up      = getDoc(doc.id)
    const status  = up?.status || 'MISSING'
    const cfg     = STATUS_CONFIG[status] || STATUS_CONFIG.MISSING
    const autoType   = AUTO_COLLECT[doc.id]      // 'INSTANT' | undefined
    const isInstant  = autoType === 'INSTANT'
    const isOnDemand = doc.id === ASSERTIVA_DOC_ID // emissão via API interna
    const busy       = uploading === doc.id
    const busyCollect = collecting === doc.id
    // Inscrição Estadual / Municipal: aceita declaração de ISENÇÃO
    const isIsentoEligible = ISENTO_KEYWORDS.some(kw => (doc.name||doc.label||'').toLowerCase().includes(kw))
    const isIsentoMarked = up?.metadata?.isento === true

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
          {/* Indicador de reaproveitamento: documento aprovado previamente e reusado neste processo */}
          {up?.reviewed_by && up?.status === 'VALID' && (
            <div style={{ fontSize:10, color:'#0369a1', marginTop:2 }}>♻ Validado — aproveitado neste processo</div>
          )}
          {/* Metadados do certificado FGTS */}
          {doc.id===7 && up?.metadata?.numeroCertificado && (
            <div style={{ fontSize:10,color:'#9B9B9B',marginTop:3 }}>
              Cert. nº {up.metadata.numeroCertificado} · {up.metadata.validadeInicio} a {up.metadata.validadeFim}
            </div>
          )}
          {/* Metadados do Relatório Assertiva */}
          {doc.id===ASSERTIVA_DOC_ID && up?.metadata?.protocolo && (
            <div style={{ fontSize:10,color:'#9B9B9B',marginTop:3 }}>
              Prot. {up.metadata.protocolo} · Classe {up.metadata.scoreClasse || '—'} · {up.metadata.scorePontos ?? '—'} pts
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

        {/* Emissão via API Assertiva (on-demand, gera PDF automaticamente) */}
        {isOnDemand && (
          busyCollect
            ? <Spinner size={20}/>
            : <Button variant={status==='VALID'?'neutral':'orange'} size="sm"
                onClick={() => handleEmitirAssertiva(doc.id)}
                title="Gera o relatório de análise de crédito e restrições via Assertiva Soluções">
                {status==='VALID' ? '↺ Atualizar' : '📊 Emitir'}
              </Button>
        )}

        {/* Ver documento enviado (qualquer doc com arquivo) */}
        {(up?.storage_path || up?.hoc_arquivo_id) && !isInstant && (
          <Button variant="neutral" size="sm"
            title="Visualizar documento enviado"
            onClick={() => handleViewDoc(up)}>
            👁 Ver
          </Button>
        )}

        {/* Upload manual (só para docs não automáticos) */}
        {!isInstant && !isOnDemand && (
          <div style={{ display:'flex', gap:6, alignItems:'center' }}>
            {/* Botão ISENTO para Inscrição Estadual/Municipal */}
            {isIsentoEligible && (
              <button
                onClick={async () => {
                  const newIsento = !isIsentoMarked
                  const { error } = await supabase.from('documents').upsert({
                    supplier_id: user.supplierId,
                    type: String(doc.id),
                    label: doc.name || doc.label,
                    source: 'MANUAL',
                    status: newIsento ? 'VALID' : 'MISSING',
                    metadata: { isento: newIsento, note: newIsento ? 'Declarado isento pelo fornecedor' : null },
                  }, { onConflict: 'supplier_id,type' })
                  if (!error) { const d = await documentApi.list(user.supplierId); setUploaded(d) }
                }}
                style={{ padding:'4px 10px', borderRadius:8, border:'1px solid #9B9B9B',
                  background: isIsentoMarked ? '#e0f2fe' : 'transparent',
                  color: isIsentoMarked ? '#0369a1' : '#9B9B9B',
                  fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:10, cursor:'pointer', whiteSpace:'nowrap' }}>
                {isIsentoMarked ? '✓ Isento' : 'Isento'}
              </button>
            )}
            {/* Upload: MISSING/REJECTED/EXPIRED + permissão de perfil (acao:enviar_documentos) */}
            {['MISSING','REJECTED','EXPIRED'].includes(status) && !hasAction(user, 'acao:enviar_documentos') ? (
              <span style={{ fontSize:10, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', whiteSpace:'nowrap' }} title="Seu perfil não permite enviar documentos">sem permissão</span>
            ) : ['MISSING','REJECTED','EXPIRED'].includes(status) ? (
              <>
                <input type="file" accept=".pdf,.jpg,.jpeg,.png,.docx,.zip"
                  ref={el => fileRefs.current[doc.id] = el}
                  style={{ display:'none' }}
                  onChange={e => handleUpload(doc.id, doc.name, e.target.files[0])}
                />
                {busy ? <Spinner size={20}/> : (
                  <Button variant="orange" size="sm"
                    onClick={() => fileRefs.current[doc.id]?.click()}
                    disabled={isIsentoMarked}>
                    ↑ Enviar
                  </Button>
                )}
              </>
            ) : status === 'PENDING' ? (
              <span style={{ fontSize:10, color:'#f59e0b', fontFamily:'DM Sans,sans-serif', fontWeight:600, whiteSpace:'nowrap' }}>Em análise</span>
            ) : status === 'VALID' ? (
              <span style={{ fontSize:10, color:'#22c55e', fontFamily:'DM Sans,sans-serif', fontWeight:600, whiteSpace:'nowrap' }}>✓ Aprovado</span>
            ) : status === 'NOT_APPLICABLE' ? (
              <span style={{ fontSize:10, color:'#64748b', fontFamily:'DM Sans,sans-serif', fontWeight:600, whiteSpace:'nowrap' }}
                title="O backoffice avaliou que este documento não é exigível para a sua empresa — nenhum envio é necessário">◌ Não exigido</span>
            ) : null}
          </div>
        )}
      </div>
    )
  }

  // ── Mobilidade: renderizadores — a seção é ancorada DENTRO do card do
  // processo do cliente dono dos postos (feedback 23/09: precisa ficar claro
  // a qual processo master os docs de mobilidade pertencem) ──
  const renderMobPost = (post) => {
            const people     = mobPeople.filter(p => p.post_id === post.id)
            const matrix     = mobMatrix.filter(m => m.category_id === post.category_id)
            // Registro da Arma (10017) só é exigido em posto armado
            const postDocs   = matrix.filter(m => m.escopo === 'posto' && (m.document_id !== 10017 || post.armado))
            const personDocs = matrix.filter(m => m.escopo === 'pessoa')
            const isOpen     = !!mobOpen[post.id]

            const mobDocRow = (m, typeKey, label, personId, postId) => {
              const up  = uploaded.find(d => d.type === typeKey)
              const status = up?.status || 'MISSING'
              const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.MISSING
              const busy = uploading === typeKey
              const inputId = `mob-${typeKey}`
              return (
                <div key={typeKey} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:10, background:cfg.bg, border:`1px solid ${cfg.bd}`, marginBottom:6 }}>
                  <StatusDot status={status}/>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12.5, fontWeight:600, color:'#1a1c5e', fontFamily:'DM Sans,sans-serif', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {m.documents_catalog?.name || `Documento #${m.document_id}`}
                    </div>
                    <div style={{ display:'flex', gap:6, marginTop:2, alignItems:'center' }}>
                      <span style={{ fontSize:10, fontWeight:700, color:cfg.color, background:`${cfg.color}18`, padding:'1px 7px', borderRadius:20, fontFamily:'Montserrat,sans-serif' }}>{cfg.label}</span>
                      {up?.expires_at && <span style={{ fontSize:10, color:'#9B9B9B' }}>vence {up.expires_at.slice(0,10)}</span>}
                    </div>
                    {up?.review_note && <div style={{ fontSize:11, color:'#dc2626', marginTop:2 }}>⚠ {up.review_note}</div>}
                  </div>
                  {up?.storage_path && (
                    <Button variant="neutral" size="sm" onClick={() => handleViewDoc(up)}>👁 Ver</Button>
                  )}
                  {['MISSING','REJECTED','EXPIRED'].includes(status) && (
                    hasAction(user, 'acao:enviar_documentos') ? (
                      <>
                        <input type="file" id={inputId} accept=".pdf,.jpg,.jpeg,.png,.docx" style={{ display:'none' }}
                          onChange={e => handleMobUpload(typeKey, label, e.target.files[0], { personId, postId })}/>
                        {busy ? <Spinner size={18}/> : (
                          <Button variant="orange" size="sm" onClick={() => document.getElementById(inputId)?.click()}>↑ Enviar</Button>
                        )}
                      </>
                    ) : <span style={{ fontSize:10, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>sem permissão</span>
                  )}
                </div>
              )
            }

            // farol do posto: pessoas completas + docs exigidos satisfeitos
            const slots = []
            for (const m of postDocs.filter(x => x.required)) slots.push(mobilityApi.docTypeKey(m.document_id, 'posto', post.id))
            for (const p of people) for (const m of personDocs.filter(x => x.required)) slots.push(mobilityApi.docTypeKey(m.document_id, 'pessoa', p.id))
            const okSlots = slots.filter(k => isSatisfied(uploaded.find(d => d.type === k))).length
            const conforme = people.length >= post.qty_people && okSlots === slots.length

            return (
              <div key={post.id} style={{ border:'1px solid #e2e4ef', borderRadius:14, marginBottom:12, overflow:'hidden' }}>
                <button onClick={() => setMobOpen(p => ({ ...p, [post.id]: !p[post.id] }))}
                  style={{ width:'100%', background:'#fafbfe', border:'none', cursor:'pointer', padding:'14px 16px', display:'flex', alignItems:'center', gap:10, textAlign:'left' }}>
                  <span style={{ color:'#9B9B9B', fontSize:11, transform: isOpen ? 'rotate(90deg)' : 'none', display:'inline-block', transition:'transform .15s' }}>▶</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, color:'#1a1c5e' }}>
                      📍 {post.categories?.name || 'Posto'} — {post.site_city}/{post.site_uf} {post.armado ? '· 🔫 armado' : ''}
                    </div>
                    <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:11.5, color:'#9B9B9B', marginTop:2 }}>
                      {post.clients?.nome_fantasia || post.clients?.razao_social}
                      {post.funcao_label ? ` · ${post.funcao_label}` : ''} · {post.qty_posts} posto{post.qty_posts > 1 ? 's' : ''} / {post.qty_people} pessoa{post.qty_people > 1 ? 's' : ''}
                    </div>
                  </div>
                  <span style={{ fontSize:10.5, fontWeight:700, fontFamily:'Montserrat,sans-serif', padding:'3px 10px', borderRadius:20,
                    color: conforme ? '#15803d' : '#92400e', background: conforme ? '#dcfce7' : '#fef3c7' }}>
                    {conforme ? '✓ Posto conforme' : `${people.length}/${post.qty_people} pessoas · ${okSlots}/${slots.length} docs`}
                  </span>
                </button>

                {isOpen && (
                  <div style={{ padding:'14px 16px', borderTop:'1px solid #f0f0f5' }}>
                    {postDocs.length > 0 && (
                      <>
                        <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:11, color:'#9B9B9B', textTransform:'uppercase', letterSpacing:.5, marginBottom:8 }}>
                          Documentos do posto ({post.site_city}/{post.site_uf})
                        </div>
                        {postDocs.map(m => mobDocRow(
                          m, mobilityApi.docTypeKey(m.document_id, 'posto', post.id),
                          `${m.documents_catalog?.name || m.document_id} — Posto ${post.site_city}/${post.site_uf}`,
                          null, post.id))}
                      </>
                    )}

                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', margin:'14px 0 8px' }}>
                      <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:11, color:'#9B9B9B', textTransform:'uppercase', letterSpacing:.5 }}>
                        Colaboradores ({people.length}/{post.qty_people})
                      </div>
                      {hasAction(user, 'acao:enviar_documentos') && (
                        <Button variant="orange" size="sm" onClick={() => setPersonForm({ postId: post.id, nome:'', cpf:'' })}>
                          + Cadastrar colaborador
                        </Button>
                      )}
                    </div>

                    {personForm?.postId === post.id && (
                      <div style={{ display:'flex', gap:8, alignItems:'flex-end', padding:'12px', borderRadius:10, background:'rgba(46,49,146,.04)', marginBottom:10, flexWrap:'wrap' }}>
                        <div style={{ flex:2, minWidth:180 }}>
                          <div style={{ fontSize:10, fontWeight:700, color:'#9B9B9B', fontFamily:'Montserrat,sans-serif', textTransform:'uppercase', marginBottom:4 }}>Nome completo *</div>
                          <input value={personForm.nome} onChange={e => setPersonForm(p => ({ ...p, nome: e.target.value }))}
                            style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:13, boxSizing:'border-box' }}/>
                        </div>
                        <div style={{ flex:1, minWidth:140 }}>
                          <div style={{ fontSize:10, fontWeight:700, color:'#9B9B9B', fontFamily:'Montserrat,sans-serif', textTransform:'uppercase', marginBottom:4 }}>CPF *</div>
                          <input value={personForm.cpf} onChange={e => setPersonForm(p => ({ ...p, cpf: e.target.value }))}
                            placeholder="000.000.000-00"
                            style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:`1px solid ${personForm.cpf && !mobilityApi.validCpf(personForm.cpf) ? '#ef4444' : '#e2e4ef'}`, fontFamily:'DM Sans,sans-serif', fontSize:13, boxSizing:'border-box' }}/>
                        </div>
                        <div style={{ display:'flex', gap:6 }}>
                          <Button variant="neutral" size="sm" onClick={() => setPersonForm(null)}>Cancelar</Button>
                          <Button variant="orange" size="sm" disabled={personBusy || !personForm.nome.trim() || !mobilityApi.validCpf(personForm.cpf)}
                            onClick={handleAddPerson}>
                            {personBusy ? '...' : 'Salvar'}
                          </Button>
                        </div>
                      </div>
                    )}

                    {people.length === 0 ? (
                      <div style={{ padding:'14px 0', textAlign:'center', fontFamily:'DM Sans,sans-serif', fontSize:12.5, color:'#9B9B9B' }}>
                        Nenhum colaborador cadastrado neste posto ainda.
                      </div>
                    ) : people.map(person => {
                      const pOk = personDocs.filter(m => m.required)
                        .every(m => isSatisfied(uploaded.find(d => d.type === mobilityApi.docTypeKey(m.document_id, 'pessoa', person.id))))
                      return (
                        <div key={person.id} style={{ border:'1px solid #eef0f6', borderRadius:10, padding:'10px 12px', marginBottom:8 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                            <span style={{ fontSize:15 }}>👤</span>
                            <div style={{ flex:1 }}>
                              <span style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, fontWeight:700, color:'#1a1c5e' }}>{person.nome}</span>
                              <span style={{ fontFamily:'DM Sans,sans-serif', fontSize:11.5, color:'#9B9B9B', marginLeft:8 }}>CPF {mobilityApi.maskCpf(person.cpf_digits)}</span>
                            </div>
                            {pOk && <span style={{ fontSize:10, fontWeight:700, color:'#15803d', fontFamily:'Montserrat,sans-serif' }}>✓ completo</span>}
                            <button onClick={() => handleRemovePerson(person)} title="Remover colaborador"
                              style={{ background:'none', border:'none', cursor:'pointer', fontSize:13, color:'#9B9B9B' }}>🗑</button>
                          </div>
                          {personDocs.map(m => mobDocRow(
                            m, mobilityApi.docTypeKey(m.document_id, 'pessoa', person.id),
                            `${m.documents_catalog?.name || m.document_id} — ${person.nome} (${post.site_city}/${post.site_uf})`,
                            person.id, post.id))}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
  }

  const renderMobilitySection = (clientKey) => {
    const posts = mobPosts.filter(p => p.client_id === clientKey)
    if (!posts.length) return null
    return (
      <div style={{ marginTop:18, paddingTop:16, borderTop:'1.5px dashed #c7c9e2' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
          <span style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:13, color:'#1a1c5e' }}>👷 Documentos de Mobilidade</span>
          <span style={{ fontSize:9.5, fontWeight:700, color:'#2E3192', background:'rgba(46,49,146,.08)', padding:'2px 8px', borderRadius:20, fontFamily:'Montserrat,sans-serif' }}>parte deste processo</span>
        </div>
        <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:12, color:'#9B9B9B', margin:'2px 0 12px' }}>
          Postos com mão de obra alocada deste cliente. Cadastre cada colaborador (nome e CPF)
          e envie os documentos <b>da pessoa</b> para <b>aquele posto</b> — certidões e certificados
          podem variar conforme a cidade.
        </div>
        {posts.map(renderMobPost)}
      </div>
    )
  }

  // postos de cliente sem card de processo nesta tela (ex.: convite aceito,
  // processo ainda sem matriz) — ganham card próprio nomeando o processo
  const mobOrphanClientIds = [...new Set(mobPosts
    .filter(p => !docGroups.some(g => g.key === p.client_id))
    .map(p => p.client_id))]

  return (
    <div style={{ padding: mobile ? '16px' : '28px 32px', maxWidth:960, margin:'0 auto' }}>
      {toast && (
        <div style={{ position:'fixed',top:80,right:24,background:toast.type==='error'?'#ef4444':'#22c55e',color:'#fff',padding:'12px 20px',borderRadius:12,zIndex:9999,fontFamily:'Montserrat,sans-serif',fontWeight:700,fontSize:13,boxShadow:'0 8px 24px rgba(0,0,0,.2)',maxWidth:340 }}>
          {toast.msg}
        </div>
      )}

      <PageHeader title="Meus Documentos" subtitle={`${supplier?.razao_social} · ${okCount}/${totCount} documentos válidos`} />

      {/* Fechou a fase: docs + questionário + mobilidade completos e processo
          aguardando a análise da EQPI (pedido 25/09) */}
      {completion?.ready && completion?.mobComplete && completion?.pendingSeal
        && totCount > 0 && okCount === totCount && (
        <div style={{ background:'rgba(34,197,94,.08)', border:'1px solid rgba(34,197,94,.3)', borderRadius:14, padding:'16px 20px', marginBottom:20, display:'flex', alignItems:'center', gap:14 }}>
          <div style={{ fontSize:28, lineHeight:1 }}>🎉</div>
          <div style={{ flex:1 }}>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:15, color:'#15803d' }}>
              Parabéns! Você concluiu a homologação.
            </div>
            <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#166534', marginTop:3 }}>
              Seus documentos foram encaminhados para análise — prazo padrão de 3 dias úteis.
              Avisaremos por e-mail quando houver resultado; se algum documento precisar de ajuste,
              ele volta a aparecer aqui como pendente.
            </div>
          </div>
        </div>
      )}

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns: mobile ? '1fr' : 'repeat(3,1fr)', gap:16, marginBottom:24 }}>
        {[
          ['Válidos', okCount, '#22c55e', '✅'],
          ['Pendentes', totCount - okCount, totCount - okCount > 0 ? '#f59e0b' : '#22c55e', '⏳'],
          ['Score ELOS', `${supplier?.score||0}/100`, supplier?.score >= 70 ? '#22c55e' : '#f59e0b', '📊'],
        ].map(([l,v,c,i]) => (
          <Card key={l}><div style={{ display:'flex',alignItems:'center',gap:12 }}><div style={{ fontSize:28 }}>{i}</div><div><div style={{ fontSize:22,fontWeight:800,color:c,fontFamily:'Montserrat,sans-serif' }}>{v}</div><div style={{ fontSize:11,color:'#9B9B9B' }}>{l}</div></div></div></Card>
        ))}
      </div>

      {/* ── Apresentação da Empresa ── */}
      {(() => {
        const presentation = uploaded.find(d => d.type === 'presentation')
        return (
          <Card style={{ borderRadius:16, padding:'20px 24px', marginBottom:20 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ width:44, height:44, borderRadius:12, background:'rgba(46,49,146,.08)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0 }}>📊</div>
                <div>
                  <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:14, color:'#1a1c5e' }}>Apresentação da Empresa</div>
                  <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:12, color:'#9B9B9B', marginTop:2 }}>
                    {presentation
                      ? `Enviada · ${(presentation.updated_at || presentation.created_at || '').slice(0,10)}`
                      : 'PDF, PPTX ou PPT · Máx 50 MB · Aprovado automaticamente'}
                  </div>
                </div>
              </div>
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                {presentation?.storage_path && (
                  <Button variant="neutral" size="sm" onClick={() => handleViewDoc(presentation)}>👁 Ver</Button>
                )}
                <input type="file" accept=".pdf,.pptx,.ppt" ref={presentationRef} style={{ display:'none' }}
                  onChange={e => handlePresentationUpload(e.target.files[0])}/>
                {uploadingPresentation
                  ? <Spinner size={20}/>
                  : <Button variant={presentation ? 'neutral' : 'orange'} size="sm" onClick={() => presentationRef.current?.click()}>
                      {presentation ? '↑ Atualizar' : '↑ Enviar apresentação'}
                    </Button>
                }
              </div>
            </div>
          </Card>
        )
      })()}

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
      ) : docGroups.length > 1 ? (
        /* Multi-processo: um card por fluxo (cliente ou padrão) */
        <>
          {docGroups.map(g => {
            const groupDocs = reqDocs.filter(d => g.ids.has(d.id))
            const groupOk   = groupDocs.filter(d => isSatisfied(getDoc(d.id))).length
            return (
              <Card key={g.key} style={{ borderRadius:16, padding:'20px 24px', marginBottom:16 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16, justifyContent:'space-between', flexWrap:'wrap' }}>
                  <SectionTitle style={{ marginBottom:0 }}>
                    {g.key === 'global' ? '🌐 ' : '🏢 '}{g.title}
                  </SectionTitle>
                  <span style={{ fontSize:12, color: groupOk === groupDocs.length ? '#22c55e' : '#9B9B9B', fontFamily:'DM Sans,sans-serif', fontWeight:600 }}>
                    {groupOk}/{groupDocs.length} válidos
                  </span>
                </div>
                {groupDocs.map(renderDocRow)}
                {renderMobilitySection(g.key)}
              </Card>
            )
          })}
          <div style={{ padding:'10px 14px', background:'rgba(46,49,146,.04)', borderRadius:10, fontSize:12, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>
            Documentos compartilhados entre processos são enviados uma única vez.
            ⚡ Auto = coletado automaticamente · 🌐 Emitir = abre o site oficial · Máx 10MB
          </div>
        </>
      ) : (
        <Card style={{ borderRadius:16, padding:'20px 24px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16, justifyContent:'space-between' }}>
            <SectionTitle style={{ marginBottom:0 }}>
              {docGroups[0]?.title ? `Documentos — ${docGroups[0].title}` : 'Documentos Exigidos para Homologação'}
            </SectionTitle>
            <a href="/fornecedor/categorias" style={{ fontSize:12, color:'#2E3192', fontFamily:'Montserrat,sans-serif', fontWeight:600 }}>
              Editar categorias →
            </a>
          </div>
          {reqDocs.map(renderDocRow)}
          <div style={{ marginTop:10, padding:'10px 14px', background:'rgba(46,49,146,.04)', borderRadius:10, fontSize:12, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>
            ⚡ Auto = coletado automaticamente · 🌐 Emitir = abre o site oficial · 📊 Emitir = gera relatório automático · PDF, JPG ou PNG · Máx 10MB
          </div>
          {renderMobilitySection(docGroups[0]?.key)}
        </Card>
      )}

      {/* Mobilidade de processos sem card acima — nomeia o processo master */}
      {mobOrphanClientIds.map(cid => {
        const posts = mobPosts.filter(p => p.client_id === cid)
        const cname = posts[0]?.clients?.nome_fantasia || posts[0]?.clients?.razao_social || 'Cliente'
        return (
          <Card key={cid} style={{ borderRadius:16, padding:'20px 24px', marginTop:16 }}>
            <SectionTitle>🏢 Processo — {cname}</SectionTitle>
            {renderMobilitySection(cid)}
          </Card>
        )
      })}
    </div>
  )
}
