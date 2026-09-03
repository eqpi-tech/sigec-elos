import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { marketplaceApi } from '../../services/api.js'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { Button, Card, ScoreBar, StatusDot, Spinner } from '../../components/ui.jsx'
import SealBadge from '../../components/SealBadge.jsx'
import { useIsMobile } from '../../hooks/useIsMobile.js'

// ── Formatadores ─────────────────────────────────────────────────────────────
const ss = (v, fb = '—') => {
  if (v == null || v === '') return fb
  if (typeof v === 'string') return v.trim() || fb
  if (typeof v === 'object') return v.descricao || v.nome || v.sigla || String(v)
  return String(v)
}
const fmtCNPJ = (v = '') => {
  const n = String(v).replace(/\D/g,'').padStart(14,'0')
  return `${n.slice(0,2)}.${n.slice(2,5)}.${n.slice(5,8)}/${n.slice(8,12)}-${n.slice(12)}`
}
const fmtPhone = (v = '') => {
  const n = String(v).replace(/\D/g,'')
  if (n.length === 11) return `(${n.slice(0,2)}) ${n.slice(2,7)}-${n.slice(7)}`
  if (n.length === 10) return `(${n.slice(0,2)}) ${n.slice(2,6)}-${n.slice(6)}`
  return v || '—'
}
const fmtCEP  = (v='') => { const n=String(v).replace(/\D/g,''); return n.length===8?`${n.slice(0,5)}-${n.slice(5)}`:v||'—' }
const fmtDate = (v='') => {
  if (!v) return '—'
  // ISO: "2014-12-15" → "15/12/2014"
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) { const [y,m,d]=v.split('T')[0].split('-'); return `${d}/${m}/${y}` }
  return v   // já formatado ("25/03/2026")
}
const fmtMoeda = (v) => v!=null&&v!=='' ? `R$ ${Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2})}` : '—'

// ── Componentes de layout ─────────────────────────────────────────────────────
function Section({ icon, title, children, danger }) {
  return (
    <div style={{marginBottom:28}}>
      <div style={{display:'flex',alignItems:'center',gap:8,fontFamily:'Montserrat,sans-serif',fontWeight:800,
        fontSize:13,color:danger?'#dc2626':'#1a1c5e',borderBottom:`2px solid ${danger?'rgba(220,38,38,.15)':'rgba(46,49,146,.08)'}`,
        paddingBottom:10,marginBottom:14}}>
        {icon} {title}
      </div>
      {children}
    </div>
  )
}

// Row SEMPRE renderiza — nunca some, mostra '—' quando vazio
function Row({ label, value, mono, highlight, fullWidth }) {
  const display = value != null && value !== '' ? value : '—'
  return (
    <div style={{display:'flex',gap:12,padding:'8px 0',borderBottom:'1px solid #f3f4f6',
      flexDirection: fullWidth ? 'column' : 'row', alignItems:'flex-start'}}>
      <span style={{fontSize:12,color:'#9B9B9B',fontFamily:'DM Sans,sans-serif',
        minWidth: fullWidth ? 'unset' : 190,flexShrink:0,paddingTop:1}}>
        {label}
      </span>
      <span style={{fontSize:13,color:highlight?'#2E3192':'#1a1c5e',
        fontFamily:mono?'monospace':'DM Sans,sans-serif',fontWeight:highlight?700:500}}>
        {display}
      </span>
    </div>
  )
}

function Chip({ label, color='#2E3192', small }) {
  if (!label) return null
  return (
    <span style={{fontSize:small?11:12,background:`${color}10`,color,padding:small?'3px 9px':'5px 12px',
      borderRadius:20,border:`1px solid ${color}22`,fontFamily:'DM Sans,sans-serif',whiteSpace:'nowrap'}}>
      {label}
    </span>
  )
}

function Badge({ ok, label }) {
  if (!label) return null
  return (
    <span style={{fontSize:11,fontWeight:700,fontFamily:'Montserrat,sans-serif',padding:'3px 10px',borderRadius:20,
      color:ok?'#15803d':'#dc2626',background:ok?'#f0fdf4':'#fef2f2',
      border:`1px solid ${ok?'#86efac':'#fca5a5'}`}}>
      {ok?'✓':'✗'} {label}
    </span>
  )
}

// Sanção expansível
function SancaoCard({ item, supplierCnpj }) {
  const [open, setOpen] = useState(false)
  const cnpjSanc = item.sancionado?.codigoFormatado?.replace(/\D/g,'')
  const isSelf   = supplierCnpj && cnpjSanc === String(supplierCnpj).replace(/\D/g,'')
  return (
    <div style={{border:`1px solid ${isSelf?'#fca5a5':'#fed7aa'}`,borderRadius:12,overflow:'hidden',marginBottom:12}}>
      <div style={{padding:'12px 14px',background:isSelf?'#fef2f2':'#fff7ed',cursor:'pointer',display:'flex',gap:12,alignItems:'flex-start'}}
        onClick={()=>setOpen(o=>!o)}>
        <div style={{flex:1}}>
          <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:4}}>
            <span style={{fontSize:10,fontWeight:700,fontFamily:'Montserrat,sans-serif',padding:'2px 8px',borderRadius:20,
              color:isSelf?'#dc2626':'#92400e',background:isSelf?'#fef2f2':'#fff7ed',
              border:`1px solid ${isSelf?'#fca5a5':'#fcd34d'}`}}>
              {isSelf?'⚠ Este CNPJ':'⚠ CNPJ Relacionado'}
            </span>
            <span style={{fontSize:12,fontFamily:'monospace',color:'#555'}}>{item.sancionado?.codigoFormatado}</span>
          </div>
          <div style={{fontSize:13,fontWeight:600,color:'#1a1c5e',marginBottom:2}}>
            {(item.sancionado?.nome||'').replace(/^\.\s*/,'')}
          </div>
          <div style={{fontSize:12,color:'#555',marginBottom:2}}>{ss(item.tipoSancao?.descricaoPortal)}</div>
          <div style={{fontSize:11,color:'#9B9B9B'}}>
            {ss(item.orgaoSancionador?.nome)} · {ss(item.orgaoSancionador?.esfera)}/{ss(item.orgaoSancionador?.siglaUf)}
            &nbsp;·&nbsp; {item.dataInicioSancao} → {item.dataFimSancao}
          </div>
        </div>
        <span style={{color:'#9B9B9B',fontSize:12,flexShrink:0}}>{open?'▲':'▼'}</span>
      </div>
      {open && (
        <div style={{padding:'12px 14px',background:'#fff',borderTop:'1px solid #f3f4f6',display:'flex',flexDirection:'column',gap:4}}>
          <Row label="Empresa Sancionada"  value={ss(item.sancionado?.nome)} />
          <Row label="CNPJ Sancionado"     value={item.sancionado?.codigoFormatado} mono />
          <Row label="Órgão Sancionador"   value={ss(item.orgaoSancionador?.nome)} />
          <Row label="Esfera / UF"         value={`${ss(item.orgaoSancionador?.esfera)} / ${ss(item.orgaoSancionador?.siglaUf)}`} />
          <Row label="Tipo de Sanção"      value={ss(item.tipoSancao?.descricaoPortal)} />
          <Row label="Início"              value={item.dataInicioSancao} />
          <Row label="Fim"                 value={item.dataFimSancao} />
          <Row label="Processo"            value={ss(item.numeroProcesso)} />
          <Row label="Abrangência"         value={ss(item.abrangenciaDefinidaDecisaoJudicial)} />
          {(item.fundamentacao||[]).map((f,i)=>(
            <Row key={i} label={i===0?'Fundamentação':''} value={f.descricao||f.codigo} />
          ))}
          <Row label="Publicação"          value={ss(item.textoPublicacao)} />
          <Row label="Trânsito em Julgado" value={item.dataTransitadoJulgado} />
          {!isSelf && (
            <div style={{marginTop:8,padding:'8px 12px',background:'#fff7ed',borderRadius:8,fontSize:12,color:'#92400e'}}>
              ℹ️ Sanção referente ao CNPJ {item.sancionado?.codigoFormatado}, diferente do CNPJ deste fornecedor.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function SupplierProfile() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const mobile = useIsMobile()
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [inviteSent, setInviteSent] = useState(false)
  const [inviting,   setInviting]   = useState(false)
  const [tab,        setTab]        = useState('dados')
  // Modal de convite
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [inviteObjective, setInviteObjective] = useState('') // 'contato' | 'homologacao'
  const [inviteMsg,       setInviteMsg]       = useState('')
  const [buyerOrg,        setBuyerOrg]        = useState('')  // razão social do comprador (nunca o nome do usuário)

  useEffect(() => {
    if (!user?.buyerId) return
    supabase.from('buyers').select('razao_social').eq('id', user.buyerId).maybeSingle()
      .then(({ data: b }) => { if (b?.razao_social) setBuyerOrg(b.razao_social) })
  }, [user?.buyerId])
  const [catsExpanded,    setCatsExpanded]    = useState(false)

  const SESSION_KEY = 'marketplace_state'
  const hasMarketState = !!sessionStorage.getItem(SESSION_KEY)

  const backToResults = () => {
    // Estado já está no sessionStorage; Marketplace restaura ao montar
    navigate('/comprador')
  }

  useEffect(() => {
    marketplaceApi.getById(id)
      .then(d => { setData(d) })
      .catch(e => console.error('[SupplierProfile] error:', e))
      .finally(() => setLoading(false))
  }, [id])

  // Templates de e-mail por objetivo
  const getTemplate = (objective, supplierName, buyerName) => {
    if (objective === 'contato') return `Olá, ${supplierName}!\n\nMeu nome é ${buyerName} e encontrei o perfil da sua empresa no marketplace SIGEC-ELOS.\n\nGostaria de entrar em contato para conhecer melhor os seus serviços e verificar possibilidades de parceria.\n\nFico à disposição para uma conversa.\n\nAtenciosamente,\n${buyerName}`
    if (objective === 'homologacao') return `Olá, ${supplierName}!\n\nMeu nome é ${buyerName} e estou interessado em homologar a sua empresa para prestação de serviços ao nosso negócio.\n\nAtravés da plataforma SIGEC-ELOS, você poderá completar seu cadastro e documentação de forma digital e ágil.\n\nClique no link abaixo para iniciar o processo.\n\nAtenciosamente,\n${buyerName}`
    return ''
  }

  const openInviteModal = () => {
    setInviteObjective('')
    setInviteMsg('')
    setShowInviteModal(true)
  }

  const handleObjectiveChange = (obj) => {
    setInviteObjective(obj)
    const supp = ss(data?.cnpjData?.razao_social || data?.razao_social)
    const buyer = buyerOrg || 'Comprador SIGEC-ELOS'
    setInviteMsg(getTemplate(obj, supp, buyer))
  }

  const sendInvite = async () => {
    if (!inviteObjective) { alert('Selecione o objetivo do convite.'); return }
    setInviting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token || ''
      const res = await fetch('/.netlify/functions/send-invitation', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${token}` },
        body: JSON.stringify({
          supplierId:          data.id,
          supplierRazaoSocial: ss(data?.cnpjData?.razao_social || data?.razao_social),
          supplierCnpj:        fmtCNPJ(data?.cnpj || ''),
          buyerId:             user.buyerId,
          buyerName:           buyerOrg || 'Comprador SIGEC-ELOS',
          buyerEmail:          user.email || '',
          invited_by_role:     'BUYER',
          objective:           inviteObjective,
          customMessage:       inviteMsg,
        })
      })
      if (!res.ok) throw new Error('Erro ao enviar convite')
      setInviteSent(true)
      setShowInviteModal(false)
    } catch (e) { alert('Erro: ' + e.message) }
    setInviting(false)
  }

  if (loading) return <div style={{display:'flex',justifyContent:'center',alignItems:'center',height:'50vh'}}><Spinner size={48}/></div>
  if (!data)   return <div style={{padding:32,color:'#9B9B9B'}}>Fornecedor não encontrado.</div>

  // ── Dados ────────────────────────────────────────────────────────────────
  const cd   = data.cnpjData      || {}
  const sd   = data.sanctionsData || {}
  const seal = (data.seals||[])[0]

  // Score dinâmico: docs VALID / total × 100
  const allDocs   = data.documents || []
  const validDocs = allDocs.filter(d => d.status === 'VALID')
  const liveScore = allDocs.length > 0 ? Math.round((validDocs.length / allDocs.length) * 100) : (seal?.score || 0)

  const sealColor  = seal?.level === 'Premium' ? '#F47E2F' : '#2E3192'
  const categories = (data.supplier_categories||[]).map(sc=>sc.categories?.name).filter(Boolean)
  const allSancoes = [...(sd.ceis||[]), ...(sd.cnep||[])]

  // REGRA: o BANCO é a fonte de leitura (suppliers + tabelas estruturadas).
  // cnpj_data (BrasilAPI) é apenas complemento para campos sem coluna própria —
  // a consulta grava no banco, o sistema lê do banco.
  const hocEnd       = (data.hocEnderecos || [])[0] || {}
  const dbAddr       = data.address || {}
  const razaoSocial  = ss(data.razao_social  || cd.razao_social)
  const nomeFantasia = ss(data.nome_fantasia || cd.nome_fantasia)
  const cnpjStr      = data.cnpj || cd.cnpj || ''
  const municipio    = ss(data.city  || dbAddr.municipio || hocEnd.municipio || cd.municipio)
  const uf           = ss(data.state || dbAddr.uf        || hocEnd.uf        || cd.uf)
  const situacao     = ss(cd.descricao_situacao_cadastral)   // "ATIVA" (só via consulta)
  const isAtiva      = situacao === 'ATIVA'
  const tipoLogr     = ss(cd.descricao_tipo_de_logradouro,'')
  const endereco     = [dbAddr.logradouro, dbAddr.numero].filter(Boolean).join(', ')
                       || [hocEnd.logradouro, hocEnd.numero, hocEnd.complemento].filter(Boolean).join(' ')
                       || [tipoLogr, cd.logradouro, cd.numero, cd.complemento].filter(Boolean).join(' ')
                       || '—'

  const hasCnpjData = Object.keys(cd).length > 0

  // Sócios: supplier_partners (migrados do HOC / backoffice) tem prioridade;
  // fallback QSA da BrasilAPI
  const socios = (data.partners || []).length > 0
    ? data.partners.map(p => ({
        nome_socio: p.nome,
        qualificacao_socio: p.cargo || (p.tipo === 'pj' ? 'Pessoa Jurídica' : 'Sócio'),
        participacao: p.participacao,
        nacionalidade: p.nacionalidade,
        cpf: p.cpf,
        telefone: p.telefone,
        telefone_mascarado: p.telefone_mascarado,
      }))
    : (cd.qsa || [])

  const TABS = [
    {id:'dados',      label:'📋 Cadastral'},
    {id:'atividade',  label:'🏭 Atividade'},
    {id:'socios',     label:`👥 Sócios (${socios.length})`},
    {id:'documentos', label:`📄 Docs (${validDocs.length}/${allDocs.length})`},
    {id:'categorias', label:'🏷️ Categorias'},
    ...(allSancoes.length > 0 ? [{id:'sancoes', label:`⚠️ Sanções (${allSancoes.length})`}] : []),
  ]

  return (
    <div style={{padding:mobile?'12px':'28px 32px',maxWidth:940,margin:'0 auto'}}>
      <button onClick={hasMarketState ? backToResults : () => navigate('/comprador')}
        style={{fontSize:13,color:'#2E3192',background:'rgba(46,49,146,.06)',border:'1px solid rgba(46,49,146,.15)',borderRadius:8,padding:'6px 14px',cursor:'pointer',marginBottom:16,fontFamily:'DM Sans,sans-serif',fontWeight:600}}>
        ← {hasMarketState ? 'Voltar ao resultado anterior' : 'Voltar ao marketplace'}
      </button>

      {/* ── HEADER ──────────────────────────────────────────────────────── */}
      <Card style={{borderRadius:16,padding:mobile?'16px':'24px 28px',marginBottom:16}}>
        <div style={{display:'flex',alignItems:'flex-start',gap:16,flexWrap:mobile?'wrap':'nowrap'}}>
          {seal ? (
            <SealBadge seal={seal} size="sm" showClient={false} />
          ) : (
            <div style={{width:58,height:58,borderRadius:14,background:`${sealColor}18`,display:'flex',alignItems:'center',
              justifyContent:'center',fontWeight:900,fontSize:24,color:sealColor,flexShrink:0}}>
              {razaoSocial?.[0]}
            </div>
          )}

          <div style={{flex:1,minWidth:0}}>
            <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:6}}>
              <div style={{fontFamily:'Montserrat,sans-serif',fontWeight:900,fontSize:mobile?16:20,color:'#1a1c5e'}}>
                {razaoSocial}
              </div>
              {seal?.level && (
                <span style={{fontSize:11,fontWeight:700,color:sealColor,background:`${sealColor}18`,
                  padding:'3px 10px',borderRadius:20,fontFamily:'Montserrat,sans-serif',flexShrink:0}}>
                  🏅 Selo ELOS {seal.level}
                </span>
              )}
              {allSancoes.length > 0 && (
                <span style={{fontSize:11,fontWeight:700,color:'#dc2626',background:'#fef2f2',
                  padding:'3px 10px',borderRadius:20,border:'1px solid #fca5a5',flexShrink:0,cursor:'pointer'}}
                  onClick={()=>setTab('sancoes')}>
                  ⚠ {allSancoes.length} Sanção{allSancoes.length>1?'ões':''}
                </span>
              )}
            </div>

            {nomeFantasia && nomeFantasia !== '—' && nomeFantasia !== razaoSocial && (
              <div style={{fontSize:13,color:'#9B9B9B',marginBottom:4}}>"{nomeFantasia}"</div>
            )}
            <div style={{fontSize:12,color:'#9B9B9B',marginBottom:10,lineHeight:1.7}}>
              {cnpjStr ? fmtCNPJ(cnpjStr) : '—'} &nbsp;·&nbsp; {municipio}/{uf}
              {cd.descricao_identificador_matriz_filial && ` · ${cd.descricao_identificador_matriz_filial}`}
              {seal?.issued_at && ` · Homologado em ${fmtDate(seal.issued_at)}`}
            </div>

            <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:12}}>
              {situacao !== '—'
                ? <Badge ok={isAtiva} label={situacao} />
                : <Badge ok={false} label="Situação não consultada" />
              }
              {cd.opcao_pelo_simples && !cd.data_exclusao_do_simples && <Badge ok label="Simples Nacional" />}
              {cd.data_exclusao_do_simples && <Badge ok={false} label={`Ex-Simples (saiu ${fmtDate(cd.data_exclusao_do_simples)})`} />}
              {cd.opcao_pelo_mei && <Badge ok label="MEI" />}
              {cd.porte && <Chip label={cd.porte} small />}
            </div>

            <div style={{display:'flex',gap:12,alignItems:'center'}}>
              <div style={{width:180}}><ScoreBar score={liveScore}/></div>
              <span style={{fontSize:12,color:'#9B9B9B'}}>{validDocs.length}/{allDocs.length} docs validados</span>
              {!hasCnpjData && (
                <span style={{fontSize:11,color:'#f59e0b',background:'rgba(245,158,11,.1)',padding:'2px 8px',borderRadius:20}}>
                  ⚡ Dados Receita Federal não disponíveis
                </span>
              )}
            </div>
          </div>

          <div style={{display:'flex',flexDirection:'column',gap:8,alignItems:'flex-end',flexShrink:0}}>
            {inviteSent
              ? (
                <div style={{textAlign:'right'}}>
                  <div style={{fontSize:12,color:'#22c55e',fontWeight:700,marginBottom:4}}>✅ Convite enviado!</div>
                  <button onClick={()=>navigate('/comprador/convites')}
                    style={{fontSize:11,color:'#2E3192',background:'rgba(46,49,146,.06)',border:'1px solid rgba(46,49,146,.15)',borderRadius:8,padding:'4px 10px',cursor:'pointer',fontFamily:'DM Sans,sans-serif'}}>
                    Ver convites →
                  </button>
                </div>
              ) : (
                <Button variant="orange" onClick={openInviteModal}>
                  🤝 Enviar Convite
                </Button>
              )
            }
            {data.cnpjConsultedAt && (
              <span style={{fontSize:10,color:'#9B9B9B',textAlign:'right'}}>
                🔄 Receita Federal<br/>{new Date(data.cnpjConsultedAt).toLocaleDateString('pt-BR')}
              </span>
            )}
          </div>
        </div>
      </Card>

      {/* ── TABS ────────────────────────────────────────────────────────── */}
      <div style={{display:'flex',gap:4,marginBottom:16,overflowX:'auto',paddingBottom:4}}>
        {TABS.map(t => (
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{padding:'8px 14px',borderRadius:20,whiteSpace:'nowrap',cursor:'pointer',
              fontFamily:'Montserrat,sans-serif',fontWeight:700,fontSize:12,
              border:`1px solid ${tab===t.id?(t.id==='sancoes'?'#dc2626':'#2E3192'):'#e2e4ef'}`,
              background:tab===t.id?(t.id==='sancoes'?'#dc2626':'#2E3192'):'#fff',
              color:tab===t.id?'#fff':(t.id==='sancoes'?'#dc2626':'#9B9B9B')}}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB: CADASTRAL ──────────────────────────────────────────────── */}
      {tab==='dados' && (
        <Card style={{borderRadius:14,padding:mobile?'16px':'24px 28px'}}>
          <Section icon="🏢" title="Identificação">
            <Row label="Razão Social"           value={razaoSocial} />
            <Row label="Nome Fantasia"          value={nomeFantasia} />
            <Row label="CNPJ"                   value={cnpjStr ? fmtCNPJ(cnpjStr) : '—'} mono />
            {hasCnpjData && <Row label="Situação Cadastral" value={`${situacao} (desde ${fmtDate(cd.data_situacao_cadastral)})`} />}
            <Row label="Tipo"                   value={ss(data.tipo_empresa || cd.descricao_identificador_matriz_filial)} />
            <Row label="Data de Abertura"       value={fmtDate(data.data_abertura || cd.data_inicio_atividade)} />
            {ss(data.inscricao_estadual)  !== '—' && <Row label="Inscrição Estadual"  value={ss(data.inscricao_estadual)}  mono />}
            {ss(data.inscricao_municipal) !== '—' && <Row label="Inscrição Municipal" value={ss(data.inscricao_municipal)} mono />}
            <Row label="Natureza Jurídica"      value={ss(cd.natureza_juridica)} />
            <Row label="Porte"                  value={ss(cd.porte)} />
            <Row label="Capital Social"         value={fmtMoeda(data.capital_social ?? cd.capital_social)} highlight />
            <Row label="Opção pelo Simples"
              value={cd.opcao_pelo_simples
                ? `Sim (desde ${fmtDate(cd.data_opcao_pelo_simples)})${cd.data_exclusao_do_simples ? ` · Excluído em ${fmtDate(cd.data_exclusao_do_simples)}` : ''}`
                : 'Não'} />
            <Row label="MEI"                    value={cd.opcao_pelo_mei ? 'Sim' : 'Não'} />
            {ss(cd.situacao_especial)!=='—' && <Row label="Situação Especial" value={ss(cd.situacao_especial)} />}
          </Section>

          <Section icon="📍" title="Endereço">
            <Row label="Logradouro"             value={endereco} />
            <Row label="Bairro"                 value={ss(hocEnd.bairro || cd.bairro)} />
            <Row label="Município / UF"         value={`${municipio} / ${uf}`} />
            <Row label="CEP"                    value={fmtCEP(dbAddr.cep || hocEnd.cep || cd.cep)} mono />
          </Section>

          {(data.hocEnderecos || []).length > 1 && (
            <Section icon="🗺️" title={`Outros Endereços (${data.hocEnderecos.length - 1})`}>
              {data.hocEnderecos.slice(1).map((e, i) => (
                <div key={i} style={{padding:'10px 14px',background:'#f8f9ff',borderRadius:10,marginBottom:6,fontSize:13,color:'#1a1c5e'}}>
                  {[e.logradouro, e.numero, e.complemento].filter(Boolean).join(', ')}
                  <div style={{fontSize:11,color:'#9B9B9B',marginTop:2}}>
                    {[e.bairro, e.municipio && `${e.municipio}/${e.uf}`, e.cep && fmtCEP(e.cep)].filter(Boolean).join(' · ')}
                  </div>
                </div>
              ))}
            </Section>
          )}

          <Section icon="📞" title="Contato">
            {/* valores mascarados já vêm formatados do servidor — não reformatar */}
            <Row label="Telefone"               value={data.phone || (cd.ddd_telefone_1 ? (data.contacts_masked ? cd.ddd_telefone_1 : fmtPhone(cd.ddd_telefone_1)) : '—')} />
            {cd.ddd_telefone_2 && <Row label="Telefone 2" value={data.contacts_masked ? cd.ddd_telefone_2 : fmtPhone(cd.ddd_telefone_2)} />}
            <Row label="E-mail"                 value={ss(data.email || cd.email)} />
            {data.contacts_masked && (
              <div style={{marginTop:10,padding:'10px 14px',borderRadius:10,background:'#fff7ed',border:'1px solid rgba(244,126,47,.35)',fontSize:12,color:'#F47E2F',fontFamily:'DM Sans,sans-serif',fontWeight:600}}>
                🔒 Assine um plano para ver os contatos completos do fornecedor e dos sócios
              </div>
            )}
          </Section>

          {(cd.regime_tributario||[]).length > 0 && (
            <Section icon="📊" title="Regime Tributário">
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:10}}>
                {[...(cd.regime_tributario||[])].sort((a,b)=>b.ano-a.ano).map(r => (
                  <div key={r.ano} style={{padding:'12px 14px',background:'rgba(46,49,146,.04)',borderRadius:10,border:'1px solid rgba(46,49,146,.1)'}}>
                    <div style={{fontFamily:'Montserrat,sans-serif',fontWeight:900,fontSize:20,color:'#F47E2F',lineHeight:1}}>{r.ano}</div>
                    <div style={{fontSize:12,color:'#1a1c5e',fontWeight:600,marginTop:6}}>{ss(r.forma_de_tributacao)}</div>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </Card>
      )}

      {/* ── TAB: ATIVIDADE ── banco primeiro, cnpj_data como complemento ── */}
      {tab==='atividade' && (
        <Card style={{borderRadius:14,padding:mobile?'16px':'24px 28px'}}>
          {(() => {
            const cnaePrincipal = data.cnae_main || cd.cnae_fiscal
            // Secundários: cnpj_data traz código+descrição; cnae_list do banco traz códigos
            const secundarios = (cd.cnaes_secundarios || []).length > 0
              ? cd.cnaes_secundarios
              : (data.cnae_list || []).filter(c => c !== String(cnaePrincipal)).map(c => ({ codigo: c, descricao: null }))

            if (!cnaePrincipal && !secundarios.length && !(data.services||[]).length) return (
              <div style={{color:'#9B9B9B',textAlign:'center',padding:32,fontSize:14}}>
                Dados de atividade econômica não disponíveis para este fornecedor.
              </div>
            )
            return (
              <>
                {cnaePrincipal && (
                  <Section icon="🏭" title="CNAE Principal">
                    <div style={{padding:'14px 16px',background:'rgba(46,49,146,.04)',borderRadius:10,border:'1px solid rgba(46,49,146,.1)'}}>
                      <div style={{fontFamily:'Montserrat,sans-serif',fontWeight:700,fontSize:14,color:'#2E3192'}}>
                        {cnaePrincipal}
                      </div>
                      {ss(cd.cnae_fiscal_descricao) !== '—' && (
                        <div style={{fontSize:13,color:'#1a1c5e',marginTop:4}}>{ss(cd.cnae_fiscal_descricao)}</div>
                      )}
                    </div>
                  </Section>
                )}

                {secundarios.length > 0 && (
                  <Section icon="📋" title={`CNAEs Secundários (${secundarios.length})`}>
                    {secundarios.map((c,i) => (
                      <div key={i} style={{display:'flex',gap:14,padding:'8px 10px',borderRadius:8,background:'#f8f9ff',marginBottom:6,alignItems:'flex-start'}}>
                        <span style={{fontWeight:700,color:'#2E3192',flexShrink:0,fontFamily:'Montserrat,sans-serif',fontSize:12,minWidth:64}}>{c.codigo}</span>
                        {c.descricao && <span style={{fontSize:13,color:'#555'}}>{ss(c.descricao)}</span>}
                      </div>
                    ))}
                  </Section>
                )}

                {(data.services||[]).length > 0 && (
                  <Section icon="🔧" title="Serviços Declarados">
                    <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
                      {data.services.map((sv,i)=><Chip key={i} label={sv} color="#15803d"/>)}
                    </div>
                  </Section>
                )}
              </>
            )
          })()}
        </Card>
      )}

      {/* ── TAB: SÓCIOS ─────────────────────────────────────────────────── */}
      {tab==='socios' && (
        <Card style={{borderRadius:14,padding:mobile?'16px':'24px 28px'}}>
          {socios.length === 0 ? (
            <div style={{color:'#9B9B9B',textAlign:'center',padding:32,fontSize:14}}>
              {hasCnpjData ? 'Quadro societário não informado.' : 'Dados não disponíveis.'}
            </div>
          ) : (
            <Section icon="👥" title={`Quadro Societário — ${socios.length} ${socios.length===1?'membro':'membros'}`}>
              {socios.map((socio,i) => (
                <div key={i} style={{padding:'14px 16px',background:'#f8f9ff',borderRadius:12,marginBottom:10,display:'flex',gap:14,alignItems:'flex-start'}}>
                  <div style={{width:42,height:42,borderRadius:10,background:'rgba(46,49,146,.1)',display:'flex',alignItems:'center',
                    justifyContent:'center',fontWeight:800,fontSize:16,color:'#2E3192',flexShrink:0}}>
                    {ss(socio.nome_socio)?.[0]?.toUpperCase()}
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontFamily:'Montserrat,sans-serif',fontWeight:700,fontSize:14,color:'#1a1c5e',marginBottom:6}}>
                      {ss(socio.nome_socio)}
                    </div>
                    <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:6}}>
                      <Chip label={ss(socio.qualificacao_socio)} small />
                      {socio.participacao != null && <Chip label={`${socio.participacao}%`} color="#F47E2F" small />}
                      {socio.nacionalidade && <Chip label={socio.nacionalidade} color="#9B9B9B" small />}
                      {socio.faixa_etaria && <Chip label={socio.faixa_etaria} color="#9B9B9B" small />}
                    </div>
                    <div style={{fontSize:11,color:'#9B9B9B',lineHeight:1.7}}>
                      {socio.data_entrada_sociedade && `Sócio desde ${fmtDate(socio.data_entrada_sociedade)}`}
                      {(socio.cpf || socio.cnpj_cpf_do_socio) && ` · CPF: ${socio.cpf || socio.cnpj_cpf_do_socio}`}
                      {socio.telefone && ` · 📞 ${socio.telefone}`}
                    </div>
                    {socio.telefone_mascarado && (
                      <div style={{fontSize:11,color:'#F47E2F',fontFamily:'DM Sans,sans-serif',marginTop:4,fontWeight:600}}>
                        🔒 Assine um plano para ver os contatos completos dos sócios
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </Section>
          )}
        </Card>
      )}

      {/* ── TAB: DOCUMENTOS ─────────────────────────────────────────────── */}
      {tab==='documentos' && (
        <Card style={{borderRadius:14,padding:mobile?'16px':'24px 28px'}}>
          <Section icon="✅" title={`Documentos Validados (${validDocs.length})`}>
            {validDocs.length === 0
              ? <div style={{color:'#9B9B9B',fontSize:13,textAlign:'center',padding:20}}>Nenhum documento validado.</div>
              : validDocs.map((doc,i) => (
                <div key={i} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 0',borderBottom:'1px solid #f3f4f6'}}>
                  <StatusDot status={doc.status}/>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:600,color:'#1a1c5e'}}>{doc.label}</div>
                    {doc.expires_at && (
                      <div style={{fontSize:11,color:new Date(doc.expires_at)<new Date()?'#dc2626':'#9B9B9B'}}>
                        {new Date(doc.expires_at)<new Date()?'⚠ Vencido em ':'Válido até '}{doc.expires_at.slice(0,10)}
                      </div>
                    )}
                  </div>
                  {doc.source==='AUTO' && <span style={{fontSize:10,color:'#22c55e',fontWeight:700,background:'rgba(34,197,94,.08)',padding:'2px 8px',borderRadius:20}}>⚡ Auto</span>}
                </div>
              ))
            }
          </Section>
          {allDocs.filter(d=>d.status!=='VALID').length > 0 && (
            <Section icon="⏳" title={`Pendentes / Vencidos (${allDocs.filter(d=>d.status!=='VALID').length})`}>
              {allDocs.filter(d=>d.status!=='VALID').map((doc,i) => (
                <div key={i} style={{display:'flex',alignItems:'center',gap:12,padding:'8px 0',borderBottom:'1px solid #f3f4f6'}}>
                  <StatusDot status={doc.status}/>
                  <span style={{flex:1,fontSize:13,color:'#9B9B9B'}}>{doc.label}</span>
                  <span style={{fontSize:11,color:'#f59e0b',fontWeight:700}}>{doc.status}</span>
                </div>
              ))}
            </Section>
          )}
        </Card>
      )}

      {/* ── TAB: CATEGORIAS ─────────────────────────────────────────────── */}
      {tab==='categorias' && (
        <Card style={{borderRadius:14,padding:mobile?'16px':'24px 28px'}}>
          <Section icon="🏷️" title="Categorias de Atuação">
            {categories.length === 0
              ? <div style={{color:'#9B9B9B',fontSize:13,textAlign:'center',padding:20}}>Sem categorias cadastradas.</div>
              : (() => {
                  const INIT = 5
                  const visible = catsExpanded ? categories : categories.slice(0, INIT)
                  const extra   = categories.length - INIT
                  return (
                    <>
                      <div style={{display:'flex',flexWrap:'wrap',gap:8}}>{visible.map((c,i)=><Chip key={i} label={c}/>)}</div>
                      {categories.length > INIT && (
                        <button onClick={() => setCatsExpanded(x => !x)}
                          style={{ marginTop:10,background:'none',border:'none',cursor:'pointer',fontSize:12,color:'#2E3192',fontFamily:'Montserrat,sans-serif',fontWeight:700,padding:0 }}>
                          {catsExpanded ? '▲ Ver menos' : `+ ${extra} categoria${extra!==1?'s':''} | Ver mais`}
                        </button>
                      )}
                    </>
                  )
                })()
            }
          </Section>
          <Section icon="💰" title="Capacidade Financeira">
            <Row label="Porte"                value={ss(cd.porte||data.employee_range)} />
            <Row label="Capital Social"       value={fmtMoeda(cd.capital_social)} highlight />
            <Row label="Faixa de Faturamento" value={ss(data.revenue_range)} />
            <Row label="Nº de Funcionários"   value={ss(data.employee_range)} />
            <Row label="Plano SIGEC-ELOS"     value={ss(data.planType)} />
          </Section>
          <div style={{background:'rgba(46,49,146,.04)',border:'1px solid rgba(46,49,146,.1)',borderRadius:10,padding:'10px 14px',fontSize:11,color:'#9B9B9B',fontStyle:'italic'}}>
            ℹ️ Dados financeiros via Receita Federal ou autodeclarados. A EQPI Tech não garante exatidão para fins de crédito.
          </div>
        </Card>
      )}

      {/* ── TAB: SANÇÕES ────────────────────────────────────────────────── */}
      {tab==='sancoes' && (
        <Card style={{borderRadius:14,padding:mobile?'16px':'24px 28px'}}>
          <div style={{background:'#fef2f2',border:'1px solid #fca5a5',borderRadius:12,padding:'14px 16px',marginBottom:20,display:'flex',gap:12,alignItems:'flex-start'}}>
            <span style={{fontSize:24,flexShrink:0}}>⚠️</span>
            <div>
              <div style={{fontFamily:'Montserrat,sans-serif',fontWeight:700,fontSize:13,color:'#dc2626',marginBottom:4}}>
                {allSancoes.length} sanção{allSancoes.length!==1?'ões':''} identificada{allSancoes.length!==1?'s':''}
              </div>
              <div style={{fontSize:12,color:'#555',lineHeight:1.5}}>
                Dados do CEIS/CNEP (Portal da Transparência). Verifique o CNPJ de cada sanção — podem ser de empresas relacionadas, não necessariamente do próprio fornecedor.
              </div>
            </div>
          </div>

          {(sd.ceis||[]).length > 0 && (
            <Section icon="🚫" title={`CEIS — ${sd.ceis.length} registro${sd.ceis.length!==1?'s':''}`} danger>
              {sd.ceis.map((item,i)=><SancaoCard key={i} item={item} supplierCnpj={cnpjStr}/>)}
            </Section>
          )}
          {(sd.cnep||[]).length > 0 && (
            <Section icon="📋" title={`CNEP — ${sd.cnep.length} registro${sd.cnep.length!==1?'s':''}`} danger>
              {sd.cnep.map((item,i)=><SancaoCard key={i} item={item} supplierCnpj={cnpjStr}/>)}
            </Section>
          )}
        </Card>
      )}

      {/* ── Modal de convite ──────────────────────────────────────────── */}
      {showInviteModal && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.45)',zIndex:999,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
          <div style={{background:'#fff',borderRadius:20,padding:'28px 32px',width:'100%',maxWidth:560,boxShadow:'0 20px 60px rgba(0,0,0,.2)',maxHeight:'90vh',overflowY:'auto'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
              <div style={{fontFamily:'Montserrat,sans-serif',fontWeight:800,fontSize:18,color:'#1a1c5e'}}>Convidar Fornecedor</div>
              <button onClick={()=>setShowInviteModal(false)}
                style={{background:'none',border:'none',fontSize:20,cursor:'pointer',color:'#9B9B9B'}}>✕</button>
            </div>
            <div style={{fontSize:13,color:'#9B9B9B',marginBottom:20,fontFamily:'DM Sans,sans-serif'}}>Para: <strong style={{color:'#1a1c5e'}}>{razaoSocial}</strong></div>

            {/* Objetivo — mesmo padrão do modal do cliente */}
            <div style={{fontSize:11,fontFamily:'Montserrat,sans-serif',fontWeight:700,color:'#9B9B9B',textTransform:'uppercase',letterSpacing:.5,marginBottom:10}}>Objetivo do convite *</div>
            <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:20}}>
              {[
                {val:'contato',     label:'📞 Fazer contato com o Fornecedor',           desc:'Apresentação e exploração de oportunidades — sem iniciar processo de homologação.'},
                {val:'homologacao', label:'🏅 Enviar convite para solicitar homologação', desc:'O fornecedor será convidado a completar cadastro e documentação na plataforma.'},
              ].map(opt => (
                <label key={opt.val} style={{display:'flex',alignItems:'flex-start',gap:12,padding:'12px 14px',borderRadius:10,border:`1.5px solid ${inviteObjective===opt.val?'#2E3192':'#e2e4ef'}`,background:inviteObjective===opt.val?'rgba(46,49,146,.04)':'#fff',cursor:'pointer',transition:'all .15s'}}
                  onClick={()=>handleObjectiveChange(opt.val)}>
                  <input type="radio" checked={inviteObjective===opt.val} onChange={()=>handleObjectiveChange(opt.val)}
                    style={{marginTop:2,accentColor:'#2E3192'}}/>
                  <div>
                    <div style={{fontSize:13,fontWeight:700,color:'#1a1c5e',fontFamily:'DM Sans,sans-serif'}}>{opt.label}</div>
                    <div style={{fontSize:12,color:'#9B9B9B',marginTop:2}}>{opt.desc}</div>
                  </div>
                </label>
              ))}
            </div>

            {/* Aviso de homologação → upsell para cliente */}
            {inviteObjective === 'homologacao' && (
              <div style={{background:'rgba(244,126,47,.07)',border:'1px solid rgba(244,126,47,.3)',borderRadius:10,padding:14,marginBottom:16,fontSize:12,color:'#92400e',lineHeight:1.55}}>
                💡 <strong>Preços diferenciados disponíveis:</strong> Se sua empresa quiser oferecer condições especiais de homologação ou subsidiar o custo para seus fornecedores, a ELOS possui planos corporativos para isso.{' '}
                <button onClick={async ()=>{
                  const subject = encodeURIComponent('Interesse em plano corporativo SIGEC-ELOS')
                  const body = encodeURIComponent(`Olá equipe EQPI Tech,\n\nSou ${user?.name||'comprador'} (${user?.email||''}) e tenho interesse em conhecer o plano corporativo do SIGEC-ELOS para subsidiar a homologação dos meus fornecedores.\n\nAguardo contato.\n\nAtenciosamente,\n${user?.name||''}`)
                  window.open(`mailto:comercial@eqpitech.com.br?subject=${subject}&body=${body}`)
                }} style={{background:'none',border:'none',color:'#F47E2F',cursor:'pointer',fontWeight:700,fontSize:12,padding:0,textDecoration:'underline'}}>
                  Clique aqui para solicitar um contato com o comercial →
                </button>
              </div>
            )}

            {/* Prévia do e-mail */}
            {inviteObjective && (
              <div style={{marginBottom:20}}>
                <div style={{fontSize:11,fontFamily:'Montserrat,sans-serif',fontWeight:700,color:'#9B9B9B',textTransform:'uppercase',letterSpacing:.5,marginBottom:6}}>Prévia da mensagem (editável)</div>
                <textarea value={inviteMsg} onChange={e=>setInviteMsg(e.target.value)} rows={6}
                  style={{width:'100%',padding:'10px 12px',borderRadius:10,border:'1px solid #e2e4ef',fontFamily:'DM Sans,sans-serif',fontSize:13,color:'#1a1c5e',resize:'vertical',outline:'none',boxSizing:'border-box',minHeight:120,lineHeight:1.6}}/>
                <div style={{fontSize:11,color:'#9B9B9B',fontFamily:'DM Sans,sans-serif',marginTop:4}}>
                  Este texto é o corpo do e-mail que o fornecedor receberá{inviteObjective === 'homologacao' ? ', junto com o link da plataforma' : ''}.
                </div>
              </div>
            )}

            <div style={{display:'flex',gap:10}}>
              <Button type="button" variant="ghost" full onClick={()=>setShowInviteModal(false)}>Cancelar</Button>
              <Button type="button" variant="primary" full disabled={inviting||!inviteObjective} onClick={sendInvite}>
                {inviting ? '⏳ Enviando...' : inviteObjective === 'contato' ? '📞 Enviar Contato' : '📨 Enviar Convite'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
