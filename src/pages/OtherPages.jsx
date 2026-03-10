// ─── Perfil Detalhado do Fornecedor ──────────────────────────────────────────
import { useState } from 'react'
import { Badge, Seal, Button, Card, ScoreBar } from '../components/ui.jsx'

const TABS = ['Dados Cadastrais', 'Documentação', 'Portfólio', 'ESG']

export function PerfilFornecedor({ supplier, setScreen }) {
  const [tab, setTab] = useState(0)

  const s = supplier || {
    name: 'TechServ Industrial S.A.', category: 'Manutenção Industrial',
    state: 'SP', level: 'Premium', score: 96, since: 2019,
    services: ['Manutenção Preventiva', 'Automação', 'Caldeiraria'],
    cnpj: '98.765.432/0001-11', employees: '100–500', revenue: 'R$ 5–20M',
  }

  const dados = [
    { label: 'Razão Social',          value: s.name },
    { label: 'CNPJ',                  value: s.cnpj || '—' },
    { label: 'Categoria Principal',   value: s.category },
    { label: 'Estado',                value: s.state },
    { label: 'Colaboradores',         value: s.employees || '50–100' },
    { label: 'Faturamento Estimado',  value: s.revenue || 'R$ 1–5M' },
  ]

  const docs = [
    { name: 'Cartão CNPJ',           type: 'Identidade Legal',    valid: '—',                 ok: true },
    { name: 'CND Federal',           type: 'Regularidade Fiscal', valid: 'Válida até 15/08/2025', ok: true },
    { name: 'CRF (FGTS)',            type: 'Trabalhista',         valid: 'Válida até 20/09/2025', ok: true },
    { name: 'CNDT Trabalhista',      type: 'Trabalhista',         valid: 'Válida até 01/10/2025', ok: true },
    { name: 'Consulta CEIS/CNEP',    type: 'Ética e Compliance',  valid: 'Sem registros',      ok: true },
    { name: 'Alvará de Funcionamento', type: 'Operacional',       valid: 'Válido até 31/12/2025', ok: true },
  ]

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 24px' }}>
      <button onClick={() => setScreen('marketplace')} style={{
        background: 'none', border: 'none', cursor: 'pointer', color: '#2E3192',
        fontSize: 14, fontFamily: 'DM Sans, sans-serif', fontWeight: 600,
        marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6, padding: 0,
      }}>← Voltar ao Marketplace</button>

      {/* Header banner */}
      <div style={{
        background: 'linear-gradient(135deg, #2E3192, #3d40b5)',
        borderRadius: 20, padding: '28px 32px', marginBottom: 20, color: '#fff',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', right: -20, top: -20, width: 200, height: 200, borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
            <div style={{
              width: 72, height: 72, borderRadius: 18, background: 'rgba(255,255,255,0.12)',
              border: '2px solid rgba(255,255,255,0.2)', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              fontSize: 28, fontWeight: 800, color: '#fff', fontFamily: 'Montserrat, sans-serif',
            }}>{s.name[0]}</div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'Montserrat, sans-serif' }}>{s.name}</div>
              <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', fontFamily: 'DM Sans, sans-serif', marginTop: 2 }}>
                {s.category} · 📍 {s.state}
              </div>
              <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', fontFamily: 'DM Sans, sans-serif' }}>🏢 No ecossistema EQPI desde {s.since}</span>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', fontFamily: 'DM Sans, sans-serif' }}>👥 {s.employees || '50–100'} colaboradores</span>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 12 }}>
            <Seal level={s.level} size={80} />
            <div style={{
              background: 'rgba(255,255,255,0.12)', borderRadius: 10,
              padding: '8px 16px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.15)',
            }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontFamily: 'DM Sans, sans-serif' }}>VERIFICADO EM</div>
              <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'Montserrat, sans-serif' }}>05/06/2025 09:31</div>
            </div>
          </div>
        </div>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 24 }}>
          {[
            { label: 'SCORE ELOS', value: `${s.score}/100` },
            { label: 'VISUALIZAÇÕES', value: '2.341' },
            { label: 'FATURAMENTO EST.', value: s.revenue || 'R$ 1–5M' },
            { label: 'SITUAÇÃO', value: 'Regular', green: true },
          ].map((k, i) => (
            <div key={i} style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: '12px 16px', border: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontFamily: 'Montserrat, sans-serif', letterSpacing: 0.5 }}>{k.label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'Montserrat, sans-serif', color: k.green ? '#4ade80' : '#fff', marginTop: 2 }}>{k.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: '#fff', padding: 6, borderRadius: 14, border: '1px solid #e2e4ef' }}>
        {TABS.map((t, i) => (
          <button key={i} onClick={() => setTab(i)} style={{
            flex: 1, padding: '10px', borderRadius: 10, border: 'none',
            cursor: 'pointer', fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 13,
            background: tab === i ? '#2E3192' : 'transparent',
            color: tab === i ? '#fff' : '#9B9B9B',
            transition: 'all 0.15s',
          }}>{t}</button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
          {dados.map((d, i) => (
            <Card key={i}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#9B9B9B', fontFamily: 'Montserrat, sans-serif', letterSpacing: 0.5, marginBottom: 4, textTransform: 'uppercase' }}>{d.label}</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#1a1c5e', fontFamily: 'DM Sans, sans-serif' }}>{d.value}</div>
            </Card>
          ))}
        </div>
      )}

      {tab === 1 && (
        <Card style={{ borderRadius: 16, padding: '20px 24px', marginBottom: 20 }}>
          {docs.map((doc, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 16,
              padding: '14px 0', borderBottom: i < docs.length - 1 ? '1px solid #e2e4ef' : 'none',
            }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#22c55e', fontWeight: 700 }}>✓</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1c5e', fontFamily: 'Montserrat, sans-serif' }}>{doc.name}</div>
                <div style={{ fontSize: 12, color: '#9B9B9B', fontFamily: 'DM Sans, sans-serif' }}>{doc.valid}</div>
              </div>
              <span style={{ fontSize: 10, fontWeight: 600, background: 'rgba(46,49,146,0.08)', color: '#2E3192', padding: '3px 10px', borderRadius: 20, fontFamily: 'Montserrat, sans-serif' }}>{doc.type}</span>
            </div>
          ))}
        </Card>
      )}

      {(tab === 2 || tab === 3) && (
        <Card style={{ borderRadius: 16, padding: '48px', textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>{tab === 2 ? '🗂️' : '🌱'}</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#1a1c5e', fontFamily: 'Montserrat, sans-serif' }}>
            {tab === 2 ? 'Portfólio de Serviços' : 'Certificações ESG'}
          </div>
          <div style={{ fontSize: 13, color: '#9B9B9B', fontFamily: 'DM Sans, sans-serif', marginTop: 6 }}>
            Disponível para fornecedores com plano Premium
          </div>
          <Button variant="orange" style={{ marginTop: 16, borderRadius: 10 }}>Ver Planos Premium</Button>
        </Card>
      )}

      {/* CTAs */}
      <div style={{ display: 'flex', gap: 12 }}>
        <Button variant="primary" full size="lg" style={{ borderRadius: 12 }}>📩 Solicitar Cotação</Button>
        <Button variant="ghost" full size="lg" style={{ borderRadius: 12 }}>🔗 Iniciar Homologação HOC</Button>
      </div>
    </div>
  )
}

// ─── Admin Panel ──────────────────────────────────────────────────────────────
export function Admin() {
  const PENDING = [
    { company: 'Construtora Alpha Ltda',  cnpj: '22.333.444/0001-55', plan: 'Premium', date: '04/06', analyst: null,       risk: 'Alto' },
    { company: 'Transportes Beta S.A.',   cnpj: '66.777.888/0001-99', plan: 'Simples', date: '03/06', analyst: 'Ana S.',   risk: 'Baixo' },
    { company: 'EcoService Ambiental',    cnpj: '99.111.222/0001-33', plan: 'Premium', date: '02/06', analyst: null,       risk: 'Médio' },
    { company: 'TechFix Manutenção',      cnpj: '44.555.666/0001-77', plan: 'Simples', date: '01/06', analyst: 'Carlos M.', risk: 'Baixo' },
  ]
  const riskColor = { Alto: '#ef4444', Médio: '#f59e0b', Baixo: '#22c55e' }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 22, color: '#1a1c5e' }}>Painel Administrativo</h1>
          <p style={{ color: '#9B9B9B', fontSize: 14, fontFamily: 'DM Sans, sans-serif', marginTop: 2 }}>EQPI Tech · Visão Geral do Ecossistema SIGEC-ELOS</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="neutral" size="md">📊 Exportar Relatório</Button>
          <Button variant="primary" size="md">+ Novo Usuário</Button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <Card><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}><div><div style={{ fontSize: 11, fontWeight: 600, color: '#9B9B9B', letterSpacing: 0.5, fontFamily: 'Montserrat, sans-serif', marginBottom: 6, textTransform: 'uppercase' }}>Fornecedores Ativos</div><div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 26, color: '#1a1c5e', lineHeight: 1 }}>3.842</div><div style={{ fontSize: 12, color: '#2E3192', marginTop: 4, fontWeight: 600, fontFamily: 'DM Sans, sans-serif' }}>+127 este mês</div></div><span style={{ fontSize: 24 }}>🏭</span></div></Card>
        <Card><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}><div><div style={{ fontSize: 11, fontWeight: 600, color: '#9B9B9B', letterSpacing: 0.5, fontFamily: 'Montserrat, sans-serif', marginBottom: 6, textTransform: 'uppercase' }}>Selos Emitidos</div><div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 26, color: '#1a1c5e', lineHeight: 1 }}>3.218</div><div style={{ fontSize: 12, color: '#22c55e', marginTop: 4, fontWeight: 600, fontFamily: 'DM Sans, sans-serif' }}>84% aprovados</div></div><span style={{ fontSize: 24 }}>✅</span></div></Card>
        <Card><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}><div><div style={{ fontSize: 11, fontWeight: 600, color: '#9B9B9B', letterSpacing: 0.5, fontFamily: 'Montserrat, sans-serif', marginBottom: 6, textTransform: 'uppercase' }}>MRR (Receita Mensal)</div><div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 26, color: '#1a1c5e', lineHeight: 1 }}>R$ 89.4k</div><div style={{ fontSize: 12, color: '#F47E2F', marginTop: 4, fontWeight: 600, fontFamily: 'DM Sans, sans-serif' }}>+18% vs mês ant.</div></div><span style={{ fontSize: 24 }}>💰</span></div></Card>
        <Card><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}><div><div style={{ fontSize: 11, fontWeight: 600, color: '#9B9B9B', letterSpacing: 0.5, fontFamily: 'Montserrat, sans-serif', marginBottom: 6, textTransform: 'uppercase' }}>Pendentes de Análise</div><div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 26, color: '#1a1c5e', lineHeight: 1 }}>47</div><div style={{ fontSize: 12, color: '#f59e0b', marginTop: 4, fontWeight: 600, fontFamily: 'DM Sans, sans-serif' }}>12 críticos</div></div><span style={{ fontSize: 24 }}>⏳</span></div></Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20 }}>
        {/* Queue */}
        <Card style={{ borderRadius: 16, padding: '20px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 15, color: '#1a1c5e' }}>Fila de Análise</div>
            <span style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b', fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, fontFamily: 'Montserrat, sans-serif' }}>47 pendentes</span>
          </div>
          {PENDING.map((p, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', borderRadius: 12, marginBottom: 8, background: '#f4f5f9', border: '1px solid #e2e4ef' }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(46,49,146,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 16, color: '#2E3192', fontFamily: 'Montserrat, sans-serif', flexShrink: 0 }}>{p.company[0]}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1c5e', fontFamily: 'Montserrat, sans-serif', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.company}</div>
                <div style={{ fontSize: 11, color: '#9B9B9B', fontFamily: 'DM Sans, sans-serif' }}>{p.cnpj} · {p.date}/06</div>
              </div>
              <Badge level={p.plan} />
              <span style={{ fontSize: 10, fontWeight: 700, color: riskColor[p.risk], background: `${riskColor[p.risk]}18`, padding: '2px 8px', borderRadius: 20, fontFamily: 'Montserrat, sans-serif', whiteSpace: 'nowrap' }}>Risco {p.risk}</span>
              {p.analyst
                ? <span style={{ fontSize: 11, color: '#9B9B9B', fontFamily: 'DM Sans, sans-serif', whiteSpace: 'nowrap' }}>👤 {p.analyst}</span>
                : <Button variant="primary" size="sm">Analisar</Button>
              }
            </div>
          ))}
        </Card>

        {/* Right */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card style={{ borderRadius: 16, padding: '20px 24px' }}>
            <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 15, color: '#1a1c5e', marginBottom: 16 }}>Receita por Plano</div>
            {[{ label: 'Premium', pct: 68, amount: 'R$ 60.8k', color: '#F47E2F' }, { label: 'Simples', pct: 32, amount: 'R$ 28.6k', color: '#2E3192' }].map((r, i) => (
              <div key={i} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontFamily: 'DM Sans, sans-serif', fontWeight: 600, color: '#1a1c5e' }}>{r.label}</span>
                  <span style={{ fontSize: 13, fontFamily: 'Montserrat, sans-serif', fontWeight: 700, color: r.color }}>{r.amount}</span>
                </div>
                <div style={{ height: 8, borderRadius: 8, background: '#f4f5f9', overflow: 'hidden' }}>
                  <div style={{ width: `${r.pct}%`, height: '100%', background: r.color, borderRadius: 8, transition: 'width 0.8s ease' }} />
                </div>
              </div>
            ))}
          </Card>

          <div style={{ background: 'linear-gradient(135deg, #2E3192, #3d40b5)', borderRadius: 16, padding: '20px 24px', color: '#fff' }}>
            <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 14, marginBottom: 14 }}>Ações Rápidas</div>
            {[['✅', 'Aprovar em Lote (23)'], ['📊', 'Exportar Relatório'], ['🔔', 'Configurar Alertas'], ['⚙️', 'Gerenciar Planos']].map(([icon, label], i) => (
              <button key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', borderRadius: 10, padding: '10px 14px', fontFamily: 'DM Sans, sans-serif', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginBottom: 8, textAlign: 'left', transition: 'all 0.15s' }}>
                <span>{icon}</span> {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Onboarding / Cadastro ────────────────────────────────────────────────────
export function Onboarding({ setScreen }) {
  const [cnpj, setCnpj] = useState('')
  const [found, setFound] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')

  const formatCnpj = (v) => {
    const d = v.replace(/\D/g, '').slice(0, 14)
    return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2')
  }

  const handleCnpj = (v) => {
    const fmt = formatCnpj(v)
    setCnpj(fmt)
    setFound(fmt.replace(/\D/g, '').length === 14)
  }

  return (
    <div style={{ background: '#fff', display: 'flex', minHeight: 'calc(100vh - 58px)' }}>
      {/* Left panel */}
      <div style={{ width: 520, background: 'linear-gradient(160deg, #2E3192, #3d40b5)', padding: '60px 48px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <h2 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 900, fontSize: 32, color: '#fff', lineHeight: 1.2, marginBottom: 16 }}>
            Seu fornecedor<br />começa aqui.
          </h2>
          <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 16, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6, marginBottom: 48 }}>
            Obtenha o Selo ELOS e seja encontrado por mais de 500 grandes compradores do Brasil.
          </p>
          {[
            { n: 1, active: true,  title: 'Digite seu CNPJ',         sub: 'Preenchemos os dados automaticamente' },
            { n: 2, active: false, title: 'Escolha seu plano',        sub: 'Simples ou Premium' },
            { n: 3, active: false, title: 'Envie seus documentos',    sub: 'Processo digital, sem burocracia' },
            { n: 4, active: false, title: 'Receba o Selo ELOS',       sub: 'Em 5 a 15 dias úteis' },
          ].map(step => (
            <div key={step.n} style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 20 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: step.active ? '#F47E2F' : 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16, color: '#fff', fontFamily: 'Montserrat, sans-serif', flexShrink: 0 }}>{step.n}</div>
              <div>
                <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 15, color: step.active ? '#fff' : 'rgba(255,255,255,0.6)' }}>{step.title}</div>
                <div style={{ fontSize: 13, color: step.active ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.4)', fontFamily: 'DM Sans, sans-serif' }}>{step.sub}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', fontFamily: 'DM Sans, sans-serif' }}>© 2025 EQPI Tech · Todos os direitos reservados</div>
      </div>

      {/* Right panel */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px' }}>
        <div style={{ width: '100%', maxWidth: 440 }}>
          <h2 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 26, color: '#1a1c5e', marginBottom: 8 }}>Comece agora</h2>
          <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 15, color: '#9B9B9B', marginBottom: 36 }}>Insira o CNPJ da sua empresa para começar</p>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 12, color: '#1a1c5e', letterSpacing: 0.5, marginBottom: 8, textTransform: 'uppercase' }}>CNPJ da Empresa</label>
            <div style={{ position: 'relative' }}>
              <input
                value={cnpj}
                onChange={e => handleCnpj(e.target.value)}
                placeholder="00.000.000/0001-00"
                style={{
                  width: '100%', padding: '14px 48px 14px 16px', borderRadius: 12,
                  border: `2px solid ${found ? '#22c55e' : '#2E3192'}`,
                  fontFamily: 'Montserrat, sans-serif', fontSize: 18, fontWeight: 700,
                  color: '#1a1c5e', boxSizing: 'border-box', letterSpacing: 1,
                  transition: 'border-color 0.3s',
                }}
              />
              {found && (
                <div style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', width: 28, height: 28, borderRadius: 8, background: '#22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14, fontWeight: 700 }}>✓</div>
              )}
            </div>
          </div>

          {found && (
            <div style={{ background: '#f4f5f9', borderRadius: 14, padding: '16px 20px', marginBottom: 24, border: '1px solid #e2e4ef' }} className="animate-fade-in-up">
              <div style={{ fontSize: 11, fontWeight: 600, color: '#9B9B9B', fontFamily: 'Montserrat, sans-serif', letterSpacing: 0.5, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6, textTransform: 'uppercase' }}>
                <span style={{ color: '#22c55e', fontSize: 8 }}>●</span> Dados Encontrados Automaticamente
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[['Razão Social', 'Metalúrgica Souza Ltda'], ['Situação', '✓ ATIVA'], ['CNAE Principal', '2512-8/00 Metalurgia'], ['UF', 'Belo Horizonte · MG']].map(([l, v]) => (
                  <div key={l}>
                    <div style={{ fontSize: 10, color: '#9B9B9B', fontFamily: 'DM Sans, sans-serif' }}>{l}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: l === 'Situação' ? '#22c55e' : '#1a1c5e', fontFamily: 'Montserrat, sans-serif' }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 12, color: '#1a1c5e', letterSpacing: 0.5, marginBottom: 8, textTransform: 'uppercase' }}>Nome do Responsável</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="João da Silva" style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid #e2e4ef', fontFamily: 'DM Sans, sans-serif', fontSize: 14, color: '#1a1c5e', boxSizing: 'border-box', transition: 'all 0.15s' }} />
          </div>

          <div style={{ marginBottom: 28 }}>
            <label style={{ display: 'block', fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 12, color: '#1a1c5e', letterSpacing: 0.5, marginBottom: 8, textTransform: 'uppercase' }}>E-mail Corporativo</label>
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="joao@empresa.com.br" type="email" style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid #e2e4ef', fontFamily: 'DM Sans, sans-serif', fontSize: 14, color: '#1a1c5e', boxSizing: 'border-box', transition: 'all 0.15s' }} />
          </div>

          <Button
            variant="orange" full size="lg"
            style={{ borderRadius: 12, padding: '15px 20px', fontSize: 15 }}
            onClick={() => setScreen('planos')}
            disabled={!found || !name || !email}
          >
            Continuar para Escolha de Plano →
          </Button>

          <div style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: '#9B9B9B', fontFamily: 'DM Sans, sans-serif' }}>
            Já tem conta? <a href="#" style={{ color: '#2E3192', fontWeight: 600 }}>Fazer login</a>
          </div>
        </div>
      </div>
    </div>
  )
}
