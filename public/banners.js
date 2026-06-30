/**
 * EQPI Tech — Banner de Comunicação (Embed Universal)
 * Versão: 1.0.0
 *
 * Instalação em qualquer sistema (Java/.xhtml, JSP, HTML):
 *   <script src="https://elos.eqpitech.com.br/banners.js" defer></script>
 *
 * Suporta banners com imagem (PNG 1200×200px) e banners de texto.
 * Rotação automática a cada 5 segundos. Fechamento salvo por sessão.
 */
;(function () {
  'use strict'

  var API_URL     = 'https://elos.eqpitech.com.br/.netlify/functions/get-banners'
  var INTERVAL_MS = 5000
  var SESSION_KEY = 'eqpi_banner_dismissed'

  if (sessionStorage.getItem(SESSION_KEY)) return

  var TIPO_COLOR = {
    novidade:   '#22c55e',
    manutencao: '#ef4444',
    lancamento: '#2E3192',
    produto:    '#F47E2F',
    feriado:    '#f59e0b',
  }
  var TIPO_ICON = {
    novidade:   '✨',
    manutencao: '🔧',
    lancamento: '🚀',
    produto:    '📦',
    feriado:    '🎉',
  }

  function css(el, styles) {
    Object.assign(el.style, styles)
  }

  function buildSlide(banner) {
    var slide = document.createElement('div')
    css(slide, { width: '100%', position: 'relative', display: 'none', boxSizing: 'border-box' })

    if (banner.image_url) {
      // ── Modo imagem ───────────────────────────────────────────
      var wrapper = banner.cta_url ? document.createElement('a') : document.createElement('div')
      if (banner.cta_url) {
        wrapper.href   = banner.cta_url
        wrapper.target = '_blank'
        wrapper.rel    = 'noopener noreferrer'
      }
      css(wrapper, { display: 'block', lineHeight: '0' })

      var img = document.createElement('img')
      img.src = banner.image_url
      img.alt = banner.image_alt || banner.title || 'Comunicado EQPI Tech'
      css(img, {
        width: '100%', maxHeight: '200px',
        objectFit: 'cover', display: 'block',
        cursor: banner.cta_url ? 'pointer' : 'default',
      })
      wrapper.appendChild(img)
      slide.appendChild(wrapper)
    } else {
      // ── Modo texto ────────────────────────────────────────────
      var color = TIPO_COLOR[banner.tipo] || '#2E3192'
      var icon  = TIPO_ICON[banner.tipo]  || '📢'
      css(slide, {
        display:       'flex',
        alignItems:    'center',
        padding:       '10px 48px 10px 16px',
        minHeight:     '48px',
        background:    color + '18',
        borderBottom:  '3px solid ' + color,
        gap:           '10px',
        boxSizing:     'border-box',
      })

      var badge = document.createElement('span')
      css(badge, {
        background:   color, color: '#fff',
        padding:      '3px 12px', borderRadius: '20px',
        fontSize:     '11px', fontWeight: '700',
        fontFamily:   'sans-serif', whiteSpace: 'nowrap', flexShrink: '0',
      })
      badge.textContent = icon + ' ' + (banner.tipo || 'comunicado').replace(/^./, function (c) { return c.toUpperCase() })
      slide.appendChild(badge)

      var titleEl = document.createElement('span')
      css(titleEl, { flex: '1', fontSize: '13px', fontWeight: '600', fontFamily: 'sans-serif', color: '#1a1c5e' })
      titleEl.textContent = banner.title || ''
      slide.appendChild(titleEl)

      if (banner.body) {
        var bodyEl = document.createElement('span')
        css(bodyEl, { fontSize: '12px', color: '#64748b', fontFamily: 'sans-serif' })
        bodyEl.textContent = banner.body
        slide.appendChild(bodyEl)
      }

      if (banner.cta_url && banner.cta_label) {
        var cta = document.createElement('a')
        cta.href   = banner.cta_url
        cta.target = '_blank'
        cta.rel    = 'noopener noreferrer'
        cta.textContent = banner.cta_label
        css(cta, {
          background: color, color: '#fff', textDecoration: 'none',
          padding: '5px 14px', borderRadius: '8px',
          fontSize: '12px', fontWeight: '700', fontFamily: 'sans-serif',
          whiteSpace: 'nowrap', flexShrink: '0',
        })
        slide.appendChild(cta)
      }
    }

    return slide
  }

  function init(banners) {
    if (!banners || !banners.length) return

    var idx    = 0
    var timer  = null
    var slides = []

    // ── Wrapper ──────────────────────────────────────────────────
    var wrap = document.createElement('div')
    wrap.id = 'eqpi-banner-root'
    css(wrap, { width: '100%', position: 'relative', overflow: 'hidden', fontFamily: 'sans-serif', zIndex: '99999' })

    // ── Slides ───────────────────────────────────────────────────
    banners.forEach(function (b, i) {
      var s = buildSlide(b)
      if (i === 0) s.style.display = b.image_url ? 'block' : 'flex'
      wrap.appendChild(s)
      slides.push(s)
    })

    // ── Botão fechar ─────────────────────────────────────────────
    var closeBtn = document.createElement('button')
    closeBtn.textContent = '✕'
    css(closeBtn, {
      position: 'absolute', top: '6px', right: '6px', zIndex: '10',
      width: '22px', height: '22px', borderRadius: '50%',
      background: 'rgba(0,0,0,.3)', color: '#fff', border: 'none',
      cursor: 'pointer', fontSize: '11px', lineHeight: '1',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'sans-serif', padding: '0',
    })
    closeBtn.onclick = function () {
      if (timer) clearInterval(timer)
      wrap.remove()
      sessionStorage.setItem(SESSION_KEY, '1')
    }
    wrap.appendChild(closeBtn)

    function goTo(n) {
      var current = slides[idx]
      current.style.display = 'none'
      idx = ((n % banners.length) + banners.length) % banners.length
      var next = slides[idx]
      next.style.display = banners[idx].image_url ? 'block' : 'flex'
      if (dots) updateDots()
    }

    // ── Dots (só com múltiplos banners) ──────────────────────────
    var dots = null
    if (banners.length > 1) {
      dots = document.createElement('div')
      css(dots, {
        position: 'absolute', bottom: '6px', left: '50%',
        transform: 'translateX(-50%)', display: 'flex', gap: '5px', zIndex: '10',
      })

      banners.forEach(function (_, i) {
        var dot = document.createElement('button')
        css(dot, {
          width: '7px', height: '7px', borderRadius: '50%', border: 'none',
          cursor: 'pointer', padding: '0',
          background: i === 0 ? '#fff' : 'rgba(255,255,255,.45)',
        })
        dot.onclick = function () { if (timer) clearInterval(timer); goTo(i); startTimer() }
        dots.appendChild(dot)
      })
      wrap.appendChild(dots)

      function updateDots() {
        Array.from(dots.children).forEach(function (d, i) {
          d.style.background = i === idx ? '#fff' : 'rgba(255,255,255,.45)'
        })
      }

      function startTimer() {
        timer = setInterval(function () { goTo(idx + 1) }, INTERVAL_MS)
      }

      startTimer()
    }

    // ── Injetar no topo do body ───────────────────────────────────
    document.body.insertBefore(wrap, document.body.firstChild)
  }

  fetch(API_URL)
    .then(function (r) { return r.json() })
    .then(init)
    .catch(function () { /* falha silenciosa */ })
})()
