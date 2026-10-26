// Tornar convite subsidiado (patch_159, 26/10) — confirmação compartilhada pela
// tela de Convites do cliente e pela do backoffice. Ao abrir, confere no
// servidor (invitation-subsidize?check=1) se a troca é possível e mostra o
// valor; só nesse sentido e só enquanto o fornecedor não pagou.
import { useEffect, useState } from 'react'
import { invitationsApi } from '../services/api.js'
import { Button, Spinner } from './ui.jsx'

export default function SubsidizeInviteModal({ inv, porEqpi = false, onClose, onDone }) {
  const [info, setInfo] = useState(null)
  const [erro, setErro] = useState('')
  const [busy, setBusy] = useState(true)

  useEffect(() => {
    let vivo = true
    invitationsApi.subsidize(inv.id, { check: true })
      .then(r => { if (vivo) setInfo(r) })
      .catch(e => { if (vivo) setErro(e.message) })
      .finally(() => { if (vivo) setBusy(false) })
    return () => { vivo = false }
  }, [inv.id])

  const confirmar = async () => {
    setBusy(true); setErro('')
    try {
      const r = await invitationsApi.subsidize(inv.id)
      onDone?.(`Convite de ${inv.supplier_razao_social} agora é subsidiado${r.boletoCancelado ? ' — o boleto do fornecedor foi cancelado' : ''}. O fornecedor foi avisado por e-mail.`)
    } catch (e) { setErro(e.message); setBusy(false) }
  }

  const quem = porEqpi ? 'O cliente passa a custear' : 'A sua empresa passa a custear'
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'#fff', borderRadius:20, padding:'24px 28px', width:'100%', maxWidth:480, boxShadow:'0 20px 60px rgba(0,0,0,.2)' }}>
        <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:16, color:'#1a1c5e', marginBottom:6 }}>Tornar convite subsidiado</div>
        <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#374151', marginBottom:12, lineHeight:1.55 }}>
          <strong>{inv.supplier_razao_social}</strong> · {inv.supplier_email}
        </div>
        {busy && !info && !erro && <div style={{ textAlign:'center', padding:20 }}><Spinner size={28}/></div>}
        {info && (
          <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#374151', lineHeight:1.6, marginBottom:14 }}>
            <strong>{quem}</strong> a homologação deste fornecedor
            {info.fluxo ? <> no fluxo <strong>{info.fluxo}</strong></> : ''}, pelo valor subsidiado de{' '}
            <strong>{Number(info.valor).toLocaleString('pt-BR', { style:'currency', currency:'BRL' })}</strong>, cobrado quando o processo entrar em análise.
            <ul style={{ margin:'10px 0 0', paddingLeft:18 }}>
              {info.boleto && <li>O <strong>boleto já emitido</strong> para o fornecedor será <strong>cancelado</strong>.</li>}
              <li>{info.cadastrado ? 'O processo é liberado na hora e o fornecedor já pode enviar os documentos.' : 'Quando o fornecedor se cadastrar, o processo já começa liberado, sem pagamento.'}</li>
              <li>O fornecedor é avisado por e-mail.</li>
              <li><strong>Não é possível desfazer</strong> esta troca.</li>
            </ul>
          </div>
        )}
        {erro && (
          <div style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:10, padding:'10px 14px', marginBottom:14, color:'#b91c1c', fontFamily:'DM Sans,sans-serif', fontSize:13 }}>
            {erro}
          </div>
        )}
        <div style={{ display:'flex', gap:8 }}>
          <Button variant="neutral" full onClick={onClose}>Voltar</Button>
          {info && (
            <Button full disabled={busy} onClick={confirmar}>
              {busy ? 'Salvando…' : porEqpi ? 'Confirmar — cliente custeia' : 'Confirmar — nós custeamos'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
