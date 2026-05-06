import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { clientApi, documentApi } from '../../services/api.js'
import { Card, Spinner, StatusDot, ScoreBar, SectionTitle, Button } from '../../components/ui.jsx'

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

export default function ClientSupplierProcess() {
  const { supplierId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState('')
  const [tab, setTab]       = useState('Resumo')

  useEffect(() => {
    if (!user?.clientId || !supplierId) return
    clientApi.getSupplierProcess(supplierId, user.clientId)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [supplierId, user?.clientId])

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
          <div style={{ textAlign:'right', flexShrink:0 }}>
            {seal ? (
              <>
                <div style={{ fontSize:11, fontWeight:700, color:SEAL_COLOR[seal.status], background:`${SEAL_COLOR[seal.status]}18`, padding:'4px 12px', borderRadius:20, fontFamily:'Montserrat,sans-serif', marginBottom:6 }}>
                  {SEAL_LABEL[seal.status]}
                </div>
                {seal.status === 'ACTIVE' && (
                  <div style={{ fontSize:12, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>
                    Score {seal.score}% · {seal.level}
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize:11, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>Aguardando análise</div>
            )}
            {inv?.subsidiado && (
              <div style={{ marginTop:6, fontSize:10, background:'#d1fae5', color:'#065f46', borderRadius:20, padding:'2px 8px', fontFamily:'Montserrat,sans-serif', fontWeight:700 }}>
                SUBSIDIADO
              </div>
            )}
          </div>
        </div>
      </Card>

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
                          <span key={i} title={safeStr(c.descricao)} style={{ fontSize:11, background:'rgba(46,49,146,.07)', color:'#2E3192', padding:'3px 8px', borderRadius:20, fontFamily:'DM Sans,sans-serif', cursor:'default' }}>
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
