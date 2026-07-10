import { useState, useEffect, useCallback, useRef } from 'react'

const SESSION_KEY = 'eqpi_banner_dismissed'

const TIPO_COLOR = {
  novidade:   '#22c55e',
  manutencao: '#ef4444',
  lancamento: '#2E3192',
  produto:    '#F47E2F',
  feriado:    '#f59e0b',
}
const TIPO_ICON = {
  novidade:   '✨',
  manutencao: '🔧',
  lancamento: '🚀',
  produto:    '📦',
  feriado:    '🎉',
}

export default function BannerStrip() {
  const [banners,   setBanners]   = useState([])
  const [idx,       setIdx]       = useState(0)
  const [dismissed, setDismissed] = useState(() => !!sessionStorage.getItem(SESSION_KEY))
  const timerRef = useRef(null)

  useEffect(() => {
    fetch('/.netlify/functions/get-banners')
      .then(r => r.json())
      .then(data => Array.isArray(data) ? setBanners(data) : [])
      .catch(() => {})
  }, [])

  const goTo = useCallback((n) => {
    setIdx(prev => ((n % banners.length) + banners.length) % banners.length)
  }, [banners.length])

  useEffect(() => {
    if (banners.length < 2) return
    timerRef.current = setInterval(() => setIdx(i => (i + 1) % banners.length), 5000)
    return () => clearInterval(timerRef.current)
  }, [banners.length])

  const handleDismiss = () => {
    sessionStorage.setItem(SESSION_KEY, '1')
    setDismissed(true)
  }

  const resetTimer = (n) => {
    clearInterval(timerRef.current)
    goTo(n)
    if (banners.length > 1) {
      timerRef.current = setInterval(() => setIdx(i => (i + 1) % banners.length), 5000)
    }
  }

  if (dismissed || !banners.length) return null

  const banner = banners[idx]
  const color  = TIPO_COLOR[banner.tipo] || '#2E3192'
  const icon   = TIPO_ICON[banner.tipo]  || '📢'

  return (
    <div style={{ width:'60%', margin:'0 auto', position:'relative', overflow:'hidden', borderRadius:10 }}>

      {/* ── Modo imagem ──────────────────────────────────────── */}
      {banner.image_url ? (
        <div style={{ position:'relative', lineHeight:0 }}>
          {banner.cta_url ? (
            <a href={banner.cta_url} target="_blank" rel="noopener noreferrer" style={{ display:'block' }}>
              <img src={banner.image_url} alt={banner.image_alt || banner.title || 'Comunicado'}
                style={{ width:'100%', height:'auto', display:'block' }}/>
            </a>
          ) : (
            <img src={banner.image_url} alt={banner.image_alt || banner.title || 'Comunicado'}
              style={{ width:'100%', height:'auto', display:'block' }}/>
          )}
        </div>
      ) : (
        /* ── Modo texto ─────────────────────────────────────── */
        <div style={{ display:'flex', alignItems:'center', padding:'10px 48px 10px 16px',
          minHeight:48, background:`${color}18`, borderBottom:`3px solid ${color}`, gap:10, boxSizing:'border-box' }}>
          <span style={{ background:color, color:'#fff', padding:'3px 12px', borderRadius:20,
            fontSize:11, fontWeight:700, fontFamily:'Montserrat,sans-serif', whiteSpace:'nowrap', flexShrink:0 }}>
            {icon} {(banner.tipo || 'comunicado').replace(/^./, c => c.toUpperCase())}
          </span>
          <span style={{ flex:1, fontSize:13, fontWeight:600, color:'#1a1c5e', fontFamily:'DM Sans,sans-serif' }}>
            {banner.title}
          </span>
          {banner.body && (
            <span style={{ fontSize:12, color:'#64748b', fontFamily:'DM Sans,sans-serif' }}>
              {banner.body}
            </span>
          )}
          {banner.cta_url && banner.cta_label && (
            <a href={banner.cta_url} target="_blank" rel="noopener noreferrer"
              style={{ background:color, color:'#fff', textDecoration:'none',
                padding:'5px 14px', borderRadius:8, fontSize:12, fontWeight:700,
                fontFamily:'Montserrat,sans-serif', whiteSpace:'nowrap', flexShrink:0 }}>
              {banner.cta_label}
            </a>
          )}
        </div>
      )}

      {/* ── Botão fechar ──────────────────────────────────── */}
      <button onClick={handleDismiss}
        style={{ position:'absolute', top:6, right:6, width:22, height:22, borderRadius:'50%',
          background:'rgba(0,0,0,.28)', color:'#fff', border:'none', cursor:'pointer',
          fontSize:11, display:'flex', alignItems:'center', justifyContent:'center',
          fontFamily:'sans-serif', lineHeight:1, zIndex:10, padding:0 }}>
        ✕
      </button>

      {/* ── Dots ─────────────────────────────────────────── */}
      {banners.length > 1 && (
        <div style={{ position:'absolute', bottom:6, left:'50%', transform:'translateX(-50%)',
          display:'flex', gap:5, zIndex:10 }}>
          {banners.map((_, i) => (
            <button key={i} onClick={() => resetTimer(i)}
              style={{ width:7, height:7, borderRadius:'50%', border:'none', cursor:'pointer', padding:0,
                background: i === idx ? '#fff' : 'rgba(255,255,255,.4)' }}/>
          ))}
        </div>
      )}
    </div>
  )
}
