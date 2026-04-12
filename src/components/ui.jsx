// ─── SIGEC-ELOS UI Components ────────────────────────────────────────────────

export const Badge = ({ level, size = 'sm' }) => {
  const C = { Simples:{bg:'#dbeafe',color:'#1d4ed8'}, Premium:{bg:'#fff7ed',color:'#ea580c'}, HOC:{bg:'#f0fdf4',color:'#16a34a'}, Pendente:{bg:'#fef9c3',color:'#ca8a04'}, PENDING:{bg:'#fef9c3',color:'#ca8a04'}, ACTIVE:{bg:'#f0fdf4',color:'#16a34a'}, SUSPENDED:{bg:'#fee2e2',color:'#dc2626'} }
  const c = C[level] || C.Simples
  const fs = size === 'sm' ? 10 : 12
  return <span style={{ background:c.bg, color:c.color, fontSize:fs, fontWeight:700, letterSpacing:.8, padding:'3px 10px', borderRadius:20, fontFamily:'Montserrat,sans-serif', display:'inline-flex', alignItems:'center' }}>{level?.toUpperCase()}</span>
}

export const Seal = ({ level, size = 60 }) => {
  const C = { Simples:{outer:'#2563eb',inner:'#dbeafe',text:'#1d4ed8',icon:'✓'}, Premium:{outer:'#ea580c',inner:'#fff7ed',text:'#c2410c',icon:'★'}, HOC:{outer:'#16a34a',inner:'#f0fdf4',text:'#15803d',icon:'✦'} }
  const c = C[level] || C.Simples
  return (
    <div style={{ width:size, height:size, borderRadius:'50%', background:`radial-gradient(circle,${c.inner},${c.outer}22)`, border:`3px solid ${c.outer}`, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', boxShadow:`0 0 0 4px ${c.outer}11,0 4px 12px ${c.outer}33`, flexShrink:0 }}>
      <div style={{ fontSize:size*.3, color:c.outer, lineHeight:1 }}>{c.icon}</div>
      <div style={{ fontSize:Math.max(size*.115,7), fontWeight:800, color:c.text, letterSpacing:.3, fontFamily:'Montserrat,sans-serif', lineHeight:1.2, textAlign:'center', marginTop:2, padding:'0 4px' }}>ELOS {level?.toUpperCase()}</div>
    </div>
  )
}

const BTN = {
  primary:{ background:'linear-gradient(135deg,#2E3192,#3d40b5)', color:'#fff', border:'none', boxShadow:'0 4px 14px rgba(46,49,146,.35)' },
  orange: { background:'linear-gradient(135deg,#F47E2F,#ff9a52)', color:'#fff', border:'none', boxShadow:'0 4px 14px rgba(244,126,47,.35)' },
  ghost:  { background:'rgba(244,126,47,.1)', color:'#F47E2F', border:'1px solid rgba(244,126,47,.35)', boxShadow:'none' },
  neutral:{ background:'#fff', color:'#2E3192', border:'1px solid #e2e4ef', boxShadow:'none' },
  danger: { background:'#ef4444', color:'#fff', border:'none', boxShadow:'0 4px 12px rgba(239,68,68,.3)' },
  success:{ background:'#22c55e', color:'#fff', border:'none', boxShadow:'0 4px 12px rgba(34,197,94,.3)' },
}
const SIZES = { sm:{padding:'5px 12px',fontSize:11,borderRadius:8}, md:{padding:'10px 20px',fontSize:13,borderRadius:10}, lg:{padding:'13px 24px',fontSize:14,borderRadius:12} }

export const Button = ({ variant='primary', children, onClick, full=false, size='md', style:s={}, disabled=false, type='button' }) => (
  <button type={type} onClick={onClick} disabled={disabled}
    style={{ ...BTN[variant], ...SIZES[size], fontFamily:'Montserrat,sans-serif', fontWeight:700, cursor:disabled?'not-allowed':'pointer', opacity:disabled?.6:1, width:full?'100%':'auto', display:'inline-flex', alignItems:'center', justifyContent:'center', gap:6, transition:'all .15s', ...s }}>
    {children}
  </button>
)

export const Card = ({ children, style:s={}, onClick, hover=false }) => (
  <div onClick={onClick}
    style={{ background:'#fff', borderRadius:14, padding:'18px 20px', border:'1px solid #e2e4ef', boxShadow:'0 1px 6px rgba(46,49,146,.06)', cursor:onClick?'pointer':'default', transition:hover?'all .2s':'none', ...s }}
    onMouseEnter={hover&&onClick?e=>{e.currentTarget.style.boxShadow='0 8px 24px rgba(46,49,146,.12)';e.currentTarget.style.transform='translateY(-2px)'}:undefined}
    onMouseLeave={hover&&onClick?e=>{e.currentTarget.style.boxShadow='0 1px 6px rgba(46,49,146,.06)';e.currentTarget.style.transform='none'}:undefined}>
    {children}
  </div>
)

export const KpiCard = ({ label, value, sub, subColor, icon, iconBg }) => (
  <Card>
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
      <div>
        <div style={{ fontSize:11, fontWeight:600, color:'#9B9B9B', letterSpacing:.5, fontFamily:'Montserrat,sans-serif', marginBottom:6, textTransform:'uppercase' }}>{label}</div>
        <div style={{ fontSize:24, fontWeight:800, color:'#1a1c5e', fontFamily:'Montserrat,sans-serif', lineHeight:1 }}>{value}</div>
        <div style={{ fontSize:12, color:subColor||'#9B9B9B', fontFamily:'DM Sans,sans-serif', marginTop:4, fontWeight:600 }}>{sub}</div>
      </div>
      <div style={{ width:42, height:42, borderRadius:12, background:iconBg||'rgba(46,49,146,.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>{icon}</div>
    </div>
  </Card>
)

export const ScoreBar = ({ score }) => {
  const color = score>=90?'#22c55e':score>=70?'#f59e0b':'#ef4444'
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
      <div style={{ flex:1, height:5, background:'#f4f5f9', borderRadius:4, overflow:'hidden' }}>
        <div style={{ width:`${score}%`, height:'100%', background:color, borderRadius:4, transition:'width .6s ease' }} />
      </div>
      <div style={{ fontSize:12, fontWeight:700, color, fontFamily:'Montserrat,sans-serif', width:24, textAlign:'right' }}>{score}</div>
    </div>
  )
}

export const StatusDot = ({ status }) => {
  const C = { VALID:'#22c55e', EXPIRING:'#f59e0b', MISSING:'#ef4444', EXPIRED:'#ef4444', REJECTED:'#ef4444', ACTIVE:'#22c55e', PENDING:'#f59e0b', SUSPENDED:'#ef4444' }
  const L = { VALID:'✓', EXPIRING:'⚠', MISSING:'✕', EXPIRED:'✕', REJECTED:'✕', ACTIVE:'✓', PENDING:'⏳', SUSPENDED:'✕' }
  return <span style={{ color:C[status]||'#9B9B9B', fontWeight:700, fontSize:14 }}>{L[status]||'?'}</span>
}

export const Spinner = ({ size=32 }) => (
  <div style={{ width:size, height:size, borderRadius:'50%', border:`3px solid #e2e4ef`, borderTopColor:'#F47E2F', animation:'spin .8s linear infinite' }} />
)

export const PageHeader = ({ title, subtitle, action }) => (
  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:24 }}>
    <div>
      <h1 style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:22, color:'#1a1c5e' }}>{title}</h1>
      {subtitle && <p style={{ color:'#9B9B9B', fontSize:14, fontFamily:'DM Sans,sans-serif', marginTop:2 }}>{subtitle}</p>}
    </div>
    {action}
  </div>
)

export const SectionTitle = ({ children, style:s={} }) => (
  <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:15, color:'#1a1c5e', marginBottom:16, ...s }}>{children}</div>
)

export const EmptyState = ({ icon, title, subtitle, action }) => (
  <div style={{ textAlign:'center', padding:'60px 20px' }}>
    <div style={{ fontSize:48, marginBottom:12 }}>{icon}</div>
    <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:18, color:'#1a1c5e' }}>{title}</div>
    {subtitle && <div style={{ color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', marginTop:6 }}>{subtitle}</div>}
    {action && <div style={{ marginTop:16 }}>{action}</div>}
  </div>
)
