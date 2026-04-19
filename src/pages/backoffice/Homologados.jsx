// Visão geral de fornecedores já homologados — backoffice
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'
import { Button, Card, ScoreBar, Spinner, PageHeader, EmptyState } from '../../components/ui.jsx'

export function BackofficeHomologados() {
  const navigate = useNavigate()
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [stats, setStats]         = useState({ total: 0, premium: 0, simples: 0, suspended: 0 })

  useEffect(() => {
    supabase.from('suppliers')
      .select(`*, seals!inner(level, status, score, issued_at), plans(type, status)`)
      .eq('seals.status', 'ACTIVE')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        // Filtra client-side também para garantir — inclui qualquer fornecedor
        // cujo selo está ATIVO ou cujo supplier.status é ACTIVE
        const list = (data || []).filter(s =>
          s.seals?.[0]?.status === 'ACTIVE' || s.status === 'ACTIVE'
        )
        setSuppliers(list)
        setStats({
          total:     list.length,
          premium:   list.filter(s => s.seals?.[0]?.level === 'Premium').length,
          simples:   list.filter(s => s.seals?.[0]?.level === 'Simples').length,
          suspended: list.filter(s => s.seals?.[0]?.status === 'SUSPENDED').length,
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
          { label:'Total Homologados', value: stats.total,     color:'#2E3192', bg:'rgba(46,49,146,.06)' },
          { label:'Selo Premium',      value: stats.premium,   color:'#F47E2F', bg:'rgba(244,126,47,.06)' },
          { label:'Selo Simples',      value: stats.simples,   color:'#22c55e', bg:'rgba(34,197,94,.06)'  },
          { label:'Suspensos',         value: stats.suspended, color:'#dc2626', bg:'rgba(239,68,68,.06)'  },
        ].map((kpi,i) => (
          <div key={i} style={{ background:kpi.bg,border:`1px solid ${kpi.color}22`,borderRadius:12,padding:'16px 20px' }}>
            <div style={{ fontSize:28,fontWeight:800,color:kpi.color,fontFamily:'Montserrat,sans-serif' }}>{kpi.value}</div>
            <div style={{ fontSize:12,color:'#9B9B9B',fontFamily:'DM Sans,sans-serif',marginTop:4 }}>{kpi.label}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div style={{ marginBottom:20 }}>
        <input value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="🔍  Buscar por razão social ou CNPJ..."
          style={{ width:'100%',padding:'10px 16px',borderRadius:10,border:'1px solid #e2e4ef',
            fontFamily:'DM Sans,sans-serif',fontSize:14,outline:'none',boxSizing:'border-box' }}/>
      </div>

      {filtered.length === 0
        ? <EmptyState icon="🔍" title="Nenhum resultado" subtitle="Tente outro termo de busca"/>
        : filtered.map((s, i) => {
            const seal = s.seals?.[0]
            const sealColor = seal?.level === 'Premium' ? '#F47E2F' : '#2E3192'
            const statusColor = seal?.status === 'ACTIVE' ? '#22c55e' : seal?.status === 'SUSPENDED' ? '#dc2626' : '#f59e0b'
            return (
              <Card key={i} hover style={{ borderRadius:14, padding:'16px 20px', marginBottom:10 }}>
                <div style={{ display:'flex', alignItems:'center', gap:16 }}>
                  <div style={{ width:44,height:44,borderRadius:10,background:`${sealColor}18`,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:800,fontSize:18,color:sealColor,flexShrink:0 }}>
                    {s.razao_social?.[0]}
                  </div>
                  <div style={{ flex:1,minWidth:0 }}>
                    <div style={{ display:'flex',alignItems:'center',gap:8,flexWrap:'wrap' }}>
                      <span style={{ fontSize:14,fontWeight:700,color:'#1a1c5e',fontFamily:'Montserrat,sans-serif' }}>{s.razao_social}</span>
                      <span style={{ fontSize:10,fontWeight:700,color:sealColor,background:`${sealColor}18`,padding:'2px 8px',borderRadius:20 }}>
                        Selo {seal?.level||'—'}
                      </span>
                      <span style={{ fontSize:10,fontWeight:700,color:statusColor,background:`${statusColor}18`,padding:'2px 8px',borderRadius:20 }}>
                        {seal?.status==='ACTIVE'?'Ativo':seal?.status==='SUSPENDED'?'Suspenso':'Pendente'}
                      </span>
                    </div>
                    <div style={{ fontSize:12,color:'#9B9B9B',marginTop:2 }}>
                      {s.cnpj} · {s.city}/{s.state} · Homologado em {seal?.issued_at?.slice(0,10)||'—'}
                    </div>
                    <div style={{ marginTop:6,width:160 }}>
                      <ScoreBar score={seal?.score||0}/>
                    </div>
                  </div>
                  <Button variant="neutral" size="sm" onClick={()=>navigate(`/backoffice/analise/${s.id}`)}>
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
