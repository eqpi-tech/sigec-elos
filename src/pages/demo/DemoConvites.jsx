// Demo · Convites — CLIENTE espelha src/pages/client/Invitations.jsx (filtros,
// Subsidiado, "⬇ Exportar Excel"); COMPRADOR espelha
// src/pages/buyer/Invitations.jsx ("Convites Enviados", objetivo do convite:
// 📞 contato ou 🏅 homologação — o comprador não subsidia).
import { useState } from 'react'
import { Card, Button, PageHeader, Spinner } from '../../components/ui.jsx'
import { MultiChips, FilterPanel } from '../../components/FilterChips.jsx'
import { HORIZONTE, PRIMATUS, isoDT, isoD, fmtBR } from './demoData.js'
import { useToast, exportRows } from './DemoFichaKit.jsx'
import { BuyerObjective } from './DemoFichas.jsx'

const STATUS_COLOR = { SENT:'#f59e0b', VIEWED:'#2563eb', REGISTERED:'#22c55e', CANCELLED:'#9B9B9B' }
const STATUS_LABEL = { SENT:'📨 Enviado', VIEWED:'👁 Visualizado', REGISTERED:'✅ Cadastrado', CANCELLED:'✕ Cancelado' }
const STATUS_TXT   = { SENT:'Enviado', VIEWED:'Visualizado', REGISTERED:'Cadastrado', CANCELLED:'Cancelado' }
const OBJ_LABEL    = { contato:'📞 Contato', homologacao:'🏅 Homologação' }

const BUYER_INVITES = [
  { id:1, supplier_id:2, supplier_razao_social:'Ômega Engenharia Ltda', supplier_cnpj:'41.090.118/0001-30', supplier_email:'contato@omega.com.br', status:'REGISTERED', created_at:isoDT(-33, '10:12'), objective:'homologacao' },
  { id:2, supplier_id:1, supplier_razao_social:PRIMATUS.razao,           supplier_cnpj:PRIMATUS.cnpj,        supplier_email:'lucas@primatus.com.br', status:'VIEWED',     created_at:isoDT(-12, '15:40'), objective:'contato' },
  { id:3, supplier_id:5, supplier_razao_social:'Norte Industrial Ltda',  supplier_cnpj:'28.119.340/0001-55', supplier_email:'adm@norteindustrial.com.br', status:'SENT', created_at:isoDT(-2, '09:05'), objective:'contato' },
]

const CLIENT_INVITES = [
  { id:1, supplier_razao_social:PRIMATUS.razao,            supplier_cnpj:PRIMATUS.cnpj,        supplier_email:'lucas@primatus.com.br',  status:'REGISTERED', created_at:isoD(-51), subsidiado:true,  contato:'Lucas Andrade', escopo:'Manutenção preventiva de correias transportadoras', nivel:'Suprimentos – Nível 2', lembretes:0 },
  { id:2, supplier_razao_social:'Ômega Engenharia Ltda',    supplier_cnpj:'41.090.118/0001-30', supplier_email:'contato@omega.com.br',   status:'REGISTERED', created_at:isoD(-58), subsidiado:true,  contato:'Ana Costa',     escopo:'Serviços elétricos', nivel:'Suprimentos – Nível 3', lembretes:0 },
  { id:3, supplier_razao_social:'TechFix Industrial S.A.',  supplier_cnpj:'07.332.910/0001-41', supplier_email:'admin@techfix.com.br',   status:'REGISTERED', created_at:isoD(-30), subsidiado:false, contato:'Marcos Lima',   escopo:'Automação', nivel:'Suprimentos – Nível 2', lembretes:1 },
  { id:4, supplier_razao_social:'Vértice Montagens Ltda',   supplier_cnpj:'33.901.227/0001-60', supplier_email:'contato@vertice.com.br', status:'VIEWED',     created_at:isoD(-9),  subsidiado:true,  contato:'Sérgio Vidal',  escopo:'Montagem industrial', nivel:'Suprimentos – Nível 2', lembretes:1 },
  { id:5, supplier_razao_social:'NovaTech Serviços Ltda',   supplier_cnpj:'64.123.789/0001-99', supplier_email:'novo@novatech.com.br',   status:'SENT',       created_at:isoD(-3),  subsidiado:false, contato:'',              escopo:'', nivel:'Suprimentos – Nível 1', lembretes:0 },
  { id:6, supplier_razao_social:'Delta Serviços Gerais Ltda', supplier_cnpj:'05.448.310/0001-91', supplier_email:'adm@deltaservicos.com.br', status:'CANCELLED', created_at:isoD(-44), subsidiado:true, contato:'', escopo:'Limpeza', nivel:'Suprimentos – Nível 1', lembretes:2 },
]

const EMPTY_FORM = { razao_social:'', cnpj:'', email:'', telefone:'', contato:'', tipo_fornecedor:'servico', subsidiado:false, escopo:'', objetivo:'contato', mensagem:'' }

function formatCnpj(v) {
  const n = v.replace(/\D/g,'').slice(0,14)
  return n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2}).*/, (_,a,b,c,d,e) => e ? `${a}.${b}.${c}/${d}-${e}` : d ? `${a}.${b}.${c}/${d}` : c ? `${a}.${b}.${c}` : b ? `${a}.${b}` : a)
}
const fmtData = (v) => (String(v).length > 10 ? `${fmtBR(v)} ${String(v).slice(11, 16)}` : fmtBR(v))

export default function DemoConvites({ profile = 'CLIENT', navigate }) {
  const isBuyer = profile === 'BUYER'
  const [invites,    setInvites]    = useState(isBuyer ? BUYER_INVITES : CLIENT_INVITES)
  const [search,     setSearch]     = useState('')
  const [showModal,  setShowModal]  = useState(false)
  const [form,       setForm]       = useState(EMPTY_FORM)
  const [sending,    setSending]    = useState(false)
  const [error,      setError]      = useState('')
  const [fStatus,    setFStatus]    = useState([])
  const [fCust,      setFCust]      = useState([])
  const [, setToast, ToastEl] = useToast()

  const filtered = invites.filter(i => {
    const q = search.toLowerCase()
    if (q && !(i.supplier_razao_social?.toLowerCase().includes(q) || i.supplier_cnpj?.replace(/\D/g, '').includes(q.replace(/\D/g, '') || '§'))) return false
    if (fStatus.length && !fStatus.includes(i.status)) return false
    if (fCust.length && !fCust.includes(i.subsidiado ? 'sim' : 'nao')) return false
    return true
  })
  const conta = (fn) => invites.filter(fn).length

  const handleSend = (e) => {
    e.preventDefault()
    if (!form.razao_social || !form.email) { setError('Razão social e e-mail são obrigatórios.'); return }
    setSending(true); setError('')
    setTimeout(() => {
      setSending(false)
      setToast(`✅ ${isBuyer && form.objetivo === 'contato' ? 'Contato' : 'Convite'} enviado para ${form.email}!`)
      setInvites(prev => [{
        id: Date.now(), supplier_razao_social: form.razao_social, supplier_cnpj: form.cnpj || '—', supplier_email: form.email,
        status: 'SENT', created_at: isBuyer ? isoDT(0, new Date().toTimeString().slice(0, 5)) : isoD(0),
        subsidiado: !isBuyer && form.subsidiado, contato: form.contato, escopo: form.escopo, objective: form.objetivo, nivel: 'Suprimentos – Nível 1', lembretes: 0,
      }, ...prev])
      setShowModal(false); setForm(EMPTY_FORM)
    }, 800)
  }
  const exportar = () => exportRows('convites', 'Convites', filtered.map(inv => ({
    'Fornecedor': inv.supplier_razao_social, 'CNPJ': inv.supplier_cnpj, 'E-mail': inv.supplier_email, 'Contato': inv.contato || '',
    'Situação': STATUS_TXT[inv.status] || inv.status, 'Nível': inv.nivel || '', 'Custeio': inv.subsidiado ? 'Subsidiado' : 'Pago pelo fornecedor',
    'Origem': 'ELOS', 'Enviado em': fmtBR(inv.created_at), 'Lembretes enviados': inv.lembretes || 0, 'Escopo': inv.escopo || '',
  })), setToast)

  const inp  = { width:'100%', padding:'10px 14px', borderRadius:10, border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#1a1c5e', boxSizing:'border-box', outline:'none' }
  const lbl  = { display:'block', fontFamily:'Montserrat,sans-serif', fontWeight:600, fontSize:11, color:'#1a1c5e', letterSpacing:.5, marginBottom:6, textTransform:'uppercase' }
  const row2 = { display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }

  return (
    <div style={{ padding:'28px 32px', maxWidth:1000, margin:'0 auto' }}>
      {ToastEl}
      <PageHeader
        title={isBuyer ? 'Convites Enviados' : 'Convites'}
        subtitle={`${invites.length} convite${invites.length!==1?'s':''} enviado${invites.length!==1?'s':''}`}
        action={{ label:'+ Novo Convite', onClick: () => setShowModal(true) }}
      />

      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍  Buscar por razão social ou CNPJ..." style={{ ...inp, marginBottom: isBuyer ? 20 : 12 }}/>
      {!isBuyer && (<>
        <FilterPanel total={invites.length} shown={filtered.length} active={!!search || fStatus.length + fCust.length > 0}
          onClear={() => { setSearch(''); setFStatus([]); setFCust([]) }}>
          <MultiChips label="Status" value={fStatus} onChange={setFStatus}
            options={['SENT','VIEWED','REGISTERED','CANCELLED'].map(st => ({ value: st, label: STATUS_TXT[st], color: STATUS_COLOR[st], count: conta(i => i.status === st) })).filter(o => o.count > 0)}/>
          <MultiChips label="Custeio" single value={fCust} onChange={setFCust}
            options={[{ value:'sim', label:'💰 Subsidiado', count: conta(i => i.subsidiado) }, { value:'nao', label:'Pago pelo fornecedor', count: conta(i => !i.subsidiado) }].filter(o => o.count > 0)}/>
        </FilterPanel>
        {filtered.length > 0 && (
          <div style={{ display:'flex', justifyContent:'flex-end', margin:'-4px 0 12px' }}>
            <Button variant="neutral" size="sm" onClick={exportar} title="Exporta a lista com os filtros aplicados">⬇ Exportar Excel ({filtered.length})</Button>
          </div>
        )}
      </>)}

      <div style={{ display:'grid', gap:10 }}>
        {filtered.length === 0 ? (
          <Card style={{ borderRadius:14, padding:48, textAlign:'center' }}>
            <div style={{ fontSize:40, marginBottom:16 }}>🤝</div>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:18, color:'#1a1c5e', marginBottom:8 }}>Nenhum resultado encontrado</div>
            <div style={{ fontSize:13, color:'#9B9B9B' }}>Tente outro termo de busca.</div>
          </Card>
        ) : filtered.map(inv => (
          <Card key={inv.id} style={{ borderRadius:12, padding:'16px 20px', opacity: inv.status === 'CANCELLED' ? .7 : 1 }}>
            <div style={{ display:'flex', alignItems:'center', gap:14, flexWrap:'wrap' }}>
              <div style={{ width:44, height:44, borderRadius:10, background:'#EEF0FF', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:14, color:'#2E3192', flexShrink:0 }}>
                {inv.supplier_razao_social?.slice(0,2).toUpperCase() || '??'}
              </div>
              <div style={{ flex:1, minWidth:220 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                  <span style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, color:'#1a1c5e' }}>{inv.supplier_razao_social}</span>
                  {isBuyer && inv.objective && <span style={{ fontSize:10, fontWeight:700, color:'#7c3aed', background:'#f5f3ff', borderRadius:20, padding:'2px 8px', fontFamily:'Montserrat,sans-serif' }}>{OBJ_LABEL[inv.objective]}</span>}
                </div>
                <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:11, color:'#9B9B9B', marginTop:2 }}>
                  {inv.supplier_cnpj !== '—' && `CNPJ ${inv.supplier_cnpj} · `}{inv.supplier_email}{inv.contato && ` · ${inv.contato}`}
                </div>
                {inv.escopo && <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:11, color:'#64748b', marginTop:2 }}>Escopo: {inv.escopo}{inv.nivel ? ` · ${inv.nivel}` : ''}</div>}
                <div style={{ fontSize:10.5, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', marginTop:2 }}>Enviado em {fmtData(inv.created_at)}{inv.lembretes ? ` · ${inv.lembretes} lembrete${inv.lembretes > 1 ? 's' : ''}` : ''}</div>
              </div>
              <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:5, flexShrink:0 }}>
                <span style={{ fontSize:11, fontWeight:700, color:STATUS_COLOR[inv.status], background:`${STATUS_COLOR[inv.status]}18`, padding:'3px 10px', borderRadius:20, fontFamily:'Montserrat,sans-serif' }}>{STATUS_LABEL[inv.status]}</span>
                {inv.subsidiado && <span style={{ fontSize:10, background:'#d1fae5', color:'#065f46', borderRadius:20, padding:'2px 8px', fontFamily:'Montserrat,sans-serif', fontWeight:700 }}>SUBSIDIADO</span>}
                {isBuyer ? (
                  <button onClick={() => inv.supplier_id ? navigate('perfil', { supplierId: inv.supplier_id }) : setToast('ℹ️ A ficha aparece quando o fornecedor concluir o cadastro.')}
                    style={{ padding:'6px 14px', borderRadius:8, background:'rgba(46,49,146,.06)', border:'1px solid rgba(46,49,146,.15)', color:'#2E3192', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:12, cursor:'pointer' }}>Ver Ficha</button>
                ) : ['SENT','VIEWED'].includes(inv.status) && (
                  <button onClick={() => { setInvites(p => p.map(x => x.id === inv.id ? { ...x, lembretes: (x.lembretes || 0) + 1 } : x)); setToast(`✅ Convite reenviado para ${inv.supplier_email}.`) }}
                    style={{ fontSize:10, color:'#2E3192', background:'none', border:'1px solid #2E3192', borderRadius:6, padding:'2px 8px', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600 }}>Reenviar</button>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {showModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'#fff', borderRadius:20, padding:'28px 32px', width:'100%', maxWidth:560, maxHeight:'90vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,.2)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
              <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:18, color:'#1a1c5e' }}>Convidar Fornecedor</div>
              <button onClick={() => { setShowModal(false); setError('') }} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#9B9B9B' }}>✕</button>
            </div>
            <form onSubmit={handleSend}>
              <div style={row2}>
                <div><label style={lbl}>Razão Social *</label><input value={form.razao_social} onChange={e => setForm(f=>({...f, razao_social:e.target.value}))} required placeholder="Empresa Ltda" style={inp}/></div>
                <div><label style={lbl}>CNPJ</label><input value={form.cnpj} onChange={e => setForm(f=>({...f, cnpj:formatCnpj(e.target.value)}))} placeholder="00.000.000/0001-00" style={inp}/></div>
              </div>
              <div style={row2}>
                <div><label style={lbl}>E-mail *</label><input value={form.email} onChange={e => setForm(f=>({...f, email:e.target.value}))} type="email" required placeholder="contato@empresa.com.br" style={inp}/></div>
                <div><label style={lbl}>Telefone</label><input value={form.telefone} onChange={e => setForm(f=>({...f, telefone:e.target.value}))} placeholder="(11) 99999-9999" style={inp}/></div>
              </div>
              {isBuyer ? (<>
                <BuyerObjective value={form.objetivo} onChange={(v) => setForm(f => ({ ...f, objetivo: v }))}/>
                <div style={{ margin:'10px 0 20px' }}>
                  <label style={lbl}>Mensagem</label>
                  <textarea value={form.mensagem} onChange={e => setForm(f=>({...f, mensagem:e.target.value}))} rows={3}
                    placeholder={form.objetivo === 'contato' ? 'Conte o que você precisa — o fornecedor responde com uma proposta.' : 'Explique a homologação que sua empresa exige.'}
                    style={{ ...inp, resize:'vertical', minHeight:80 }}/>
                </div>
              </>) : (<>
                <div style={{ marginBottom:14 }}><label style={lbl}>Nome do contato</label><input value={form.contato} onChange={e => setForm(f=>({...f, contato:e.target.value}))} placeholder="João da Silva — Gerente de Compras" style={inp}/></div>
                <div style={row2}>
                  <div>
                    <label style={lbl}>Tipo de fornecimento *</label>
                    <select value={form.tipo_fornecedor} onChange={e => setForm(f=>({...f, tipo_fornecedor:e.target.value}))} style={inp}>
                      <option value="servico">Serviço</option><option value="produto">Produto</option><option value="ambos">Produto e Serviço</option>
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>Subsidiado?</label>
                    <div style={{ display:'flex', gap:16, paddingTop:12 }}>
                      {[true, false].map(v => (
                        <label key={String(v)} style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#1a1c5e' }}>
                          <input type="radio" name="subsidiado" checked={form.subsidiado===v} onChange={() => setForm(f=>({...f, subsidiado:v}))} style={{ accentColor:'#2E3192' }}/>{v ? 'Sim' : 'Não'}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
                {form.subsidiado && (
                  <div style={{ marginBottom:14, background:'#f0fdf4', border:'1px solid #86efac', borderRadius:10, padding:'10px 14px', fontSize:12, color:'#15803d', fontFamily:'DM Sans,sans-serif' }}>
                    O custo da homologação será assumido pela {HORIZONTE.razao}. O fornecedor não paga nada e o processo começa sem esperar pagamento.
                  </div>
                )}
                <div style={{ marginBottom:20 }}>
                  <label style={lbl}>Escopo do fornecimento</label>
                  <textarea value={form.escopo} onChange={e => setForm(f=>({...f, escopo:e.target.value}))} placeholder="Descreva os produtos ou serviços que este fornecedor irá entregar..." rows={3} style={{ ...inp, resize:'vertical', minHeight:80 }}/>
                </div>
              </>)}
              {error && <div style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:10, padding:'10px 14px', marginBottom:14, fontSize:13, color:'#dc2626' }}>{error}</div>}
              <div style={{ display:'flex', gap:10 }}>
                <Button type="button" variant="neutral" full onClick={() => { setShowModal(false); setError('') }}>Cancelar</Button>
                <Button type="submit" variant="primary" full disabled={sending}>
                  {sending ? <><Spinner size={14}/> Enviando...</> : isBuyer && form.objetivo === 'contato' ? '📞 Enviar Contato' : '📨 Enviar Convite'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
