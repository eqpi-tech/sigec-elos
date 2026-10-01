// Análise de Processo — busca geral de todos os fornecedores (equivale à "Análise de Processo - Pesquisa" do HOC)
import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'
import { Button, Card, ScoreBar, Spinner, PageHeader, EmptyState } from '../../components/ui.jsx'

// busca de cliente por nome fantasia OU razão social, sem acento/espaço/
// pontuação: "vix par" acha "VIXPAR · VIX LOGISTICA S/A" (28/09 — o filtro só
// olhava a razão social e a VIX não aparecia)
const normBusca = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')
const clientLabel = (c) => (c?.nome_fantasia && normBusca(c.nome_fantasia) !== normBusca(c.razao_social)
  ? `${c.nome_fantasia} · ${c.razao_social}` : (c?.razao_social || c?.nome_fantasia || ''))

function ClientSearchCombo({ clients, value, onChange }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const selected = clients.find(c => c.id === value)
  const filtered = useMemo(() => {
    const lq = normBusca(q)
    if (!lq) return clients.slice(0, 20)
    return clients.filter(c => normBusca(`${c.nome_fantasia || ''} ${c.razao_social || ''}`).includes(lq)
      || normBusca(c.nome_fantasia).includes(lq) || normBusca(c.razao_social).includes(lq)).slice(0, 20)
  }, [clients, q])
  useEffect(() => {
    if (!open) return
    function h(e) { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setQ('') } }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])
  function select(c) { onChange(c.id); setOpen(false); setQ('') }
  function clear(e) { e.stopPropagation(); onChange(''); setQ(''); setOpen(false) }
  return (
    <div ref={ref} style={{ position:'relative', minWidth:200 }}>
      <div style={{ position:'relative' }}>
        <input
          value={open ? q : (selected ? clientLabel(selected) : '')}
          onChange={e => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => { setOpen(true); setQ('') }}
          placeholder="Todos os clientes"
          style={{ width:'100%', padding:'10px 36px 10px 14px', borderRadius:10, border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#1a1c5e', outline:'none', boxSizing:'border-box', background:'#fff' }}
        />
        {value
          ? <button onClick={clear} style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'#9B9B9B', fontSize:15, lineHeight:1 }}>✕</button>
          : <span style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', color:'#9B9B9B', pointerEvents:'none' }}>▾</span>
        }
      </div>
      {open && (
        <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, right:0, background:'#fff', border:'1px solid #e2e4ef', borderRadius:10, boxShadow:'0 4px 16px rgba(0,0,0,.1)', zIndex:200, maxHeight:240, overflowY:'auto' }}>
          <button onMouseDown={() => { onChange(''); setOpen(false); setQ('') }}
            style={{ width:'100%', padding:'10px 14px', border:'none', borderBottom:'1px solid #f4f5f9', background: !value ? 'rgba(46,49,146,.06)' : '#fff', cursor:'pointer', textAlign:'left', fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#9B9B9B', display:'block' }}>
            Todos os clientes
          </button>
          {filtered.map(c => (
            <button key={c.id} onMouseDown={() => select(c)}
              style={{ width:'100%', padding:'10px 14px', border:'none', borderBottom:'1px solid #f4f5f9', background: c.id===value ? 'rgba(46,49,146,.06)' : '#fff', cursor:'pointer', textAlign:'left', fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#1a1c5e', display:'block' }}>
              {clientLabel(c)}
            </button>
          ))}
          {!q.trim() && clients.length > 20 && (
            <div style={{ padding:'8px 14px', fontFamily:'DM Sans,sans-serif', fontSize:11, color:'#9B9B9B', textAlign:'center' }}>
              {clients.length - 20} clientes adicionais — refine a busca
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Pseudo-cliente de INTERFACE p/ processos ELOS puros (selo client_id NULL):
// permite filtrar e exibir 'ELOS' como cliente do processo SEM criar um
// cliente fictício no banco (client_id NULL = ELOS é premissa do sistema)
const ELOS_PSEUDO_CLIENT = { id: '__ELOS__', razao_social: '⭐ ELOS (processo próprio, sem cliente)' }

// Em análise = processo REAL em curso (selo PENDING). Cadastro sem selo é
// só cadastro (regra 09/09: aceite+pagamento antecedem a análise).
const SEAL_LABEL = { ACTIVE:'Homologado', PENDING:'Em análise', SUSPENDED:'Suspenso', REJECTED:'Rejeitado', CADASTRO:'Cadastro (sem processo)', CONVITE:'Convidado (sem cadastro)', PAGAMENTO:'💳 Aguardando pagamento' }
// trava de pagamento (patch_112): pendente sem pagamento confirmado não é análise
const sealStatusOf = (seal) => !seal ? 'CADASTRO'
  : (seal.status === 'PENDING' && !seal.released_at && !seal.hoc_process_id) ? 'PAGAMENTO' : seal.status
const SEAL_COLOR = { ACTIVE:'#22c55e',    PENDING:'#f59e0b',    SUSPENDED:'#ef4444',  REJECTED:'#9B9B9B',  CADASTRO:'#94a3b8', CONVITE:'#6366f1', PAGAMENTO:'#ea580c' }
// convite que ainda não virou cadastro (28/09: cliente recém-chegado só tem
// convites — a busca voltava vazia e parecia defeito)
const INVITE_LABEL = { SENT:'Enviado', VIEWED:'Visualizado — ainda não cadastrou', EXPIRED:'Expirado', CANCELLED:'Cancelado' }

export default function BackofficeProcessSearch() {
  const navigate  = useNavigate()
  const inputRef  = useRef(null)

  const [q,           setQ]           = useState('')
  const [filterType,  setFilterType]  = useState('Todos')   // Todos | ACTIVE | PENDING | SUSPENDED | CADASTRO
  const [filterClient,setFilterClient]= useState('')         // client_id ou ''
  const [showInactive,setShowInactive]= useState(false)
  const [results,     setResults]     = useState([])
  const [pendingInvites, setPendingInvites] = useState([])   // convites do cliente ainda sem cadastro
  const [clients,     setClients]     = useState([])
  const [loading,     setLoading]     = useState(false)
  const [searched,    setSearched]    = useState(false)

  // Carrega lista de clientes para o filtro
  useEffect(() => {
    supabase.from('clients').select('id, razao_social, nome_fantasia').order('razao_social')
      .then(({ data }) => setClients(data || []))
  }, [])

  const handleSearch = async () => {
    setLoading(true)
    setSearched(true)
    setPendingInvites([])

    const qTrim = q.trim()
    const qNums = qTrim.replace(/\D/g, '')
    const clientIdToName = clients.reduce((acc, c) => { acc[c.id] = clientLabel(c); return acc }, {})

    const buildSealMap = (seals) => {
      const m = {}
      seals.forEach(s => {
        if (!m[s.supplier_id] || (s.status === 'ACTIVE' && m[s.supplier_id].status !== 'ACTIVE'))
          m[s.supplier_id] = s
      })
      return m
    }

    const buildClientMap = (seals, invites) => {
      const m = {}
      const add = (sid, cid) => {
        // selo sem cliente = processo ELOS próprio → exibe 'ELOS'
        const name = cid == null ? 'ELOS' : clientIdToName[cid]
        if (!name) return
        if (!m[sid]) m[sid] = []
        if (!m[sid].includes(name)) m[sid].push(name)
      }
      seals.forEach(s => add(s.supplier_id, s.client_id))
      invites.forEach(i => add(i.supplier_id, i.client_id))
      return m
    }

    // ── Fluxo A: filtro de cliente ────────────────────────────────────────────
    // Busca por client_id nos selos (sem IN clause de IDs) — evita URL longa
    // '__ELOS__' = processos ELOS puros (selo com client_id NULL)
    if (filterClient) {
      const isElos = filterClient === ELOS_PSEUDO_CLIENT.id
      let sealQ = supabase.from('seals')
        .select('supplier_id, level, status, score, issued_at, client_id, released_at, hoc_process_id')
        .range(0, 4999)
      sealQ = isElos ? sealQ.is('client_id', null) : sealQ.eq('client_id', filterClient)
      const [sealRes, invRes] = await Promise.allSettled([
        sealQ,
        isElos
          ? Promise.resolve({ data: [] })
          : supabase.from('invitations')
              .select('id, supplier_id, client_id, supplier_cnpj, supplier_razao_social, supplier_email, status, created_at')
              .eq('client_id', filterClient),
      ])

      const clientSeals   = sealRes.status === 'fulfilled' ? (sealRes.value.data   || []) : []
      const clientInvites = invRes.status  === 'fulfilled' ? (invRes.value.data    || []) : []

      // convite sem cadastro não tem supplier_id: fora da consulta de fornecedores
      const supplierIdSet = new Set([
        ...clientSeals.map(s => s.supplier_id),
        ...clientInvites.map(i => i.supplier_id),
      ].filter(Boolean))

      // convites aguardando cadastro (reenvio substituído não conta de novo)
      const digitos = (v) => String(v || '').replace(/\D/g, '')
      const pend = clientInvites
        .filter(i => !i.supplier_id && !['REGISTERED', 'SUPERSEDED', 'CANCELLED'].includes(i.status))
        .filter(i => !qTrim || (qNums.length >= 8 ? digitos(i.supplier_cnpj).includes(qNums)
          : `${i.supplier_razao_social || ''} ${i.supplier_email || ''}`.toLowerCase().includes(qTrim.toLowerCase())))
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      const mostrarConvites = ['Todos', 'CONVITE'].includes(filterType)

      if (!supplierIdSet.size) { setResults([]); setPendingInvites(mostrarConvites ? pend : []); setLoading(false); return }

      // Busca dados dos fornecedores em lotes de 150 (URL segura)
      const allIds = [...supplierIdSet]
      let suppliers = []
      for (let i = 0; i < allIds.length; i += 150) {
        const batch = allIds.slice(i, i + 150)
        let bq = supabase.from('suppliers')
          .select('id, razao_social, cnpj, city, state, status, created_at, archived_at')
          .in('id', batch)
        if (!showInactive) { bq = bq.neq('status', 'INACTIVE'); bq = bq.is('archived_at', null) }
        if (qTrim) {
          if (qNums.length >= 8) bq = bq.ilike('cnpj', `%${qNums}%`)
          else bq = bq.ilike('razao_social', `%${qTrim}%`)
        }
        const { data } = await bq
        if (data) suppliers = suppliers.concat(data)
      }

      const sealMap   = buildSealMap(clientSeals)
      const clientMap = buildClientMap(clientSeals, clientInvites)

      let enriched = suppliers.map(s => ({
        ...s, seal: sealMap[s.id] || null, clients: clientMap[s.id] || [],
      }))
      if (filterType !== 'Todos')
        enriched = enriched.filter(s => sealStatusOf(s.seal) === filterType)

      // convite de CNPJ que já aparece como fornecedor não se repete
      const cnpjsListados = new Set(suppliers.map(x => digitos(x.cnpj)))
      setResults(enriched)
      setPendingInvites(mostrarConvites ? pend.filter(i => !cnpjsListados.has(digitos(i.supplier_cnpj))) : [])
      setLoading(false)
      return
    }

    // ── Fluxo B: busca por texto/CNPJ (sem filtro de cliente) ─────────────────
    // Via RPC admin_search_suppliers (patch_067): ilike não é leakproof e,
    // sob RLS, o planner não usa o índice trigram — a busca direta levava
    // ~12s (timeout) e a tela vinha vazia. SECURITY DEFINER: 3ms com índice.
    const { data: suppliers, error } = await supabase
      .rpc('admin_search_suppliers', { q: qTrim || '', show_inactive: !!showInactive })
    if (error) { console.error(error); setLoading(false); return }
    if (!suppliers?.length) { setResults([]); setLoading(false); return }

    // IDs limitados a 200 → URL segura para o IN clause
    const ids = suppliers.map(s => s.id)
    const [sealsRes, invitesRes] = await Promise.allSettled([
      supabase.from('seals')
        .select('supplier_id, level, status, score, issued_at, client_id, released_at, hoc_process_id')
        .in('supplier_id', ids),
      supabase.from('invitations')
        .select('supplier_id, client_id')
        .in('supplier_id', ids),
    ])

    const seals   = sealsRes.status   === 'fulfilled' ? (sealsRes.value.data   || []) : []
    const invites = invitesRes.status === 'fulfilled' ? (invitesRes.value.data || []) : []

    const sealMap   = buildSealMap(seals)
    const clientMap = buildClientMap(seals, invites)

    let enriched = suppliers.map(s => ({
      ...s, seal: sealMap[s.id] || null, clients: clientMap[s.id] || [],
    }))
    if (filterType !== 'Todos')
      enriched = enriched.filter(s => sealStatusOf(s.seal) === filterType)

    setResults(enriched)
    setLoading(false)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSearch()
  }

  return (
    <div style={{ padding:'28px 32px', maxWidth:1100, margin:'0 auto' }}>
      <PageHeader
        title="Análise de Processo"
        subtitle="Pesquisa geral de fornecedores cadastrados na plataforma"
      />

      {/* Painel de filtros */}
      <Card style={{ borderRadius:14, padding:'20px 24px', marginBottom:20 }}>
        <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginBottom:16 }}>
          <input
            ref={inputRef}
            value={q} onChange={e => setQ(e.target.value)} onKeyDown={handleKeyDown}
            placeholder="CNPJ ou Razão Social..."
            style={{ flex:1, minWidth:220, padding:'10px 14px', borderRadius:10, border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#1a1c5e', outline:'none' }}
          />
          {clients.length > 0 && (
            <ClientSearchCombo clients={[ELOS_PSEUDO_CLIENT, ...clients]} value={filterClient} onChange={setFilterClient}/>
          )}
          <Button variant="primary" onClick={handleSearch}>Pesquisar</Button>
        </div>

        <div style={{ display:'flex', gap:12, alignItems:'center', flexWrap:'wrap' }}>
          <div style={{ display:'flex', gap:6 }}>
            {['Todos','ACTIVE','PENDING','PAGAMENTO','SUSPENDED','CADASTRO', ...(filterClient && filterClient !== ELOS_PSEUDO_CLIENT.id ? ['CONVITE'] : [])].map(f => (
              <button key={f} onClick={() => setFilterType(f)}
                style={{ padding:'6px 12px', borderRadius:20, border:`1px solid ${filterType===f?SEAL_COLOR[f]||'#2E3192':'#e2e4ef'}`, background:filterType===f?`${SEAL_COLOR[f]||'#2E3192'}12`:'#fff', color:filterType===f?SEAL_COLOR[f]||'#2E3192':'#9B9B9B', fontFamily:'DM Sans,sans-serif', fontSize:12, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap' }}>
                {f === 'Todos' ? 'Todos' : SEAL_LABEL[f]}
              </button>
            ))}
          </div>
          <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'#64748b', fontFamily:'DM Sans,sans-serif', cursor:'pointer' }}>
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} style={{ cursor:'pointer' }}/>
            Mostrar inativos e arquivados
          </label>
        </div>
      </Card>

      {/* Resultados */}
      {loading && (
        <div style={{ display:'flex', justifyContent:'center', padding:60 }}><Spinner size={40}/></div>
      )}

      {!loading && searched && results.length === 0 && pendingInvites.length === 0 && (
        <EmptyState icon="🔍" title="Nenhum fornecedor encontrado" subtitle="Tente ajustar os filtros ou termos de busca"/>
      )}

      {!loading && pendingInvites.length > 0 && (
        <Card style={{ borderRadius:14, padding:'16px 20px', marginBottom:16, border:'1px solid rgba(99,102,241,.25)' }}>
          <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:13, color:'#4338ca', marginBottom:4 }}>
            ✉️ Convites aguardando cadastro ({pendingInvites.length})
          </div>
          <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:12, color:'#9B9B9B', marginBottom:10 }}>
            {results.length === 0 ? 'Este cliente ainda não tem fornecedores cadastrados — ' : ''}o processo começa quando o fornecedor conclui o cadastro pelo convite.
          </div>
          {pendingInvites.map(i => (
            <div key={i.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'9px 0', borderTop:'1px solid #f4f5f9' }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, fontWeight:700, color:'#1a1c5e' }}>{i.supplier_razao_social || '(razão social não informada)'}</div>
                <div style={{ fontSize:11.5, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>
                  {i.supplier_cnpj || 'CNPJ não informado'}{i.supplier_email ? ` · ${i.supplier_email}` : ''} · enviado em {String(i.created_at || '').slice(0,10).split('-').reverse().join('/')}
                </div>
              </div>
              <span style={{ fontSize:10, fontWeight:700, color: i.status === 'VIEWED' ? '#b45309' : '#4338ca', background: i.status === 'VIEWED' ? '#fef3c7' : 'rgba(99,102,241,.1)', padding:'3px 10px', borderRadius:20, whiteSpace:'nowrap' }}>
                {INVITE_LABEL[i.status] || i.status}
              </span>
            </div>
          ))}
        </Card>
      )}

      {!loading && !searched && (
        <div style={{ textAlign:'center', padding:'60px 0', color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', fontSize:14 }}>
          Use os filtros acima e clique em <strong>Pesquisar</strong> para localizar fornecedores.
        </div>
      )}

      {!loading && results.length > 0 && (
        <>
          <div style={{ fontSize:12, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', marginBottom:12 }}>
            {results.length} fornecedor{results.length !== 1 ? 'es' : ''} encontrado{results.length !== 1 ? 's' : ''}
            {results.length === 50 && !q.trim() && !filterClient && (
              <span style={{ marginLeft:8, color:'#f59e0b', fontWeight:600 }}>
                · Exibindo os 50 mais recentes — refine a busca para resultados específicos
              </span>
            )}
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {results.map((s, i) => {
              const sealStatus = sealStatusOf(s.seal)
              const sealColor  = SEAL_COLOR[sealStatus] || '#9B9B9B'
              const isInactive = s.status === 'INACTIVE'
              return (
                <Card key={i} hover style={{ borderRadius:14, padding:'16px 20px', opacity: isInactive ? 0.7 : 1 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:16 }}>
                    <div style={{ width:44, height:44, borderRadius:10, background:`${sealColor}18`, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:18, color:sealColor, flexShrink:0 }}>
                      {s.razao_social?.[0]}
                    </div>

                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:3 }}>
                        <span style={{ fontSize:14, fontWeight:700, color:'#1a1c5e', fontFamily:'Montserrat,sans-serif' }}>{s.razao_social}</span>
                        <span style={{ fontSize:10, fontWeight:700, color:sealColor, background:`${sealColor}18`, padding:'2px 8px', borderRadius:20 }}>
                          {SEAL_LABEL[sealStatus] || sealStatus}
                        </span>
                        {isInactive && (
                          <span style={{ fontSize:10, fontWeight:700, color:'#9B9B9B', background:'#f0f0f0', padding:'2px 8px', borderRadius:20 }}>Inativo</span>
                        )}
                      </div>

                      <div style={{ fontSize:12, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', marginBottom:4 }}>
                        {s.cnpj}{s.city && s.state ? ` · ${s.city}/${s.state}` : ''}
                        {s.seal?.issued_at ? ` · Homologado em ${s.seal.issued_at.slice(0,10)}` : ` · Cadastrado em ${s.created_at?.slice(0,10)||'—'}`}
                      </div>

                      {s.clients.length > 0 && (
                        <div style={{ fontSize:11.5, color:'#2E3192', fontFamily:'DM Sans,sans-serif', fontWeight:600, marginTop:3, lineHeight:1.4 }}
                          title={s.clients.join(' · ')}>
                          🏢 {s.clients.join(' · ')}
                        </div>
                      )}

                      {sealStatus === 'ACTIVE' && s.seal?.score != null && (
                        <div style={{ marginTop:6, maxWidth:160 }}>
                          <ScoreBar score={s.seal.score}/>
                        </div>
                      )}
                    </div>

                    <Button variant="primary" size="sm" onClick={() => navigate(`/backoffice/analise/${s.id}`)}>
                      Ver Processo →
                    </Button>
                  </div>
                </Card>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
