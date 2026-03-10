// ─── SIGEC-ELOS Shared Components ─────────────────────────────────────────

// ── Badge de nível ──────────────────────────────────────────────────────────
export const Badge = ({ level }) => {
  const configs = {
    Simples:  { bg: '#e8f4fd', color: '#2563eb', border: '#2563eb22' },
    Premium:  { bg: '#fff7ed', color: '#ea580c', border: '#ea580c22' },
    HOC:      { bg: '#f0fdf4', color: '#16a34a', border: '#16a34a22' },
    Pendente: { bg: '#fef9c3', color: '#ca8a04', border: '#ca8a0422' },
  }
  const c = configs[level] || configs.Simples
  return (
    <span style={{
      background: c.bg, color: c.color,
      fontSize: 10, fontWeight: 700, letterSpacing: 1,
      padding: '3px 10px', borderRadius: 20,
      fontFamily: 'Montserrat, sans-serif',
      border: `1px solid ${c.border}`,
      display: 'inline-flex', alignItems: 'center',
    }}>
      {level.toUpperCase()}
    </span>
  )
}

// ── Selo circular ────────────────────────────────────────────────────────────
export const Seal = ({ level, size = 60 }) => {
  const configs = {
    Simples: { outer: '#2563eb', inner: '#dbeafe', text: '#1d4ed8', icon: '✓' },
    Premium: { outer: '#ea580c', inner: '#fff7ed', text: '#c2410c', icon: '★' },
    HOC:     { outer: '#16a34a', inner: '#f0fdf4', text: '#15803d', icon: '✦' },
  }
  const c = configs[level] || configs.Simples
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: `radial-gradient(circle, ${c.inner}, ${c.outer}22)`,
      border: `3px solid ${c.outer}`,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      boxShadow: `0 0 0 4px ${c.outer}11, 0 4px 12px ${c.outer}33`,
      flexShrink: 0,
    }}>
      <div style={{ fontSize: size * 0.3, color: c.outer, lineHeight: 1 }}>{c.icon}</div>
      <div style={{
        fontSize: Math.max(size * 0.115, 7), fontWeight: 800,
        color: c.text, letterSpacing: 0.3,
        fontFamily: 'Montserrat, sans-serif', lineHeight: 1.2, textAlign: 'center',
        marginTop: 2, padding: '0 4px',
      }}>
        ELOS {level.toUpperCase()}
      </div>
    </div>
  )
}

// ── Botões ────────────────────────────────────────────────────────────────────
const BTN_STYLES = {
  primary: {
    background: 'linear-gradient(135deg, #2E3192, #3d40b5)',
    color: '#fff', border: 'none',
    boxShadow: '0 4px 14px rgba(46,49,146,0.35)',
  },
  orange: {
    background: 'linear-gradient(135deg, #F47E2F, #ff9a52)',
    color: '#fff', border: 'none',
    boxShadow: '0 4px 14px rgba(244,126,47,0.35)',
  },
  ghost: {
    background: 'rgba(244,126,47,0.1)',
    color: '#F47E2F',
    border: '1px solid rgba(244,126,47,0.35)',
    boxShadow: 'none',
  },
  neutral: {
    background: '#fff',
    color: '#2E3192',
    border: '1px solid #e2e4ef',
    boxShadow: 'none',
  },
  danger: {
    background: '#ef4444',
    color: '#fff', border: 'none',
    boxShadow: '0 4px 12px rgba(239,68,68,0.3)',
  },
}

export const Button = ({
  variant = 'primary', children, onClick, full = false,
  size = 'md', style: extraStyle = {}, disabled = false,
}) => {
  const sizes = {
    sm: { padding: '5px 12px', fontSize: 11, borderRadius: 8 },
    md: { padding: '10px 20px', fontSize: 13, borderRadius: 10 },
    lg: { padding: '13px 24px', fontSize: 14, borderRadius: 12 },
  }
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...BTN_STYLES[variant],
        ...sizes[size],
        fontFamily: 'Montserrat, sans-serif',
        fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        width: full ? '100%' : 'auto',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        transition: 'all 0.15s',
        ...extraStyle,
      }}
    >
      {children}
    </button>
  )
}

// ── Card base ─────────────────────────────────────────────────────────────────
export const Card = ({ children, style: s = {}, onClick, hover = false }) => (
  <div
    onClick={onClick}
    style={{
      background: '#fff',
      borderRadius: 14,
      padding: '18px 20px',
      border: '1px solid #e2e4ef',
      boxShadow: '0 1px 6px rgba(46,49,146,0.06)',
      cursor: onClick ? 'pointer' : 'default',
      transition: hover ? 'all 0.2s' : 'none',
      ...s,
    }}
    onMouseEnter={hover && onClick ? e => {
      e.currentTarget.style.boxShadow = '0 8px 24px rgba(46,49,146,0.12)'
      e.currentTarget.style.transform = 'translateY(-2px)'
    } : undefined}
    onMouseLeave={hover && onClick ? e => {
      e.currentTarget.style.boxShadow = '0 1px 6px rgba(46,49,146,0.06)'
      e.currentTarget.style.transform = 'none'
    } : undefined}
  >
    {children}
  </div>
)

// ── KPI Card ──────────────────────────────────────────────────────────────────
export const KpiCard = ({ label, value, sub, subColor, icon, iconBg }) => (
  <Card>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <div>
        <div style={{
          fontSize: 11, fontWeight: 600, color: '#9B9B9B', letterSpacing: 0.5,
          fontFamily: 'Montserrat, sans-serif', marginBottom: 6, textTransform: 'uppercase',
        }}>{label}</div>
        <div style={{
          fontSize: 24, fontWeight: 800, color: '#1a1c5e',
          fontFamily: 'Montserrat, sans-serif', lineHeight: 1,
        }}>{value}</div>
        <div style={{
          fontSize: 12, color: subColor || '#9B9B9B',
          fontFamily: 'DM Sans, sans-serif', marginTop: 4, fontWeight: 600,
        }}>{sub}</div>
      </div>
      <div style={{
        width: 42, height: 42, borderRadius: 12,
        background: iconBg || 'rgba(46,49,146,0.1)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 20, flexShrink: 0,
      }}>{icon}</div>
    </div>
  </Card>
)

// ── Score Bar ─────────────────────────────────────────────────────────────────
export const ScoreBar = ({ score, showValue = true }) => {
  const color = score >= 90 ? '#22c55e' : score >= 70 ? '#f59e0b' : '#ef4444'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 5, background: '#f4f5f9', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${score}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.6s ease' }} />
      </div>
      {showValue && (
        <div style={{ fontSize: 12, fontWeight: 700, color, fontFamily: 'Montserrat, sans-serif', width: 24, textAlign: 'right' }}>
          {score}
        </div>
      )}
    </div>
  )
}

// ── Status Icon ───────────────────────────────────────────────────────────────
export const StatusIcon = ({ status, size = 16 }) => {
  const icons = { ok: { icon: '✓', color: '#22c55e' }, warning: { icon: '⚠', color: '#f59e0b' }, missing: { icon: '✕', color: '#ef4444' } }
  const c = icons[status] || icons.ok
  return <span style={{ color: c.color, fontSize: size, fontWeight: 700 }}>{c.icon}</span>
}

// ── Section Title ─────────────────────────────────────────────────────────────
export const SectionTitle = ({ children }) => (
  <div style={{
    fontFamily: 'Montserrat, sans-serif', fontWeight: 700,
    fontSize: 15, color: '#1a1c5e', marginBottom: 16,
  }}>{children}</div>
)

// ── Progress Bar ──────────────────────────────────────────────────────────────
export const ProgressBar = ({ value, dark = false }) => (
  <div style={{
    height: 8, borderRadius: 8,
    background: dark ? 'rgba(255,255,255,0.15)' : '#f4f5f9',
    overflow: 'hidden',
  }}>
    <div style={{
      width: `${value}%`, height: '100%', borderRadius: 8,
      background: 'linear-gradient(90deg, #F47E2F, #ff9a52)',
      boxShadow: dark ? '0 0 10px rgba(244,126,47,0.6)' : 'none',
      transition: 'width 0.8s ease',
    }} />
  </div>
)

// ── Avatar ────────────────────────────────────────────────────────────────────
export const Avatar = ({ name, size = 34, gradient }) => (
  <div style={{
    width: size, height: size, borderRadius: '50%',
    background: gradient || 'linear-gradient(135deg, rgba(244,126,47,0.8), #3d40b5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#fff', fontWeight: 700,
    fontSize: Math.max(size * 0.38, 10),
    fontFamily: 'Montserrat, sans-serif',
    flexShrink: 0,
  }}>
    {name?.slice(0, 2).toUpperCase() || '??'}
  </div>
)
