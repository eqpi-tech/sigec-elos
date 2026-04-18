import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { marketplaceApi, rfqApi } from '../../services/api.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { Badge, Seal, Button, Card, ScoreBar, StatusDot, Spinner } from '../../components/ui.jsx'

const safeStr = (v, fb = '—') => {
  if (v == null) return fb
  if (typeof v === 'string') return v || fb
  if (typeof v === 'object') return v.descricao || v.nome || v.sigla || JSON.stringify(v).slice(0,50)
  return String(v)
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom:24 }}>
      <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:14, color:'#1a1c5e',
        borderBottom:'2px solid rgba(46,49,146,.1)', paddingBottom:8, marginBottom:12 }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div style={{ display:'flex', gap:12, padding:'7px 0', borderBottom:'1px solid #f3f4f6' }}>
      <span style={{ fontSize:12, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', minWidth:160, flexShrink:0 }}>{label}</span>
      <span style={{ fontSize:13, color:'#1a1c5e', fontFamily:'DM Sans,sans-serif', fontWeight:500 }}>{value}</span>
    </div>
  )
}

export default function SupplierProfile() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [rfqSent, setRfqSent] = useState(false)
  const [tab, setTab] = useState('dados')

  useEffect(() => { marketplaceApi.getById(id).then(setData).finally(() => setLoading(false)) }, [id])

  const sendRfq = async () => {
    await rfqApi.send({ supplierIds:[data.id], category: data.services?.[0]||'Geral', message:'', buyerId: user.buyerId })
    setRfqSent(true)
  }

  if (loading) return <div style={{ display:'flex',justifyContent:'center',alignItems:'center',height:'50vh' }}><Spinner size={48}/></div>
  if (!data) return <div style={{ padding:32 }}>Fornecedor não encontrado</div>

  const seal = data.seals?.[0]
  const sealColor = seal?.level === 'Premium' ? '#F47E2F' : '#2E3192'
  const cd = data.cnpjData || {}
  const validDocs = (data.documents||[]).filter(d=>d.status==='VALID')
  const categories = (data.supplier_categories||[]).map(sc=>sc.categories?.name).filter(Boolean)

  const TABS = ['dados','documentos','categorias','financeiro']

  return (
    <div style={{ padding:'28px 32px', maxWidth:900, margin:'0 auto' }}>
      {/* Header */}
      <button onClick={()=>navigate(-1)} style={{ fontSize:13,color:'#9B9B9B',background:'none',border:'none',cursor:'pointer',marginBottom:20,padding:0 }}>← Voltar</button>

      <Card style={{ borderRadius:16, padding:'24px 28px', marginBottom:20 }}>
        <div style={{ display:'flex', alignItems:'flex-start', gap:20 }}>
          <div style={{ width:64,height:64,borderRadius:16,background:`${sealColor}18`,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:800,fontSize:28,color:sealColor,flexShrink:0 }}>
            {data.razao_social?.[0]}
          </div>
          <div style={{ flex:1 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap', marginBottom:4 }}>
              <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:20, color:'#1a1c5e' }}>
                {data.razao_social}
              </div>
              {seal?.level && (
                <span style={{ fontSize:11,fontWeight:700,color:sealColor,background:`${sealColor}18`,padding:'3px 10px',borderRadius:20,fontFamily:'Montserrat,sans-serif' }}>
                  Selo ELOS {seal.level}
                </span>
              )}
              {data.hasSanctions && (
                <span style={{ fontSize:11,fontWeight:700,color:'#dc2626',background:'#fef2f2',padding:'3px 10px',borderRadius:20 }}>⚠ Restrições</span>
              )}
            </div>
            {data.nome_fantasia && data.nome_fantasia !== data.razao_social && (
              <div style={{ fontSize:13,color:'#9B9B9B',marginBottom:4 }}>{data.nome_fantasia}</div>
            )}
            <div style={{ fontSize:12, color:'#9B9B9B', marginBottom:10 }}>
              CNPJ: {data.cnpj} · {safeStr(data.city)}/{safeStr(data.state)}
              {seal?.issued_at && ` · Homologado em ${seal.issued_at.slice(0,10)}`}
            </div>
            <div style={{ display:'flex', gap:12, alignItems:'center' }}>
              <div style={{ width:160 }}><ScoreBar score={seal?.score||0}/></div>
              <span style={{ fontSize:12,color:'#9B9B9B' }}>{validDocs.length} documentos validados</span>
            </div>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:8, alignItems:'flex-end' }}>
            {rfqSent
              ? <span style={{ fontSize:12,color:'#22c55e',fontWeight:700 }}>✅ Cotação enviada!</span>
              : <Button variant="orange" onClick={sendRfq}>📩 Solicitar Cotação</Button>
            }
            {data.cnpjConsultedAt && (
              <span style={{ fontSize:10,color:'#9B9B9B' }}>
                🔄 Verificado em {new Date(data.cnpjConsultedAt).toLocaleDateString('pt-BR')}
              </span>
            )}
          </div>
        </div>
      </Card>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, marginBottom:20 }}>
        {TABS.map(t => (
          <button key={t} onClick={()=>setTab(t)}
            style={{ padding:'8px 18px', borderRadius:20, border:`1px solid ${tab===t?'#2E3192':'#e2e4ef'}`,
              background:tab===t?'#2E3192':'#fff', color:tab===t?'#fff':'#9B9B9B',
              fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:12, cursor:'pointer',
              textTransform:'capitalize' }}>
            {t === 'dados' ? '📋 Dados' : t === 'documentos' ? '📄 Documentos' : t === 'categorias' ? '🏷️ Categorias' : '💰 Financeiro'}
          </button>
        ))}
      </div>

      {/* Tab: Dados */}
      {tab === 'dados' && (
        <Card style={{ borderRadius:14, padding:'20px 24px' }}>
          <Section title="Dados Cadastrais">
            <Row label="Razão Social"      value={safeStr(data.razao_social)} />
            <Row label="Nome Fantasia"     value={safeStr(data.nome_fantasia)} />
            <Row label="CNPJ"              value={safeStr(data.cnpj)} />
            <Row label="Situação Cadastral" value={safeStr(cd.descricao_situacao_cadastral)} />
            <Row label="Data de Abertura"  value={safeStr(cd.data_inicio_atividade)} />
            <Row label="Natureza Jurídica" value={safeStr(cd.natureza_juridica)} />
            <Row label="Porte"             value={safeStr(cd.porte || data.employee_range)} />
            <Row label="Capital Social"    value={cd.capital_social ? `R$ ${Number(cd.capital_social).toLocaleString('pt-BR')}` : '—'} />
          </Section>
          <Section title="Localização e Contato">
            <Row label="Município / UF"    value={`${safeStr(cd.municipio||data.city)}/${safeStr(cd.uf||data.state)}`} />
            <Row label="CEP"               value={safeStr(cd.cep)} />
            <Row label="Logradouro"        value={cd.logradouro ? `${cd.logradouro}, ${cd.numero||'s/n'}` : '—'} />
            <Row label="Bairro"            value={safeStr(cd.bairro)} />
            <Row label="Telefone"          value={safeStr(data.phone || cd.ddd_telefone_1)} />
            <Row label="E-mail"            value={safeStr(cd.email)} />
          </Section>
          <Section title="Atividade Econômica">
            <Row label="CNAE Principal"    value={cd.cnae_fiscal ? `${safeStr(cd.cnae_fiscal)} — ${safeStr(cd.cnae_fiscal_descricao)}` : safeStr(data.cnae_main)} />
            {(cd.cnaes_secundarios||[]).length > 0 && (
              <div style={{ padding:'7px 0' }}>
                <div style={{ fontSize:12,color:'#9B9B9B',marginBottom:6 }}>CNAEs Secundários</div>
                <div style={{ display:'flex',flexWrap:'wrap',gap:6 }}>
                  {(cd.cnaes_secundarios||[]).slice(0,8).map((c,i)=>(
                    <span key={i} title={safeStr(c.descricao)} style={{ fontSize:11,background:'rgba(46,49,146,.07)',color:'#2E3192',padding:'3px 8px',borderRadius:20 }}>
                      {safeStr(c.codigo)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </Section>
          {(cd.qsa||[]).length > 0 && (
            <Section title="Quadro Societário">
              {cd.qsa.map((s,i)=>(
                <Row key={i} label={safeStr(s.qualificacao_socio)} value={safeStr(s.nome_socio)} />
              ))}
            </Section>
          )}
          {(data.services||[]).length > 0 && (
            <Section title="Serviços Declarados">
              <div style={{ display:'flex',flexWrap:'wrap',gap:6 }}>
                {data.services.map((s,i)=>(
                  <span key={i} style={{ fontSize:12,background:'rgba(34,197,94,.08)',color:'#15803d',padding:'4px 12px',borderRadius:20 }}>{s}</span>
                ))}
              </div>
            </Section>
          )}
          {(data.certifications||[]).length > 0 && (
            <Section title="Certificações">
              <div style={{ display:'flex',flexWrap:'wrap',gap:6 }}>
                {data.certifications.map((c,i)=>(
                  <span key={i} style={{ fontSize:12,background:'rgba(244,126,47,.08)',color:'#F47E2F',padding:'4px 12px',borderRadius:20 }}>{c}</span>
                ))}
              </div>
            </Section>
          )}
        </Card>
      )}

      {/* Tab: Documentos */}
      {tab === 'documentos' && (
        <Card style={{ borderRadius:14, padding:'20px 24px' }}>
          <Section title="Documentos Validados">
            {validDocs.length === 0
              ? <div style={{ color:'#9B9B9B',fontSize:13 }}>Nenhum documento validado ainda.</div>
              : validDocs.map((doc,i)=>(
                <div key={i} style={{ display:'flex',alignItems:'center',gap:10,padding:'8px 0',borderBottom:'1px solid #f3f4f6' }}>
                  <StatusDot status={doc.status}/>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13,fontWeight:600,color:'#1a1c5e' }}>{doc.label}</div>
                    {doc.expires_at && <div style={{ fontSize:11,color:'#9B9B9B' }}>Vence {doc.expires_at.slice(0,10)}</div>}
                  </div>
                  {doc.source==='AUTO' && <span style={{ fontSize:10,color:'#22c55e',fontWeight:700 }}>⚡ Auto</span>}
                </div>
              ))
            }
          </Section>
        </Card>
      )}

      {/* Tab: Categorias */}
      {tab === 'categorias' && (
        <Card style={{ borderRadius:14, padding:'20px 24px' }}>
          <Section title="Categorias de Atuação">
            {categories.length === 0
              ? <div style={{ color:'#9B9B9B',fontSize:13 }}>Sem categorias cadastradas.</div>
              : <div style={{ display:'flex',flexWrap:'wrap',gap:8 }}>
                  {categories.map((c,i)=>(
                    <span key={i} style={{ fontSize:12,background:'rgba(46,49,146,.07)',color:'#2E3192',padding:'6px 14px',borderRadius:20,fontFamily:'DM Sans,sans-serif' }}>{c}</span>
                  ))}
                </div>
            }
          </Section>
        </Card>
      )}

      {/* Tab: Financeiro */}
      {tab === 'financeiro' && (
        <Card style={{ borderRadius:14, padding:'20px 24px' }}>
          <Section title="Informações Financeiras Declaradas">
            <Row label="Faixa de Faturamento"   value={safeStr(data.revenue_range)} />
            <Row label="Número de Funcionários" value={safeStr(data.employee_range)} />
            <Row label="Plano SIGEC-ELOS"        value={safeStr(data.planType)} />
            <Row label="Capital Social (Receita)" value={cd.capital_social ? `R$ ${Number(cd.capital_social).toLocaleString('pt-BR')}` : '—'} />
          </Section>
          <div style={{ background:'rgba(46,49,146,.04)',border:'1px solid rgba(46,49,146,.1)',borderRadius:10,padding:'12px 16px',marginTop:12 }}>
            <div style={{ fontSize:11,color:'#9B9B9B',fontStyle:'italic' }}>
              ℹ️ Os dados financeiros acima são autodeclarados pelo fornecedor ou obtidos via Receita Federal. A EQPI Tech não garante a exatidão destas informações para fins de crédito ou concessão de contratos.
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
