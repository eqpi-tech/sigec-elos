// Documentos do processo — o MESMO visual para fornecedor, cliente e backoffice
// (pedido do Luiz, 14/10: ajuda o suporte). Os dados vêm de uma fonte só, a
// RPC process_documents (patch_139): PJ exigido pelo fluxo + mobilização (PF)
// por posto e por pessoa, com os totais. Cada tela só muda as AÇÕES de cada
// linha (renderActions): o fornecedor envia, o backoffice aprova/reprova e o
// cliente visualiza. Para o cliente, nome e CPF das pessoas já chegam
// mascarados do banco.
import { useState } from 'react'
import { Button, StatusDot } from './ui.jsx'

export const DOC_STATUS = {
  VALID:          { bg:'#f8fffe', bd:'#dcfce7', color:'#22c55e', label:'Aprovado' },
  EXPIRING:       { bg:'#fffbeb', bd:'#fef3c7', color:'#f59e0b', label:'Vence em breve' },
  PENDING:        { bg:'#fff7ed', bd:'#fed7aa', color:'#f59e0b', label:'Em análise' },
  MISSING:        { bg:'#fff5f5', bd:'#fee2e2', color:'#ef4444', label:'Não enviado' },
  REJECTED:       { bg:'#fff5f5', bd:'#fee2e2', color:'#ef4444', label:'Reprovado' },
  EXPIRED:        { bg:'#fff5f5', bd:'#fee2e2', color:'#ef4444', label:'Vencido' },
  NOT_APPLICABLE: { bg:'#f8fafc', bd:'#e2e8f0', color:'#64748b', label:'Não se aplica' },
}
const OK = ['VALID', 'EXPIRING', 'NOT_APPLICABLE']
const RESP_LABEL = { cliente: 'Responsabilidade do cliente', interna: 'Captado pela EQPI', eqpi: 'Obtido pela EQPI' }
// Documentos que a EQPI obtém e NUNCA pede ao fornecedor (patch_148 — Inscrição
// Estadual pelo Sintegra; se a fonte falhar, fica com a equipe). Mesma lista de doc_so_eqpi()
export const DOCS_SO_EQPI = ['15']

// VALID que vence em até 30 dias aparece como "Vence em breve" (mesma regra das telas)
export function effectiveStatus(item) {
  const st = item.status || 'MISSING'
  const exp = item.document?.expires_at
  if (st === 'VALID' && exp) {
    const dias = (new Date(exp) - new Date()) / 86400000
    if (dias < 0) return 'EXPIRED'
    if (dias <= 30) return 'EXPIRING'
  }
  return st
}

const fmt = (d) => (d ? new Date(d).toLocaleDateString('pt-BR') : null)
const pill = (cfg) => ({ fontSize:10, fontWeight:700, color:cfg.color, background:`${cfg.color}18`, padding:'1px 7px', borderRadius:20, fontFamily:'Montserrat,sans-serif' })
const sectionTitle = { fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:11, color:'#9B9B9B', textTransform:'uppercase', letterSpacing:.5, margin:'4px 0 8px' }

export function DocRow({ item, ctx, renderActions, renderDetails, onView, canView, onHistory }) {
  const st = effectiveStatus(item)
  const cfg = DOC_STATUS[st] || DOC_STATUS.MISSING
  const d = item.document
  const temArquivo = !!(d?.storage_path || d?.hoc_arquivo_id)
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:10, background:cfg.bg, border:`1px solid ${cfg.bd}`, marginBottom:6, flexWrap:'wrap' }}>
      <StatusDot status={st === 'EXPIRING' ? 'EXPIRING' : st}/>
      <div style={{ flex:1, minWidth:200 }}>
        <div style={{ fontSize:12.5, fontWeight:600, color:'#1a1c5e', fontFamily:'DM Sans,sans-serif' }}>{item.name}</div>
        <div style={{ display:'flex', gap:6, marginTop:3, alignItems:'center', flexWrap:'wrap', fontFamily:'DM Sans,sans-serif' }}>
          <span style={pill(cfg)}>{cfg.label}</span>
          {RESP_LABEL[item.responsibility] && (item.responsibility !== 'interna' || (st !== 'MISSING' && d?.source !== 'MANUAL')) && <span style={{ fontSize:10, color:'#6b7280', background:'#f1f5f9', padding:'1px 7px', borderRadius:20 }}>{RESP_LABEL[item.responsibility]}</span>}
          {(item.auto_collect || d?.source === 'AUTO') && <span style={{ fontSize:10, color:'#2E3192', background:'#eef0ff', padding:'1px 7px', borderRadius:20 }}>⚡ Auto-coletado</span>}
          {d?.submitted_at && <span style={{ fontSize:10, color:'#9B9B9B' }}>enviado {fmt(d.submitted_at)}</span>}
          {d?.expires_at && <span style={{ fontSize:10, color:'#9B9B9B' }}>validade {fmt(d.expires_at)}</span>}
        </div>
        {d?.review_note && ['REJECTED','EXPIRED','PENDING'].includes(st) && <div style={{ fontSize:11, color:'#dc2626', marginTop:3 }}>⚠ {d.review_note}</div>}
        {renderDetails?.(item, ctx)}
      </div>
      {canView && temArquivo && onView && <Button variant="neutral" size="sm" onClick={() => onView(d, item)}>👁 Ver</Button>}
      {onHistory && d && <Button variant="neutral" size="sm" title="Histórico e versões do documento" onClick={() => onHistory(d, item)}>🕓</Button>}
      {renderActions?.(item, { ...ctx, status: st })}
    </div>
  )
}

// Resumo do processo — os MESMOS números nas três visões
export function ProcessDocsSummary({ totals, compact = false }) {
  if (!totals) return null
  const t = totals, pct = t.required ? Math.round((t.valid / t.required) * 100) : 0
  const itens = [
    ['Aprovados', t.valid, '#22c55e'], ['Em análise', t.in_review, '#f59e0b'],
    ['Não enviados', t.missing, '#ef4444'], ['Reprovados', t.rejected, '#ef4444'], ['Vencidos', t.expired, '#ef4444'],
  ].filter(([, v], i) => i < 3 || v > 0)
  return (
    <div style={{ background:'#f8f9fb', border:'1px solid #e2e4ef', borderRadius:12, padding: compact ? '10px 14px' : '14px 18px', marginBottom:14 }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
        <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:14, color: t.complete ? '#15803d' : '#1a1c5e' }}>
          {t.complete ? '✅ Documentação completa' : `${t.valid} de ${t.required} documentos aprovados`}
        </div>
        <div style={{ flex:1, minWidth:120, height:6, borderRadius:6, background:'#e5e7eb', overflow:'hidden' }}>
          <div style={{ width:`${pct}%`, height:'100%', background: t.complete ? '#22c55e' : '#2E3192' }}/>
        </div>
      </div>
      <div style={{ display:'flex', gap:14, marginTop:8, flexWrap:'wrap', fontFamily:'DM Sans,sans-serif', fontSize:12, color:'#374151' }}>
        {itens.map(([l, v, c]) => <span key={l}><strong style={{ color:c }}>{v}</strong> {l.toLowerCase()}</span>)}
        {t.people_shortfall > 0 && <span><strong style={{ color:'#ef4444' }}>{t.people_shortfall}</strong> pessoa{t.people_shortfall > 1 ? 's' : ''} a cadastrar (mobilização)</span>}
      </div>
      {!t.complete && (t.supplier_todo > 0 || t.people_shortfall > 0 || t.client_todo > 0) && (
        <div style={{ marginTop:6, fontFamily:'DM Sans,sans-serif', fontSize:11.5, color:'#6b7280' }}>
          Pendências: {[
            (t.supplier_todo > 0 || t.people_shortfall > 0) && `fornecedor (${t.supplier_todo} doc${t.supplier_todo !== 1 ? 's' : ''}${t.people_shortfall ? `, ${t.people_shortfall} pessoa${t.people_shortfall > 1 ? 's' : ''}` : ''})`,
            t.client_todo > 0 && `cliente (${t.client_todo})`,
          ].filter(Boolean).join(' · ')}
        </div>
      )}
    </div>
  )
}

function PostCard({ post, renderActions, renderDetails, renderPostFooter, renderPersonExtra, onView, canView, onHistory, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen)
  const slots = [...post.post_docs, ...post.people.flatMap(p => p.docs)]
  const ok = slots.filter(s => OK.includes(effectiveStatus(s))).length
  const conforme = post.people_count >= post.qty_people && ok === slots.length
  return (
    <div style={{ border:'1px solid #e2e4ef', borderRadius:14, marginBottom:12, overflow:'hidden' }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ width:'100%', background:'#fafbfe', border:'none', cursor:'pointer', padding:'14px 16px', display:'flex', alignItems:'center', gap:10, textAlign:'left' }}>
        <span style={{ color:'#9B9B9B', fontSize:11, transform: open ? 'rotate(90deg)' : 'none', display:'inline-block', transition:'transform .15s' }}>▶</span>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, color:'#1a1c5e' }}>
            📍 {post.category || 'Posto'} — {post.city}/{post.uf} {post.armado ? '· 🔫 armado' : ''}
          </div>
          <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:11.5, color:'#9B9B9B', marginTop:2 }}>
            {post.funcao ? `${post.funcao} · ` : ''}{post.people_count} de {post.qty_people} pessoa{post.qty_people > 1 ? 's' : ''} cadastrada{post.qty_people > 1 ? 's' : ''}
          </div>
        </div>
        <span style={{ fontSize:10.5, fontWeight:700, fontFamily:'Montserrat,sans-serif', padding:'3px 10px', borderRadius:20,
          color: conforme ? '#15803d' : '#92400e', background: conforme ? '#dcfce7' : '#fef3c7', whiteSpace:'nowrap' }}>
          {conforme ? '✓ Posto conforme' : `${post.people_count}/${post.qty_people} pessoas · ${ok}/${slots.length} docs`}
        </span>
      </button>
      {open && (
        <div style={{ padding:'14px 16px', borderTop:'1px solid #f0f0f5' }}>
          {post.post_docs.length > 0 && <>
            <div style={sectionTitle}>Documentos do posto</div>
            {post.post_docs.map(it => <DocRow key={it.key} item={it} ctx={{ post }} renderActions={renderActions} renderDetails={renderDetails} onView={onView} canView={canView} onHistory={onHistory}/>)}
          </>}
          <div style={{ ...sectionTitle, marginTop:12 }}>Colaboradores ({post.people_count}/{post.qty_people})</div>
          {post.people_count < post.qty_people && (
            <div style={{ fontSize:12, color:'#92400e', background:'#fffbeb', border:'1px solid #fde68a', borderRadius:10, padding:'8px 12px', marginBottom:8, fontFamily:'DM Sans,sans-serif' }}>
              ⚠ {post.qty_people - post.people_count > 1 ? 'Faltam' : 'Falta'} {post.qty_people - post.people_count} pessoa{post.qty_people - post.people_count > 1 ? 's' : ''} a cadastrar neste posto — os documentos de cada pessoa aparecem depois do cadastro.
            </div>
          )}
          {post.people.map(pe => {
            const okP = pe.docs.filter(s => OK.includes(effectiveStatus(s))).length
            return (
              <div key={pe.person_id} style={{ border:'1px solid #f0f0f5', borderRadius:10, padding:'10px 12px', marginBottom:8 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6, flexWrap:'wrap' }}>
                  <span style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:12.5, color:'#1a1c5e' }}>👤 {pe.name}</span>
                  <span style={{ fontSize:11, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>CPF {pe.cpf}</span>
                  <span style={{ marginLeft:'auto', fontSize:10.5, fontWeight:700, color: okP === pe.docs.length ? '#15803d' : '#92400e', fontFamily:'Montserrat,sans-serif' }}>
                    {okP === pe.docs.length ? '✓ completo' : `${okP}/${pe.docs.length} docs`}
                  </span>
                  {renderPersonExtra?.(pe, post)}
                </div>
                {pe.docs.map(it => <DocRow key={it.key} item={it} ctx={{ post, person: pe }} renderActions={renderActions} renderDetails={renderDetails} onView={onView} canView={canView} onHistory={onHistory}/>)}
              </div>
            )
          })}
          {renderPostFooter?.(post)}
        </div>
      )}
    </div>
  )
}

// data = retorno da RPC process_documents
export default function ProcessDocuments({ data, renderActions, renderDetails, renderPostFooter, renderPersonExtra, onView, canView = true, showSummary = true, pjFilter, onHistory }) {
  if (!data) return null
  const pj = pjFilter ? data.pj.filter(pjFilter) : data.pj
  return (
    <div>
      {showSummary && <ProcessDocsSummary totals={data.totals}/>}
      <div style={sectionTitle}>Documentos da empresa (PJ) · {pj.filter(i => !i.extra && OK.includes(effectiveStatus(i))).length}/{pj.filter(i => !i.extra).length} aprovados</div>
      {pj.length === 0 && <div style={{ fontSize:12.5, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', marginBottom:10 }}>Nenhum documento exigido neste processo.</div>}
      {pj.map(it => <DocRow key={it.key} item={it} ctx={{}} renderActions={renderActions} renderDetails={renderDetails} onView={onView} canView={canView} onHistory={onHistory}/>)}
      {data.mobility.length > 0 && <>
        <div style={{ ...sectionTitle, marginTop:18 }}>👷 Mobilização (PF) · {data.mobility.length} posto{data.mobility.length > 1 ? 's' : ''}{data.masked ? ' · dados pessoais mascarados' : ''}</div>
        {data.mobility.map(p => (
          <PostCard key={p.post_id} post={p} renderActions={renderActions} renderDetails={renderDetails} onHistory={onHistory} renderPostFooter={renderPostFooter} renderPersonExtra={renderPersonExtra}
            onView={onView} canView={canView} defaultOpen={data.mobility.length === 1}/>
        ))}
      </>}
    </div>
  )
}
