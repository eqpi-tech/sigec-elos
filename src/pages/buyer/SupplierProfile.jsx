import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { marketplaceApi, rfqApi } from '../../services/api.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { Button, Card, ScoreBar, StatusDot, Spinner } from '../../components/ui.jsx'
import { useIsMobile } from '../../hooks/useIsMobile.js'

// ── Helpers ────────────────────────────────────────────────────────────────
const s = (v, fb = '—') => {
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

const fmtDate = (v = '') => {
  if (!v) return '—'
  const d = new Date(v)
  return isNaN(d) ? v : d.toLocaleDateString('pt-BR')
}

const fmtMoeda = (v) => v != null && v !== '' ? `R$ ${Number(v).toLocaleString('pt-BR')}` : '—'

// ── Sub-componentes ────────────────────────────────────────────────────────
function Section({ icon, title, children }) {
  return (
    <div style={{ marginBottom:28 }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:13, color:'#1a1c5e', borderBottom:'2px solid rgba(46,49,146,.08)', paddingBottom:10, marginBottom:14 }}>
        {icon && <span>{icon}</span>} {title}
      </div>
      {children}
    </div>
  )
}

function Row({ label, value, highlight }) {
  if (!value || value === '—') return null   // omite linhas vazias automaticamente
  return (
    <div style={{ display:'flex', gap:12, padding:'8px 0', borderBottom:'1px solid #f3f4f6' }}>
      <span style={{ fontSize:12, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', minWidth:180, flexShrink:0 }}>{label}</span>
      <span style={{ fontSize:13, color: highlight ? '#2E3192' : '#1a1c5e', fontFamily:'DM Sans,sans-serif', fontWeight: highlight ? 700 : 500 }}>{value}</span>
    </div>
  )
}

function Chip({ label, color = '#2E3192', bg }) {
  return (
    <span style={{ fontSize:12, background: bg || `${color}10`, color, padding:'5px 12px', borderRadius:20, fontFamily:'DM Sans,sans-serif', border:`1px solid ${color}22` }}>
      {label}
    </span>
  )
}

function StatusBadge({ ok, label }) {
  return (
    <span style={{ fontSize:11, fontWeight:700, fontFamily:'Montserrat,sans-serif', padding:'3px 10px', borderRadius:20,
      color: ok ? '#15803d' : '#dc2626', background: ok ? '#f0fdf4' : '#fef2f2',
      border: `1px solid ${ok ? '#86efac' : '#fca5a5'}` }}>
      {ok ? '✓' : '✗'} {label}
    </span>
  )
}

// ── Componente principal ────────────────────────────────────────────────────
export default function SupplierProfile() {
  const { id }  = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const mobile   = useIsMobile()
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [rfqSent, setRfqSent] = useState(false)
  const [tab,     setTab]     = useState('dados')

  useEffect(() => {
    marketplaceApi.getById(id).then(setData).finally(() => setLoading(false))
  }, [id])

  if (loading) return <div style={{ display:'flex',justifyContent:'center',alignItems:'center',height:'50vh' }}><Spinner size={48}/></div>
  if (!data) return <div style={{ padding:32, color:'#9B9B9B' }}>Fornecedor não encontrado.</div>

  const seal       = data.seals?.[0]
  const sealColor  = seal?.level === 'Premium' ? '#F47E2F' : '#2E3192'
  const cd         = data.cnpjData || {}   // dados da Receita Federal
  const sd         = data.sanctionsData || {}
  const validDocs  = (data.documents||[]).filter(d => d.status === 'VALID')
  const categories = (data.supplier_categories||[]).map(sc => sc.categories?.name).filter(Boolean)

  // Endereço completo
  const endereco = [cd.descricao_tipo_logradouro, cd.logradouro, cd.numero, cd.complemento].filter(Boolean).join(' ') || '—'
  const cidade   = `${s(cd.municipio || data.city)}/${s(cd.uf || data.state)}`

  const TABS = [
    { id:'dados',       label:'📋 Cadastral' },
    { id:'atividade',   label:'🏭 Atividade' },
    { id:'socios',      label:'👥 Sócios' },
    { id:'documentos',  label:'📄 Documentos' },
    { id:'categorias',  label:'🏷️ Categorias' },
  ]

  return (
    <div style={{ padding: mobile ? '12px' : '28px 32px', maxWidth:920, margin:'0 auto' }}>
      <button onClick={() => navigate(-1)} style={{ fontSize:13, color:'#9B9B9B', background:'none', border:'none', cursor:'pointer', marginBottom:16, padding:0 }}>← Voltar ao marketplace</button>

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <Card style={{ borderRadius:16, padding: mobile ? '16px' : '24px 28px', marginBottom:16 }}>
        <div style={{ display:'flex', alignItems:'flex-start', gap:16, flexWrap: mobile ? 'wrap' : 'nowrap' }}>
          {/* Avatar */}
          <div style={{ width:60, height:60, borderRadius:14, background:`${sealColor}18`, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:900, fontSize:26, color:sealColor, flexShrink:0 }}>
            {(cd.razao_social || data.razao_social)?.[0]}
          </div>

          {/* Info principal */}
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:4 }}>
              <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize: mobile ? 16 : 20, color:'#1a1c5e' }}>
                {s(cd.razao_social || data.razao_social)}
              </div>
              {seal?.level && (
                <span style={{ fontSize:11, fontWeight:700, color:sealColor, background:`${sealColor}18`, padding:'3px 10px', borderRadius:20, fontFamily:'Montserrat,sans-serif', flexShrink:0 }}>
                  🏅 Selo ELOS {seal.level}
                </span>
              )}
              {data.hasSanctions && (
                <span style={{ fontSize:11, fontWeight:700, color:'#dc2626', background:'#fef2f2', padding:'3px 10px', borderRadius:20, flexShrink:0 }}>⚠ Restrições</span>
              )}
            </div>
            {cd.nome_fantasia && cd.nome_fantasia !== cd.razao_social && (
              <div style={{ fontSize:13, color:'#9B9B9B', marginBottom:4 }}>"{s(cd.nome_fantasia)}"</div>
            )}
            <div style={{ fontSize:12, color:'#9B9B9B', marginBottom:10, lineHeight:1.6 }}>
              CNPJ {fmtCNPJ(cd.cnpj || data.cnpj)} &nbsp;·&nbsp; {cidade}
              {cd.descricao_matriz_filial && ` · ${cd.descricao_matriz_filial}`}
              {seal?.issued_at && ` · Homologado em ${fmtDate(seal.issued_at)}`}
            </div>

            {/* Badges de status rápido */}
            <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:12 }}>
              <StatusBadge ok={cd.descricao_situacao_cadastral === 'Ativa'} label={s(cd.descricao_situacao_cadastral, 'Situação')} />
              {cd.opcao_pelo_simples && <StatusBadge ok label="Simples Nacional" />}
              {cd.opcao_pelo_mei     && <StatusBadge ok label="MEI" />}
              {cd.descricao_porte && <Chip label={s(cd.descricao_porte)} />}
            </div>

            <div style={{ display:'flex', gap:12, alignItems:'center' }}>
              <div style={{ width:160 }}><ScoreBar score={seal?.score || 0}/></div>
              <span style={{ fontSize:12, color:'#9B9B9B' }}>{validDocs.length} docs validados</span>
            </div>
          </div>

          {/* Ações */}
          <div style={{ display:'flex', flexDirection:'column', gap:8, alignItems:'flex-end', flexShrink:0 }}>
            {rfqSent
              ? <span style={{ fontSize:12, color:'#22c55e', fontWeight:700 }}>✅ Cotação enviada!</span>
              : <Button variant="orange" onClick={async () => { await rfqApi.send({ supplierIds:[data.id], category: data.services?.[0]||'Geral', message:'', buyerId: user.buyerId }); setRfqSent(true) }}>📩 Solicitar Cotação</Button>
            }
            {data.cnpjConsultedAt && (
              <span style={{ fontSize:10, color:'#9B9B9B', textAlign:'right' }}>
                🔄 Dados da Receita Federal<br/>em {new Date(data.cnpjConsultedAt).toLocaleDateString('pt-BR')}
              </span>
            )}
          </div>
        </div>
      </Card>

      {/* ── TABS ─────────────────────────────────────────────────────────── */}
      <div style={{ display:'flex', gap:4, marginBottom:16, overflowX:'auto', paddingBottom:4 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding:'8px 16px', borderRadius:20, border:`1px solid ${tab===t.id?'#2E3192':'#e2e4ef'}`,
              background: tab===t.id ? '#2E3192' : '#fff', color: tab===t.id ? '#fff' : '#9B9B9B',
              fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:12, cursor:'pointer', whiteSpace:'nowrap' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB: CADASTRAL ────────────────────────────────────────────── */}
      {tab === 'dados' && (
        <Card style={{ borderRadius:14, padding: mobile ? '16px' : '24px 28px' }}>
          <Section icon="🏢" title="Identificação">
            <Row label="Razão Social"         value={s(cd.razao_social || data.razao_social)} />
            <Row label="Nome Fantasia"         value={s(cd.nome_fantasia)} />
            <Row label="CNPJ"                  value={fmtCNPJ(cd.cnpj || data.cnpj)} />
            <Row label="Situação Cadastral"    value={`${s(cd.descricao_situacao_cadastral)} (desde ${fmtDate(cd.data_situacao_cadastral)})`} />
            <Row label="Tipo"                  value={s(cd.descricao_matriz_filial)} />
            <Row label="Data de Abertura"      value={fmtDate(cd.data_inicio_atividade)} />
            <Row label="Natureza Jurídica"     value={s(cd.natureza_juridica)} />
            <Row label="Porte"                 value={s(cd.descricao_porte || cd.porte)} />
            <Row label="Capital Social"        value={fmtMoeda(cd.capital_social)} />
            <Row label="Opção pelo Simples"    value={cd.opcao_pelo_simples ? `Sim (desde ${fmtDate(cd.data_opcao_pelo_simples)})` : 'Não'} />
            <Row label="MEI"                   value={cd.opcao_pelo_mei ? 'Sim' : 'Não'} />
            {cd.situacao_especial && <Row label="Situação Especial" value={s(cd.situacao_especial)} highlight />}
          </Section>

          <Section icon="📍" title="Endereço">
            <Row label="Logradouro"            value={endereco} />
            <Row label="Bairro"                value={s(cd.bairro)} />
            <Row label="Município / UF"        value={cidade} />
            <Row label="CEP"                   value={fmtCEP(cd.cep)} />
          </Section>

          <Section icon="📞" title="Contato">
            <Row label="Telefone"              value={fmtPhone(cd.ddd_telefone_1)} />
            {cd.ddd_fax && <Row label="Fax"    value={fmtPhone(cd.ddd_fax)} />}
            <Row label="E-mail"                value={s(cd.email)} />
          </Section>

          {/* Sanções */}
          {data.hasSanctions && (
            <Section icon="⚠️" title="Restrições Identificadas">
              {[...(sd.ceis||[]), ...(sd.cnep||[])].slice(0,5).map((item, i) => (
                <div key={i} style={{ padding:'10px 12px', background:'#fef2f2', borderRadius:10, marginBottom:8, fontSize:13 }}>
                  <div style={{ fontWeight:700, color:'#dc2626', marginBottom:4 }}>{s(item.nomeEmpresa || item.razaoSocial)}</div>
                  <div style={{ color:'#555' }}>{s(item.orgaoSancionador)} · {s(item.tipoSancao || item.tipoPena)}</div>
                  {item.dataInicio && <div style={{ color:'#9B9B9B', fontSize:11, marginTop:2 }}>Desde {fmtDate(item.dataInicio)}</div>}
                </div>
              ))}
            </Section>
          )}
        </Card>
      )}

      {/* ── TAB: ATIVIDADE ───────────────────────────────────────────── */}
      {tab === 'atividade' && (
        <Card style={{ borderRadius:14, padding: mobile ? '16px' : '24px 28px' }}>
          <Section icon="🏭" title="CNAE Principal">
            <div style={{ padding:'12px 14px', background:'rgba(46,49,146,.04)', borderRadius:10, border:'1px solid rgba(46,49,146,.1)' }}>
              <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, color:'#1a1c5e' }}>
                {cd.cnae_fiscal} — {s(cd.cnae_fiscal_descricao)}
              </div>
            </div>
          </Section>

          {(cd.cnaes_secundarios||[]).length > 0 && (
            <Section icon="📋" title={`CNAEs Secundários (${cd.cnaes_secundarios.length})`}>
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {cd.cnaes_secundarios.map((c, i) => (
                  <div key={i} style={{ display:'flex', gap:12, padding:'8px 10px', borderRadius:8, background:'#f8f9ff', fontSize:13 }}>
                    <span style={{ fontWeight:700, color:'#2E3192', flexShrink:0, fontFamily:'Montserrat,sans-serif' }}>{c.codigo}</span>
                    <span style={{ color:'#555' }}>{s(c.descricao)}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {(data.services||[]).length > 0 && (
            <Section icon="🔧" title="Serviços Declarados">
              <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                {data.services.map((sv, i) => <Chip key={i} label={sv} color="#15803d" />)}
              </div>
            </Section>
          )}

          {(data.certifications||[]).length > 0 && (
            <Section icon="🏆" title="Certificações">
              <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                {data.certifications.map((c, i) => <Chip key={i} label={c} color="#F47E2F" />)}
              </div>
            </Section>
          )}
        </Card>
      )}

      {/* ── TAB: SÓCIOS ─────────────────────────────────────────────── */}
      {tab === 'socios' && (
        <Card style={{ borderRadius:14, padding: mobile ? '16px' : '24px 28px' }}>
          {(cd.qsa||[]).length === 0 ? (
            <div style={{ color:'#9B9B9B', fontSize:13, textAlign:'center', padding:32 }}>
              Quadro societário não disponível para este CNPJ.
            </div>
          ) : (
            <Section icon="👥" title={`Quadro Societário (${cd.qsa.length} ${cd.qsa.length === 1 ? 'membro' : 'membros'})`}>
              {cd.qsa.map((socio, i) => (
                <div key={i} style={{ padding:'14px 16px', background:'#f8f9ff', borderRadius:12, marginBottom:10, display:'flex', gap:14, alignItems:'flex-start' }}>
                  <div style={{ width:40, height:40, borderRadius:10, background:'rgba(46,49,146,.1)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:16, color:'#2E3192', flexShrink:0 }}>
                    {s(socio.nome_socio)?.[0]?.toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:14, color:'#1a1c5e', marginBottom:4 }}>
                      {s(socio.nome_socio)}
                    </div>
                    <div style={{ fontSize:12, color:'#555' }}>{s(socio.qualificacao_socio)}</div>
                    {socio.data_entrada_sociedade && (
                      <div style={{ fontSize:11, color:'#9B9B9B', marginTop:4 }}>
                        Sócio desde {fmtDate(socio.data_entrada_sociedade)}
                      </div>
                    )}
                    {socio.pais && socio.pais.descricao && (
                      <div style={{ fontSize:11, color:'#9B9B9B' }}>País: {s(socio.pais.descricao)}</div>
                    )}
                  </div>
                </div>
              ))}
            </Section>
          )}
        </Card>
      )}

      {/* ── TAB: DOCUMENTOS ─────────────────────────────────────────── */}
      {tab === 'documentos' && (
        <Card style={{ borderRadius:14, padding: mobile ? '16px' : '24px 28px' }}>
          <Section icon="📄" title={`Documentos Validados (${validDocs.length})`}>
            {validDocs.length === 0 ? (
              <div style={{ color:'#9B9B9B', fontSize:13, padding:20, textAlign:'center' }}>
                Nenhum documento validado ainda.
              </div>
            ) : (
              validDocs.map((doc, i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 0', borderBottom:'1px solid #f3f4f6' }}>
                  <StatusDot status={doc.status}/>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'#1a1c5e' }}>{doc.label}</div>
                    {doc.expires_at && (
                      <div style={{ fontSize:11, color: new Date(doc.expires_at) < new Date() ? '#dc2626' : '#9B9B9B' }}>
                        {new Date(doc.expires_at) < new Date() ? '⚠ Vencido em ' : 'Válido até '}{doc.expires_at.slice(0,10)}
                      </div>
                    )}
                  </div>
                  {doc.source === 'AUTO' && (
                    <span style={{ fontSize:10, color:'#22c55e', fontWeight:700, background:'rgba(34,197,94,.08)', padding:'2px 8px', borderRadius:20 }}>⚡ Auto</span>
                  )}
                </div>
              ))
            )}
          </Section>

          {/* Documentos vencidos ou pendentes */}
          {(data.documents||[]).filter(d => d.status !== 'VALID').length > 0 && (
            <Section icon="⚠️" title="Documentos Pendentes / Vencidos">
              {(data.documents||[]).filter(d => d.status !== 'VALID').map((doc, i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 0', borderBottom:'1px solid #f3f4f6' }}>
                  <StatusDot status={doc.status}/>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, color:'#9B9B9B' }}>{doc.label}</div>
                  </div>
                  <span style={{ fontSize:11, color:'#f59e0b', fontWeight:700 }}>
                    {doc.status === 'PENDING' ? 'Pendente' : doc.status === 'EXPIRED' ? 'Vencido' : doc.status}
                  </span>
                </div>
              ))}
            </Section>
          )}
        </Card>
      )}

      {/* ── TAB: CATEGORIAS ─────────────────────────────────────────── */}
      {tab === 'categorias' && (
        <Card style={{ borderRadius:14, padding: mobile ? '16px' : '24px 28px' }}>
          <Section icon="🏷️" title="Categorias de Atuação">
            {categories.length === 0 ? (
              <div style={{ color:'#9B9B9B', fontSize:13, textAlign:'center', padding:20 }}>Sem categorias cadastradas.</div>
            ) : (
              <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                {categories.map((c, i) => <Chip key={i} label={c} />)}
              </div>
            )}
          </Section>

          {/* Capital + Porte como contexto para o comprador */}
          <Section icon="💰" title="Capacidade Financeira">
            <Row label="Porte da Empresa"       value={s(cd.descricao_porte || cd.porte)} />
            <Row label="Capital Social"          value={fmtMoeda(cd.capital_social)} />
            <Row label="Faixa de Faturamento"    value={s(data.revenue_range)} />
            <Row label="Número de Funcionários"  value={s(data.employee_range)} />
            <Row label="Plano SIGEC-ELOS"         value={s(data.planType)} />
            <div style={{ background:'rgba(46,49,146,.04)', border:'1px solid rgba(46,49,146,.1)', borderRadius:10, padding:'10px 14px', marginTop:12 }}>
              <div style={{ fontSize:11, color:'#9B9B9B', fontStyle:'italic' }}>
                ℹ️ Dados financeiros obtidos via Receita Federal ou autodeclarados. A EQPI Tech não garante a exatidão para fins de crédito.
              </div>
            </div>
          </Section>
        </Card>
      )}
    </div>
  )
}
