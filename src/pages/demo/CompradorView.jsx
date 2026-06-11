import { useState, useEffect } from 'react'
import { ScoreBar, Spinner, Button, Card } from '../../components/ui.jsx'
import { DEMO_MARKETPLACE } from './demoData.js'

const PRIMATUS = DEMO_MARKETPLACE[0]

/* ── Dossie do Fornecedor ── */
function DossieScreen({ onBack }) {
  const sc = PRIMATUS.score
  return (
    <div>
      <div style={{ background:'#1a1c5e', borderRadius:14, padding:'20px 18px', marginBottom:14 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14 }}>
          <div style={{ width:50, height:50, borderRadius:12, background:'#F47E2F', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:24, color:'#fff', flexShrink:0 }}>PT</div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:15, color:'#fff' }}>{PRIMATUS.razaoSocial}</div>
            <div style={{ fontSize:12, color:'rgba(255,255,255,.5)', marginTop:2 }}>{PRIMATUS.cidade}/{PRIMATUS.uf} · {PRIMATUS.categoria}</div>
          </div>
          <div style={{ textAlign:'right', flexShrink:0 }}>
            <div style={{ fontSize:11, color:'rgba(255,255,255,.5)', fontFamily:'DM Sans,sans-serif' }}>Score</div>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:26, color:'#22c55e', lineHeight:1 }}>{sc}</div>
          </div>
        </div>
        <div style={{ marginBottom:12 }}>
          <div style={{ height:5, background:'rgba(255,255,255,.15)', borderRadius:4, overflow:'hidden' }}>
            <div style={{ width:`${sc}%`, height:'100%', background:'#22c55e', borderRadius:4 }}/>
          </div>
        </div>
        <div style={{ display:'flex', gap:6 }}>
          <span style={{ background:'rgba(244,126,47,.28)', border:'1px solid rgba(244,126,47,.55)', borderRadius:20, padding:'3px 12px', fontSize:10, color:'#F47E2F', fontFamily:'Montserrat,sans-serif', fontWeight:700 }}>{PRIMATUS.selo}</span>
          <span style={{ background:'rgba(255,255,255,.1)', borderRadius:20, padding:'3px 12px', fontSize:10, color:'rgba(255,255,255,.7)', fontFamily:'DM Sans,sans-serif' }}>Membro desde 2023</span>
        </div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:12 }}>
        {['Regularidade fiscal','Reg. trabalhista','Sem listas restritivas','Alvará em dia','CRF/FGTS regular','Certif. ESG'].map(item => (
          <div key={item} style={{ background:'#fff', border:'1px solid #e2e4ef', borderRadius:10, padding:'10px 12px', display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ color:'#22c55e', fontWeight:700, fontSize:15, flexShrink:0 }}>✓</span>
            <span style={{ fontSize:11, color:'#333', fontFamily:'DM Sans,sans-serif', lineHeight:1.3 }}>{item}</span>
          </div>
        ))}
      </div>
      <div style={{ background:'rgba(34,197,94,.12)', border:'1px solid rgba(34,197,94,.33)', borderRadius:30, padding:'9px 16px', display:'flex', gap:8, marginBottom:18, fontSize:12, color:'#22c55e', fontFamily:'DM Sans,sans-serif' }}>
        <span>⚡</span> Última verificação automática: hoje, 09:14
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
        <Button variant="neutral" onClick={onBack}>← Resultados</Button>
        <Button variant="neutral" style={{ color:'#2E3192', border:'2px solid #2E3192' }}>Solicitar cotação</Button>
        <Button variant="orange">Homologar</Button>
      </div>
    </div>
  )
}

/* ── Aba Convidar ── */
function ConvidarTab() {
  const [step, setStep] = useState('form') // form | sending | done
  useEffect(() => {
    if (step === 'sending') {
      const t = setTimeout(() => setStep('done'), 1600)
      return () => clearTimeout(t)
    }
  }, [step])

  const inp = { padding:'11px 14px', borderRadius:10, border:'1.5px solid rgba(46,49,146,.2)', fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#1a1c5e', background:'#fff', width:'100%', boxSizing:'border-box', marginBottom:14, outline:'none' }
  const lbl = { fontSize:11, fontWeight:700, color:'#9B9B9B', textTransform:'uppercase', letterSpacing:.5, marginBottom:6, fontFamily:'Montserrat,sans-serif', display:'block' }

  if (step === 'sending') return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'64px 0' }}>
      <div style={{ marginBottom:20 }}><Spinner size={48}/></div>
      <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:15, color:'#1a1c5e', marginBottom:6 }}>Enviando convite...</div>
      <div style={{ fontSize:13, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>Preparando e-mail com instruções de cadastro</div>
    </div>
  )

  if (step === 'done') return (
    <div style={{ textAlign:'center', padding:'32px 0' }}>
      <div style={{ fontSize:56, marginBottom:16 }}>📨</div>
      <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:20, color:'#1a1c5e', marginBottom:8 }}>Convite enviado!</div>
      <div style={{ fontSize:13, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', marginBottom:24, lineHeight:1.6 }}>
        <strong style={{ color:'#1a1c5e' }}>Construtora ABC Ltda</strong> receberá um e-mail com<br/>instruções para se cadastrar na plataforma ELOS.
      </div>
      <Card style={{ textAlign:'left', marginBottom:20 }}>
        {['Convite registrado no sistema','E-mail enviado ao responsável','Acompanhe o status em Meus Convites','Acesso liberado após cadastro'].map(item => (
          <div key={item} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8, fontSize:13, color:'#166534', fontFamily:'DM Sans,sans-serif' }}>
            <span style={{ color:'#22c55e', fontWeight:700 }}>✓</span> {item}
          </div>
        ))}
      </Card>
      <Button variant="primary" full onClick={() => setStep('form')}>Enviar outro convite</Button>
    </div>
  )

  return (
    <div>
      <div style={{ marginBottom:20 }}>
        <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:18, color:'#1a1c5e', marginBottom:4 }}>Convidar Fornecedor</div>
        <div style={{ fontSize:13, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>Convide um fornecedor para se cadastrar e ser analisado na plataforma ELOS</div>
      </div>
      <Card>
        <label style={lbl}>CNPJ do fornecedor</label>
        <div style={inp}>11.222.333/0001-44</div>
        <label style={lbl}>Razão Social</label>
        <div style={inp}>Construtora ABC Ltda</div>
        <label style={lbl}>E-mail do responsável</label>
        <div style={inp}>joao@construtora-abc.com.br</div>
        <label style={lbl}>Mensagem (opcional)</label>
        <div style={{ ...inp, minHeight:70, alignItems:'flex-start' }}>Olá! Convidamos você a se cadastrar na plataforma ELOS para nosso processo de qualificação.</div>
        <Button variant="primary" full size="lg" onClick={() => setStep('sending')}>📨 Enviar Convite</Button>
      </Card>
    </div>
  )
}

/* ── Main ── */
export default function CompradorView() {
  const [tab,    setTab]    = useState('buscar')
  const [screen, setScreen] = useState('busca')

  useEffect(() => {
    if (screen === 'loading') {
      const t = setTimeout(() => setScreen('resultados'), 1800)
      return () => clearTimeout(t)
    }
  }, [screen])

  const TabBar = () => (
    <div style={{ display:'flex', gap:4, marginBottom:20, background:'#f4f5f9', padding:4, borderRadius:12 }}>
      {[['buscar','🔍 Buscar'],['convidar','📨 Convidar']].map(([id,label]) => (
        <button key={id} onClick={() => { setTab(id); setScreen('busca') }} style={{ flex:1, padding:'9px', borderRadius:9, fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:12, cursor:'pointer', border:'none', transition:'all .2s',
          background:tab===id?'#fff':'transparent', color:tab===id?'#1a1c5e':'#9B9B9B',
          boxShadow:tab===id?'0 2px 8px rgba(0,0,0,.08)':'none' }}>
          {label}
        </button>
      ))}
    </div>
  )

  if (tab === 'convidar') return <div><TabBar/><ConvidarTab/></div>

  /* ── BUSCA ── */
  if (screen === 'loading') return (
    <div>
      <TabBar/>
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'64px 0' }}>
        <div style={{ marginBottom:22 }}><Spinner size={52}/></div>
        <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:16, color:'#1a1c5e', marginBottom:6 }}>Consultando base ELOS...</div>
        <div style={{ fontSize:13, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>Buscando fornecedores qualificados</div>
      </div>
    </div>
  )

  if (screen === 'resultados') return (
    <div>
      <TabBar/>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:16, gap:10 }}>
        <div>
          <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:17, color:'#1a1c5e' }}>6 fornecedores encontrados</div>
          <div style={{ fontSize:12, color:'#9B9B9B', marginTop:3, fontFamily:'DM Sans,sans-serif' }}>Manutenção Industrial · Estado SP · ELOS Verificado</div>
        </div>
        <button onClick={() => setScreen('busca')} style={{ padding:'8px 14px', borderRadius:8, background:'#EEF0FF', color:'#2E3192', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:11, border:'none', cursor:'pointer', whiteSpace:'nowrap', flexShrink:0 }}>
          Nova busca
        </button>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {DEMO_MARKETPLACE.map(s => {
          const clickable = s.id !== 6
          const scoreColor = s.score >= 90 ? '#22c55e' : s.score >= 70 ? '#f59e0b' : '#ef4444'
          const sealColor  = s.id === 6 ? '#9B9B9B' : '#2E3192'
          const sealBg     = s.id === 6 ? '#f1f5f9' : '#EEF0FF'
          const initials   = s.razaoSocial.split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase()
          return (
            <div key={s.id} onClick={() => clickable && setScreen('dossie')}
              style={{ position:'relative', background:'#fff', borderRadius:12, padding:'13px 14px', cursor:clickable?'pointer':'default', border:s.destaque?`2px solid #F47E2F`:`1px solid #e2e4ef`, opacity:s.id===6?0.58:1, transition:'box-shadow .15s' }}
              onMouseOver={e => { if (clickable) e.currentTarget.style.boxShadow='0 3px 16px rgba(46,49,146,.12)' }}
              onMouseOut={e  => { e.currentTarget.style.boxShadow='none' }}>
              {s.destaque && (
                <div style={{ position:'absolute', top:-1, right:12, background:'#F47E2F', color:'#fff', fontSize:8, fontFamily:'Montserrat,sans-serif', fontWeight:700, padding:'3px 10px', borderRadius:'0 0 8px 8px', letterSpacing:.6 }}>★ MELHOR MATCH</div>
              )}
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:38, height:38, borderRadius:10, background:s.destaque?'#F47E2F':'#EEF0FF', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:14, color:s.destaque?'#fff':'#2E3192', flexShrink:0 }}>
                  {initials}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, color:'#1a1c5e', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{s.razaoSocial}</div>
                  <div style={{ fontSize:11, color:'#9B9B9B', marginTop:1, fontFamily:'DM Sans,sans-serif' }}>{s.cidade}/{s.uf} · {s.categoria}</div>
                </div>
                <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4, flexShrink:0 }}>
                  <span style={{ background:sealBg, color:sealColor, fontSize:9, fontFamily:'Montserrat,sans-serif', fontWeight:700, padding:'2px 8px', borderRadius:20 }}>{s.selo}</span>
                  {s.score && <span style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:16, color:scoreColor }}>{s.score}</span>}
                </div>
              </div>
              {s.score && <div style={{ marginTop:8, paddingTop:8, borderTop:'1px solid #f4f5f9' }}><ScoreBar score={s.score}/></div>}
            </div>
          )
        })}
      </div>
    </div>
  )

  if (screen === 'dossie') return <DossieScreen onBack={() => setScreen('resultados')}/>

  /* ── TELA DE BUSCA ── */
  return (
    <div>
      <TabBar/>
      <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:18, color:'#1a1c5e', marginBottom:4 }}>Marketplace</div>
      <div style={{ fontSize:13, color:'#9B9B9B', marginBottom:20, fontFamily:'DM Sans,sans-serif' }}>Encontre fornecedores verificados e qualificados</div>
      <div style={{ position:'relative', marginBottom:10 }}>
        <span style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', fontSize:16, pointerEvents:'none' }}>🔍</span>
        <div style={{ padding:'13px 14px 13px 44px', borderRadius:10, border:'1.5px solid rgba(46,49,146,.27)', fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#1a1c5e', background:'#fff', userSelect:'none' }}>
          Manutenção Industrial
        </div>
      </div>
      <div style={{ display:'flex', gap:8, marginBottom:20, flexWrap:'wrap' }}>
        {['Estado: SP ×','ELOS Verificado ×'].map(tag => (
          <span key={tag} style={{ background:'#EEF0FF', color:'#2E3192', fontSize:11, fontFamily:'Montserrat,sans-serif', fontWeight:700, padding:'5px 12px', borderRadius:20 }}>{tag}</span>
        ))}
      </div>
      <Button variant="orange" full size="lg" style={{ marginBottom:24 }} onClick={() => setScreen('loading')}>🔍 Buscar fornecedores</Button>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
        {[['6.240+','Fornecedores ELOS'],['1.847','Verificados hoje'],['148','Categorias']].map(([v,l]) => (
          <div key={l} style={{ background:'#fff', border:'1px solid #e2e4ef', borderRadius:12, padding:'16px 10px', textAlign:'center', boxShadow:'0 1px 6px rgba(46,49,146,.06)' }}>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:22, color:'#F47E2F' }}>{v}</div>
            <div style={{ fontSize:11, color:'#9B9B9B', marginTop:4, lineHeight:1.3, fontFamily:'DM Sans,sans-serif' }}>{l}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
