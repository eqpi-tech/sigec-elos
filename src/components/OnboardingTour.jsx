// Onboarding guiado por perfil (estilo SaaS): checklist "Primeiros passos"
// flutuante, com passos concluídos persistidos no servidor
// (profiles.onboarding_state, patch_063) — não voltam em outro navegador.
// · Abre expandido no primeiro acesso; "Pular" recolhe para o botão 💡
// · Passo marcado ✅ ao clicar (navega) ou ao visitar a rota (auto)
import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { supabase } from '../lib/supabase.js'

const STEPS = {
  SUPPLIER: [
    { id:'acompanhamento', icon:'📊', title:'Acompanhe sua homologação', desc:'Veja o status dos seus processos e o que falta para o selo.', path:'/fornecedor', auto:'/fornecedor' },
    { id:'documentos',     icon:'📄', title:'Envie seus documentos',     desc:'Mantenha certidões em dia — avisamos antes de vencerem.',   path:'/fornecedor/documentos', auto:'/fornecedor/documentos' },
    { id:'questionario',   icon:'❓', title:'Responda os questionários', desc:'Exigidos por alguns clientes no processo de homologação.',  path:'/fornecedor/questionario', auto:'/fornecedor/questionario' },
    { id:'meus_dados',     icon:'🏢', title:'Confira seus dados',        desc:'Cadastro, sócios e contatos — é o que os compradores veem.', path:'/fornecedor/dados', auto:'/fornecedor/dados' },
    { id:'clientes_elos',  icon:'🤝', title:'Clientes ELOS',             desc:'Declare interesse em fornecer para os clientes da rede.',   path:'/fornecedor/clientes', auto:'/fornecedor/clientes' },
    { id:'equipe',         icon:'👥', title:'Convide sua equipe',        desc:'Dê acesso a colegas da sua empresa.',                       path:'/fornecedor/equipe', auto:'/fornecedor/equipe' },
  ],
  BUYER: [
    { id:'pesquisa',       icon:'🔍', title:'Pesquise fornecedores',     desc:'Filtre por categoria, selo, região — mais de 60 mil empresas.', path:'/comprador', auto:'/comprador' },
    { id:'convite',        icon:'✉️', title:'Convide um fornecedor',     desc:'Selecione na busca e clique em Convidar.',                  path:'/comprador' },
    { id:'acompanhamento', icon:'📩', title:'Acompanhe seus convites',   desc:'Veja quem visualizou, cadastrou e respondeu.',              path:'/comprador/convites', auto:'/comprador/convites' },
  ],
  CLIENT: [
    { id:'meus',           icon:'🏭', title:'Meus fornecedores',         desc:'Sua base homologada e o status de cada processo.',          path:'/cliente/fornecedores', auto:'/cliente/fornecedores' },
    { id:'todos',          icon:'🔍', title:'Todos os fornecedores',     desc:'Pesquise em toda a base ELOS na aba "Todos".',              path:'/cliente/fornecedores' },
    { id:'intencao',       icon:'💡', title:'Fornecedores com intenção', desc:'Quem declarou interesse em atender sua empresa (aba Interessados).', path:'/cliente/fornecedores' },
    { id:'convites',       icon:'✉️', title:'Envie convites',            desc:'Chame fornecedores para o seu processo de homologação.',    path:'/cliente/convites', auto:'/cliente/convites' },
    { id:'rfq',            icon:'📝', title:'Crie uma cotação (RFQ)',    desc:'Peça propostas para vários fornecedores de uma vez.',       path:'/cliente/rfq', auto:'/cliente/rfq' },
    { id:'questionarios',  icon:'❓', title:'Consulte questionários',    desc:'O que seus fornecedores respondem no processo.',            path:'/cliente/questionarios', auto:'/cliente/questionarios' },
    { id:'equipe',         icon:'👥', title:'Convide sua equipe',        desc:'Dê acesso aos colegas que operam com você.',                path:'/cliente/equipe', auto:'/cliente/equipe' },
  ],
}

const font   = { fontFamily:'DM Sans,sans-serif' }
const titleF = { fontFamily:'Montserrat,sans-serif' }

export default function OnboardingTour() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const steps = STEPS[user?.role]
  const [state, setState]   = useState(null)   // { done:{}, skipped, dismissed } | null = carregando
  const [open, setOpen]     = useState(false)
  const saveTimer = useRef(null)
  const openedOnce = useRef(false)

  // Carrega estado persistido
  useEffect(() => {
    if (!user?.id || !steps) return
    supabase.from('profiles').select('onboarding_state').eq('id', user.id).maybeSingle()
      .then(({ data }) => {
        const st = data?.onboarding_state || {}
        setState({ done: st.done || {}, skipped: !!st.skipped, dismissed: !!st.dismissed })
      })
  }, [user?.id, user?.role])

  // Primeiro acesso: abre expandido (uma vez por sessão)
  useEffect(() => {
    if (!state || openedOnce.current) return
    openedOnce.current = true
    const doneCount = Object.keys(state.done).length
    if (!state.skipped && !state.dismissed && doneCount < (steps?.length || 0)) {
      const t = setTimeout(() => setOpen(true), 800)
      return () => clearTimeout(t)
    }
  }, [state])

  const persist = (next) => {
    setState(next)
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      supabase.from('profiles').update({ onboarding_state: next }).eq('id', user.id)
        .then(({ error }) => { if (error) console.warn('[onboarding] save:', error.message) })
    }, 600)
  }

  // Auto-conclui passo ao visitar a rota correspondente
  useEffect(() => {
    if (!state || !steps) return
    const hit = steps.find(s => s.auto && (pathname === s.auto) && !state.done[s.id])
    if (hit) persist({ ...state, done: { ...state.done, [hit.id]: true } })
  }, [pathname, state, steps])

  const doneCount = useMemo(() => steps ? steps.filter(s => state?.done[s.id]).length : 0, [state, steps])
  if (!steps || !state) return null
  const allDone = doneCount === steps.length
  if (state.dismissed || pathname.startsWith('/demo')) return null

  const goStep = (s) => {
    if (!state.done[s.id]) persist({ ...state, done: { ...state.done, [s.id]: true } })
    setOpen(false)
    navigate(s.path)
  }

  return (
    <div style={{ position:'fixed', right:20, bottom:20, zIndex:900, display:'flex', flexDirection:'column', alignItems:'flex-end', gap:10 }}>
      {open && (
        <div style={{ width:340, maxWidth:'calc(100vw - 40px)', background:'#fff', borderRadius:16, boxShadow:'0 16px 50px rgba(26,28,94,.25)', border:'1px solid #e2e4ef', overflow:'hidden' }}>
          <div style={{ background:'linear-gradient(135deg,#2E3192,#3d40b5)', padding:'16px 20px', color:'#fff' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ ...titleF, fontWeight:800, fontSize:15 }}>🚀 Primeiros passos</div>
              <button onClick={() => setOpen(false)} style={{ background:'none', border:'none', color:'#C7D2FE', cursor:'pointer', fontSize:16, lineHeight:1 }}>✕</button>
            </div>
            <div style={{ ...font, fontSize:12, color:'#C7D2FE', marginTop:3 }}>
              {allDone ? 'Tudo pronto — você conhece o essencial! 🎉' : `Conheça o ELOS — ${doneCount} de ${steps.length} concluídos`}
            </div>
            <div style={{ height:5, borderRadius:4, background:'rgba(255,255,255,.2)', marginTop:10, overflow:'hidden' }}>
              <div style={{ width:`${(doneCount/steps.length)*100}%`, height:'100%', background:'#F47E2F', borderRadius:4, transition:'width .4s' }}/>
            </div>
          </div>
          <div style={{ maxHeight:340, overflowY:'auto', padding:'8px 0' }}>
            {steps.map(s => {
              const done = !!state.done[s.id]
              return (
                <button key={s.id} onClick={() => goStep(s)}
                  style={{ display:'flex', gap:12, alignItems:'flex-start', width:'100%', textAlign:'left', background:'none', border:'none', cursor:'pointer', padding:'10px 20px', opacity: done ? .55 : 1 }}>
                  <span style={{ fontSize:16, marginTop:1 }}>{done ? '✅' : s.icon}</span>
                  <span style={{ flex:1 }}>
                    <span style={{ ...titleF, display:'block', fontWeight:700, fontSize:13, color:'#1a1c5e', textDecoration: done ? 'line-through' : 'none' }}>{s.title}</span>
                    <span style={{ ...font, display:'block', fontSize:11.5, color:'#9B9B9B', marginTop:1 }}>{s.desc}</span>
                  </span>
                  {!done && <span style={{ ...font, fontSize:11, color:'#F47E2F', fontWeight:700, whiteSpace:'nowrap', marginTop:3 }}>Ir →</span>}
                </button>
              )
            })}
          </div>
          <div style={{ borderTop:'1px solid #f1f2f8', padding:'10px 20px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            {allDone ? (
              <button onClick={() => persist({ ...state, dismissed: true })}
                style={{ ...titleF, width:'100%', background:'#2E3192', color:'#fff', border:'none', borderRadius:10, padding:'10px', fontWeight:700, fontSize:13, cursor:'pointer' }}>
                🎉 Concluir tour
              </button>
            ) : (
              <>
                <button onClick={() => { persist({ ...state, skipped: true }); setOpen(false) }}
                  style={{ ...font, background:'none', border:'none', color:'#9B9B9B', fontSize:12, cursor:'pointer' }}>
                  Pular por enquanto
                </button>
                <span style={{ ...font, fontSize:11, color:'#c0c2d4' }}>seu progresso fica salvo</span>
              </>
            )}
          </div>
        </div>
      )}
      {!open && (
        <button onClick={() => setOpen(true)} title="Primeiros passos"
          style={{ display:'flex', alignItems:'center', gap:8, background:'#2E3192', color:'#fff', border:'none', borderRadius:24, padding:'10px 16px', cursor:'pointer', boxShadow:'0 6px 20px rgba(46,49,146,.35)' }}>
          <span style={{ fontSize:15 }}>{allDone ? '🎉' : '🚀'}</span>
          <span style={{ ...titleF, fontWeight:700, fontSize:12.5 }}>
            {allDone ? 'Tour concluído' : `Primeiros passos · ${doneCount}/${steps.length}`}
          </span>
        </button>
      )}
    </div>
  )
}
