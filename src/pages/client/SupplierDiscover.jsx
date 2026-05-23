import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { marketplaceApi, invitationsApi } from '../../services/api.js'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { Button, Card, ScoreBar, StatusDot, Spinner } from '../../components/ui.jsx'
import SealBadge from '../../components/SealBadge.jsx'
import { useIsMobile } from '../../hooks/useIsMobile.js'

// ── Formatadores ──────────────────────────────────────────────────────────────
const ss = (v, fb = '—') => {
  if (v == null || v === '') return fb
  if (typeof v === 'string') return v.trim() || fb
  if (typeof v === 'object') return v.descricao || v.nome || v.sigla || String(v)
  return String(v)
}
const fmtCNPJ  = (v = '') => { const n = String(v).replace(/\D/g,'').padStart(14,'0'); return `${n.slice(0,2)}.${n.slice(2,5)}.${n.slice(5,8)}/${n.slice(8,12)}-${n.slice(12)}` }
const fmtPhone = (v = '') => { const n = String(v).replace(/\D/g,''); return n.length===11?`(${n.slice(0,2)}) ${n.slice(2,7)}-${n.slice(7)}`:n.length===10?`(${n.slice(0,2)}) ${n.slice(2,6)}-${n.slice(6)}`:v||'—' }
const fmtCEP   = (v = '') => { const n = String(v).replace(/\D/g,''); return n.length===8?`${n.slice(0,5)}-${n.slice(5)}`:v||'—' }
const fmtDate  = (v = '') => { if (!v) return '—'; if (/^\d{4}-\d{2}-\d{2}/.test(v)) { const [y,m,d]=v.split('T')[0].split('-'); return `${d}/${m}/${y}` } return v }
const fmtMoeda = (v) => v != null && v !== '' ? `R$ ${Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2})}` : '—'

// ── Sub-componentes de layout ─────────────────────────────────────────────────
function Section({ icon, title, children, danger }) {
  return (
    <div style={{ marginBottom:28 }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:13, color:danger?'#dc2626':'#1a1c5e', borderBottom:`2px solid ${danger?'rgba(220,38,38,.15)':'rgba(46,49,146,.08)'}`, paddingBottom:10, marginBottom:14 }}>
        {icon} {title}
      </div>
      {children}
    </div>
  )
}
function Row({ label, value, mono, highlight, fullWidth }) {
  const display = value != null && value !== '' ? value : '—'
  return (
    <div style={{ display:'flex', gap:12, padding:'8px 0', borderBottom:'1px solid #f3f4f6', flexDirection:fullWidth?'column':'row', alignItems:'flex-start' }}>
      <span style={{ fontSize:12, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', minWidth:fullWidth?'unset':190, flexShrink:0, paddingTop:1 }}>{label}</span>
      <span style={{ fontSize:13, color:highlight?'#2E3192':'#1a1c5e', fontFamily:mono?'monospace':'DM Sans,sans-serif', fontWeight:highlight?700:500 }}>{display}</span>
    </div>
  )
}
function Chip({ label, color='#2E3192', small }) {
  if (!label) return null
  return <span style={{ fontSize:small?11:12, background:`${color}10`, color, padding:small?'3px 9px':'5px 12px', borderRadius:20, border:`1px solid ${color}22`, fontFamily:'DM Sans,sans-serif', whiteSpace:'nowrap' }}>{label}</span>
}
function BadgeTag({ ok, label }) {
  if (!label) return null
  return <span style={{ fontSize:11, fontWeight:700, fontFamily:'Montserrat,sans-serif', padding:'3px 10px', borderRadius:20, color:ok?'#15803d':'#dc2626', background:ok?'#f0fdf4':'#fef2f2', border:`1px solid ${ok?'#86efac':'#fca5a5'}` }}>{ok?'✓':'✗'} {label}</span>
}

const TIPO_OPTIONS = [
  { v:'servico',label:'Serviço',       icon:'🔧' },
  { v:'produto', label:'Produto',      icon:'📦' },
  { v:'ambos',   label:'Produto & Serviço', icon:'🔀' },
]

// ── Componente principal ──────────────────────────────────────────────────────
export default function ClientSupplierDiscover() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const mobile   = useIsMobile()

  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab,     setTab]     = useState('dados')

  // Modal de convite
  const [showModal,   setShowModal]   = useState(false)
  const [inviteForm,  setInviteForm]  = useState({ tipo:'servico', escopo:'', subsidiado:false })
  const [inviting,    setInviting]    = useState(false)
  const [inviteSent,  setInviteSent]  = useState(false)
  const [inviteError, setInviteError] = useState('')

  useEffect(() => {
    marketplaceApi.getById(id)
      .then(setData)
      .catch(e => console.error('[ClientSupplierDiscover]', e))
      .finally(() => setLoading(false))
  }, [id])

  const sendInvite = async () => {
    setInviting(true); setInviteError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      await invitationsApi.send({
        razao_social:    data.razao_social,
        cnpj:            (data.cnpj || '').replace(/\D/g, ''),
        email:           '',          // lookup server-side se fornecedor já tem conta
        supplier_id:     data.id,     // supplier já existe na base
        client_id:       user.clientId,
        invited_by_role: 'CLIENT',
        tipo_fornecedor: inviteForm.tipo,
        escopo:          inviteForm.escopo,
        subsidiado:      inviteForm.subsidiado,
      }, session?.access_token)
      setInviteSent(true)
      setShowModal(false)
    } catch (e) {
      setInviteError(e.message)
    } finally { setInviting(false) }
  }

  if (loading) return <div style={{ display:'flex', justifyContent:'center', alignItems:'center', height:'50vh' }}><Spinner size={48}/></div>
  if (!data)   return <div style={{ padding:32, color:'#9B9B9B' }}>Fornecedor não encontrado.</div>

  const cd   = data.cnpjData      || {}
  const sd   = data.sanctionsData || {}
  const seal = (data.seals||[])[0]

  const allDocs   = data.documents || []
  const validDocs = allDocs.filter(d => d.status === 'VALID')
  const liveScore = allDocs.length > 0 ? Math.round((validDocs.length / allDocs.length) * 100) : (seal?.score || 0)

  const sealColor    = seal?.level === 'Premium' ? '#F47E2F' : '#2E3192'
  const categories   = (data.supplier_categories||[]).map(sc => sc.categories?.name).filter(Boolean)
  const allSancoes   = [...(sd.ceis||[]), ...(sd.cnep||[])]
  const razaoSocial  = ss(cd.razao_social  || data.razao_social)
  const nomeFantasia = ss(cd.nome_fantasia)
  const cnpjStr      = cd.cnpj || data.cnpj || ''
  const municipio    = ss(cd.municipio || data.city)
  const uf           = ss(cd.uf        || data.state)
  const situacao     = ss(cd.descricao_situacao_cadastral)
  const isAtiva      = situacao === 'ATIVA'
  const hasCnpjData  = Object.keys(cd).length > 0

  const TABS = [
    { id:'dados',      label:'📋 Cadastral' },
    { id:'atividade',  label:'🏭 Atividade' },
    { id:'socios',     label:`👥 Sócios (${(cd.qsa||[]).length})` },
    { id:'documentos', label:`📄 Docs (${validDocs.length}/${allDocs.length})` },
    { id:'categorias', label:'🏷️ Categorias' },
    ...(allSancoes.length > 0 ? [{ id:'sancoes', label:`⚠️ Sanções (${allSancoes.length})` }] : []),
  ]

  const inp = { width:'100%', padding:'10px 12px', borderRadius:10, border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#1a1c5e', boxSizing:'border-box' }

  return (
    <div style={{ padding:mobile?'12px':'28px 32px', maxWidth:940, margin:'0 auto' }}>
      <button onClick={() => navigate('/cliente/fornecedores')}
        style={{ fontSize:13, color:'#9B9B9B', background:'none', border:'none', cursor:'pointer', marginBottom:16, padding:0 }}>
        ← Voltar à busca
      </button>

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <Card style={{ borderRadius:16, padding:mobile?'16px':'24px 28px', marginBottom:16 }}>
        <div style={{ display:'flex', alignItems:'flex-start', gap:16, flexWrap:mobile?'wrap':'nowrap' }}>
          {seal
            ? <SealBadge seal={seal} size="sm" showClient={false} />
            : (
              <div style={{ width:58, height:58, borderRadius:14, background:`${sealColor}18`, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:900, fontSize:24, color:sealColor, flexShrink:0 }}>
                {razaoSocial?.[0]}
              </div>
            )
          }

          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:6 }}>
              <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:mobile?16:20, color:'#1a1c5e' }}>{razaoSocial}</div>
              {seal?.level && (
                <span style={{ fontSize:11, fontWeight:700, color:sealColor, background:`${sealColor}18`, padding:'3px 10px', borderRadius:20, fontFamily:'Montserrat,sans-serif', flexShrink:0 }}>
                  🏅 Selo ELOS {seal.level}
                </span>
              )}
              {allSancoes.length > 0 && (
                <span style={{ fontSize:11, fontWeight:700, color:'#dc2626', background:'#fef2f2', padding:'3px 10px', borderRadius:20, border:'1px solid #fca5a5', flexShrink:0, cursor:'pointer' }}
                  onClick={() => setTab('sancoes')}>
                  ⚠ {allSancoes.length} Sanção{allSancoes.length > 1 ? 'ões' : ''}
                </span>
              )}
            </div>

            {nomeFantasia && nomeFantasia !== '—' && nomeFantasia !== razaoSocial && (
              <div style={{ fontSize:13, color:'#9B9B9B', marginBottom:4 }}>"{nomeFantasia}"</div>
            )}
            <div style={{ fontSize:12, color:'#9B9B9B', marginBottom:10, lineHeight:1.7 }}>
              {cnpjStr ? fmtCNPJ(cnpjStr) : '—'} &nbsp;·&nbsp; {municipio}/{uf}
            </div>

            <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:12 }}>
              {situacao !== '—'
                ? <BadgeTag ok={isAtiva} label={situacao} />
                : <BadgeTag ok={false} label="Situação não consultada" />
              }
              {cd.opcao_pelo_simples && !cd.data_exclusao_do_simples && <BadgeTag ok label="Simples Nacional" />}
              {cd.opcao_pelo_mei && <BadgeTag ok label="MEI" />}
              {cd.porte && <Chip label={cd.porte} small />}
            </div>

            <div style={{ display:'flex', gap:12, alignItems:'center' }}>
              <div style={{ width:180 }}><ScoreBar score={liveScore}/></div>
              <span style={{ fontSize:12, color:'#9B9B9B' }}>{validDocs.length}/{allDocs.length} docs validados</span>
            </div>
          </div>

          {/* Botão de convite */}
          <div style={{ flexShrink:0, display:'flex', flexDirection:'column', gap:8, alignItems:'flex-end' }}>
            {inviteSent ? (
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize:12, color:'#22c55e', fontWeight:700, marginBottom:4 }}>✅ Convite enviado!</div>
                <button onClick={() => navigate('/cliente/convites')}
                  style={{ fontSize:11, color:'#2E3192', background:'rgba(46,49,146,.06)', border:'1px solid rgba(46,49,146,.15)', borderRadius:8, padding:'4px 10px', cursor:'pointer' }}>
                  Ver convites →
                </button>
              </div>
            ) : (
              <Button variant="orange" onClick={() => { setShowModal(true); setInviteError('') }}>
                🤝 Convidar Fornecedor
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* ── TABS ────────────────────────────────────────────────────────── */}
      <div style={{ display:'flex', gap:4, marginBottom:16, overflowX:'auto', paddingBottom:4 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding:'8px 14px', borderRadius:20, whiteSpace:'nowrap', cursor:'pointer', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:12, border:`1px solid ${tab===t.id?(t.id==='sancoes'?'#dc2626':'#2E3192'):'#e2e4ef'}`, background:tab===t.id?(t.id==='sancoes'?'#dc2626':'#2E3192'):'#fff', color:tab===t.id?'#fff':(t.id==='sancoes'?'#dc2626':'#9B9B9B') }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB: CADASTRAL ──────────────────────────────────────────── */}
      {tab === 'dados' && (
        <Card style={{ borderRadius:14, padding:mobile?'16px':'24px 28px' }}>
          <Section icon="🏢" title="Identificação">
            <Row label="Razão Social"       value={razaoSocial} />
            <Row label="Nome Fantasia"      value={nomeFantasia} />
            <Row label="CNPJ"               value={cnpjStr ? fmtCNPJ(cnpjStr) : '—'} mono />
            <Row label="Situação Cadastral" value={`${situacao} (desde ${fmtDate(cd.data_situacao_cadastral)})`} />
            <Row label="Data de Abertura"   value={fmtDate(cd.data_inicio_atividade)} />
            <Row label="Natureza Jurídica"  value={ss(cd.natureza_juridica)} />
            <Row label="Porte"              value={ss(cd.porte)} />
            <Row label="Capital Social"     value={fmtMoeda(cd.capital_social)} highlight />
            <Row label="Opção pelo Simples" value={cd.opcao_pelo_simples ? `Sim (desde ${fmtDate(cd.data_opcao_pelo_simples)})` : 'Não'} />
            <Row label="MEI"                value={cd.opcao_pelo_mei ? 'Sim' : 'Não'} />
          </Section>
          <Section icon="📍" title="Endereço">
            <Row label="Logradouro"     value={[cd.descricao_tipo_de_logradouro, cd.logradouro, cd.numero, cd.complemento].filter(Boolean).join(' ') || '—'} />
            <Row label="Bairro"         value={ss(cd.bairro)} />
            <Row label="Município / UF" value={`${municipio} / ${uf}`} />
            <Row label="CEP"            value={fmtCEP(cd.cep)} mono />
          </Section>
          <Section icon="📞" title="Contato">
            <Row label="Telefone" value={cd.ddd_telefone_1 ? fmtPhone(cd.ddd_telefone_1) : '—'} />
            {cd.ddd_telefone_2 && <Row label="Telefone 2" value={fmtPhone(cd.ddd_telefone_2)} />}
            <Row label="E-mail"   value={ss(cd.email)} />
          </Section>
        </Card>
      )}

      {/* ── TAB: ATIVIDADE ───────────────────────────────────────────── */}
      {tab === 'atividade' && (
        <Card style={{ borderRadius:14, padding:mobile?'16px':'24px 28px' }}>
          {!hasCnpjData ? (
            <div style={{ color:'#9B9B9B', textAlign:'center', padding:32, fontSize:14 }}>Dados de atividade não disponíveis.</div>
          ) : (
            <>
              <Section icon="🏭" title="CNAE Principal">
                <div style={{ padding:'14px 16px', background:'rgba(46,49,146,.04)', borderRadius:10, border:'1px solid rgba(46,49,146,.1)' }}>
                  <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:14, color:'#2E3192' }}>{cd.cnae_fiscal}</div>
                  <div style={{ fontSize:13, color:'#1a1c5e', marginTop:4 }}>{ss(cd.cnae_fiscal_descricao)}</div>
                </div>
              </Section>
              {(cd.cnaes_secundarios||[]).length > 0 && (
                <Section icon="📋" title={`CNAEs Secundários (${cd.cnaes_secundarios.length})`}>
                  {cd.cnaes_secundarios.map((c, i) => (
                    <div key={i} style={{ display:'flex', gap:14, padding:'8px 10px', borderRadius:8, background:'#f8f9ff', marginBottom:6, alignItems:'flex-start' }}>
                      <span style={{ fontWeight:700, color:'#2E3192', flexShrink:0, fontFamily:'Montserrat,sans-serif', fontSize:12, minWidth:64 }}>{c.codigo}</span>
                      <span style={{ fontSize:13, color:'#555' }}>{ss(c.descricao)}</span>
                    </div>
                  ))}
                </Section>
              )}
              {(data.services||[]).length > 0 && (
                <Section icon="🔧" title="Serviços Declarados">
                  <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                    {data.services.map((sv, i) => <Chip key={i} label={sv} color="#15803d"/>)}
                  </div>
                </Section>
              )}
            </>
          )}
        </Card>
      )}

      {/* ── TAB: SÓCIOS ─────────────────────────────────────────────── */}
      {tab === 'socios' && (
        <Card style={{ borderRadius:14, padding:mobile?'16px':'24px 28px' }}>
          {(cd.qsa||[]).length === 0 ? (
            <div style={{ color:'#9B9B9B', textAlign:'center', padding:32, fontSize:14 }}>
              {hasCnpjData ? 'Quadro societário não informado.' : 'Dados não disponíveis.'}
            </div>
          ) : (
            <Section icon="👥" title={`Quadro Societário — ${cd.qsa.length} ${cd.qsa.length===1?'membro':'membros'}`}>
              {cd.qsa.map((socio, i) => (
                <div key={i} style={{ padding:'14px 16px', background:'#f8f9ff', borderRadius:12, marginBottom:10, display:'flex', gap:14, alignItems:'flex-start' }}>
                  <div style={{ width:42, height:42, borderRadius:10, background:'rgba(46,49,146,.1)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:16, color:'#2E3192', flexShrink:0 }}>
                    {ss(socio.nome_socio)?.[0]?.toUpperCase()}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:14, color:'#1a1c5e', marginBottom:6 }}>{ss(socio.nome_socio)}</div>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                      <Chip label={ss(socio.qualificacao_socio)} small />
                      {socio.faixa_etaria && <Chip label={socio.faixa_etaria} color="#9B9B9B" small />}
                    </div>
                    <div style={{ fontSize:11, color:'#9B9B9B', marginTop:6 }}>
                      {socio.data_entrada_sociedade && `Sócio desde ${fmtDate(socio.data_entrada_sociedade)}`}
                      {socio.cnpj_cpf_do_socio && ` · CPF: ${socio.cnpj_cpf_do_socio}`}
                    </div>
                  </div>
                </div>
              ))}
            </Section>
          )}
        </Card>
      )}

      {/* ── TAB: DOCUMENTOS ─────────────────────────────────────────── */}
      {tab === 'documentos' && (
        <Card style={{ borderRadius:14, padding:mobile?'16px':'24px 28px' }}>
          <Section icon="✅" title={`Documentos Validados (${validDocs.length})`}>
            {validDocs.length === 0
              ? <div style={{ color:'#9B9B9B', fontSize:13, textAlign:'center', padding:20 }}>Nenhum documento validado.</div>
              : validDocs.map((doc, i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 0', borderBottom:'1px solid #f3f4f6' }}>
                  <StatusDot status={doc.status}/>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'#1a1c5e' }}>{doc.label}</div>
                    {doc.expires_at && (
                      <div style={{ fontSize:11, color:new Date(doc.expires_at)<new Date()?'#dc2626':'#9B9B9B' }}>
                        {new Date(doc.expires_at)<new Date()?'⚠ Vencido em ':'Válido até '}{doc.expires_at.slice(0,10)}
                      </div>
                    )}
                  </div>
                  {doc.source==='AUTO' && <span style={{ fontSize:10, color:'#22c55e', fontWeight:700, background:'rgba(34,197,94,.08)', padding:'2px 8px', borderRadius:20 }}>⚡ Auto</span>}
                </div>
              ))
            }
          </Section>
          {allDocs.filter(d => d.status !== 'VALID').length > 0 && (
            <Section icon="⏳" title={`Pendentes / Vencidos (${allDocs.filter(d=>d.status!=='VALID').length})`}>
              {allDocs.filter(d => d.status !== 'VALID').map((doc, i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'8px 0', borderBottom:'1px solid #f3f4f6' }}>
                  <StatusDot status={doc.status}/>
                  <span style={{ flex:1, fontSize:13, color:'#9B9B9B' }}>{doc.label}</span>
                  <span style={{ fontSize:11, color:'#f59e0b', fontWeight:700 }}>{doc.status}</span>
                </div>
              ))}
            </Section>
          )}
        </Card>
      )}

      {/* ── TAB: CATEGORIAS ─────────────────────────────────────────── */}
      {tab === 'categorias' && (
        <Card style={{ borderRadius:14, padding:mobile?'16px':'24px 28px' }}>
          <Section icon="🏷️" title="Categorias de Atuação">
            {categories.length === 0
              ? <div style={{ color:'#9B9B9B', fontSize:13, textAlign:'center', padding:20 }}>Sem categorias cadastradas.</div>
              : <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>{categories.map((c,i) => <Chip key={i} label={c}/>)}</div>
            }
          </Section>
          <Section icon="💰" title="Capacidade">
            <Row label="Porte"                value={ss(cd.porte || data.employee_range)} />
            <Row label="Capital Social"       value={fmtMoeda(cd.capital_social)} highlight />
            <Row label="Faixa de Faturamento" value={ss(data.revenue_range)} />
            <Row label="Nº de Funcionários"   value={ss(data.employee_range)} />
          </Section>
        </Card>
      )}

      {/* ── TAB: SANÇÕES ────────────────────────────────────────────── */}
      {tab === 'sancoes' && (
        <Card style={{ borderRadius:14, padding:mobile?'16px':'24px 28px' }}>
          <div style={{ background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:12, padding:'14px 16px', marginBottom:20, display:'flex', gap:12, alignItems:'flex-start' }}>
            <span style={{ fontSize:24, flexShrink:0 }}>⚠️</span>
            <div>
              <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, color:'#dc2626', marginBottom:4 }}>
                {allSancoes.length} sanção{allSancoes.length !== 1 ? 'ões' : ''} identificada{allSancoes.length !== 1 ? 's' : ''}
              </div>
              <div style={{ fontSize:12, color:'#555', lineHeight:1.5 }}>
                Dados do CEIS/CNEP (Portal da Transparência). Verifique o CNPJ de cada sanção.
              </div>
            </div>
          </div>
          {allSancoes.map((item, i) => {
            const cnpjSanc = item.sancionado?.codigoFormatado?.replace(/\D/g,'')
            const isSelf   = cnpjStr && cnpjSanc === String(cnpjStr).replace(/\D/g,'')
            return (
              <div key={i} style={{ border:`1px solid ${isSelf?'#fca5a5':'#fed7aa'}`, borderRadius:12, overflow:'hidden', marginBottom:12 }}>
                <div style={{ padding:'12px 14px', background:isSelf?'#fef2f2':'#fff7ed' }}>
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:4 }}>
                    <span style={{ fontSize:10, fontWeight:700, fontFamily:'Montserrat,sans-serif', padding:'2px 8px', borderRadius:20, color:isSelf?'#dc2626':'#92400e', background:isSelf?'#fef2f2':'#fff7ed', border:`1px solid ${isSelf?'#fca5a5':'#fcd34d'}` }}>
                      {isSelf ? '⚠ Este CNPJ' : '⚠ CNPJ Relacionado'}
                    </span>
                    <span style={{ fontSize:12, fontFamily:'monospace', color:'#555' }}>{item.sancionado?.codigoFormatado}</span>
                  </div>
                  <div style={{ fontSize:13, fontWeight:600, color:'#1a1c5e', marginBottom:2 }}>{(item.sancionado?.nome||'').replace(/^\.\s*/,'')}</div>
                  <div style={{ fontSize:12, color:'#555' }}>{ss(item.tipoSancao?.descricaoPortal)}</div>
                  <div style={{ fontSize:11, color:'#9B9B9B', marginTop:4 }}>
                    {ss(item.orgaoSancionador?.nome)} · {item.dataInicioSancao} → {item.dataFimSancao}
                  </div>
                </div>
              </div>
            )
          })}
        </Card>
      )}

      {/* ── Modal de Convite ────────────────────────────────────────── */}
      {showModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'#fff', borderRadius:16, padding:28, maxWidth:480, width:'100%', boxShadow:'0 20px 60px rgba(0,0,0,.2)' }}>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:18, color:'#1a1c5e', marginBottom:4 }}>
              Convidar Fornecedor
            </div>
            <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#9B9B9B', marginBottom:20 }}>
              {razaoSocial} · {cnpjStr ? fmtCNPJ(cnpjStr) : '—'}
            </div>

            <div style={{ marginBottom:16 }}>
              <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:12, color:'#1a1c5e', textTransform:'uppercase', letterSpacing:.4, marginBottom:8 }}>Tipo de fornecimento</div>
              <div style={{ display:'flex', gap:8 }}>
                {TIPO_OPTIONS.map(t => (
                  <button key={t.v} onClick={() => setInviteForm(f => ({...f, tipo:t.v}))}
                    style={{ flex:1, padding:'10px 8px', borderRadius:10, border:`2px solid ${inviteForm.tipo===t.v?'#2E3192':'#e2e4ef'}`, background:inviteForm.tipo===t.v?'rgba(46,49,146,.07)':'#fff', cursor:'pointer', textAlign:'center' }}>
                    <div style={{ fontSize:18, marginBottom:2 }}>{t.icon}</div>
                    <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:11, color:inviteForm.tipo===t.v?'#2E3192':'#1a1c5e' }}>{t.label}</div>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom:16 }}>
              <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:12, color:'#1a1c5e', textTransform:'uppercase', letterSpacing:.4, marginBottom:8 }}>Escopo / Observações (opcional)</div>
              <textarea
                value={inviteForm.escopo}
                onChange={e => setInviteForm(f => ({...f, escopo:e.target.value}))}
                placeholder="Descreva os serviços ou produtos esperados deste fornecedor..."
                rows={3}
                style={{ ...inp, resize:'vertical' }}
              />
            </div>

            <label style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20, cursor:'pointer' }}>
              <input type="checkbox" checked={inviteForm.subsidiado}
                onChange={e => setInviteForm(f => ({...f, subsidiado:e.target.checked}))}
                style={{ width:16, height:16 }} />
              <div>
                <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, fontWeight:600, color:'#1a1c5e' }}>Homologação subsidiada</div>
                <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:11, color:'#9B9B9B' }}>O custo de homologação será coberto pelo cliente</div>
              </div>
            </label>

            {inviteError && (
              <div style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:8, padding:'8px 12px', fontSize:12, color:'#dc2626', marginBottom:12 }}>
                {inviteError}
              </div>
            )}

            <div style={{ display:'flex', gap:8 }}>
              <Button variant="neutral" full onClick={() => setShowModal(false)}>Cancelar</Button>
              <Button variant="orange" full disabled={inviting} onClick={sendInvite}>
                {inviting ? '⏳ Enviando...' : '🤝 Confirmar Convite'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
