// Medalha circular gamificada de selo de homologação.
// Usada no dashboard do fornecedor, perfil do buyer e processo do cliente.
const LEVEL_META = {
  Simples: {
    ring:   '#cd7f32',
    grad:   'radial-gradient(circle at 35% 35%, #e8a76d, #a0522d)',
    glow:   'rgba(205,127,50,.45)',
    icon:   '🏅',
    label:  'Bronze',
  },
  Premium: {
    ring:   '#9E9E9E',
    grad:   'radial-gradient(circle at 35% 35%, #e8e8e8, #757575)',
    glow:   'rgba(158,158,158,.45)',
    icon:   '🥈',
    label:  'Prata',
  },
  HOC: {
    ring:   '#FFD700',
    grad:   'radial-gradient(circle at 35% 35%, #ffe066, #c8860a)',
    glow:   'rgba(255,215,0,.5)',
    icon:   '🏆',
    label:  'Ouro',
  },
}

const STATUS_META = {
  ACTIVE:    { dot:'#22c55e', label:'Ativo' },
  PENDING:   { dot:'#f59e0b', label:'Em análise' },
  SUSPENDED: { dot:'#f59e0b', label:'Suspenso' },
  EXPIRED:   { dot:'#9B9B9B', label:'Expirado' },
}

const SIZES = { sm: 64, md: 96, lg: 128 }

export default function SealBadge({ seal, size = 'md', showClient = true, showScore = false }) {
  if (!seal) return null

  const px      = SIZES[size] ?? SIZES.md
  const level   = LEVEL_META[seal.level] ?? LEVEL_META.Simples
  const isSusp  = !!(seal.client_suspended_at || seal.status === 'SUSPENDED')
  const status  = isSusp ? 'SUSPENDED' : (seal.status || 'PENDING')
  const sMeta   = STATUS_META[status] ?? STATUS_META.PENDING
  const isActive = status === 'ACTIVE'
  const isPending = status === 'PENDING'
  const isGrey   = status === 'EXPIRED'
  const clientName = seal.clients?.razao_social || seal.client_name || (seal.client_id ? 'Cliente' : 'ELOS')
  const iconSize = px * 0.38

  const circleStyle = {
    width:        px,
    height:       px,
    borderRadius: '50%',
    background:   isGrey ? '#e0e0e0' : level.grad,
    border:       `${Math.max(2, px * 0.04)}px solid ${isGrey ? '#bdbdbd' : level.ring}`,
    boxShadow:    isActive
      ? `0 0 ${px * 0.2}px ${level.glow}, 0 2px 12px rgba(0,0,0,.12)`
      : '0 2px 8px rgba(0,0,0,.10)',
    display:      'flex',
    flexDirection:'column',
    alignItems:   'center',
    justifyContent:'center',
    position:     'relative',
    opacity:      isPending ? 0.75 : 1,
    filter:       isGrey ? 'grayscale(1)' : 'none',
    cursor:       'default',
    flexShrink:   0,
  }

  const overlayIcon =
    isPending  ? '🔒' :
    isSusp     ? '⚠️' :
    null

  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap: px * 0.1 }}>
      <div style={circleStyle}>
        {overlayIcon ? (
          <span style={{ fontSize: iconSize, lineHeight: 1 }}>{overlayIcon}</span>
        ) : (
          <span style={{ fontSize: iconSize, lineHeight: 1 }}>{level.icon}</span>
        )}
        {showClient && !overlayIcon && (
          <div style={{
            fontSize:   Math.max(8, px * 0.11),
            color:      'rgba(255,255,255,.88)',
            fontFamily: 'Montserrat,sans-serif',
            fontWeight: 700,
            marginTop:  2,
            maxWidth:   px * 0.75,
            textAlign:  'center',
            lineHeight: 1.1,
            overflow:   'hidden',
            textOverflow:'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {clientName}
          </div>
        )}
        {showScore && seal.score > 0 && isActive && (
          <div style={{
            position:   'absolute',
            bottom:     -8,
            background: '#1a1c5e',
            color:      '#fff',
            fontSize:   Math.max(9, px * 0.1),
            fontFamily: 'Montserrat,sans-serif',
            fontWeight: 700,
            padding:    '1px 6px',
            borderRadius: 20,
            border:     '1px solid rgba(255,255,255,.2)',
          }}>
            {seal.score}
          </div>
        )}
      </div>

      {/* Nível + Status abaixo da medalha */}
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize: Math.max(9, px * 0.115), fontFamily:'Montserrat,sans-serif', fontWeight:700, color:'#1a1c5e', lineHeight:1.2 }}>
          {level.label}
        </div>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:4, marginTop:2 }}>
          <div style={{ width:6, height:6, borderRadius:'50%', background:sMeta.dot, flexShrink:0 }} />
          <span style={{ fontSize: Math.max(8, px * 0.1), color:'#64748b', fontFamily:'DM Sans,sans-serif' }}>
            {sMeta.label}
          </span>
        </div>
      </div>
    </div>
  )
}
