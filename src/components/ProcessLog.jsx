// Log do processo — o MESMO visual no backoffice e no cliente (15/10, pedido
// dos clientes). Quem chama passa o "fetcher" ({ dateFrom, dateTo, description })
// → linhas do audit_log: o backoffice lê o log inteiro do fornecedor; o cliente,
// pela RPC client_process_log (patch_144), só o do processo DELE.
import { useState, useEffect } from 'react'
import { Button, Spinner } from './ui.jsx'

const lbl = { display:'block',fontSize:11,fontWeight:700,color:'#9B9B9B',fontFamily:'Montserrat,sans-serif',textTransform:'uppercase',letterSpacing:.5,marginBottom:4 }
const inp = { padding:'8px 10px',borderRadius:8,border:'1px solid #e2e4ef',fontFamily:'DM Sans,sans-serif',fontSize:12 }

export default function ProcessLog({ fetcher, note }) {
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded]   = useState(false)
  const [error, setError]     = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo]     = useState('')
  const [description, setDescription] = useState('')

  const load = async () => {
    setLoading(true); setError('')
    try { setRows(await fetcher({ dateFrom, dateTo, description })) }
    catch (e) { setError(e.message || 'Não foi possível carregar o log') }
    finally { setLoading(false); setLoaded(true) }
  }
  useEffect(() => { load() }, [])   // carrega ao abrir a aba

  return (
    <div>
      <div style={{ display:'flex',gap:10,marginBottom:16,flexWrap:'wrap',alignItems:'flex-end' }}>
        <div><label style={lbl}>Data início</label><input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={inp}/></div>
        <div><label style={lbl}>Data fim</label><input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={inp}/></div>
        <div style={{ flex:1,minWidth:160 }}>
          <label style={lbl}>Descrição</label>
          <input value={description} onChange={e=>setDescription(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') load() }}
            placeholder="Filtrar por ação ou descrição..." style={{ ...inp, width:'100%', boxSizing:'border-box' }}/>
        </div>
        <Button variant="primary" size="sm" disabled={loading} onClick={load}>{loading ? <Spinner size={14}/> : '🔍 Pesquisar'}</Button>
      </div>
      {note && <div style={{ fontFamily:'DM Sans,sans-serif',fontSize:11.5,color:'#6b7280',marginBottom:12 }}>{note}</div>}
      {error && <div style={{ fontFamily:'DM Sans,sans-serif',fontSize:12.5,color:'#dc2626',marginBottom:12 }}>{error}</div>}
      {loading ? (
        <div style={{ textAlign:'center',padding:32 }}><Spinner size={32}/></div>
      ) : rows.length === 0 ? (
        <div style={{ textAlign:'center',padding:'32px',color:'#9B9B9B',fontFamily:'DM Sans,sans-serif',fontSize:13 }}>
          {loaded ? 'Nenhum evento encontrado para os filtros aplicados.' : 'Carregando…'}
        </div>
      ) : (
        <div style={{ display:'flex',flexDirection:'column',gap:0 }}>
                    {rows.map((entry,i) => {
                      const ACTION_MAP = {
                        ANALYSIS_STARTED:       { label:'Análise iniciada',       color:'#2E3192', icon:'🔍' },
                        SEAL_APPROVED:          { label:'Homologação aprovada',    color:'#22c55e', icon:'✅' },
                        SEAL_REJECTED:          { label:'Homologação rejeitada',   color:'#ef4444', icon:'❌' },
                        SEAL_REVERTED:          { label:'Análise revertida',       color:'#f59e0b', icon:'↩️' },
                        DOCUMENT_DECISION_REVERTED: { label:'Decisão de documento revertida', color:'#f59e0b', icon:'↩️' },
                        SEAL_AUTO_APPROVED:     { label:'Aprovação automática',    color:'#22c55e', icon:'⚡' },
                        SEAL_AUTO_REJECTED:     { label:'Rejeição automática',     color:'#ef4444', icon:'⚡' },
                        PROCESS_REOPENED:       { label:'Processo reaberto (reenvio)', color:'#2E3192', icon:'↻' },
                        MFA_RESET:              { label:'Verificação em 2 etapas resetada', color:'#f59e0b', icon:'🔐' },
                        DOCUMENT_REPLACED:      { label:'Documento substituído',   color:'#2E3192', icon:'🔄' },
                        DOCUMENT_EXPIRY_CHANGED:{ label:'Vencimento alterado',     color:'#2E3192', icon:'📅' },
                        HOC_LOG:                { label:'Registro HOC',            color:'#64748b', icon:'📜' },
                        DOC_PENDING_REMINDER:   { label:'Lembrete de pendências enviado ao fornecedor', color:'#64748b', icon:'📧' },
                        PAYMENT_PENDING_REMINDER:{ label:'Lembrete de pagamento enviado ao fornecedor', color:'#64748b', icon:'💳' },
                        AUTO_COLLECT_DONE:      { label:'Coleta automática de documentos', color:'#2E3192', icon:'⚡' },
                        PRIORITY_REQUESTED:     { label:'Análise prioritária solicitada', color:'#b45309', icon:'⚡' },
                        SEAL_RENAMED:           { label:'Processo renomeado',      color:'#64748b', icon:'✏️' },
                        INVITATION_SUBSIDIZED:  { label:'Convite passou a ser subsidiado', color:'#065f46', icon:'💰' },
                        INVITATION_SUBSIDY_SCHEDULED: { label:'Subsídio agendado (aguarda o vencimento do boleto)', color:'#92400e', icon:'⏳' },
                        INVITATION_SUBSIDY_VOIDED:    { label:'Subsídio anulado — o fornecedor pagou o boleto', color:'#64748b', icon:'💳' },
                        SUPPLIER_PROFILE_UPDATED:{ label:'Dados cadastrais atualizados', color:'#2E3192', icon:'🏢' },
                        SUPPLIER_PARTNER_ADDED: { label:'Sócio incluído',          color:'#2E3192', icon:'👤' },
                        SUPPLIER_PARTNER_UPDATED:{ label:'Sócio alterado',         color:'#2E3192', icon:'👤' },
                        SUPPLIER_PARTNER_DELETED:{ label:'Sócio removido',         color:'#64748b', icon:'👤' },
                      }
                      const info    = ACTION_MAP[entry.action] || { label: entry.action, color:'#9B9B9B', icon:'📋' }
                      const meta    = entry.metadata || {}
                      const dt      = new Date(entry.created_at)
                      const dateStr = dt.toLocaleDateString('pt-BR') + ' ' + dt.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})
                      let detail    = ''
                      if (meta.reason)       detail = `Motivo: ${meta.reason}`
                      if (meta.score)        detail = `Score: ${meta.score}%`
                      if (meta.level)        detail = (detail ? detail + ' · ' : '') + `Nível: ${meta.level}`
                      if (meta.razao_social) detail = (detail ? detail + ' · ' : '') + meta.razao_social
                      if (meta.label)        detail = (detail ? detail + ' · ' : '') + meta.label
                      // Registros migrados do HOC: descrição original + autor
                      if (meta.descricao)    detail = meta.descricao
                      const autor = meta.autor || null
                      return (
                        <div key={i} style={{ display:'flex',gap:12,padding:'12px 0',borderBottom:i<rows.length-1?'1px solid #f0f2f8':'' }}>
                          <div style={{ width:32,height:32,borderRadius:8,background:`${info.color}15`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,flexShrink:0,marginTop:2 }}>
                            {info.icon}
                          </div>
                          {/* minWidth 0 + overflowWrap: descrição longa do HOC (ex.: DRE) não sai da caixa (05/10) */}
                          <div style={{ flex:1,minWidth:0,overflowWrap:'anywhere' }}>
                            <div style={{ fontFamily:'Montserrat,sans-serif',fontWeight:700,fontSize:13,color:info.color }}>{info.label}</div>
                            {detail && <div style={{ fontFamily:'DM Sans,sans-serif',fontSize:12,color:'#64748b',marginTop:2,whiteSpace:'pre-wrap' }}>{detail}</div>}
                            <div style={{ fontFamily:'DM Sans,sans-serif',fontSize:11,color:'#9B9B9B',marginTop:3 }}>{dateStr}{autor ? ` · por ${autor}` : ''}</div>
                          </div>
                        </div>
                      )
                    })}
        </div>
      )}
    </div>
  )
}
