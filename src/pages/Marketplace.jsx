import { useState } from 'react'
import { Badge, Button, ScoreBar } from '../components/ui.jsx'

const SUPPLIERS = [
  { id: 1, name: 'Metalúrgica Souza Ltda',  category: 'Metalurgia / Fabricação',    state: 'MG', level: 'Simples', score: 74, since: 2021, services: ['Usinagem CNC', 'Solda Industrial', 'Estruturas Metálicas'] },
  { id: 2, name: 'TechServ Industrial S.A.', category: 'Manutenção Industrial',      state: 'SP', level: 'Premium', score: 96, since: 2019, services: ['Manutenção Preventiva', 'Automação', 'Caldeiraria'] },
  { id: 3, name: 'LogTrans Mineração Ltda',  category: 'Logística / Transporte',     state: 'PA', level: 'Premium', score: 91, since: 2018, services: ['Transporte de Minério', 'Gestão de Frota', 'Armazenagem'] },
  { id: 4, name: 'EnviroClean Serviços',     category: 'Meio Ambiente',              state: 'MG', level: 'Simples', score: 68, since: 2022, services: ['Gestão de Resíduos', 'Licenciamento Ambiental'] },
  { id: 5, name: 'SegMax Proteção Ltda',     category: 'Segurança do Trabalho',      state: 'GO', level: 'Premium', score: 88, since: 2020, services: ['EPI/EPC', 'Treinamentos NR', 'Gestão de Saúde Ocupacional'] },
  { id: 6, name: 'DataControl TI',           category: 'Tecnologia da Informação',   state: 'SP', level: 'Simples', score: 79, since: 2023, services: ['Suporte TI', 'Redes e Infraestrutura', 'Cibersegurança'] },
]

const STATES = ['Todos', 'MG', 'SP', 'PA', 'GO']
const LEVELS = ['Todos', 'Simples', 'Premium']

const FilterRadio = ({ options, value, onChange }) => (
  <div>
    {options.map(opt => (
      <div key={opt} onClick={() => onChange(opt)} style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
        borderRadius: 8, marginBottom: 4, cursor: 'pointer',
        background: value === opt ? 'rgba(46,49,146,0.08)' : 'transparent',
        border: value === opt ? '1px solid rgba(46,49,146,0.2)' : '1px solid transparent',
        transition: 'all 0.15s',
      }}>
        <div style={{
          width: 14, height: 14, borderRadius: '50%',
          border: `2px solid ${value === opt ? '#2E3192' : '#e2e4ef'}`,
          background: value === opt ? '#2E3192' : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          {value === opt && <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#fff' }} />}
        </div>
        <span style={{
          fontSize: 13, fontFamily: 'DM Sans, sans-serif',
          color: value === opt ? '#1a1c5e' : '#9B9B9B',
          fontWeight: value === opt ? 600 : 400,
        }}>{opt}</span>
      </div>
    ))}
  </div>
)

export default function Marketplace({ setScreen, setSelectedSupplier }) {
  const [search, setSearch] = useState('')
  const [filterLevel, setFilterLevel] = useState('Todos')
  const [filterState, setFilterState] = useState('Todos')

  const filtered = SUPPLIERS.filter(s =>
    (filterLevel === 'Todos' || s.level === filterLevel) &&
    (filterState === 'Todos' || s.state === filterState) &&
    (s.name.toLowerCase().includes(search.toLowerCase()) || s.category.toLowerCase().includes(search.toLowerCase()))
  )

  const handleView = (supplier) => {
    setSelectedSupplier(supplier)
    setScreen('perfil')
  }

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 58px)' }}>

      {/* Sidebar */}
      <aside style={{
        width: 240, background: '#fff', borderRight: '1px solid #e2e4ef',
        padding: '20px 16px', overflowY: 'auto', flexShrink: 0,
      }}>
        <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 13, color: '#1a1c5e', marginBottom: 16 }}>
          FILTROS
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#9B9B9B', fontFamily: 'Montserrat, sans-serif', marginBottom: 8, letterSpacing: 0.5, textTransform: 'uppercase' }}>
            Nível do Selo
          </div>
          <FilterRadio options={LEVELS} value={filterLevel} onChange={setFilterLevel} />
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#9B9B9B', fontFamily: 'Montserrat, sans-serif', marginBottom: 8, letterSpacing: 0.5, textTransform: 'uppercase' }}>
            Estado (UF)
          </div>
          <FilterRadio options={STATES} value={filterState} onChange={setFilterState} />
        </div>

        <div style={{ height: 1, background: '#e2e4ef', margin: '16px 0' }} />
        <div style={{ fontSize: 11, color: '#9B9B9B', fontFamily: 'DM Sans, sans-serif', textAlign: 'center' }}>
          <strong style={{ color: '#1a1c5e' }}>{filtered.length}</strong> fornecedores encontrados
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', background: '#f4f5f9' }}>

        {/* Search */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: '#9B9B9B' }}>🔍</span>
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nome, categoria ou serviço..."
              style={{
                width: '100%', padding: '12px 14px 12px 42px', borderRadius: 12,
                border: '1px solid #e2e4ef', background: '#fff',
                fontFamily: 'DM Sans, sans-serif', fontSize: 14, color: '#1a1c5e',
                boxSizing: 'border-box', transition: 'all 0.15s',
              }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 14, color: '#9B9B9B' }}>
            Mostrando <strong style={{ color: '#1a1c5e' }}>{filtered.length}</strong> fornecedores qualificados
          </div>
          <div style={{ fontSize: 12, color: '#9B9B9B', fontFamily: 'DM Sans, sans-serif' }}>
            Ordenar: <span style={{ color: '#2E3192', fontWeight: 600, cursor: 'pointer' }}>Mais Confiável ↓</span>
          </div>
        </div>

        {/* Grid */}
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
            <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 18, color: '#1a1c5e' }}>Nenhum fornecedor encontrado</div>
            <div style={{ color: '#9B9B9B', fontFamily: 'DM Sans, sans-serif', marginTop: 6 }}>Tente ajustar os filtros ou o termo de busca</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
            {filtered.map(s => (
              <div key={s.id} style={{
                background: '#fff', borderRadius: 16, padding: '20px',
                border: s.level === 'Premium' ? '2px solid rgba(244,126,47,0.3)' : '1px solid #e2e4ef',
                boxShadow: s.level === 'Premium'
                  ? '0 4px 20px rgba(244,126,47,0.1)'
                  : '0 1px 6px rgba(46,49,146,0.06)',
                cursor: 'pointer', transition: 'all 0.2s',
              }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(46,49,146,0.12)' }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = s.level === 'Premium' ? '0 4px 20px rgba(244,126,47,0.1)' : '0 1px 6px rgba(46,49,146,0.06)' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                      background: 'linear-gradient(135deg, rgba(46,49,146,0.12), rgba(61,64,181,0.22))',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 20, fontWeight: 700, color: '#2E3192', fontFamily: 'Montserrat, sans-serif',
                    }}>{s.name[0]}</div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1c5e', fontFamily: 'Montserrat, sans-serif' }}>{s.name}</div>
                      <div style={{ fontSize: 12, color: '#9B9B9B', fontFamily: 'DM Sans, sans-serif' }}>{s.category}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <Badge level={s.level} />
                    <div style={{ fontSize: 10, color: '#9B9B9B', fontFamily: 'DM Sans, sans-serif' }}>📍 {s.state}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: '#9B9B9B', fontFamily: 'DM Sans, sans-serif' }}>Score ELOS:</div>
                  <ScoreBar score={s.score} />
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                  {s.services.slice(0, 3).map((sv, i) => (
                    <span key={i} style={{
                      fontSize: 10, background: 'rgba(46,49,146,0.07)', color: '#2E3192',
                      padding: '3px 8px', borderRadius: 20, fontFamily: 'DM Sans, sans-serif', fontWeight: 500,
                    }}>{sv}</span>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <Button variant="primary" size="sm" style={{ flex: 1, justifyContent: 'center', borderRadius: 8 }} onClick={() => handleView(s)}>
                    Ver Perfil Completo
                  </Button>
                  <Button variant="ghost" size="sm" style={{ borderRadius: 8 }}>+ Cotação</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
