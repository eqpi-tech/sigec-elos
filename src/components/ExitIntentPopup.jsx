import { useEffect, useRef, useState } from 'react'

const STORAGE_KEY = 'sigecelos_survey_shown'
// Delay mínimo em ms antes de ativar o exit intent (evita disparar imediatamente)
const ACTIVATION_DELAY = 8000

export default function ExitIntentPopup() {
  const [visible, setVisible]     = useState(false)
  const [closing, setClosing]     = useState(false)
  const [progress, setProgress]   = useState(100) // para a barra de "fechar em X seg"
  const activeRef  = useRef(false)  // exit intent ativo?
  const timerRef   = useRef(null)
  const countRef   = useRef(null)

  useEffect(() => {
    // Só dispara uma vez por browser
    if (localStorage.getItem(STORAGE_KEY)) return

    // Aguarda o tempo mínimo de navegação antes de armar o gatilho
    const armTimer = setTimeout(() => {
      activeRef.current = true
    }, ACTIVATION_DELAY)

    // Exit intent: mouse saindo pelo topo da janela
    const handleMouseLeave = (e) => {
      if (!activeRef.current) return
      if (e.clientY > 20) return          // só topo
      if (e.relatedTarget || e.toElement) return  // indo para elemento interno
      show()
    }

    // Fallback mobile: visibilidade da aba (usuário troca de app)
    const handleVisibility = () => {
      if (!activeRef.current) return
      if (document.visibilityState === 'hidden') show()
    }

    document.addEventListener('mouseleave', handleMouseLeave)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      clearTimeout(armTimer)
      document.removeEventListener('mouseleave', handleMouseLeave)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  const show = () => {
    if (localStorage.getItem(STORAGE_KEY)) return
    activeRef.current = false  // não dispara duas vezes
    localStorage.setItem(STORAGE_KEY, '1')
    setVisible(true)
  }

  const dismiss = () => {
    clearInterval(countRef.current)
    clearTimeout(timerRef.current)
    setClosing(true)
    setTimeout(() => setVisible(false), 350)
  }

  // Não renderiza nada se não for mostrar
  if (!visible) return null

  return (
    <>
      {/* Overlay */}
      <div
        onClick={dismiss}
        style={{
          position: 'fixed', inset: 0, zIndex: 9998,
          background: 'rgba(26,28,94,0.55)',
          backdropFilter: 'blur(4px)',
          animation: closing ? 'fadeOut 0.3s ease forwards' : 'fadeIn 0.3s ease',
        }}
      />

      {/* Modal */}
      <div style={{
        position: 'fixed', zIndex: 9999,
        top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 'min(680px, 96vw)',
        maxHeight: '90vh',
        background: '#fff',
        borderRadius: 20,
        boxShadow: '0 24px 80px rgba(26,28,94,0.35)',
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        animation: closing ? 'slideDown 0.35s ease forwards' : 'slideUp 0.35s ease',
      }}>

        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #2E3192, #3d40b5)',
          padding: '20px 24px 18px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <img src="/logo.png" alt="SIGEC-ELOS" style={{ height: 38, width: 'auto' }} />
            <div>
              <div style={{
                fontFamily: 'Montserrat, sans-serif', fontWeight: 800,
                fontSize: 15, color: '#fff', lineHeight: 1.2,
              }}>
                Sua opinião é muito importante! 🙏
              </div>
              <div style={{
                fontFamily: 'DM Sans, sans-serif', fontSize: 12,
                color: 'rgba(255,255,255,0.65)', marginTop: 2,
              }}>
                Responda em menos de 2 minutos e nos ajude a melhorar o SIGEC-ELOS
              </div>
            </div>
          </div>

          <button
            onClick={dismiss}
            aria-label="Fechar"
            style={{
              width: 32, height: 32, borderRadius: 10,
              background: 'rgba(255,255,255,0.12)',
              border: '1px solid rgba(255,255,255,0.2)',
              color: '#fff', fontSize: 18, lineHeight: 1,
              cursor: 'pointer', display: 'flex', alignItems: 'center',
              justifyContent: 'center', flexShrink: 0,
              transition: 'background 0.15s',
              fontFamily: 'sans-serif',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.22)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}
          >
            ✕
          </button>
        </div>

        {/* Accent bar */}
        <div style={{ height: 3, background: 'linear-gradient(90deg, #F47E2F, #ff9a52, #2E3192)', flexShrink: 0 }} />

        {/* Survey iframe */}
        <div style={{ flex: 1, minHeight: 420, position: 'relative', background: '#f4f5f9' }}>
          {/* Loading state */}
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexDirection: 'column', gap: 10, pointerEvents: 'none',
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              border: '3px solid #e2e4ef', borderTopColor: '#F47E2F',
              animation: 'spin 0.8s linear infinite',
            }} />
            <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: '#9B9B9B' }}>
              Carregando pesquisa...
            </span>
          </div>

          <iframe
            src="/pesquisa-sigec.html"
            title="Pesquisa de satisfação SIGEC-ELOS"
            style={{
              width: '100%', height: '100%', minHeight: 420,
              border: 'none', position: 'relative', zIndex: 1,
              background: 'transparent',
            }}
            onLoad={e => {
              // Remove loading overlay when iframe loads
              const loader = e.currentTarget.previousSibling
              if (loader) loader.style.display = 'none'
            }}
          />
        </div>

        {/* Footer */}
        <div style={{
          padding: '10px 24px',
          background: '#fafafa', borderTop: '1px solid #e2e4ef',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 11, color: '#9B9B9B' }}>
            🔒 Anônimo · Dados usados apenas para melhorar o produto
          </span>
          <button
            onClick={dismiss}
            style={{
              fontFamily: 'DM Sans, sans-serif', fontSize: 12, color: '#9B9B9B',
              background: 'none', border: 'none', cursor: 'pointer',
              textDecoration: 'underline', padding: 0,
            }}
          >
            Pular pesquisa
          </button>
        </div>
      </div>

      {/* Animations */}
      <style>{`
        @keyframes fadeIn    { from { opacity: 0 } to { opacity: 1 } }
        @keyframes fadeOut   { from { opacity: 1 } to { opacity: 0 } }
        @keyframes slideUp   { from { opacity: 0; transform: translate(-50%, calc(-50% + 24px)) } to { opacity: 1; transform: translate(-50%, -50%) } }
        @keyframes slideDown { from { opacity: 1; transform: translate(-50%, -50%) } to { opacity: 0; transform: translate(-50%, calc(-50% + 24px)) } }
        @keyframes spin      { to { transform: rotate(360deg) } }
      `}</style>
    </>
  )
}
