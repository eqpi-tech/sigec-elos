import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { cnpjApi, paymentsApi } from '../../services/api.js'
import { supabase } from '../../lib/supabase.js'
import { Button, Spinner } from '../../components/ui.jsx'

const PLAN_PRICES = { Simples: [290,390,490,590], Premium: [990,1290,1690,2190] }
const CNAE_OPTS   = ['Até 3', '4 a 10', '11 a 15', '16+']
const CNAE_COUNTS = [3, 10, 15, 16]

const STEPS = ['Empresa','Conta','Plano','Pagamento']

export default function SupplierOnboarding() {
  const navigate = useNavigate()
  const { signup, reloadProfile } = useAuth()

  const [step, setStep]           = useState(0)
  const [cnpj, setCnpj]           = useState('')
  const [cnpjData, setCnpjData]   = useState(null)
  const [sanctions, setSanctions] = useState(null)
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupError, setLookupError]     = useState('')

  const [name, setName]       = useState('')
  const [email, setEmail]     = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')

  const [planType, setPlanType]   = useState('Simples')
  const [cnaeIdx, setCnaeIdx]     = useState(0)

  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const formatCnpj = (v) => {
    const d = v.replace(/\D/g,'').slice(0,14)
    return d.replace(/^(\d{2})(\d)/,'$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/,'$1.$2.$3').replace(/\.(\d{3})(\d)/,'.$1/$2').replace(/(\d{4})(\d)/,'$1-$2')
  }

  const [sanctionsConfirm, setSanctionsConfirm] = useState(false)

  const handleCnpjLookup = async () => {
    setLookupLoading(true); setLookupError(''); setSanctionsConfirm(false)
    try {
      const result = await cnpjApi.lookup(cnpj)
      setCnpjData(result.cnpj)
      setSanctions(result.sanctions)

      const inactive = result.cnpj?.descricao_situacao_cadastral &&
        result.cnpj.descricao_situacao_cadastral !== 'ATIVA'

      if (inactive) {
        setLookupError(`⚠️  Situação cadastral: ${result.cnpj.descricao_situacao_cadastral}. Regularize o CNPJ antes de prosseguir.`)
        return // bloqueia — não pode prosseguir com CNPJ inativo
      }

      if (result.hasSanctions) {
        // Não avança automaticamente — exige confirmação do usuário
        setLookupError('⚠️  Este CNPJ consta em listas de sanções (CEIS/CNEP). A homologação poderá ser negada pelo backoffice.')
        setSanctionsConfirm(true) // mostra botões de confirmação
        return
      }

      setStep(1) // CNPJ limpo — avança normalmente
    } catch (err) {
      setLookupError(err.message)
    } finally { setLookupLoading(false) }
  }

  const handleCreateAccount = async () => {
    if (password !== password2) { setError('As senhas não coincidem'); return }
    if (password.length < 8)    { setError('Senha deve ter pelo menos 8 caracteres'); return }
    setStep(2); setError('')
  }

  const handlePayment = async () => {
    setLoading(true); setError('')
    try {
      // 1. Cria conta no Supabase Auth
      const authUser = await signup({ email, password, role: 'SUPPLIER', name })

      // 2. Aguarda sessão ser estabelecida (pode levar alguns ms após signUp)
      let sessionToken = null
      for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 400))
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.access_token) { sessionToken = session.access_token; break }
      }

      if (!sessionToken) {
        throw new Error('Sessão não iniciada. Certifique-se de que "Confirm email" está desativado no Supabase → Authentication → Settings.')
      }

      // 3. Cria fornecedor via Netlify Function (service_role bypassa RLS)
      const res = await fetch('/.netlify/functions/create-supplier', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          cnpj:              cnpj.replace(/\D/g,''),
          razao_social:      cnpjData?.razao_social || name,
          nome_fantasia:     cnpjData?.nome_fantasia || null,
          cnae_main:         cnpjData?.cnae_fiscal_descricao || '',
          cnae_list:         cnpjData?.cnaes_secundarios?.map(c => c.codigo) || [],
          state:             cnpjData?.uf || '',
          city:              cnpjData?.municipio || '',
          phone:             cnpjData?.ddd_telefone_1 || null,
          employee_range:    cnpjData?.porte ? cnpjData.porte : null,
          sanctions_checked: true,
          sanctions_result:  sanctions,
          // Dados completos para cnpj_consultations (histórico e backoffice)
          cnpj_full_data:    cnpjData || null,
        }),
      })

      const resData = await res.json()
      if (!res.ok) throw new Error(resData.error || 'Erro ao criar fornecedor')
      const supplier = resData.supplier

      // 4. Redireciona para Stripe Checkout
      const priceYearly = PLAN_PRICES[planType][cnaeIdx]
      const { url } = await paymentsApi.createCheckout({
        planType, cnaeCount: CNAE_COUNTS[cnaeIdx],
        supplierId: supplier.id,
        userEmail:  email,
        priceYearly,
      })

      window.location.href = url

    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  const price    = PLAN_PRICES[planType][cnaeIdx]
  const monthly  = Math.ceil(price/12)

  const inputStyle = { width:'100%', padding:'12px 14px', borderRadius:10, border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#1a1c5e', boxSizing:'border-box', transition:'all .15s' }
  const labelStyle = { display:'block', fontFamily:'Montserrat,sans-serif', fontWeight:600, fontSize:11, color:'#1a1c5e', letterSpacing:.5, marginBottom:6, textTransform:'uppercase' }

  return (
    <div style={{ minHeight:'100vh', background:'linear-gradient(160deg,#1a1c5e,#2E3192 50%,#1a1c5e)', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ width:'100%', maxWidth:520 }}>

        {/* Header */}
        <div style={{ textAlign:'center', marginBottom:28 }}>
          <img src="/logo.png" alt="SIGEC-ELOS" style={{ height:56, objectFit:'contain', marginBottom:12 }} />
          <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:20, color:'#fff' }}>Cadastro de Fornecedor</div>
          <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:14, color:'rgba(255,255,255,.55)', marginTop:4 }}>
            Já tem conta? <a href="/login" style={{ color:'#F47E2F', fontWeight:700 }}>Fazer login →</a>
          </div>
        </div>

        {/* Steps */}
        <div style={{ display:'flex', gap:0, marginBottom:24 }}>
          {STEPS.map((s,i) => (
            <div key={i} style={{ flex:1, display:'flex', alignItems:'center' }}>
              <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center' }}>
                <div style={{ width:32, height:32, borderRadius:'50%', background:i<=step?'#F47E2F':'rgba(255,255,255,.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:i<step?16:12, fontWeight:700, color:'#fff', fontFamily:'Montserrat,sans-serif', transition:'all .3s' }}>
                  {i < step ? '✓' : i+1}
                </div>
                <div style={{ fontSize:10, color:i===step?'#F47E2F':'rgba(255,255,255,.4)', fontFamily:'Montserrat,sans-serif', fontWeight:600, marginTop:4 }}>{s}</div>
              </div>
              {i < STEPS.length-1 && <div style={{ flex:1, height:2, background:i<step?'#F47E2F':'rgba(255,255,255,.15)', margin:'0 0 16px', transition:'background .3s' }} />}
            </div>
          ))}
        </div>

        {/* Card */}
        <div style={{ background:'#fff', borderRadius:20, padding:28, boxShadow:'0 24px 80px rgba(0,0,0,.3)' }}>

          {/* Step 0 — CNPJ */}
          {step === 0 && (
            <div>
              <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:18, color:'#1a1c5e', marginBottom:6 }}>Qual é o CNPJ da sua empresa?</div>
              <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#9B9B9B', marginBottom:20 }}>Preencheremos os dados automaticamente via Receita Federal.</div>
              <label style={labelStyle}>CNPJ</label>
              <input value={cnpj} onChange={e => setCnpj(formatCnpj(e.target.value))} placeholder="00.000.000/0001-00"
                style={{ ...inputStyle, fontSize:20, fontWeight:700, fontFamily:'Montserrat,sans-serif', letterSpacing:1 }} />
              {lookupError && (
                <div style={{ background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:10, padding:'10px 14px', marginTop:12, fontSize:13, color:'#c2410c' }}>{lookupError}</div>
              )}
              {sanctionsConfirm ? (
                <div style={{ marginTop:16 }}>
                  <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, color:'#92400e', marginBottom:12 }}>
                    Deseja prosseguir mesmo com restrições cadastrais?
                  </div>
                  <div style={{ display:'flex', gap:8 }}>
                    <Button variant="neutral" full onClick={() => { setSanctionsConfirm(false); setLookupError(''); setCnpjData(null) }}>
                      ← Usar outro CNPJ
                    </Button>
                    <Button variant="orange" full onClick={() => setStep(1)}>
                      Prosseguir mesmo assim →
                    </Button>
                  </div>
                </div>
              ) : (
                <Button variant="orange" full size="lg" style={{ borderRadius:12, marginTop:20 }}
                  disabled={cnpj.replace(/\D/g,'').length !== 14 || lookupLoading}
                  onClick={handleCnpjLookup}>
                  {lookupLoading ? <><Spinner size={16} /> Consultando...</> : 'Consultar CNPJ →'}
                </Button>
              )}
            </div>
          )}

          {/* Step 1 — Conta */}
          {step === 1 && (
            <div>
              <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:18, color:'#1a1c5e', marginBottom:6 }}>Crie sua conta</div>

              {/* CNPJ confirmed */}
              {cnpjData && (
                <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:12, padding:'12px 16px', marginBottom:20 }}>
                  <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, color:'#15803d', marginBottom:4 }}>✅ Empresa encontrada</div>
                  <div style={{ fontSize:13, color:'#1a1c5e' }}><strong>{cnpjData.razao_social}</strong></div>
                  <div style={{ fontSize:12, color:'#9B9B9B' }}>{cnpjData.municipio} · {cnpjData.uf} · Situação: {cnpjData.descricao_situacao_cadastral}</div>
                  {sanctions?.ceis?.length > 0 && (
                    <div style={{ marginTop:6, fontSize:12, color:'#dc2626' }}>⚠️ Consta em listas de sanções — análise especial necessária</div>
                  )}
                </div>
              )}

              <div style={{ marginBottom:16 }}>
                <label style={labelStyle}>Seu nome completo</label>
                <input value={name} onChange={e=>setName(e.target.value)} placeholder="João da Silva" style={inputStyle} />
              </div>
              <div style={{ marginBottom:16 }}>
                <label style={labelStyle}>E-mail corporativo</label>
                <input value={email} onChange={e=>setEmail(e.target.value)} type="email" placeholder="joao@empresa.com.br" style={inputStyle} />
              </div>
              <div style={{ marginBottom:16 }}>
                <label style={labelStyle}>Senha (mín. 8 caracteres)</label>
                <input value={password} onChange={e=>setPassword(e.target.value)} type="password" placeholder="••••••••" style={inputStyle} />
              </div>
              <div style={{ marginBottom:20 }}>
                <label style={labelStyle}>Confirmar senha</label>
                <input value={password2} onChange={e=>setPassword2(e.target.value)} type="password" placeholder="••••••••" style={inputStyle} />
              </div>
              {error && <div style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:10, padding:'10px 14px', marginBottom:12, fontSize:13, color:'#dc2626' }}>{error}</div>}
              <div style={{ display:'flex', gap:8 }}>
                <Button variant="neutral" full onClick={() => setStep(0)}>← Voltar</Button>
                <Button variant="orange" full size="lg" style={{ borderRadius:12 }}
                  disabled={!name || !email || !password || !password2}
                  onClick={handleCreateAccount}>
                  Próximo →
                </Button>
              </div>
            </div>
          )}

          {/* Step 2 — Plano */}
          {step === 2 && (
            <div>
              <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:18, color:'#1a1c5e', marginBottom:16 }}>Escolha seu plano</div>
              <div style={{ marginBottom:16 }}>
                <label style={labelStyle}>Quantidade de CNAEs</label>
                <div style={{ display:'flex', gap:6 }}>
                  {CNAE_OPTS.map((opt,i) => (
                    <button key={i} onClick={() => setCnaeIdx(i)} style={{ flex:1, padding:'8px 4px', borderRadius:8, border:`1px solid ${cnaeIdx===i?'#2E3192':'#e2e4ef'}`, background:cnaeIdx===i?'rgba(46,49,146,.08)':'#fff', color:cnaeIdx===i?'#2E3192':'#9B9B9B', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:11, cursor:'pointer' }}>
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:20 }}>
                {['Simples','Premium'].map(pt => (
                  <button key={pt} onClick={() => setPlanType(pt)} style={{ padding:'16px 12px', borderRadius:14, border:`2px solid ${planType===pt?(pt==='Premium'?'#ea580c':'#2E3192'):'#e2e4ef'}`, background:planType===pt?(pt==='Premium'?'rgba(244,126,47,.06)':'rgba(46,49,146,.06)'):'#fff', cursor:'pointer', textAlign:'center', transition:'all .15s' }}>
                    <div style={{ fontSize:22 }}>{pt==='Premium'?'⭐':'🏷️'}</div>
                    <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:14, color:planType===pt?(pt==='Premium'?'#ea580c':'#2E3192'):'#1a1c5e', marginTop:4 }}>{pt}</div>
                    <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:20, color:'#1a1c5e', marginTop:4 }}>
                      R$ {PLAN_PRICES[pt][cnaeIdx].toLocaleString('pt-BR')}
                    </div>
                    <div style={{ fontSize:11, color:'#9B9B9B' }}>/ano</div>
                  </button>
                ))}
              </div>
              <div style={{ background:'rgba(46,49,146,.04)', borderRadius:12, padding:'12px 16px', marginBottom:20, fontSize:13, fontFamily:'DM Sans,sans-serif', color:'#1a1c5e' }}>
                <strong style={{ fontFamily:'Montserrat,sans-serif' }}>{planType}</strong> · {CNAE_OPTS[cnaeIdx]} CNAEs · R$ {price.toLocaleString('pt-BR')}/ano (~R$ {monthly.toLocaleString('pt-BR')}/mês)
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <Button variant="neutral" full onClick={() => setStep(1)}>← Voltar</Button>
                <Button variant="orange" full size="lg" style={{ borderRadius:12 }} onClick={() => setStep(3)}>Ir para pagamento →</Button>
              </div>
            </div>
          )}

          {/* Step 3 — Pagamento */}
          {step === 3 && (
            <div>
              <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:18, color:'#1a1c5e', marginBottom:16 }}>Confirmar e pagar</div>
              <div style={{ background:'rgba(46,49,146,.04)', borderRadius:14, padding:'16px 18px', marginBottom:20 }}>
                {[['Empresa', cnpjData?.razao_social || name], ['CNPJ', cnpj], ['Plano', `${planType} · ${CNAE_OPTS[cnaeIdx]} CNAEs`], ['Valor', `R$ ${price.toLocaleString('pt-BR')}/ano`], ['E-mail', email]].map(([l,v]) => (
                  <div key={l} style={{ display:'flex', justifyContent:'space-between', marginBottom:8, fontSize:13, fontFamily:'DM Sans,sans-serif' }}>
                    <span style={{ color:'#9B9B9B' }}>{l}</span>
                    <span style={{ fontWeight:600, color:'#1a1c5e' }}>{v}</span>
                  </div>
                ))}
              </div>
              {error && <div style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:10, padding:'10px 14px', marginBottom:16, fontSize:13, color:'#dc2626' }}>{error}</div>}
              <Button variant="orange" full size="lg" style={{ borderRadius:12, fontSize:15 }} disabled={loading} onClick={handlePayment}>
                {loading ? <><Spinner size={16} /> Aguarde...</> : '🔐 Pagar com segurança via Stripe →'}
              </Button>
              <div style={{ textAlign:'center', marginTop:12, fontSize:11, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>
                Boleto, PIX ou Cartão de crédito · Parcelamento em até 12x
              </div>
              <button onClick={() => setStep(2)} style={{ background:'none', border:'none', cursor:'pointer', color:'#9B9B9B', fontSize:12, fontFamily:'DM Sans,sans-serif', marginTop:8, display:'block', margin:'8px auto 0' }}>← Alterar plano</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
