import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { marketplaceApi, rfqApi } from '../../services/api.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { Button, Card, ScoreBar, StatusDot, Spinner } from '../../components/ui.jsx'
import { useIsMobile } from '../../hooks/useIsMobile.js'

// ── Formatadores ────────────────────────────────────────────────────────────
const safeStr = (v, fb = '—') => {
  if (v == null || v === '') return fb
  if (typeof v === 'string') return v
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
const fmtCEP = (v = '') => {
  const n = String(v).replace(/\D/g,'')
  return n.length === 8 ? `${n.slice(0,5)}-${n.slice(5)}` : v || '—'
}
const fmtDateISO = (v = '') => {    // "2014-12-15" → "15/12/2014"
  if (!v) return '—'
  const [y,m,d] = String(v).split('-')
  return d ? `${d}/${m}/${y}` : v
}
const fmtMoeda = (v) => (v != null && v !== '') ? `R$ ${Number(v).toLocaleString('pt-BR', {minimumFractionDigits:2})}` : '—'

// ── Sub-componentes ────────────────────────────────────────────────────────
function Section({ icon, title, children, danger }) {
  return (
    <div style={{ marginBottom:28 }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, fontFamily:'Montserrat,sans-serif', fontWeight:800,
        fontSize:13, color: danger ? '#dc2626' : '#1a1c5e',
        borderBottom:`2px solid ${danger ? 'rgba(220,38,38,.15)' : 'rgba(46,49,146,.08)'}`,
        paddingBottom:10, marginBottom:14 }}>
        {icon} {title}
      </div>
      {children}
    </div>
  )
}
function Row({ label, value, mono, highlight }) {
  if (!value || value === '—') return null
  return (
    <div style={{ display:'flex', gap:12, padding:'7px 0', borderBottom:'1px solid #f3f4f6', alignItems:'flex-start' }}>
      <span style={{ fontSize:12, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', minWidth:190, flexShrink:0, paddingTop:1 }}>{label}</span>
      <span style={{ fontSize:13, color: highlight ? '#2E3192' : '#1a1c5e', fontFamily: mono ? 'monospace' : 'DM Sans,sans-serif', fontWeight: highlight ? 700 : 500 }}>{value}</span>
    </div>
  )
}
function Chip({ label, color='#2E3192', small }) {
  return (
    <span style={{ fontSize: small ? 11 : 12, background:`${color}10`, color, padding: small ? '3px 9px' : '5px 12px',
      borderRadius:20, border:`1px solid ${color}22`, fontFamily:'DM Sans,sans-serif', whiteSpace:'nowrap' }}>
      {label}
    </span>
  )
}
function StatusBadge({ ok, label }) {
  return (
    <span style={{ fontSize:11, fontWeight:700, fontFamily:'Montserrat,sans-serif', padding:'3px 10px', borderRadius:20,
      color: ok ? '#15803d' : '#dc2626', background: ok ? '#f0fdf4' : '#fef2f2',
      border:`1px solid ${ok ? '#86efac' : '#fca5a5'}` }}>
      {ok ? '✓' : '✗'} {label}
    </span>
  )
}

// ── Componente de Sanção ────────────────────────────────────────────────────
function SancaoCard({ item, supplierCnpj }) {
  const cnpjSancionado = item.sancionado?.codigoFormatado?.replace(/\D/g,'')
  const isProprioFornecedor = supplierCnpj && cnpjSancionado === supplierCnpj.replace(/\D/g,'')
  const [expanded, setExpanded] = useState(false)

  return (
    <div style={{ border:`1px solid ${isProprioFornecedor ? '#fca5a5' : '#fed7aa'}`,
      borderRadius:12, overflow:'hidden', marginBottom:12 }}>
      <div style={{ padding:'14px 16px', background: isProprioFornecedor ? '#fef2f2' : '#fff7ed', cursor:'pointer', display:'flex', gap:12, alignItems:'flex-start' }}
        onClick={() => setExpanded(e=>!e)}>
        <div style={{ flex:1 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:4 }}>
            <span style={{ fontSize:11, fontWeight:700, fontFamily:'Montserrat,sans-serif',
              color: isProprioFornecedor ? '#dc2626' : '#92400e',
              background: isProprioFornecedor ? '#fef2f2' : '#fff7ed',
              border:`1px solid ${isProprioFornecedor ? '#fca5a5' : '#fcd34d'}`,
              padding:'2px 8px', borderRadius:20 }}>
              {isProprioFornecedor ? '⚠ Este CNPJ' : '⚠ CNPJ Relacionado'}
            </span>
            <span style={{ fontSize:12, color:'#92400e', fontFamily:'Montserrat,sans-serif', fontWeight:700 }}>
              {item.sancionado?.codigoFormatado}
            </span>
          </div>
          <div style={{ fontSize:13, fontWeight:600, color:'#1a1c5e', marginBottom:4 }}>
            {item.sancionado?.nome?.trim() || safeStr(item.tipoSancao?.descricaoResumida)}
          </div>
          <div style={{ fontSize:12, color:'#555', marginBottom:2 }}>
            {safeStr(item.tipoSancao?.descricaoPortal)}
          </div>
          <div style={{ fontSize:11, color:'#9B9B9B' }}>
            {item.orgaoSancionador?.nome} · {item.orgaoSancionador?.esfera}/{item.orgaoSancionador?.siglaUf}
            &nbsp;·&nbsp; Vigência: {item.dataInicioSancao} a {item.dataFimSancao}
          </div>
        </div>
        <span style={{ color:'#9B9B9B', fontSize:14, flexShrink:0 }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div style={{ padding:'14px 16px', background:'#fff', borderTop:'1px solid #f3f4f6' }}>
          <Row label="Empresa Sancionada"   value={safeStr(item.sancionado?.nome)} />
          <Row label="CNPJ Sancionado"      value={item.sancionado?.codigoFormatado} mono />
          <Row label="Órgão Sancionador"    value={safeStr(item.orgaoSancionador?.nome)} />
          <Row label="Esfera"               value={`${item.orgaoSancionador?.esfera} / ${item.orgaoSancionador?.siglaUf}`} />
          <Row label="Tipo de Sanção"       value={safeStr(item.tipoSancao?.descricaoPortal)} />
          <Row label="Início da Sanção"     value={item.dataInicioSancao} />
          <Row label="Fim da Sanção"        value={item.dataFimSancao} />
          <Row label="Nº do Processo"       value={safeStr(item.numeroProcesso)} />
          <Row label="Abrangência"          value={safeStr(item.abrangenciaDefinidaDecisaoJudicial)} />
          {(item.fundamentacao||[]).map((f,i) => (
            <Row key={i} label={i===0?'Fundamentação':''} value={f.descricao||f.codigo} />
          ))}
          <Row label="Publicação"           value={safeStr(item.textoPublicacao)} />
          {item.dataTransitadoJulgado && <Row label="Transitado em Julgado" value={item.dataTransitadoJulgado} />}
          {!isProprioFornecedor && (
            <div style={{ marginTop:12, padding:'10px 12px', background:'#fff7ed', borderRadius:8, fontSize:12, color:'#92400e' }}>
              ℹ️ Esta sanção é de um CNPJ diferente do fornecedor ({item.sancionado?.codigoFormatado}). Pode estar relacionada a um sócio ou empresa do mesmo grupo.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Componente principal ────────────────────────────────────────────────────
export default function SupplierProfile() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const mobile = useIsMobile()
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [rfqSent, setRfqSent] = useState(false)
  const [tab,     setTab]     = useState('dados')

  useEffect(() => {
    marketplaceApi.getById(id).then(setData).finally(() => setLoading(false))
  }, [id])

  if (loading) return <div style={{ display:'flex',justifyContent:'center',alignItems:'center',height:'50vh' }}><Spinner size={48}/></div>
  if (!data) return <div style={{ padding:32,color:'#9B9B9B' }}>Fornecedor não encontrado.</div>

  const seal       = data.seals?.[0]
  const sealColor  = seal?.level === 'Premium' ? '#F47E2F' : '#2E3192'
  const cd         = data.cnpjData  || {}
  const sd         = data.sanctionsData || {}
  const validDocs  = (data.documents||[]).filter(d => d.status === 'VALID')
  const categories = (data.supplier_categories||[]).map(sc => sc.categories?.name).filter(Boolean)

  // Sanções: CEIS + CNEP (sem duplicar com History)
  const allSancoes = [...(sd.ceis||[]), ...(sd.cnep||[])]
  const hasSancoes = allSancoes.length > 0

  // Endereço — campo correto: descricao_tipo_de_logradouro
  const tipoLogr = safeStr(cd.descricao_tipo_de_logradouro, '')
  const endereco = [tipoLogr, cd.logradouro, cd.numero, cd.complemento].filter(Boolean).join(' ') || '—'

  const TABS = [
    { id:'dados',       label:'📋 Cadastral' },
    { id:'atividade',   label:'🏭 Atividade' },
    { id:'socios',      label:'👥 Sócios' },
    { id:'documentos',  label:`📄 Docs (${validDocs.length})` },
    { id:'categorias',  label:'🏷️ Categorias' },
    ...(hasSancoes ? [{ id:'sancoes', label:`⚠️ Sanções (${allSancoes.length})` }] : []),
  ]

  return (
    <div style={{ padding: mobile ? '12px' : '28px 32px', maxWidth:920, margin:'0 auto' }}>
      <button onClick={() => navigate(-1)} style={{ fontSize:13,color:'#9B9B9B',background:'none',border:'none',cursor:'pointer',marginBottom:16,padding:0 }}>
        ← Voltar ao marketplace
      </button>

      {/* ── HEADER ──────────────────────────────────────────────────────── */}
      <Card style={{ borderRadius:16, padding: mobile ? '16px' : '24px 28px', marginBottom:16 }}>
        <div style={{ display:'flex', alignItems:'flex-start', gap:16, flexWrap: mobile ? 'wrap' : 'nowrap' }}>
          <div style={{ width:58, height:58, borderRadius:14, background:`${sealColor}18`, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:900, fontSize:24, color:sealColor, flexShrink:0 }}>
            {(cd.razao_social||data.razao_social)?.[0]}
          </div>

          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:6 }}>
              <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize: mobile ? 16 : 20, color:'#1a1c5e' }}>
                {safeStr(cd.razao_social || data.razao_social)}
              </div>
              {seal?.level && (
                <span style={{ fontSize:11,fontWeight:700,color:sealColor,background:`${sealColor}18`,padding:'3px 10px',borderRadius:20,fontFamily:'Montserrat,sans-serif',flexShrink:0 }}>
                  🏅 Selo ELOS {seal.level}
                </span>
              )}
              {hasSancoes && (
                <span style={{ fontSize:11,fontWeight:700,color:'#dc2626',background:'#fef2f2',padding:'3px 10px',borderRadius:20,flexShrink:0,border:'1px solid #fca5a5' }}>
                  ⚠ {allSancoes.length} Sanção{allSancoes.length>1?'ões':''}
                </span>
              )}
            </div>
            {cd.nome_fantasia && (
              <div style={{ fontSize:13,color:'#9B9B9B',marginBottom:6 }}>"{safeStr(cd.nome_fantasia)}"</div>
            )}
            <div style={{ fontSize:12,color:'#9B9B9B',marginBottom:10,lineHeight:1.7 }}>
              CNPJ {fmtCNPJ(cd.cnpj||data.cnpj)} &nbsp;·&nbsp; {safeStr(cd.municipio||data.city)}/{safeStr(cd.uf||data.state)}
              {cd.descricao_identificador_matriz_filial && ` · ${cd.descricao_identificador_matriz_filial}`}
              {seal?.issued_at && ` · Homologado em ${fmtDateISO(seal.issued_at)}`}
            </div>

            <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:12 }}>
              <StatusBadge ok={cd.descricao_situacao_cadastral === 'ATIVA'} label={safeStr(cd.descricao_situacao_cadastral,'Situação')} />
              {cd.opcao_pelo_simples && !cd.data_exclusao_do_simples && <StatusBadge ok label="Simples Nacional" />}
              {cd.data_exclusao_do_simples && <StatusBadge ok={false} label="Ex-Simples Nacional" />}
              {cd.opcao_pelo_mei && <StatusBadge ok label="MEI" />}
              {cd.porte && <Chip label={safeStr(cd.porte)} small />}
            </div>

            <div style={{ display:'flex', gap:12, alignItems:'center' }}>
              <div style={{ width:160 }}><ScoreBar score={seal?.score||0}/></div>
              <span style={{ fontSize:12,color:'#9B9B9B' }}>{validDocs.length} docs validados</span>
            </div>
          </div>

          <div style={{ display:'flex',flexDirection:'column',gap:8,alignItems:'flex-end',flexShrink:0 }}>
            {rfqSent
              ? <span style={{ fontSize:12,color:'#22c55e',fontWeight:700 }}>✅ Cotação enviada!</span>
              : <Button variant="orange" onClick={async()=>{
                  await rfqApi.send({ supplierIds:[data.id], category:data.services?.[0]||'Geral', message:'', buyerId:user.buyerId })
                  setRfqSent(true)
                }}>📩 Solicitar Cotação</Button>
            }
            {data.cnpjConsultedAt && (
              <span style={{ fontSize:10,color:'#9B9B9B',textAlign:'right' }}>
                🔄 Receita Federal<br/>{new Date(data.cnpjConsultedAt).toLocaleDateString('pt-BR')}
              </span>
            )}
          </div>
        </div>
      </Card>

      {/* ── TABS ──────────────────────────────────────────────────────────── */}
      <div style={{ display:'flex', gap:4, marginBottom:16, overflowX:'auto', paddingBottom:4 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{ padding:'8px 14px', borderRadius:20, whiteSpace:'nowrap', cursor:'pointer', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:12,
              border:`1px solid ${tab===t.id ? (t.id==='sancoes'?'#dc2626':'#2E3192') : '#e2e4ef'}`,
              background: tab===t.id ? (t.id==='sancoes'?'#dc2626':'#2E3192') : '#fff',
              color: tab===t.id ? '#fff' : (t.id==='sancoes'?'#dc2626':'#9B9B9B') }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB CADASTRAL ────────────────────────────────────────────────── */}
      {tab==='dados' && (
        <Card style={{ borderRadius:14, padding: mobile ? '16px' : '24px 28px' }}>
          <Section icon="🏢" title="Identificação">
            <Row label="Razão Social"             value={safeStr(cd.razao_social||data.razao_social)} />
            <Row label="Nome Fantasia"             value={safeStr(cd.nome_fantasia)} />
            <Row label="CNPJ"                      value={fmtCNPJ(cd.cnpj||data.cnpj)} mono />
            <Row label="Situação Cadastral"        value={`${safeStr(cd.descricao_situacao_cadastral)} (desde ${fmtDateISO(cd.data_situacao_cadastral)})`} />
            <Row label="Tipo"                      value={safeStr(cd.descricao_identificador_matriz_filial)} />
            <Row label="Data de Abertura"          value={fmtDateISO(cd.data_inicio_atividade)} />
            <Row label="Natureza Jurídica"         value={safeStr(cd.natureza_juridica)} />
            <Row label="Porte"                     value={safeStr(cd.porte)} />
            <Row label="Capital Social"            value={fmtMoeda(cd.capital_social)} highlight />
            <Row label="Opção pelo Simples"        value={cd.opcao_pelo_simples ? `Sim (desde ${fmtDateISO(cd.data_opcao_pelo_simples)})${cd.data_exclusao_do_simples ? ` — excluído em ${fmtDateISO(cd.data_exclusao_do_simples)}` : ''}` : 'Não'} />
            <Row label="MEI"                       value={cd.opcao_pelo_mei ? `Sim` : 'Não'} />
            {cd.situacao_especial && <Row label="Situação Especial" value={safeStr(cd.situacao_especial)} />}
            {cd.ente_federativo_responsavel && <Row label="Ente Federativo" value={safeStr(cd.ente_federativo_responsavel)} />}
          </Section>

          <Section icon="📍" title="Endereço">
            <Row label="Logradouro"               value={endereco} />
            <Row label="Bairro"                   value={safeStr(cd.bairro)} />
            <Row label="Município / UF"           value={`${safeStr(cd.municipio||data.city)} / ${safeStr(cd.uf||data.state)}`} />
            <Row label="CEP"                      value={fmtCEP(cd.cep)} mono />
            {cd.nome_cidade_no_exterior && <Row label="Cidade no Exterior" value={safeStr(cd.nome_cidade_no_exterior)} />}
          </Section>

          <Section icon="📞" title="Contato">
            {cd.ddd_telefone_1 && <Row label="Telefone 1" value={fmtPhone(cd.ddd_telefone_1)} />}
            {cd.ddd_telefone_2 && <Row label="Telefone 2" value={fmtPhone(cd.ddd_telefone_2)} />}
            {cd.ddd_fax && <Row label="Fax" value={fmtPhone(cd.ddd_fax)} />}
            <Row label="E-mail" value={safeStr(cd.email)} />
          </Section>

          {/* Regime Tributário */}
          {(cd.regime_tributario||[]).length > 0 && (
            <Section icon="📊" title="Regime Tributário">
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(160px,1fr))', gap:10 }}>
                {(cd.regime_tributario||[]).sort((a,b)=>b.ano-a.ano).map(r => (
                  <div key={r.ano} style={{ padding:'12px 14px', background:'rgba(46,49,146,.04)', borderRadius:10, border:'1px solid rgba(46,49,146,.1)' }}>
                    <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:18, color:'#F47E2F', lineHeight:1 }}>{r.ano}</div>
                    <div style={{ fontSize:12, color:'#1a1c5e', fontWeight:600, marginTop:6 }}>{safeStr(r.forma_de_tributacao)}</div>
                    {r.cnpj_da_scp && <div style={{ fontSize:11, color:'#9B9B9B', marginTop:2 }}>SCP: {r.cnpj_da_scp}</div>}
                  </div>
                ))}
              </div>
            </Section>
          )}
        </Card>
      )}

      {/* ── TAB ATIVIDADE ───────────────────────────────────────────────── */}
      {tab==='atividade' && (
        <Card style={{ borderRadius:14, padding: mobile ? '16px' : '24px 28px' }}>
          <Section icon="🏭" title="CNAE Principal">
            <div style={{ padding:'14px 16px', background:'rgba(46,49,146,.04)', borderRadius:10, border:'1px solid rgba(46,49,146,.1)' }}>
              <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:14, color:'#1a1c5e' }}>
                {cd.cnae_fiscal} — {safeStr(cd.cnae_fiscal_descricao)}
              </div>
            </div>
          </Section>

          {(cd.cnaes_secundarios||[]).length > 0 && (
            <Section icon="📋" title={`CNAEs Secundários (${cd.cnaes_secundarios.length})`}>
              {cd.cnaes_secundarios.map((c,i) => (
                <div key={i} style={{ display:'flex', gap:12, padding:'8px 10px', borderRadius:8, background:'#f8f9ff', marginBottom:6, fontSize:13, alignItems:'flex-start' }}>
                  <span style={{ fontWeight:700, color:'#2E3192', flexShrink:0, fontFamily:'Montserrat,sans-serif', minWidth:72 }}>{c.codigo}</span>
                  <span style={{ color:'#555' }}>{safeStr(c.descricao)}</span>
                </div>
              ))}
            </Section>
          )}

          {(data.services||[]).length > 0 && (
            <Section icon="🔧" title="Serviços Declarados">
              <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                {data.services.map((sv,i) => <Chip key={i} label={sv} color="#15803d" />)}
              </div>
            </Section>
          )}

          {(data.certifications||[]).length > 0 && (
            <Section icon="🏆" title="Certificações">
              <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                {data.certifications.map((c,i) => <Chip key={i} label={c} color="#F47E2F" />)}
              </div>
            </Section>
          )}
        </Card>
      )}

      {/* ── TAB SÓCIOS ─────────────────────────────────────────────────── */}
      {tab==='socios' && (
        <Card style={{ borderRadius:14, padding: mobile ? '16px' : '24px 28px' }}>
          {!(cd.qsa||[]).length ? (
            <div style={{ color:'#9B9B9B',fontSize:13,textAlign:'center',padding:32 }}>QSA não disponível.</div>
          ) : (
            <Section icon="👥" title={`Quadro Societário — ${cd.qsa.length} ${cd.qsa.length===1?'membro':'membros'}`}>
              {cd.qsa.map((socio,i) => (
                <div key={i} style={{ padding:'14px 16px', background:'#f8f9ff', borderRadius:12, marginBottom:10, display:'flex', gap:14, alignItems:'flex-start' }}>
                  <div style={{ width:40,height:40,borderRadius:10,background:'rgba(46,49,146,.1)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:800,fontSize:16,color:'#2E3192',flexShrink:0 }}>
                    {safeStr(socio.nome_socio)?.[0]?.toUpperCase()}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:14, color:'#1a1c5e', marginBottom:4 }}>
                      {safeStr(socio.nome_socio)}
                    </div>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:6 }}>
                      <Chip label={safeStr(socio.qualificacao_socio)} small />
                      {socio.faixa_etaria && <Chip label={safeStr(socio.faixa_etaria)} color="#9B9B9B" small />}
                    </div>
                    <div style={{ fontSize:11, color:'#9B9B9B', lineHeight:1.6 }}>
                      {socio.data_entrada_sociedade && `Sócio desde ${fmtDateISO(socio.data_entrada_sociedade)}`}
                      {socio.cnpj_cpf_do_socio && ` · CPF/CNPJ: ${socio.cnpj_cpf_do_socio}`}
                    </div>
                    {socio.nome_representante_legal && (
                      <div style={{ fontSize:11, color:'#9B9B9B', marginTop:2 }}>
                        Representante: {socio.nome_representante_legal} ({safeStr(socio.qualificacao_representante_legal)})
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </Section>
          )}
        </Card>
      )}

      {/* ── TAB DOCUMENTOS ─────────────────────────────────────────────── */}
      {tab==='documentos' && (
        <Card style={{ borderRadius:14, padding: mobile ? '16px' : '24px 28px' }}>
          <Section icon="📄" title={`Documentos Validados (${validDocs.length})`}>
            {validDocs.length === 0
              ? <div style={{ color:'#9B9B9B',fontSize:13,textAlign:'center',padding:20 }}>Nenhum documento validado.</div>
              : validDocs.map((doc,i) => (
                <div key={i} style={{ display:'flex',alignItems:'center',gap:12,padding:'10px 0',borderBottom:'1px solid #f3f4f6' }}>
                  <StatusDot status={doc.status}/>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13,fontWeight:600,color:'#1a1c5e' }}>{doc.label}</div>
                    {doc.expires_at && (
                      <div style={{ fontSize:11, color: new Date(doc.expires_at)<new Date() ? '#dc2626' : '#9B9B9B' }}>
                        {new Date(doc.expires_at)<new Date() ? '⚠ Vencido em ' : 'Válido até '}{doc.expires_at.slice(0,10)}
                      </div>
                    )}
                  </div>
                  {doc.source==='AUTO' && <span style={{ fontSize:10,color:'#22c55e',fontWeight:700,background:'rgba(34,197,94,.08)',padding:'2px 8px',borderRadius:20 }}>⚡ Auto</span>}
                </div>
              ))
            }
          </Section>
        </Card>
      )}

      {/* ── TAB CATEGORIAS ─────────────────────────────────────────────── */}
      {tab==='categorias' && (
        <Card style={{ borderRadius:14, padding: mobile ? '16px' : '24px 28px' }}>
          <Section icon="🏷️" title="Categorias de Atuação">
            {categories.length === 0
              ? <div style={{ color:'#9B9B9B',fontSize:13,textAlign:'center',padding:20 }}>Sem categorias cadastradas.</div>
              : <div style={{ display:'flex',flexWrap:'wrap',gap:8 }}>
                  {categories.map((c,i) => <Chip key={i} label={c} />)}
                </div>
            }
          </Section>
          <Section icon="💰" title="Capacidade Financeira">
            <Row label="Porte"                  value={safeStr(cd.porte)} />
            <Row label="Capital Social"         value={fmtMoeda(cd.capital_social)} highlight />
            <Row label="Faixa de Faturamento"   value={safeStr(data.revenue_range)} />
            <Row label="Nº de Funcionários"     value={safeStr(data.employee_range)} />
            <Row label="Plano SIGEC-ELOS"       value={safeStr(data.planType)} />
          </Section>
          <div style={{ background:'rgba(46,49,146,.04)',border:'1px solid rgba(46,49,146,.1)',borderRadius:10,padding:'10px 14px' }}>
            <div style={{ fontSize:11,color:'#9B9B9B',fontStyle:'italic' }}>ℹ️ Dados financeiros obtidos via Receita Federal ou autodeclarados. A EQPI Tech não garante exatidão para fins de crédito.</div>
          </div>
        </Card>
      )}

      {/* ── TAB SANÇÕES ────────────────────────────────────────────────── */}
      {tab==='sancoes' && (
        <Card style={{ borderRadius:14, padding: mobile ? '16px' : '24px 28px' }}>
          <div style={{ background:'#fef2f2',border:'1px solid #fca5a5',borderRadius:12,padding:'14px 16px',marginBottom:20,display:'flex',gap:12,alignItems:'flex-start' }}>
            <span style={{ fontSize:24,flexShrink:0 }}>⚠️</span>
            <div>
              <div style={{ fontFamily:'Montserrat,sans-serif',fontWeight:700,fontSize:13,color:'#dc2626',marginBottom:4 }}>
                {allSancoes.length} sanção{allSancoes.length>1?'ões':''} encontrada{allSancoes.length>1?'s':''}
              </div>
              <div style={{ fontSize:12,color:'#555' }}>
                Dados obtidos do CEIS/CNEP (Portal da Transparência). Sanções podem ser de empresas relacionadas ao CNPJ consultado. Verifique o CNPJ de cada sanção.
              </div>
            </div>
          </div>

          {allSancoes.length > 0 && (
            <Section icon="🚫" title={`CEIS — ${(sd.ceis||[]).length} registro${(sd.ceis||[]).length!==1?'s':''}`}>
              {(sd.ceis||[]).map((item,i) => (
                <SancaoCard key={i} item={item} supplierCnpj={cd.cnpj||data.cnpj} />
              ))}
            </Section>
          )}

          {(sd.cnep||[]).length > 0 && (
            <Section icon="📋" title={`CNEP — ${sd.cnep.length} registro${sd.cnep.length!==1?'s':''}`}>
              {sd.cnep.map((item,i) => (
                <SancaoCard key={i} item={item} supplierCnpj={cd.cnpj||data.cnpj} />
              ))}
            </Section>
          )}
        </Card>
      )}
    </div>
  )
}
