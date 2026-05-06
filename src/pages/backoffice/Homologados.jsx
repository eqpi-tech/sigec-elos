// BackofficeHomologados — fornecedores com Selo ELOS emitido (ativos e suspensos)
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'
import { adminApi } from '../../services/api.js'
import { Button, Card, ScoreBar, Spinner, PageHeader, EmptyState } from '../../components/ui.jsx'

export function BackofficeHomologados() {
  const navigate = useNavigate()
  const [suppliers, setSuppliers] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [search,    setSearch]    = useState('')
  const [filterStatus, setFilterStatus] = useState('Todos')
  const [stats,     setStats]     = useState({ total:0, premium:0, simples:0, suspended:0 })
  const [modal, setModal]         = useState(null) // { type:'inativar'|'reativar', supplierId, supplierName }
  const [motivo, setMotivo]       = useState('')
  const [processing, setProcessing] = useState(false)

  const fetchData = useCallback(() => {
    setLoading(true)
    supabase
      .from('seals')
      .select('id, supplier_id, level, status, score, issued_at, suspended_reason, suppliers!inner(*)')
      .in('status', ['ACTIVE', 'SUSPENDED'])
      .order('issued_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) { console.error('Homologados query:', error.message); setLoading(false); return }
        const list = (data || []).map(seal => ({
          ...seal.suppliers,
          seal_id:        seal.id,
          seal_level:     seal.level,
          seal_status:    seal.status,
          seal_score:     seal.score,
          seal_issued_at: seal.issued_at,
          suspended_reason: seal.suspended_reason,
        }))
        setSuppliers(list)
        setStats({
          total:     list.filter(s => s.seal_status === 'ACTIVE').length,
          premium:   list.filter(s => s.seal_level === 'Premium'  && s.seal_status === 'ACTIVE').length,
          simples:   list.filter(s => s.seal_level === 'Simples'  && s.seal_status === 'ACTIVE').length,
          suspended: list.filter(s => s.seal_status === 'SUSPENDED').length,
        })
        setLoading(false)
      })
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const filtered = suppliers.filter(s => {
    if (filterStatus !== 'Todos' && s.seal_status !== filterStatus) return false
    if (!search) return true
    return (
      s.razao_social?.toLowerCase().includes(search.toLowerCase()) ||
      s.cnpj?.includes(search.replace(/\D/g,''))
    )
  })

  const openModal = (type, s) => {
    setModal({ type, supplierId: s.id, supplierName: s.razao_social })
    setMotivo('')
  }
  const closeModal = () => { setModal(null); setMotivo('') }

  const handleConfirm = async () => {
    if (modal.type === 'inativar' && !motivo.trim()) {
      alert('Informe o motivo da inativação')
      return
    }
    setProcessing(true)
    try {
      if (modal.type === 'inativar') {
        await adminApi.suspendSupplier(modal.supplierId, motivo.trim())
      } else {
        await adminApi.reactivateSupplier(modal.supplierId)
      }
      closeModal()
      fetchData()
    } catch(e) {
      alert('Erro: ' + e.message)
    } finally {
      setProcessing(false)
    }
  }

  if (loading) return <div style={{ display:'flex',justifyContent:'center',alignItems:'center',height:'50vh' }}><Spinner size={48}/></div>

  return (
    <div style={{ padding:'28px 32px', maxWidth:1100, margin:'0 auto' }}>
      <PageHeader title="Fornecedores Homologados" subtitle={`${stats.total} com Selo ELOS ativo · ${stats.suspended} suspenso${stats.suspended !== 1 ? 's' : ''}`}/>

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:24 }}>
        {[
          { label:'Total Homologados', value:stats.total,    color:'#2E3192', bg:'rgba(46,49,146,.06)' },
          { label:'Selo Premium',      value:stats.premium,  color:'#F47E2F', bg:'rgba(244,126,47,.06)' },
          { label:'Selo Simples',      value:stats.simples,  color:'#22c55e', bg:'rgba(34,197,94,.06)'  },
          { label:'Suspensos',         value:stats.suspended,color:'#dc2626', bg:'rgba(239,68,68,.06)'  },
        ].map((kpi,i) => (
          <div key={i} style={{ background:kpi.bg, border:`1px solid ${kpi.color}22`, borderRadius:12, padding:'16px 20px' }}>
            <div style={{ fontSize:28, fontWeight:800, color:kpi.color, fontFamily:'Montserrat,sans-serif' }}>{kpi.value}</div>
            <div style={{ fontSize:12, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', marginTop:4 }}>{kpi.label}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display:'flex', gap:12, marginBottom:20, flexWrap:'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍  Buscar por razão social ou CNPJ..."
          style={{ flex:1, minWidth:220, padding:'10px 16px', borderRadius:10, border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:14, outline:'none', boxSizing:'border-box' }}/>
        <div style={{ display:'flex', gap:8 }}>
          {['Todos','ACTIVE','SUSPENDED'].map(f => (
            <button key={f} onClick={() => setFilterStatus(f)}
              style={{ padding:'8px 14px', borderRadius:20, border:`1px solid ${filterStatus===f?'#2E3192':'#e2e4ef'}`, background:filterStatus===f?'#2E3192':'#fff', color:filterStatus===f?'#fff':'#1a1c5e', fontFamily:'DM Sans,sans-serif', fontSize:12, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap' }}>
              {f === 'Todos' ? `Todos (${suppliers.length})` : f === 'ACTIVE' ? `Ativos (${stats.total})` : `Suspensos (${stats.suspended})`}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0
        ? <EmptyState icon="🔍" title="Nenhum resultado" subtitle="Tente outro termo de busca ou ajuste o filtro"/>
        : filtered.map((s, i) => {
            const isSuspended = s.seal_status === 'SUSPENDED'
            const sealColor   = isSuspended ? '#dc2626' : s.seal_level === 'Premium' ? '#F47E2F' : '#2E3192'
            return (
              <Card key={i} hover style={{ borderRadius:14, padding:'16px 20px', marginBottom:10, opacity: isSuspended ? 0.85 : 1 }}>
                <div style={{ display:'flex', alignItems:'center', gap:16 }}>
                  <div style={{ width:44, height:44, borderRadius:10, background:`${sealColor}18`, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:18, color:sealColor, flexShrink:0 }}>
                    {s.razao_social?.[0]}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                      <span style={{ fontSize:14, fontWeight:700, color:'#1a1c5e', fontFamily:'Montserrat,sans-serif' }}>{s.razao_social}</span>
                      {!isSuspended && (
                        <span style={{ fontSize:10, fontWeight:700, color:sealColor, background:`${sealColor}18`, padding:'2px 8px', borderRadius:20 }}>Selo {s.seal_level||'—'}</span>
                      )}
                      <span style={{ fontSize:10, fontWeight:700, color:isSuspended?'#dc2626':'#22c55e', background:isSuspended?'rgba(239,68,68,.1)':'rgba(34,197,94,.1)', padding:'2px 8px', borderRadius:20 }}>
                        {isSuspended ? 'Suspenso' : 'Ativo'}
                      </span>
                    </div>
                    <div style={{ fontSize:12, color:'#9B9B9B', marginTop:2 }}>
                      {s.cnpj} · {s.city}/{s.state} · Emitido em {s.seal_issued_at?.slice(0,10)||'—'}
                    </div>
                    {isSuspended && s.suspended_reason && (
                      <div style={{ fontSize:11, color:'#dc2626', marginTop:2 }}>Motivo: {s.suspended_reason}</div>
                    )}
                    <div style={{ marginTop:6, width:160 }}>
                      <ScoreBar score={s.seal_score||0}/>
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:8, flexShrink:0 }}>
                    <Button variant="neutral" size="sm" onClick={() => navigate(`/backoffice/analise/${s.id}`)}>
                      Ver Ficha
                    </Button>
                    {isSuspended ? (
                      <Button variant="success" size="sm" onClick={() => openModal('reativar', s)}>
                        ↺ Reativar
                      </Button>
                    ) : (
                      <Button variant="danger" size="sm" onClick={() => openModal('inativar', s)}>
                        Inativar
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            )
          })
      }

      {/* Modal Inativar / Reativar */}
      {modal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'#fff', borderRadius:16, padding:32, maxWidth:480, width:'90%', boxShadow:'0 20px 60px rgba(0,0,0,.2)' }}>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:18, color: modal.type === 'inativar' ? '#dc2626' : '#15803d', marginBottom:8 }}>
              {modal.type === 'inativar' ? 'Inativar Fornecedor' : '↺ Reativar Fornecedor'}
            </div>
            <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#64748b', marginBottom:16 }}>
              {modal.type === 'inativar'
                ? <>Você está inativando <strong>{modal.supplierName}</strong>. O Selo ELOS será suspenso e o fornecedor sairá do marketplace. Informe o motivo:</>
                : <>Você está reativando <strong>{modal.supplierName}</strong>. O Selo ELOS voltará a ficar ativo e o fornecedor reaparecerá no marketplace.</>
              }
            </div>
            {modal.type === 'inativar' && (
              <textarea
                value={motivo} onChange={e => setMotivo(e.target.value)}
                placeholder="Motivo da inativação (obrigatório)..."
                rows={3}
                style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:13, resize:'vertical', boxSizing:'border-box', marginBottom:16 }}
              />
            )}
            <div style={{ display:'flex', gap:8, marginTop: modal.type === 'inativar' ? 0 : 16 }}>
              <Button variant="neutral" full onClick={closeModal}>Cancelar</Button>
              <Button
                variant={modal.type === 'inativar' ? 'danger' : 'success'}
                full
                disabled={processing || (modal.type === 'inativar' && !motivo.trim())}
                onClick={handleConfirm}
              >
                {processing ? '⏳...' : modal.type === 'inativar' ? 'Confirmar Inativação' : 'Confirmar Reativação'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
