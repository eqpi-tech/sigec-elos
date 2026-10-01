// Fornecedor · Pagamento (trava de pagamento, 01/10/2026 — patch_112).
// No ELOS o fornecedor só usa o sistema depois do pagamento CONFIRMADO:
// cartão/PIX liberam na hora, boleto só na compensação. Subsidiado (o cliente
// paga) já entra liberado. Até lá ele só acessa esta tela, os planos e a
// Minha Conta (PaymentGate no App.jsx).
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { paymentsApi } from '../../services/api.js'
import { Card, Button, Spinner } from '../../components/ui.jsx'

const M = 'Montserrat,sans-serif'
const D = 'DM Sans,sans-serif'
const nomeProcesso = (s) => s.clients?.nome_fantasia || s.clients?.razao_social || s.seal_name || 'ELOS'

export default function SupplierPayment() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [st, setSt] = useState(null)
  const [verificando, setVerificando] = useState(false)
  const sid = user?.supplierId || user?.supplier_id

  const carregar = useCallback(async () => {
    setVerificando(true)
    try { setSt(await paymentsApi.paymentStatus(sid)) } finally { setVerificando(false) }
  }, [sid])
  useEffect(() => { carregar() }, [carregar])

  if (!st) return <div style={{ padding: 60, textAlign: 'center' }}><Spinner/></div>

  const box = (bg, bd) => ({ background: bg, border: `1px solid ${bd}`, borderRadius: 14, padding: '16px 20px', marginBottom: 16 })
  return (
    <div style={{ padding: '32px', maxWidth: 760, margin: '0 auto' }}>
      <div style={{ fontFamily: M, fontWeight: 900, fontSize: 22, color: '#1a1c5e' }}>Pagamento da homologação</div>
      <div style={{ fontFamily: D, fontSize: 13.5, color: '#64748b', marginBottom: 20 }}>
        A homologação começa depois da confirmação do pagamento: com cartão ou PIX, na hora; com boleto, assim que o banco confirmar a compensação.
      </div>

      {st.released && !st.pendentes.length && (
        <div style={box('#f0fdf4', '#86efac')}>
          <div style={{ fontFamily: M, fontWeight: 800, fontSize: 15, color: '#15803d' }}>✅ Pagamento confirmado</div>
          <div style={{ fontFamily: D, fontSize: 13.5, color: '#166534', margin: '4px 0 12px' }}>Seu acesso está liberado — envie os documentos para o processo entrar em análise.</div>
          <Button variant="primary" onClick={() => navigate('/fornecedor/documentos')}>Enviar documentos →</Button>
        </div>
      )}

      {st.boleto ? (
        <div style={box('#eff6ff', '#bfdbfe')}>
          <div style={{ fontFamily: M, fontWeight: 800, fontSize: 15, color: '#1d4ed8' }}>⏳ Boleto emitido — aguardando compensação</div>
          <div style={{ fontFamily: D, fontSize: 13.5, color: '#1e3a8a', margin: '6px 0 12px', lineHeight: 1.6 }}>
            O boleto foi enviado para o seu e-mail. Assim que o banco confirmar o pagamento (normalmente em até 3 dias úteis), o acesso é liberado automaticamente.
          </div>
          <Button variant="neutral" disabled={verificando} onClick={carregar}>{verificando ? 'Verificando…' : '↻ Já paguei — verificar agora'}</Button>
        </div>
      ) : (!st.released || st.pendentes.length > 0) && (
        <div style={box('#fff7ed', '#fed7aa')}>
          <div style={{ fontFamily: M, fontWeight: 800, fontSize: 15, color: '#c2410c' }}>💳 Falta confirmar o pagamento</div>
          <div style={{ fontFamily: D, fontSize: 13.5, color: '#9a3412', margin: '6px 0 10px', lineHeight: 1.6 }}>
            {st.pendentes.length > 0
              ? <>Aguardando pagamento: {st.pendentes.map(nomeProcesso).join(', ')}. Depois da confirmação você envia os documentos e o processo entra na fila de análise da EQPI.</>
              : 'Escolha o seu plano para iniciar a homologação.'}
          </div>
          <Button variant="orange" onClick={() => navigate('/fornecedor/planos')}>Escolher o plano e pagar →</Button>
        </div>
      )}

      <Card style={{ borderRadius: 14, padding: '14px 20px' }}>
        <div style={{ fontFamily: M, fontWeight: 700, fontSize: 13, color: '#1a1c5e', marginBottom: 6 }}>Como funciona</div>
        <div style={{ fontFamily: D, fontSize: 13, color: '#475569', lineHeight: 1.7 }}>
          💳 Cartão e PIX: acesso liberado assim que o pagamento é aprovado.<br/>
          🧾 Boleto: acesso liberado após a compensação bancária.<br/>
          🏢 Homologação subsidiada pelo cliente: não há pagamento — o acesso é liberado no cadastro.
        </div>
      </Card>
    </div>
  )
}
