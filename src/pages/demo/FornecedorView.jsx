import { useState, useEffect } from 'react'
import { DEMO_FORNECEDOR } from './demoData.js'

const C = {
  navy: '#1B1F3B', blue: '#2E3192', orange: '#F47E2F',
  grey: '#9B9B9B', light: '#F5F7FA', lightBlue: '#EEF0FF',
  success: '#16A34A', warning: '#D97706', border: '#E2E6F0',
}

function ScoreRing({ score, r = 37, size = 88, strokeWidth = 6 }) {
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
      <text x={cx} y={cy + 6} textAnchor="middle" fontSize={r > 30 ? 18 : 14}
        fontWeight="900" fill={C.navy} fontFamily="Montserrat,sans-serif">{score}</text>
    </svg>
  )
}

export default function FornecedorView() {
  const [screen, setScreen] = useState('dashboard')
  const f = DEMO_FORNECEDOR
  const maxViz = Math.max(...f.visualizacoesSemana)
  const dias = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D']

  if (screen === 'perfil') {
    return (
      <div>
        {/* Header navy */}
        <div style={{ background: C.navy, borderRadius: 14, padding: '20px 18px', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <div style={{ width: 50, height: 50, borderRadius: 12, background: C.orange, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Montserrat,sans-serif', fontWeight: 900, fontSize: 24, color: '#fff', flexShrink: 0 }}>P</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: 15, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.razaoSocial}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,.5)', marginTop: 2 }}>{f.cnpj} · {f.cidade}/{f.uf}</div>
            </div>
            <ScoreRing score={92} r={28} size={70} strokeWidth={5} />
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ background: `${C.orange}28`, border: `1px solid ${C.orange}55`, borderRadius: 20, padding: '3px 12px', fontSize: 10, color: C.orange, fontFamily: 'Montserrat,sans-serif', fontWeight: 700 }}>{f.seloStatus}</span>
            <span style={{ background: 'rgba(255,255,255,.1)', borderRadius: 20, padding: '3px 12px', fontSize: 10, color: 'rgba(255,255,255,.7)' }}>{f.categoria}</span>
          </div>
        </div>

        {/* Grid 2 colunas */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 12px' }}>
            <div style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 10, color: C.grey, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>Docs validados</div>
            {[['Cartão CNPJ'], ['CND Federal'], ['CRF (FGTS)'], ['Certidão Municipal']].map(([doc]) => (
              <div key={doc} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <span style={{ color: C.success, fontWeight: 700, fontSize: 13, flexShrink: 0 }}>✓</span>
                <span style={{ fontSize: 12, color: '#333', fontFamily: 'DM Sans,sans-serif', lineHeight: 1.3 }}>{doc}</span>
              </div>
            ))}
          </div>
          <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 12px' }}>
            <div style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 10, color: C.grey, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>Conformidade</div>
            {[['Regularidade fiscal'], ['Reg. trabalhista'], ['Sem sanções ativas']].map(([item]) => (
              <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <span style={{ color: C.blue, fontSize: 13, flexShrink: 0 }}>🛡️</span>
                <span style={{ fontSize: 12, color: '#333', fontFamily: 'DM Sans,sans-serif', lineHeight: 1.3 }}>{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Pill verificação */}
        <div style={{ background: `${C.success}12`, border: `1px solid ${C.success}33`, borderRadius: 30, padding: '9px 16px', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18, fontSize: 12, color: C.success, fontFamily: 'DM Sans,sans-serif' }}>
          <span>⚡</span> Última verificação automática: hoje, 09:14
        </div>

        {/* Botões */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <button onClick={() => setScreen('dashboard')}
            style={{ padding: '13px 6px', borderRadius: 10, background: 'transparent', color: C.grey, fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 12, border: `1.5px solid ${C.border}`, cursor: 'pointer' }}>
            ← Voltar
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

  // Screen 0 — Dashboard
  return (
    <div>
      <div style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: 18, color: C.navy, marginBottom: 4 }}>Painel do Fornecedor</div>
      <div style={{ fontSize: 13, color: C.grey, marginBottom: 16, fontFamily: 'DM Sans,sans-serif' }}>{f.razaoSocial}</div>

      {/* Linha 1: score + documentos */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
        {/* Coluna esquerda — score ring */}
        <div style={{ width: 118, flexShrink: 0, background: '#fff', border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <ScoreRing score={f.score} r={37} size={88} strokeWidth={6} />
          <span style={{ background: `${C.orange}18`, border: `1px solid ${C.orange}44`, borderRadius: 20, padding: '3px 8px', fontSize: 9, color: C.orange, fontFamily: 'Montserrat,sans-serif', fontWeight: 700, textAlign: 'center' }}>{f.seloStatus}</span>
          <span style={{ fontSize: 10, color: C.grey, textAlign: 'center', fontFamily: 'DM Sans,sans-serif', lineHeight: 1.4 }}>Membro desde<br />{f.membroDesde}</span>
        </div>

        {/* Coluna direita — documentos */}
        <div style={{ flex: 1, background: '#fff', border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px 12px' }}>
          <div style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: 13, color: C.navy, marginBottom: 10 }}>Documentos</div>
          {f.documentos.map((doc, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7 }}>
              <span style={{ fontSize: 13, flexShrink: 0 }}>{doc.status === 'valid' ? '✅' : '⚠️'}</span>
              <span style={{ fontSize: 11, color: '#333', flex: 1, fontFamily: 'DM Sans,sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.nome}</span>
              <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 20, fontFamily: 'Montserrat,sans-serif', fontWeight: 700, flexShrink: 0,
                background: doc.status === 'valid' ? `${C.success}15` : `${C.warning}18`,
                color: doc.status === 'valid' ? C.success : C.warning }}>
                {doc.status === 'valid' ? (doc.expira || 'OK') : 'Pendente'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Card visibilidade */}
      <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 16px 14px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: 13, color: C.navy }}>Visibilidade no Marketplace</div>
          <span style={{ background: C.lightBlue, color: C.blue, fontSize: 9, padding: '3px 10px', borderRadius: 20, fontFamily: 'Montserrat,sans-serif', fontWeight: 700 }}>Últimos 7 dias</span>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height: 60, marginBottom: 8 }}>
          {f.visualizacoesSemana.map((v, i) => (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, height: '100%', justifyContent: 'flex-end' }}>
              <div style={{ width: '100%', borderRadius: '3px 3px 0 0', minHeight: 4, background: i === 6 ? C.orange : C.lightBlue, height: `${(v / maxViz) * 100}%`, transition: 'height .6s ease' }} />
              <span style={{ fontSize: 9, color: C.grey }}>{dias[i]}</span>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: C.grey, fontFamily: 'DM Sans,sans-serif', textAlign: 'center' }}>
          Seu perfil foi visualizado <strong style={{ color: C.navy }}>{f.visualizacoes30dias}×</strong> nos últimos 30 dias
        </div>
      </div>

      {/* CTA */}
      <button onClick={() => setScreen('perfil')}
        style={{ width: '100%', padding: '15px', borderRadius: 12, background: C.orange, color: '#fff', fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: 14, border: 'none', cursor: 'pointer', boxShadow: `0 6px 20px ${C.orange}44` }}>
        Ver meu perfil no marketplace →
      </button>
    </div>
  )
}
