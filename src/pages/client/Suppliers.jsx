import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { clientApi } from '../../services/api.js'
import { PageHeader, Card, ScoreBar, Spinner, EmptyState, Button } from '../../components/ui.jsx'

const SEAL_LABEL = { ACTIVE:'Homologado', PENDING:'Em análise', SUSPENDED:'Suspenso', EXPIRED:'Expirado' }
const SEAL_COLOR = { ACTIVE:'#22c55e', PENDING:'#f59e0b', SUSPENDED:'#ef4444', EXPIRED:'#9B9B9B' }

export default function ClientSuppliers() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [activeTab,    setActiveTab]    = useState('meus')  // 'meus' | 'vendor'
  const [mySuppliers,  setMySuppliers]  = useState([])
  const [vendorList,   setVendorList]   = useState([])
  const [loading,      setLoading]      = useState(true)
  const [vendorLoaded, setVendorLoaded] = useState(false)
  const [error,        setError]        = useState('')
  const [search,       setSearch]       = useState('')
  const [filterStatus, setFilterStatus] = useState('Todos')

  // Modal inativar
  const [inactivateModal, setInactivateModal] = useState(null)  // { supplierId, razaoSocial }
  const [inactivateReason, setInactivateReason] = useState('')
  const [inactivating, setInactivating] = useState(false)

  useEffect(() => {
    if (!user?.clientId) return
    clientApi.getSuppliers(user.clientId)
      .then(setMySuppliers)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [user?.clientId])

  const loadVendorList = async () => {
    if (vendorLoaded || !user?.clientId) return
    try {
      const list = await clientApi.getVendorList(user.clientId)
      setVendorList(list)
      setVendorLoaded(true)
    } catch (e) { setError(e.message) }
  }

  const handleTabChange = (tab) => {
    setActiveTab(tab)
    setSearch('')
    setFilterStatus('Todos')
    if (tab === 'vendor') loadVendorList()
  }

  const handleInactivate = async () => {
    if (!inactivateReason.trim() || !inactivateModal) return
    setInactivating(true)
    try {
      await clientApi.inactivateSupplier(inactivateModal.supplierId, inactivateReason.trim())
      setMySuppliers(prev => prev.map(s =>
        s.supplierId === inactivateModal.supplierId
          ? { ...s, seal: { ...s.seal, client_suspended_at: new Date().toISOString() } }
          : s
      ))
      setInactivateModal(null)
      setInactivateReason('')
    } catch (e) { alert('Erro: ' + e.message) }
    setInactivating(false)
  }

  const handleReactivate = async (supplierId) => {
    try {
      await clientApi.reactivateSupplier(supplierId)
      setMySuppliers(prev => prev.map(s =>
        s.supplierId === supplierId ? { ...s, seal: { ...s.seal, client_suspended_at: null } } : s
      ))
    } catch (e) { alert('Erro: ' + e.message) }
  }

  if (loading) return <div style={{ display:'flex', justifyContent:'center', padding:80 }}><Spinner size={40}/></div>
  if (error)   return <div style={{ padding:32, color:'#dc2626' }}>{error}</div>

  const filterItems = (items, isVendor = false) => {
    const q = search.toLowerCase()
    return items.filter(s => {
      const name = isVendor ? (s.razao_social || '').toLowerCase() : (s.supplier?.razao_social || s.inviteRazaoSocial || '').toLowerCase()
      const cnpj = isVendor ? (s.cnpj || '') : (s.supplier?.cnpj || s.inviteCnpj || '')
      if (q && !name.includes(q) && !cnpj.includes(q)) return false
      if (!isVendor && filterStatus !== 'Todos' && s.seal?.status !== filterStatus) return false
      if (isVendor && filterStatus === 'ACTIVE' && s.seal?.status !== 'ACTIVE') return false
      return true
    })
  }

  return (
    <div style={{ padding:'28px 32px', maxWidth:1100, margin:'0 auto' }}>
      <PageHeader
        title="Fornecedores"
        subtitle={`${mySuppliers.length} no meu processo · Vendor List disponível`}
      />

      {/* Abas */}
      <div style={{ display:'flex', gap:0, borderBottom:'2px solid #e2e4ef', marginBottom:20 }}>
        {[['meus', `Meus Fornecedores (${mySuppliers.length})`], ['vendor', 'Vendor List']].map(([tab, label]) => (
          <button key={tab} onClick={() => handleTabChange(tab)}
            style={{ padding:'10px 20px', background:'none', border:'none', borderBottom:`3px solid ${activeTab===tab?'#2E3192':'transparent'}`, color:activeTab===tab?'#2E3192':'#9B9B9B', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, cursor:'pointer', marginBottom:-2 }}>
            {label}
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display:'flex', gap:12, marginBottom:20, flexWrap:'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nome ou CNPJ..."
          style={{ flex:1, minWidth:220, padding:'10px 14px', borderRadius:10, border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#1a1c5e' }}
        />
        {activeTab === 'meus' && (
          <div style={{ display:'flex', gap:8 }}>
            {['Todos','ACTIVE','PENDING','SUSPENDED'].map(s => (
              <button key={s} onClick={() => setFilterStatus(s)}
                style={{ padding:'8px 14px', borderRadius:20, border:`1px solid ${filterStatus===s?'#2E3192':'#e2e4ef'}`, background:filterStatus===s?'#2E3192':'#fff', color:filterStatus===s?'#fff':'#1a1c5e', fontFamily:'DM Sans,sans-serif', fontSize:12, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap' }}>
                {s === 'Todos' ? 'Todos' : SEAL_LABEL[s]}
              </button>
            ))}
          </div>
        )}
        {activeTab === 'vendor' && (
          <button onClick={() => setFilterStatus(filterStatus === 'ACTIVE' ? 'Todos' : 'ACTIVE')}
            style={{ padding:'8px 14px', borderRadius:20, border:`1px solid ${filterStatus==='ACTIVE'?'#22c55e':'#e2e4ef'}`, background:filterStatus==='ACTIVE'?'rgba(34,197,94,.1)':'#fff', color:filterStatus==='ACTIVE'?'#15803d':'#1a1c5e', fontFamily:'DM Sans,sans-serif', fontSize:12, fontWeight:600, cursor:'pointer' }}>
            Apenas homologados
          </button>
        )}
      </div>

      {/* Tab: Meus Fornecedores */}
      {activeTab === 'meus' && (() => {
        const filtered = filterItems(mySuppliers)
        if (filtered.length === 0) return (
          <EmptyState icon="🏭" title="Nenhum fornecedor encontrado"
            subtitle={search || filterStatus !== 'Todos' ? 'Ajuste os filtros.' : 'Seus fornecedores aparecerão aqui após aceitar o convite.'} />
        )
        return (
          <div style={{ display:'grid', gap:12 }}>
            {filtered.map(item => {
              const sup      = item.supplier
              const seal     = item.seal
              const isSusp   = !!seal?.client_suspended_at
              const sealStatus = isSusp ? 'SUSPENDED' : seal?.status
              return (
                <Card key={item.inviteId} style={{ borderRadius:14, padding:'18px 22px', border:isSusp?'1px solid #fef3c7':undefined }}>
                  <div style={{ display:'flex', gap:16, alignItems:'flex-start' }}>
                    <div style={{ width:48, height:48, borderRadius:12, background:'#EEF0FF', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:16, color:'#2E3192', flexShrink:0 }}>
                      {(sup?.razao_social || item.inviteRazaoSocial)?.slice(0,2).toUpperCase() || '??'}
                    </div>

                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:4 }}>
                        <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:14, color:'#1a1c5e' }}>
                          {sup?.razao_social || item.inviteRazaoSocial || '—'}
                        </div>
                        {item.subsidiado && (
                          <span style={{ fontSize:10, background:'#d1fae5', color:'#065f46', borderRadius:20, padding:'2px 8px', fontFamily:'Montserrat,sans-serif', fontWeight:700 }}>SUBSIDIADO</span>
                        )}
                        {seal && (
                          <span style={{ fontSize:10, background:`${SEAL_COLOR[sealStatus]||'#9B9B9B'}22`, color:SEAL_COLOR[sealStatus]||'#9B9B9B', borderRadius:20, padding:'2px 8px', fontFamily:'Montserrat,sans-serif', fontWeight:700 }}>
                            {isSusp ? 'Inativado por mim' : SEAL_LABEL[seal.status] || seal.status}
                          </span>
                        )}
                      </div>

                      <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:12, color:'#9B9B9B', marginBottom:6 }}>
                        {(sup?.cnpj || item.inviteCnpj) && `CNPJ ${sup?.cnpj || item.inviteCnpj}`}
                        {sup?.city && sup?.state && ` · ${sup.city}/${sup.state}`}
                        {item.tipo && ` · ${item.tipo === 'produto' ? 'Produto' : item.tipo === 'servico' ? 'Serviço' : 'Produto & Serviço'}`}
                      </div>

                      {seal?.status === 'ACTIVE' && !isSusp && (
                        <div style={{ maxWidth:280 }}>
                          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                            <span style={{ fontSize:11, color:'#9B9B9B' }}>Score de conformidade</span>
                            <span style={{ fontSize:11, fontWeight:700, color:'#1a1c5e' }}>{seal.score}%</span>
                          </div>
                          <ScoreBar value={seal.score} />
                        </div>
                      )}
                    </div>

                    <div style={{ flexShrink:0, display:'flex', flexDirection:'column', alignItems:'flex-end', gap:8 }}>
                      <Button variant="primary" size="sm" onClick={() => navigate(`/cliente/fornecedor/${item.supplierId}`)}>
                        Ver Processo →
                      </Button>
                      {seal?.status === 'ACTIVE' && !isSusp && (
                        <Button variant="danger" size="sm"
                          onClick={() => { setInactivateModal({ supplierId: item.supplierId, razaoSocial: sup?.razao_social || item.inviteRazaoSocial }); setInactivateReason('') }}>
                          Inativar
                        </Button>
                      )}
                      {isSusp && (
                        <Button variant="success" size="sm" onClick={() => handleReactivate(item.supplierId)}>
                          Reativar
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        )
      })()}

      {/* Tab: Vendor List */}
      {activeTab === 'vendor' && (() => {
        if (!vendorLoaded) return <div style={{ display:'flex', justifyContent:'center', padding:40 }}><Spinner size={32}/></div>
        const filtered = filterItems(vendorList, true)
        const myIds = new Set(mySuppliers.map(s => s.supplierId).filter(Boolean))

        if (filtered.length === 0) return (
          <EmptyState icon="🔍" title="Nenhum fornecedor encontrado" subtitle="Ajuste os filtros de busca." />
        )
        return (
          <div style={{ display:'grid', gap:8 }}>
            {filtered.map(s => {
              const isMySupplier = myIds.has(s.id) || s.isMySupplier
              const sealActive   = s.seal?.status === 'ACTIVE'
              return (
                <Card key={s.id} style={{ borderRadius:12, padding:'14px 18px', border:isMySupplier?'1px solid #bfdbfe':undefined, background:isMySupplier?'#eff6ff':undefined }}>
                  <div style={{ display:'flex', alignItems:'center', gap:14 }}>
                    <div style={{ width:40, height:40, borderRadius:10, background:'#EEF0FF', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:14, color:'#2E3192', flexShrink:0 }}>
                      {s.razao_social?.slice(0,2).toUpperCase() || '??'}
                    </div>

                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:2 }}>
                        <span style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, color:'#1a1c5e' }}>{s.razao_social}</span>
                        {isMySupplier && (
                          <span style={{ fontSize:10, background:'#dbeafe', color:'#1d4ed8', borderRadius:20, padding:'1px 7px', fontFamily:'Montserrat,sans-serif', fontWeight:700 }}>MEU FORNECEDOR</span>
                        )}
                        {sealActive && (
                          <span style={{ fontSize:10, background:'rgba(34,197,94,.12)', color:'#15803d', borderRadius:20, padding:'1px 7px', fontFamily:'Montserrat,sans-serif', fontWeight:700 }}>HOMOLOGADO</span>
                        )}
                      </div>
                      <div style={{ fontSize:11, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>
                        {s.cnpj && `CNPJ ${s.cnpj}`}
                        {s.city && s.state && ` · ${s.city}/${s.state}`}
                        {s.seal?.seal_name && ` · ${s.seal.seal_name}`}
                      </div>
                    </div>

                    <div style={{ flexShrink:0, display:'flex', gap:8 }}>
                      {isMySupplier ? (
                        <Button variant="neutral" size="sm" onClick={() => {
                          const mine = mySuppliers.find(m => m.supplierId === s.id)
                          if (mine) navigate(`/cliente/fornecedor/${s.id}`)
                        }}>Ver Processo</Button>
                      ) : (
                        <Button variant="primary" size="sm" onClick={() => navigate('/cliente/convites')}>
                          Convidar →
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        )
      })()}

      {/* Modal Inativar */}
      {inactivateModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'#fff', borderRadius:16, padding:32, maxWidth:460, width:'90%', boxShadow:'0 20px 60px rgba(0,0,0,.2)' }}>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:18, color:'#dc2626', marginBottom:6 }}>Inativar Fornecedor</div>
            <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#64748b', marginBottom:16 }}>
              <strong>{inactivateModal.razaoSocial}</strong> terá o processo suspenso no seu contexto. O fornecedor não perderá o Selo em outros clientes.
            </div>
            <textarea
              value={inactivateReason}
              onChange={e => setInactivateReason(e.target.value)}
              placeholder="Motivo da inativação (obrigatório)..."
              rows={3}
              style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:13, resize:'vertical', boxSizing:'border-box', marginBottom:16 }}
            />
            <div style={{ display:'flex', gap:8 }}>
              <Button variant="neutral" full onClick={() => setInactivateModal(null)}>Cancelar</Button>
              <Button variant="danger" full disabled={!inactivateReason.trim() || inactivating} onClick={handleInactivate}>
                {inactivating ? '⏳...' : 'Confirmar Inativação'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
