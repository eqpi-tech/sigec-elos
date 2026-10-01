import { useState, useEffect } from 'react'
import { hasAction } from '../../lib/modules.js'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { clientApi } from '../../services/api.js'
import { supabase } from '../../lib/supabase.js'
import { PageHeader, Card, ScoreBar, Spinner, EmptyState, Button } from '../../components/ui.jsx'
import BuyerMarketplace from '../buyer/Marketplace.jsx'
import { MultiChips, FilterPanel } from '../../components/FilterChips.jsx'

// situação do processo na visão do cliente (01/10: filtros de múltipla escolha)
const SITUACAO = [
  { value: 'ACTIVE',    label: 'Homologado',           color: '#15803d' },
  { value: 'PENDING',   label: 'Em análise',           color: '#b45309' },
  { value: 'PAGAMENTO', label: 'Aguardando pagamento', color: '#ea580c' },
  { value: 'SUSPENDED', label: 'Suspenso / inativado', color: '#dc2626' },
  { value: 'EXPIRED',   label: 'Vencido',              color: '#64748b' },
]
const situacaoDe = (item) => {
  const s = item.seal
  if (s?.client_suspended_at || s?.status === 'SUSPENDED') return 'SUSPENDED'
  if (s?.status === 'PENDING' && s?.id && !s.released_at && !s.hoc_process_id) return 'PAGAMENTO'
  return s?.status || 'PENDING'
}
const venceEm60 = (item) => item.seal?.status === 'ACTIVE' && item.seal?.expires_at
  && new Date(item.seal.expires_at) - Date.now() < 60 * 86400000

const SEAL_LABEL = { ACTIVE:'Homologado', PENDING:'Em análise', SUSPENDED:'Suspenso', EXPIRED:'Expirado' }
const SEAL_COLOR = { ACTIVE:'#22c55e', PENDING:'#f59e0b', SUSPENDED:'#ef4444', EXPIRED:'#9B9B9B' }

// Mini-wizard "Todos os Fornecedores"
const VSTAGES = [
  { n:1, label:'Categoria', icon:'📦' },
  { n:2, label:'Região',    icon:'📍' },
  { n:3, label:'Tipo',      icon:'🔧' },
  { n:4, label:'Resultados',icon:'🎯' },
]
const CATEGORIES = [
  'Manutenção Industrial','Logística','Construção Civil','Meio Ambiente',
  'Segurança do Trabalho','Tecnologia','Metalurgia','Serviços Gerais',
  'Alimentação','Químicos','Transporte','Outros',
]
const STATES = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO']
const TIPOS  = [
  { v:'Todos',             label:'Todos',            icon:'🔍' },
  { v:'Produto',           label:'Produto',           icon:'📦' },
  { v:'Serviço',           label:'Serviço',           icon:'🔧' },
  { v:'Produto e Serviço', label:'Produto & Serviço', icon:'🔀' },
]
const LEVELS = [
  { v:'Todos',   label:'Todos os níveis' },
  { v:'Premium', label:'Premium ⭐' },
  { v:'Simples', label:'Simples 🏷️' },
]

export default function ClientSuppliers() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [activeTab,   setActiveTab]   = useState('meus')
  const [mySuppliers, setMySuppliers] = useState([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState('')

  // Filtros aba "meus"
  const [mySearch,  setMySearch]  = useState('')
  const [fSit,   setFSit]   = useState([])   // situação (múltipla)
  const [fNivel, setFNivel] = useState([])   // nível/pacote (múltipla)
  const [fCust,  setFCust]  = useState([])   // custeio (uma)
  const [fDest,  setFDest]  = useState([])   // destaques (múltipla)
  const [fUf,    setFUf]    = useState([])   // UF (múltipla)
  const [flowNames, setFlowNames] = useState({})
  useEffect(() => {
    if (!user?.clientId) return
    supabase.from('client_flows').select('id, name').eq('client_id', user.clientId)
      .then(({ data }) => setFlowNames(Object.fromEntries((data || []).map(f => [f.id, f.name]))))
  }, [user?.clientId])
  const filtrosAtivos = fSit.length + fNivel.length + fCust.length + fDest.length + fUf.length > 0 || !!mySearch
  const limparFiltros = () => { setFSit([]); setFNivel([]); setFCust([]); setFDest([]); setFUf([]); setMySearch('') }

  // Mini-wizard aba "todos"
  const [vStage,    setVStage]    = useState(1)
  const [vFilters,  setVFilters]  = useState({ category:'', q:'', state:'', tipo:'Todos', level:'Todos', onlyMine:false })
  const [vResults,  setVResults]  = useState([])
  const [vLoading,  setVLoading]  = useState(false)
  const [vSearched, setVSearched] = useState(false)

  // Modal inativar
  const [inactivateModal,  setInactivateModal]  = useState(null)
  // Análise prioritária (patch_113): { sealId, razaoSocial } + nota opcional
  const [prioModal, setPrioModal] = useState(null)
  const [prioNote,  setPrioNote]  = useState('')
  const [prioSaving, setPrioSaving] = useState(false)
  const confirmPriority = async () => {
    setPrioSaving(true)
    try {
      const em = await clientApi.requestPriority(prioModal.sealId, prioNote.trim())
      setMySuppliers(prev => prev.map(x => x.seal?.id === prioModal.sealId ? { ...x, seal: { ...x.seal, priority_requested_at: em } } : x))
      setPrioModal(null)
    } catch (e) { alert('Não foi possível priorizar: ' + e.message) }
    finally { setPrioSaving(false) }
  }
  const [inactivateReason, setInactivateReason] = useState('')
  const [inactivating,     setInactivating]     = useState(false)

  useEffect(() => {
    if (!user?.clientId) return
    clientApi.getSuppliers(user.clientId)
      .then(setMySuppliers)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [user?.clientId])

  const updV = (k, v) => setVFilters(f => ({ ...f, [k]: v }))

  const runVendorSearch = async () => {
    if (!user?.clientId) return
    setVLoading(true); setVSearched(true); setVStage(4)
    try {
      const list = await clientApi.getVendorList(user.clientId, {
        search: vFilters.q,
        state:  vFilters.state,
      })
      // Filtros cliente-side: tipo, level, onlyMine
      let filtered = list
      if (vFilters.onlyMine) filtered = filtered.filter(s => s.isMySupplier)
      if (vFilters.level !== 'Todos') filtered = filtered.filter(s => (s.mySeal || s.seal)?.level === vFilters.level)
      setVResults(filtered)
    } catch (e) { setError(e.message) }
    finally { setVLoading(false) }
  }

  const handleTabChange = tab => {
    setActiveTab(tab)
    setMySearch(''); setMyStatus('Todos')
    setVStage(1); setVFilters({ category:'', q:'', state:'', tipo:'Todos', level:'Todos', onlyMine:false })
    setVResults([]); setVSearched(false)
  }

  const handleInactivate = async () => {
    if (!inactivateReason.trim() || !inactivateModal) return
    setInactivating(true)
    try {
      await clientApi.inactivateSupplier(inactivateModal.supplierId, inactivateReason.trim())
      setMySuppliers(prev => prev.map(s =>
        s.supplierId === inactivateModal.supplierId
          ? { ...s, seal: { ...s.seal, client_suspended_at: new Date().toISOString() } } : s
      ))
      setInactivateModal(null); setInactivateReason('')
    } catch (e) { alert('Erro: ' + e.message) }
    setInactivating(false)
  }

  const handleReactivate = async supplierId => {
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
    if (fSit.length && !fSit.includes(situacaoDe(item))) return false
    if (fNivel.length && !fNivel.includes(item.flowId || 'sem')) return false
    if (fCust.length && !fCust.includes(item.subsidiado ? 'sim' : 'nao')) return false
    if (fDest.includes('prio') && !(item.seal?.status === 'PENDING' && item.seal?.priority_requested_at)) return false
    if (fDest.includes('carta') && !item.cartaExcecao) return false
    if (fDest.includes('vence') && !venceEm60(item)) return false
    if (fUf.length && !fUf.includes(item.supplier?.state || '—')) return false
    return true
  })
  const conta = (fn) => mySuppliers.filter(fn).length
  const ufs = [...new Set(mySuppliers.map(i => i.supplier?.state || '—'))].sort()
  const niveis = [...new Set(mySuppliers.map(i => i.flowId || 'sem'))]

  const myIds = new Set(mySuppliers.map(s => s.supplierId).filter(Boolean))

  const chip = (active, color = '#2E3192') => ({
    padding:'7px 14px', borderRadius:20,
    border:`1px solid ${active ? color : '#e2e4ef'}`,
    background:active ? `${color}18` : '#fff',
    color:active ? color : '#9B9B9B',
    fontFamily:'DM Sans,sans-serif', fontWeight:600, fontSize:12, cursor:'pointer', whiteSpace:'nowrap',
  })
  const inp = { padding:'10px 14px', borderRadius:10, border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#1a1c5e' }
  const sec = t => <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:15, color:'#1a1c5e', marginBottom:12 }}>{t}</div>

  const renderVStage = () => {
    // Passo 1 — Categoria
    if (vStage === 1) return (
      <div>
        {sec('Qual categoria de fornecedor você procura?')}
        <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:16 }}>
          {CATEGORIES.map(c => (
            <button key={c} onClick={() => updV('category', vFilters.category === c ? '' : c)} style={chip(vFilters.category === c)}>{c}</button>
          ))}
        </div>
        <input value={vFilters.q} onChange={e => updV('q', e.target.value)}
          placeholder="Ou busque por nome, CNPJ ou serviço específico..."
          style={{ ...inp, width:'100%', boxSizing:'border-box' }} />
      </div>
    )

    // Passo 2 — Região
    if (vStage === 2) return (
      <div>
        {sec('Estado de atuação?')}
        <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:16 }}>
          <button onClick={() => updV('state', '')} style={chip(!vFilters.state)}>🌎 Todos</button>
          {STATES.map(s => (
            <button key={s} onClick={() => updV('state', vFilters.state === s ? '' : s)} style={chip(vFilters.state === s)}>{s}</button>
          ))}
        </div>
      </div>
    )

    // Passo 3 — Tipo + Nível de homologação
    if (vStage === 3) return (
      <div>
        {sec('Tipo de fornecimento?')}
        <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:24 }}>
          {TIPOS.map(t => (
            <button key={t.v} onClick={() => updV('tipo', t.v)} style={chip(vFilters.tipo === t.v, '#F47E2F')}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
        {sec('Nível de homologação?')}
        <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:24 }}>
          {LEVELS.map(l => (
            <button key={l.v} onClick={() => updV('level', l.v)} style={chip(vFilters.level === l.v, '#2E3192')}>{l.label}</button>
          ))}
        </div>
        {sec('Abrangência?')}
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={() => updV('onlyMine', false)} style={chip(!vFilters.onlyMine)}>Toda a base</button>
          <button onClick={() => updV('onlyMine', true)}  style={chip(vFilters.onlyMine, '#15803d')}>Apenas vinculados a mim</button>
        </div>
      </div>
    )
  }

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
          ...(hasAction(user, 'acao:todos_fornecedores') ? [['todos', 'Todos os Fornecedores']] : []),
          ...(hasAction(user, 'acao:interessados') ? [['interessados', '💡 Interessados']] : []),
        ].map(([tab, label]) => (
          <button key={tab} onClick={() => handleTabChange(tab)}
            style={{ padding:'10px 22px', background:'none', border:'none', borderBottom:`3px solid ${activeTab===tab?'#2E3192':'transparent'}`, color:activeTab===tab?'#2E3192':'#9B9B9B', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, cursor:'pointer', marginBottom:-2 }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab: Meus Fornecedores ── */}
      {activeTab === 'meus' && (
        <>
          <FilterPanel total={mySuppliers.length} shown={filteredMine.length} active={filtrosAtivos} onClear={limparFiltros}>
            <input value={mySearch} onChange={e => setMySearch(e.target.value)}
              placeholder="Buscar por nome ou CNPJ..."
              style={{ ...inp, width:'100%', boxSizing:'border-box' }} />
            <MultiChips label="Situação" value={fSit} onChange={setFSit}
              options={SITUACAO.map(o => ({ ...o, count: conta(i => situacaoDe(i) === o.value) })).filter(o => o.count > 0)}/>
            {niveis.length > 1 && (
              <MultiChips label="Nível" value={fNivel} onChange={setFNivel}
                options={niveis.map(v => ({ value: v, label: v === 'sem' ? 'Sem nível definido' : (flowNames[v] || 'Nível'), count: conta(i => (i.flowId || 'sem') === v) }))}/>
            )}
            <MultiChips label="Custeio" single value={fCust} onChange={setFCust}
              options={[{ value: 'sim', label: '💰 Subsidiado', count: conta(i => i.subsidiado) }, { value: 'nao', label: 'Pago pelo fornecedor', count: conta(i => !i.subsidiado) }].filter(o => o.count > 0)}/>
            <MultiChips label="Destaques" value={fDest} onChange={setFDest}
              options={[
                { value: 'prio',  label: '⚡ Prioritários', color: '#b45309', count: conta(i => i.seal?.status === 'PENDING' && i.seal?.priority_requested_at) },
                { value: 'carta', label: '📜 Com carta de exceção', color: '#b45309', count: conta(i => i.cartaExcecao) },
                { value: 'vence', label: '⏰ Vence em até 60 dias', color: '#dc2626', count: conta(venceEm60) },
              ].filter(o => o.count > 0)}/>
            {ufs.length > 1 && (
              <MultiChips label="UF" value={fUf} onChange={setFUf}
                options={ufs.map(u => ({ value: u, label: u, count: conta(i => (i.supplier?.state || '—') === u) }))}/>
            )}
          </FilterPanel>

          {filteredMine.length === 0 ? (
            <EmptyState icon="🏭" title="Nenhum fornecedor encontrado"
              subtitle={filtrosAtivos ? 'Ajuste os filtros.' : 'Seus fornecedores aparecem aqui após o vínculo de homologação.'} />
          ) : (
            <div style={{ display:'grid', gap:12 }}>
              {filteredMine.map(item => {
                const sup    = item.supplier
                const seal   = item.seal
                const isSusp = !!seal?.client_suspended_at
                const sealSt = isSusp ? 'SUSPENDED' : seal?.status
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
                              {isSusp ? 'Inativado por mim' : situacaoDe(item) === 'PAGAMENTO' ? '💳 Aguardando pagamento' : SEAL_LABEL[seal.status] || seal.status}
                            </span>
                          )}
                          {item.flowId && flowNames[item.flowId] && (
                            <span style={{ fontSize:10, background:'rgba(46,49,146,.08)', color:'#2E3192', borderRadius:20, padding:'2px 8px', fontFamily:'Montserrat,sans-serif', fontWeight:700 }}>{flowNames[item.flowId]}</span>
                          )}
                          {item.cartaExcecao && (
                            <span style={{ fontSize:10, background:'#fff7ed', color:'#c2410c', borderRadius:20, padding:'2px 8px', fontFamily:'Montserrat,sans-serif', fontWeight:700 }}>📜 Carta de exceção</span>
                          )}
                          {seal?.status === 'PENDING' && seal?.priority_requested_at && (
                            <span title={`Pedido em ${new Date(seal.priority_requested_at).toLocaleString('pt-BR')}`}
                              style={{ fontSize:10, background:'#fef3c7', color:'#b45309', borderRadius:20, padding:'2px 8px', fontFamily:'Montserrat,sans-serif', fontWeight:700 }}>
                              ⚡ Análise prioritária solicitada
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
                        {/* só processo EM ANÁLISE de verdade (pago/subsidiado ou HOC) */}
                        {seal?.id && seal.status === 'PENDING' && !isSusp && !seal.priority_requested_at
                          && (seal.released_at || seal.hoc_process_id) && hasAction(user, 'acao:priorizar_analise') && (
                          <Button variant="orange" size="sm"
                            onClick={() => { setPrioModal({ sealId: seal.id, razaoSocial: sup?.razao_social || item.inviteRazaoSocial }); setPrioNote('') }}>
                            ⚡ Priorizar
                          </Button>
                        )}
                        {seal?.status === 'ACTIVE' && !isSusp && (
                          <Button variant="danger" size="sm"
                            onClick={() => { setInactivateModal({ supplierId:item.supplierId, razaoSocial:sup?.razao_social||item.inviteRazaoSocial }); setInactivateReason('') }}>
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

      {/* ── Tab: Todos os Fornecedores — busca completa (mesma tela do comprador) ── */}
      {activeTab === 'todos' && hasAction(user, 'acao:todos_fornecedores') && (
        <div style={{ margin:'0 -32px' }}>
          <BuyerMarketplace/>
        </div>
      )}

      {/* ── Tab: Fornecedores com Intenção de Prestar Serviços ── */}
      {activeTab === 'interessados' && hasAction(user, 'acao:interessados') && (
        <InterestsReport clientId={user?.clientId} navigate={navigate}/>
      )}

      {/* Modal Inativar */}
      {prioModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'#fff', borderRadius:16, padding:28, maxWidth:470, width:'90%', boxShadow:'0 20px 60px rgba(0,0,0,.2)' }}>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:18, color:'#b45309', marginBottom:6 }}>⚡ Priorizar Análise</div>
            <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#374151', marginBottom:14, lineHeight:1.6 }}>
              Confirma o pedido de <strong>análise prioritária</strong> para <strong>{prioModal.razaoSocial}</strong>? A equipe EQPI passa a analisar este processo à frente da fila. Use em caso de urgência.
            </div>
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#9B9B9B', fontFamily:'Montserrat,sans-serif', letterSpacing:.5, textTransform:'uppercase', marginBottom:5 }}>Motivo da urgência (opcional)</label>
            <textarea value={prioNote} onChange={e => setPrioNote(e.target.value)} rows={2}
              placeholder="Ex.: contrato começa na próxima semana"
              style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:13, boxSizing:'border-box', resize:'vertical', marginBottom:16 }}/>
            <div style={{ display:'flex', gap:8 }}>
              <Button variant="neutral" full onClick={() => setPrioModal(null)}>Cancelar</Button>
              <Button variant="orange" full disabled={prioSaving} onClick={confirmPriority}>{prioSaving ? 'Enviando…' : '⚡ Confirmar prioridade'}</Button>
            </div>
          </div>
        </div>
      )}

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

// ── Relatório "Fornecedores com Intenção de Prestar Serviços" ────────────────
// Convite reverso: fornecedores homologados que se auto-inseriram na lista.
// O cliente pode ver a ficha, convidar (pré-preenchido), abrir RFQ ou remover.
function InterestsReport({ clientId, navigate }) {
  const [rows,    setRows]    = useState(null)
  const [acting,  setActing]  = useState(null)

  useEffect(() => {
    if (!clientId) return
    supabase
      .from('supplier_interests')
      .select('id, supplier_id, message, created_at, suppliers(id, razao_social, cnpj, city, state, email, phone, contact_name)')
      .eq('client_id', clientId)
      .eq('status', 'PENDING')
      .order('created_at', { ascending: false })
      .then(({ data }) => setRows(data || []))
  }, [clientId])

  const dismiss = async (row) => {
    if (!confirm(`Remover ${row.suppliers?.razao_social || 'este fornecedor'} da lista de interessados?`)) return
    setActing(row.id)
    const { error } = await supabase.from('supplier_interests')
      .update({ status: 'DISMISSED' }).eq('id', row.id)
    if (error) alert('Erro: ' + error.message)
    else setRows(prev => prev.filter(r => r.id !== row.id))
    setActing(null)
  }

  const invite = (row) => {
    const s = row.suppliers || {}
    navigate('/cliente/convites', { state: { prefill: {
      razao_social: s.razao_social || '', cnpj: s.cnpj || '',
      email: s.email || '', contato: s.contact_name || '', telefone: s.phone || '',
    } } })
  }

  if (rows === null) return <div style={{ display:'flex', justifyContent:'center', padding:40 }}><Spinner size={36}/></div>

  if (!rows.length) return (
    <EmptyState icon="💡" title="Nenhuma intenção registrada"
      subtitle="Fornecedores homologados na plataforma podem declarar interesse em prestar serviços para sua empresa — eles aparecerão aqui."/>
  )

  return (
    <>
      <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#64748b', marginBottom:14 }}>
        {rows.length} fornecedor{rows.length !== 1 ? 'es' : ''} declarou{rows.length !== 1 ? 'ram' : ''} intenção
        de prestar serviços para sua empresa. Convide, solicite cotação ou remova da lista.
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        {rows.map(row => {
          const s = row.suppliers || {}
          return (
            <Card key={row.id} style={{ borderRadius:14, padding:'16px 20px' }}>
              <div style={{ display:'flex', alignItems:'flex-start', gap:14, flexWrap:'wrap' }}>
                <div style={{ width:44, height:44, borderRadius:10, background:'rgba(244,126,47,.12)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:17, color:'#F47E2F', flexShrink:0 }}>
                  {s.razao_social?.[0] || '?'}
                </div>
                <div style={{ flex:1, minWidth:220 }}>
                  <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:14, color:'#1a1c5e' }}>
                    {s.razao_social || 'Fornecedor'}
                  </div>
                  <div style={{ fontSize:12, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', marginTop:2 }}>
                    {[s.cnpj, s.city && s.state ? `${s.city}/${s.state}` : null,
                      `Interesse em ${new Date(row.created_at).toLocaleDateString('pt-BR')}`].filter(Boolean).join(' · ')}
                  </div>
                  {row.message && (
                    <div style={{ marginTop:8, padding:'8px 12px', background:'#f8f9ff', borderLeft:'3px solid #2E3192', borderRadius:'0 8px 8px 0', fontSize:12.5, color:'#374151', fontFamily:'DM Sans,sans-serif', fontStyle:'italic' }}>
                      "{row.message}"
                    </div>
                  )}
                </div>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap', justifyContent:'flex-end' }}>
                  <Button variant="neutral" size="sm" onClick={() => navigate(`/cliente/perfil-fornecedor/${row.supplier_id}`)}>👁 Ficha</Button>
                  <Button variant="primary" size="sm" onClick={() => invite(row)}>📨 Enviar Convite</Button>
                  <Button variant="danger"  size="sm" disabled={acting === row.id} onClick={() => dismiss(row)}>
                    {acting === row.id ? '⏳' : '🗑'}
                  </Button>
                </div>
              </div>
            </Card>
          )
        })}
      </div>
    </>
  )
}
