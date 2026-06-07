import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext.jsx'
import { Card, PageHeader, Spinner } from '../../components/ui.jsx'
import { paymentsApi } from '../../services/api.js'

const FEATURES_FREE = [
  '✅ Acesso ao marketplace de fornecedores',
  '✅ Visualização de perfis completos',
  '✅ Envio de convites de homologação',
  '❌ Solicitar cotações (RFQ)',
  '❌ Comparador de fornecedores',
  '❌ Exportação de relatórios',
]

const FEATURES_PRO = [
  '✅ Tudo do plano Free',
  '✅ Solicitar cotações para múltiplos fornecedores (RFQ)',
  '✅ Comparador de fornecedores lado a lado',
  '✅ Exportação de relatórios CSV',
  '✅ Suporte prioritário',
]

export default function BuyerPlan() {
  const { user, reloadProfile } = useAuth()
  const [cycle,   setCycle]   = useState('anual')
  const [loading, setLoading] = useState(false)

  // Verifica se voltou do Stripe com ativação
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('activated') === 'true') {
      reloadProfile()
      window.history.replaceState({}, '', '/comprador/plano')
    }
  }, [])

  const isPro        = user?.buyerPlan === 'pro'
  const expiresLabel = user?.buyerPlanExpiresAt
    ? new Date(user.buyerPlanExpiresAt).toLocaleDateString('pt-BR')
    : null

  const handleUpgrade = async () => {
    setLoading(true)
    try {
      const planType = cycle === 'mensal' ? 'comprador_pro_mensal' : 'comprador_pro_anual'
      const res = await fetch('/.netlify/functions/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planFor:     'buyer',
          planType,
          buyerUserId: user.id,
          userEmail:   user.email,
        }),
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
      else alert('Erro ao iniciar checkout: ' + (data.error || 'desconhecido'))
    } catch (e) {
      alert('Erro: ' + e.message)
    } finally { setLoading(false) }
  }

  return (
    <div style={{ padding:'28px 32px', maxWidth:860, margin:'0 auto' }}>
      <PageHeader
        title="Meu Plano"
        subtitle={isPro ? 'Comprador Pro ativo' : 'Comprador Free — faça upgrade para desbloquear RFQ e mais'}
      />

      {isPro ? (
        /* ── Plano Pro ativo ─────────────────────────────────────── */
        <Card style={{ borderRadius:16, padding:28, marginBottom:24, border:'2px solid #F47E2F' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:16 }}>
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                <span style={{ fontSize:32 }}>⭐</span>
                <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:22, color:'#F47E2F' }}>
                  Comprador Pro
                </div>
              </div>
              <div style={{ fontSize:14, color:'#9B9B9B', marginBottom:16 }}>
                {expiresLabel ? `Válido até ${expiresLabel}` : 'Plano ativo'}
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {FEATURES_PRO.map((f, i) => (
                  <div key={i} style={{ fontSize:14, color:'#1a1c5e', fontFamily:'DM Sans,sans-serif' }}>{f}</div>
                ))}
              </div>
            </div>
            <div style={{ background:'rgba(244,126,47,.08)', border:'1px solid rgba(244,126,47,.3)', borderRadius:12, padding:'16px 24px', textAlign:'center', minWidth:160 }}>
              <div style={{ fontSize:11, color:'#9B9B9B', fontFamily:'Montserrat,sans-serif', textTransform:'uppercase', letterSpacing:.5, marginBottom:4 }}>Status</div>
              <div style={{ fontSize:16, fontWeight:800, color:'#22c55e', fontFamily:'Montserrat,sans-serif' }}>ATIVO</div>
            </div>
          </div>
        </Card>
      ) : (
        /* ── Plano Free — oferta de upgrade ─────────────────────── */
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, marginBottom:24 }}>

          {/* Card Free */}
          <Card style={{ borderRadius:16, padding:24, border:'2px solid #e2e4ef' }}>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:18, color:'#9B9B9B', marginBottom:4 }}>
              Free
            </div>
            <div style={{ fontSize:26, fontWeight:800, color:'#1a1c5e', fontFamily:'Montserrat,sans-serif', marginBottom:16 }}>
              R$ 0
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:20 }}>
              {FEATURES_FREE.map((f, i) => (
                <div key={i} style={{ fontSize:13, color: f.startsWith('❌') ? '#9B9B9B' : '#1a1c5e', fontFamily:'DM Sans,sans-serif' }}>{f}</div>
              ))}
            </div>
            <div style={{ background:'#f4f5f9', borderRadius:10, padding:'10px 14px', fontSize:12, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', textAlign:'center' }}>
              Plano atual
            </div>
          </Card>

          {/* Card Pro */}
          <Card style={{ borderRadius:16, padding:24, border:'2px solid #F47E2F', background:'linear-gradient(145deg,#fff,#fff9f5)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
              <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:18, color:'#F47E2F' }}>
                ⭐ Pro
              </div>
              <span style={{ fontSize:10, fontWeight:700, background:'#F47E2F', color:'#fff', padding:'3px 10px', borderRadius:20, fontFamily:'Montserrat,sans-serif' }}>
                RECOMENDADO
              </span>
            </div>

            {/* Toggle ciclo */}
            <div style={{ display:'flex', gap:4, marginBottom:12, background:'#f4f5f9', borderRadius:8, padding:3 }}>
              {['anual', 'mensal'].map(c => (
                <button key={c} onClick={() => setCycle(c)}
                  style={{ flex:1, padding:'5px 8px', borderRadius:6, border:'none', cursor:'pointer', fontSize:11, fontWeight:700, fontFamily:'Montserrat,sans-serif', background:cycle===c ? '#F47E2F' : 'transparent', color:cycle===c ? '#fff' : '#9B9B9B', transition:'all .15s' }}>
                  {c === 'anual' ? 'Anual' : 'Mensal'}
                </button>
              ))}
            </div>

            <div style={{ fontSize:28, fontWeight:800, color:'#1a1c5e', fontFamily:'Montserrat,sans-serif', marginBottom:2 }}>
              {cycle === 'anual' ? 'R$ 1.990' : 'R$ 199'}
              <span style={{ fontSize:14, fontWeight:400, color:'#9B9B9B' }}>/{cycle === 'anual' ? 'ano' : 'mês'}</span>
            </div>
            {cycle === 'anual' && (
              <div style={{ fontSize:11, color:'#22c55e', fontWeight:600, marginBottom:12 }}>Economia de R$ 398 vs mensal</div>
            )}

            <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:20 }}>
              {FEATURES_PRO.map((f, i) => (
                <div key={i} style={{ fontSize:13, color:'#1a1c5e', fontFamily:'DM Sans,sans-serif' }}>{f}</div>
              ))}
            </div>

            <button onClick={handleUpgrade} disabled={loading}
              style={{ width:'100%', padding:'13px', borderRadius:10, background:loading ? '#e2e4ef' : 'linear-gradient(135deg,#F47E2F,#e86d1e)', border:'none', color:'#fff', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:14, cursor:loading ? 'not-allowed' : 'pointer', transition:'all .2s' }}>
              {loading ? '⏳ Aguarde...' : `Assinar Pro ${cycle === 'anual' ? 'Anual' : 'Mensal'} →`}
            </button>
          </Card>
        </div>
      )}

      {/* Informativo */}
      <Card style={{ borderRadius:16, padding:20, background:'rgba(46,49,146,.03)', border:'1px solid rgba(46,49,146,.08)' }}>
        <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:14, color:'#1a1c5e', marginBottom:10 }}>
          Dúvidas sobre planos
        </div>
        <div style={{ fontSize:13, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', lineHeight:1.6 }}>
          O plano Free permite navegar pelo marketplace e visualizar todos os fornecedores homologados.
          O plano Pro desbloqueia a funcionalidade de cotação (RFQ), onde você pode solicitar propostas
          de múltiplos fornecedores simultaneamente. Para cancelar a assinatura, acesse o portal do
          cliente no Stripe ou entre em contato com o suporte.
        </div>
      </Card>
    </div>
  )
}
