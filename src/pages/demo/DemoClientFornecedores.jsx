import { useState } from 'react'
import { Card, Button, ScoreBar } from '../../components/ui.jsx'
import { DEMO_CLIENT_SUPPLIERS } from './demoData.js'

const SEAL_COLOR = { ACTIVE:'#22c55e', PENDING:'#f59e0b', SUSPENDED:'#ef4444', EXPIRED:'#9B9B9B' }
const SEAL_LABEL = { ACTIVE:'Homologado', PENDING:'Em análise', SUSPENDED:'Suspenso', EXPIRED:'Expirado' }

const FILTER_OPTS = ['Todos','Homologados','Em análise','Suspensos','Subsidiados']

export default function DemoClientFornecedores({ navigate }) {
  const [filter, setFilter] = useState('Todos')
  const [q, setQ] = useState('')

  const list = DEMO_CLIENT_SUPPLIERS.filter(s => {
    if (q && !s.razao_social.toLowerCase().includes(q.toLowerCase())) return false
    if (filter === 'Homologados')  return s.sealStatus === 'ACTIVE'
    if (filter === 'Em análise')   return s.sealStatus === 'PENDING'
    if (filter === 'Suspensos')    return s.sealStatus === 'SUSPENDED'
    if (filter === 'Subsidiados')  return s.subsidiado
    return true
  })

  return (
    <div style={{ padding:'28px 32px', maxWidth:1100, margin:'0 auto' }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:24, flexWrap:'wrap', gap:12 }}>
        <div>
          <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:22, color:'#1a1c5e' }}>Meus Fornecedores</div>
          <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#9B9B9B', marginTop:2 }}>
            {DEMO_CLIENT_SUPPLIERS.length} fornecedores convidados · {DEMO_CLIENT_SUPPLIERS.filter(s=>s.sealStatus==='ACTIVE').length} homologados
          </div>
        </div>
        <Button variant="primary" onClick={() => navigate('convites')}>+ Convidar Fornecedor</Button>
      </div>

      {/* Filtros + busca */}
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20, flexWrap:'wrap' }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nome..." style={{ padding:'8px 12px', borderRadius:8, border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#1a1c5e', outline:'none', width:240 }}/>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          {FILTER_OPTS.map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{ padding:'6px 14px', borderRadius:20, fontSize:11, fontFamily:'Montserrat,sans-serif', fontWeight:700, border:`1px solid ${filter===f?'#2E3192':'#e2e4ef'}`, background:filter===f?'#EEF0FF':'#fff', color:filter===f?'#2E3192':'#9B9B9B', cursor:'pointer' }}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      <Card style={{ borderRadius:16, padding:'8px 0' }}>
        {/* Header da tabela */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 160px 120px 100px 80px', gap:12, padding:'10px 20px', borderBottom:'1px solid #f3f4f6' }}>
          {['Fornecedor','Localidade','Status','Score',''].map(h => (
            <div key={h} style={{ fontSize:10, fontWeight:700, color:'#9B9B9B', fontFamily:'Montserrat,sans-serif', textTransform:'uppercase', letterSpacing:.5 }}>{h}</div>
          ))}
        </div>

        {list.length === 0 ? (
          <div style={{ padding:'40px 20px', textAlign:'center', color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', fontSize:14 }}>
            Nenhum fornecedor encontrado para este filtro.
          </div>
        ) : list.map((s, i) => {
          const sc = SEAL_COLOR[s.sealStatus] || '#9B9B9B'
          const sl = SEAL_LABEL[s.sealStatus] || s.sealStatus
          return (
            <div key={s.id} style={{ display:'grid', gridTemplateColumns:'1fr 160px 120px 100px 80px', gap:12, padding:'14px 20px', borderBottom: i < list.length-1 ? '1px solid #f9fafb' : 'none', alignItems:'center', cursor:'pointer', transition:'background .12s' }}
              onMouseOver={e => e.currentTarget.style.background='#f8faff'}
              onMouseOut={e  => e.currentTarget.style.background='#fff'}
              onClick={() => navigate('processo')}>
              {/* Nome */}
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ width:38, height:38, borderRadius:10, background:'#EEF0FF', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:13, color:'#2E3192', flexShrink:0 }}>
                  {s.initials}
                </div>
                <div>
                  <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, color:'#1a1c5e' }}>{s.razao_social}</div>
                  {s.subsidiado && (
                    <span style={{ fontSize:9, background:'#d1fae5', color:'#065f46', borderRadius:20, padding:'1px 6px', fontFamily:'Montserrat,sans-serif', fontWeight:700 }}>SUBSIDIADO</span>
                  )}
                </div>
              </div>
              {/* Localidade */}
              <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:12, color:'#9B9B9B' }}>{s.city} / {s.state}</div>
              {/* Status */}
              <div>
                <span style={{ fontSize:11, fontWeight:700, color:sc, background:`${sc}15`, padding:'3px 10px', borderRadius:20, fontFamily:'Montserrat,sans-serif' }}>{sl}</span>
              </div>
              {/* Score */}
              <div>
                {s.score ? (
                  <div>
                    <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:14, color:s.score>=90?'#22c55e':s.score>=70?'#f59e0b':'#ef4444' }}>{s.score}</div>
                    <ScoreBar score={s.score}/>
                  </div>
                ) : (
                  <span style={{ fontSize:11, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>—</span>
                )}
              </div>
              {/* Ação */}
              <button style={{ padding:'5px 12px', borderRadius:8, background:'#EEF0FF', color:'#2E3192', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:11, border:'none', cursor:'pointer', whiteSpace:'nowrap' }}>
                Ver →
              </button>
            </div>
          )
        })}
      </Card>
    </div>
  )
}
