import { useState } from 'react'
import { Card, Button, ScoreBar } from '../../components/ui.jsx'
import { MultiChips, FilterPanel } from '../../components/FilterChips.jsx'
import { CartaExcecaoModal } from './DemoNewScreens.jsx'
import { DEMO_CLIENT_SUPPLIERS, DEMO_INTERESTED_SUPPLIERS } from './demoData.js'
import DemoBuyerMarketplace from './DemoBuyerMarketplace.jsx'

function TabBar({ tab, setTab }) {
  return (
    <div style={{ display:'flex', gap:8, marginBottom:20, borderBottom:'1px solid #e2e4ef', paddingBottom:0 }}>
      {TABS.map(t => (
        <button key={t.key} onClick={() => setTab(t.key)}
          style={{ padding:'10px 18px', border:'none', borderBottom: tab===t.key ? '2.5px solid #2E3192' : '2.5px solid transparent', background:'none', cursor:'pointer', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, color: tab===t.key ? '#2E3192' : '#9B9B9B' }}>
          {t.label}
        </button>
      ))}
    </div>
  )
}

const SEAL_COLOR = { ACTIVE:'#22c55e', PENDING:'#f59e0b', SUSPENDED:'#ef4444', EXPIRED:'#9B9B9B' }
const SEAL_LABEL = { ACTIVE:'Homologado', PENDING:'Em análise', SUSPENDED:'Suspenso', EXPIRED:'Expirado' }


// Aba "Fornecedores com intenção" — convite reverso (fornecedores ELOS que
// declararam interesse em fornecer para este cliente)
function InterestedTab({ navigate }) {
  const [list, setList] = useState(DEMO_INTERESTED_SUPPLIERS)
  return (
    <div>
      <div style={{ background:'#fff7ed', border:'1px solid rgba(244,126,47,.35)', borderRadius:12, padding:'12px 18px', marginBottom:18, fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#9a5b1f' }}>
        🤝 Fornecedores já verificados no ELOS que <strong>declararam interesse em fornecer para sua empresa</strong>. Convide-os direto para a homologação.
      </div>
      {list.length === 0 ? (
        <Card style={{ borderRadius:14, padding:40, textAlign:'center', fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#9B9B9B' }}>
          Nenhum interessado no momento.
        </Card>
      ) : list.map(s => (
        <Card key={s.id} style={{ borderRadius:14, padding:'16px 22px', marginBottom:10, display:'flex', alignItems:'center', gap:14, flexWrap:'wrap' }}>
          <div style={{ width:42, height:42, borderRadius:11, background:'#fff7ed', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:13, color:'#F47E2F', flexShrink:0 }}>
            {s.razao_social.split(' ').map(w=>w[0]).slice(0,2).join('')}
          </div>
          <div style={{ flex:1, minWidth:200 }}>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, color:'#1a1c5e' }}>{s.razao_social}</div>
            <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:11, color:'#9B9B9B' }}>{s.cidade} · {s.categoria} · interesse em {s.desde}</div>
          </div>
          <div style={{ textAlign:'center' }}>
            <span style={{ fontSize:10, fontWeight:700, fontFamily:'Montserrat,sans-serif', color:'#15803d', background:'#dcfce7', padding:'3px 10px', borderRadius:20 }}>{s.selo}</span>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:13, color: s.score>=90?'#22c55e':'#f59e0b', marginTop:4 }}>{s.score}/100</div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <Button variant="neutral" size="sm" onClick={() => navigate('processo')}>👁 Ficha</Button>
            <Button variant="primary" size="sm" onClick={() => navigate('convites')}>✉️ Enviar Convite</Button>
            <button onClick={() => setList(p => p.filter(x => x.id !== s.id))} title="Remover da lista"
              style={{ background:'none', border:'none', cursor:'pointer', fontSize:14, color:'#9B9B9B' }}>🗑</button>
          </div>
        </Card>
      ))}
    </div>
  )
}

const TABS = [
  { key:'meus',         label:'🏭 Meus Fornecedores' },
  { key:'todos',        label:'🔍 Todos os Fornecedores' },
  { key:'interessados', label:'🤝 Com intenção' },
]

export default function DemoClientFornecedores({ navigate }) {
  const [tab, setTab] = useState('meus')
  const [carta, setCarta] = useState(null)   // fornecedor da carta de exceção (modal)
  const [q, setQ] = useState('')
  // filtros de múltipla escolha — mesmo componente da produção (01/10)
  const [fSit, setFSit] = useState([])
  const [fNivel, setFNivel] = useState([])
  const [fCust, setFCust] = useState([])
  const [fDest, setFDest] = useState([])
  const [prioPedida, setPrioPedida] = useState({})   // ⚡ Priorizar (produção: 03/10)
  const [aviso, setAviso] = useState('')

  if (tab !== 'meus') {
    return (
      <div>
        <div style={{ padding:'20px 32px 0', maxWidth:1100, margin:'0 auto' }}>
          <TabBar tab={tab} setTab={setTab}/>
        </div>
        {tab === 'todos'
          ? <DemoBuyerMarketplace navigate={navigate}/>
          : <div style={{ padding:'8px 32px 28px', maxWidth:1100, margin:'0 auto' }}><InterestedTab navigate={navigate}/></div>
        }
      </div>
    )
  }

  const prio = (s) => s.prioridade || prioPedida[s.id]
  const list = DEMO_CLIENT_SUPPLIERS.filter(s => {
    if (q && !s.razao_social.toLowerCase().includes(q.toLowerCase())) return false
    if (fSit.length && !fSit.includes(s.sealStatus)) return false
    if (fNivel.length && !fNivel.includes(s.nivel)) return false
    if (fCust.length && !fCust.includes(s.subsidiado ? 'sim' : 'nao')) return false
    if (fDest.includes('prio') && !(s.sealStatus === 'PENDING' && prio(s))) return false
    if (fDest.includes('carta') && !s.carta) return false
    return true
  })
  const conta = (fn) => DEMO_CLIENT_SUPPLIERS.filter(fn).length
  const niveis = [...new Set(DEMO_CLIENT_SUPPLIERS.map(s => s.nivel).filter(Boolean))].sort()
  const filtrosAtivos = !!q || fSit.length + fNivel.length + fCust.length + fDest.length > 0
  const limpar = () => { setQ(''); setFSit([]); setFNivel([]); setFCust([]); setFDest([]) }
  const priorizar = (s) => { setPrioPedida(p => ({ ...p, [s.id]: true })); setAviso(`⚡ Prioridade pedida para ${s.razao_social} — a EQPI analisa este processo primeiro.`); setTimeout(() => setAviso(''), 3500) }

  return (
    <div style={{ padding:'20px 32px 28px', maxWidth:1100, margin:'0 auto' }}>
      <TabBar tab={tab} setTab={setTab}/>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:24, flexWrap:'wrap', gap:12 }}>
        <div>
          <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:22, color:'#1a1c5e' }}>Meus Fornecedores</div>
          <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#9B9B9B', marginTop:2 }}>
            {DEMO_CLIENT_SUPPLIERS.length} fornecedores · {DEMO_CLIENT_SUPPLIERS.filter(s=>s.sealStatus==='ACTIVE').length} homologados
          </div>
        </div>
        <Button variant="primary" onClick={() => navigate('convites')}>+ Convidar Fornecedor</Button>
      </div>

      {/* Filtros (múltipla escolha) + busca */}
      <FilterPanel total={DEMO_CLIENT_SUPPLIERS.length} shown={list.length} active={filtrosAtivos} onClear={limpar}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nome..." style={{ padding:'8px 12px', borderRadius:8, border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#1a1c5e', outline:'none', width:240 }}/>
        <MultiChips label="Situação" value={fSit} onChange={setFSit}
          options={[['ACTIVE','Homologado','#15803d'],['PENDING','Em análise','#b45309'],['SUSPENDED','Suspenso','#dc2626']].map(([v,l,c]) => ({ value:v, label:l, color:c, count: conta(s => s.sealStatus === v) })).filter(o => o.count > 0)}/>
        <MultiChips label="Nível" value={fNivel} onChange={setFNivel}
          options={niveis.map(v => ({ value:v, label:v, count: conta(s => s.nivel === v) }))}/>
        <MultiChips label="Custeio" single value={fCust} onChange={setFCust}
          options={[{ value:'sim', label:'💰 Subsidiado', count: conta(s => s.subsidiado) }, { value:'nao', label:'Pago pelo fornecedor', count: conta(s => !s.subsidiado) }]}/>
        <MultiChips label="Destaques" value={fDest} onChange={setFDest}
          options={[{ value:'prio', label:'⚡ Prioritários', color:'#b45309', count: conta(s => s.sealStatus === 'PENDING' && prio(s)) }, { value:'carta', label:'📜 Com carta de exceção', color:'#b45309', count: conta(s => s.carta) }].filter(o => o.count > 0)}/>
      </FilterPanel>
      {aviso && <div style={{ background:'#fef3c7', border:'1px solid #fcd34d', borderRadius:10, padding:'10px 14px', marginBottom:12, fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#92400e' }}>{aviso}</div>}

      {/* Lista */}
      <Card style={{ borderRadius:16, padding:'8px 0' }}>
        {/* Header da tabela */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 160px 120px 100px 170px', gap:12, padding:'10px 20px', borderBottom:'1px solid #f3f4f6' }}>
          {['Fornecedor','Localidade','Status','Score',''].map(h => (
            <div key={h} style={{ fontSize:10, fontWeight:700, color:'#9B9B9B', fontFamily:'Montserrat,sans-serif', textTransform:'uppercase', letterSpacing:.5 }}>{h}</div>
          ))}
        </div>

        {list.length === 0 ? (
          <div style={{ padding:'40px 20px', textAlign:'center', color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', fontSize:14 }}>
            Nenhum fornecedor encontrado para este filtro.
          </div>
        ) : list.map((s, i) => {
          const sc = SEAL_COLOR[s.sealStatus] || '#9B9B9B'
          const sl = SEAL_LABEL[s.sealStatus] || s.sealStatus
          return (
            <div key={s.id} style={{ display:'grid', gridTemplateColumns:'1fr 160px 120px 100px 170px', gap:12, padding:'14px 20px', borderBottom: i < list.length-1 ? '1px solid #f9fafb' : 'none', alignItems:'center', cursor:'pointer', transition:'background .12s' }}
              onMouseOver={e => e.currentTarget.style.background='#f8faff'}
              onMouseOut={e  => e.currentTarget.style.background='#fff'}
              onClick={() => navigate('processo')}>
              {/* Nome */}
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ width:38, height:38, borderRadius:10, background:'#EEF0FF', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:13, color:'#2E3192', flexShrink:0 }}>
                  {s.initials}
                </div>
                <div>
                  <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, color:'#1a1c5e' }}>{s.razao_social}</div>
                  <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginTop:2 }}>
                    {s.nivel && <span style={{ fontSize:9, background:'rgba(46,49,146,.08)', color:'#2E3192', borderRadius:20, padding:'1px 6px', fontFamily:'Montserrat,sans-serif', fontWeight:700 }}>{s.nivel}</span>}
                    {s.subsidiado && <span style={{ fontSize:9, background:'#d1fae5', color:'#065f46', borderRadius:20, padding:'1px 6px', fontFamily:'Montserrat,sans-serif', fontWeight:700 }}>SUBSIDIADO</span>}
                    {s.carta && <span style={{ fontSize:9, background:'#fff7ed', color:'#c2410c', borderRadius:20, padding:'1px 6px', fontFamily:'Montserrat,sans-serif', fontWeight:700 }}>📜 CARTA VIGENTE</span>}
                    {s.sealStatus === 'PENDING' && prio(s) && <span style={{ fontSize:9, background:'#fef3c7', color:'#b45309', borderRadius:20, padding:'1px 6px', fontFamily:'Montserrat,sans-serif', fontWeight:700 }}>⚡ PRIORITÁRIO</span>}
                  </div>
                </div>
              </div>
              {/* Localidade */}
              <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:12, color:'#9B9B9B' }}>{s.city} / {s.state}</div>
              {/* Status */}
              <div>
                <span style={{ fontSize:11, fontWeight:700, color:sc, background:`${sc}15`, padding:'3px 10px', borderRadius:20, fontFamily:'Montserrat,sans-serif' }}>{sl}</span>
              </div>
              {/* Score */}
              <div>
                {s.score ? (
                  <div>
                    <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:14, color:s.score>=90?'#22c55e':s.score>=70?'#f59e0b':'#ef4444' }}>{s.score}</div>
                    <ScoreBar score={s.score}/>
                  </div>
                ) : (
                  <span style={{ fontSize:11, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>—</span>
                )}
              </div>
              {/* Ação */}
              {s.sealStatus === 'PENDING' ? (
                <div style={{ display:'flex', gap:6, justifyContent:'flex-end' }}>
                  {!prio(s) && (
                    <button onClick={e => { e.stopPropagation(); priorizar(s) }}
                      title="Pedir à EQPI que analise este processo primeiro"
                      style={{ padding:'5px 10px', borderRadius:8, background:'#fef3c7', color:'#b45309', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:11, border:'none', cursor:'pointer', whiteSpace:'nowrap' }}>
                      ⚡ Priorizar
                    </button>
                  )}
                  <button onClick={e => { e.stopPropagation(); setCarta(s.razao_social) }}
                    title="Aprovar com pendência mediante carta assinada pelo cliente"
                    style={{ padding:'5px 10px', borderRadius:8, background:'#fff7ed', color:'#c2410c', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:11, border:'none', cursor:'pointer', whiteSpace:'nowrap' }}>
                    📜 Carta
                  </button>
                </div>
              ) : (
                <button style={{ padding:'5px 12px', borderRadius:8, background:'#EEF0FF', color:'#2E3192', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:11, border:'none', cursor:'pointer', whiteSpace:'nowrap' }}>
                  Ver →
                </button>
              )}
            </div>
          )
        })}
      </Card>
      {carta && <CartaExcecaoModal fornecedor={carta} onClose={() => setCarta(null)}/>}
    </div>
  )
}
