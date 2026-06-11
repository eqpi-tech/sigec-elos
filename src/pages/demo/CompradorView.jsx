import { useState, useEffect } from 'react'
import { DEMO_MARKETPLACE } from './demoData.js'

const C = {
  navy: '#1B1F3B', blue: '#2E3192', orange: '#F47E2F',
  grey: '#9B9B9B', light: '#F5F7FA', lightBlue: '#EEF0FF',
  success: '#16A34A', warning: '#D97706', border: '#E2E6F0',
}

function ScoreRing({ score, r = 28, size = 70, strokeWidth = 5 }) {
  const circ = 2 * Math.PI * r
  const [offset, setOffset] = useState(circ)
  useEffect(() => {
    const t = setTimeout(() => setOffset(circ - (score / 100) * circ), 60)
    return () => clearTimeout(t)
  }, [score, circ])
  const cx = size / 2, cy = size / 2
  return (
    <svg width={size} height={size}>
      <circle cx={cx} cy={cy} r={r} stroke={C.lightBlue} strokeWidth={strokeWidth} fill="none" />
      <circle cx={cx} cy={cy} r={r} stroke={C.orange} strokeWidth={strokeWidth}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round" fill="none"
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: 'stroke-dashoffset 1s ease' }} />
      <text x={cx} y={cy + 5} textAnchor="middle" fontSize={14} fontWeight="900" fill={C.navy} fontFamily="Montserrat,sans-serif">{score}</text>
    </svg>
  )
}

const PRIMATUS = DEMO_MARKETPLACE[0]

function DossieScreen({ onBack }) {
  return (
    <div>
      {/* Header navy */}
      <div style={{ background: C.navy, borderRadius: 14, padding: '20px 18px', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <div style={{ width: 50, height: 50, borderRadius: 12, background: C.orange, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Montserrat,sans-serif', fontWeight: 900, fontSize: 24, color: '#fff', flexShrink: 0 }}>P</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: 15, color: '#fff' }}>{PRIMATUS.razaoSocial}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,.5)', marginTop: 2 }}>{PRIMATUS.cidade}/{PRIMATUS.uf} · {PRIMATUS.categoria}</div>
          </div>
          <ScoreRing score={PRIMATUS.score} r={28} size={70} strokeWidth={5} />
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <span style={{ background: `${C.orange}28`, border: `1px solid ${C.orange}55`, borderRadius: 20, padding: '3px 12px', fontSize: 10, color: C.orange, fontFamily: 'Montserrat,sans-serif', fontWeight: 700 }}>{PRIMATUS.selo}</span>
          <span style={{ background: 'rgba(255,255,255,.1)', borderRadius: 20, padding: '3px 12px', fontSize: 10, color: 'rgba(255,255,255,.7)' }}>Membro desde 2023</span>
        </div>
      </div>

      {/* Grid 2x3 de checks */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
        {['Regularidade fiscal', 'Reg. trabalhista', 'Sem listas restritivas', 'Alvará em dia', 'CRF/FGTS regular', 'Certif. ESG'].map(item => (
          <div key={item} style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: C.success, fontWeight: 700, fontSize: 15, flexShrink: 0 }}>✓</span>
            <span style={{ fontSize: 11, color: '#333', fontFamily: 'DM Sans,sans-serif', lineHeight: 1.3 }}>{item}</span>
          </div>
        ))}
      </div>

      {/* Pill verificação */}
      <div style={{ background: `${C.success}12`, border: `1px solid ${C.success}33`, borderRadius: 30, padding: '9px 16px', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18, fontSize: 12, color: C.success, fontFamily: 'DM Sans,sans-serif' }}>
        <span>⚡</span> Última verificação automática: hoje, 09:14
      </div>

      {/* Botões */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <button onClick={onBack}
          style={{ padding: '13px 6px', borderRadius: 10, background: 'transparent', color: C.grey, fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 12, border: `1.5px solid ${C.border}`, cursor: 'pointer' }}>
          ← Resultados
        </button>
        <button style={{ padding: '13px 6px', borderRadius: 10, background: 'transparent', color: C.blue, fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 12, border: `2px solid ${C.blue}`, cursor: 'pointer' }}>
          Solicitar cotação
        </button>
        <button style={{ padding: '13px 6px', borderRadius: 10, background: C.orange, color: '#fff', fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 12, border: 'none', cursor: 'pointer', boxShadow: `0 4px 14px ${C.orange}44` }}>
          Homologar
        </button>
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
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '72px 0' }}>
        <style>{`@keyframes _spin { to { transform: rotate(360deg) } }`}</style>
        <div style={{ width: 52, height: 52, border: `4px solid ${C.lightBlue}`, borderTop: `4px solid ${C.orange}`, borderRadius: '50%', animation: '_spin 0.8s linear infinite', marginBottom: 22 }} />
        <div style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: 16, color: C.navy, marginBottom: 6 }}>Consultando base ELOS...</div>
        <div style={{ fontSize: 13, color: C.grey, fontFamily: 'DM Sans,sans-serif' }}>Buscando fornecedores qualificados</div>
      </div>
    )
  }

  if (screen === 'resultados') {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, gap: 10 }}>
          <div>
            <div style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: 17, color: C.navy }}>6 fornecedores encontrados</div>
            <div style={{ fontSize: 12, color: C.grey, marginTop: 3, fontFamily: 'DM Sans,sans-serif' }}>Manutenção Industrial · Estado SP · ELOS Verificado</div>
          </div>
          <button onClick={() => setScreen('busca')}
            style={{ padding: '8px 14px', borderRadius: 8, background: C.lightBlue, color: C.blue, fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 11, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
            Nova busca
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {DEMO_MARKETPLACE.map((s) => {
            const clickable = s.id !== 6
            return (
              <div key={s.id}
                onClick={() => clickable && setScreen('dossie')}
                style={{ position: 'relative', background: '#fff', borderRadius: 12, padding: '13px 14px',
                  cursor: clickable ? 'pointer' : 'default',
                  border: s.destaque ? `2px solid ${C.orange}` : `1px solid ${C.border}`,
                  opacity: s.id === 6 ? 0.58 : 1 }}
                onMouseOver={e => { if (clickable) e.currentTarget.style.boxShadow = `0 3px 16px ${C.blue}18` }}
                onMouseOut={e => { e.currentTarget.style.boxShadow = 'none' }}>
                {s.destaque && (
                  <div style={{ position: 'absolute', top: -1, right: 12, background: C.orange, color: '#fff', fontSize: 8, fontFamily: 'Montserrat,sans-serif', fontWeight: 700, padding: '3px 10px', borderRadius: '0 0 8px 8px', letterSpacing: .6 }}>
                    ★ MELHOR MATCH
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: s.destaque ? C.orange : C.lightBlue, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Montserrat,sans-serif', fontWeight: 900, fontSize: 16, color: s.destaque ? '#fff' : C.blue, flexShrink: 0 }}>
                    {s.razaoSocial[0]}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 13, color: C.navy, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.razaoSocial}</div>
                    <div style={{ fontSize: 11, color: C.grey, marginTop: 1, fontFamily: 'DM Sans,sans-serif' }}>{s.cidade}/{s.uf} · {s.categoria}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                    <span style={{ background: s.id === 6 ? '#f1f5f9' : `${C.blue}14`, color: s.id === 6 ? C.grey : C.blue, fontSize: 9, fontFamily: 'Montserrat,sans-serif', fontWeight: 700, padding: '2px 8px', borderRadius: 20 }}>
                      {s.selo}
                    </span>
                    {s.score && (
                      <span style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 900, fontSize: 17, color: C.orange }}>
                        {s.score}
                      </span>
                    )}
                  </div>
                </div>
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

  // Screen 0 — Busca
  return (
    <div>
      <div style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: 18, color: C.navy, marginBottom: 4 }}>Marketplace</div>
      <div style={{ fontSize: 13, color: C.grey, marginBottom: 20, fontFamily: 'DM Sans,sans-serif' }}>Encontre fornecedores verificados e qualificados</div>

      {/* Campo de busca */}
      <div style={{ position: 'relative', marginBottom: 10 }}>
        <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 16, pointerEvents: 'none' }}>🔍</span>
        <div style={{ padding: '13px 14px 13px 44px', borderRadius: 10, border: `1.5px solid ${C.blue}44`, fontFamily: 'DM Sans,sans-serif', fontSize: 14, color: C.navy, background: '#fff', fontWeight: 500, userSelect: 'none' }}>
          Manutenção Industrial
        </div>
      </div>

      {/* Tags de filtro */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {['Estado: SP ×', 'ELOS Verificado ×'].map(tag => (
          <span key={tag} style={{ background: C.lightBlue, color: C.blue, fontSize: 11, fontFamily: 'Montserrat,sans-serif', fontWeight: 700, padding: '5px 12px', borderRadius: 20, cursor: 'default' }}>
            {tag}
          </span>
        ))}
      </div>

      {/* Botão buscar */}
      <button onClick={() => setScreen('loading')}
        style={{ width: '100%', padding: '15px', borderRadius: 12, background: C.orange, color: '#fff', fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: 15, border: 'none', cursor: 'pointer', boxShadow: `0 6px 20px ${C.orange}44`, marginBottom: 24, transition: 'transform .15s' }}
        onMouseOver={e => e.currentTarget.style.transform = 'scale(1.01)'}
        onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}>
        🔍 Buscar fornecedores
      </button>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        {[['6.240+', 'Fornecedores ELOS'], ['1.847', 'Verificados hoje'], ['148', 'Categorias']].map(([v, l]) => (
          <div key={l} style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 10px', textAlign: 'center' }}>
            <div style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 900, fontSize: 22, color: C.orange }}>{v}</div>
            <div style={{ fontSize: 11, color: C.grey, marginTop: 4, lineHeight: 1.3, fontFamily: 'DM Sans,sans-serif' }}>{l}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
