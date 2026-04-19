// BackofficeHomologados — fornecedores com Selo ELOS emitido
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'
import { Button, Card, ScoreBar, Spinner, PageHeader, EmptyState } from '../../components/ui.jsx'

export function BackofficeHomologados() {
  const navigate = useNavigate()
  const [suppliers, setSuppliers] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [search,    setSearch]    = useState('')
  const [stats,     setStats]     = useState({ total:0, premium:0, simples:0, suspended:0 })

  useEffect(() => {
    // Busca seals com status ACTIVE e join com suppliers
    // Mais confiável que filtrar por suppliers.status (pode ter lag de RLS)
    supabase
      .from('seals')
      .select('*, suppliers!inner(*)')
      .eq('status', 'ACTIVE')
      .order('issued_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) { console.error('Homologados query:', error.message); setLoading(false); return }
        // Mescla dados: seal no nível raiz + supplier embutido
        const list = (data || []).map(seal => ({
          ...seal.suppliers,
          seal_level:     seal.level,
          seal_status:    seal.status,
          seal_score:     seal.score,
          seal_issued_at: seal.issued_at,
        }))
        setSuppliers(list)
        setStats({
          total:     list.length,
          premium:   list.filter(s => s.seal_level === 'Premium').length,
          simples:   list.filter(s => s.seal_level === 'Simples').length,
          suspended: 0, // status ACTIVE, nenhum suspenso nesta query
        })
        setLoading(false)
      })
  }, [])

  const filtered = suppliers.filter(s =>
    !search ||
    s.razao_social?.toLowerCase().includes(search.toLowerCase()) ||
    s.cnpj?.includes(search.replace(/\D/g,''))
  )

  if (loading) return <div style={{ display:'flex',justifyContent:'center',alignItems:'center',height:'50vh' }}><Spinner size={48}/></div>

  return (
    <div style={{ padding:'28px 32px', maxWidth:1100, margin:'0 auto' }}>
      <PageHeader title="Fornecedores Homologados" subtitle={`${stats.total} empresas com Selo ELOS ativo`}/>

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:24 }}>
        {[
          { label:'Total Homologados', value:stats.total,   color:'#2E3192', bg:'rgba(46,49,146,.06)' },
          { label:'Selo Premium',      value:stats.premium, color:'#F47E2F', bg:'rgba(244,126,47,.06)' },
          { label:'Selo Simples',      value:stats.simples, color:'#22c55e', bg:'rgba(34,197,94,.06)'  },
          { label:'Suspensos',         value:stats.suspended,color:'#dc2626',bg:'rgba(239,68,68,.06)'  },
        ].map((kpi,i) => (
          <div key={i} style={{ background:kpi.bg, border:`1px solid ${kpi.color}22`, borderRadius:12, padding:'16px 20px' }}>
            <div style={{ fontSize:28, fontWeight:800, color:kpi.color, fontFamily:'Montserrat,sans-serif' }}>{kpi.value}</div>
            <div style={{ fontSize:12, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', marginTop:4 }}>{kpi.label}</div>
          </div>
        ))}
      </div>

      {/* Busca */}
      <div style={{ marginBottom:20 }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍  Buscar por razão social ou CNPJ..."
          style={{ width:'100%', padding:'10px 16px', borderRadius:10, border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:14, outline:'none', boxSizing:'border-box' }}/>
      </div>

      {filtered.length === 0
        ? <EmptyState icon="🔍" title="Nenhum resultado" subtitle="Tente outro termo de busca"/>
        : filtered.map((s, i) => {
            const sealColor = s.seal_level === 'Premium' ? '#F47E2F' : '#2E3192'
            return (
              <Card key={i} hover style={{ borderRadius:14, padding:'16px 20px', marginBottom:10 }}>
                <div style={{ display:'flex', alignItems:'center', gap:16 }}>
                  <div style={{ width:44, height:44, borderRadius:10, background:`${sealColor}18`, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:18, color:sealColor, flexShrink:0 }}>
                    {s.razao_social?.[0]}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                      <span style={{ fontSize:14, fontWeight:700, color:'#1a1c5e', fontFamily:'Montserrat,sans-serif' }}>{s.razao_social}</span>
                      <span style={{ fontSize:10, fontWeight:700, color:sealColor, background:`${sealColor}18`, padding:'2px 8px', borderRadius:20 }}>Selo {s.seal_level||'—'}</span>
                      <span style={{ fontSize:10, fontWeight:700, color:'#22c55e', background:'rgba(34,197,94,.1)', padding:'2px 8px', borderRadius:20 }}>Ativo</span>
                    </div>
                    <div style={{ fontSize:12, color:'#9B9B9B', marginTop:2 }}>
                      {s.cnpj} · {s.city}/{s.state} · Emitido em {s.seal_issued_at?.slice(0,10)||'—'}
                    </div>
                    <div style={{ marginTop:6, width:160 }}>
                      <ScoreBar score={s.seal_score||0}/>
                    </div>
                  </div>
                  <Button variant="neutral" size="sm" onClick={() => navigate(`/backoffice/analise/${s.id}`)}>
                    Ver Ficha
                  </Button>
                </div>
              </Card>
            )
          })
      }
    </div>
  )
}
