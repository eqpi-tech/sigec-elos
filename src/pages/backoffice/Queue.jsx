import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { adminApi, documentApi } from '../../services/api.js'
import { Badge, Button, Card, ScoreBar, StatusDot, Spinner, PageHeader, SectionTitle, EmptyState } from '../../components/ui.jsx'

const RISK_COLOR = { Alto:'#ef4444', Médio:'#f59e0b', Baixo:'#22c55e' }

/** Converte qualquer valor para string segura para renderização React.
 *  Previne o erro "Objects are not valid as a React child" quando a BrasilAPI
 *  retorna campos como objetos {codigo, descricao} em vez de strings. */
function safeStr(val, fallback = '—') {
  if (val === null || val === undefined) return fallback
  if (typeof val === 'string') return val || fallback
  if (typeof val === 'number') return String(val)
  if (typeof val === 'boolean') return val ? 'Sim' : 'Não'
  if (typeof val === 'object') {
    // Campos comuns da BrasilAPI que vêm como objeto
    return val.descricao || val.nome || val.texto || val.sigla
      || JSON.stringify(val).slice(0, 60)
  }
  return String(val) || fallback
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
function SanctionCard({ sanctions }) {
  const activeCeis  = sanctions?.ceis  || []
  const activeCnep  = sanctions?.cnep  || []
  const historyCeis = sanctions?.ceisHistory || []
  const historyCnep = sanctions?.cnepHistory || []
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
                  {s.dataInicioSancao && `Início: ${s.dataInicioSancao}`}
                  {s.dataFimSancao   && ` · Fim: ${s.dataFimSancao}`}
                  {!s.dataFimSancao  && ' · Sem prazo determinado'}
                </span>
              </div>
              <div style={{ color:'#1a1c5e',fontFamily:'DM Sans,sans-serif' }}>
                {s.nomeOrgaoSancionador || s.orgaoSancionador || '—'}
              </div>
              {(s.fundamentacaoLegal||s.tipoSancao) && (
                <div style={{ color:'#9B9B9B',fontSize:11,marginTop:2 }}>
                  {s.tipoSancao} {s.fundamentacaoLegal && `· ${s.fundamentacaoLegal}`}
                </div>
              )}
              {s.situacaoDoSancionado && (
                <div style={{ marginTop:2,fontSize:10,color:'#f59e0b',fontWeight:700 }}>Situação: {s.situacaoDoSancionado}</div>
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
  const { id } = useParams()
  const navigate = useNavigate()
  const [data, setData]         = useState(null)
  const [loading, setLoading]   = useState(true)
  const [level, setLevel]       = useState('Simples')
  const [obs, setObs]           = useState('')
  const [done, setDone]         = useState(null)
  const [processing, setProcessing] = useState(false)
  const [docActions, setDocActions] = useState({})

  useEffect(() => {
    adminApi.getSealAnalysis(id)
      .then(d => { setData(d); setLevel(d.seals?.[0]?.level||'Simples') })
      .finally(() => setLoading(false))
  }, [id])

  const handleApprove = async () => { setProcessing(true); await adminApi.approveSeal(id,level); setDone('approved'); setProcessing(false) }
  const handleReject  = async () => {
    if (!obs) { alert('Informe o motivo da rejeição'); return }
    setProcessing(true); await adminApi.rejectSeal(id,obs); setDone('rejected'); setProcessing(false)
  }
  const handleDocAction = async (docId, status) => {
    setDocActions(prev=>({...prev,[docId]:'loading'}))
    await documentApi.updateStatus(docId, status, obs || 'Revisado pelo backoffice')
    setDocActions(prev=>({...prev,[docId]:status}))
    setData(prev => ({ ...prev, documents: prev.documents.map(d => d.id===docId?{...d,status}:d) }))
  }

  if (loading) return <div style={{ display:'flex',justifyContent:'center',alignItems:'center',height:'50vh' }}><Spinner size={48}/></div>
  if (!data) return null

  const docs    = data.documents || []
  const ok      = docs.filter(d=>d.status==='VALID').length
  const miss    = docs.filter(d=>['MISSING','EXPIRED','REJECTED'].includes(d.status)).length
  const cnpjC   = data.cnpj_consultation
  const cnpjDat = cnpjC?.cnpj_data
  const sanctions = cnpjC?.sanctions_data  // { ceis, cnep, ceisHistory, cnepHistory }

  // Sanção ativa = campo has_sanctions do banco OU ceis/cnep ativos no objeto
  const hasActiveSanctions = cnpjC?.has_sanctions ||
    (sanctions?.ceis?.length > 0) || (sanctions?.cnep?.length > 0)

  if (done) return (
    <div style={{ maxWidth:600,margin:'80px auto',padding:24,textAlign:'center' }}>
      <div style={{ fontSize:64,marginBottom:16 }}>{done==='approved'?'✅':'❌'}</div>
      <div style={{ fontFamily:'Montserrat,sans-serif',fontWeight:800,fontSize:22,color:'#1a1c5e',marginBottom:8 }}>
        {done==='approved'?`Selo ELOS ${level} emitido!`:'Solicitação rejeitada'}
      </div>
      <div style={{ fontFamily:'DM Sans,sans-serif',fontSize:15,color:'#9B9B9B',marginBottom:24 }}>
        {done==='approved'?'Fornecedor agora visível no marketplace.':`Motivo: "${obs}"`}
      </div>
      <Button variant="primary" onClick={()=>navigate('/backoffice/fila')}>← Voltar à fila</Button>
    </div>
  )

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
                <div style={{ fontSize:28,fontWeight:900,color:data.score>=70?'#22c55e':data.score>=50?'#f59e0b':'#ef4444',fontFamily:'Montserrat,sans-serif' }}>{data.score||0}</div>
                <div style={{ fontSize:10,color:'#9B9B9B' }}>Score ELOS</div>
              </div>
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
                      <span key={i} title={safeStr(c.descricao)} style={{ fontSize:11,background:'rgba(46,49,146,.07)',color:'#2E3192',padding:'3px 8px',borderRadius:20,cursor:'default' }}>{safeStr(c.codigo)}</span>
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

              {/* Sanções CEIS / CNEP */}
              <div>
                <div style={{ fontSize:11,fontWeight:700,color:'#9B9B9B',fontFamily:'Montserrat,sans-serif',textTransform:'uppercase',letterSpacing:.5,marginBottom:8 }}>Sanções CEIS / CNEP</div>
                <SanctionCard sanctions={sanctions}/>
              </div>

              <div style={{ fontSize:10,color:'#9B9B9B',marginTop:12,fontFamily:'DM Sans,sans-serif' }}>
                Consultado: {cnpjC.consulted_at?.slice(0,16).replace('T',' ')} · BrasilAPI + Portal da Transparência
              </div>
            </Card>
          )}

          {/* Documentos */}
          <Card style={{ borderRadius:16,padding:'20px 24px' }}>
            <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16 }}>
              <SectionTitle>Documentos para Validação</SectionTitle>
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
                  {doc.storage_path && (
                    <Button variant="neutral" size="sm" onClick={async()=>{ const url=await documentApi.getSignedUrl(doc.storage_path); window.open(url,'_blank') }}>👁 Ver</Button>
                  )}
                  {status==='PENDING' && (
                    <>
                      {actn==='loading' ? <Spinner size={16}/> : <>
                        <Button variant="success" size="sm" onClick={()=>handleDocAction(doc.id,'VALID')}>✓ Aprovar</Button>
                        <Button variant="danger"  size="sm" onClick={()=>handleDocAction(doc.id,'REJECTED')}>✕ Rejeitar</Button>
                      </>}
                    </>
                  )}
                </div>
              )
            })}
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
              <div style={{ fontSize:12,fontFamily:'Montserrat,sans-serif',fontWeight:600,color:'#1a1c5e',marginBottom:8 }}>Nível do Selo</div>
              <div style={{ display:'flex',gap:8 }}>
                {['Simples','Premium'].map(l=>(
                  <button key={l} onClick={()=>setLevel(l)} style={{ flex:1,padding:'10px',borderRadius:10,border:`2px solid ${level===l?'#2E3192':'#e2e4ef'}`,background:level===l?'rgba(46,49,146,.08)':'#fff',color:level===l?'#2E3192':'#9B9B9B',fontFamily:'Montserrat,sans-serif',fontWeight:700,fontSize:13,cursor:'pointer' }}>
                    {l==='Premium'?'⭐':'🏷️'} {l}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:12,fontFamily:'Montserrat,sans-serif',fontWeight:600,color:'#1a1c5e',marginBottom:6 }}>Observação</div>
              <textarea value={obs} onChange={e=>setObs(e.target.value)} placeholder="Observações ou motivo de rejeição..." rows={3}
                style={{ width:'100%',padding:'10px 12px',borderRadius:10,border:'1px solid #e2e4ef',fontFamily:'DM Sans,sans-serif',fontSize:13,color:'#1a1c5e',resize:'vertical',boxSizing:'border-box' }}/>
            </div>

            <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
              <Button variant="success" full size="lg" style={{ borderRadius:10 }} disabled={processing} onClick={handleApprove}>
                {processing ? '⏳...' : `✅ Aprovar Selo ${level}`}
              </Button>
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
    </div>
  )
}
