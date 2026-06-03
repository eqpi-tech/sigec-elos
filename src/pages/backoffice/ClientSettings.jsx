import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase.js'
import { Card, Spinner, Button, SectionTitle, PageHeader } from '../../components/ui.jsx'

export default function BackofficeClientSettings() {
  const [clients,  setClients]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [editing,  setEditing]  = useState(null)  // { id, homologation_price, homologation_payer }
  const [saving,   setSaving]   = useState(false)
  const [search,   setSearch]   = useState('')

  useEffect(() => {
    supabase
      .from('clients')
      .select('id, razao_social, cnpj, homologation_price, homologation_payer, created_at')
      .order('razao_social')
      .then(({ data }) => { setClients(data || []); setLoading(false) })
  }, [])

  const filtered = clients.filter(c => {
    const q = search.toLowerCase()
    return !q || c.razao_social?.toLowerCase().includes(q) || c.cnpj?.includes(q)
  })

  async function save() {
    if (!editing) return
    setSaving(true)
    try {
      const { error } = await supabase.from('clients')
        .update({ homologation_price: Number(editing.homologation_price), homologation_payer: editing.homologation_payer })
        .eq('id', editing.id)
      if (error) throw error
      setClients(prev => prev.map(c => c.id === editing.id
        ? { ...c, homologation_price: Number(editing.homologation_price), homologation_payer: editing.homologation_payer }
        : c
      ))
      setEditing(null)
    } catch (e) { alert('Erro: ' + e.message) }
    finally { setSaving(false) }
  }

  const inp = { width:'100%', padding:'10px 12px', borderRadius:10, border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:14, boxSizing:'border-box', outline:'none' }
  const lbl = { display:'block', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:10, color:'#9B9B9B', letterSpacing:.5, textTransform:'uppercase', marginBottom:5 }

  return (
    <div style={{ padding:'24px 32px', maxWidth:960, margin:'0 auto' }}>
      <PageHeader title="Configurações de Clientes"
        subtitle="Preço de homologação por convite e modalidade de pagamento"/>

      {/* Explicação */}
      <div style={{ background:'rgba(46,49,146,.04)', border:'1px solid rgba(46,49,146,.1)', borderRadius:12, padding:'12px 16px', marginBottom:20, fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#1a1c5e', lineHeight:1.6 }}>
        <strong>Como funciona:</strong> Quando um fornecedor aceita um convite deste cliente, o preço definido aqui é cobrado.
        Se <em>Fornecedor paga</em>: o valor é cobrado via Stripe no cadastro.
        Se <em>Cliente subsidia</em>: o fornecedor não paga nada — o acerto é feito fora da plataforma conforme contrato.
      </div>

      {/* Busca */}
      <div style={{ marginBottom:16, position:'relative' }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar cliente por nome ou CNPJ..."
          style={{ ...inp, paddingLeft:36 }}/>
        <span style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'#9B9B9B', pointerEvents:'none' }}>🔍</span>
      </div>

      {loading ? (
        <div style={{ display:'flex', justifyContent:'center', padding:40 }}><Spinner size={32}/></div>
      ) : filtered.length === 0 ? (
        <Card style={{ borderRadius:14, padding:'32px', textAlign:'center' }}>
          <div style={{ color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', fontSize:14 }}>
            {search ? `Nenhum cliente encontrado para "${search}"` : 'Nenhum cliente cadastrado ainda.'}
          </div>
        </Card>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {filtered.map(c => (
            <Card key={c.id} style={{ borderRadius:12, padding:'16px 20px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:16, flexWrap:'wrap' }}>
                <div style={{ flex:1, minWidth:200 }}>
                  <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:14, color:'#1a1c5e' }}>{c.razao_social}</div>
                  <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:12, color:'#9B9B9B', marginTop:2 }}>{c.cnpj || '—'}</div>
                </div>

                <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
                  <div style={{ textAlign:'center' }}>
                    <div style={{ fontSize:10, color:'#9B9B9B', fontFamily:'Montserrat,sans-serif', fontWeight:700, textTransform:'uppercase', letterSpacing:.5, marginBottom:2 }}>Preço convite</div>
                    <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:18, color:'#1a1c5e' }}>
                      R$ {(c.homologation_price ?? 390).toLocaleString('pt-BR', { minimumFractionDigits:0 })}
                    </div>
                  </div>

                  <div style={{ textAlign:'center' }}>
                    <div style={{ fontSize:10, color:'#9B9B9B', fontFamily:'Montserrat,sans-serif', fontWeight:700, textTransform:'uppercase', letterSpacing:.5, marginBottom:2 }}>Modalidade</div>
                    <span style={{
                      fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:20, fontFamily:'Montserrat,sans-serif',
                      color: c.homologation_payer === 'client' ? '#059669' : '#2E3192',
                      background: c.homologation_payer === 'client' ? 'rgba(5,150,105,.1)' : 'rgba(46,49,146,.08)',
                    }}>
                      {c.homologation_payer === 'client' ? '🤝 Subsidiado' : '💳 Fornecedor paga'}
                    </span>
                  </div>

                  <Button variant="neutral" size="sm"
                    onClick={() => setEditing({ id: c.id, homologation_price: c.homologation_price ?? 390, homologation_payer: c.homologation_payer ?? 'supplier' })}>
                    ✏ Editar
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Modal edição */}
      {editing && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'#fff', borderRadius:16, padding:28, maxWidth:420, width:'100%', boxShadow:'0 20px 60px rgba(0,0,0,.2)' }}>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:17, color:'#1a1c5e', marginBottom:6 }}>
              💰 Configurar Preço de Homologação
            </div>
            <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:12, color:'#9B9B9B', marginBottom:20 }}>
              {clients.find(c => c.id === editing.id)?.razao_social}
            </div>

            <div style={{ marginBottom:14 }}>
              <span style={lbl}>Valor cobrado do fornecedor (R$)</span>
              <input type="number" min="0" step="0.01"
                value={editing.homologation_price}
                onChange={e => setEditing(p => ({...p, homologation_price: e.target.value}))}
                style={inp}/>
              <div style={{ fontSize:11, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', marginTop:4 }}>
                Padrão: R$ 390. Aplica-se apenas a fornecedores que chegam via convite deste cliente.
              </div>
            </div>

            <div style={{ marginBottom:20 }}>
              <span style={lbl}>Quem paga a homologação</span>
              <div style={{ display:'flex', gap:8 }}>
                {[
                  ['supplier', '💳 Fornecedor paga', 'O fornecedor é cobrado via Stripe no cadastro'],
                  ['client',   '🤝 Cliente subsidia', 'Fornecedor não paga — acerto feito externamente'],
                ].map(([val, label, desc]) => (
                  <button key={val} onClick={() => setEditing(p => ({...p, homologation_payer: val}))}
                    style={{ flex:1, padding:'10px 8px', borderRadius:10, border:`2px solid ${editing.homologation_payer===val?'#2E3192':'#e2e4ef'}`, background:editing.homologation_payer===val?'rgba(46,49,146,.06)':'#fff', cursor:'pointer', textAlign:'center' }}>
                    <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:12, color:editing.homologation_payer===val?'#2E3192':'#9B9B9B' }}>{label}</div>
                    <div style={{ fontSize:10, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', marginTop:3, lineHeight:1.3 }}>{desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display:'flex', gap:8 }}>
              <Button variant="neutral" full onClick={() => setEditing(null)}>Cancelar</Button>
              <Button variant="primary" full disabled={saving} onClick={save}>
                {saving ? <Spinner size={14}/> : '💾 Salvar'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
