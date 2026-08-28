// Medalha de Selo ELOS — um selo por processo de homologação.
// Cada selo representa uma homologação aprovada com um cliente específico,
// ou o Selo ELOS Simples quando o fornecedor se cadastra de forma autônoma.
// Sem hierarquia Bronze/Prata/Ouro: o que importa é QUEM emitiu e o STATUS.

const STATUS_META = {
  ACTIVE:    { dot:'#22c55e', label:'Ativo',      glow: true  },
  PENDING:   { dot:'#f59e0b', label:'Em análise', glow: false },
  SUSPENDED: { dot:'#ef4444', label:'Suspenso',   glow: false },
  EXPIRED:   { dot:'#9B9B9B', label:'Expirado',   glow: false },
}

const SIZES = { sm: 64, md: 96, lg: 128 }

export default function SealBadge({ seal, size = 'md', showScore = false }) {
  if (!seal) return null

  const px = SIZES[size] ?? SIZES.md

  const isSusp   = !!(seal.client_suspended_at || seal.status === 'SUSPENDED')
  const status   = isSusp ? 'SUSPENDED' : (seal.status || 'PENDING')
  let sMeta      = STATUS_META[status] ?? STATUS_META.PENDING
  // Homologação com exceção (carta do cliente): rótulo próprio, tom âmbar
  if (status === 'ACTIVE' && seal.exception)
    sMeta = { ...sMeta, dot:'#f59e0b', label:'Homologado com Exceção' }
  const isActive = status === 'ACTIVE'
  const isPending = status === 'PENDING'

  // Tipo de selo: ELOS (autônomo) ou cliente específico
  const isElosSeal  = !seal.client_id
  // Fallback via seal_name remove o prefixo "Homologado – " para exibir só o cliente
  const clientFull  = seal.clients?.razao_social || seal.client_name
                      || seal.seal_name?.replace(/^(Homologado|HOC)\s*[–-]\s*/i, '')
                      || (isElosSeal ? 'SIGEC ELOS' : 'Cliente')

  // Cor do anel: azul para ELOS, laranja para selos de cliente
  const ringColor   = isElosSeal ? '#2E3192' : '#F47E2F'
  const bgGrad      = isElosSeal
    ? 'radial-gradient(circle at 35% 35%, #3d40b5, #1a1c5e)'
    : 'radial-gradient(circle at 35% 35%, #ffa057, #c85a0a)'
  const glowColor   = isElosSeal ? 'rgba(46,49,146,.45)' : 'rgba(244,126,47,.45)'

  // Ícone central
  const icon = isPending ? '🔒' : isSusp ? '⚠️' : isElosSeal ? '⭐' : '🏅'

  // Nome curto para exibir dentro do círculo (primeira palavra, max 10 chars)
  const shortName = isElosSeal
    ? 'ELOS'
    : (clientFull.split(' ')[0] || '').slice(0, 10)

  const circleStyle = {
    width:          px,
    height:         px,
    borderRadius:   '50%',
    background:     isPending || isSusp ? '#e5e7eb' : bgGrad,
    border:         `${Math.max(2, px * 0.04)}px solid ${isPending || isSusp ? '#9B9B9B' : ringColor}`,
    boxShadow:      isActive && sMeta.glow
      ? `0 0 ${px * 0.2}px ${glowColor}, 0 2px 12px rgba(0,0,0,.12)`
      : '0 2px 8px rgba(0,0,0,.10)',
    display:        'flex',
    flexDirection:  'column',
    alignItems:     'center',
    justifyContent: 'center',
    position:       'relative',
    opacity:        isPending ? 0.8 : 1,
    flexShrink:     0,
    cursor:         'default',
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap: px * 0.1 }}>
      <div style={circleStyle}>
        <span style={{ fontSize: px * 0.32, lineHeight: 1 }}>{icon}</span>
        {!isPending && !isSusp && (
          <div style={{
            fontSize:     Math.max(7, px * 0.10),
            color:        'rgba(255,255,255,.9)',
            fontFamily:   'Montserrat,sans-serif',
            fontWeight:   800,
            marginTop:    2,
            maxWidth:     px * 0.78,
            textAlign:    'center',
            lineHeight:   1.1,
            overflow:     'hidden',
            textOverflow: 'ellipsis',
            whiteSpace:   'nowrap',
            letterSpacing: -0.3,
          }}>
            {shortName}
          </div>
        )}
        {showScore && seal.score > 0 && isActive && (
          <div style={{
            position:     'absolute',
            bottom:       -8,
            background:   '#1a1c5e',
            color:        '#fff',
            fontSize:     Math.max(9, px * 0.1),
            fontFamily:   'Montserrat,sans-serif',
            fontWeight:   700,
            padding:      '1px 6px',
            borderRadius: 20,
            border:       '1px solid rgba(255,255,255,.2)',
          }}>
            {seal.score}
          </div>
        )}
      </div>

      {/* Nome do cliente + status — nome completo, quebrando em até 2 linhas */}
      <div style={{ textAlign:'center', maxWidth: Math.max(px * 1.6, 150) }}>
        <div style={{
          fontSize:     Math.max(9, px * 0.105),
          fontFamily:   'Montserrat,sans-serif',
          fontWeight:   700,
          color:        '#1a1c5e',
          lineHeight:   1.25,
          overflow:     'hidden',
          display:      '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}>
          {isElosSeal ? 'SIGEC ELOS' : clientFull}
        </div>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:4, marginTop:2 }}>
          <div style={{ width:6, height:6, borderRadius:'50%', background: sMeta.dot, flexShrink:0 }} />
          <span style={{ fontSize: Math.max(8, px * 0.095), color:'#64748b', fontFamily:'DM Sans,sans-serif' }}>
            {sMeta.label}
          </span>
        </div>
      </div>
    </div>
  )
}
