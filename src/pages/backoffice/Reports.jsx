// Relatórios do backoffice (17/09) — patch_071:
//   · Dashboard Executivo — o projeto em números/gráficos (migrados, selos,
//     acessos, homologados por cliente, documentos)
//   · Funil da Campanha — Campanha Primeiro Acesso (onda 08/09 + recorrente
//     diária pós-sync), lida da marca user_metadata.campanha
// Gráficos leves (SVG/CSS): barras de UM matiz p/ magnitude, paleta de
// status SEMPRE com rótulo+ícone (nunca só cor), linha de série única.
import { useState, useEffect } from 'react'
import { adminApi } from '../../services/api.js'
import { Card, Spinner, PageHeader, SectionTitle } from '../../components/ui.jsx'

const BRAND = '#2E3192'
const SEAL_STATUS = {
  ACTIVE:    { label: 'Homologados vigentes', icon: '🏅', color: '#22c55e' },
  PENDING:   { label: 'Em análise',           icon: '⏳', color: '#f59e0b' },
  SUSPENDED: { label: 'Suspensos',            icon: '⛔', color: '#ef4444' },
  EXPIRED:   { label: 'Expirados',            icon: '💤', color: '#64748b' },
}
const fmt = (n) => (n ?? 0).toLocaleString('pt-BR')
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0)

function Tile({ label, value, sub, accent }) {
  return (
    <Card style={{ borderRadius: 14, padding: '16px 20px' }}>
      <div style={{ fontSize: 11, fontFamily: 'Montserrat,sans-serif', fontWeight: 700, color: '#9B9B9B', textTransform: 'uppercase', letterSpacing: .5 }}>{label}</div>
      <div style={{ fontSize: 28, fontFamily: 'Montserrat,sans-serif', fontWeight: 800, color: accent || '#1a1c5e', marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, fontFamily: 'DM Sans,sans-serif', color: '#9B9B9B', marginTop: 2 }}>{sub}</div>}
    </Card>
  )
}

// Barras horizontais de UM matiz (job: magnitude) com rótulo direto
function HBars({ rows, color = BRAND }) {
  const max = Math.max(...rows.map(r => r.n), 1)
  return (
    <div>
      {rows.map(r => (
        <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{ width: 170, fontSize: 12, fontFamily: 'DM Sans,sans-serif', color: '#1a1c5e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.label}>{r.label}</div>
          <div style={{ flex: 1, height: 14, background: '#f1f3f9', borderRadius: 4, overflow: 'hidden' }}
            title={`${r.label}: ${fmt(r.n)}`}>
            <div style={{ width: `${Math.max((r.n / max) * 100, 1)}%`, height: '100%', background: r.color || color, borderRadius: 4 }} />
          </div>
          <div style={{ width: 56, textAlign: 'right', fontSize: 12, fontFamily: 'Montserrat,sans-serif', fontWeight: 700, color: '#1a1c5e' }}>{fmt(r.n)}</div>
        </div>
      ))}
    </div>
  )
}

// Linha de série única (SVG) com marcadores e tooltip nativo por ponto
function LineChart({ points, height = 130, color = BRAND, fmtX = (x) => x }) {
  if (!points?.length) return <div style={{ fontSize: 12, color: '#9B9B9B', fontStyle: 'italic' }}>Sem dados.</div>
  const W = 560, H = height, PX = 8, PY = 14
  const max = Math.max(...points.map(p => p.n), 1)
  const x = (i) => PX + (i * (W - 2 * PX)) / Math.max(points.length - 1, 1)
  const y = (n) => H - PY - (n / max) * (H - 2 * PY)
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.n).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img">
      {[0.25, 0.5, 0.75].map(f => (
        <line key={f} x1={PX} x2={W - PX} y1={H - PY - f * (H - 2 * PY)} y2={H - PY - f * (H - 2 * PY)} stroke="#eef0f6" strokeWidth="1" />
      ))}
      <path d={`${path} L${x(points.length - 1)},${H - PY} L${x(0)},${H - PY} Z`} fill={color} opacity="0.07" />
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.n)} r="4" fill="#fff" stroke={color} strokeWidth="2">
          <title>{`${fmtX(p.x)}: ${fmt(p.n)}`}</title>
        </circle>
      ))}
      <text x={x(points.length - 1)} y={y(points[points.length - 1].n) - 8} textAnchor="end"
        style={{ fontSize: 11, fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fill: '#1a1c5e' }}>
        {fmt(points[points.length - 1].n)}
      </text>
    </svg>
  )
}

function ExecTab({ d }) {
  const f = d.fornecedores, u = d.usuarios, doc = d.documentos
  const selos = d.selos_por_status || {}
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
        <Tile label="Fornecedores" value={fmt(f.total)} sub={`${fmt(f.migrados)} migrados do HOC · ${fmt(f.espontaneos)} ELOS`} />
        <Tile label="Com conta ELOS" value={fmt(f.com_conta)} sub={`${pct(f.com_conta, f.total)}% da base`} />
        <Tile label="Homologados vigentes" value={fmt(selos.ACTIVE)} accent="#15803d" />
        <Tile label="Em análise" value={fmt(selos.PENDING)} accent="#b45309" />
        <Tile label="Usuários ativos (30d)" value={fmt(u.ativos_30d)} sub={`${fmt(u.total)} contas no total`} />
        <Tile label="Docs aprovados" value={fmt(doc.aprovados)} sub={`${fmt(doc.aguardando_analise)} aguardando análise`} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
        <Card style={{ borderRadius: 14, padding: '18px 22px' }}>
          <SectionTitle>Selos por situação</SectionTitle>
          <HBars rows={Object.entries(SEAL_STATUS).map(([k, cfg]) => ({
            label: `${cfg.icon} ${cfg.label}`, n: selos[k] || 0, color: cfg.color,
          }))} />
        </Card>
        <Card style={{ borderRadius: 14, padding: '18px 22px' }}>
          <SectionTitle>Homologados vigentes por cliente</SectionTitle>
          <HBars rows={(d.homologados_por_cliente || []).map(r => ({ label: r.cliente, n: r.n }))} />
        </Card>
        <Card style={{ borderRadius: 14, padding: '18px 22px' }}>
          <SectionTitle>Contas acessadas por semana</SectionTitle>
          <div style={{ fontSize: 11, color: '#9B9B9B', fontFamily: 'DM Sans,sans-serif', marginBottom: 8 }}>
            Último acesso dos usuários, agrupado por semana (12 semanas)
          </div>
          <LineChart points={(d.acessos_por_semana || []).map(r => ({ x: r.semana, n: r.n }))}
            fmtX={(x) => `semana de ${new Date(x + 'T12:00:00').toLocaleDateString('pt-BR')}`} />
        </Card>
        <Card style={{ borderRadius: 14, padding: '18px 22px' }}>
          <SectionTitle>Convites e campanha</SectionTitle>
          <HBars rows={[
            { label: '✉️ Convites enviados (total)', n: d.convites?.total || 0 },
            { label: '✉️ Convites últimos 30 dias', n: d.convites?.ultimos_30d || 0 },
            { label: '📣 Contas da campanha', n: d.campanha?.contas || 0 },
            { label: '📣 Campanha — já acessaram', n: d.campanha?.acessaram || 0, color: '#22c55e' },
          ]} />
        </Card>
      </div>
    </>
  )
}

function FunnelTab({ d }) {
  const taxa = pct(d.acessaram, d.total_contas)
  const taxaSup = pct(d.fornecedores_acessaram, d.fornecedores_alcancados)
  const dias = d.por_dia || []
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
        <Tile label="Contas criadas" value={fmt(d.total_contas)} sub={`de ${d.primeiro_envio?.split('-').reverse().join('/')} até ${d.ultimo_envio?.split('-').reverse().join('/')}`} />
        <Tile label="Já acessaram" value={fmt(d.acessaram)} sub={`${taxa}% de conversão`} accent="#15803d" />
        <Tile label="Acessos últimos 7 dias" value={fmt(d.acessaram_7d)} />
        <Tile label="Fornecedores alcançados" value={fmt(d.fornecedores_alcancados)} sub={`${fmt(d.fornecedores_acessaram)} com acesso (${taxaSup}%)`} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
        <Card style={{ borderRadius: 14, padding: '18px 22px' }}>
          <SectionTitle>Funil</SectionTitle>
          <HBars rows={[
            { label: 'Contas criadas', n: d.total_contas },
            { label: 'Acessaram o ELOS', n: d.acessaram, color: '#22c55e' },
          ]} />
          <div style={{ marginTop: 14 }} />
          <HBars rows={[
            { label: 'Fornecedores alcançados', n: d.fornecedores_alcancados },
            { label: 'Fornecedores com acesso', n: d.fornecedores_acessaram, color: '#22c55e' },
          ]} />
          <div style={{ fontSize: 11, color: '#9B9B9B', fontFamily: 'DM Sans,sans-serif', marginTop: 10 }}>
            A campanha roda todo dia após o sync com o HOC: quem se homologa lá recebe o
            acesso ao ELOS automaticamente (contas com a marca "campanha" no cadastro).
          </div>
        </Card>
        <Card style={{ borderRadius: 14, padding: '18px 22px' }}>
          <SectionTitle>Envios por dia</SectionTitle>
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: 'DM Sans,sans-serif' }}>
              <thead>
                <tr style={{ color: '#9B9B9B', textAlign: 'left' }}>
                  <th style={{ padding: '6px 4px', fontWeight: 700 }}>Dia</th>
                  <th style={{ padding: '6px 4px', fontWeight: 700, textAlign: 'right' }}>Contas criadas</th>
                  <th style={{ padding: '6px 4px', fontWeight: 700, textAlign: 'right' }}>Já acessaram</th>
                </tr>
              </thead>
              <tbody>
                {[...dias].reverse().map(r => (
                  <tr key={r.dia} style={{ borderTop: '1px solid #eef0f6', color: '#1a1c5e' }}>
                    <td style={{ padding: '6px 4px' }}>{r.dia.split('-').reverse().join('/')}</td>
                    <td style={{ padding: '6px 4px', textAlign: 'right', fontWeight: 700 }}>{fmt(r.criadas)}</td>
                    <td style={{ padding: '6px 4px', textAlign: 'right', color: '#15803d', fontWeight: 700 }}>{fmt(r.acessaram)} <span style={{ color: '#9B9B9B', fontWeight: 400 }}>({pct(r.acessaram, r.criadas)}%)</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  )
}

export default function Reports() {
  const [tab, setTab] = useState('exec')
  const [exec, setExec] = useState(null)
  const [funnel, setFunnel] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    Promise.all([adminApi.getExecDashboard(), adminApi.getCampaignFunnel()])
      .then(([e, f]) => { setExec(e); setFunnel(f) })
      .catch(e => setErr(e.message))
  }, [])

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100, margin: '0 auto' }}>
      <PageHeader title="Relatórios" subtitle="Acompanhamento do projeto e das campanhas" />
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[['exec', '📊 Dashboard Executivo'], ['funil', '📣 Funil da Campanha']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            style={{ padding: '8px 18px', borderRadius: 20, cursor: 'pointer', fontSize: 13,
              fontFamily: 'Montserrat,sans-serif', fontWeight: 700,
              border: `1px solid ${tab === k ? BRAND : '#e2e4ef'}`,
              background: tab === k ? 'rgba(46,49,146,.1)' : '#fff',
              color: tab === k ? BRAND : '#64748b' }}>
            {l}
          </button>
        ))}
      </div>
      {err && <Card style={{ padding: 20, borderRadius: 14, color: '#dc2626', fontSize: 13 }}>Erro ao carregar: {err}</Card>}
      {!err && (!exec || !funnel) && <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner size={40} /></div>}
      {exec && funnel && (tab === 'exec' ? <ExecTab d={exec} /> : <FunnelTab d={funnel} />)}
    </div>
  )
}
