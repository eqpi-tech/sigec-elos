import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { supplierApi, documentApi } from '../../services/api.js'
import { Card, Spinner, ScoreBar, StatusDot, SectionTitle } from '../../components/ui.jsx'
import SealBadge from '../../components/SealBadge.jsx'

const DOC_STATUS_LABEL = { VALID:'Aprovado', PENDING:'Em análise', MISSING:'Não enviado', REJECTED:'Rejeitado', EXPIRED:'Vencido', EXPIRING:'Vence em breve' }
const DOC_STATUS_COLOR = { VALID:'#22c55e', PENDING:'#f59e0b', MISSING:'#9B9B9B', REJECTED:'#ef4444', EXPIRED:'#ef4444', EXPIRING:'#f59e0b' }
const DOC_BG     = { VALID:'#f8fffe', EXPIRING:'#fffbeb', MISSING:'#f9f9fb', PENDING:'#fff7ed', REJECTED:'#fff5f5', EXPIRED:'#fff5f5' }
const DOC_BORDER = { VALID:'#dcfce7', EXPIRING:'#fef3c7', MISSING:'#e2e4ef', PENDING:'#fed7aa', REJECTED:'#fee2e2', EXPIRED:'#fee2e2' }

const TIPO_LABEL = { produto:'Produto', servico:'Serviço', ambos:'Produto & Serviço' }

const TABS = ['Visão Geral', 'Documentos', 'Histórico']

export default function SupplierProcess() {
  const { sealId }    = useParams()
  const { user }      = useAuth()
  const navigate      = useNavigate()
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [tab, setTab]         = useState('Visão Geral')

  useEffect(() => {
    if (!sealId || !user?.supplierId) return
    supplierApi.getProcess(sealId, user.supplierId)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [sealId, user?.supplierId])

  if (loading) return <div style={{ display:'flex', justifyContent:'center', padding:80 }}><Spinner size={40}/></div>
  if (error)   return <div style={{ padding:32, color:'#dc2626', fontFamily:'DM Sans,sans-serif' }}>{error}</div>
  if (!data)   return null

  const { seal, documents, invitation, isSigec } = data
  const isSusp    = !!(seal.client_suspended_at || seal.status === 'SUSPENDED')
  const effStatus = isSusp ? 'SUSPENDED' : seal.status
  const clientName = seal.clients?.razao_social || (isSigec ? 'SIGEC-ELOS' : 'Cliente')
  const sealName   = seal.seal_name || (isSigec ? 'SIGEC Simples' : `Processo ${clientName}`)

  const validDocs   = documents.filter(d => d.status === 'VALID').length
  const pendingDocs = documents.filter(d => d.status === 'PENDING').length
  const missingDocs = documents.filter(d => ['MISSING','REJECTED'].includes(d.status)).length
  const score       = documents.length > 0 ? Math.round((validDocs / documents.length) * 100) : (seal.score || 0)

  const lbl = { display:'block', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:10, color:'#9B9B9B', letterSpacing:.5, textTransform:'uppercase', marginBottom:4 }
  const val = { fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#1a1c5e', fontWeight:600 }

  return (
    <div style={{ padding:'24px 32px', maxWidth:960, margin:'0 auto' }}>

      {/* Voltar */}
      <button onClick={() => navigate('/fornecedor')}
        style={{ background:'none', border:'none', cursor:'pointer', color:'#2E3192', fontSize:14, fontFamily:'DM Sans,sans-serif', fontWeight:600, marginBottom:20, display:'flex', alignItems:'center', gap:6, padding:0 }}>
        ← Voltar ao Dashboard
      </button>

      {/* Header card */}
      <Card style={{ borderRadius:16, padding:'24px 28px', marginBottom:20, background:'linear-gradient(135deg,#f8f9ff,#fff)' }}>
        <div style={{ display:'flex', gap:24, alignItems:'flex-start', flexWrap:'wrap' }}>
          <SealBadge seal={{ ...seal, clients: { razao_social: clientName } }} size="lg" showClient showScore />
          <div style={{ flex:1, minWidth:200 }}>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:20, color:'#1a1c5e', marginBottom:4 }}>
              {sealName}
            </div>
            <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#64748b', marginBottom:16 }}>
              {isSigec ? 'Processo de homologação SIGEC-ELOS' : clientName}
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(140px,1fr))', gap:12 }}>
              <div>
                <span style={lbl}>Nível</span>
                <span style={val}>{seal.level || 'Simples'}</span>
              </div>
              <div>
                <span style={lbl}>Status</span>
                <span style={{ ...val, color: effStatus==='ACTIVE'?'#22c55e':effStatus==='PENDING'?'#f59e0b':'#ef4444' }}>
                  {effStatus==='ACTIVE'?'Ativo':effStatus==='PENDING'?'Em análise':effStatus==='SUSPENDED'?'Suspenso':'Expirado'}
                </span>
              </div>
              {seal.issued_at && (
                <div>
                  <span style={lbl}>Emitido em</span>
                  <span style={val}>{seal.issued_at.slice(0,10)}</span>
                </div>
              )}
              {seal.expires_at && (
                <div>
                  <span style={lbl}>Válido até</span>
                  <span style={val}>{seal.expires_at.slice(0,10)}</span>
                </div>
              )}
              {seal.score > 0 && (
                <div>
                  <span style={lbl}>Score</span>
                  <span style={{ ...val, color: seal.score>=70?'#22c55e':seal.score>=50?'#f59e0b':'#ef4444' }}>
                    {seal.score}/100
                  </span>
                </div>
              )}
            </div>

            {isSusp && seal.client_suspended_reason && (
              <div style={{ marginTop:12, background:'rgba(245,158,11,.08)', border:'1px solid rgba(245,158,11,.2)', borderRadius:10, padding:'10px 14px', fontSize:13, color:'#92400e', fontFamily:'DM Sans,sans-serif' }}>
                ⚠️ Suspenso: {seal.client_suspended_reason}
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, marginBottom:20, borderBottom:'1px solid #e2e4ef', paddingBottom:0 }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ background:'none', border:'none', borderBottom:tab===t?'2px solid #2E3192':'2px solid transparent', color:tab===t?'#2E3192':'#9B9B9B', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, padding:'10px 16px', cursor:'pointer', marginBottom:-1, transition:'all .15s' }}>
            {t}
          </button>
        ))}
      </div>

      {/* ── Tab: Visão Geral ── */}
      {tab === 'Visão Geral' && (
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

          {/* Progresso */}
          <Card style={{ borderRadius:14, padding:'20px 24px' }}>
            <SectionTitle>Progresso dos Documentos</SectionTitle>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
              <span style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#64748b' }}>Conformidade geral</span>
              <span style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:14, color:'#1a1c5e' }}>{score}%</span>
            </div>
            <ScoreBar score={score} />
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginTop:16 }}>
              {[['Aprovados',validDocs,'#22c55e'],['Em análise',pendingDocs,'#f59e0b'],['Não enviados',missingDocs,'#ef4444'],['Score',seal.score||0,'#2E3192']].map(([label,n,color],i) => (
                <div key={i} style={{ textAlign:'center', padding:'10px', background:`${color}0d`, borderRadius:10, border:`1px solid ${color}22` }}>
                  <div style={{ fontSize:18, fontWeight:900, color, fontFamily:'Montserrat,sans-serif' }}>{n}</div>
                  <div style={{ fontSize:10, color:'#64748b', fontFamily:'DM Sans,sans-serif', marginTop:2 }}>{label}</div>
                </div>
              ))}
            </div>
          </Card>

          {/* Dados do convite (se processo de cliente) */}
          {!isSigec && invitation && (
            <Card style={{ borderRadius:14, padding:'20px 24px' }}>
              <SectionTitle>Dados do Processo</SectionTitle>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:16 }}>
                {invitation.contato && (
                  <div><span style={lbl}>Contato</span><span style={val}>{invitation.contato}</span></div>
                )}
                {invitation.tipo_fornecedor && (
                  <div><span style={lbl}>Tipo de Fornecimento</span><span style={val}>{TIPO_LABEL[invitation.tipo_fornecedor]||invitation.tipo_fornecedor}</span></div>
                )}
                {invitation.subsidiado !== null && invitation.subsidiado !== undefined && (
                  <div><span style={lbl}>Subsidiado</span><span style={{ ...val, color:invitation.subsidiado?'#22c55e':'#64748b' }}>{invitation.subsidiado?'Sim':'Não'}</span></div>
                )}
                {invitation.created_at && (
                  <div><span style={lbl}>Convite enviado em</span><span style={val}>{invitation.created_at.slice(0,10)}</span></div>
                )}
              </div>
              {invitation.escopo && (
                <div style={{ marginTop:16 }}>
                  <span style={lbl}>Escopo</span>
                  <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#1a1c5e', background:'rgba(46,49,146,.04)', border:'1px solid rgba(46,49,146,.1)', borderRadius:10, padding:'10px 14px', marginTop:4, whiteSpace:'pre-wrap', lineHeight:1.5 }}>
                    {invitation.escopo}
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* Info do cliente */}
          {!isSigec && seal.clients && (
            <Card style={{ borderRadius:14, padding:'20px 24px' }}>
              <SectionTitle>Empresa Contratante</SectionTitle>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:16 }}>
                <div><span style={lbl}>Razão Social</span><span style={val}>{seal.clients.razao_social}</span></div>
                {seal.clients.cnpj && <div><span style={lbl}>CNPJ</span><span style={val}>{seal.clients.cnpj}</span></div>}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ── Tab: Documentos ── */}
      {tab === 'Documentos' && (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {/* Link para gestão de uploads */}
          <div style={{ background:'rgba(46,49,146,.04)', border:'1px solid rgba(46,49,146,.12)', borderRadius:12, padding:'10px 16px', display:'flex', gap:10, alignItems:'center' }}>
            <span style={{ fontSize:16 }}>📋</span>
            <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:12, color:'#1a1c5e' }}>
              {isSigec
                ? 'Documentos exigidos pelas suas categorias cadastradas.'
                : `Documentos exigidos por ${clientName} para este processo.`}
              <button onClick={() => navigate('/fornecedor/documentos')} style={{ background:'none', border:'none', color:'#2E3192', cursor:'pointer', fontWeight:700, fontSize:12, padding:'0 0 0 4px', fontFamily:'DM Sans,sans-serif' }}>
                Enviar / atualizar documentos →
              </button>
            </div>
          </div>

          {/* Resumo */}
          <div style={{ display:'flex', gap:8 }}>
            {[['✓ Aprovados',validDocs,'#22c55e'],['⏳ Em análise',pendingDocs,'#f59e0b'],['✗ Pendentes',missingDocs,'#ef4444']].map(([label,n,color],i) => (
              <div key={i} style={{ flex:1, textAlign:'center', padding:'8px', background:`${color}0d`, borderRadius:10, border:`1px solid ${color}22` }}>
                <div style={{ fontSize:15, fontWeight:900, color, fontFamily:'Montserrat,sans-serif' }}>{n}</div>
                <div style={{ fontSize:10, color:'#64748b', fontFamily:'DM Sans,sans-serif' }}>{label}</div>
              </div>
            ))}
          </div>

          {documents.length === 0 ? (
            <Card style={{ borderRadius:14, padding:'32px', textAlign:'center' }}>
              <div style={{ fontSize:32, marginBottom:8 }}>📋</div>
              <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#9B9B9B' }}>
                Nenhum documento enviado ainda
              </div>
            </Card>
          ) : (
            documents.map((doc, i) => (
              <div key={i} style={{ padding:'14px 16px', borderRadius:12, background:DOC_BG[doc.status]||'#f9f9fb', border:`1px solid ${DOC_BORDER[doc.status]||'#e2e4ef'}`, display:'flex', alignItems:'center', gap:12 }}>
                <StatusDot status={doc.status} />
                <div style={{ flex:1 }}>
                  <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, fontWeight:600, color:'#1a1c5e' }}>{doc.label || `Documento ${doc.type}`}</div>
                  <div style={{ fontSize:11, color: DOC_STATUS_COLOR[doc.status]||'#9B9B9B', fontFamily:'DM Sans,sans-serif', marginTop:2 }}>
                    {DOC_STATUS_LABEL[doc.status] || doc.status}
                    {doc.expires_at && ` · Validade: ${doc.expires_at.slice(0,10)}`}
                  </div>
                  {doc.review_note && doc.status === 'REJECTED' && (
                    <div style={{ fontSize:11, color:'#dc2626', fontFamily:'DM Sans,sans-serif', marginTop:3, fontStyle:'italic' }}>
                      Motivo: {doc.review_note}
                    </div>
                  )}
                </div>
                {doc.source === 'AUTO' && (
                  <span style={{ fontSize:10, fontWeight:700, color:'#2E3192', background:'rgba(46,49,146,.08)', padding:'2px 8px', borderRadius:20, fontFamily:'Montserrat,sans-serif' }}>⚡ Auto</span>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Tab: Histórico ── */}
      {tab === 'Histórico' && (
        <Card style={{ borderRadius:14, padding:'32px', textAlign:'center' }}>
          <div style={{ fontSize:32, marginBottom:8 }}>🕐</div>
          <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:15, color:'#1a1c5e', marginBottom:6 }}>
            Histórico em breve
          </div>
          <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#9B9B9B' }}>
            O histórico completo de ações deste processo estará disponível em breve.
          </div>
        </Card>
      )}
    </div>
  )
}
