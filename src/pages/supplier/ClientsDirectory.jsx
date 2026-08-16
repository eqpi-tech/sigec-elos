// Clientes ELOS — vitrine dos clientes da plataforma para o fornecedor
// homologado declarar intenção de prestar serviços (convite reverso).
// O cliente vê essas intenções no relatório "Fornecedores com intenção".
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase.js'
import { Button, Card, Spinner, PageHeader } from '../../components/ui.jsx'

async function callApi(method, body) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch('/.netlify/functions/supplier-interest', {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Erro')
  return data
}

export default function SupplierClientsDirectory() {
  const [clients,   setClients]   = useState([])
  const [interests, setInterests] = useState({})   // client_id → interest
  const [eligible,  setEligible]  = useState(false)
  const [loading,   setLoading]   = useState(true)
  const [acting,    setActing]    = useState(null)  // client_id em ação
  const [modal,     setModal]     = useState(null)  // { client, message }
  const [toast,     setToast]     = useState(null)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 4000)
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { eligible: el, clients: cl, interests: ints } = await callApi('GET')
      setEligible(el)
      setClients(cl)
      const m = {}; ints.forEach(i => { m[i.client_id] = i })
      setInterests(m)
    } catch (e) { showToast('Erro: ' + e.message, 'error') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const declare = async () => {
    if (!modal) return
    setActing(modal.client.id)
    try {
      await callApi('POST', { action: 'declare', clientId: modal.client.id, message: modal.message })
      setInterests(prev => ({ ...prev, [modal.client.id]: { client_id: modal.client.id, status: 'PENDING', message: modal.message } }))
      setModal(null)
      showToast('✅ Intenção registrada! O cliente verá seu interesse.')
    } catch (e) { showToast('Erro: ' + e.message, 'error') }
    finally { setActing(null) }
  }

  const withdraw = async (client) => {
    if (!confirm(`Retirar sua intenção de prestar serviços para ${client.razao_social}?`)) return
    setActing(client.id)
    try {
      await callApi('POST', { action: 'withdraw', clientId: client.id })
      setInterests(prev => { const n = { ...prev }; delete n[client.id]; return n })
      showToast('Intenção retirada.')
    } catch (e) { showToast('Erro: ' + e.message, 'error') }
    finally { setActing(null) }
  }

  if (loading) return <div style={{ display:'flex', justifyContent:'center', alignItems:'center', height:'50vh' }}><Spinner size={48}/></div>

  const interestedCount = Object.values(interests).filter(i => i.status === 'PENDING').length

  return (
    <div style={{ padding:'28px 32px', maxWidth:1000, margin:'0 auto' }}>
      {toast && (
        <div style={{ position:'fixed', top:80, right:24, background:toast.type==='error'?'#ef4444':'#22c55e', color:'#fff', padding:'12px 20px', borderRadius:12, zIndex:9999, fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, boxShadow:'0 8px 24px rgba(0,0,0,.2)', maxWidth:360 }}>
          {toast.msg}
        </div>
      )}

      <PageHeader
        title="Clientes ELOS"
        subtitle={`Empresas contratantes da plataforma · ${interestedCount} intenç${interestedCount === 1 ? 'ão' : 'ões'} declarada${interestedCount === 1 ? '' : 's'}`}
      />

      {!eligible && (
        <Card style={{ borderRadius:14, padding:'16px 20px', marginBottom:20, background:'#fffbeb', border:'1px solid #fde68a' }}>
          <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13.5, color:'#92400e', lineHeight:1.6 }}>
            🔒 <strong>Declarar intenção de prestação de serviços é exclusivo para fornecedores homologados.</strong> Conclua
            uma homologação (ou mantenha um selo ativo) para se apresentar diretamente aos clientes da plataforma.
          </div>
        </Card>
      )}

      {eligible && (
        <Card style={{ borderRadius:14, padding:'14px 20px', marginBottom:20, background:'rgba(46,49,146,.04)', border:'1px solid rgba(46,49,146,.1)' }}>
          <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#1a1c5e', lineHeight:1.6 }}>
            💡 Identificou sinergia com algum cliente? Declare sua intenção de prestar serviços — a empresa verá
            seu perfil no relatório de interessados e poderá enviar convite de homologação, contato ou cotação.
          </div>
        </Card>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:14 }}>
        {clients.map(c => {
          const interest = interests[c.id]
          const declared = interest?.status === 'PENDING'
          const accent = c.accent_color || '#2E3192'
          return (
            <Card key={c.id} style={{ borderRadius:14, padding:'18px 20px', display:'flex', flexDirection:'column', gap:12, border: declared ? `1.5px solid ${accent}55` : undefined }}>
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                {c.logo_url ? (
                  <img src={c.logo_url} alt={c.razao_social} style={{ height:38, maxWidth:110, objectFit:'contain' }}/>
                ) : (
                  <div style={{ width:42, height:42, borderRadius:10, background:`${accent}15`, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:17, color:accent, flexShrink:0 }}>
                    {c.razao_social?.[0]}
                  </div>
                )}
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13.5, color:'#1a1c5e', lineHeight:1.25 }}>
                    {c.razao_social}
                  </div>
                  {c.portal_slug && (
                    <a href={`/portal/${c.portal_slug}`} target="_blank" rel="noreferrer"
                      style={{ fontSize:11, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', textDecoration:'none' }}>
                      Ver portal ↗
                    </a>
                  )}
                </div>
              </div>

              {declared ? (
                <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                  <span style={{ flex:1, fontSize:11.5, fontWeight:700, color:'#15803d', background:'rgba(34,197,94,.1)', padding:'6px 12px', borderRadius:8, fontFamily:'Montserrat,sans-serif', textAlign:'center' }}>
                    ✓ Intenção declarada
                  </span>
                  <Button variant="neutral" size="sm" disabled={acting === c.id} onClick={() => withdraw(c)}>
                    {acting === c.id ? <Spinner size={13}/> : 'Retirar'}
                  </Button>
                </div>
              ) : (
                <Button variant="primary" size="sm" full disabled={!eligible || acting === c.id}
                  onClick={() => setModal({ client: c, message: '' })}>
                  🤝 Quero prestar serviços
                </Button>
              )}
            </Card>
          )
        })}
      </div>

      {/* Modal de declaração */}
      {modal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'#fff', borderRadius:16, padding:28, maxWidth:440, width:'100%', boxShadow:'0 20px 60px rgba(0,0,0,.2)' }}>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:16, color:'#1a1c5e', marginBottom:4 }}>
              🤝 Intenção de Prestação de Serviços
            </div>
            <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:12.5, color:'#9B9B9B', marginBottom:16 }}>
              Sua empresa aparecerá no relatório de fornecedores interessados de <strong style={{ color:'#2E3192' }}>{modal.client.razao_social}</strong>.
            </div>
            <div style={{ marginBottom:16 }}>
              <label style={{ display:'block', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:10, color:'#9B9B9B', letterSpacing:.5, textTransform:'uppercase', marginBottom:5 }}>
                Mensagem de apresentação (opcional)
              </label>
              <textarea rows={3} value={modal.message}
                onChange={e => setModal(m => ({ ...m, message: e.target.value }))}
                placeholder="Ex: Somos especializados em manutenção industrial com 15 anos de experiência no setor de mineração..."
                style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:13, resize:'vertical', boxSizing:'border-box' }}/>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <Button variant="neutral" full onClick={() => setModal(null)}>Cancelar</Button>
              <Button variant="primary" full disabled={acting === modal.client.id} onClick={declare}>
                {acting === modal.client.id ? <Spinner size={14}/> : '🤝 Declarar intenção'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
