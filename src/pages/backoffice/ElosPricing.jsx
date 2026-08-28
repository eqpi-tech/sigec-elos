// Preços ELOS — manutenção dos preços dos planos da plataforma
// (app_settings.elos_prices, patch_056). Antes hardcoded no código.
// ATENÇÃO: as assinaturas Stripe cobram pelo price ID do produto — os
// valores aqui são a exibição no site/onboarding e a base dos pagamentos
// avulsos (homologação por convite sem fluxo). Mantenha-os em sincronia
// com os preços cadastrados no Stripe.
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase.js'
import { Card, Spinner, Button, PageHeader } from '../../components/ui.jsx'

const FIELDS = [
  { key: 'verificado_mensal',    label: 'ELOS Verificado — mensal',    hint: 'Assinatura mensal do fornecedor (Stripe: STRIPE_PRICE_VERIFICADO_MENSAL)' },
  { key: 'verificado_anual',     label: 'ELOS Verificado — anual',     hint: 'Assinatura anual do fornecedor (Stripe: STRIPE_PRICE_VERIFICADO_ANUAL)' },
  { key: 'homologado_anual',     label: 'ELOS Homologado — anual',     hint: 'Também é o preço padrão de fluxos/clientes sem preço definido' },
  { key: 'comprador_pro_mensal', label: 'Comprador Pro — mensal',      hint: 'Assinatura mensal do comprador (Stripe: STRIPE_PRICE_COMPRADOR_PRO_MENSAL)' },
  { key: 'comprador_pro_anual',  label: 'Comprador Pro — anual',       hint: 'Assinatura anual do comprador (Stripe: STRIPE_PRICE_COMPRADOR_PRO_ANUAL)' },
]

const font = { fontFamily: 'DM Sans,sans-serif' }
const lbl  = { display:'block', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:10, color:'#9B9B9B', letterSpacing:.5, textTransform:'uppercase', marginBottom:5 }
const inp  = { width:'100%', padding:'10px 12px', borderRadius:10, border:'1px solid #e2e4ef', ...font, fontSize:14, color:'#1a1c5e', boxSizing:'border-box', outline:'none' }

export default function BackofficeElosPricing() {
  const [prices, setPrices]   = useState(null)
  const [saving, setSaving]   = useState(false)
  const [msg, setMsg]         = useState('')

  useEffect(() => {
    supabase.from('app_settings').select('value').eq('key', 'elos_prices').maybeSingle()
      .then(({ data }) => setPrices(data?.value || {}))
  }, [])

  async function save() {
    setSaving(true); setMsg('')
    try {
      const clean = {}
      for (const f of FIELDS) clean[f.key] = prices[f.key] === '' || prices[f.key] == null ? null : Number(prices[f.key])
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from('app_settings')
        .upsert({ key: 'elos_prices', value: clean, updated_at: new Date().toISOString(), updated_by: user?.id || null })
      if (error) throw error
      setMsg('ok')
    } catch (e) { setMsg('Erro: ' + e.message) }
    finally { setSaving(false) }
  }

  return (
    <div style={{ padding:'24px 32px', maxWidth:640, margin:'0 auto' }}>
      <PageHeader title="Preços ELOS" subtitle="Valores dos planos da plataforma exibidos no site, onboarding e portais"/>

      <div style={{ background:'#fff7ed', border:'1px solid #fde68a', borderRadius:12, padding:'12px 16px', marginBottom:20, ...font, fontSize:13, color:'#92400e', lineHeight:1.6 }}>
        ⚠️ <strong>Stripe:</strong> as assinaturas cobram pelo preço cadastrado no produto Stripe — ao alterar aqui,
        atualize também o Stripe para os valores baterem. Pagamentos avulsos de homologação usam estes valores diretamente.
      </div>

      {msg === 'ok' && (
        <div style={{ background:'#f0fdf4', border:'1px solid #86efac', borderRadius:10, padding:'10px 16px', marginBottom:16, color:'#15803d', ...font, fontSize:13 }}>
          ✅ Preços salvos!
        </div>
      )}
      {msg && msg !== 'ok' && (
        <div style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:10, padding:'10px 16px', marginBottom:16, color:'#dc2626', ...font, fontSize:13 }}>{msg}</div>
      )}

      {!prices ? (
        <div style={{ display:'flex', justifyContent:'center', padding:60 }}><Spinner size={36}/></div>
      ) : (
        <Card style={{ borderRadius:14, padding:24 }}>
          {FIELDS.map(f => (
            <div key={f.key} style={{ marginBottom:16 }}>
              <span style={lbl}>{f.label} (R$)</span>
              <input type="number" min="0" step="0.01" value={prices[f.key] ?? ''}
                onChange={e => setPrices(p => ({ ...p, [f.key]: e.target.value }))}
                style={inp}/>
              <div style={{ ...font, fontSize:11, color:'#9B9B9B', marginTop:3 }}>{f.hint}</div>
            </div>
          ))}
          <Button variant="primary" full disabled={saving} onClick={save}>
            {saving ? <Spinner size={14}/> : '💾 Salvar preços'}
          </Button>
        </Card>
      )}
    </div>
  )
}
