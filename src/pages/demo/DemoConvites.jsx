import { useState } from 'react'
import { Card, Button, PageHeader, Spinner } from '../../components/ui.jsx'

const STATUS_COLOR = { SENT:'#f59e0b', VIEWED:'#2563eb', REGISTERED:'#22c55e' }
const STATUS_LABEL = { SENT:'📨 Enviado', VIEWED:'👁 Visualizado', REGISTERED:'✅ Cadastrado' }

const BUYER_INVITES = [
  { id:1, supplier_razao_social:'Gama Serviços Industriais Ltda', supplier_cnpj:'45.123.987/0001-11', supplier_email:'contato@gama.com.br', status:'REGISTERED', created_at:'2026-05-12', objective:'homologacao' },
  { id:2, supplier_razao_social:'Delta Manutenção Ltda',           supplier_cnpj:'33.456.789/0001-55', supplier_email:'delta@delta.com.br',  status:'VIEWED',     created_at:'2026-05-20', objective:'contato' },
  { id:3, supplier_razao_social:'Epsilon Engenharia S.A.',          supplier_cnpj:'27.890.123/0001-88', supplier_email:'eps@epsilon.com.br',  status:'SENT',       created_at:'2026-06-01', objective:'homologacao' },
]

const CLIENT_INVITES = [
  { id:1, supplier_razao_social:'Primatus Serviços Técnicos Ltda', supplier_cnpj:'34.218.904/0001-72', supplier_email:'lucas@primatus.com.br', status:'REGISTERED', created_at:'2025-12-10', subsidiado:false, contato:'Lucas Andrade', escopo:'Manutenção industrial' },
  { id:2, supplier_razao_social:'Ômega Engenharia Ltda',           supplier_cnpj:'19.234.567/0001-44', supplier_email:'contato@omega.com.br',  status:'REGISTERED', created_at:'2026-01-15', subsidiado:true,  contato:'Ana Costa',    escopo:'Serviços elétricos' },
  { id:3, supplier_razao_social:'TechFix Industrial S.A.',          supplier_cnpj:'52.341.890/0001-33', supplier_email:'admin@techfix.com',     status:'VIEWED',     created_at:'2026-05-02', subsidiado:false, contato:'Marcos Lima',  escopo:'Automação' },
  { id:4, supplier_razao_social:'NovaTech Serviços Ltda',           supplier_cnpj:'64.123.789/0001-99', supplier_email:'novo@novatech.com',     status:'SENT',       created_at:'2026-06-05', subsidiado:false, contato:'',             escopo:'' },
]

const EMPTY_FORM = { razao_social:'', cnpj:'', email:'', telefone:'', contato:'', tipo_fornecedor:'servico', subsidiado:false, escopo:'' }

function formatCnpj(v) {
  const n = v.replace(/\D/g,'').slice(0,14)
  return n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2}).*/, (_,a,b,c,d,e) => e ? `${a}.${b}.${c}/${d}-${e}` : d ? `${a}.${b}.${c}/${d}` : c ? `${a}.${b}.${c}` : b ? `${a}.${b}` : a)
}

export default function DemoConvites({ profile = 'CLIENT', navigate }) {
  const [invites,    setInvites]    = useState(profile === 'BUYER' ? BUYER_INVITES : CLIENT_INVITES)
  const [search,     setSearch]     = useState('')
  const [showModal,  setShowModal]  = useState(false)
  const [form,       setForm]       = useState(EMPTY_FORM)
  const [sending,    setSending]    = useState(false)
  const [success,    setSuccess]    = useState('')
  const [error,      setError]      = useState('')

  const filtered = invites.filter(i => {
    const q = search.toLowerCase()
    return !q || i.supplier_razao_social?.toLowerCase().includes(q) || i.supplier_cnpj?.includes(q)
  })

  const handleSend = (e) => {
    e.preventDefault()
    if (!form.razao_social || !form.email) { setError('Razão social e e-mail são obrigatórios.'); return }
    setSending(true); setError('')
    setTimeout(() => {
      setSending(false)
      setSuccess(`Convite enviado para ${form.email}!`)
      setInvites(prev => [{
        id: Date.now(),
        supplier_razao_social: form.razao_social,
        supplier_cnpj: form.cnpj || '—',
        supplier_email: form.email,
        status: 'SENT',
        created_at: new Date().toISOString().slice(0,10),
        subsidiado: form.subsidiado,
        contato: form.contato,
        escopo: form.escopo,
      }, ...prev])
      setShowModal(false)
      setForm(EMPTY_FORM)
    }, 800)
  }

  const inp  = { width:'100%', padding:'10px 14px', borderRadius:10, border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#1a1c5e', boxSizing:'border-box', outline:'none' }
  const lbl  = { display:'block', fontFamily:'Montserrat,sans-serif', fontWeight:600, fontSize:11, color:'#1a1c5e', letterSpacing:.5, marginBottom:6, textTransform:'uppercase' }
  const row2 = { display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }

  return (
    <div style={{ padding:'28px 32px', maxWidth:1000, margin:'0 auto' }}>
      <PageHeader
        title="Convites"
        subtitle={`${invites.length} convite${invites.length!==1?'s':''} enviado${invites.length!==1?'s':''}`}
        action={{ label:'+ Novo Convite', onClick: () => setShowModal(true) }}
      />

      {success && (
        <div style={{ background:'#f0fdf4', border:'1px solid #86efac', borderRadius:10, padding:'10px 16px', marginBottom:16, color:'#15803d', fontFamily:'DM Sans,sans-serif', fontSize:13 }}>
          ✅ {success}
        </div>
      )}

      <input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Buscar por razão social ou CNPJ..."
        style={{ ...inp, marginBottom:20 }}
      />

      <div style={{ display:'grid', gap:10 }}>
        {filtered.length === 0 ? (
          <Card style={{ borderRadius:14, padding:48, textAlign:'center' }}>
            <div style={{ fontSize:40, marginBottom:16 }}>🤝</div>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:18, color:'#1a1c5e', marginBottom:8 }}>Nenhum convite encontrado</div>
            <div style={{ fontSize:13, color:'#9B9B9B', marginBottom:24 }}>Tente outro termo de busca.</div>
          </Card>
        ) : filtered.map(inv => (
          <Card key={inv.id} style={{ borderRadius:12, padding:'16px 20px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:14 }}>
              <div style={{ width:44, height:44, borderRadius:10, background:'#EEF0FF', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:14, color:'#2E3192', flexShrink:0 }}>
                {inv.supplier_razao_social?.slice(0,2).toUpperCase() || '??'}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, color:'#1a1c5e' }}>
                  {inv.supplier_razao_social}
                </div>
                <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:11, color:'#9B9B9B', marginTop:2 }}>
                  {inv.supplier_cnpj !== '—' && `CNPJ ${inv.supplier_cnpj} · `}{inv.supplier_email}
                  {inv.contato && ` · ${inv.contato}`}
                </div>
                {inv.escopo && <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:11, color:'#64748b', marginTop:2 }}>Escopo: {inv.escopo}</div>}
              </div>
              <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:5, flexShrink:0 }}>
                <span style={{ fontSize:11, fontWeight:700, color:STATUS_COLOR[inv.status], background:`${STATUS_COLOR[inv.status]}18`, padding:'3px 10px', borderRadius:20, fontFamily:'Montserrat,sans-serif' }}>
                  {STATUS_LABEL[inv.status]}
                </span>
                {inv.subsidiado && (
                  <span style={{ fontSize:10, background:'#d1fae5', color:'#065f46', borderRadius:20, padding:'2px 8px', fontFamily:'Montserrat,sans-serif', fontWeight:700 }}>SUBSIDIADO</span>
                )}
                <div style={{ fontSize:10, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>
                  {new Date(inv.created_at).toLocaleDateString('pt-BR')}
                </div>
                {inv.status !== 'REGISTERED' && (
                  <button style={{ fontSize:10, color:'#2E3192', background:'none', border:'1px solid #2E3192', borderRadius:6, padding:'2px 8px', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600 }}>
                    Reenviar
                  </button>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Modal novo convite */}
      {showModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'#fff', borderRadius:20, padding:'28px 32px', width:'100%', maxWidth:560, maxHeight:'90vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,.2)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
              <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:18, color:'#1a1c5e' }}>Convidar Fornecedor</div>
              <button onClick={() => { setShowModal(false); setError('') }}
                style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#9B9B9B' }}>✕</button>
            </div>

            <form onSubmit={handleSend}>
              <div style={row2}>
                <div>
                  <label style={lbl}>Razão Social *</label>
                  <input value={form.razao_social} onChange={e => setForm(f=>({...f, razao_social:e.target.value}))} required placeholder="Empresa Ltda" style={inp}/>
                </div>
                <div>
                  <label style={lbl}>CNPJ</label>
                  <input value={form.cnpj} onChange={e => setForm(f=>({...f, cnpj:formatCnpj(e.target.value)}))} placeholder="00.000.000/0001-00" style={inp}/>
                </div>
              </div>
              <div style={row2}>
                <div>
                  <label style={lbl}>E-mail *</label>
                  <input value={form.email} onChange={e => setForm(f=>({...f, email:e.target.value}))} type="email" required placeholder="contato@empresa.com.br" style={inp}/>
                </div>
                <div>
                  <label style={lbl}>Telefone</label>
                  <input value={form.telefone} onChange={e => setForm(f=>({...f, telefone:e.target.value}))} placeholder="(11) 99999-9999" style={inp}/>
                </div>
              </div>
              <div style={{ marginBottom:14 }}>
                <label style={lbl}>Nome do contato</label>
                <input value={form.contato} onChange={e => setForm(f=>({...f, contato:e.target.value}))} placeholder="João da Silva — Gerente de Compras" style={inp}/>
              </div>
              <div style={row2}>
                <div>
                  <label style={lbl}>Tipo de fornecimento *</label>
                  <select value={form.tipo_fornecedor} onChange={e => setForm(f=>({...f, tipo_fornecedor:e.target.value}))} style={inp}>
                    <option value="servico">Serviço</option>
                    <option value="produto">Produto</option>
                    <option value="ambos">Produto e Serviço</option>
                  </select>
                </div>
                <div>
                  <label style={lbl}>Subsidiado?</label>
                  <div style={{ display:'flex', gap:16, paddingTop:12 }}>
                    {[true, false].map(v => (
                      <label key={String(v)} style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#1a1c5e' }}>
                        <input type="radio" name="subsidiado" checked={form.subsidiado===v} onChange={() => setForm(f=>({...f, subsidiado:v}))} style={{ accentColor:'#2E3192' }}/>
                        {v ? 'Sim' : 'Não'}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              {form.subsidiado && (
                <div style={{ marginBottom:14, background:'#f0fdf4', border:'1px solid #86efac', borderRadius:10, padding:'10px 14px', fontSize:12, color:'#15803d', fontFamily:'DM Sans,sans-serif' }}>
                  O custo da homologação será assumido pela sua empresa. A EQPI receberá o pagamento mensalmente.
                </div>
              )}
              <div style={{ marginBottom:20 }}>
                <label style={lbl}>Escopo do fornecimento</label>
                <textarea value={form.escopo} onChange={e => setForm(f=>({...f, escopo:e.target.value}))}
                  placeholder="Descreva os produtos ou serviços que este fornecedor irá entregar..." rows={3}
                  style={{ ...inp, resize:'vertical', minHeight:80 }}/>
              </div>
              {error && (
                <div style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:10, padding:'10px 14px', marginBottom:14, fontSize:13, color:'#dc2626' }}>{error}</div>
              )}
              <div style={{ display:'flex', gap:10 }}>
                <Button type="button" variant="neutral" full onClick={() => { setShowModal(false); setError('') }}>Cancelar</Button>
                <Button type="submit" variant="primary" full disabled={sending}>
                  {sending ? <><Spinner size={14}/> Enviando...</> : '📨 Enviar Convite'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
