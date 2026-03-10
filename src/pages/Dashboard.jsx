import { useState } from 'react'
import { Badge, Seal, Button, Card, KpiCard, ScoreBar, StatusIcon, SectionTitle, ProgressBar } from '../components/ui.jsx'

const DOCS = [
  { name: 'Cartão CNPJ',           status: 'ok',      expires: null },
  { name: 'CND Federal',           status: 'ok',      expires: '15/08/2025' },
  { name: 'CRF (FGTS)',            status: 'warning',  expires: '30/06/2025' },
  { name: 'CNDT Trabalhista',      status: 'ok',      expires: '20/09/2025' },
  { name: 'Alvará de Funcionamento', status: 'missing', expires: null },
  { name: 'Contrato Social',       status: 'ok',      expires: null },
  { name: 'Inscrição Estadual',    status: 'ok',      expires: null },
  { name: 'CND Municipal',         status: 'ok',      expires: '10/10/2025' },
]

const WEEK_VIEWS = [
  { day: 'Seg', v: 28 }, { day: 'Ter', v: 45 }, { day: 'Qua', v: 32 },
  { day: 'Qui', v: 61 }, { day: 'Sex', v: 55 }, { day: 'Sáb', v: 20 }, { day: 'Dom', v: 18 },
]

const COTACOES = [
  { company: 'Vale S.A.',      service: 'Manutenção Industrial', date: '05/06', status: 'Nova' },
  { company: 'Anglo American', service: 'Logística',            date: '03/06', status: 'Vista' },
  { company: 'Samarco',        service: 'Equipamentos',         date: '01/06', status: 'Respondida' },
]

const STATUS_BG = { ok: '#f8fffe', warning: '#fffbeb', missing: '#fff5f5' }
const STATUS_BORDER = { ok: '#dcfce7', warning: '#fef3c7', missing: '#fee2e2' }
const COTACAO_COLORS = { Nova: '#F47E2F', Vista: '#2E3192', Respondida: '#22c55e' }

export default function Dashboard({ setScreen }) {
  const progress = 68

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1200, margin: '0 auto' }}>

      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div className="animate-fade-in-up">
          <h1 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 22, color: '#1a1c5e' }}>
            Bom dia, João! 👋
          </h1>
          <p style={{ color: '#9B9B9B', fontSize: 14, fontFamily: 'DM Sans, sans-serif', marginTop: 2 }}>
            Metalúrgica Souza Ltda · CNPJ 12.345.678/0001-99
          </p>
        </div>
        <Button variant="orange" onClick={() => setScreen('planos')}>⭐ Upgrade para Premium</Button>
      </div>

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <KpiCard label="Nível Atual"           value="Simples" sub="Ativo até Dez/2025"       subColor="#9B9B9B" icon="🏷️" iconBg="rgba(46,49,146,0.1)" />
        <KpiCard label="Visualizações (30d)"   value="847"     sub="+23% vs mês anterior"     subColor="#F47E2F" icon="👁️" iconBg="rgba(244,126,47,0.1)" />
        <KpiCard label="Cotações Recebidas"    value="12"      sub="3 aguardando resposta"    subColor="#8b5cf6" icon="📩" iconBg="rgba(139,92,246,0.1)" />
        <KpiCard label="Score de Conformidade" value="74%"     sub="2 documentos pendentes"   subColor="#f59e0b" icon="📊" iconBg="rgba(34,197,94,0.1)" />
      </div>

      {/* 2-col layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20 }}>

        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Progress banner */}
          <div style={{
            background: 'linear-gradient(135deg, #2E3192, #3d40b5)',
            borderRadius: 16, padding: '24px 28px', color: '#fff',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 16 }}>
                  Jornada para o Selo ELOS Premium
                </div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', marginTop: 2, fontFamily: 'DM Sans, sans-serif' }}>
                  Complete os requisitos para desbloquear o Premium
                </div>
              </div>
              <Seal level="Simples" size={64} />
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', fontFamily: 'DM Sans, sans-serif' }}>Progresso atual</span>
                <span style={{ fontWeight: 700, fontFamily: 'Montserrat, sans-serif' }}>{progress}%</span>
              </div>
              <ProgressBar value={progress} dark />
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              {[{ label: 'Dados Básicos', done: true }, { label: 'Fiscal', done: true }, { label: 'Trabalhista', done: false }, { label: 'ESG', done: false }].map((step, i) => (
                <div key={i} style={{
                  flex: 1, textAlign: 'center', padding: '8px 10px', borderRadius: 8,
                  background: step.done ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.06)',
                  border: step.done ? '1px solid rgba(255,255,255,0.2)' : '1px solid rgba(255,255,255,0.08)',
                }}>
                  <div style={{ fontSize: 16 }}>{step.done ? '✅' : '⏳'}</div>
                  <div style={{
                    fontSize: 10, fontFamily: 'Montserrat, sans-serif', fontWeight: 600, marginTop: 2,
                    color: step.done ? '#fff' : 'rgba(255,255,255,0.4)',
                  }}>{step.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Documents */}
          <Card style={{ borderRadius: 16, padding: '20px 24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <SectionTitle>Status dos Documentos</SectionTitle>
              <div style={{ display: 'flex', gap: 12, fontSize: 12, fontFamily: 'DM Sans, sans-serif' }}>
                <span style={{ color: '#22c55e' }}>✓ 6 ok</span>
                <span style={{ color: '#f59e0b' }}>⚠ 1 expirando</span>
                <span style={{ color: '#ef4444' }}>✕ 1 faltando</span>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {DOCS.map((doc, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', borderRadius: 10,
                  background: STATUS_BG[doc.status],
                  border: `1px solid ${STATUS_BORDER[doc.status]}`,
                }}>
                  <StatusIcon status={doc.status} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#1a1c5e', fontFamily: 'Montserrat, sans-serif' }}>{doc.name}</div>
                    {doc.expires && <div style={{ fontSize: 10, color: '#9B9B9B', fontFamily: 'DM Sans, sans-serif' }}>vence: {doc.expires}</div>}
                    {doc.status === 'missing' && <div style={{ fontSize: 10, color: '#ef4444', fontFamily: 'DM Sans, sans-serif' }}>Enviar documento</div>}
                  </div>
                  {doc.status !== 'ok' && (
                    <Button variant="orange" size="sm">{doc.status === 'missing' ? 'Enviar' : 'Renovar'}</Button>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Weekly chart */}
          <Card style={{ borderRadius: 16, padding: '20px 24px' }}>
            <SectionTitle>Visibilidade no Marketplace</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {WEEK_VIEWS.map((d, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 28, fontSize: 11, color: '#9B9B9B', fontFamily: 'DM Sans, sans-serif', textAlign: 'right' }}>{d.day}</span>
                  <div style={{ flex: 1, height: 8, background: '#f4f5f9', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{
                      width: `${(d.v / 70) * 100}%`, height: '100%', borderRadius: 4,
                      background: d.v === 61 ? '#F47E2F' : 'linear-gradient(90deg, #2E3192, #3d40b5)',
                      transition: 'width 0.6s ease',
                    }} />
                  </div>
                  <span style={{ width: 24, fontSize: 11, fontWeight: 600, color: '#1a1c5e', fontFamily: 'Montserrat, sans-serif' }}>{d.v}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Alert */}
          <div style={{
            background: 'rgba(244,126,47,0.08)', borderRadius: 16,
            padding: '16px 18px', border: '1px solid rgba(244,126,47,0.25)',
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#F47E2F', fontFamily: 'Montserrat, sans-serif', marginBottom: 6 }}>
              ⚡ Ação Necessária
            </div>
            <div style={{ fontSize: 12, color: '#7c3f0a', fontFamily: 'DM Sans, sans-serif', lineHeight: 1.5 }}>
              Seu <strong>CRF (FGTS)</strong> vence em 30/06. Renove para manter o Selo ELOS ativo.
            </div>
            <Button variant="orange" full size="lg" style={{ marginTop: 10, borderRadius: 10, fontSize: 12 }}>
              Renovar Agora →
            </Button>
          </div>

          {/* Recent quotes */}
          <Card style={{ borderRadius: 16, padding: '20px 24px' }}>
            <SectionTitle>Cotações Recentes</SectionTitle>
            {COTACOES.map((q, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 0',
                borderBottom: i < COTACOES.length - 1 ? '1px solid #e2e4ef' : 'none',
              }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(46,49,146,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>🏭</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1c5e', fontFamily: 'Montserrat, sans-serif' }}>{q.company}</div>
                  <div style={{ fontSize: 11, color: '#9B9B9B', fontFamily: 'DM Sans, sans-serif' }}>{q.service}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{
                    fontSize: 10, fontWeight: 700, color: COTACAO_COLORS[q.status],
                    background: `${COTACAO_COLORS[q.status]}18`,
                    padding: '2px 8px', borderRadius: 20,
                    fontFamily: 'Montserrat, sans-serif',
                  }}>{q.status}</div>
                  <div style={{ fontSize: 10, color: '#9B9B9B', fontFamily: 'DM Sans, sans-serif', marginTop: 3 }}>{q.date}/06</div>
                </div>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  )
}
