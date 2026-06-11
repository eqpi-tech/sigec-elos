import { useState } from 'react'
import { Card, Button, ScoreBar, StatusDot, Spinner } from '../../components/ui.jsx'
import { DEMO_BUYER_SUPPLIER_PROFILE as P } from './demoData.js'

const STATUS_C = { VALID:'#22c55e', EXPIRING:'#f59e0b', MISSING:'#ef4444', PENDING:'#f59e0b', REJECTED:'#ef4444' }
const STATUS_L = { VALID:'Válido', EXPIRING:'Vencendo', MISSING:'Pendente', PENDING:'Em análise', REJECTED:'Rejeitado' }

function Section({ icon, title, children }) {
  return (
    <div style={{ marginBottom:28 }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:13, color:'#1a1c5e', borderBottom:'2px solid rgba(46,49,146,.08)', paddingBottom:10, marginBottom:14 }}>
        {icon} {title}
      </div>
      {children}
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div style={{ display:'flex', gap:12, padding:'8px 0', borderBottom:'1px solid #f3f4f6' }}>
      <span style={{ fontSize:12, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', minWidth:190, flexShrink:0 }}>{label}</span>
      <span style={{ fontSize:13, color:'#1a1c5e', fontFamily:'DM Sans,sans-serif', fontWeight:500 }}>{value || '—'}</span>
    </div>
  )
}

function InviteModal({ onClose }) {
  const [objective, setObjective] = useState('')
  const [msg,       setMsg]       = useState('')
  const [sending,   setSending]   = useState(false)
  const [sent,      setSent]      = useState(false)

  const templates = {
    contato: `Olá, Primatus Serviços Técnicos!\n\nMeu nome é Ricardo Mendes e encontrei o perfil da sua empresa no marketplace SIGEC-ELOS.\n\nGostaria de entrar em contato para conhecer melhor os seus serviços e verificar possibilidades de parceria.\n\nAtenciosamente,\nRicardo Mendes`,
    homologacao: `Olá, Primatus Serviços Técnicos!\n\nEstou interessado em homologar a sua empresa para prestação de serviços. Através do SIGEC-ELOS, você poderá completar seu cadastro e documentação de forma digital.\n\nAtenciosamente,\nRicardo Mendes`,
  }

  const selectObjective = (obj) => { setObjective(obj); setMsg(templates[obj]) }

  const send = () => {
    if (!objective) return
    setSending(true)
    setTimeout(() => { setSending(false); setSent(true) }, 900)
  }

  const inp = { width:'100%', padding:'10px 12px', borderRadius:10, border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:13, boxSizing:'border-box', outline:'none', color:'#1a1c5e' }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:999, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ background:'#fff', borderRadius:20, padding:28, width:'100%', maxWidth:480, boxShadow:'0 20px 60px rgba(0,0,0,.2)' }}>
        {sent ? (
          <div style={{ textAlign:'center', padding:'12px 0' }}>
            <div style={{ fontSize:52, marginBottom:12 }}>✅</div>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:18, color:'#15803d', marginBottom:6 }}>Convite enviado!</div>
            <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#9B9B9B', marginBottom:20 }}>
              Primatus Serviços Técnicos receberá um e-mail com o convite.
            </div>
            <Button variant="primary" full onClick={onClose}>Fechar</Button>
          </div>
        ) : (
          <>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:18, color:'#1a1c5e', marginBottom:6 }}>📨 Enviar Convite</div>
            <div style={{ fontSize:13, color:'#9B9B9B', marginBottom:16 }}>Para: <strong style={{ color:'#2E3192' }}>Primatus Serviços Técnicos Ltda</strong></div>

            <div style={{ marginBottom:14 }}>
              <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:11, color:'#9B9B9B', textTransform:'uppercase', letterSpacing:.5, marginBottom:8 }}>Objetivo do convite</div>
              <div style={{ display:'flex', gap:8 }}>
                {[['contato','💬 Contato','Iniciar contato comercial'],['homologacao','🏅 Homologação','Solicitar homologação']].map(([val, label, desc]) => (
                  <button key={val} onClick={() => selectObjective(val)}
                    style={{ flex:1, padding:'12px', borderRadius:12, border:`2px solid ${objective===val?'#2E3192':'#e2e4ef'}`, background:objective===val?'rgba(46,49,146,.05)':'#fff', cursor:'pointer', textAlign:'left', transition:'all .15s' }}>
                    <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:12, color:'#1a1c5e' }}>{label}</div>
                    <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:11, color:'#9B9B9B', marginTop:2 }}>{desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {objective && (
              <div style={{ marginBottom:16 }}>
                <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:11, color:'#9B9B9B', textTransform:'uppercase', letterSpacing:.5, marginBottom:5 }}>Mensagem</div>
                <textarea value={msg} onChange={e => setMsg(e.target.value)} rows={5}
                  style={{ ...inp, resize:'vertical' }}/>
              </div>
            )}

            <div style={{ display:'flex', gap:10 }}>
              <Button variant="neutral" style={{ flex:1 }} onClick={onClose}>Cancelar</Button>
              <Button variant="primary" style={{ flex:1 }} disabled={!objective || sending} onClick={send}>
                {sending ? <><Spinner size={14}/> Enviando...</> : '📨 Enviar'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default function DemoBuyerPerfil({ navigate }) {
  const [showInvite, setShowInvite] = useState(false)
  const scoreC = P.score >= 90 ? '#22c55e' : P.score >= 70 ? '#f59e0b' : '#ef4444'

  return (
    <div style={{ padding:'24px 32px', maxWidth:1000, margin:'0 auto' }}>
      {/* Back button */}
      <button onClick={() => navigate('marketplace')} style={{ display:'flex', alignItems:'center', gap:6, background:'none', border:'none', color:'#2E3192', fontFamily:'DM Sans,sans-serif', fontWeight:600, fontSize:13, cursor:'pointer', marginBottom:20 }}>
        ← Voltar ao Marketplace
      </button>

      {/* Header card */}
      <Card style={{ borderRadius:16, padding:'24px 28px', marginBottom:24 }}>
        <div style={{ display:'flex', gap:20, alignItems:'flex-start', flexWrap:'wrap' }}>
          <div style={{ width:64, height:64, borderRadius:16, background:'#F47E2F', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:28, color:'#fff', flexShrink:0 }}>PT</div>
          <div style={{ flex:1, minWidth:200 }}>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:22, color:'#1a1c5e' }}>{P.razao_social}</div>
            <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#9B9B9B', marginTop:4 }}>{P.city}/{P.state} · CNPJ {P.cnpj}</div>
            <div style={{ display:'flex', gap:6, marginTop:10, flexWrap:'wrap' }}>
              <span style={{ background:'rgba(244,126,47,.15)', color:'#F47E2F', fontSize:11, fontFamily:'Montserrat,sans-serif', fontWeight:700, padding:'4px 12px', borderRadius:20 }}>Homologado ELOS</span>
              <span style={{ background:'#EEF0FF', color:'#2E3192', fontSize:11, fontFamily:'DM Sans,sans-serif', padding:'4px 12px', borderRadius:20 }}>{P.porte}</span>
              {P.simples && <span style={{ background:'#f0fdf4', color:'#16a34a', fontSize:11, fontFamily:'DM Sans,sans-serif', padding:'4px 12px', borderRadius:20 }}>Simples Nacional</span>}
            </div>
            <div style={{ display:'flex', gap:6, marginTop:8, flexWrap:'wrap' }}>
              {P.categorias.map(c => (
                <span key={c} style={{ background:'rgba(46,49,146,.06)', color:'#2E3192', fontSize:11, fontFamily:'DM Sans,sans-serif', padding:'3px 10px', borderRadius:20, border:'1px solid rgba(46,49,146,.15)' }}>{c}</span>
              ))}
            </div>
          </div>
          <div style={{ textAlign:'center', flexShrink:0 }}>
            <div style={{ fontSize:11, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', marginBottom:4 }}>Score ELOS</div>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:36, color:scoreC, lineHeight:1 }}>{P.score}</div>
            <div style={{ fontSize:11, color:'#9B9B9B', marginBottom:8 }}>/100</div>
            <div style={{ width:100 }}><ScoreBar score={P.score}/></div>
          </div>
        </div>

        {/* Última verificação */}
        <div style={{ background:'rgba(34,197,94,.1)', border:'1px solid rgba(34,197,94,.25)', borderRadius:10, padding:'8px 14px', display:'flex', alignItems:'center', gap:8, marginTop:16, fontSize:12, color:'#22c55e', fontFamily:'DM Sans,sans-serif' }}>
          ⚡ Última verificação automática: hoje, 09:14 · Dados coletados via Assertiva + Receita Federal
        </div>

        {/* Ações */}
        <div style={{ display:'flex', gap:10, marginTop:16, flexWrap:'wrap' }}>
          <Button variant="primary" onClick={() => navigate('rfq')}>📝 Solicitar Cotação (RFQ)</Button>
          <Button variant="orange" onClick={() => setShowInvite(true)}>📨 Enviar Convite</Button>
          <Button variant="neutral">📄 Exportar Dossie</Button>
        </div>
      </Card>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:24 }}>
        {/* Coluna esquerda */}
        <div>
          <Card style={{ borderRadius:14, padding:'20px 24px', marginBottom:20 }}>
            <Section icon="🏢" title="Dados Cadastrais">
              <Row label="Razão Social"     value={P.razao_social}/>
              <Row label="CNPJ"             value={P.cnpj}/>
              <Row label="Município / UF"   value={`${P.city} / ${P.state}`}/>
              <Row label="CNAE Principal"   value={P.cnae_principal}/>
              <Row label="Porte"            value={P.porte}/>
              <Row label="Capital Social"   value={`R$ ${(P.capital/1000).toFixed(0)}K`}/>
              <Row label="Fundação"         value={P.fundacao}/>
              <Row label="Regime Tributário" value={P.simples?'Simples Nacional':'Lucro Presumido'}/>
            </Section>
          </Card>
          <Card style={{ borderRadius:14, padding:'20px 24px' }}>
            <Section icon="👤" title="Sócios e Representantes">
              {P.socios.map((s,i) => <Row key={i} label={`Sócio ${i+1}`} value={s}/>)}
              <Row label="Telefone" value={P.telefone}/>
              <Row label="E-mail"   value={P.email}/>
            </Section>
          </Card>
        </div>

        {/* Coluna direita */}
        <div>
          <Card style={{ borderRadius:14, padding:'20px 24px', marginBottom:20 }}>
            <Section icon="✅" title="Verificações ELOS">
              {P.verificacoes.map((v,i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:'1px solid #f3f4f6' }}>
                  <span style={{ color:v.ok?'#22c55e':'#ef4444', fontWeight:700, fontSize:15, flexShrink:0 }}>{v.ok?'✓':'✗'}</span>
                  <span style={{ fontSize:13, color:'#1a1c5e', fontFamily:'DM Sans,sans-serif' }}>{v.label}</span>
                  <span style={{ marginLeft:'auto', fontSize:10, fontWeight:700, fontFamily:'Montserrat,sans-serif', padding:'2px 8px', borderRadius:20, color:v.ok?'#22c55e':'#ef4444', background:v.ok?'#f0fdf4':'#fef2f2' }}>{v.ok?'OK':'Alerta'}</span>
                </div>
              ))}
            </Section>
          </Card>
          <Card style={{ borderRadius:14, padding:'20px 24px' }}>
            <Section icon="📋" title="Documentos">
              {P.docs.map((doc,i) => {
                const sc = STATUS_C[doc.status]||'#9B9B9B'
                const sl = STATUS_L[doc.status]||doc.status
                return (
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 0', borderBottom:'1px solid #f3f4f6' }}>
                    <StatusDot status={doc.status}/>
                    <span style={{ flex:1, fontSize:12, color:'#1a1c5e', fontFamily:'DM Sans,sans-serif' }}>{doc.label}</span>
                    <span style={{ fontSize:10, fontWeight:700, color:sc, background:`${sc}15`, padding:'2px 8px', borderRadius:20, fontFamily:'Montserrat,sans-serif' }}>{sl}</span>
                    {doc.expires && doc.expires !== '—' && <span style={{ fontSize:10, color:'#9B9B9B' }}>{doc.expires}</span>}
                  </div>
                )
              })}
            </Section>
          </Card>
        </div>
      </div>
      {showInvite && <InviteModal onClose={() => setShowInvite(false)}/>}
    </div>
  )
}
