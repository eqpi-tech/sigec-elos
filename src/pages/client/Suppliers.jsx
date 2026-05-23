import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { clientApi } from '../../services/api.js'
import { PageHeader, Card, ScoreBar, Spinner, EmptyState, Button } from '../../components/ui.jsx'

const SEAL_LABEL = { ACTIVE:'Homologado', PENDING:'Em análise', SUSPENDED:'Suspenso', EXPIRED:'Expirado' }
const SEAL_COLOR = { ACTIVE:'#22c55e', PENDING:'#f59e0b', SUSPENDED:'#ef4444', EXPIRED:'#9B9B9B' }
const STATES     = ['','AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO']

export default function ClientSuppliers() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [activeTab,    setActiveTab]    = useState('meus')
  const [mySuppliers,  setMySuppliers]  = useState([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState('')

  // Filtros aba "meus"
  const [mySearch,     setMySearch]     = useState('')
  const [myStatus,     setMyStatus]     = useState('Todos')

  // Filtros e resultados aba "todos"
  const [vSearch,      setVSearch]      = useState('')
  const [vState,       setVState]       = useState('')
  const [vOnlyMine,    setVOnlyMine]    = useState(false)
  const [vResults,     setVResults]     = useState([])
  const [vLoading,     setVLoading]     = useState(false)
  const [vSearched,    setVSearched]    = useState(false)
  const debounceRef = useRef(null)

  // Modal inativar
  const [inactivateModal, setInactivateModal] = useState(null)
  const [inactivateReason, setInactivateReason] = useState('')
  const [inactivating, setInactivating] = useState(false)

  useEffect(() => {
    if (!user?.clientId) return
    clientApi.getSuppliers(user.clientId)
      .then(setMySuppliers)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [user?.clientId])

  // Busca automática na aba "todos" após debounce de 500ms
  useEffect(() => {
    if (activeTab !== 'todos') return
    clearTimeout(debounceRef.current)
    if (vSearch.trim().length < 2 && !vState) {
      setVResults([]); setVSearched(false); return
    }
    debounceRef.current = setTimeout(() => runVendorSearch(), 500)
    return () => clearTimeout(debounceRef.current)
  }, [vSearch, vState, activeTab])

  const runVendorSearch = async () => {
    if (!user?.clientId) return
    setVLoading(true); setVSearched(true)
    try {
      const list = await clientApi.getVendorList(user.clientId, { search: vSearch, state: vState })
      setVResults(list)
    } catch (e) { setError(e.message) }
    finally { setVLoading(false) }
  }

  const handleTabChange = (tab) => {
    setActiveTab(tab)
    setMySearch(''); setMyStatus('Todos')
    setVSearch(''); setVState(''); setVOnlyMine(false); setVSearched(false); setVResults([])
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
      setInactivateModal(null); setInactivateReason('')
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

  const filteredMine = mySuppliers.filter(item => {
    const q    = mySearch.toLowerCase()
    const name = (item.supplier?.razao_social || item.inviteRazaoSocial || '').toLowerCase()
    const cnpj = item.supplier?.cnpj || item.inviteCnpj || ''
    if (q && !name.includes(q) && !cnpj.includes(q.replace(/\D/g,''))) return false
    const isSusp = !!item.seal?.client_suspended_at
    const sealSt = isSusp ? 'SUSPENDED' : item.seal?.status
    if (myStatus !== 'Todos' && sealSt !== myStatus) return false
    return true
  })

  const filteredAll = vOnlyMine ? vResults.filter(s => s.isMySupplier) : vResults
  const myIds = new Set(mySuppliers.map(s => s.supplierId).filter(Boolean))

  const inp = { padding:'10px 14px', borderRadius:10, border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#1a1c5e' }
  const chip = (active, color='#2E3192') => ({ padding:'7px 14px', borderRadius:20, border:`1px solid ${active?color:'#e2e4ef'}`, background:active?`${color}18`:'#fff', color:active?color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', fontWeight:600, fontSize:12, cursor:'pointer', whiteSpace:'nowrap' })

  return (
    <div style={{ padding:'28px 32px', maxWidth:1100, margin:'0 auto' }}>
      <PageHeader
        title="Fornecedores"
        subtitle={`${mySuppliers.length} vinculado${mySuppliers.length !== 1 ? 's' : ''} ao seu processo`}
      />

      {/* Abas */}
      <div style={{ display:'flex', gap:0, borderBottom:'2px solid #e2e4ef', marginBottom:24 }}>
        {[
          ['meus', `Meus Fornecedores (${mySuppliers.length})`],
          ['todos', 'Todos os Fornecedores'],
        ].map(([tab, label]) => (
          <button key={tab} onClick={() => handleTabChange(tab)}
            style={{ padding:'10px 22px', background:'none', border:'none', borderBottom:`3px solid ${activeTab===tab?'#2E3192':'transparent'}`, color:activeTab===tab?'#2E3192':'#9B9B9B', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, cursor:'pointer', marginBottom:-2 }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab: Meus Fornecedores ──────────────────────────────────── */}
      {activeTab === 'meus' && (
        <>
          <div style={{ display:'flex', gap:10, marginBottom:20, flexWrap:'wrap', alignItems:'center' }}>
            <input value={mySearch} onChange={e => setMySearch(e.target.value)}
              placeholder="Buscar por nome ou CNPJ..."
              style={{ ...inp, flex:1, minWidth:220 }} />
            <div style={{ display:'flex', gap:6 }}>
              {['Todos','ACTIVE','PENDING','SUSPENDED'].map(s => (
                <button key={s} onClick={() => setMyStatus(s)} style={chip(myStatus===s)}>
                  {s === 'Todos' ? 'Todos' : SEAL_LABEL[s]}
                </button>
              ))}
            </div>
          </div>

          {filteredMine.length === 0 ? (
            <EmptyState icon="🏭" title="Nenhum fornecedor encontrado"
              subtitle={mySearch || myStatus !== 'Todos' ? 'Ajuste os filtros.' : 'Seus fornecedores aparecem aqui após o vínculo de homologação.'} />
          ) : (
            <div style={{ display:'grid', gap:12 }}>
              {filteredMine.map(item => {
                const sup      = item.supplier
                const seal     = item.seal
                const isSusp   = !!seal?.client_suspended_at
                const sealSt   = isSusp ? 'SUSPENDED' : seal?.status
                return (
                  <Card key={item.supplierId} style={{ borderRadius:14, padding:'18px 22px', border:isSusp?'1px solid #fef3c7':undefined }}>
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
                            <span style={{ fontSize:10, background:`${SEAL_COLOR[sealSt]||'#9B9B9B'}22`, color:SEAL_COLOR[sealSt]||'#9B9B9B', borderRadius:20, padding:'2px 8px', fontFamily:'Montserrat,sans-serif', fontWeight:700 }}>
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
                            <ScoreBar score={seal.score} />
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
          )}
        </>
      )}

      {/* ── Tab: Todos os Fornecedores ─────────────────────────────── */}
      {activeTab === 'todos' && (
        <>
          {/* Filtros */}
          <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap', alignItems:'center' }}>
            <input value={vSearch} onChange={e => setVSearch(e.target.value)}
              placeholder="Buscar por razão social ou CNPJ (mín. 2 caracteres)..."
              style={{ ...inp, flex:1, minWidth:260 }} />

            <select value={vState} onChange={e => setVState(e.target.value)}
              style={{ ...inp, background:'#fff', cursor:'pointer' }}>
              <option value="">Todos os estados</option>
              {STATES.filter(Boolean).map(s => <option key={s} value={s}>{s}</option>)}
            </select>

            <button onClick={() => setVOnlyMine(v => !v)} style={chip(vOnlyMine, '#2E3192')}>
              {vOnlyMine ? '✓ ' : ''}Apenas vinculados a mim
            </button>
          </div>

          {/* Empty / prompt */}
          {!vSearched && !vLoading && (
            <div style={{ textAlign:'center', padding:'60px 32px' }}>
              <div style={{ fontSize:40, marginBottom:12 }}>🔍</div>
              <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:16, color:'#1a1c5e', marginBottom:6 }}>
                Busque na base completa de fornecedores
              </div>
              <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#9B9B9B' }}>
                Digite o nome ou CNPJ (mín. 2 caracteres) ou selecione um estado para iniciar a busca.
              </div>
            </div>
          )}

          {vLoading && (
            <div style={{ display:'flex', justifyContent:'center', padding:60 }}><Spinner size={32}/></div>
          )}

          {vSearched && !vLoading && filteredAll.length === 0 && (
            <EmptyState icon="🔍" title="Nenhum fornecedor encontrado" subtitle="Tente ajustar os filtros de busca." />
          )}

          {!vLoading && filteredAll.length > 0 && (
            <>
              <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:12, color:'#9B9B9B', marginBottom:12 }}>
                <strong style={{ color:'#1a1c5e' }}>{filteredAll.length}</strong> fornecedor{filteredAll.length !== 1 ? 'es' : ''} encontrado{filteredAll.length !== 1 ? 's' : ''}
                {vResults.length >= 150 && ' · Refine a busca para ver mais resultados'}
              </div>
              <div style={{ display:'grid', gap:8 }}>
                {filteredAll.map(s => {
                  const isLinked = myIds.has(s.id) || s.isMySupplier
                  const seal     = s.mySeal || s.seal
                  const sealSt   = seal?.status
                  return (
                    <Card key={s.id} style={{ borderRadius:12, padding:'14px 18px', border:isLinked?'1px solid #bfdbfe':undefined, background:isLinked?'#eff6ff':undefined }}>
                      <div style={{ display:'flex', alignItems:'center', gap:14 }}>
                        <div style={{ width:40, height:40, borderRadius:10, background:'#EEF0FF', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:14, color:'#2E3192', flexShrink:0 }}>
                          {s.razao_social?.slice(0,2).toUpperCase() || '??'}
                        </div>

                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:2, flexWrap:'wrap' }}>
                            <span style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, color:'#1a1c5e' }}>{s.razao_social}</span>
                            {isLinked && (
                              <span style={{ fontSize:10, background:'#dbeafe', color:'#1d4ed8', borderRadius:20, padding:'1px 7px', fontFamily:'Montserrat,sans-serif', fontWeight:700 }}>VINCULADO</span>
                            )}
                            {sealSt === 'ACTIVE' && (
                              <span style={{ fontSize:10, background:'rgba(34,197,94,.12)', color:'#15803d', borderRadius:20, padding:'1px 7px', fontFamily:'Montserrat,sans-serif', fontWeight:700 }}>HOMOLOGADO</span>
                            )}
                            {sealSt === 'PENDING' && (
                              <span style={{ fontSize:10, background:'rgba(245,158,11,.12)', color:'#92400e', borderRadius:20, padding:'1px 7px', fontFamily:'Montserrat,sans-serif', fontWeight:700 }}>EM ANÁLISE</span>
                            )}
                          </div>
                          <div style={{ fontSize:11, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>
                            {s.cnpj && `CNPJ ${s.cnpj}`}
                            {s.city && s.state && ` · ${s.city}/${s.state}`}
                            {seal?.seal_name && ` · ${seal.seal_name}`}
                          </div>
                        </div>

                        <div style={{ flexShrink:0 }}>
                          {isLinked ? (
                            <Button variant="neutral" size="sm"
                              onClick={() => navigate(`/cliente/fornecedor/${s.id}`)}>
                              Ver Processo
                            </Button>
                          ) : (
                            <Button variant="primary" size="sm"
                              onClick={() => navigate('/cliente/convites')}>
                              Convidar →
                            </Button>
                          )}
                        </div>
                      </div>
                    </Card>
                  )
                })}
              </div>
            </>
          )}
        </>
      )}

      {/* Modal Inativar */}
      {inactivateModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'#fff', borderRadius:16, padding:32, maxWidth:460, width:'90%', boxShadow:'0 20px 60px rgba(0,0,0,.2)' }}>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:18, color:'#dc2626', marginBottom:6 }}>Inativar Fornecedor</div>
            <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#64748b', marginBottom:16 }}>
              <strong>{inactivateModal.razaoSocial}</strong> terá o processo suspenso no seu contexto. O fornecedor não perderá o Selo em outros clientes.
            </div>
            <textarea value={inactivateReason} onChange={e => setInactivateReason(e.target.value)}
              placeholder="Motivo da inativação (obrigatório)..."
              rows={3}
              style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:13, resize:'vertical', boxSizing:'border-box', marginBottom:16 }} />
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
