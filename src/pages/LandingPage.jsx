import { useState, useEffect, useRef } from 'react'
import { useIsMobile } from '../hooks/useIsMobile.js'
import { useNavigate } from 'react-router-dom'

const C = {
  navy:   '#0d1240',
  blue:   '#2E3192',
  orange: '#F47E2F',
  white:  '#FFFFFF',
  grey:   '#9B9B9B',
  light:  '#f0f2ff',
  green:  '#059669',
}

function useFadeIn() {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true) }, { threshold: 0.12 })
    if (ref.current) obs.observe(ref.current)
    return () => obs.disconnect()
  }, [])
  return [ref, visible]
}

function FadeIn({ children, delay = 0, style = {} }) {
  const [ref, visible] = useFadeIn()
  return (
    <div ref={ref} style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(28px)', transition: `opacity .7s ease ${delay}s, transform .7s ease ${delay}s`, ...style }}>
      {children}
    </div>
  )
}

function Badge({ children, color = C.orange }) {
  return (
    <span style={{ display:'inline-block', background:`${color}22`, color, fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:11, letterSpacing:1.5, textTransform:'uppercase', padding:'5px 14px', borderRadius:20, border:`1px solid ${color}44`, marginBottom:20 }}>
      {children}
    </span>
  )
}

function Stat({ value, label }) {
  return (
    <div style={{ textAlign:'center', padding:'0 24px' }}>
      <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:40, color:C.orange, lineHeight:1 }}>{value}</div>
      <div style={{ fontSize:13, color:'rgba(255,255,255,.55)', marginTop:6, fontFamily:'DM Sans,sans-serif', maxWidth:130, margin:'6px auto 0', lineHeight:1.4 }}>{label}</div>
    </div>
  )
}

function Check({ dark }) {
  return <span style={{ color: dark ? C.orange : C.orange, fontWeight:700, flexShrink:0 }}>✓</span>
}

function ClientLogo({ name }) {
  return (
    <div style={{ padding:'10px 22px', background:'rgba(255,255,255,.06)', borderRadius:10, border:'1px solid rgba(255,255,255,.1)', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, color:'rgba(255,255,255,.5)', letterSpacing:.5 }}>
      {name}
    </div>
  )
}

// ── Seção de plano ──────────────────────────────────────────────────────────
function PlanCard({ name, badge, price, period, sub, features, highlight, cta, onCta, tag }) {
  const [hover, setHover] = useState(false)
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ flex:'1 1 280px', maxWidth:340, borderRadius:22, padding:32, position:'relative', overflow:'hidden', transition:'transform .2s, box-shadow .2s',
        background: highlight ? `linear-gradient(150deg, ${C.blue} 0%, ${C.navy} 100%)` : '#fff',
        border: highlight ? 'none' : `2px solid ${hover ? C.blue+'55' : '#e2e4ef'}`,
        boxShadow: highlight ? `0 24px 64px ${C.blue}44` : hover ? `0 12px 40px ${C.blue}14` : '0 4px 20px rgba(0,0,0,.05)',
        transform: hover ? 'translateY(-4px)' : 'none',
      }}>
      {tag && (
        <div style={{ position:'absolute', top:20, right:20, background:C.orange, color:'#fff', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:10, padding:'4px 12px', borderRadius:20, letterSpacing:1 }}>{tag}</div>
      )}
      <div style={{ fontSize:11, fontFamily:'Montserrat,sans-serif', fontWeight:700, letterSpacing:1.5, color: highlight ? `${C.orange}` : C.blue, textTransform:'uppercase', marginBottom:8 }}>{badge}</div>
      <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:24, color: highlight ? '#fff' : C.navy, marginBottom:4 }}>{name}</div>
      <div style={{ marginBottom:24 }}>
        <span style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:38, color:C.orange }}>
          {price === 0 ? 'Grátis' : `R$ ${price.toLocaleString('pt-BR')}`}
        </span>
        {price > 0 && <span style={{ fontSize:14, color: highlight ? 'rgba(255,255,255,.45)' : C.grey }}>{period}</span>}
        {sub && <div style={{ fontSize:12, color: highlight ? 'rgba(255,255,255,.4)' : '#aaa', marginTop:4 }}>{sub}</div>}
      </div>
      <ul style={{ listStyle:'none', padding:0, margin:'0 0 28px', display:'flex', flexDirection:'column', gap:9 }}>
        {features.map((f, i) => (
          <li key={i} style={{ display:'flex', alignItems:'flex-start', gap:10, fontSize:13.5, color: highlight ? 'rgba(255,255,255,.8)' : '#555', fontFamily:'DM Sans,sans-serif', lineHeight:1.4 }}>
            <Check dark={highlight} /> {f}
          </li>
        ))}
      </ul>
      <button onClick={onCta}
        style={{ width:'100%', padding:'14px', borderRadius:12, fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:14, cursor:'pointer', transition:'all .2s',
          background: highlight ? C.orange : C.blue, color:'#fff', border:'none',
          boxShadow: highlight ? `0 8px 24px ${C.orange}55` : `0 4px 16px ${C.blue}33` }}>
        {cta}
      </button>
    </div>
  )
}

// ── Landing Page ─────────────────────────────────────────────────────────────
export default function LandingPage() {
  const navigate = useNavigate()
  const mobile = useIsMobile()
  const [navOpen,   setNavOpen]   = useState(false)
  const [planTab,   setPlanTab]   = useState('fornecedor') // 'fornecedor' | 'comprador'
  const [email,     setEmail]     = useState('')
  const [empresa,   setEmpresa]   = useState('')
  const [sending,   setSending]   = useState(false)
  const [sent,      setSent]      = useState(false)
  const [heroRef,   heroVisible]  = useFadeIn()

  const handleContactSubmit = async (e) => {
    e.preventDefault()
    setSending(true)
    try {
      await fetch('/.netlify/functions/contact-buyer', {
        method:'POST', headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ email, empresa })
      })
    } catch {}
    setSent(true)
    setSending(false)
  }

  const navLinks = [
    ['#como-funciona','Como funciona'],
    ['#planos','Planos'],
    ['#sobre','Sobre'],
  ]

  return (
    <div style={{ fontFamily:'DM Sans,sans-serif', overflowX:'hidden', background:'#fff' }}>

      {/* ── NAV ──────────────────────────────────────────────────────────── */}
      <nav style={{ position:'fixed', top:0, left:0, right:0, zIndex:100, background:'rgba(13,18,64,.96)', backdropFilter:'blur(14px)', borderBottom:'1px solid rgba(255,255,255,.07)', padding:'0 5%', display:'flex', alignItems:'center', justifyContent:'space-between', height:70 }}>
        <img src="/logo.png" alt="SIGEC-ELOS" style={{ height:44, objectFit:'contain', objectPosition:'left' }} />
        {mobile ? (
          <div style={{ position:'relative' }}>
            <button onClick={() => setNavOpen(o=>!o)}
              style={{ background:'rgba(255,255,255,.08)', border:'1px solid rgba(255,255,255,.12)', borderRadius:8, padding:'7px 12px', cursor:'pointer', color:'#fff', fontSize:18 }}>
              {navOpen ? '✕' : '☰'}
            </button>
            {navOpen && (
              <div style={{ position:'fixed', top:70, left:0, right:0, background:'rgba(13,18,64,.99)', backdropFilter:'blur(14px)', padding:'16px 5% 24px', display:'flex', flexDirection:'column', gap:4, zIndex:99 }}>
                {navLinks.map(([h,l]) => (
                  <a key={h} href={h} onClick={() => setNavOpen(false)} style={{ color:'rgba(255,255,255,.75)', fontSize:16, textDecoration:'none', padding:'10px 0', borderBottom:'1px solid rgba(255,255,255,.05)' }}>{l}</a>
                ))}
                <div style={{ display:'flex', flexDirection:'column', gap:8, marginTop:12 }}>
                  <button onClick={() => navigate('/login')} style={{ padding:'12px', borderRadius:10, background:'rgba(255,255,255,.08)', color:'#fff', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:14, border:'1px solid rgba(255,255,255,.12)', cursor:'pointer' }}>Entrar</button>
                  <button onClick={() => { setNavOpen(false); navigate('/cadastro?type=buyer') }} style={{ padding:'12px', borderRadius:10, background:'rgba(255,255,255,.12)', color:'#fff', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:14, border:'1px solid rgba(255,255,255,.2)', cursor:'pointer' }}>🛒 Cadastrar como Comprador →</button>
                  <button onClick={() => { setNavOpen(false); navigate('/cadastro') }} style={{ padding:'12px', borderRadius:10, background:C.orange, color:'#fff', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:14, border:'none', cursor:'pointer' }}>🏭 Cadastrar como Fornecedor →</button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ display:'flex', gap:6, alignItems:'center' }}>
            {navLinks.map(([h,l]) => (
              <a key={h} href={h} style={{ color:'rgba(255,255,255,.55)', fontSize:13, textDecoration:'none', padding:'6px 12px', borderRadius:8, transition:'color .15s' }}
                onMouseOver={e => e.target.style.color='rgba(255,255,255,.9)'}
                onMouseOut={e => e.target.style.color='rgba(255,255,255,.55)'}>{l}</a>
            ))}
            <button onClick={() => navigate('/login')}
              style={{ padding:'8px 20px', borderRadius:9, background:'rgba(255,255,255,.08)', color:'#fff', fontFamily:'Montserrat,sans-serif', fontWeight:600, fontSize:13, border:'1px solid rgba(255,255,255,.12)', cursor:'pointer', marginLeft:8 }}>
              Entrar
            </button>
            <button onClick={() => navigate('/cadastro?type=buyer')}
              style={{ padding:'8px 20px', borderRadius:9, background:'rgba(255,255,255,.1)', color:'rgba(255,255,255,.9)', fontFamily:'Montserrat,sans-serif', fontWeight:600, fontSize:13, border:'1px solid rgba(255,255,255,.2)', cursor:'pointer' }}>
              Sou Comprador
            </button>
            <button onClick={() => navigate('/cadastro')}
              style={{ padding:'8px 22px', borderRadius:9, background:C.orange, color:'#fff', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, border:'none', cursor:'pointer', boxShadow:`0 4px 16px ${C.orange}44` }}>
              Sou Fornecedor →
            </button>
          </div>
        )}
      </nav>

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section style={{ minHeight:'100vh', background:`linear-gradient(155deg, ${C.navy} 0%, #1a1f6e 55%, #0d1240 100%)`, display:'flex', alignItems:'center', paddingTop:70, position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', inset:0, opacity:.035, backgroundImage:'radial-gradient(circle, #F47E2F 1px, transparent 1px)', backgroundSize:'52px 52px' }}/>
        <div style={{ position:'absolute', top:0, right:0, width:'50vw', height:'100%', background:`radial-gradient(ellipse at top right, ${C.orange}18 0%, transparent 60%)` }}/>
        <div style={{ maxWidth:1200, margin:'0 auto', padding:'80px 5%', display:'flex', gap:80, alignItems:'center', flexWrap:'wrap', position:'relative', width:'100%' }}>

          {/* Copy */}
          <div ref={heroRef} style={{ flex:'1 1 480px', opacity:heroVisible?1:0, transform:heroVisible?'translateY(0)':'translateY(36px)', transition:'all .9s ease' }}>
            <Badge>Marketplace B2B · Pré-Homologação · Gestão de Fornecedores</Badge>
            <h1 style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:'clamp(34px,4.5vw,60px)', color:'#fff', lineHeight:1.1, margin:'0 0 24px', letterSpacing:-1 }}>
              Conecte fornecedores<br/>e compradores com<br/><span style={{ color:C.orange }}>confiança e agilidade</span>
            </h1>
            <p style={{ fontSize:17, color:'rgba(255,255,255,.68)', lineHeight:1.75, margin:'0 0 36px', maxWidth:500 }}>
              A ELOS é a plataforma que digitaliza e automatiza toda a jornada de homologação — do cadastro do fornecedor ao marketplace acessado por compradores das maiores empresas do Brasil.
            </p>
            <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
              <button onClick={() => navigate('/cadastro')}
                style={{ padding:'16px 36px', borderRadius:12, background:C.orange, color:'#fff', fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:15, border:'none', cursor:'pointer', boxShadow:`0 12px 36px ${C.orange}55`, transition:'transform .2s' }}
                onMouseOver={e=>e.currentTarget.style.transform='scale(1.04)'} onMouseOut={e=>e.currentTarget.style.transform='scale(1)'}>
                Cadastre sua empresa →
              </button>
              <a href="#como-funciona"
                style={{ padding:'16px 28px', borderRadius:12, background:'rgba(255,255,255,.07)', color:'rgba(255,255,255,.82)', fontFamily:'Montserrat,sans-serif', fontWeight:600, fontSize:14, textDecoration:'none', border:'1px solid rgba(255,255,255,.14)', display:'flex', alignItems:'center', gap:8 }}>
                Como funciona
              </a>
            </div>
            {/* Micro-social proof */}
            <div style={{ display:'flex', gap:20, marginTop:36, flexWrap:'wrap' }}>
              {[['🏅','Selos Verificado & Homologado'],['🔍','Marketplace filtrado por CNAE'],['📝','RFQ para compradores Pro']].map(([ic,tx]) => (
                <div key={tx} style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, color:'rgba(255,255,255,.45)', fontFamily:'DM Sans,sans-serif' }}>
                  <span style={{ fontSize:15 }}>{ic}</span> {tx}
                </div>
              ))}
            </div>
          </div>

          {/* Card mockup */}
          <div style={{ flex:'1 1 300px', opacity:heroVisible?1:0, transform:heroVisible?'translateX(0)':'translateX(40px)', transition:'all .9s ease .3s', maxWidth:380 }}>
            <div style={{ background:'rgba(255,255,255,.06)', backdropFilter:'blur(20px)', borderRadius:24, padding:28, border:'1px solid rgba(255,255,255,.1)', boxShadow:'0 24px 80px rgba(0,0,0,.4)' }}>
              <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:22 }}>
                <div style={{ width:44, height:44, borderRadius:11, background:`linear-gradient(135deg,${C.blue},${C.orange})`, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:900, color:'#fff', fontSize:20 }}>F</div>
                <div>
                  <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, color:'#fff', fontSize:13 }}>Fornecedor LTDA</div>
                  <div style={{ fontSize:11, color:'rgba(255,255,255,.45)' }}>CNPJ 00.000.000/0001-00</div>
                </div>
                <div style={{ marginLeft:'auto' }}>
                  <span style={{ background:'rgba(244,126,47,.18)', border:'1px solid rgba(244,126,47,.35)', borderRadius:20, padding:'3px 11px', fontSize:10, color:C.orange, fontFamily:'Montserrat,sans-serif', fontWeight:700, display:'block', whiteSpace:'nowrap' }}>Homologado</span>
                </div>
              </div>
              {[['Cartão CNPJ','✅ Válido'],['CRF FGTS','✅ Regular'],['CND Federal','✅ Negativa'],['Simples Nacional','✅ Optante'],['Certidão Trabalhista','✅ Negativa']].map(([doc,s]) => (
                <div key={doc} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid rgba(255,255,255,.05)', fontSize:12, color:'rgba(255,255,255,.65)' }}>
                  <span>{doc}</span><span style={{ color:'#22c55e', fontWeight:600 }}>{s}</span>
                </div>
              ))}
              <div style={{ marginTop:18, background:`linear-gradient(135deg,${C.orange},#ff9f50)`, borderRadius:11, padding:'13px 18px', display:'flex', alignItems:'center', gap:12 }}>
                <span style={{ fontSize:22 }}>🏅</span>
                <div>
                  <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, color:'#fff', fontSize:14 }}>Selo ELOS Homologado</div>
                  <div style={{ fontSize:11, color:'rgba(255,255,255,.75)', marginTop:2 }}>Visível no marketplace para compradores</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── STATS ────────────────────────────────────────────────────────── */}
      <section style={{ background:C.navy, padding:'48px 5%' }}>
        <FadeIn>
          <div style={{ maxWidth:1000, margin:'0 auto', display:'flex', justifyContent:'space-around', flexWrap:'wrap', gap:32 }}>
            <Stat value="+60K"  label="Fornecedores na base EQPI" />
            <Stat value="+7.2M" label="Documentos analisados" />
            <Stat value="31%"   label="Redução de risco na contratação" />
            <Stat value="10+"   label="Anos de experiência em homologação" />
          </div>
        </FadeIn>
      </section>

      {/* ── TRÊS PERFIS ──────────────────────────────────────────────────── */}
      <section style={{ padding:'100px 5%', background:'#fff' }}>
        <div style={{ maxWidth:1100, margin:'0 auto' }}>
          <FadeIn>
            <div style={{ textAlign:'center', marginBottom:64 }}>
              <Badge>Uma plataforma, três perfis</Badge>
              <h2 style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:'clamp(28px,4vw,48px)', color:C.navy, margin:'0 0 16px', letterSpacing:-0.5 }}>
                Para cada papel na cadeia de fornecimento
              </h2>
              <p style={{ fontSize:16, color:'#666', maxWidth:540, margin:'0 auto', lineHeight:1.7 }}>
                Fornecedores se homologam, compradores encontram quem precisam, empresas gerenciam seus processos — tudo integrado.
              </p>
            </div>
          </FadeIn>

          <div style={{ display:'flex', gap:24, flexWrap:'wrap' }}>
            {[
              {
                icon:'🏭', color: C.blue,
                title:'Fornecedor',
                sub:'Seja encontrado e homologado',
                features:['Perfil no marketplace B2B','Coleta automática de certidões (CNPJ, Simples, FGTS)','Selo ELOS Verificado ou Homologado','Documentação digital organizada','Participe de múltiplos processos de clientes'],
              },
              {
                icon:'🔍', color: C.orange,
                title:'Comprador',
                sub:'Encontre fornecedores qualificados',
                features:['Marketplace com filtros avançados (CNAE, região, porte, selos)','Busca por geolocalização e capital social','RFQ — solicite cotações para múltiplos fornecedores','Plano Comprador Free ou Pro','Acesse fornecedores Verificados e Homologados'],
              },
              {
                icon:'🏢', color: C.green,
                title:'Empresa / Cliente',
                sub:'Gerencie seus processos de homologação',
                features:['Portal exclusivo com seus fornecedores','Convide e acompanhe fornecedores tagueados','Fluxo de documentos personalizado por processo','Questionários customizados','Integração com SIGEC-HOC'],
              },
            ].map((p, i) => (
              <FadeIn key={p.title} delay={i * .1} style={{ flex:'1 1 280px' }}>
                <div style={{ padding:28, borderRadius:20, border:`1.5px solid ${p.color}22`, height:'100%', background:'#fafbff', boxSizing:'border-box', transition:'box-shadow .2s, transform .2s' }}
                  onMouseOver={e=>{ e.currentTarget.style.boxShadow=`0 10px 36px ${p.color}1a`; e.currentTarget.style.transform='translateY(-4px)' }}
                  onMouseOut={e=>{ e.currentTarget.style.boxShadow='none'; e.currentTarget.style.transform='none' }}>
                  <div style={{ width:52, height:52, borderRadius:14, background:`${p.color}14`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, marginBottom:18 }}>{p.icon}</div>
                  <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:19, color:C.navy, marginBottom:4 }}>{p.title}</div>
                  <div style={{ fontSize:13, color:p.color, fontWeight:600, marginBottom:18 }}>{p.sub}</div>
                  <ul style={{ listStyle:'none', padding:0, margin:0, display:'flex', flexDirection:'column', gap:8 }}>
                    {p.features.map((f, j) => (
                      <li key={j} style={{ display:'flex', alignItems:'flex-start', gap:9, fontSize:13, color:'#555', fontFamily:'DM Sans,sans-serif', lineHeight:1.4 }}>
                        <span style={{ color:p.color, fontWeight:700, flexShrink:0 }}>✓</span> {f}
                      </li>
                    ))}
                  </ul>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── COMO FUNCIONA ────────────────────────────────────────────────── */}
      <section id="como-funciona" style={{ padding:'100px 5%', background:C.light }}>
        <div style={{ maxWidth:1100, margin:'0 auto' }}>
          <FadeIn>
            <div style={{ textAlign:'center', marginBottom:64 }}>
              <Badge>Passo a passo</Badge>
              <h2 style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:'clamp(28px,4vw,46px)', color:C.navy, margin:0, letterSpacing:-0.5 }}>Como funciona para o fornecedor</h2>
            </div>
          </FadeIn>
          <div style={{ display:'flex', gap:40, flexWrap:'wrap', justifyContent:'center' }}>
            {[
              { n:1, icon:'📋', title:'Cadastre sua empresa', desc:'Informe o CNPJ. O sistema consulta Receita Federal, CEIS, CNEP e Simples Nacional automaticamente em segundos.' },
              { n:2, icon:'📄', title:'Envie a documentação', desc:'Certidões são coletadas automaticamente. Faça upload apenas dos documentos específicos da sua categoria de atuação.' },
              { n:3, icon:'⚡', title:'Escolha seu Selo', desc:'ELOS Verificado: ativo imediatamente após o pagamento. ELOS Homologado: análise humana para maior credibilidade.' },
              { n:4, icon:'🤝', title:'Faça negócios', desc:'Apareça no marketplace, receba RFQs de compradores e participe de processos de homologação de grandes empresas.' },
            ].map((s, i) => (
              <FadeIn key={i} delay={i * .1} style={{ flex:'1 1 220px', maxWidth:260 }}>
                <div style={{ width:54, height:54, borderRadius:15, background:`linear-gradient(135deg,${C.blue},${C.orange})`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, marginBottom:18, boxShadow:`0 8px 24px ${C.orange}33` }}>{s.icon}</div>
                <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:10, color:C.orange, letterSpacing:1.8, marginBottom:6 }}>PASSO {s.n}</div>
                <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:18, color:C.navy, marginBottom:8 }}>{s.title}</div>
                <div style={{ fontSize:14, color:'#666', lineHeight:1.65 }}>{s.desc}</div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── PLANOS ───────────────────────────────────────────────────────── */}
      <section id="planos" style={{ padding:'100px 5%', background:'#fff' }}>
        <div style={{ maxWidth:1100, margin:'0 auto' }}>
          <FadeIn>
            <div style={{ textAlign:'center', marginBottom:48 }}>
              <Badge>Planos e preços</Badge>
              <h2 style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:'clamp(28px,4vw,48px)', color:C.navy, margin:'0 0 16px', letterSpacing:-0.5 }}>Transparência total nos preços</h2>
              <p style={{ fontSize:16, color:C.grey, maxWidth:480, margin:'0 auto 36px' }}>Escolha o perfil para ver os planos disponíveis.</p>
              {/* Tab */}
              <div style={{ display:'inline-flex', background:C.light, borderRadius:14, padding:4, gap:4 }}>
                {[['fornecedor','🏭 Fornecedor'],['comprador','🔍 Comprador']].map(([v,l]) => (
                  <button key={v} onClick={() => setPlanTab(v)}
                    style={{ padding:'10px 24px', borderRadius:11, fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, cursor:'pointer', transition:'all .2s', border:'none',
                      background: planTab === v ? C.blue : 'transparent',
                      color: planTab === v ? '#fff' : C.grey,
                      boxShadow: planTab === v ? `0 4px 16px ${C.blue}33` : 'none' }}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
          </FadeIn>

          {/* Fornecedor */}
          {planTab === 'fornecedor' && (
            <div style={{ display:'flex', gap:24, flexWrap:'wrap', justifyContent:'center', alignItems:'stretch' }}>
              <FadeIn delay={.05}>
                <PlanCard
                  badge="ELOS Verificado"
                  name="Verificado"
                  price={199}
                  period="/ano"
                  sub="ou R$ 29/mês"
                  features={[
                    'Perfil no marketplace ELOS',
                    'Coleta automática de certidões',
                    'Selo Verificado ativo imediatamente',
                    'Sem análise manual — 100% automático',
                    'Visível a compradores Free e Pro',
                    'Suporte por e-mail',
                  ]}
                  cta="Começar com Verificado →"
                  onCta={() => navigate('/cadastro')}
                />
              </FadeIn>
              <FadeIn delay={.15}>
                <PlanCard
                  badge="ELOS Homologado"
                  name="Homologado"
                  price={690}
                  period="/ano"
                  tag="MAIS CREDIBILIDADE"
                  highlight
                  features={[
                    'Tudo do plano Verificado',
                    'Análise documental por especialistas EQPI',
                    'Selo Homologado — maior confiança',
                    'Destaque nos resultados de busca',
                    'Integração automática com SIGEC-HOC',
                    'Monitoramento mensal de certidões',
                    'Suporte prioritário',
                    'Participe de processos de grandes empresas',
                  ]}
                  cta="Começar com Homologado →"
                  onCta={() => navigate('/cadastro')}
                />
              </FadeIn>
              <FadeIn delay={.25}>
                <div style={{ flex:'1 1 280px', maxWidth:340, borderRadius:22, padding:32, background:C.light, border:`2px solid ${C.blue}18`, display:'flex', flexDirection:'column', justifyContent:'space-between' }}>
                  <div>
                    <div style={{ fontSize:11, fontFamily:'Montserrat,sans-serif', fontWeight:700, letterSpacing:1.5, color:C.green, textTransform:'uppercase', marginBottom:8 }}>Fornecedor Convidado</div>
                    <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:24, color:C.navy, marginBottom:4 }}>Preço Personalizado</div>
                    <div style={{ fontSize:13, color:'#666', lineHeight:1.6, marginBottom:24 }}>
                      Se você foi convidado por uma empresa que usa a ELOS (ou chegou por um portal exclusivo), o preço de homologação é definido pelo contratante — pode ser subsidiado integralmente.
                    </div>
                    <ul style={{ listStyle:'none', padding:0, margin:'0 0 28px', display:'flex', flexDirection:'column', gap:8 }}>
                      {['Acesso pelo link de convite da empresa','Preço definido pelo contratante','Processo de homologação personalizado','Integrado ao portal da empresa'].map((f,i) => (
                        <li key={i} style={{ display:'flex', gap:9, fontSize:13, color:'#555' }}><span style={{ color:C.green, fontWeight:700 }}>✓</span> {f}</li>
                      ))}
                    </ul>
                  </div>
                  <button onClick={() => navigate('/cadastro')}
                    style={{ width:'100%', padding:'14px', borderRadius:12, background:C.green, color:'#fff', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:14, border:'none', cursor:'pointer' }}>
                    Verificar meu convite →
                  </button>
                </div>
              </FadeIn>
            </div>
          )}

          {/* Comprador */}
          {planTab === 'comprador' && (
            <div style={{ display:'flex', gap:24, flexWrap:'wrap', justifyContent:'center', alignItems:'stretch' }}>
              <FadeIn delay={.05}>
                <PlanCard
                  badge="Comprador"
                  name="Free"
                  price={0}
                  features={[
                    'Acesso ao marketplace de fornecedores',
                    'Filtros por CNAE, categoria, estado',
                    'Ver perfil completo dos fornecedores',
                    'Visualizar selos e certidões',
                    'Sem limite de buscas',
                  ]}
                  cta="Criar conta gratuita →"
                  onCta={() => navigate('/cadastro?type=buyer')}
                />
              </FadeIn>
              <FadeIn delay={.15}>
                <PlanCard
                  badge="Comprador"
                  name="Pro"
                  price={1990}
                  period="/ano"
                  sub="ou R$ 199/mês"
                  tag="MAIS COMPLETO"
                  highlight
                  features={[
                    'Tudo do plano Free',
                    'RFQ — solicite cotações para múltiplos fornecedores',
                    'Filtros avançados: geolocalização, capital social, Simples',
                    'Comparador de fornecedores',
                    'Filtro por selos de cliente (processos de homologação)',
                    'Exportação de resultados',
                    'Suporte prioritário',
                  ]}
                  cta="Assinar Comprador Pro →"
                  onCta={() => navigate('/cadastro?type=buyer')}
                />
              </FadeIn>
              <FadeIn delay={.25}>
                <div style={{ flex:'1 1 280px', maxWidth:340, borderRadius:22, padding:32, background:C.light, border:`2px solid ${C.blue}18`, display:'flex', flexDirection:'column', justifyContent:'space-between' }}>
                  <div>
                    <div style={{ fontSize:11, fontFamily:'Montserrat,sans-serif', fontWeight:700, letterSpacing:1.5, color:C.blue, textTransform:'uppercase', marginBottom:8 }}>Empresa / Cliente Corporativo</div>
                    <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:24, color:C.navy, marginBottom:4 }}>Portal Exclusivo</div>
                    <div style={{ fontSize:13, color:'#666', lineHeight:1.6, marginBottom:24 }}>
                      Gerencie seus próprios processos de homologação. Convide fornecedores, defina fluxos documentais e tenha um portal com sua marca — integrado ao SIGEC-HOC.
                    </div>
                    <ul style={{ listStyle:'none', padding:0, margin:'0 0 28px', display:'flex', flexDirection:'column', gap:8 }}>
                      {['Portal personalizado com logo da empresa','Convite e gestão de fornecedores','Fluxo de documentos sob medida','Questionários customizados','Integração SIGEC-HOC'].map((f,i) => (
                        <li key={i} style={{ display:'flex', gap:9, fontSize:13, color:'#555' }}><span style={{ color:C.blue, fontWeight:700 }}>✓</span> {f}</li>
                      ))}
                    </ul>
                  </div>
                  <a href="#compradores"
                    style={{ display:'block', width:'100%', padding:'14px', borderRadius:12, background:C.blue, color:'#fff', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:14, border:'none', cursor:'pointer', textAlign:'center', textDecoration:'none', boxSizing:'border-box' }}>
                    Falar com comercial →
                  </a>
                </div>
              </FadeIn>
            </div>
          )}

          <FadeIn delay={.3}>
            <p style={{ textAlign:'center', marginTop:32, fontSize:13, color:C.grey }}>
              Pagamento via cartão de crédito, boleto ou PIX pelo Stripe · Cancelamento a qualquer momento
            </p>
          </FadeIn>
        </div>
      </section>

      {/* ── SELOS ────────────────────────────────────────────────────────── */}
      <section style={{ padding:'80px 5%', background:C.navy }}>
        <div style={{ maxWidth:900, margin:'0 auto' }}>
          <FadeIn>
            <div style={{ textAlign:'center', marginBottom:48 }}>
              <Badge color="rgba(255,255,255,.6)">Selos de qualificação</Badge>
              <h2 style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:'clamp(24px,3.5vw,40px)', color:'#fff', margin:'0 0 12px', letterSpacing:-0.5 }}>
                Dois níveis de certificação ELOS
              </h2>
              <p style={{ fontSize:15, color:'rgba(255,255,255,.5)', maxWidth:500, margin:'0 auto' }}>
                Do automático ao especialista — escolha o nível de confiança que sua empresa quer transmitir.
              </p>
            </div>
          </FadeIn>
          <div style={{ display:'flex', gap:24, flexWrap:'wrap', justifyContent:'center' }}>
            {[
              {
                seal:'✅', label:'ELOS Verificado', color:'#2E3192',
                price:'R$199/ano ou R$29/mês',
                desc:'Verificação automática via Receita Federal, CEIS, CNEP e BrasilAPI. Selo ativo imediatamente após o pagamento.',
                items:['Cartão CNPJ ativo','Simples Nacional','Análise de CNAEs','Sem pendências graves em listas públicas'],
              },
              {
                seal:'🏅', label:'ELOS Homologado', color:C.orange,
                price:'R$690/ano',
                desc:'Tudo do Verificado + análise documental por especialistas EQPI. Maior credibilidade junto a compradores corporativos.',
                items:['Documentação completa analisada','CND Trabalhista, Federal e Estadual','Certidão FGTS','Dados financeiros e dados bancários','Score de homologação calculado'],
              },
            ].map((s, i) => (
              <FadeIn key={s.label} delay={i * .15} style={{ flex:'1 1 340px', maxWidth:420 }}>
                <div style={{ background:'rgba(255,255,255,.04)', border:`1px solid rgba(255,255,255,.1)`, borderRadius:20, padding:28, height:'100%', boxSizing:'border-box' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
                    <span style={{ fontSize:32 }}>{s.seal}</span>
                    <div>
                      <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:18, color:'#fff' }}>{s.label}</div>
                      <div style={{ fontSize:12, color:s.color, fontWeight:600, marginTop:2 }}>{s.price}</div>
                    </div>
                  </div>
                  <p style={{ fontSize:13, color:'rgba(255,255,255,.55)', lineHeight:1.65, marginBottom:18 }}>{s.desc}</p>
                  <ul style={{ listStyle:'none', padding:0, margin:0, display:'flex', flexDirection:'column', gap:7 }}>
                    {s.items.map((it, j) => (
                      <li key={j} style={{ display:'flex', gap:8, fontSize:13, color:'rgba(255,255,255,.7)' }}>
                        <span style={{ color:s.color, fontWeight:700 }}>✓</span> {it}
                      </li>
                    ))}
                  </ul>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── CLIENTES ─────────────────────────────────────────────────────── */}
      <section style={{ padding:'64px 5%', background:'#fff' }}>
        <div style={{ maxWidth:900, margin:'0 auto', textAlign:'center' }}>
          <FadeIn>
            <div style={{ fontSize:12, color:C.grey, fontFamily:'Montserrat,sans-serif', fontWeight:700, letterSpacing:2, textTransform:'uppercase', marginBottom:32 }}>
              Compradores que já usam o ecossistema EQPI Tech
            </div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:10, justifyContent:'center' }}>
              {['AngloGold Ashanti','CSN','Kinross','Yamana Gold','Lundin Mining','AES','Atlantic','Aura Minerals','Sapura'].map(n => <ClientLogo key={n} name={n} />)}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── SOBRE A EQPI ─────────────────────────────────────────────────── */}
      <section id="sobre" style={{ padding:'100px 5%', background:C.light }}>
        <div style={{ maxWidth:1000, margin:'0 auto', display:'flex', gap:64, flexWrap:'wrap', alignItems:'center' }}>
          <FadeIn style={{ flex:'1 1 320px' }}>
            <Badge>Quem somos</Badge>
            <h2 style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:'clamp(24px,3.5vw,40px)', color:C.navy, margin:'0 0 20px', letterSpacing:-0.5 }}>
              10 anos transformando a gestão de fornecedores
            </h2>
            <p style={{ fontSize:15, color:'#666', lineHeight:1.75, margin:'0 0 16px' }}>
              A EQPI Tech nasceu em 2014 com a missão de digitalizar a gestão de contratos e fornecedores nas maiores operações do Brasil. Entregamos o ecossistema completo: SIGEC-HOC, SIGEC-WEB, BC Report e SIGEC-ELOS.
            </p>
            <p style={{ fontSize:15, color:'#666', lineHeight:1.75 }}>
              Com mais de 60 mil fornecedores na base e 7,2 bilhões de documentos analisados, somos referência em compliance e homologação nos setores de mineração, energia e indústria.
            </p>
            <a href="https://eqpitech.com.br" target="_blank" rel="noopener noreferrer"
              style={{ display:'inline-block', marginTop:24, color:C.blue, fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:14, textDecoration:'none' }}>
              Conheça a EQPI Tech →
            </a>
          </FadeIn>
          <FadeIn delay={.2} style={{ flex:'1 1 260px' }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
              {[['2014','Fundação da Equipo Info'],['2016','SIGEC-HOC lançado'],['2021','BC Report lançado'],['2025','Nasce a EQPI Tech & ELOS']].map(([year, ev]) => (
                <div key={year} style={{ padding:20, borderRadius:14, background:'#fff', border:`1px solid ${C.blue}18`, boxShadow:'0 2px 12px rgba(46,49,146,.06)' }}>
                  <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:24, color:C.orange }}>{year}</div>
                  <div style={{ fontSize:12, color:'#666', marginTop:6, lineHeight:1.4 }}>{ev}</div>
                </div>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── COMPRADORES ──────────────────────────────────────────────────── */}
      <section id="compradores" style={{ padding:'100px 5%', background:'#fff' }}>
        <div style={{ maxWidth:980, margin:'0 auto' }}>
          <FadeIn>
            <div style={{ textAlign:'center', marginBottom:56 }}>
              <Badge>Para compradores e empresas</Badge>
              <h2 style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:'clamp(24px,3.5vw,42px)', color:C.navy, margin:'0 0 14px', letterSpacing:-0.5 }}>
                Encontre fornecedores qualificados agora
              </h2>
              <p style={{ fontSize:16, color:'#666', lineHeight:1.75, margin:'0 auto', maxWidth:520 }}>
                Escolha como quer usar a ELOS — acesso direto ao marketplace ou um portal corporativo com sua marca.
              </p>
            </div>
          </FadeIn>

          <div style={{ display:'flex', gap:24, flexWrap:'wrap', alignItems:'stretch' }}>
            {/* Card auto-cadastro comprador */}
            <FadeIn delay={.05} style={{ flex:'1 1 380px' }}>
              <div style={{ borderRadius:22, padding:36, background:`linear-gradient(150deg,${C.blue},${C.navy})`, height:'100%', boxSizing:'border-box', display:'flex', flexDirection:'column' }}>
                <div style={{ fontSize:40, marginBottom:16 }}>🛒</div>
                <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:22, color:'#fff', marginBottom:8 }}>
                  Sou Comprador
                </div>
                <div style={{ fontSize:14, color:'rgba(255,255,255,.65)', lineHeight:1.7, marginBottom:24, flex:1 }}>
                  Cadastre-se agora e acesse o marketplace de fornecedores verificados. Conta gratuita, sem compromisso.
                </div>
                <ul style={{ listStyle:'none', padding:0, margin:'0 0 28px', display:'flex', flexDirection:'column', gap:8 }}>
                  {[
                    'Marketplace com +60 mil fornecedores',
                    'Filtros por CNAE, região, selos e capital',
                    'Envie convites e solicite homologações',
                    'Plano Free · 100% gratuito para começar',
                  ].map((f, i) => (
                    <li key={i} style={{ display:'flex', gap:10, fontSize:13, color:'rgba(255,255,255,.8)', fontFamily:'DM Sans,sans-serif' }}>
                      <span style={{ color:C.orange, fontWeight:700, flexShrink:0 }}>✓</span> {f}
                    </li>
                  ))}
                </ul>
                <button onClick={() => navigate('/cadastro?type=buyer')}
                  style={{ width:'100%', padding:'16px', borderRadius:12, background:C.orange, color:'#fff', fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:15, border:'none', cursor:'pointer', boxShadow:`0 8px 24px ${C.orange}55`, transition:'transform .2s' }}
                  onMouseOver={e => e.currentTarget.style.transform='scale(1.02)'}
                  onMouseOut={e => e.currentTarget.style.transform='scale(1)'}>
                  Criar conta gratuita →
                </button>
                <div style={{ fontSize:11, color:'rgba(255,255,255,.3)', textAlign:'center', marginTop:10 }}>Nenhum cartão necessário</div>
              </div>
            </FadeIn>

            {/* Card contato comercial — portal corporativo */}
            <FadeIn delay={.15} style={{ flex:'1 1 380px' }}>
              <div style={{ borderRadius:22, padding:36, background:C.light, border:`2px solid ${C.blue}18`, height:'100%', boxSizing:'border-box', display:'flex', flexDirection:'column' }}>
                <div style={{ fontSize:40, marginBottom:16 }}>🏢</div>
                <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:22, color:C.navy, marginBottom:8 }}>
                  Portal Corporativo
                </div>
                <div style={{ fontSize:14, color:'#666', lineHeight:1.7, marginBottom:24 }}>
                  Sua empresa quer gerenciar homologações com sua marca? Fale com nossa equipe comercial e conheça o Portal ELOS integrado ao SIGEC-HOC.
                </div>
                {sent ? (
                  <div style={{ background:'rgba(34,197,94,.1)', border:'1px solid #86efac', borderRadius:14, padding:24, textAlign:'center', flex:1, display:'flex', flexDirection:'column', justifyContent:'center' }}>
                    <div style={{ fontSize:36, marginBottom:10 }}>✅</div>
                    <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:16, color:'#15803d' }}>Recebemos seu interesse!</div>
                    <div style={{ fontSize:13, color:'#666', marginTop:6 }}>Nossa equipe entrará em contato em até 1 dia útil.</div>
                  </div>
                ) : (
                  <form onSubmit={handleContactSubmit} style={{ display:'flex', flexDirection:'column', gap:12, flex:1 }}>
                    <div>
                      <label style={{ display:'block', fontFamily:'Montserrat,sans-serif', fontWeight:600, fontSize:11, color:C.navy, letterSpacing:.5, textTransform:'uppercase', marginBottom:5 }}>E-mail corporativo *</label>
                      <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="voce@empresa.com.br"
                        style={{ width:'100%', padding:'12px 14px', borderRadius:10, border:'1.5px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:14, outline:'none', boxSizing:'border-box', transition:'border .2s' }}
                        onFocus={e => e.target.style.borderColor=C.blue} onBlur={e => e.target.style.borderColor='#e2e4ef'} />
                    </div>
                    <div>
                      <label style={{ display:'block', fontFamily:'Montserrat,sans-serif', fontWeight:600, fontSize:11, color:C.navy, letterSpacing:.5, textTransform:'uppercase', marginBottom:5 }}>Empresa *</label>
                      <input type="text" required value={empresa} onChange={e => setEmpresa(e.target.value)} placeholder="Nome da empresa"
                        style={{ width:'100%', padding:'12px 14px', borderRadius:10, border:'1.5px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:14, outline:'none', boxSizing:'border-box', transition:'border .2s' }}
                        onFocus={e => e.target.style.borderColor=C.blue} onBlur={e => e.target.style.borderColor='#e2e4ef'} />
                    </div>
                    <button type="submit" disabled={sending}
                      style={{ marginTop:'auto', padding:'14px', borderRadius:12, background:C.blue, color:'#fff', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:14, border:'none', cursor:'pointer', boxShadow:`0 6px 20px ${C.blue}33` }}>
                      {sending ? '⏳ Enviando...' : 'Solicitar contato comercial →'}
                    </button>
                    <p style={{ fontSize:11, color:C.grey, textAlign:'center', margin:0 }}>Retorno em até 1 dia útil · Sem compromisso</p>
                  </form>
                )}
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* ── CTA FINAL ────────────────────────────────────────────────────── */}
      <section style={{ padding:'100px 5%', background:`linear-gradient(135deg,${C.navy} 0%,#1a1f6e 100%)`, textAlign:'center', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', inset:0, opacity:.05, backgroundImage:`radial-gradient(${C.orange} 1px, transparent 1px)`, backgroundSize:'40px 40px' }}/>
        <FadeIn style={{ position:'relative' }}>
          <h2 style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:'clamp(28px,4vw,52px)', color:'#fff', margin:'0 0 16px', letterSpacing:-0.5 }}>
            Pronto para entrar no<br/>universo <span style={{ color:C.orange }}>ELOS</span>?
          </h2>
          <p style={{ fontSize:16, color:'rgba(255,255,255,.6)', maxWidth:460, margin:'0 auto 40px', lineHeight:1.7 }}>
            Fornecedor ou comprador — cadastre-se grátis e comece hoje mesmo.
          </p>
          <div style={{ display:'flex', gap:14, justifyContent:'center', flexWrap:'wrap' }}>
            <button onClick={() => navigate('/cadastro')}
              style={{ padding:'17px 40px', borderRadius:13, background:C.orange, color:'#fff', fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:15, border:'none', cursor:'pointer', boxShadow:`0 16px 48px ${C.orange}55`, transition:'transform .2s' }}
              onMouseOver={e => e.currentTarget.style.transform='scale(1.05)'} onMouseOut={e => e.currentTarget.style.transform='scale(1)'}>
              🏭 Sou Fornecedor →
            </button>
            <button onClick={() => navigate('/cadastro?type=buyer')}
              style={{ padding:'17px 40px', borderRadius:13, background:'rgba(255,255,255,.12)', color:'#fff', fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:15, border:'1px solid rgba(255,255,255,.25)', cursor:'pointer', transition:'transform .2s' }}
              onMouseOver={e => e.currentTarget.style.transform='scale(1.05)'} onMouseOut={e => e.currentTarget.style.transform='scale(1)'}>
              🛒 Sou Comprador →
            </button>
            <button onClick={() => navigate('/login')}
              style={{ padding:'17px 36px', borderRadius:13, background:'rgba(255,255,255,.05)', color:'rgba(255,255,255,.65)', fontFamily:'Montserrat,sans-serif', fontWeight:600, fontSize:14, border:'1px solid rgba(255,255,255,.1)', cursor:'pointer' }}>
              Já tenho conta →
            </button>
          </div>
        </FadeIn>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────────────── */}
      <footer style={{ background:'#060921', padding:'40px 5%', borderTop:'1px solid rgba(255,255,255,.05)' }}>
        <div style={{ maxWidth:1100, margin:'0 auto', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:20 }}>
          <div>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:17, color:'#fff' }}>SIGEC<span style={{ color:C.orange }}>-ELOS</span></div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,.3)', marginTop:4 }}>by EQPI Tech · EQUIPO INFO SERVIÇOS DE TECNOLOGIA DA INFORMAÇÃO LTDA</div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,.2)', marginTop:2 }}>CNPJ 21.270.860/0001-15 · São Paulo, SP</div>
          </div>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
            {[['Entrar',()=>navigate('/login')],['Fornecedor',()=>navigate('/cadastro')],['Comprador',()=>navigate('/cadastro?type=buyer')]].map(([l,fn]) => (
              <button key={l} onClick={fn} style={{ background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.08)', borderRadius:8, padding:'7px 16px', color:'rgba(255,255,255,.45)', cursor:'pointer', fontSize:12, fontFamily:'DM Sans,sans-serif' }}>{l}</button>
            ))}
            <a href="https://eqpitech.com.br" target="_blank" rel="noopener noreferrer" style={{ background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.08)', borderRadius:8, padding:'7px 16px', color:'rgba(255,255,255,.45)', fontSize:12, textDecoration:'none', fontFamily:'DM Sans,sans-serif' }}>EQPI Tech</a>
            <a href="mailto:comercial@eqpitech.com.br" style={{ background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.08)', borderRadius:8, padding:'7px 16px', color:'rgba(255,255,255,.45)', fontSize:12, textDecoration:'none', fontFamily:'DM Sans,sans-serif' }}>Contato</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
