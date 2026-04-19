import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { Card, Spinner, PageHeader } from '../../components/ui.jsx'
import { useIsMobile } from '../../hooks/useIsMobile.js'

const fmtDate = (v) => v ? new Date(v).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—'
const fmtCNPJ = (v='') => { const n=String(v).replace(/\D/g,'').padStart(14,'0'); return `${n.slice(0,2)}.${n.slice(2,5)}.${n.slice(5,8)}/${n.slice(8,12)}-${n.slice(12)}` }

export default function BuyerInvitations() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const mobile   = useIsMobile()
  const [invites, setInvites] = useState([])
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState('')

  useEffect(() => {
    if (!user?.buyerId) { setLoading(false); return }
    supabase
      .from('invitations')
      .select('*')
      .eq('buyer_id', user.buyerId)
      .order('created_at', { ascending: false })
      .then(({ data }) => setInvites(data || []))
      .finally(() => setLoading(false))
  }, [user?.buyerId])

  const filtered = invites.filter(i =>
    !search ||
    i.supplier_razao_social?.toLowerCase().includes(search.toLowerCase()) ||
    i.supplier_cnpj?.includes(search.replace(/\D/g,''))
  )

  const statusColor = { SENT:'#2E3192', VIEWED:'#f59e0b', REGISTERED:'#22c55e' }
  const statusLabel = { SENT:'📨 Enviado', VIEWED:'👁 Visualizado', REGISTERED:'✅ Cadastrado' }

  if (loading) return <div style={{display:'flex',justifyContent:'center',alignItems:'center',height:'50vh'}}><Spinner size={48}/></div>

  return (
    <div style={{padding:mobile?'16px':'28px 32px',maxWidth:960,margin:'0 auto'}}>
      <PageHeader title="Convites Enviados" subtitle={`${invites.length} convite${invites.length!==1?'s':''} para o Portal HOC`}/>

      {/* Busca */}
      <div style={{marginBottom:20}}>
        <input value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="🔍  Buscar por razão social ou CNPJ..."
          style={{width:'100%',padding:'10px 16px',borderRadius:10,border:'1px solid #e2e4ef',
            fontFamily:'DM Sans,sans-serif',fontSize:14,outline:'none',boxSizing:'border-box'}}/>
      </div>

      {filtered.length === 0 ? (
        <Card style={{borderRadius:14,padding:48,textAlign:'center'}}>
          <div style={{fontSize:40,marginBottom:16}}>🤝</div>
          <div style={{fontFamily:'Montserrat,sans-serif',fontWeight:700,fontSize:18,color:'#1a1c5e',marginBottom:8}}>
            {invites.length === 0 ? 'Nenhum convite enviado ainda' : 'Nenhum resultado encontrado'}
          </div>
          <div style={{fontSize:14,color:'#9B9B9B',marginBottom:24}}>
            {invites.length === 0 ? 'Acesse o marketplace, encontre um fornecedor e clique em "Enviar Convite".' : 'Tente outro termo de busca.'}
          </div>
          {invites.length === 0 && (
            <button onClick={()=>navigate('/comprador')}
              style={{padding:'12px 28px',borderRadius:10,background:'#2E3192',color:'#fff',fontFamily:'Montserrat,sans-serif',fontWeight:700,fontSize:14,border:'none',cursor:'pointer'}}>
              Ir para o Marketplace
            </button>
          )}
        </Card>
      ) : (
        filtered.map((inv,i) => (
          <Card key={i} style={{borderRadius:14,padding:mobile?'14px':'18px 22px',marginBottom:10}}>
            <div style={{display:'flex',alignItems:'center',gap:16,flexWrap:mobile?'wrap':'nowrap'}}>
              {/* Avatar */}
              <div style={{width:46,height:46,borderRadius:12,background:'rgba(46,49,146,.08)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:800,fontSize:18,color:'#2E3192',flexShrink:0}}>
                {inv.supplier_razao_social?.[0]}
              </div>
              {/* Info */}
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:4}}>
                  <div style={{fontFamily:'Montserrat,sans-serif',fontWeight:700,fontSize:14,color:'#1a1c5e'}}>
                    {inv.supplier_razao_social}
                  </div>
                  <span style={{fontSize:10,fontWeight:700,fontFamily:'Montserrat,sans-serif',padding:'2px 8px',borderRadius:20,
                    color:statusColor[inv.status]||'#9B9B9B',background:`${statusColor[inv.status]||'#9B9B9B'}15`,
                    border:`1px solid ${statusColor[inv.status]||'#9B9B9B'}33`}}>
                    {statusLabel[inv.status]||inv.status}
                  </span>
                </div>
                <div style={{fontSize:12,color:'#9B9B9B',lineHeight:1.6}}>
                  {fmtCNPJ(inv.supplier_cnpj)}
                  {inv.supplier_email && ` · ${inv.supplier_email}`}
                </div>
                <div style={{fontSize:11,color:'#9B9B9B',marginTop:2}}>
                  Enviado em {fmtDate(inv.created_at)}
                </div>
              </div>
              {/* Ação */}
              <button onClick={()=>navigate(`/comprador/fornecedor/${inv.supplier_id}`)}
                style={{padding:'8px 16px',borderRadius:8,background:'rgba(46,49,146,.06)',border:'1px solid rgba(46,49,146,.15)',
                  color:'#2E3192',fontFamily:'Montserrat,sans-serif',fontWeight:700,fontSize:12,cursor:'pointer',flexShrink:0}}>
                Ver Ficha
              </button>
            </div>
          </Card>
        ))
      )}
    </div>
  )
}
