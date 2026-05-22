import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useIsMobile } from '../hooks/useIsMobile.js'

const ELOS_PLANS = [
  {
    id: 'simples',
    name: 'ELOS Simples',
    price: '290',
    period: '/ano',
    color: '#5B7FA5',
    icon: '🔗',
    features: [
      'Perfil na vitrine do marketplace',
      'Consulta automática de CNPJ',
      'Monitoramento de listas restritivas',
      'Selo ELOS Simples no perfil',
      'Suporte por e-mail',
    ],
    cta: 'Iniciar Cadastro',
  },
  {
    id: 'premium',
    name: 'ELOS Premium',
    price: '990',
    period: '/ano',
    color: '#F47E2F',
    icon: '⛓️',
    popular: true,
    features: [
      'Tudo do plano Simples +',
      'Coleta automática de certidões',
      'Selo ELOS Premium verificado',
      'Prioridade no ranking de busca',
      'Dashboard de visibilidade',
      'Ponte direta para SIGEC-ELOS',
    ],
    cta: 'Iniciar Cadastro',
  },
]

function useFadeIn(threshold = 0.15) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect() } },
      { threshold }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [threshold])
  return [ref, visible]
}

function Section({ id, children, style, dark }) {
  const [ref, vis] = useFadeIn()
  return (
    <section
      id={id}
      ref={ref}
      style={{
        opacity: vis ? 1 : 0,
        transform: vis ? 'translateY(0)' : 'translateY(32px)',
        transition: 'opacity 0.7s ease, transform 0.7s ease',
        padding: '80px 24px',
        background: dark ? '#0D1B2A' : 'transparent',
        color: dark ? '#fff' : '#1B2A4A',
        ...style,
      }}
    >
      <div style={{ maxWidth: 1120, margin: '0 auto' }}>{children}</div>
    </section>
  )
}

export default function ClientPortal() {
  const { slug } = useParams()
  const navigate  = useNavigate()
  const mobile    = useIsMobile()

  const [client, setClient]       = useState(null)
  const [loading, setLoading]     = useState(true)
  const [notFound, setNotFound]   = useState(false)

  const [cnpj, setCnpj]           = useState('')
  const [activeTab, setActiveTab] = useState('register')
  const [scrolled, setScrolled]   = useState(false)

  // Fetch LP config from Supabase
  useEffect(() => {
    supabase
      .from('client_landing_pages')
      .select('*')
      .eq('slug', slug)
      .eq('is_active', true)
      .single()
      .then(({ data, error }) => {
        if (error || !data) { setNotFound(true) }
        else { setClient(data) }
        setLoading(false)
      })
  }, [slug])

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 60)
    window.addEventListener('scroll', h)
    return () => window.removeEventListener('scroll', h)
  }, [])

  const formatCnpj = (v) => {
    const d = v.replace(/\D/g, '').slice(0, 14)
    if (d.length <= 2) return d
    if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`
    if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`
    if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
  }

  const handleRegister = () => {
    const raw = cnpj.replace(/\D/g, '')
    if (raw.length !== 14) { alert('Informe um CNPJ válido com 14 dígitos.'); return }
    navigate(`/cadastro?cnpj=${raw}&ref=${slug}`)
  }

  const handleLogin = () => navigate('/login')

  // ── Loading ──
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: '#0D1B2A' }}>
        <div style={{ width: 40, height: 40, border: '3px solid rgba(255,255,255,0.15)',
          borderTopColor: '#F47E2F', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  // ── 404 ──
  if (notFound) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100vh', background: '#0D1B2A', textAlign: 'center', gap: 16 }}>
        <span style={{ fontSize: 64 }}>🔗</span>
        <h1 style={{ color: '#fff', fontFamily: 'sans-serif', fontSize: 28 }}>Portal não encontrado</h1>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontFamily: 'sans-serif' }}>
          Este endereço não existe ou foi desativado.
        </p>
        <button onClick={() => navigate('/')}
          style={{ marginTop: 8, padding: '12px 28px', background: '#F47E2F', color: '#fff',
            border: 'none', borderRadius: 8, fontFamily: 'sans-serif', cursor: 'pointer', fontSize: 15 }}>
          Ir para o SIGEC-ELOS
        </button>
      </div>
    )
  }

  const accent    = client.accent_color    || '#F47E2F'
  const secondary = client.secondary_color || '#1B2A4A'
  const secondaryDark = (() => {
    const h = secondary.replace('#', '')
    const n = parseInt(h, 16)
    const r = Math.round(((n >> 16) & 0xff) * 0.5).toString(16).padStart(2, '0')
    const g = Math.round(((n >>  8) & 0xff) * 0.5).toString(16).padStart(2, '0')
    const b = Math.round(( n        & 0xff) * 0.5).toString(16).padStart(2, '0')
    return `#${r}${g}${b}`
  })()
  const secondaryNavbar = (() => {
    const h = secondaryDark.replace('#', '')
    const n = parseInt(h, 16)
    return `rgba(${(n>>16)&0xff},${(n>>8)&0xff},${n&0xff},0.97)`
  })()
  const companyName = client.company_name
  const font        = `'Outfit', sans-serif`
  const fontDisplay = `'Playfair Display', serif`

  const CSS = `
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Playfair+Display:wght@600;700&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }
    body { font-family: ${font}; -webkit-font-smoothing: antialiased; }
    ::selection { background: ${accent}33; }

    .nav-link { color: #fff; text-decoration: none; font-size: 14px; font-weight: 500;
      letter-spacing: 0.4px; padding: 6px 0; position: relative; transition: color 0.2s; }
    .nav-link::after { content: ''; position: absolute; bottom: 0; left: 0; width: 0;
      height: 2px; background: ${accent}; transition: width 0.3s; }
    .nav-link:hover::after { width: 100%; }
    .nav-link:hover { color: ${accent}; }

    .btn-primary { background: ${accent}; color: #fff; border: none; padding: 14px 32px;
      border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer;
      font-family: ${font}; letter-spacing: 0.3px; transition: all 0.25s; text-decoration: none;
      display: inline-block; }
    .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 8px 24px ${accent}44; filter: brightness(1.08); }

    .btn-outline { background: transparent; color: #fff; border: 1.5px solid rgba(255,255,255,0.35);
      padding: 13px 30px; border-radius: 8px; font-size: 15px; font-weight: 500;
      cursor: pointer; font-family: ${font}; transition: all 0.25s; text-decoration: none;
      display: inline-block; }
    .btn-outline:hover { border-color: ${accent}; color: ${accent}; }

    .input-field { width: 100%; padding: 14px 16px; border: 1.5px solid #D0D5DD; border-radius: 8px;
      font-size: 15px; font-family: ${font}; outline: none; transition: border-color 0.2s;
      background: #fff; color: #1B2A4A; }
    .input-field:focus { border-color: ${accent}; box-shadow: 0 0 0 3px ${accent}18; }
    .input-field::placeholder { color: #98A2B3; }

    .plan-card { border-radius: 16px; padding: 36px 28px; background: #fff;
      border: 1.5px solid #E4E7EC; transition: all 0.35s; position: relative; overflow: hidden; }
    .plan-card:hover { transform: translateY(-6px); box-shadow: 0 20px 50px rgba(0,0,0,0.1); }
    .plan-card.popular { border-color: ${accent}; }
    .plan-card.popular::before { content: 'RECOMENDADO'; position: absolute; top: 16px; right: -30px;
      background: ${accent}; color: #fff; font-size: 10px; font-weight: 700; padding: 4px 36px;
      transform: rotate(45deg); letter-spacing: 1px; }

    .step-num { width: 48px; height: 48px; border-radius: 50%; display: flex; align-items: center;
      justify-content: center; font-weight: 700; font-size: 18px; color: #fff; background: ${accent};
      flex-shrink: 0; }

    .tab-btn { padding: 12px 28px; border: none; border-radius: 8px 8px 0 0; font-size: 14px;
      font-weight: 600; cursor: pointer; font-family: ${font}; transition: all 0.2s; letter-spacing: 0.3px; }

    .badge-pill { display: inline-block; padding: 4px 14px; border-radius: 100px;
      font-size: 12px; font-weight: 600; letter-spacing: 0.5px; }

    @keyframes float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
  `

  return (
    <div style={{ background: '#FAFBFC', minHeight: '100vh', fontFamily: font }}>
      <style>{CSS}</style>

      {/* ═══ NAVBAR ═══ */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        background: scrolled ? secondaryNavbar : 'transparent',
        backdropFilter: scrolled ? 'blur(12px)' : 'none',
        borderBottom: scrolled ? '1px solid rgba(255,255,255,0.08)' : 'none',
        transition: 'all 0.35s', padding: mobile ? '12px 20px' : '14px 48px',
      }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', display: 'flex',
          alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {client.logo_url ? (
              <img src={client.logo_url} alt={companyName}
                style={{ height: 36, objectFit: 'contain' }} />
            ) : (
              <span style={{ color: '#fff', fontWeight: 700, fontSize: 18 }}>{companyName}</span>
            )}
            <div style={{ width: 1, height: 28, background: 'rgba(255,255,255,0.2)' }} />
            <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: 500, letterSpacing: 0.8 }}>
              powered by <span style={{ color: accent, fontWeight: 700 }}>SIGEC-ELOS</span>
            </span>
          </div>
          {!mobile && (
            <div style={{ display: 'flex', gap: 32, alignItems: 'center' }}>
              <a href="#sobre" className="nav-link">A Empresa</a>
              <a href="#processo" className="nav-link">Como Funciona</a>
              <a href="#planos" className="nav-link">Planos</a>
              <a href="#cadastro" className="btn-primary" style={{ padding: '10px 22px', fontSize: 13 }}>
                Quero ser Fornecedor
              </a>
            </div>
          )}
        </div>
      </nav>

      {/* ═══ HERO ═══ */}
      <header style={{
        position: 'relative', minHeight: mobile ? 'auto' : '100vh',
        display: 'flex', alignItems: 'center',
        background: `linear-gradient(135deg, ${secondaryDark} 0%, ${secondary} 50%, ${secondaryDark} 100%)`,
        overflow: 'hidden', paddingTop: mobile ? 100 : 0, paddingBottom: mobile ? 60 : 0,
      }}>
        {client.hero_image_url && (
          <div style={{
            position: 'absolute', inset: 0,
            backgroundImage: `url(${client.hero_image_url})`,
            backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.12,
          }} />
        )}
        <div style={{
          position: 'absolute', top: '-20%', right: '-10%', width: 600, height: 600,
          borderRadius: '50%', background: `radial-gradient(circle, ${accent}15, transparent 70%)`,
        }} />
        <div style={{
          position: 'absolute', bottom: '-15%', left: '-5%', width: 400, height: 400,
          borderRadius: '50%', background: `radial-gradient(circle, ${secondary}1E, transparent 70%)`,
        }} />

        <div style={{
          position: 'relative', zIndex: 2, maxWidth: 1120, margin: '0 auto',
          padding: '0 24px', width: '100%',
          display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 420px',
          gap: mobile ? 40 : 64, alignItems: 'center',
        }}>
          {/* Left */}
          <div>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 100, padding: '6px 18px 6px 10px', marginBottom: 28,
            }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22C55E',
                boxShadow: '0 0 8px #22C55E88' }} />
              <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: 500 }}>
                Portal de Fornecedores Ativo
              </span>
            </div>

            <h1 style={{ fontFamily: fontDisplay, fontSize: mobile ? 36 : 52,
              fontWeight: 700, color: '#fff', lineHeight: 1.15, marginBottom: 20 }}>
              Seja fornecedor da{' '}
              <span style={{ color: accent }}>{companyName}</span>
            </h1>

            <p style={{ fontSize: mobile ? 16 : 18, color: 'rgba(255,255,255,0.65)',
              lineHeight: 1.7, maxWidth: 520, marginBottom: 32 }}>
              Cadastre-se na plataforma de pré-homologação{' '}
              <strong style={{ color: 'rgba(255,255,255,0.85)' }}>SIGEC-ELOS</strong>,
              valide sua documentação e torne-se visível para oportunidades de negócio
              com a {companyName}.
            </p>

            {client.badges?.length > 0 && (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 36 }}>
                {client.badges.map((b) => (
                  <span key={b} className="badge-pill"
                    style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)',
                      border: '1px solid rgba(255,255,255,0.12)' }}>
                    {b}
                  </span>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <a href="#cadastro" className="btn-primary">Iniciar Cadastro</a>
              <a href="#sobre" className="btn-outline">Saiba Mais</a>
            </div>
          </div>

          {/* Right — Register / Login card */}
          <div id="cadastro" style={{
            background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20,
            padding: 0, overflow: 'hidden',
          }}>
            <div style={{ display: 'flex' }}>
              <button className="tab-btn" onClick={() => setActiveTab('register')}
                style={{ flex: 1, borderRadius: 0,
                  background: activeTab === 'register' ? accent : 'rgba(255,255,255,0.04)',
                  color: activeTab === 'register' ? '#fff' : 'rgba(255,255,255,0.5)' }}>
                Quero ser Fornecedor
              </button>
              <button className="tab-btn" onClick={() => setActiveTab('login')}
                style={{ flex: 1, borderRadius: 0,
                  background: activeTab === 'login' ? secondary : 'rgba(255,255,255,0.04)',
                  color: activeTab === 'login' ? '#fff' : 'rgba(255,255,255,0.5)' }}>
                Já sou Fornecedor
              </button>
            </div>

            <div style={{ padding: '32px 28px' }}>
              {activeTab === 'register' ? (
                <>
                  <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', marginBottom: 20, lineHeight: 1.6 }}>
                    Informe o CNPJ da sua empresa para iniciar o processo de pré-homologação
                    como fornecedor da <strong style={{ color: '#fff' }}>{companyName}</strong>.
                  </p>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)',
                    letterSpacing: 0.8, display: 'block', marginBottom: 8 }}>
                    CNPJ DA EMPRESA
                  </label>
                  <input className="input-field" placeholder="00.000.000/0000-00"
                    value={cnpj} onChange={(e) => setCnpj(formatCnpj(e.target.value))}
                    style={{ marginBottom: 16 }} />
                  <button className="btn-primary" onClick={handleRegister}
                    style={{ width: '100%', padding: '16px' }}>
                    Solicitar Cadastro →
                  </button>
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 14,
                    textAlign: 'center', lineHeight: 1.5 }}>
                    Ao solicitar o cadastro, você será vinculado como fornecedor
                    da {companyName} na plataforma SIGEC-ELOS.
                  </p>
                </>
              ) : (
                <>
                  <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', marginBottom: 20, lineHeight: 1.6 }}>
                    Acesse sua área restrita e mantenha seus documentos atualizados.
                  </p>
                  <button className="btn-primary" onClick={handleLogin}
                    style={{ width: '100%', padding: '16px' }}>
                    Acessar Plataforma
                  </button>
                  <p style={{ fontSize: 13, color: accent, textAlign: 'center', marginTop: 14, cursor: 'pointer' }}
                    onClick={handleLogin}>
                    Esqueceu sua senha?
                  </p>
                </>
              )}
            </div>
          </div>
        </div>

        {!mobile && (
          <div style={{
            position: 'absolute', bottom: 32, left: '50%', transform: 'translateX(-50%)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
            animation: 'float 3s ease-in-out infinite',
          }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: 2, fontWeight: 500 }}>SCROLL</span>
            <div style={{ width: 1, height: 32, background: 'linear-gradient(to bottom, rgba(255,255,255,0.3), transparent)' }} />
          </div>
        )}
      </header>

      {/* ═══ SOBRE ═══ */}
      <Section id="sobre">
        <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr', gap: 56, alignItems: 'center' }}>
          <div>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 2, color: accent,
              textTransform: 'uppercase', display: 'block', marginBottom: 12 }}>
              Sobre a empresa
            </span>
            <h2 style={{ fontFamily: fontDisplay, fontSize: mobile ? 28 : 36,
              fontWeight: 700, lineHeight: 1.2, marginBottom: 20, color: '#0D1B2A' }}>
              Conheça a {companyName}
            </h2>
            {client.description && (
              <p style={{ fontSize: 16, lineHeight: 1.8, color: '#475467', marginBottom: 24 }}>
                {client.description}
              </p>
            )}
            <p style={{ fontSize: 15, lineHeight: 1.8, color: '#475467' }}>
              Agora, como maneira de aprimorar o processo de cadastro de fornecedores,
              com o apoio da plataforma <strong>SIGEC-ELOS da EQPI Tech</strong>, teremos
              neste portal as informações que ajudarão atuais e futuros fornecedores a
              participar de oportunidades com eficiência e transparência.
            </p>
            {client.compliance_url && (
              <a href={client.compliance_url} target="_blank" rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 24,
                  fontSize: 14, fontWeight: 600, color: accent, textDecoration: 'none' }}>
                <span style={{ fontSize: 18 }}>📋</span> Ver Código de Conduta e Compliance →
              </a>
            )}
          </div>
          <div style={{ background: '#F2F4F7', borderRadius: 20, padding: 40,
            display: 'flex', flexDirection: 'column', gap: 20 }}>
            {[
              { icon: '🔍', label: 'Transparência', text: 'Processo de homologação claro e digital, sem burocracias desnecessárias.' },
              { icon: '⚡', label: 'Agilidade', text: 'Coleta automática de certidões e validação em tempo real pelo SIGEC-ELOS.' },
              { icon: '🤝', label: 'Oportunidades', text: 'Fornecedores homologados ganham visibilidade e acesso direto a cotações.' },
            ].map((item) => (
              <div key={item.label} style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 22, flexShrink: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                  {item.icon}
                </div>
                <div>
                  <h4 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4, color: '#0D1B2A' }}>{item.label}</h4>
                  <p style={{ fontSize: 14, color: '#667085', lineHeight: 1.6 }}>{item.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ═══ COMO FUNCIONA ═══ */}
      <Section id="processo" dark style={{ background: secondaryDark }}>
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 2, color: accent, textTransform: 'uppercase' }}>
            Como funciona
          </span>
          <h2 style={{ fontFamily: fontDisplay, fontSize: mobile ? 28 : 36, fontWeight: 700, marginTop: 12, color: '#fff' }}>
            Etapas para Cadastro e Homologação
          </h2>
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.55)', marginTop: 12, maxWidth: 600, margin: '12px auto 0' }}>
            O processo de pré-homologação no SIGEC-ELOS é simples, digital e seguro.
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : 'repeat(4, 1fr)', gap: 24 }}>
          {[
            { n: 1, title: 'Informe o CNPJ', desc: 'O sistema consulta automaticamente a Receita Federal e preenche os dados da sua empresa.' },
            { n: 2, title: 'Escolha o Plano', desc: 'Selecione entre ELOS Simples ou Premium, de acordo com o nível de validação desejado.' },
            { n: 3, title: 'Valide Documentos', desc: 'Certidões são coletadas automaticamente. Documentos adicionais podem ser enviados pelo portal.' },
            { n: 4, title: 'Receba o Selo', desc: 'Após a validação, seu perfil fica visível na vitrine de fornecedores homologados.' },
          ].map((step) => (
            <div key={step.n} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 16, padding: 28 }}>
              <div className="step-num" style={{ marginBottom: 20 }}>{step.n}</div>
              <h3 style={{ fontSize: 17, fontWeight: 600, marginBottom: 10, color: '#fff' }}>{step.title}</h3>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', lineHeight: 1.65 }}>{step.desc}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ═══ PLANOS ═══ */}
      <Section id="planos" style={{ background: '#F7F8FA' }}>
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 2, color: accent, textTransform: 'uppercase' }}>
            Licenças SIGEC-ELOS
          </span>
          <h2 style={{ fontFamily: fontDisplay, fontSize: mobile ? 28 : 36, fontWeight: 700, marginTop: 12, color: '#0D1B2A' }}>
            Escolha o plano ideal para sua empresa
          </h2>
          <p style={{ fontSize: 16, color: '#667085', marginTop: 12, maxWidth: 580, margin: '12px auto 0' }}>
            Assinatura anual com valores acessíveis. A {companyName} não recebe
            nenhum benefício financeiro com estas anuidades.
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : 'repeat(2, 1fr)',
          gap: 28, maxWidth: 780, margin: '0 auto' }}>
          {ELOS_PLANS.map((plan) => (
            <div key={plan.id} className={`plan-card${plan.popular ? ' popular' : ''}`}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>{plan.icon}</div>
              <h3 style={{ fontSize: 20, fontWeight: 700, color: '#0D1B2A', marginBottom: 4 }}>{plan.name}</h3>
              <div style={{ marginBottom: 24 }}>
                <span style={{ fontSize: 14, color: '#667085' }}>R$</span>
                <span style={{ fontSize: 44, fontWeight: 700, color: plan.popular ? accent : plan.color, marginLeft: 2 }}>
                  {plan.price}
                </span>
                <span style={{ fontSize: 15, color: '#98A2B3' }}>{plan.period}</span>
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 28px 0' }}>
                {plan.features.map((f, i) => (
                  <li key={i} style={{ fontSize: 14, color: '#475467', padding: '8px 0',
                    borderBottom: i < plan.features.length - 1 ? '1px solid #F2F4F7' : 'none',
                    display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <span style={{ color: plan.popular ? accent : plan.color, fontWeight: 700, fontSize: 16, lineHeight: 1 }}>✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <button className="btn-primary" onClick={() => document.getElementById('cadastro')?.scrollIntoView({ behavior: 'smooth' })}
                style={{ width: '100%', background: plan.popular ? accent : secondary }}>
                {plan.cta}
              </button>
            </div>
          ))}
        </div>
        <p style={{ textAlign: 'center', fontSize: 13, color: '#98A2B3', marginTop: 28, lineHeight: 1.6 }}>
          Os valores são direcionados a empresas brasileiras com CNPJs ativos na Receita Federal do Brasil.<br />
          Pagamento processado com segurança via Stripe.
        </p>
      </Section>

      {/* ═══ TRUST BAR ═══ */}
      <Section style={{ padding: '48px 24px', background: '#fff', borderTop: '1px solid #E4E7EC' }}>
        <div style={{ display: 'flex', flexDirection: mobile ? 'column' : 'row',
          alignItems: 'center', justifyContent: 'center', gap: mobile ? 20 : 48, textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: secondaryDark,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: accent, fontWeight: 800, fontSize: 13, fontFamily: font }}>
              eQ
            </div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0D1B2A' }}>EQPI Tech</div>
              <div style={{ fontSize: 12, color: '#98A2B3' }}>Plataforma SIGEC-ELOS</div>
            </div>
          </div>
          {[
            { n: '60.000+', l: 'Fornecedores' },
            { n: '7,2 bi', l: 'Documentos analisados' },
            { n: '31%', l: 'Redução de risco' },
          ].map((s) => (
            <div key={s.l}>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#0D1B2A' }}>{s.n}</div>
              <div style={{ fontSize: 12, color: '#98A2B3' }}>{s.l}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* ═══ CTA FINAL ═══ */}
      <Section dark style={{ background: `linear-gradient(135deg, ${secondaryDark}, ${secondary})`, textAlign: 'center', padding: '80px 24px' }}>
        <h2 style={{ fontFamily: fontDisplay, fontSize: mobile ? 28 : 40,
          fontWeight: 700, color: '#fff', marginBottom: 16 }}>
          Pronto para ser fornecedor da {companyName}?
        </h2>
        <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.55)', marginBottom: 36, maxWidth: 500, margin: '0 auto 36px' }}>
          Inicie sua pré-homologação agora e ganhe visibilidade no maior ecossistema
          de gestão de fornecedores do Brasil.
        </p>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
          <a href="#cadastro" className="btn-primary" style={{ fontSize: 16, padding: '16px 40px' }}>
            Cadastrar Minha Empresa
          </a>
          {client.contact_email && (
            <a href={`mailto:${client.contact_email}`} className="btn-outline" style={{ fontSize: 16, padding: '16px 40px' }}>
              ✉ Falar por E-mail
            </a>
          )}
          {client.phone && (
            <a href={`tel:${client.phone.replace(/\D/g,'')}`} className="btn-outline" style={{ fontSize: 16, padding: '16px 40px' }}>
              📞 {client.phone}
            </a>
          )}
        </div>
      </Section>

      {/* ═══ FOOTER ═══ */}
      <footer style={{ background: secondaryDark, padding: '40px 24px', textAlign: 'center',
        borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 24, flexWrap: 'wrap', marginBottom: 20 }}>
            {client.website_url && (
              <a href={client.website_url} target="_blank" rel="noopener noreferrer"
                style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, textDecoration: 'none' }}>
                Site da {companyName}
              </a>
            )}
            {client.linkedin_url && (
              <a href={client.linkedin_url} target="_blank" rel="noopener noreferrer"
                style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, textDecoration: 'none' }}>
                LinkedIn
              </a>
            )}
            {client.contact_email && (
              <a href={`mailto:${client.contact_email}`}
                style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, textDecoration: 'none' }}>
                {client.contact_email}
              </a>
            )}
            {client.phone && (
              <a href={`tel:${client.phone.replace(/\D/g,'')}`}
                style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, textDecoration: 'none' }}>
                {client.phone}
              </a>
            )}
            <a href="https://elos.eqpitech.com.br" target="_blank" rel="noopener noreferrer"
              style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, textDecoration: 'none' }}>
              SIGEC-ELOS
            </a>
          </div>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', lineHeight: 1.6 }}>
            Portal operado pela plataforma SIGEC-ELOS · EQPI Tech ·
            A {companyName} não obtém resultado financeiro com as anuidades pagas à EQPI Tech.
          </p>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.15)', marginTop: 8 }}>
            © {new Date().getFullYear()} EQPI Tech. Todos os direitos reservados.
          </p>
        </div>
      </footer>
    </div>
  )
}
