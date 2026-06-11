import { useState, useEffect } from 'react'
import { ScoreBar, Spinner, Button } from '../../components/ui.jsx'
import { DEMO_MARKETPLACE } from './demoData.js'

const PRIMATUS = DEMO_MARKETPLACE[0]

function DossieScreen({ onBack }) {
  return (
    <div>
      {/* Header navy */}
      <div style={{ background:'#1a1c5e', borderRadius:14, padding:'20px 18px', marginBottom:14 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14 }}>
          <div style={{ width:50, height:50, borderRadius:12, background:'#F47E2F', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:24, color:'#fff', flexShrink:0 }}>P</div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:15, color:'#fff' }}>{PRIMATUS.razaoSocial}</div>
            <div style={{ fontSize:12, color:'rgba(255,255,255,.5)', marginTop:2 }}>{PRIMATUS.cidade}/{PRIMATUS.uf} · {PRIMATUS.categoria}</div>
          </div>
          <div style={{ textAlign:'right', flexShrink:0 }}>
            <div style={{ fontSize:11, color:'rgba(255,255,255,.5)', fontFamily:'DM Sans,sans-serif' }}>Score</div>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:26, color:'#22c55e', lineHeight:1 }}>{PRIMATUS.score}</div>
          </div>
        </div>
        <div style={{ marginBottom:14 }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
            <span style={{ fontSize:11, color:'rgba(255,255,255,.5)', fontFamily:'DM Sans,sans-serif' }}>Score ELOS</span>
            <span style={{ fontSize:11, fontWeight:700, color:'#fff', fontFamily:'Montserrat,sans-serif' }}>{PRIMATUS.score}/100</span>
          </div>
          <div style={{ height:5, background:'rgba(255,255,255,.15)', borderRadius:4, overflow:'hidden' }}>
            <div style={{ width:`${PRIMATUS.score}%`, height:'100%', background:'#22c55e', borderRadius:4 }} />
          </div>
        </div>
        <div style={{ display:'flex', gap:6 }}>
          <span style={{ background:'rgba(244,126,47,.28)', border:'1px solid rgba(244,126,47,.55)', borderRadius:20, padding:'3px 12px', fontSize:10, color:'#F47E2F', fontFamily:'Montserrat,sans-serif', fontWeight:700 }}>
            {PRIMATUS.selo}
          </span>
          <span style={{ background:'rgba(255,255,255,.1)', borderRadius:20, padding:'3px 12px', fontSize:10, color:'rgba(255,255,255,.7)' }}>Membro desde 2023</span>
        </div>
      </div>

      {/* Grid 2×3 de checks */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:12 }}>
        {['Regularidade fiscal','Reg. trabalhista','Sem listas restritivas','Alvará em dia','CRF/FGTS regular','Certif. ESG'].map(item => (
          <div key={item} style={{ background:'#fff', border:'1px solid #e2e4ef', borderRadius:10, padding:'10px 12px', display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ color:'#22c55e', fontWeight:700, fontSize:15, flexShrink:0 }}>✓</span>
            <span style={{ fontSize:11, color:'#333', fontFamily:'DM Sans,sans-serif', lineHeight:1.3 }}>{item}</span>
          </div>
        ))}
      </div>

      {/* Última verificação */}
      <div style={{ background:'rgba(34,197,94,.12)', border:'1px solid rgba(34,197,94,.33)', borderRadius:30, padding:'9px 16px', display:'flex', alignItems:'center', gap:8, marginBottom:18, fontSize:12, color:'#22c55e', fontFamily:'DM Sans,sans-serif' }}>
        <span>⚡</span> Última verificação automática: hoje, 09:14
      </div>

      {/* Botões */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
        <Button variant="neutral" onClick={onBack}>← Resultados</Button>
        <Button variant="neutral" style={{ color:'#2E3192', border:'2px solid #2E3192' }}>Solicitar cotação</Button>
        <Button variant="orange">Homologar</Button>
      </div>
    </div>
  )
}

export default function CompradorView() {
  const [screen, setScreen] = useState('busca')

  useEffect(() => {
    if (screen === 'loading') {
      const t = setTimeout(() => setScreen('resultados'), 1800)
      return () => clearTimeout(t)
    }
  }, [screen])

  if (screen === 'loading') {
    return (
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'72px 0' }}>
        <style>{`@keyframes _spin { to { transform: rotate(360deg) } }`}</style>
        <div style={{ marginBottom:22 }}><Spinner size={52} /></div>
        <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:16, color:'#1a1c5e', marginBottom:6 }}>Consultando base ELOS...</div>
        <div style={{ fontSize:13, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>Buscando fornecedores qualificados</div>
      </div>
    )
  }

  if (screen === 'resultados') {
    return (
      <div>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:16, gap:10 }}>
          <div>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:17, color:'#1a1c5e' }}>6 fornecedores encontrados</div>
            <div style={{ fontSize:12, color:'#9B9B9B', marginTop:3, fontFamily:'DM Sans,sans-serif' }}>Manutenção Industrial · Estado SP · ELOS Verificado</div>
          </div>
          <button onClick={() => setScreen('busca')}
            style={{ padding:'8px 14px', borderRadius:8, background:'#EEF0FF', color:'#2E3192', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:11, border:'none', cursor:'pointer', whiteSpace:'nowrap', flexShrink:0 }}>
            Nova busca
          </button>
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {DEMO_MARKETPLACE.map(s => {
            const clickable = s.id !== 6
            const scoreColor = s.score >= 90 ? '#22c55e' : s.score >= 70 ? '#f59e0b' : '#ef4444'
            const sealColor  = s.id === 6 ? '#9B9B9B' : '#2E3192'
            const sealBg     = s.id === 6 ? '#f1f5f9' : '#EEF0FF'
            const initials   = s.razaoSocial.split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase()
            return (
              <div key={s.id}
                onClick={() => clickable && setScreen('dossie')}
                style={{ position:'relative', background:'#fff', borderRadius:12, padding:'13px 14px',
                  cursor:clickable?'pointer':'default',
                  border:s.destaque?`2px solid #F47E2F`:`1px solid #e2e4ef`,
                  opacity:s.id===6?0.58:1,
                  transition:'box-shadow .15s' }}
                onMouseOver={e => { if (clickable) e.currentTarget.style.boxShadow='0 3px 16px rgba(46,49,146,.12)' }}
                onMouseOut={e  => { e.currentTarget.style.boxShadow='none' }}>
                {s.destaque && (
                  <div style={{ position:'absolute', top:-1, right:12, background:'#F47E2F', color:'#fff', fontSize:8, fontFamily:'Montserrat,sans-serif', fontWeight:700, padding:'3px 10px', borderRadius:'0 0 8px 8px', letterSpacing:.6 }}>
                    ★ MELHOR MATCH
                  </div>
                )}

                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  {/* Avatar */}
                  <div style={{ width:38, height:38, borderRadius:10, background:s.destaque?'#F47E2F':'#EEF0FF', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:14, color:s.destaque?'#fff':'#2E3192', flexShrink:0 }}>
                    {initials}
                  </div>

                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, color:'#1a1c5e', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{s.razaoSocial}</div>
                    <div style={{ fontSize:11, color:'#9B9B9B', marginTop:1, fontFamily:'DM Sans,sans-serif' }}>{s.cidade}/{s.uf} · {s.categoria}</div>
                  </div>

                  <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4, flexShrink:0 }}>
                    <span style={{ background:sealBg, color:sealColor, fontSize:9, fontFamily:'Montserrat,sans-serif', fontWeight:700, padding:'2px 8px', borderRadius:20 }}>
                      {s.selo}
                    </span>
                    {s.score ? (
                      <span style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:16, color:scoreColor }}>
                        {s.score}
                      </span>
                    ) : null}
                  </div>
                </div>

                {/* ScoreBar */}
                {s.score && (
                  <div style={{ marginTop:8, paddingTop:8, borderTop:'1px solid #f4f5f9' }}>
                    <ScoreBar score={s.score} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  if (screen === 'dossie') {
    return <DossieScreen onBack={() => setScreen('resultados')} />
  }

  // Screen: busca
  return (
    <div>
      <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:18, color:'#1a1c5e', marginBottom:4 }}>Marketplace</div>
      <div style={{ fontSize:13, color:'#9B9B9B', marginBottom:20, fontFamily:'DM Sans,sans-serif' }}>Encontre fornecedores verificados e qualificados</div>

      {/* Campo de busca */}
      <div style={{ position:'relative', marginBottom:10 }}>
        <span style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', fontSize:16, pointerEvents:'none' }}>🔍</span>
        <div style={{ padding:'13px 14px 13px 44px', borderRadius:10, border:'1.5px solid rgba(46,49,146,.27)', fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#1a1c5e', background:'#fff', fontWeight:500, userSelect:'none' }}>
          Manutenção Industrial
        </div>
      </div>

      {/* Tags de filtro ativas */}
      <div style={{ display:'flex', gap:8, marginBottom:20, flexWrap:'wrap' }}>
        {['Estado: SP ×','ELOS Verificado ×'].map(tag => (
          <span key={tag} style={{ background:'#EEF0FF', color:'#2E3192', fontSize:11, fontFamily:'Montserrat,sans-serif', fontWeight:700, padding:'5px 12px', borderRadius:20, cursor:'default' }}>
            {tag}
          </span>
        ))}
      </div>

      {/* Botão buscar */}
      <Button variant="orange" full size="lg" style={{ marginBottom:24 }} onClick={() => setScreen('loading')}>
        🔍 Buscar fornecedores
      </Button>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
        {[['6.240+','Fornecedores ELOS'],['1.847','Verificados hoje'],['148','Categorias']].map(([v,l]) => (
          <div key={l} style={{ background:'#fff', border:'1px solid #e2e4ef', borderRadius:12, padding:'16px 10px', textAlign:'center', boxShadow:'0 1px 6px rgba(46,49,146,.06)' }}>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:22, color:'#F47E2F' }}>{v}</div>
            <div style={{ fontSize:11, color:'#9B9B9B', marginTop:4, lineHeight:1.3, fontFamily:'DM Sans,sans-serif' }}>{l}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
