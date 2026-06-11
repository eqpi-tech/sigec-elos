import { useState } from 'react'
import { KpiCard, Card, ScoreBar, PageHeader, Button, Spinner } from '../../components/ui.jsx'
import { DEMO_CLIENT, DEMO_CLIENT_SUPPLIERS } from './demoData.js'

const sealColor = s => ({ ACTIVE:'#22c55e', PENDING:'#f59e0b', SUSPENDED:'#ef4444', EXPIRED:'#9B9B9B' }[s]||'#9B9B9B')
const sealLabel = s => ({ ACTIVE:'Homologado', PENDING:'Em análise', SUSPENDED:'Suspenso', EXPIRED:'Expirado' }[s]||s)

const EMPTY_FORM = { razao_social:'', cnpj:'', email:'', telefone:'', contato:'', tipo_fornecedor:'servico', subsidiado:false, escopo:'' }

function formatCnpj(v) {
  const n = v.replace(/\D/g,'').slice(0,14)
  return n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2}).*/, (_,a,b,c,d,e) => e ? `${a}.${b}.${c}/${d}-${e}` : d ? `${a}.${b}.${c}/${d}` : c ? `${a}.${b}.${c}` : b ? `${a}.${b}` : a)
}

function InviteModal({ onClose }) {
  const [form,    setForm]    = useState(EMPTY_FORM)
  const [sending, setSending] = useState(false)
  const [sent,    setSent]    = useState(false)
  const [error,   setError]   = useState('')

  const inp  = { width:'100%', padding:'10px 14px', borderRadius:10, border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#1a1c5e', boxSizing:'border-box', outline:'none' }
  const lbl  = { display:'block', fontFamily:'Montserrat,sans-serif', fontWeight:600, fontSize:11, color:'#1a1c5e', letterSpacing:.5, marginBottom:6, textTransform:'uppercase' }
  const row2 = { display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }

  const handleSend = (e) => {
    e.preventDefault()
    if (!form.razao_social || !form.email) { setError('Razão social e e-mail são obrigatórios.'); return }
    setSending(true); setError('')
    setTimeout(() => { setSending(false); setSent(true) }, 800)
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'#fff', borderRadius:20, padding:'28px 32px', width:'100%', maxWidth:560, maxHeight:'90vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,.2)' }}>
        {sent ? (
          <div style={{ textAlign:'center', padding:'20px 0' }}>
            <div style={{ fontSize:52, marginBottom:12 }}>✅</div>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:20, color:'#15803d', marginBottom:8 }}>Convite enviado!</div>
            <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#374151', marginBottom:8 }}>
              <strong>{form.razao_social}</strong> receberá um e-mail com o link de cadastro.
            </div>
            {form.subsidiado && (
              <div style={{ background:'#f0fdf4', border:'1px solid #86efac', borderRadius:10, padding:'10px 14px', marginBottom:16, fontSize:13, color:'#166534', fontFamily:'DM Sans,sans-serif' }}>
                💰 Homologação subsidiada — custo assumido pela Horizonte Mineração.
              </div>
            )}
            <Button variant="primary" full onClick={onClose}>Fechar</Button>
          </div>
        ) : (
          <>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
              <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:18, color:'#1a1c5e' }}>Convidar Fornecedor</div>
              <button onClick={onClose} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#9B9B9B' }}>✕</button>
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
                        <input type="radio" name="subsidiado_modal" checked={form.subsidiado===v} onChange={() => setForm(f=>({...f, subsidiado:v}))} style={{ accentColor:'#2E3192' }}/>
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
                <Button type="button" variant="neutral" full onClick={onClose}>Cancelar</Button>
                <Button type="submit" variant="primary" full disabled={sending}>
                  {sending ? <><Spinner size={14}/> Enviando...</> : '📨 Enviar Convite'}
                </Button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  )
}

export default function DemoClientDashboard({ navigate }) {
  const [showInvite, setShowInvite] = useState(false)
  const c       = DEMO_CLIENT
  const recentes = DEMO_CLIENT_SUPPLIERS.slice(0, 5)

  const QUICK_ACTIONS = [
    { label:'Meus Fornecedores', icon:'🏭', desc:'Ver lista completa',         onClick: () => navigate('fornecedores') },
    { label:'Enviar Convite',    icon:'📨', desc:'Convidar novo fornecedor',    onClick: () => setShowInvite(true) },
    { label:'Cotações (RFQ)',    icon:'💬', desc:'Solicitar propostas',         onClick: () => navigate('rfq') },
    { label:'Questionários',     icon:'📋', desc:'Formulários de compliance',   onClick: () => navigate('questionarios') },
  ]

  return (
    <div style={{ padding:'28px 32px', maxWidth:1100, margin:'0 auto' }}>
      <PageHeader
        title="Olá, Rafael! 👋"
        subtitle="Acompanhe o processo de homologação dos seus fornecedores"
        action={{ label:'+ Convidar Fornecedor', onClick: () => setShowInvite(true) }}
      />

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16, marginBottom:28 }}>
        <KpiCard label="Fornecedores Convidados" value={c.totalFornecedores} icon="🤝" />
        <KpiCard label="Homologados"             value={c.homologados}       icon="✅" subtext="Selo ELOS ativo"          subColor="#22c55e" iconBg="rgba(34,197,94,.1)" />
        <KpiCard label="Em Análise"              value={c.emAnalise}         icon="⏳" subtext="Aguardando revisão EQPI"  subColor="#f59e0b" iconBg="rgba(139,92,246,.1)" />
        <KpiCard label="Subsidiados"             value={c.subsidiados}       icon="💰" subtext="Custo assumido por você"  subColor="#2E3192" iconBg="rgba(46,49,146,.1)" />
      </div>

      {/* Saúde da cadeia */}
      <Card style={{ borderRadius:14, padding:'18px 24px', marginBottom:24, display:'flex', alignItems:'center', gap:16 }}>
        <div style={{ width:52, height:52, borderRadius:14, background:'rgba(34,197,94,.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, flexShrink:0 }}>🛡️</div>
        <div style={{ flex:1 }}>
          <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:16, color:'#1a1c5e', marginBottom:2 }}>
            Saúde da cadeia: {c.saudeGeral}%
          </div>
          <div style={{ fontSize:13, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', marginBottom:8 }}>
            Baseada em documentos válidos e conformidade regulatória
          </div>
          <ScoreBar score={c.saudeGeral}/>
        </div>
        <Button variant="neutral" size="sm">Ver relatório completo →</Button>
      </Card>

      {/* Fornecedores recentes */}
      <Card style={{ borderRadius:16, padding:'20px 24px', marginBottom:20 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:15, color:'#1a1c5e' }}>Fornecedores Recentes</div>
          <button onClick={() => navigate('fornecedores')} style={{ background:'none', border:'none', color:'#2E3192', fontFamily:'DM Sans,sans-serif', fontSize:13, fontWeight:600, cursor:'pointer' }}>
            Ver todos →
          </button>
        </div>
        <div style={{ display:'grid', gap:10 }}>
          {recentes.map(inv => (
            <div key={inv.id} onClick={() => navigate('processo')}
              style={{ display:'flex', alignItems:'center', gap:14, padding:'12px 16px', background:'#f8faff', borderRadius:12, border:'1px solid #e2e4ef', cursor:'pointer', transition:'background .15s' }}
              onMouseOver={e => e.currentTarget.style.background='#f0f3ff'}
              onMouseOut={e  => e.currentTarget.style.background='#f8faff'}>
              <div style={{ width:40, height:40, borderRadius:10, background:'#EEF0FF', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:14, color:'#2E3192', flexShrink:0, fontFamily:'Montserrat,sans-serif' }}>
                {inv.initials}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, color:'#1a1c5e', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{inv.razao_social}</div>
                <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:11, color:'#9B9B9B' }}>{inv.city} / {inv.state}</div>
              </div>
              {inv.subsidiado && (
                <span style={{ fontSize:10, background:'#d1fae5', color:'#065f46', borderRadius:20, padding:'2px 8px', fontFamily:'Montserrat,sans-serif', fontWeight:700, flexShrink:0 }}>SUBSIDIADO</span>
              )}
              <div style={{ textAlign:'right', flexShrink:0 }}>
                <div style={{ fontSize:11, fontWeight:700, color:sealColor(inv.sealStatus), fontFamily:'DM Sans,sans-serif' }}>{sealLabel(inv.sealStatus)}</div>
                {inv.sealStatus === 'ACTIVE' && inv.score && <div style={{ fontSize:11, color:'#9B9B9B' }}>Score {inv.score}%</div>}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Ações rápidas */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:12 }}>
        {QUICK_ACTIONS.map(a => (
          <Card key={a.label} hover style={{ borderRadius:14, padding:'18px 20px', cursor:'pointer' }} onClick={a.onClick}>
            <div style={{ fontSize:24, marginBottom:6 }}>{a.icon}</div>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:14, color:'#1a1c5e' }}>{a.label}</div>
            <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:12, color:'#9B9B9B', marginTop:2 }}>{a.desc}</div>
          </Card>
        ))}
      </div>

      {showInvite && <InviteModal onClose={() => setShowInvite(false)}/>}
    </div>
  )
}
