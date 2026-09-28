// Convites (backoffice · Análise → Convites, 28/09) — todos os convites que os
// clientes enviaram: ver o que foi enviado, reenviar, cancelar (com motivo,
// patch_103), copiar o link para quem diz não ter recebido e abrir o processo
// quando o fornecedor já se cadastrou.
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'
import { invitationsApi } from '../../services/api.js'
import { PageHeader, Card, Button, Spinner, EmptyState } from '../../components/ui.jsx'

const STATUS = {
  SENT:       { label:'Enviado',      color:'#f59e0b' },
  VIEWED:     { label:'Visualizado',  color:'#2563eb' },
  REGISTERED: { label:'Cadastrado',   color:'#22c55e' },
  SUPERSEDED: { label:'Substituído',  color:'#94a3b8' },
  CANCELLED:  { label:'Cancelado',    color:'#9B9B9B' },
}
const FILTROS = ['Todos', 'SENT', 'VIEWED', 'REGISTERED', 'CANCELLED', 'SUPERSEDED']
const POR_PAGINA = 50
const dt = (v) => (v ? new Date(v).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—')
const nomeCliente = (c) => (c?.nome_fantasia && c.nome_fantasia.toLowerCase() !== (c.razao_social || '').toLowerCase()
  ? `${c.nome_fantasia} · ${c.razao_social}` : (c?.razao_social || c?.nome_fantasia || '—'))

export default function BackofficeInvitations() {
  const navigate = useNavigate()
  const [clientes, setClientes] = useState([])
  const [cliente, setCliente]   = useState('')
  const [status, setStatus]     = useState('Todos')
  const [busca, setBusca]       = useState('')
  const [pagina, setPagina]     = useState(0)
  const [lista, setLista]       = useState([])
  const [total, setTotal]       = useState(0)
  const [loading, setLoading]   = useState(true)
  const [msg, setMsg]           = useState({ ok:'', err:'' })
  const [detalhe, setDetalhe]   = useState(null)
  const [cancelando, setCancelando] = useState(null)   // { inv, reason, busy }
  const [ocupado, setOcupado]   = useState(null)

  useEffect(() => {
    supabase.from('clients').select('id, razao_social, nome_fantasia').order('razao_social')
      .then(({ data }) => setClientes(data || []))
  }, [])

  const carregar = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('invitations')
      .select('*, clients(razao_social, nome_fantasia), client_flows(name)', { count:'exact' })
      .not('client_id', 'is', null)
      .order('created_at', { ascending:false })
      .range(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA - 1)
    if (cliente) q = q.eq('client_id', cliente)
    if (status !== 'Todos') q = q.eq('status', status)
    const b = busca.trim()
    if (b) {
      const dig = b.replace(/\D/g, '')
      const txt = b.replace(/[%,()]/g, ' ')
      q = dig.length >= 8
        ? q.ilike('supplier_cnpj', `%${dig}%`)
        : q.or(`supplier_razao_social.ilike.%${txt}%,supplier_email.ilike.%${txt}%`)
    }
    const { data, count, error } = await q
    if (error) setMsg({ ok:'', err: error.message })
    setLista(data || []); setTotal(count || 0); setLoading(false)
  }, [cliente, status, busca, pagina])

  useEffect(() => { carregar() }, [cliente, status, pagina])   // busca: botão/Enter

  const avisar = (ok, err = '') => { setMsg({ ok, err }); if (ok) setTimeout(() => setMsg({ ok:'', err:'' }), 5000) }

  async function reenviar(inv) {
    if (!window.confirm(`Reenviar o convite para ${inv.supplier_email}?`)) return
    setOcupado(inv.id)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      await invitationsApi.resend(inv.id, session?.access_token)
      avisar(`Convite reenviado para ${inv.supplier_email}.`)
      carregar()
    } catch (e) { avisar('', e.message) }
    finally { setOcupado(null) }
  }

  async function cancelar() {
    if (!cancelando?.reason?.trim()) return
    setCancelando(c => ({ ...c, busy:true }))
    try {
      await invitationsApi.cancel(cancelando.inv.id, cancelando.reason.trim())
      avisar(`Convite para ${cancelando.inv.supplier_email} cancelado — o link enviado não vale mais.`)
      setCancelando(null); carregar()
    } catch (e) { avisar('', e.message); setCancelando(c => ({ ...c, busy:false })) }
  }

  async function copiarLink(inv) {
    const link = `${window.location.origin}/cadastro?token=${inv.token}`
    try { await navigator.clipboard.writeText(link); avisar('Link do convite copiado.') }
    catch { window.prompt('Copie o link do convite:', link) }
  }

  const aberto = (s) => ['SENT', 'VIEWED'].includes(s)
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA))
  const inp = { padding:'10px 14px', borderRadius:10, border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#1a1c5e', outline:'none', background:'#fff' }
  const btn = (cor) => ({ fontSize:11, color:cor, background:'none', border:`1px solid ${cor}55`, borderRadius:7, padding:'4px 10px', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600, whiteSpace:'nowrap' })

  return (
    <div style={{ padding:'24px 32px', maxWidth:1100, margin:'0 auto' }}>
      <PageHeader title="Convites" subtitle="Convites enviados pelos clientes — acompanhar, reenviar, cancelar e copiar o link"/>

      <Card style={{ borderRadius:14, padding:'18px 22px', marginBottom:16 }}>
        <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:12 }}>
          <input value={busca} onChange={e => setBusca(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { setPagina(0); carregar() } }}
            placeholder="Fornecedor, CNPJ ou e-mail…" style={{ ...inp, flex:1, minWidth:220 }}/>
          <select value={cliente} onChange={e => { setPagina(0); setCliente(e.target.value) }} style={{ ...inp, minWidth:240 }}>
            <option value="">Todos os clientes</option>
            {clientes.map(c => <option key={c.id} value={c.id}>{nomeCliente(c)}</option>)}
          </select>
          <Button variant="primary" onClick={() => { setPagina(0); carregar() }}>Pesquisar</Button>
        </div>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          {FILTROS.map(f => {
            const cor = STATUS[f]?.color || '#2E3192'; const on = status === f
            return (
              <button key={f} onClick={() => { setPagina(0); setStatus(f) }}
                style={{ padding:'6px 12px', borderRadius:20, border:`1px solid ${on ? cor : '#e2e4ef'}`, background: on ? `${cor}12` : '#fff', color: on ? cor : '#9B9B9B', fontFamily:'DM Sans,sans-serif', fontSize:12, fontWeight:600, cursor:'pointer' }}>
                {f === 'Todos' ? 'Todos' : STATUS[f].label}
              </button>
            )
          })}
        </div>
      </Card>

      {msg.ok && <div style={{ background:'#dcfce7', border:'1px solid #86efac', borderRadius:10, padding:'10px 14px', marginBottom:12, fontSize:13, color:'#15803d' }}>{msg.ok}</div>}
      {msg.err && <div style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:10, padding:'10px 14px', marginBottom:12, fontSize:13, color:'#dc2626' }}>{msg.err}</div>}

      {loading ? (
        <div style={{ display:'flex', justifyContent:'center', padding:60 }}><Spinner size={40}/></div>
      ) : lista.length === 0 ? (
        <EmptyState icon="✉️" title="Nenhum convite encontrado" subtitle="Ajuste os filtros ou a busca"/>
      ) : (
        <>
          <div style={{ fontSize:12, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', marginBottom:10 }}>
            {total} convite{total !== 1 ? 's' : ''}{paginas > 1 ? ` · página ${pagina + 1} de ${paginas}` : ''}
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {lista.map(inv => {
              const st = STATUS[inv.status] || { label: inv.status, color:'#9B9B9B' }
              return (
                <Card key={inv.id} style={{ borderRadius:12, padding:'14px 18px', opacity: ['CANCELLED', 'SUPERSEDED'].includes(inv.status) ? 0.75 : 1 }}>
                  <div style={{ display:'flex', gap:14, alignItems:'flex-start' }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                        <span style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, color:'#1a1c5e' }}>{inv.supplier_razao_social || '(sem razão social)'}</span>
                        <span style={{ fontSize:10, fontWeight:700, color:st.color, background:`${st.color}18`, padding:'2px 8px', borderRadius:20 }}>{st.label}</span>
                        {inv.subsidiado && <span style={{ fontSize:10, fontWeight:700, color:'#065f46', background:'#d1fae5', padding:'2px 8px', borderRadius:20 }}>SUBSIDIADO</span>}
                        {inv.objetivo === 'contato' && <span style={{ fontSize:10, fontWeight:700, color:'#6b7280', background:'#f3f4f6', padding:'2px 8px', borderRadius:20 }}>CONTATO</span>}
                      </div>
                      <div style={{ fontSize:12, color:'#6b7280', fontFamily:'DM Sans,sans-serif', marginTop:3 }}>
                        {inv.supplier_cnpj ? `CNPJ ${inv.supplier_cnpj} · ` : ''}{inv.supplier_email}
                      </div>
                      <div style={{ fontSize:11.5, color:'#2E3192', fontFamily:'DM Sans,sans-serif', fontWeight:600, marginTop:3 }}>
                        🏢 {nomeCliente(inv.clients)}{inv.client_flows?.name ? ` · ${inv.client_flows.name}` : ''}
                      </div>
                      <div style={{ fontSize:11, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', marginTop:3 }}>
                        Enviado {dt(inv.created_at)}{inv.buyer_email ? ` por ${inv.buyer_email}` : ''}
                        {inv.viewed_at ? ` · visualizado ${dt(inv.viewed_at)}` : ''}
                        {inv.reminder_count ? ` · ${inv.reminder_count} lembrete(s)` : ''}
                        {inv.status === 'CANCELLED' && ` · cancelado ${dt(inv.cancelled_at)}${inv.cancel_reason ? ` — ${inv.cancel_reason}` : ''}`}
                      </div>
                    </div>
                    <div style={{ display:'flex', gap:6, flexWrap:'wrap', justifyContent:'flex-end', maxWidth:330 }}>
                      <button onClick={() => setDetalhe(inv)} style={btn('#2E3192')}>Detalhes</button>
                      {aberto(inv.status) && <button onClick={() => copiarLink(inv)} style={btn('#2E3192')}>Copiar link</button>}
                      {aberto(inv.status) && <button disabled={ocupado === inv.id} onClick={() => reenviar(inv)} style={btn('#2E3192')}>{ocupado === inv.id ? 'Enviando…' : 'Reenviar'}</button>}
                      {aberto(inv.status) && <button onClick={() => setCancelando({ inv, reason:'', busy:false })} style={btn('#b91c1c')}>Cancelar</button>}
                      {inv.supplier_id && <button onClick={() => navigate(`/backoffice/analise/${inv.supplier_id}`)} style={btn('#15803d')}>Ver processo →</button>}
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
          {paginas > 1 && (
            <div style={{ display:'flex', gap:8, justifyContent:'center', marginTop:16 }}>
              <Button variant="neutral" size="sm" disabled={pagina === 0} onClick={() => setPagina(p => p - 1)}>← Anterior</Button>
              <Button variant="neutral" size="sm" disabled={pagina + 1 >= paginas} onClick={() => setPagina(p => p + 1)}>Próxima →</Button>
            </div>
          )}
        </>
      )}

      {detalhe && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'#fff', borderRadius:20, padding:'24px 28px', width:'100%', maxWidth:600, maxHeight:'90vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,.2)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
              <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:16, color:'#1a1c5e' }}>{detalhe.supplier_razao_social}</div>
              <button onClick={() => setDetalhe(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'#9B9B9B', fontSize:20, lineHeight:1 }}>✕</button>
            </div>
            <table style={{ width:'100%', fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#374151', borderCollapse:'collapse' }}>
              <tbody>
                {[
                  ['Situação', STATUS[detalhe.status]?.label || detalhe.status],
                  ['CNPJ', detalhe.supplier_cnpj || '—'],
                  ['E-mail convidado', detalhe.supplier_email],
                  ['Contato / telefone', [detalhe.contato, detalhe.telefone].filter(Boolean).join(' · ') || '—'],
                  ['Cliente', nomeCliente(detalhe.clients)],
                  ['Fluxo', detalhe.client_flows?.name || '—'],
                  ['Subsidiado', detalhe.subsidiado ? 'Sim' : 'Não'],
                  ['Tipo / escopo', [detalhe.tipo_fornecedor, detalhe.escopo].filter(Boolean).join(' · ') || '—'],
                  ['Objetivo', detalhe.objetivo === 'contato' ? 'Contato' : 'Homologação'],
                  ['Enviado por', `${detalhe.buyer_email || '—'} (${detalhe.buyer_name || '—'})`],
                  ['Enviado em', dt(detalhe.created_at)],
                  ['Visualizado em', dt(detalhe.viewed_at)],
                  ['Lembretes', `${detalhe.reminder_count || 0}${detalhe.last_reminder_at ? ` · último ${dt(detalhe.last_reminder_at)}` : ''}`],
                  ...(detalhe.status === 'CANCELLED' ? [['Cancelado', `${dt(detalhe.cancelled_at)} — ${detalhe.cancel_reason || 'sem motivo'}`]] : []),
                ].map(([k, v]) => (
                  <tr key={k}><td style={{ padding:'5px 12px 5px 0', color:'#9B9B9B', whiteSpace:'nowrap', verticalAlign:'top' }}>{k}</td><td style={{ padding:'5px 0' }}>{v}</td></tr>
                ))}
              </tbody>
            </table>
            {detalhe.message && (
              <>
                <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:11, color:'#9B9B9B', letterSpacing:.5, textTransform:'uppercase', margin:'14px 0 6px' }}>Mensagem enviada</div>
                <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:10, padding:'12px 14px', fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#374151', whiteSpace:'pre-wrap', lineHeight:1.5 }}>{detalhe.message}</div>
              </>
            )}
          </div>
        </div>
      )}

      {cancelando && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'#fff', borderRadius:20, padding:'24px 28px', width:'100%', maxWidth:460, boxShadow:'0 20px 60px rgba(0,0,0,.2)' }}>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:16, color:'#1a1c5e', marginBottom:6 }}>Cancelar convite</div>
            <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#374151', marginBottom:12, lineHeight:1.5 }}>
              <strong>{cancelando.inv.supplier_razao_social}</strong> · {cancelando.inv.supplier_email}<br/>
              O link enviado deixa de funcionar. O convite continua na lista como <strong>cancelado</strong>, para rastreabilidade.
            </div>
            <textarea value={cancelando.reason} onChange={e => setCancelando(c => ({ ...c, reason:e.target.value }))} rows={3} autoFocus
              placeholder="Motivo (obrigatório)"
              style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:13, boxSizing:'border-box', resize:'vertical', marginBottom:14 }}/>
            <div style={{ display:'flex', gap:8 }}>
              <Button variant="neutral" full onClick={() => setCancelando(null)}>Voltar</Button>
              <Button variant="danger" full disabled={cancelando.busy || !cancelando.reason.trim()} onClick={cancelar}>
                {cancelando.busy ? 'Cancelando…' : 'Cancelar convite'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
