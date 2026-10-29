// Demo · Cliente › Fornecedores — espelha src/pages/client/Suppliers.jsx:
// abas Meus Fornecedores · Todos os Fornecedores · 💡 Interessados ·
// 📝 Pré-cadastros (src/pages/client/PreRegistrations.jsx), filtros de
// múltipla escolha e "⬇ Exportar Excel" (planilha real com as linhas filtradas).
import { useState } from 'react'
import { Card, Button, ScoreBar, EmptyState } from '../../components/ui.jsx'
import { MultiChips, FilterPanel } from '../../components/FilterChips.jsx'
import { CartaExcecaoModal } from './DemoNewScreens.jsx'
import { InviteModal } from './DemoClientDashboard.jsx'
import { DEMO_CLIENT_SUPPLIERS, DEMO_INTERESTED_SUPPLIERS, DEMO_PRE_REGISTRATIONS, DEMO_QUESTIONNAIRES, fmtBR } from './demoData.js'
import { useToast, exportRows, InlineConfirm, DemoWatchButton } from './DemoFichaKit.jsx'
import DemoBuyerMarketplace from './DemoBuyerMarketplace.jsx'

const SEAL_COLOR = { ACTIVE:'#22c55e', PENDING:'#f59e0b', SUSPENDED:'#ef4444', EXPIRED:'#9B9B9B' }
const SEAL_LABEL = { ACTIVE:'Homologado', PENDING:'Em análise', SUSPENDED:'Suspenso', EXPIRED:'Expirado' }

function TabBar({ tab, setTab, total }) {
  const tabs = [['meus', `Meus Fornecedores (${total})`], ['todos', 'Todos os Fornecedores'], ['interessados', '💡 Interessados'], ['pre', '📝 Pré-cadastros']]
  return (
    <div style={{ display:'flex', gap:0, borderBottom:'2px solid #e2e4ef', marginBottom:24, flexWrap:'wrap' }}>
      {tabs.map(([k, l]) => (
        <button key={k} onClick={() => setTab(k)}
          style={{ padding:'10px 22px', background:'none', border:'none', borderBottom:`3px solid ${tab===k?'#2E3192':'transparent'}`, color:tab===k?'#2E3192':'#9B9B9B', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, cursor:'pointer', marginBottom:-2 }}>
          {l}
        </button>
      ))}
    </div>
  )
}

// ── 💡 Interessados (convite reverso) ──────────────────────────────────────
function InterestedTab({ navigate, onInvite }) {
  const [list, setList] = useState(DEMO_INTERESTED_SUPPLIERS)
  return (
    <div>
      <div style={{ background:'#fff7ed', border:'1px solid rgba(244,126,47,.35)', borderRadius:12, padding:'12px 18px', marginBottom:18, fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#9a5b1f' }}>
        💡 Fornecedores já verificados no ELOS que <strong>declararam intenção de prestar serviços para sua empresa</strong>. Convide-os direto para a homologação.
      </div>
      {list.length === 0 ? (
        <EmptyState icon="💡" title="Nenhum interessado no momento" subtitle="Quando um fornecedor declarar intenção, ele aparece aqui."/>
      ) : list.map(s => (
        <Card key={s.id} style={{ borderRadius:14, padding:'16px 22px', marginBottom:10, display:'flex', alignItems:'center', gap:14, flexWrap:'wrap' }}>
          <div style={{ width:42, height:42, borderRadius:11, background:'#fff7ed', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:13, color:'#F47E2F', flexShrink:0 }}>
            {s.razao_social.split(' ').map(w=>w[0]).slice(0,2).join('')}
          </div>
          <div style={{ flex:1, minWidth:200 }}>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, color:'#1a1c5e' }}>{s.razao_social}</div>
            <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:11, color:'#9B9B9B' }}>{s.cnpj} · {s.cidade} · {s.categoria} · intenção em {s.desde}</div>
            {s.msg && <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:12, color:'#64748b', marginTop:3, fontStyle:'italic' }}>"{s.msg}"</div>}
          </div>
          <div style={{ textAlign:'center' }}>
            <span style={{ fontSize:10, fontWeight:700, fontFamily:'Montserrat,sans-serif', color:'#15803d', background:'#dcfce7', padding:'3px 10px', borderRadius:20 }}>{s.selo}</span>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:13, color: s.score>=90?'#22c55e':'#f59e0b', marginTop:4 }}>{s.score}/100</div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <Button variant="neutral" size="sm" onClick={() => navigate('perfil_fornecedor', { supplier: { razao_social:s.razao_social, cnpj:s.cnpj, city:s.cidade.split('/')[0], state:s.cidade.split('/')[1] }, tab:'interessados' })}>👁 Ficha</Button>
            <Button variant="primary" size="sm" onClick={() => onInvite({ razao_social:s.razao_social, cnpj:s.cnpj })}>✉️ Enviar Convite</Button>
            <button onClick={() => setList(p => p.filter(x => x.id !== s.id))} title="Remover da lista"
              style={{ background:'none', border:'none', cursor:'pointer', fontSize:14, color:'#9B9B9B' }}>🗑</button>
          </div>
        </Card>
      ))}
    </div>
  )
}

// ── 📝 Pré-cadastros feitos pelo portal ────────────────────────────────────
const FILTROS = [['ACTIVE', 'Ativos'], ['ARCHIVED', 'Arquivados'], ['todos', 'Todos']]
const PERGUNTAS = DEMO_QUESTIONNAIRES[0].questions
function PreRegistrationsTab({ navigate, onInvite, toast }) {
  const [status, setStatus] = useState('ACTIVE')
  const [rows, setRows] = useState(DEMO_PRE_REGISTRATIONS)
  const [aberto, setAberto] = useState(null)
  const [arquivar, setArquivar] = useState(null)
  const lista = rows.filter(r => status === 'todos' || r.status === status)
  const mudar = (row, novo) => {
    setRows(p => p.map(r => r.id === row.id ? { ...r, status: novo } : r)); setArquivar(null)
    toast(novo === 'ARCHIVED' ? `✅ Pré-cadastro de ${row.razao_social} arquivado — continua em "Arquivados".` : `✅ Pré-cadastro de ${row.razao_social} reativado.`)
  }
  return (
    <>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16, flexWrap:'wrap' }}>
        <div style={{ fontSize:13, color:'#64748b', fontFamily:'DM Sans,sans-serif', flex:1, minWidth:240 }}>
          Empresas que se cadastraram pelo seu portal sem iniciar a homologação. Veja o cadastro e o questionário, convide para a homologação ou arquive.
        </div>
        <div style={{ display:'flex', gap:6 }}>
          {FILTROS.map(([v, l]) => (
            <button key={v} onClick={() => setStatus(v)}
              style={{ padding:'6px 14px', borderRadius:20, border:`1.5px solid ${status===v?'#2E3192':'#e2e4ef'}`, background:status===v?'rgba(46,49,146,.08)':'#fff', color:status===v?'#2E3192':'#64748b', fontFamily:'DM Sans,sans-serif', fontSize:12.5, fontWeight:status===v?700:500, cursor:'pointer' }}>
              {l}
            </button>
          ))}
        </div>
      </div>
      {lista.length === 0 && (
        <EmptyState icon="📝" title={status === 'ARCHIVED' ? 'Nenhum pré-cadastro arquivado' : 'Nenhum pré-cadastro'}
          subtitle="Quem entra pelo seu portal pode fazer um pré-cadastro sem custo — as empresas aparecem aqui."/>
      )}
      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        {lista.map(row => {
          const resp = Object.keys(row.answers).length
          return (
            <Card key={row.id} style={{ borderRadius:14, padding:'16px 20px', opacity: row.status === 'ARCHIVED' ? .75 : 1 }}>
              <div style={{ display:'flex', alignItems:'flex-start', gap:14, flexWrap:'wrap' }}>
                <div style={{ width:44, height:44, borderRadius:10, background:'rgba(46,49,146,.08)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:17, color:'#2E3192', flexShrink:0 }}>{row.razao_social[0]}</div>
                <div style={{ flex:1, minWidth:220 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                    <span style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:14, color:'#1a1c5e' }}>{row.razao_social}</span>
                    {row.in_process && <span style={{ fontSize:9.5, fontWeight:700, color:'#15803d', background:'#dcfce7', padding:'2px 8px', borderRadius:20 }}>EM HOMOLOGAÇÃO</span>}
                    {!row.in_process && row.invited && <span style={{ fontSize:9.5, fontWeight:700, color:'#1d4ed8', background:'#dbeafe', padding:'2px 8px', borderRadius:20 }}>CONVIDADO</span>}
                    {row.status === 'ARCHIVED' && <span style={{ fontSize:9.5, fontWeight:700, color:'#64748b', background:'#f1f5f9', padding:'2px 8px', borderRadius:20 }}>ARQUIVADO</span>}
                  </div>
                  <div style={{ fontSize:12, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', marginTop:2 }}>
                    {row.cnpj} · {row.city}/{row.state} · Pré-cadastro em {fmtBR(row.created)}
                  </div>
                  <div style={{ fontSize:12, color:'#64748b', fontFamily:'DM Sans,sans-serif', marginTop:2 }}>CNAE principal: {row.cnae}</div>
                  <button onClick={() => setAberto(aberto === row.id ? null : row.id)}
                    style={{ marginTop:8, background:'none', border:'none', padding:0, cursor:'pointer', fontSize:12.5, fontWeight:700, fontFamily:'DM Sans,sans-serif',
                      color: resp >= PERGUNTAS.length ? '#15803d' : resp > 0 ? '#b45309' : '#9B9B9B' }}>
                    ❓ Questionário: {resp} de {PERGUNTAS.length} respondidas {aberto === row.id ? '▴' : '▾'}
                  </button>
                </div>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap', justifyContent:'flex-end' }}>
                  <Button variant="neutral" size="sm" onClick={() => navigate('perfil_fornecedor', { supplier: { razao_social:row.razao_social, cnpj:row.cnpj, city:row.city, state:row.state, email:row.email, telefone:row.telefone, contato:row.contato }, tab:'pre' })}>👁 Ficha</Button>
                  {!row.in_process && <Button variant="primary" size="sm" onClick={() => onInvite({ razao_social:row.razao_social, cnpj:row.cnpj, email:row.email, contato:row.contato, telefone:row.telefone })}>📨 {row.invited ? 'Convidar de novo' : 'Enviar Convite'}</Button>}
                  {row.status === 'ARCHIVED'
                    ? <Button variant="neutral" size="sm" onClick={() => mudar(row, 'ACTIVE')}>↩ Reativar</Button>
                    : <Button variant="danger" size="sm" onClick={() => setArquivar(row.id)}>🗄 Arquivar</Button>}
                </div>
              </div>
              {arquivar === row.id && (
                <InlineConfirm msg={`Arquivar o pré-cadastro de ${row.razao_social}? Ele sai da lista inicial, mas continua em "Arquivados".`}
                  confirmLabel="🗄 Arquivar" variant="danger" onCancel={() => setArquivar(null)} onConfirm={() => mudar(row, 'ARCHIVED')}/>
              )}
              {aberto === row.id && (
                <div style={{ marginTop:14, borderTop:'1px solid #eef0f6', paddingTop:12 }}>
                  {PERGUNTAS.map((q, i) => (
                    <div key={q.id} style={{ display:'flex', gap:10, padding:'6px 0', borderBottom: i < PERGUNTAS.length - 1 ? '1px dashed #eef0f6' : 'none', fontSize:12.5, fontFamily:'DM Sans,sans-serif' }}>
                      <span style={{ flex:1, color:'#374151' }}>{q.text}{q.required && <span style={{ color:'#dc2626' }}> *</span>}</span>
                      <span style={{ flex:1, fontWeight:600, color: row.answers[q.id] ? '#1a1c5e' : '#cbd5e1' }}>{row.answers[q.id] || 'sem resposta'}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )
        })}
      </div>
    </>
  )
}

export default function DemoClientFornecedores({ navigate, initialTab }) {
  const [tab, setTab] = useState(initialTab || 'meus')
  const [carta, setCarta] = useState(null)   // fornecedor da carta de exceção (modal)
  const [convidar, setConvidar] = useState(null)   // prefill do convite
  const [q, setQ] = useState('')
  const [fSit, setFSit] = useState([])
  const [fNivel, setFNivel] = useState([])
  const [fCust, setFCust] = useState([])
  const [fDest, setFDest] = useState([])
  const [prioPedida, setPrioPedida] = useState({})   // ⚡ Priorizar
  const [, setToast, ToastEl] = useToast()
  const all = DEMO_CLIENT_SUPPLIERS

  const header = (
    <div style={{ marginBottom:16 }}>
      <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:22, color:'#1a1c5e' }}>Fornecedores</div>
      <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#9B9B9B', marginTop:2 }}>{all.length} vinculados ao seu processo</div>
    </div>
  )
  const modal = convidar && <InviteModal prefill={convidar} onClose={() => setConvidar(null)} onSent={(f) => setToast(`✅ Convite enviado para ${f.razao_social}.`)}/>

  if (tab === 'todos') {
    return (
      <div>
        {ToastEl}
        <div style={{ padding:'20px 32px 0', maxWidth:1100, margin:'0 auto' }}>{header}<TabBar tab={tab} setTab={setTab} total={all.length}/></div>
        <DemoBuyerMarketplace navigate={navigate} mode="CLIENT"/>
      </div>
    )
  }
  if (tab === 'interessados' || tab === 'pre') {
    return (
      <div style={{ padding:'20px 32px 28px', maxWidth:1100, margin:'0 auto' }}>
        {ToastEl}{header}<TabBar tab={tab} setTab={setTab} total={all.length}/>
        {tab === 'interessados'
          ? <InterestedTab navigate={navigate} onInvite={setConvidar}/>
          : <PreRegistrationsTab navigate={navigate} onInvite={setConvidar} toast={setToast}/>}
        {modal}
      </div>
    )
  }

  const prio = (s) => s.prioridade || prioPedida[s.id]
  const venceEm60 = (s) => s.sealStatus === 'ACTIVE' && s.expiresAt && (new Date(s.expiresAt) - new Date()) / 864e5 <= 60
  const list = all.filter(s => {
    // a busca também acha pela categoria do fornecedor (como na tela real)
    const ql = q.toLowerCase()
    if (q && !s.razao_social.toLowerCase().includes(ql) && !s.cnpj.replace(/\D/g, '').includes(q.replace(/\D/g, '') || '§')
      && !(s.categorias || []).some(c => c.nome.toLowerCase().includes(ql))) return false
    if (fSit.length && !fSit.includes(s.sealStatus)) return false
    if (fNivel.length && !fNivel.includes(s.nivel)) return false
    if (fCust.length && !fCust.includes(s.subsidiado ? 'sim' : 'nao')) return false
    if (fDest.includes('prio') && !(s.sealStatus === 'PENDING' && prio(s))) return false
    if (fDest.includes('carta') && !s.carta) return false
    if (fDest.includes('vence') && !venceEm60(s)) return false
    return true
  })
  const conta = (fn) => all.filter(fn).length
  const niveis = [...new Set(all.map(s => s.nivel).filter(Boolean))].sort()
  const filtrosAtivos = !!q || fSit.length + fNivel.length + fCust.length + fDest.length > 0
  const limpar = () => { setQ(''); setFSit([]); setFNivel([]); setFCust([]); setFDest([]) }
  const priorizar = (s) => { setPrioPedida(p => ({ ...p, [s.id]: true })); setToast(`✅ Prioridade pedida para ${s.razao_social} — a EQPI analisa este processo primeiro.`) }
  const abrir = (s) => s.id === 1 ? navigate('processo') : setToast('ℹ️ Na demonstração, a ficha completa do processo é a da Primatus Serviços Técnicos.')
  const exportar = () => exportRows('fornecedores', 'Meus fornecedores', list.map(s => ({
    'Razão social': s.razao_social, 'CNPJ': s.cnpj, 'Situação': SEAL_LABEL[s.sealStatus] || s.sealStatus,
    'Nível': s.nivel, 'Custeio': s.subsidiado ? 'Subsidiado' : 'Pago pelo fornecedor',
    'Homologado em': s.sealStatus === 'ACTIVE' ? fmtBR(s.issuedAt) : '', 'Validade': s.expiresAt ? fmtBR(s.expiresAt) : '',
    'Convidado em': fmtBR(s.invitedAt), 'Cidade': s.city, 'UF': s.state, 'Escopo': s.escopo || '', 'Tipo': s.tipo || '',
    'Categorias': (s.categorias || []).filter(c => !c.reprovada).map(c => c.nome).join('; '),
    'Categorias reprovadas (CNAE)': (s.categorias || []).filter(c => c.reprovada).map(c => c.nome).join('; '),
    'Carta de exceção': s.carta ? 'Sim' : '', 'Análise prioritária': s.sealStatus === 'PENDING' && prio(s) ? 'Sim' : '',
  })), setToast)
  const certificado = (s) => navigate('certificado', { cert: {
    razao: s.razao_social, cnpj: s.cnpj, cats: (s.categorias || []).filter(c => !c.reprovada).map(c => c.nome),
    issued: s.issuedAt, expires: s.expiresAt, excecao: !!s.carta, back: 'fornecedores',
  } })

  return (
    <div style={{ padding:'20px 32px 28px', maxWidth:1100, margin:'0 auto' }}>
      {ToastEl}
      {header}
      <TabBar tab={tab} setTab={setTab} total={all.length}/>

      <FilterPanel total={all.length} shown={list.length} active={filtrosAtivos} onClear={limpar}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nome, CNPJ ou categoria..." style={{ padding:'8px 12px', borderRadius:8, border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#1a1c5e', outline:'none', width:'100%', boxSizing:'border-box' }}/>
        <MultiChips label="Situação" value={fSit} onChange={setFSit}
          options={[['ACTIVE','Homologado','#15803d'],['PENDING','Em análise','#b45309'],['SUSPENDED','Suspenso','#dc2626']].map(([v,l,c]) => ({ value:v, label:l, color:c, count: conta(s => s.sealStatus === v) })).filter(o => o.count > 0)}/>
        <MultiChips label="Nível" value={fNivel} onChange={setFNivel}
          options={niveis.map(v => ({ value:v, label:v, count: conta(s => s.nivel === v) }))}/>
        <MultiChips label="Custeio" single value={fCust} onChange={setFCust}
          options={[{ value:'sim', label:'💰 Subsidiado', count: conta(s => s.subsidiado) }, { value:'nao', label:'Pago pelo fornecedor', count: conta(s => !s.subsidiado) }]}/>
        <MultiChips label="Destaques" value={fDest} onChange={setFDest}
          options={[{ value:'prio', label:'⚡ Prioritários', color:'#b45309', count: conta(s => s.sealStatus === 'PENDING' && prio(s)) }, { value:'carta', label:'📜 Com carta de exceção', color:'#b45309', count: conta(s => s.carta) }, { value:'vence', label:'⏰ Vence em até 60 dias', color:'#dc2626', count: conta(venceEm60) }].filter(o => o.count > 0)}/>
      </FilterPanel>

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', margin:'-4px 0 12px', gap:10, flexWrap:'wrap' }}>
        <Button variant="primary" size="sm" onClick={() => setConvidar({})}>+ Convidar Fornecedor</Button>
        {list.length > 0 && (
          <Button variant="neutral" size="sm" onClick={exportar} title="Exporta a lista com os filtros aplicados">⬇ Exportar Excel ({list.length})</Button>
        )}
      </div>

      <Card style={{ borderRadius:16, padding:'8px 0' }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 150px 110px 90px 190px', gap:12, padding:'10px 20px', borderBottom:'1px solid #f3f4f6' }}>
          {['Fornecedor','Localidade','Status','Score',''].map(h => (
            <div key={h} style={{ fontSize:10, fontWeight:700, color:'#9B9B9B', fontFamily:'Montserrat,sans-serif', textTransform:'uppercase', letterSpacing:.5 }}>{h}</div>
          ))}
        </div>
        {list.length === 0 ? (
          <div style={{ padding:'40px 20px', textAlign:'center', color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', fontSize:14 }}>Nenhum fornecedor encontrado — ajuste os filtros.</div>
        ) : list.map((s, i) => {
          const sc = SEAL_COLOR[s.sealStatus] || '#9B9B9B'
          return (
            <div key={s.id} style={{ display:'grid', gridTemplateColumns:'1fr 150px 110px 90px 190px', gap:12, padding:'14px 20px', borderBottom: i < list.length-1 ? '1px solid #f9fafb' : 'none', alignItems:'center', cursor:'pointer', transition:'background .12s' }}
              onMouseOver={e => e.currentTarget.style.background='#f8faff'}
              onMouseOut={e  => e.currentTarget.style.background='#fff'}
              onClick={() => abrir(s)}>
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ width:38, height:38, borderRadius:10, background:'#EEF0FF', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:13, color:'#2E3192', flexShrink:0 }}>{s.initials}</div>
                <div>
                  <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, color:'#1a1c5e' }}>{s.razao_social}</div>
                  <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:10.5, color:'#9B9B9B' }}>{s.cnpj}</div>
                  <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginTop:2 }}>
                    {s.nivel && <span style={{ fontSize:9, background:'rgba(46,49,146,.08)', color:'#2E3192', borderRadius:20, padding:'1px 6px', fontFamily:'Montserrat,sans-serif', fontWeight:700 }}>{s.nivel}</span>}
                    {s.subsidiado && <span style={{ fontSize:9, background:'#d1fae5', color:'#065f46', borderRadius:20, padding:'1px 6px', fontFamily:'Montserrat,sans-serif', fontWeight:700 }}>SUBSIDIADO</span>}
                    {s.carta && <span style={{ fontSize:9, background:'#fff7ed', color:'#c2410c', borderRadius:20, padding:'1px 6px', fontFamily:'Montserrat,sans-serif', fontWeight:700 }}>📜 CARTA VIGENTE</span>}
                    {s.sealStatus === 'PENDING' && prio(s) && <span style={{ fontSize:9, background:'#fef3c7', color:'#b45309', borderRadius:20, padding:'1px 6px', fontFamily:'Montserrat,sans-serif', fontWeight:700 }}>⚡ PRIORITÁRIO</span>}
                    {venceEm60(s) && <span style={{ fontSize:9, background:'#fee2e2', color:'#dc2626', borderRadius:20, padding:'1px 6px', fontFamily:'Montserrat,sans-serif', fontWeight:700 }}>⏰ VENCE {fmtBR(s.expiresAt)}</span>}
                  </div>
                  {/* categorias do fornecedor neste cliente (máx. 4 + "+N"; reprovada pelo CNAE em vermelho) */}
                  {s.categorias?.length > 0 && (
                    <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginTop:4 }}>
                      {s.categorias.slice(0, 4).map(c => (
                        <span key={c.nome} title={c.reprovada ? 'Reprovada no processo — a atividade (CNAE) não cobre a categoria' : ''}
                          style={{ fontSize:10, fontFamily:'DM Sans,sans-serif', padding:'2px 8px', borderRadius:20,
                            background: c.reprovada ? '#fee2e2' : '#f1f5f9', color: c.reprovada ? '#b91c1c' : '#475569' }}>
                          {c.reprovada ? '✕ ' : ''}{c.nome}
                        </span>
                      ))}
                      {s.categorias.length > 4 && (
                        <span title={s.categorias.slice(4).map(c => c.nome).join(', ')}
                          style={{ fontSize:10, fontFamily:'DM Sans,sans-serif', padding:'2px 8px', borderRadius:20, background:'#f1f5f9', color:'#475569' }}>
                          +{s.categorias.length - 4}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:12, color:'#9B9B9B' }}>{s.city} / {s.state}</div>
              <div><span style={{ fontSize:11, fontWeight:700, color:sc, background:`${sc}15`, padding:'3px 10px', borderRadius:20, fontFamily:'Montserrat,sans-serif' }}>{SEAL_LABEL[s.sealStatus] || s.sealStatus}</span></div>
              <div>
                {s.score ? (
                  <div title={s.sealStatus === 'PENDING' ? 'Score do processo (documentos exigidos por você)' : 'Score do processo'}>
                    <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:14, color:s.score>=90?'#22c55e':s.score>=70?'#f59e0b':'#ef4444' }}>{s.score}</div>
                    <ScoreBar score={s.score}/>
                  </div>
                ) : <span style={{ fontSize:11, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>—</span>}
              </div>
              <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:6 }}>
              {s.sealStatus === 'PENDING' ? (
                <div style={{ display:'flex', gap:6, justifyContent:'flex-end' }}>
                  {!prio(s) && (
                    <button onClick={e => { e.stopPropagation(); priorizar(s) }} title="Pedir à EQPI que analise este processo primeiro"
                      style={{ padding:'5px 10px', borderRadius:8, background:'#fef3c7', color:'#b45309', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:11, border:'none', cursor:'pointer', whiteSpace:'nowrap' }}>⚡ Priorizar</button>
                  )}
                  <button onClick={e => { e.stopPropagation(); setCarta(s.razao_social) }} title="Aprovar com pendência mediante carta assinada pelo cliente"
                    style={{ padding:'5px 10px', borderRadius:8, background:'#fff7ed', color:'#c2410c', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:11, border:'none', cursor:'pointer', whiteSpace:'nowrap' }}>📜 Carta</button>
                </div>
              ) : (
                <div style={{ textAlign:'right' }}>
                  <button style={{ padding:'5px 12px', borderRadius:8, background:'#EEF0FF', color:'#2E3192', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:11, border:'none', cursor:'pointer', whiteSpace:'nowrap' }}>Ver →</button>
                </div>
              )}
                <DemoWatchButton cnpj={s.cnpj} nome={s.razao_social} toast={setToast}/>
                {s.sealStatus === 'ACTIVE' && (
                  <button onClick={e => { e.stopPropagation(); certificado(s) }} title="Certificado de homologação"
                    style={{ padding:'4px 10px', borderRadius:8, background:'#fff', color:'#2E3192', border:'1px solid #c7c9e2', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:10.5, cursor:'pointer', whiteSpace:'nowrap' }}>🎓 Certificado</button>
                )}
              </div>
            </div>
          )
        })}
      </Card>
      {carta && <CartaExcecaoModal fornecedor={carta} onClose={() => setCarta(null)}/>}
      {modal}
    </div>
  )
}
