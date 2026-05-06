import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext.jsx'
import { clientApi } from '../../services/api.js'
import { PageHeader, Card, ScoreBar, Badge, Spinner, EmptyState } from '../../components/ui.jsx'

const SEAL_LABEL = { ACTIVE:'Homologado', PENDING:'Em análise', SUSPENDED:'Suspenso', EXPIRED:'Expirado' }
const SEAL_COLOR = { ACTIVE:'#22c55e',    PENDING:'#f59e0b',    SUSPENDED:'#ef4444',   EXPIRED:'#9B9B9B' }

export default function ClientSuppliers() {
  const { user } = useAuth()
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [search, setSearch]       = useState('')
  const [filterStatus, setFilterStatus] = useState('Todos')

  useEffect(() => {
    if (!user?.clientId) return
    clientApi.getSuppliers(user.clientId)
      .then(setSuppliers)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [user?.clientId])

  const filtered = suppliers.filter(s => {
    const q = search.toLowerCase()
    const name = s.supplier?.razao_social?.toLowerCase() || ''
    const cnpj = s.supplier?.cnpj || ''
    if (q && !name.includes(q) && !cnpj.includes(q)) return false
    if (filterStatus !== 'Todos' && s.seal?.status !== filterStatus) return false
    return true
  })

  if (loading) return <div style={{ display:'flex', justifyContent:'center', padding:80 }}><Spinner size={40}/></div>
  if (error)   return <div style={{ padding:32, color:'#dc2626' }}>{error}</div>

  return (
    <div style={{ padding:'28px 32px', maxWidth:1100, margin:'0 auto' }}>
      <PageHeader
        title="Meus Fornecedores"
        subtitle={`${suppliers.length} fornecedor${suppliers.length !== 1 ? 'es' : ''} cadastrado${suppliers.length !== 1 ? 's' : ''}`}
      />

      {/* Filtros */}
      <div style={{ display:'flex', gap:12, marginBottom:20, flexWrap:'wrap' }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nome ou CNPJ..."
          style={{ flex:1, minWidth:220, padding:'10px 14px', borderRadius:10, border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#1a1c5e' }}
        />
        <div style={{ display:'flex', gap:8 }}>
          {['Todos','ACTIVE','PENDING','SUSPENDED'].map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              style={{ padding:'8px 14px', borderRadius:20, border:`1px solid ${filterStatus===s?'#2E3192':'#e2e4ef'}`, background:filterStatus===s?'#2E3192':'#fff', color:filterStatus===s?'#fff':'#1a1c5e', fontFamily:'DM Sans,sans-serif', fontSize:12, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap' }}>
              {s === 'Todos' ? 'Todos' : SEAL_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <EmptyState
          icon="🏭"
          title="Nenhum fornecedor encontrado"
          subtitle={search || filterStatus !== 'Todos' ? 'Tente ajustar os filtros.' : 'Seus fornecedores cadastrados aparecerão aqui após aceitar o convite.'}
        />
      ) : (
        <div style={{ display:'grid', gap:12 }}>
          {filtered.map(item => {
            const sup  = item.supplier
            const seal = item.seal
            return (
              <Card key={item.inviteId} style={{ borderRadius:14, padding:'18px 22px' }}>
                <div style={{ display:'flex', gap:16, alignItems:'flex-start' }}>
                  {/* Avatar */}
                  <div style={{ width:48, height:48, borderRadius:12, background:'#EEF0FF', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:16, color:'#2E3192', flexShrink:0 }}>
                    {sup?.razao_social?.slice(0,2).toUpperCase() || '??'}
                  </div>

                  {/* Info */}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:4 }}>
                      <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:14, color:'#1a1c5e' }}>
                        {sup?.razao_social}
                      </div>
                      {item.subsidiado && (
                        <span style={{ fontSize:10, background:'#d1fae5', color:'#065f46', borderRadius:20, padding:'2px 8px', fontFamily:'Montserrat,sans-serif', fontWeight:700 }}>
                          SUBSIDIADO
                        </span>
                      )}
                      {seal && (
                        <span style={{ fontSize:10, background:`${SEAL_COLOR[seal.status]}22`, color:SEAL_COLOR[seal.status], borderRadius:20, padding:'2px 8px', fontFamily:'Montserrat,sans-serif', fontWeight:700 }}>
                          {SEAL_LABEL[seal.status]}
                        </span>
                      )}
                    </div>

                    <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:12, color:'#9B9B9B', marginBottom:8 }}>
                      CNPJ {sup?.cnpj} · {sup?.city}/{sup?.state}
                      {item.tipo && ` · ${item.tipo === 'produto' ? 'Produto' : item.tipo === 'servico' ? 'Serviço' : 'Produto & Serviço'}`}
                    </div>

                    {item.escopo && (
                      <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:12, color:'#64748b', background:'#f8faff', borderRadius:8, padding:'6px 10px', marginBottom:8 }}>
                        <strong>Escopo:</strong> {item.escopo}
                      </div>
                    )}

                    {seal?.status === 'ACTIVE' && (
                      <div style={{ maxWidth:300 }}>
                        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                          <span style={{ fontSize:11, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>Score de conformidade</span>
                          <span style={{ fontSize:11, fontWeight:700, color:'#1a1c5e', fontFamily:'Montserrat,sans-serif' }}>{seal.score}%</span>
                        </div>
                        <ScoreBar value={seal.score} />
                      </div>
                    )}
                  </div>

                  {/* Convidado em */}
                  <div style={{ flexShrink:0, textAlign:'right' }}>
                    <div style={{ fontSize:11, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>Convidado em</div>
                    <div style={{ fontSize:12, fontWeight:600, color:'#1a1c5e', fontFamily:'DM Sans,sans-serif' }}>
                      {item.invitedAt ? new Date(item.invitedAt).toLocaleDateString('pt-BR') : '—'}
                    </div>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
