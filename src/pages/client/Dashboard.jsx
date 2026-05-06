import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { clientApi } from '../../services/api.js'
import { KpiCard, Card, PageHeader, Spinner, Badge, ScoreBar } from '../../components/ui.jsx'

export default function ClientDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [data, setData]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user?.clientId) return
    clientApi.getDashboard(user.clientId)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [user?.clientId])

  if (loading) return <div style={{ display:'flex', justifyContent:'center', padding:80 }}><Spinner size={40}/></div>
  if (error)   return <div style={{ padding:32, color:'#dc2626' }}>{error}</div>

  const recentes = (data?.invites || []).slice(0, 5)

  const sealColor = s => s === 'ACTIVE' ? '#22c55e' : s === 'PENDING' ? '#f59e0b' : '#9B9B9B'
  const sealLabel = s => s === 'ACTIVE' ? 'Homologado' : s === 'PENDING' ? 'Em análise' : 'Pendente'

  return (
    <div style={{ padding:'28px 32px', maxWidth:1100, margin:'0 auto' }}>
      <PageHeader
        title={`Olá, ${user.name?.split(' ')[0]}!`}
        subtitle="Acompanhe o processo de homologação dos seus fornecedores"
        action={{ label:'Convidar Fornecedor', onClick: () => navigate('/cliente/convites') }}
      />

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:16, marginBottom:28 }}>
        <KpiCard label="Fornecedores Convidados" value={data?.total ?? 0} icon="🤝" />
        <KpiCard label="Homologados"            value={data?.homologados ?? 0} icon="✅" subtext="Selo ELOS ativo" />
        <KpiCard label="Em Análise"             value={data?.emAnalise ?? 0} icon="⏳" subtext="Aguardando revisão EQPI" />
        <KpiCard label="Subsidiados"            value={data?.subsidiados ?? 0} icon="💰" subtext="Custo assumido por você" />
      </div>

      {/* Lista recente */}
      <Card style={{ borderRadius:16, padding:'20px 24px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:15, color:'#1a1c5e' }}>
            Fornecedores Recentes
          </div>
          <button onClick={() => navigate('/cliente/fornecedores')}
            style={{ background:'none', border:'none', color:'#2E3192', fontFamily:'DM Sans,sans-serif', fontSize:13, fontWeight:600, cursor:'pointer' }}>
            Ver todos →
          </button>
        </div>

        {recentes.length === 0 ? (
          <div style={{ textAlign:'center', padding:'32px 0', color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>
            <div style={{ fontSize:32, marginBottom:8 }}>📭</div>
            <div>Nenhum fornecedor convidado ainda.</div>
            <button onClick={() => navigate('/cliente/convites')}
              style={{ marginTop:12, background:'#2E3192', color:'#fff', border:'none', borderRadius:8, padding:'8px 20px', fontFamily:'DM Sans,sans-serif', fontSize:13, cursor:'pointer' }}>
              Enviar primeiro convite
            </button>
          </div>
        ) : (
          <div style={{ display:'grid', gap:10 }}>
            {recentes.map(invite => {
              const sup = invite.suppliers
              const seal = invite.seal
              return (
                <div key={invite.id} style={{ display:'flex', alignItems:'center', gap:14, padding:'12px 16px', background:'#f8faff', borderRadius:12, border:'1px solid #e2e4ef' }}>
                  <div style={{ width:40, height:40, borderRadius:10, background:'#EEF0FF', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:14, color:'#2E3192', flexShrink:0 }}>
                    {(sup?.razao_social || invite.supplier_razao_social)?.slice(0,2).toUpperCase() || '??'}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, color:'#1a1c5e', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                      {sup?.razao_social || invite.supplier_razao_social || '—'}
                    </div>
                    <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:11, color:'#9B9B9B' }}>
                      {sup?.city && sup?.state ? `${sup.city} / ${sup.state}` : (sup?.cnpj || invite.supplier_cnpj || '')}
                    </div>
                  </div>
                  {invite.subsidiado && (
                    <span style={{ fontSize:10, background:'#d1fae5', color:'#065f46', borderRadius:20, padding:'2px 8px', fontFamily:'Montserrat,sans-serif', fontWeight:700, flexShrink:0 }}>
                      SUBSIDIADO
                    </span>
                  )}
                  {invite.status === 'REGISTERED' && seal ? (
                    <div style={{ textAlign:'right', flexShrink:0 }}>
                      <div style={{ fontSize:11, fontWeight:700, color: sealColor(seal.status), fontFamily:'DM Sans,sans-serif' }}>
                        {sealLabel(seal.status)}
                      </div>
                      {seal.status === 'ACTIVE' && (
                        <div style={{ fontSize:11, color:'#9B9B9B' }}>Score {seal.score}%</div>
                      )}
                    </div>
                  ) : (
                    <span style={{ fontSize:11, color:'#f59e0b', fontFamily:'DM Sans,sans-serif', fontWeight:600, flexShrink:0 }}>
                      {invite.status === 'SENT' ? 'Convite enviado' : invite.status === 'VIEWED' ? 'Visualizado' : 'Cadastrado'}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* Ações rápidas */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:12, marginTop:20 }}>
        {[
          { label:'Meus Fornecedores', icon:'🏭', path:'/cliente/fornecedores', desc:'Ver lista completa' },
          { label:'Enviar Convite',    icon:'📨', path:'/cliente/convites',     desc:'Convidar novo fornecedor' },
        ].map(a => (
          <Card key={a.path} hover style={{ borderRadius:14, padding:'18px 20px', cursor:'pointer' }} onClick={() => navigate(a.path)}>
            <div style={{ fontSize:24, marginBottom:6 }}>{a.icon}</div>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:14, color:'#1a1c5e' }}>{a.label}</div>
            <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:12, color:'#9B9B9B', marginTop:2 }}>{a.desc}</div>
          </Card>
        ))}
      </div>
    </div>
  )
}
