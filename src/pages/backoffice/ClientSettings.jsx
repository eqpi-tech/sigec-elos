import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase.js'
import { invitationsApi } from '../../services/api.js'
import { Card, Spinner, Button, SectionTitle, PageHeader } from '../../components/ui.jsx'

const EMPTY_INVITE = { razao_social:'', cnpj:'', email:'', telefone:'', contato:'', tipo_fornecedor:'servico', subsidiado:false, escopo:'', flow_id:'' }

const fmtBRL = v => `R$ ${Number(v).toFixed(2).replace('.', ',')}`

export default function BackofficeClientSettings() {
  const [clients,  setClients]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [editing,  setEditing]  = useState(null)  // { id, homologation_price, homologation_payer }
  const [saving,   setSaving]   = useState(false)
  const [search,   setSearch]   = useState('')
  const [inviteModal, setInviteModal] = useState(null)  // client object
  const [inviteForm,  setInviteForm]  = useState(EMPTY_INVITE)
  const [inviteSending, setInviteSending] = useState(false)
  const [inviteMsg,   setInviteMsg]   = useState({ ok:'', err:'' })
  const [flowsByClient, setFlowsByClient] = useState({})  // client_id → [fluxos c/ preço]
  const [flowEdits, setFlowEdits] = useState({})          // flow_id → { price, price_subsidized, is_default }

  async function loadFlows() {
    // Fluxos ativos de todos os clientes (paginado — PostgREST corta em 1000)
    const all = []
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase.from('client_flows')
        .select('id, client_id, name, price, price_subsidized, is_default, active')
        .eq('active', true).order('client_id').order('name').range(from, from + 999)
      all.push(...(data || []))
      if (!data || data.length < 1000) break
    }
    const map = {}
    for (const f of all) (map[f.client_id] = map[f.client_id] || []).push(f)
    setFlowsByClient(map)
  }

  useEffect(() => {
    supabase
      .from('clients')
      .select('id, razao_social, cnpj, homologation_price, homologation_payer, created_at')
      .order('razao_social')
      .then(({ data }) => { setClients(data || []); setLoading(false) })
    loadFlows()
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

      // Preços por fluxo (quando o cliente tem fluxos)
      const flows = flowsByClient[editing.id] || []
      const defaultFlowId = Object.entries(flowEdits).find(([, v]) => v.is_default)?.[0]
        || flows.find(f => f.is_default)?.id
      for (const f of flows) {
        const ed = flowEdits[f.id]
        const payload = {
          price:            ed?.price === '' ? null : ed?.price != null ? Number(ed.price) : f.price,
          price_subsidized: ed?.price_subsidized === '' ? null : ed?.price_subsidized != null ? Number(ed.price_subsidized) : f.price_subsidized,
          is_default:       f.id === defaultFlowId,
        }
        // Índice único parcial: desmarca antes de marcar o novo padrão
        if (!payload.is_default && f.is_default) {
          const { error: e1 } = await supabase.from('client_flows').update(payload).eq('id', f.id)
          if (e1) throw e1
        }
      }
      for (const f of flows) {
        const ed = flowEdits[f.id]
        const payload = {
          price:            ed?.price === '' ? null : ed?.price != null ? Number(ed.price) : f.price,
          price_subsidized: ed?.price_subsidized === '' ? null : ed?.price_subsidized != null ? Number(ed.price_subsidized) : f.price_subsidized,
          is_default:       f.id === defaultFlowId,
        }
        if (payload.is_default || !f.is_default) {
          const { error: e2 } = await supabase.from('client_flows').update(payload).eq('id', f.id)
          if (e2) throw e2
        }
      }

      setClients(prev => prev.map(c => c.id === editing.id
        ? { ...c, homologation_price: Number(editing.homologation_price), homologation_payer: editing.homologation_payer }
        : c
      ))
      await loadFlows()
      setFlowEdits({})
      setEditing(null)
    } catch (e) { alert('Erro: ' + e.message) }
    finally { setSaving(false) }
  }

  async function sendInvite(e) {
    e.preventDefault()
    setInviteSending(true); setInviteMsg({ ok:'', err:'' })
    try {
      const { data: { session } } = await supabase.auth.getSession()
      await invitationsApi.send({
        razao_social:    inviteForm.razao_social,
        cnpj:            inviteForm.cnpj.replace(/\D/g,''),
        email:           inviteForm.email,
        telefone:        inviteForm.telefone,
        contato:         inviteForm.contato,
        tipo_fornecedor: inviteForm.tipo_fornecedor,
        subsidiado:      inviteForm.subsidiado,
        escopo:          inviteForm.escopo,
        client_id:       inviteModal.id,
        flow_id:         inviteForm.flow_id || (flowsByClient[inviteModal.id] || []).find(f => f.is_default)?.id || null,
        invited_by_role: 'ADMIN',
      }, session?.access_token)
      setInviteMsg({ ok:`Convite enviado para ${inviteForm.email} em nome de ${inviteModal.razao_social}!`, err:'' })
      setInviteModal(null)
      setInviteForm(EMPTY_INVITE)
    } catch (err) {
      setInviteMsg({ ok:'', err: err.message })
    } finally { setInviteSending(false) }
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

      {inviteMsg.ok && (
        <div style={{ background:'#f0fdf4', border:'1px solid #86efac', borderRadius:10, padding:'10px 16px', marginBottom:16, color:'#15803d', fontFamily:'DM Sans,sans-serif', fontSize:13 }}>
          ✅ {inviteMsg.ok}
        </div>
      )}

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
                  {(flowsByClient[c.id]?.length) ? (
                    <div style={{ display:'flex', gap:6, flexWrap:'wrap', maxWidth:340 }}>
                      {flowsByClient[c.id].map(f => (
                        <span key={f.id} title={f.price_subsidized != null ? `Subsidiado: ${fmtBRL(f.price_subsidized)}` : ''}
                          style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:20, fontFamily:'Montserrat,sans-serif',
                            color: f.is_default ? '#92400e' : '#2E3192',
                            background: f.is_default ? '#fef3c7' : 'rgba(46,49,146,.08)' }}>
                          {f.is_default ? '⭐ ' : ''}{f.name}{f.price != null ? ` ${fmtBRL(f.price)}` : ' (sem preço)'}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div style={{ textAlign:'center' }}>
                      <div style={{ fontSize:10, color:'#9B9B9B', fontFamily:'Montserrat,sans-serif', fontWeight:700, textTransform:'uppercase', letterSpacing:.5, marginBottom:2 }}>Preço convite</div>
                      <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:18, color:'#1a1c5e' }}>
                        R$ {(c.homologation_price ?? 390).toLocaleString('pt-BR', { minimumFractionDigits:0 })}
                      </div>
                    </div>
                  )}

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
                  <Button variant="primary" size="sm"
                    onClick={() => { setInviteForm(EMPTY_INVITE); setInviteMsg({ ok:'', err:'' }); setInviteModal(c) }}>
                    📨 Convidar fornecedor
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

            {(flowsByClient[editing.id]?.length) ? (
              <div style={{ marginBottom:14 }}>
                <span style={lbl}>Preços por fluxo de homologação</span>
                <div style={{ border:'1px solid #e2e4ef', borderRadius:10, overflow:'hidden' }}>
                  <div style={{ display:'grid', gridTemplateColumns:'1.2fr 1fr 1fr 60px', gap:6, padding:'6px 10px', background:'#f8f9fc', fontSize:9, fontFamily:'Montserrat,sans-serif', fontWeight:700, color:'#9B9B9B', textTransform:'uppercase', letterSpacing:.4, alignItems:'center' }}>
                    <span>Fluxo</span><span>Não subsid. (R$)</span><span>Subsidiado (R$)</span><span>Padrão</span>
                  </div>
                  {flowsByClient[editing.id].map(f => {
                    const ed = flowEdits[f.id] || {}
                    return (
                      <div key={f.id} style={{ display:'grid', gridTemplateColumns:'1.2fr 1fr 1fr 60px', gap:6, padding:'6px 10px', borderTop:'1px solid #f1f2f8', alignItems:'center' }}>
                        <span style={{ fontFamily:'DM Sans,sans-serif', fontSize:12.5, fontWeight:700, color:'#1a1c5e' }}>{f.name}</span>
                        <input type="number" min="0" step="0.01"
                          value={ed.price ?? f.price ?? ''}
                          onChange={e => setFlowEdits(p => ({ ...p, [f.id]: { ...p[f.id], price: e.target.value } }))}
                          style={{ ...inp, padding:'6px 8px', fontSize:12.5 }}/>
                        <input type="number" min="0" step="0.01"
                          value={ed.price_subsidized ?? f.price_subsidized ?? ''}
                          onChange={e => setFlowEdits(p => ({ ...p, [f.id]: { ...p[f.id], price_subsidized: e.target.value } }))}
                          style={{ ...inp, padding:'6px 8px', fontSize:12.5 }}/>
                        <input type="radio" name="defaultFlow"
                          checked={Object.entries(flowEdits).some(([, v]) => v.is_default)
                            ? !!flowEdits[f.id]?.is_default
                            : !!f.is_default}
                          onChange={() => setFlowEdits(p => {
                            const n = {}
                            for (const fl of flowsByClient[editing.id]) n[fl.id] = { ...p[fl.id], is_default: fl.id === f.id }
                            return n
                          })}
                          style={{ accentColor:'#2E3192', justifySelf:'center' }}/>
                      </div>
                    )
                  })}
                </div>
                <div style={{ fontSize:11, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', marginTop:4 }}>
                  O preço da homologação SEMPRE vem do fluxo do fornecedor. O ⭐ padrão recebe os espontâneos (portal/LP). O portal exibe o preço não subsidiado.
                </div>
              </div>
            ) : (
              <div style={{ marginBottom:14 }}>
                <span style={lbl}>Valor cobrado do fornecedor (R$)</span>
                <input type="number" min="0" step="0.01"
                  value={editing.homologation_price}
                  onChange={e => setEditing(p => ({...p, homologation_price: e.target.value}))}
                  style={inp}/>
                <div style={{ fontSize:11, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', marginTop:4 }}>
                  Padrão: R$ 390. Este cliente não tem fluxos com preço — crie fluxos em Fluxo de Homologação para preços por nível.
                </div>
              </div>
            )}

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

      {/* Modal convite de fornecedor em nome do cliente */}
      {inviteModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'#fff', borderRadius:16, padding:28, maxWidth:520, width:'100%', boxShadow:'0 20px 60px rgba(0,0,0,.2)', maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:17, color:'#1a1c5e', marginBottom:4 }}>
              📨 Convidar Fornecedor
            </div>
            <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:12, color:'#9B9B9B', marginBottom:18 }}>
              Em nome de <strong style={{ color:'#2E3192' }}>{inviteModal.razao_social}</strong> — o fornecedor recebe o convite e os termos deste cliente.
            </div>

            {inviteMsg.err && (
              <div style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:10, padding:'8px 12px', marginBottom:14, color:'#dc2626', fontFamily:'DM Sans,sans-serif', fontSize:12 }}>
                {inviteMsg.err}
              </div>
            )}

            <form onSubmit={sendInvite}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
                <div style={{ gridColumn:'1 / -1' }}>
                  <span style={lbl}>Razão Social *</span>
                  <input required value={inviteForm.razao_social} onChange={e=>setInviteForm(f=>({...f, razao_social:e.target.value}))} style={inp}/>
                </div>
                <div>
                  <span style={lbl}>E-mail *</span>
                  <input required type="email" value={inviteForm.email} onChange={e=>setInviteForm(f=>({...f, email:e.target.value}))} style={inp}/>
                </div>
                <div>
                  <span style={lbl}>CNPJ</span>
                  <input value={inviteForm.cnpj} onChange={e=>setInviteForm(f=>({...f, cnpj:e.target.value}))} placeholder="00.000.000/0000-00" style={inp}/>
                </div>
                <div>
                  <span style={lbl}>Telefone</span>
                  <input value={inviteForm.telefone} onChange={e=>setInviteForm(f=>({...f, telefone:e.target.value}))} style={inp}/>
                </div>
                <div>
                  <span style={lbl}>Contato (nome)</span>
                  <input value={inviteForm.contato} onChange={e=>setInviteForm(f=>({...f, contato:e.target.value}))} style={inp}/>
                </div>
                <div>
                  <span style={lbl}>Tipo de fornecedor</span>
                  <select value={inviteForm.tipo_fornecedor} onChange={e=>setInviteForm(f=>({...f, tipo_fornecedor:e.target.value}))} style={inp}>
                    <option value="servico">Serviço</option>
                    <option value="produto">Produto</option>
                    <option value="ambos">Ambos</option>
                  </select>
                </div>
                <div>
                  <span style={lbl}>Subsidiado</span>
                  <select value={inviteForm.subsidiado ? 'sim' : 'nao'} onChange={e=>setInviteForm(f=>({...f, subsidiado: e.target.value === 'sim'}))} style={inp}>
                    <option value="nao">Não — fornecedor paga</option>
                    <option value="sim">Sim — cliente subsidia</option>
                  </select>
                </div>
                {(flowsByClient[inviteModal.id]?.length) > 0 && (
                  <div style={{ gridColumn:'1 / -1' }}>
                    <span style={lbl}>Fluxo de homologação</span>
                    <select value={inviteForm.flow_id || (flowsByClient[inviteModal.id] || []).find(f => f.is_default)?.id || ''}
                      onChange={e=>setInviteForm(f=>({...f, flow_id: e.target.value}))} style={inp}>
                      {flowsByClient[inviteModal.id].map(fl => {
                        const price = inviteForm.subsidiado ? (fl.price_subsidized ?? fl.price) : (fl.price ?? fl.price_subsidized)
                        return <option key={fl.id} value={fl.id}>{fl.name}{fl.is_default ? ' (padrão)' : ''}{price != null ? ` — ${fmtBRL(price)}` : ''}</option>
                      })}
                    </select>
                  </div>
                )}
                <div style={{ gridColumn:'1 / -1' }}>
                  <span style={lbl}>Escopo da homologação</span>
                  <textarea rows={2} value={inviteForm.escopo} onChange={e=>setInviteForm(f=>({...f, escopo:e.target.value}))}
                    placeholder="Objetivo da contratação / escopo do fornecimento..."
                    style={{ ...inp, resize:'vertical' }}/>
                </div>
              </div>

              <div style={{ display:'flex', gap:8 }}>
                <Button type="button" variant="neutral" full onClick={() => setInviteModal(null)}>Cancelar</Button>
                <Button type="submit" variant="primary" full disabled={inviteSending}>
                  {inviteSending ? <Spinner size={14}/> : '📨 Enviar convite'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
