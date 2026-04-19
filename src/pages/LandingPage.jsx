import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

// ── Paleta ──────────────────────────────────────────────────────────────────
const C = {
  navy:   '#0d1240',
  blue:   '#2E3192',
  orange: '#F47E2F',
  white:  '#FFFFFF',
  grey:   '#9B9B9B',
  light:  '#f0f2ff',
}

// ── Hook de animação ao entrar na viewport ──────────────────────────────────
function useFadeIn() {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true) }, { threshold: 0.15 })
    if (ref.current) obs.observe(ref.current)
    return () => obs.disconnect()
  }, [])
  return [ref, visible]
}

function FadeIn({ children, delay = 0, style = {} }) {
  const [ref, visible] = useFadeIn()
  return (
    <div ref={ref} style={{
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(32px)',
      transition: `opacity .7s ease ${delay}s, transform .7s ease ${delay}s`,
      ...style
    }}>
      {children}
    </div>
  )
}

// ── Componentes menores ──────────────────────────────────────────────────────
function Badge({ children }) {
  return (
    <span style={{ display:'inline-block', background:`${C.orange}22`, color:C.orange, fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:11, letterSpacing:1.5, textTransform:'uppercase', padding:'5px 14px', borderRadius:20, border:`1px solid ${C.orange}44`, marginBottom:20 }}>
      {children}
    </span>
  )
}

function Stat({ value, label }) {
  return (
    <div style={{ textAlign:'center', padding:'0 24px' }}>
      <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:42, color:C.orange, lineHeight:1 }}>{value}</div>
      <div style={{ fontSize:13, color:'rgba(255,255,255,.6)', marginTop:6, fontFamily:'DM Sans,sans-serif', maxWidth:120, margin:'6px auto 0' }}>{label}</div>
    </div>
  )
}

function Step({ n, icon, title, desc }) {
  return (
    <div style={{ flex:1, minWidth:240, maxWidth:300 }}>
      <div style={{ width:56, height:56, borderRadius:16, background:`linear-gradient(135deg, ${C.blue}, ${C.orange})`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, marginBottom:20, boxShadow:`0 8px 24px ${C.orange}33` }}>
        {icon}
      </div>
      <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:11, color:C.orange, letterSpacing:1.5, marginBottom:8 }}>PASSO {n}</div>
      <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:20, color:C.navy, marginBottom:10 }}>{title}</div>
      <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:15, color:'#555', lineHeight:1.6 }}>{desc}</div>
    </div>
  )
}

function PlanCard({ name, price, features, highlight }) {
  const navigate = useNavigate()
  return (
    <div style={{ flex:1, minWidth:280, maxWidth:360, borderRadius:20, padding:32,
      background: highlight ? `linear-gradient(150deg, ${C.blue} 0%, ${C.navy} 100%)` : '#fff',
      border: highlight ? 'none' : `2px solid #e2e4ef`,
      boxShadow: highlight ? `0 20px 60px ${C.blue}44` : '0 4px 20px rgba(0,0,0,.06)',
      position:'relative', overflow:'hidden' }}>
      {highlight && (
        <div style={{ position:'absolute', top:20, right:20, background:C.orange, color:'#fff', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:10, padding:'4px 12px', borderRadius:20, letterSpacing:1 }}>MAIS POPULAR</div>
      )}
      <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:22, color: highlight ? '#fff' : C.navy, marginBottom:8 }}>{name}</div>
      <div style={{ marginBottom:24 }}>
        <span style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:40, color:C.orange }}>R$ {price}</span>
        <span style={{ fontSize:14, color: highlight ? 'rgba(255,255,255,.5)' : C.grey }}>/ano</span>
      </div>
      <ul style={{ listStyle:'none', padding:0, margin:'0 0 28px', display:'flex', flexDirection:'column', gap:10 }}>
        {features.map((f, i) => (
          <li key={i} style={{ display:'flex', alignItems:'flex-start', gap:10, fontSize:14, color: highlight ? 'rgba(255,255,255,.85)' : '#555', fontFamily:'DM Sans,sans-serif' }}>
            <span style={{ color:C.orange, fontWeight:700, flexShrink:0 }}>✓</span> {f}
          </li>
        ))}
      </ul>
      <button onClick={() => navigate('/cadastro')}
        style={{ width:'100%', padding:'14px', borderRadius:12, fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:14, cursor:'pointer', transition:'all .2s',
          background: highlight ? C.orange : C.blue,
          color: '#fff', border: 'none',
          boxShadow: highlight ? `0 8px 24px ${C.orange}55` : `0 4px 16px ${C.blue}33` }}>
        Começar agora →
      </button>
    </div>
  )
}

function ClientLogo({ name }) {
  return (
    <div style={{ padding:'10px 20px', background:'rgba(255,255,255,.06)', borderRadius:10, border:'1px solid rgba(255,255,255,.1)', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, color:'rgba(255,255,255,.5)', letterSpacing:.5 }}>
      {name}
    </div>
  )
}

// ── Landing Page principal ──────────────────────────────────────────────────
export default function LandingPage() {
  const navigate = useNavigate()
  const [email,   setEmail]   = useState('')
  const [empresa, setEmpresa] = useState('')
  const [sending, setSending] = useState(false)
  const [sent,    setSent]    = useState(false)
  const [heroRef, heroVisible] = useFadeIn()

  const handleContactSubmit = async (e) => {
    e.preventDefault()
    setSending(true)
    try {
      await fetch('/.netlify/functions/contact-buyer', {
        method:'POST', headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ email, empresa })
      })
      setSent(true)
    } catch { setSent(true) }
    setSending(false)
  }

  return (
    <div style={{ fontFamily:'DM Sans,sans-serif', overflowX:'hidden', background:'#fff' }}>

      {/* ── NAV ────────────────────────────────────────────────────────── */}
      <nav style={{ position:'fixed', top:0, left:0, right:0, zIndex:100, background:'rgba(13,18,64,.95)', backdropFilter:'blur(12px)', borderBottom:'1px solid rgba(255,255,255,.08)', padding:'0 5%', display:'flex', alignItems:'center', justifyContent:'space-between', height:64 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:20, color:'#fff', letterSpacing:-0.5 }}>
            SIGEC<span style={{ color:C.orange }}>-ELOS</span>
          </div>
          <span style={{ fontSize:11, color:'rgba(255,255,255,.4)', fontFamily:'DM Sans,sans-serif', marginLeft:4 }}>by EQPI Tech</span>
        </div>
        <div style={{ display:'flex', gap:12, alignItems:'center' }}>
          <a href="#como-funciona" style={{ color:'rgba(255,255,255,.6)', fontSize:13, textDecoration:'none', fontFamily:'DM Sans,sans-serif' }}>Como funciona</a>
          <a href="#planos" style={{ color:'rgba(255,255,255,.6)', fontSize:13, textDecoration:'none', fontFamily:'DM Sans,sans-serif' }}>Planos</a>
          <a href="#compradores" style={{ color:'rgba(255,255,255,.6)', fontSize:13, textDecoration:'none', fontFamily:'DM Sans,sans-serif' }}>Compradores</a>
          <button onClick={() => navigate('/login')}
            style={{ padding:'9px 22px', borderRadius:10, background:C.orange, color:'#fff', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, border:'none', cursor:'pointer' }}>
            Entrar
          </button>
        </div>
      </nav>

      {/* ── HERO ───────────────────────────────────────────────────────── */}
      <section style={{ minHeight:'100vh', background:`linear-gradient(160deg, ${C.navy} 0%, #1a1f6e 50%, #0d1240 100%)`, display:'flex', alignItems:'center', paddingTop:80, position:'relative', overflow:'hidden' }}>
        {/* Decorative chain links background */}
        <div style={{ position:'absolute', inset:0, opacity:.04, backgroundImage:'radial-gradient(circle at 20% 50%, #F47E2F 1px, transparent 1px), radial-gradient(circle at 80% 50%, #2E3192 1px, transparent 1px)', backgroundSize:'60px 60px' }}/>
        <div style={{ position:'absolute', top:0, right:0, width:'40vw', height:'100%', background:`radial-gradient(ellipse at top right, ${C.orange}22 0%, transparent 60%)` }}/>
        <div style={{ maxWidth:1200, margin:'0 auto', padding:'80px 5%', display:'flex', gap:80, alignItems:'center', flexWrap:'wrap', position:'relative' }}>
          <div ref={heroRef} style={{ flex:'1 1 480px', opacity: heroVisible?1:0, transform: heroVisible?'translateY(0)':'translateY(40px)', transition:'all .9s ease' }}>
            <Badge>Marketplace B2B · Pré-Homologação</Badge>
            <h1 style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:'clamp(36px,5vw,64px)', color:'#fff', lineHeight:1.1, margin:'0 0 24px', letterSpacing:-1 }}>
              Seja parte do<br/>
              universo <span style={{ color:C.orange, position:'relative' }}>ELOS</span><br/>
              e amplie seus<br/>negócios
            </h1>
            <p style={{ fontSize:18, color:'rgba(255,255,255,.7)', lineHeight:1.7, margin:'0 0 36px', maxWidth:480 }}>
              Homologue sua empresa gratuitamente e seja encontrado por mais de 60 mil compradores das maiores mineradoras e indústrias do Brasil.
            </p>
            <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
              <button onClick={() => navigate('/cadastro')}
                style={{ padding:'16px 36px', borderRadius:12, background:C.orange, color:'#fff', fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:16, border:'none', cursor:'pointer', boxShadow:`0 12px 40px ${C.orange}55`, transition:'transform .2s' }}
                onMouseOver={e=>e.target.style.transform='scale(1.04)'}
                onMouseOut={e=>e.target.style.transform='scale(1)'}>
                Cadastre sua empresa →
              </button>
              <a href="#como-funciona"
                style={{ padding:'16px 28px', borderRadius:12, background:'rgba(255,255,255,.08)', color:'rgba(255,255,255,.85)', fontFamily:'Montserrat,sans-serif', fontWeight:600, fontSize:15, textDecoration:'none', border:'1px solid rgba(255,255,255,.15)', display:'flex', alignItems:'center' }}>
                Como funciona
              </a>
            </div>
          </div>

          {/* Mockup card */}
          <div style={{ flex:'1 1 300px', opacity: heroVisible?1:0, transform: heroVisible?'translateX(0)':'translateX(40px)', transition:'all .9s ease .3s' }}>
            <div style={{ background:'rgba(255,255,255,.06)', backdropFilter:'blur(20px)', borderRadius:24, padding:32, border:'1px solid rgba(255,255,255,.1)', boxShadow:'0 24px 80px rgba(0,0,0,.4)' }}>
              <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:24 }}>
                <div style={{ width:48, height:48, borderRadius:12, background:`linear-gradient(135deg, ${C.blue}, ${C.orange})`, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:900, color:'#fff', fontSize:22 }}>E</div>
                <div>
                  <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, color:'#fff', fontSize:14 }}>Empresa Modelo LTDA</div>
                  <div style={{ fontSize:12, color:'rgba(255,255,255,.5)' }}>CNPJ 00.000.000/0001-00</div>
                </div>
                <div style={{ marginLeft:'auto', background:'rgba(34,197,94,.15)', border:'1px solid rgba(34,197,94,.3)', borderRadius:20, padding:'4px 12px', fontSize:11, color:'#22c55e', fontFamily:'Montserrat,sans-serif', fontWeight:700 }}>✓ ELOS Ativo</div>
              </div>
              {[['Cartão CNPJ','✅ Válido'],['CRF FGTS','✅ Regular'],['CND Federal','✅ Negativa'],['Contrato Social','✅ Atualizado']].map(([doc,s]) => (
                <div key={doc} style={{ display:'flex', justifyContent:'space-between', padding:'10px 0', borderBottom:'1px solid rgba(255,255,255,.06)', fontSize:13, color:'rgba(255,255,255,.7)' }}>
                  <span>{doc}</span><span style={{ color:'#22c55e', fontWeight:600 }}>{s}</span>
                </div>
              ))}
              <div style={{ marginTop:20, background:`linear-gradient(135deg, ${C.orange}, #ff9f50)`, borderRadius:12, padding:'14px 20px', textAlign:'center' }}>
                <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, color:'#fff', fontSize:16 }}>🏅 Selo ELOS Simples</div>
                <div style={{ fontSize:12, color:'rgba(255,255,255,.8)', marginTop:4 }}>Visível no marketplace para compradores</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── STATS ──────────────────────────────────────────────────────── */}
      <section style={{ background:C.navy, padding:'48px 5%' }}>
        <FadeIn>
          <div style={{ maxWidth:1000, margin:'0 auto', display:'flex', justifyContent:'space-around', flexWrap:'wrap', gap:32 }}>
            <Stat value="+60K"  label="Fornecedores na base EQPI" />
            <Stat value="+7.2B" label="Documentos analisados" />
            <Stat value="31%"   label="Redução do risco de contratação" />
            <Stat value="10+"   label="Anos de experiência em homologação" />
          </div>
        </FadeIn>
      </section>

      {/* ── O QUE É ELOS ───────────────────────────────────────────────── */}
      <section style={{ padding:'100px 5%', background:'#fff' }}>
        <div style={{ maxWidth:1100, margin:'0 auto' }}>
          <FadeIn>
            <div style={{ textAlign:'center', marginBottom:64 }}>
              <Badge>O que é o SIGEC-ELOS</Badge>
              <h2 style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:'clamp(28px,4vw,48px)', color:C.navy, margin:'0 0 20px', letterSpacing:-0.5 }}>
                Sua vitrine B2B para<br/>as maiores empresas do Brasil
              </h2>
              <p style={{ fontSize:17, color:'#666', maxWidth:580, margin:'0 auto', lineHeight:1.7 }}>
                O SIGEC-ELOS é a plataforma de pré-homologação e marketplace da EQPI Tech. Conectamos fornecedores qualificados com compradores de grandes corporações dos setores de mineração, energia e indústria.
              </p>
            </div>
          </FadeIn>
          <div style={{ display:'flex', gap:24, flexWrap:'wrap' }}>
            {[
              { icon:'🔍', title:'Seja encontrado', desc:'Apareça no marketplace para compradores de empresas como AngloGold, CSN, Kinross e outras gigantes que já usam o ecossistema EQPI Tech.' },
              { icon:'🏅', title:'Conquiste o Selo ELOS', desc:'O Selo ELOS é um certificado digital de conformidade. Mostra que sua empresa está em dia com documentação fiscal, trabalhista e ESG.' },
              { icon:'⚡', title:'Processo automatizado', desc:'Certidões como CNPJ, Simples Nacional e CND são coletadas automaticamente. Você só envia o que é realmente necessário.' },
              { icon:'🔗', title:'Integrado ao SIGEC-HOC', desc:'Se aprovado, seus dados migram automaticamente para o SIGEC-HOC dos compradores. Zero retrabalho de homologação.' },
            ].map((card, i) => (
              <FadeIn key={i} delay={i * .1} style={{ flex:'1 1 220px' }}>
                <div style={{ padding:28, borderRadius:16, border:'1px solid #e2e4ef', height:'100%', background:'#fafbff', transition:'box-shadow .2s, transform .2s' }}
                  onMouseOver={e=>{ e.currentTarget.style.boxShadow=`0 8px 32px ${C.blue}22`; e.currentTarget.style.transform='translateY(-4px)' }}
                  onMouseOut={e=>{ e.currentTarget.style.boxShadow='none'; e.currentTarget.style.transform='none' }}>
                  <div style={{ fontSize:32, marginBottom:16 }}>{card.icon}</div>
                  <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:17, color:C.navy, marginBottom:10 }}>{card.title}</div>
                  <div style={{ fontSize:14, color:'#666', lineHeight:1.6 }}>{card.desc}</div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── COMO FUNCIONA ──────────────────────────────────────────────── */}
      <section id="como-funciona" style={{ padding:'100px 5%', background:C.light }}>
        <div style={{ maxWidth:1100, margin:'0 auto' }}>
          <FadeIn>
            <div style={{ textAlign:'center', marginBottom:64 }}>
              <Badge>Simples e rápido</Badge>
              <h2 style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:'clamp(28px,4vw,48px)', color:C.navy, margin:0, letterSpacing:-0.5 }}>Como funciona</h2>
            </div>
          </FadeIn>
          <div style={{ display:'flex', gap:48, flexWrap:'wrap', justifyContent:'center' }}>
            {[
              { n:1, icon:'📋', title:'Cadastre sua empresa', desc:'Insira o CNPJ e o sistema consulta automaticamente os dados da Receita Federal, CEIS e CNEP em segundos.' },
              { n:2, icon:'📄', title:'Envie a documentação', desc:'Certidões automáticas + upload dos documentos específicos da sua categoria de atuação. Sem burocracia desnecessária.' },
              { n:3, icon:'🏅', title:'Receba o Selo ELOS', desc:'Nossa equipe analisa e emite o Selo. Sua empresa entra no marketplace e fica visível para compradores qualificados.' },
              { n:4, icon:'🤝', title:'Faça negócios', desc:'Compradores encontram você pelo marketplace, solicitam cotações e iniciam processos de contratação diretamente pela plataforma.' },
            ].map((s, i) => (
              <FadeIn key={i} delay={i * .12}>
                <Step {...s} />
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── PLANOS ─────────────────────────────────────────────────────── */}
      <section id="planos" style={{ padding:'100px 5%', background:'#fff' }}>
        <div style={{ maxWidth:1100, margin:'0 auto' }}>
          <FadeIn>
            <div style={{ textAlign:'center', marginBottom:64 }}>
              <Badge>Planos e preços</Badge>
              <h2 style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:'clamp(28px,4vw,48px)', color:C.navy, margin:'0 0 16px', letterSpacing:-0.5 }}>Invista na sua visibilidade</h2>
              <p style={{ fontSize:16, color:C.grey, maxWidth:480, margin:'0 auto' }}>Escolha o plano ideal para o porte e objetivos da sua empresa.</p>
            </div>
          </FadeIn>
          <div style={{ display:'flex', gap:24, flexWrap:'wrap', justifyContent:'center', alignItems:'stretch' }}>
            <FadeIn delay={.1}>
              <PlanCard name="Simples" price="290" features={[
                'Perfil visível no marketplace',
                'Coleta automática de certidões',
                'Selo ELOS Simples',
                'Suporte por e-mail',
                'Renovação anual',
              ]} />
            </FadeIn>
            <FadeIn delay={.2}>
              <PlanCard name="Premium" price="990" highlight features={[
                'Tudo do plano Simples',
                'Selo ELOS Premium',
                'Destaque nos resultados de busca',
                'Integração automática com SIGEC-HOC',
                'Monitoramento mensal de certidões',
                'Suporte prioritário',
              ]} />
            </FadeIn>
          </div>
          <FadeIn delay={.3}>
            <p style={{ textAlign:'center', marginTop:32, fontSize:13, color:C.grey }}>
              Valores anuais. Pagamento via cartão, boleto ou PIX pelo Stripe.
            </p>
          </FadeIn>
        </div>
      </section>

      {/* ── CLIENTES ───────────────────────────────────────────────────── */}
      <section style={{ padding:'80px 5%', background:C.navy }}>
        <div style={{ maxWidth:1000, margin:'0 auto', textAlign:'center' }}>
          <FadeIn>
            <div style={{ fontSize:13, color:'rgba(255,255,255,.4)', fontFamily:'Montserrat,sans-serif', fontWeight:700, letterSpacing:2, textTransform:'uppercase', marginBottom:36 }}>
              Compradores que já usam o ecossistema EQPI Tech
            </div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:12, justifyContent:'center' }}>
              {['AngloGold Ashanti','CSN','Kinross','Yamana Gold','Lundin Mining','AES','Atlantic','Aura Minerals','Sapura'].map(n => <ClientLogo key={n} name={n} />)}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── SOBRE A EQPI ───────────────────────────────────────────────── */}
      <section style={{ padding:'100px 5%', background:'#fff' }}>
        <div style={{ maxWidth:1000, margin:'0 auto', display:'flex', gap:64, flexWrap:'wrap', alignItems:'center' }}>
          <FadeIn style={{ flex:'1 1 320px' }}>
            <Badge>Quem somos</Badge>
            <h2 style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:'clamp(24px,3.5vw,40px)', color:C.navy, margin:'0 0 20px', letterSpacing:-0.5 }}>
              10 anos de experiência em gestão de fornecedores
            </h2>
            <p style={{ fontSize:16, color:'#666', lineHeight:1.7, margin:'0 0 16px' }}>
              A EQPI Tech (ex-Equipo Info) nasceu em 2014 com a missão de transformar a gestão de contratos e fornecedores nas maiores operações do Brasil. Hoje entregamos o ecossistema completo: SIGEC-HOC, SIGEC-WEB, BC Report e SIGEC-ELOS.
            </p>
            <p style={{ fontSize:16, color:'#666', lineHeight:1.7 }}>
              Com mais de 60 mil fornecedores na base e 7,2 bilhões de documentos analisados, somos referência em compliance e homologação no setor de mineração e energia.
            </p>
            <a href="https://eqpitech.com.br" target="_blank" rel="noopener noreferrer"
              style={{ display:'inline-block', marginTop:24, color:C.blue, fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:14, textDecoration:'none' }}>
              Conheça a EQPI Tech →
            </a>
          </FadeIn>
          <FadeIn delay={.2} style={{ flex:'1 1 260px' }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
              {[['2014','Fundação da Equipo Info'],['2016','SIGEC-HOC lançado'],['2021','BC Report lançado'],['2025','Nasce a EQPI Tech']].map(([year, ev]) => (
                <div key={year} style={{ padding:20, borderRadius:14, background:C.light, border:`1px solid ${C.blue}22` }}>
                  <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:24, color:C.orange }}>{year}</div>
                  <div style={{ fontSize:13, color:'#555', marginTop:6, lineHeight:1.4 }}>{ev}</div>
                </div>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── COMPRADORES ────────────────────────────────────────────────── */}
      <section id="compradores" style={{ padding:'100px 5%', background:C.light }}>
        <div style={{ maxWidth:640, margin:'0 auto', textAlign:'center' }}>
          <FadeIn>
            <Badge>Para compradores</Badge>
            <h2 style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:'clamp(24px,3.5vw,40px)', color:C.navy, margin:'0 0 16px', letterSpacing:-0.5 }}>
              Acesse o marketplace de fornecedores qualificados
            </h2>
            <p style={{ fontSize:16, color:'#666', lineHeight:1.7, margin:'0 0 40px' }}>
              Encontre fornecedores pré-homologados por categoria, região e nível de conformidade. Solicite acesso e nossa equipe cria sua conta.
            </p>
            {sent ? (
              <div style={{ background:'rgba(34,197,94,.1)', border:'1px solid #86efac', borderRadius:16, padding:32 }}>
                <div style={{ fontSize:40, marginBottom:12 }}>✅</div>
                <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:18, color:'#15803d' }}>Recebemos seu interesse!</div>
                <div style={{ fontSize:14, color:'#666', marginTop:8 }}>Nossa equipe comercial entrará em contato em até 1 dia útil.</div>
              </div>
            ) : (
              <form onSubmit={handleContactSubmit} style={{ display:'flex', flexDirection:'column', gap:14, textAlign:'left' }}>
                <div>
                  <label style={{ display:'block', fontFamily:'Montserrat,sans-serif', fontWeight:600, fontSize:11, color:C.navy, letterSpacing:.5, textTransform:'uppercase', marginBottom:6 }}>E-mail corporativo *</label>
                  <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="voce@empresa.com.br"
                    style={{ width:'100%', padding:'14px 16px', borderRadius:10, border:'1.5px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:15, outline:'none', boxSizing:'border-box', transition:'border .2s' }}
                    onFocus={e => e.target.style.borderColor=C.blue}
                    onBlur={e => e.target.style.borderColor='#e2e4ef'}/>
                </div>
                <div>
                  <label style={{ display:'block', fontFamily:'Montserrat,sans-serif', fontWeight:600, fontSize:11, color:C.navy, letterSpacing:.5, textTransform:'uppercase', marginBottom:6 }}>Empresa</label>
                  <input type="text" value={empresa} onChange={e => setEmpresa(e.target.value)}
                    placeholder="Nome da sua empresa"
                    style={{ width:'100%', padding:'14px 16px', borderRadius:10, border:'1.5px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:15, outline:'none', boxSizing:'border-box', transition:'border .2s' }}
                    onFocus={e => e.target.style.borderColor=C.blue}
                    onBlur={e => e.target.style.borderColor='#e2e4ef'}/>
                </div>
                <button type="submit" disabled={sending}
                  style={{ padding:'16px', borderRadius:12, background:C.blue, color:'#fff', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:15, border:'none', cursor:'pointer', boxShadow:`0 8px 24px ${C.blue}33` }}>
                  {sending ? '⏳ Enviando...' : 'Solicitar acesso de comprador →'}
                </button>
                <p style={{ fontSize:12, color:C.grey, textAlign:'center', margin:0 }}>
                  Sua solicitação será encaminhada para nossa equipe comercial.
                </p>
              </form>
            )}
          </FadeIn>
        </div>
      </section>

      {/* ── CTA FINAL ──────────────────────────────────────────────────── */}
      <section style={{ padding:'100px 5%', background:`linear-gradient(135deg, ${C.navy} 0%, #1a1f6e 100%)`, textAlign:'center', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', inset:0, opacity:.06, backgroundImage:`radial-gradient(${C.orange} 1px, transparent 1px)`, backgroundSize:'40px 40px' }}/>
        <FadeIn style={{ position:'relative' }}>
          <h2 style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:'clamp(28px,4vw,52px)', color:'#fff', margin:'0 0 20px', letterSpacing:-0.5 }}>
            Pronto para entrar no<br/>universo <span style={{ color:C.orange }}>ELOS</span>?
          </h2>
          <p style={{ fontSize:17, color:'rgba(255,255,255,.65)', maxWidth:480, margin:'0 auto 40px', lineHeight:1.6 }}>
            Milhares de fornecedores já fazem parte. Cadastre sua empresa hoje e seja encontrado por quem mais contrata no Brasil.
          </p>
          <button onClick={() => navigate('/cadastro')}
            style={{ padding:'18px 48px', borderRadius:14, background:C.orange, color:'#fff', fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:17, border:'none', cursor:'pointer', boxShadow:`0 16px 48px ${C.orange}55`, transition:'transform .2s' }}
            onMouseOver={e => e.target.style.transform='scale(1.05)'}
            onMouseOut={e => e.target.style.transform='scale(1)'}>
            Cadastrar minha empresa — é grátis começar
          </button>
          <div style={{ marginTop:20, fontSize:13, color:'rgba(255,255,255,.4)' }}>
            Já tem conta? <button onClick={() => navigate('/login')} style={{ background:'none', border:'none', color:C.orange, cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontSize:13, fontWeight:600 }}>Entrar →</button>
          </div>
        </FadeIn>
      </section>

      {/* ── FOOTER ─────────────────────────────────────────────────────── */}
      <footer style={{ background:'#080c2b', padding:'40px 5%', borderTop:'1px solid rgba(255,255,255,.06)' }}>
        <div style={{ maxWidth:1100, margin:'0 auto', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:20 }}>
          <div>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:18, color:'#fff' }}>SIGEC<span style={{ color:C.orange }}>-ELOS</span></div>
            <div style={{ fontSize:12, color:'rgba(255,255,255,.35)', marginTop:4 }}>by EQPI Tech · EQUIPO INFO SERVIÇOS DE TECNOLOGIA DA INFORMAÇÃO LTDA</div>
            <div style={{ fontSize:12, color:'rgba(255,255,255,.25)', marginTop:2 }}>CNPJ 21.270.860/0001-15 · São Paulo, SP</div>
          </div>
          <div style={{ display:'flex', gap:20, flexWrap:'wrap' }}>
            <button onClick={() => navigate('/login')} style={{ background:'none', border:'none', color:'rgba(255,255,255,.5)', cursor:'pointer', fontSize:13, fontFamily:'DM Sans,sans-serif' }}>Entrar</button>
            <button onClick={() => navigate('/cadastro')} style={{ background:'none', border:'none', color:'rgba(255,255,255,.5)', cursor:'pointer', fontSize:13, fontFamily:'DM Sans,sans-serif' }}>Cadastrar</button>
            <a href="https://eqpitech.com.br" target="_blank" rel="noopener noreferrer" style={{ color:'rgba(255,255,255,.5)', fontSize:13, textDecoration:'none' }}>EQPI Tech</a>
            <a href="mailto:comercial@eqpitech.com.br" style={{ color:'rgba(255,255,255,.5)', fontSize:13, textDecoration:'none' }}>Contato</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
