// DocHistoryModal — histórico de um documento (versões, aprovações,
// reprovações, validades). Componente ÚNICO usado pela ficha do processo e
// pela fila de análise — antes existia só no processo (paridade 25/09).
//
// Props: doc ({ supplier_id, type, label }) · onClose()
import { useState, useEffect } from 'react'
import { documentApi } from '../services/api.js'
import { Button, Spinner } from './ui.jsx'

const EV_LABEL = { CREATED:'Registrado', UPLOADED:'Novo arquivo', APPROVED:'Aprovado', REJECTED:'Rejeitado', REVOKED:'Revogado', EXPIRED:'Vencido', UPDATED:'Atualizado' }
const EV_COLOR = { CREATED:'#64748b', UPLOADED:'#2E3192', APPROVED:'#22c55e', REJECTED:'#ef4444', REVOKED:'#f59e0b', EXPIRED:'#ef4444', UPDATED:'#64748b' }

export default function DocHistoryModal({ doc, onClose }) {
  const [entries, setEntries] = useState(null)

  useEffect(() => {
    let alive = true
    documentApi.getHistory(doc.supplier_id, doc.type)
      .then(rows => { if (alive) setEntries(rows || []) })
      .catch(() => { if (alive) setEntries([]) })
    return () => { alive = false }
  }, [doc.supplier_id, doc.type])

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:1100, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background:'#fff', borderRadius:16, padding:28, maxWidth:560, width:'100%', boxShadow:'0 20px 60px rgba(0,0,0,.2)', maxHeight:'85vh', overflowY:'auto' }}>
        <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:16, color:'#1a1c5e', marginBottom:2 }}>
          🕓 Histórico do Documento
        </div>
        <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:12, color:'#9B9B9B', marginBottom:16 }}>
          {doc.label}
        </div>

        {entries === null ? (
          <div style={{ display:'flex', justifyContent:'center', padding:30 }}><Spinner size={28}/></div>
        ) : entries.length === 0 ? (
          <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#9B9B9B', padding:'16px 0' }}>
            Sem eventos registrados. O histórico passa a ser gravado a partir do patch_029.
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:16 }}>
            {entries.map(h => (
              <div key={h.id} style={{ borderLeft:`3px solid ${EV_COLOR[h.event]||'#64748b'}`, background:'#f8f9fd', borderRadius:'0 8px 8px 0', padding:'8px 12px' }}>
                <div style={{ display:'flex', alignItems:'baseline', gap:8, flexWrap:'wrap' }}>
                  <span style={{ fontSize:11, fontWeight:700, color:EV_COLOR[h.event]||'#64748b', fontFamily:'Montserrat,sans-serif' }}>
                    {EV_LABEL[h.event] || h.event}
                  </span>
                  <span style={{ flex:1 }}/>
                  <span style={{ fontSize:11, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>
                    {new Date(h.created_at).toLocaleString('pt-BR')}
                  </span>
                </div>
                <div style={{ fontSize:11.5, color:'#64748b', fontFamily:'DM Sans,sans-serif', marginTop:2 }}>
                  {h.expires_at ? `Validade: ${new Date(h.expires_at).toLocaleDateString('pt-BR')}` : 'Sem validade definida'}
                  {h.inscription_number ? ` · Inscrição: ${h.inscription_number}` : ''}
                  {h.review_note ? ` · ${h.review_note}` : ''}
                </div>
              </div>
            ))}
          </div>
        )}
        <Button variant="neutral" full onClick={onClose}>Fechar</Button>
      </div>
    </div>
  )
}
