import { useState, useEffect } from 'react'
import { useIsMobile } from '../../hooks/useIsMobile.js'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { cnpjApi, paymentsApi, invitationsApi } from '../../services/api.js'
// paymentsApi usado no fluxo não subsidiado (Stripe)
import CategorySelector from '../../components/CategorySelector.jsx'
import { supabase } from '../../lib/supabase.js'
import { Button, Spinner } from '../../components/ui.jsx'

const PLAN_PRICES = { Simples: 290, Premium: 990 }

export default function SupplierOnboarding() {
  const mobile = useIsMobile()
  const navigate = useNavigate()
  const { signup, reloadProfile } = useAuth()

  // Lê token do convite na URL (?token=xxx)
  const inviteToken = new URLSearchParams(window.location.search).get('token')
  const [invitation, setInvitation] = useState(null)
  const isSubsidiado = !!invitation?.subsidiado

  const STEPS = isSubsidiado
    ? ['Empresa','Categorias','Conta','Termos']
    : ['Empresa','Categorias','Conta','Termos','Plano','Pagamento']

  const [step, setStep]           = useState(0)
  const [cnpj, setCnpj]           = useState('')
  const [cnpjData, setCnpjData]   = useState(null)
  const [sanctions, setSanctions] = useState(null)
  const [lookupLoading, setLookupLoading] = useState(false)
  const [selectedCategories, setSelectedCategories] = useState(new Set())
  const [lookupError, setLookupError]     = useState('')

  const [name, setName]       = useState('')
  const [email, setEmail]     = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')

  const [planType, setPlanType]   = useState('Simples')

  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  // Busca convite pelo token e registra visualização
  useEffect(() => {
    if (!inviteToken) return
    invitationsApi.getByToken(inviteToken)
      .then(inv => {
        setInvitation(inv)
        if (inv.supplier_email) setEmail(inv.supplier_email)
      })
      .catch(e => console.warn('invitation lookup:', e.message))
  }, [inviteToken])

  const formatCnpj = (v) => {
    const d = v.replace(/\D/g,'').slice(0,14)
    return d.replace(/^(\d{2})(\d)/,'$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/,'$1.$2.$3').replace(/\.(\d{3})(\d)/,'.$1/$2').replace(/(\d{4})(\d)/,'$1-$2')
  }

  const [sanctionsConfirm, setSanctionsConfirm]   = useState(false)
  const [termsAccepted, setTermsAccepted]         = useState(false)
  const [dataSharingAccepted, setDataSharingAccepted] = useState(false)

  const handleCnpjLookup = async () => {
    setLookupLoading(true); setLookupError(''); setSanctionsConfirm(false)
    try {
      const result = await cnpjApi.lookup(cnpj)
      setCnpjData(result.cnpj)
      setSanctions(result.sanctions)

      // CNPJ não encontrado na Receita Federal
      if (!result.cnpj || !result.cnpj.cnpj) {
        setLookupError('❌  CNPJ não encontrado na Receita Federal. Verifique o número digitado.')
        return
      }

      const situacao = result.cnpj?.descricao_situacao_cadastral || ''
      if (situacao && situacao !== 'ATIVA') {
        setLookupError(`⚠️  Situação cadastral: ${situacao}. Regularize o CNPJ antes de prosseguir.`)
        return
      }

      if (result.hasSanctions) {
        // Pausa o fluxo e exibe os botões de confirmação
        setLookupError('⚠️  Este CNPJ consta em listas de sanções ativas (CEIS/CNEP). A homologação poderá ser negada ou condicionada pelo backoffice.')
        setSanctionsConfirm(true)
        return // não avança automaticamente
      }

      setStep(1) // CNPJ limpo — vai direto para categorias
    } catch (err) {
      setLookupError(err.message)
    } finally { setLookupLoading(false) }
  }

  const handleCreateAccount = async () => {
    if (password !== password2) { setError('As senhas não coincidem'); return }
    if (password.length < 8)    { setError('Senha deve ter pelo menos 8 caracteres'); return }
    setStep(3); setError('') // step 3 = termos
  }

  const handleAcceptTerms = () => {
    if (!termsAccepted || !dataSharingAccepted) {
      setError('Você precisa aceitar os Termos de Uso e a política de compartilhamento para continuar.')
      return
    }
    setError('')
    if (isSubsidiado) {
      handleSubsidiatedRegistration()
    } else {
      setStep(4) // step 4 = plano
    }
  }

  // Cria auth + fornecedor; retorna sessionToken. Compartilhado entre fluxos.
  const createAuthAndSupplier = async () => {
    let authUser = null
    try {
      authUser = await signup({ email, password, role: 'SUPPLIER', name })
    } catch (signupErr) {
      if (signupErr.message?.toLowerCase().includes('already registered') ||
          signupErr.message?.toLowerCase().includes('already been registered') ||
          signupErr.message?.toLowerCase().includes('user already exists')) {
        try {
          const { data: loginData, error: loginErr } = await supabase.auth.signInWithPassword({ email, password })
          if (loginErr) throw new Error('E-mail já cadastrado. Verifique a senha ou use outro e-mail.')
          authUser = loginData.user
        } catch {
          throw new Error('E-mail já cadastrado com outra senha. Use o mesmo e-mail e senha da conta existente, ou use um e-mail diferente.')
        }
      } else {
        throw signupErr
      }
    }

    let sessionToken = null
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 400))
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.access_token) { sessionToken = session.access_token; break }
    }
    if (!sessionToken) throw new Error('Sessão não iniciada. Verifique se "Confirm email" está desativado no Supabase → Authentication → Settings.')

    const res = await fetch('/.netlify/functions/create-supplier', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionToken}` },
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
        sanctions_checked:      true,
        sanctions_result:      sanctions,
        terms_accepted:        true,
        data_sharing_accepted: true,
        cnpj_full_data:    cnpjData || null,
        category_ids:      [...selectedCategories],
        invitation_token:  inviteToken || undefined,
      }),
    })
    const resData = await res.json()
    if (!res.ok) throw new Error(resData.error || 'Erro ao criar fornecedor')
    return { supplier: resData.supplier, sessionToken }
  }

  // Fluxo subsidiado: pula Stripe completamente
  const handleSubsidiatedRegistration = async () => {
    setLoading(true); setError('')
    try {
      const { supplier } = await createAuthAndSupplier()
      await reloadProfile()
      navigate('/fornecedor')
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  const handlePayment = async () => {
    setLoading(true); setError('')
    try {
      const { supplier, sessionToken } = await createAuthAndSupplier()

      // Redireciona para Stripe Checkout
      const priceYearly = PLAN_PRICES[planType]
      const { url } = await paymentsApi.createCheckout({
        planType, cnaeCount: 3,
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

  const price    = PLAN_PRICES[planType]
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
                    <Button variant="orange" full onClick={() => { setSanctionsConfirm(false); setStep(1) }}>
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


          {/* Step 1 — Categorias */}
          {step === 1 && (
            <div>
              <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:18, color:'#1a1c5e', marginBottom:6 }}>Em quais categorias você atua?</div>
              <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#9B9B9B', marginBottom:16 }}>
                Selecione todas as categorias relevantes. Os documentos exigidos serão calculados automaticamente.
              </div>
              <div style={{ maxHeight:340, overflowY:'auto', paddingRight:4 }}>
                <CategorySelector
                  selectedIds={selectedCategories}
                  onChange={setSelectedCategories}
                  showDocuments={true}
                  cnpjData={cnpjData}
                />
              </div>
              <div style={{ display:'flex', gap:8, marginTop:20 }}>
                <Button variant="neutral" full onClick={() => setStep(0)}>← Voltar</Button>
                <Button variant="orange" full size="lg" style={{ borderRadius:12 }}
                  onClick={() => { if (selectedCategories.size===0) { setError('Selecione pelo menos uma categoria'); return }; setError(''); setStep(2) }}>
                  Próximo →
                </Button>
              </div>
              {error && <div style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:10, padding:'10px 14px', marginTop:10, fontSize:13, color:'#dc2626', fontFamily:'DM Sans,sans-serif' }}>{error}</div>}
            </div>
          )}

          {/* Step 2 — Conta */}
          {step === 2 && (
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

          {/* Step 3 — Termos de Uso */}
          {step === 3 && (
            <div>
              <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:18, color:'#1a1c5e', marginBottom:6 }}>Termos de Uso</div>
              <div style={{ fontSize:13, color:'#9B9B9B', marginBottom:16 }}>Leia e aceite os termos antes de continuar</div>

              {isSubsidiado && invitation?.sender_name && (
                <div style={{ background:'#f0fdf4', border:'1px solid #86efac', borderRadius:12, padding:'14px 16px', marginBottom:16 }}>
                  <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, color:'#15803d', marginBottom:4 }}>
                    Homologação Subsidiada
                  </div>
                  <div style={{ fontSize:13, color:'#166534', fontFamily:'DM Sans,sans-serif' }}>
                    O custo desta homologação será assumido por <strong>{invitation.sender_name}</strong>. Você não precisará realizar nenhum pagamento.
                  </div>
                </div>
              )}

              <div style={{ background:'#f8f9fb', border:'1px solid #e2e4ef', borderRadius:12, padding:'16px', marginBottom:16, maxHeight:200, overflowY:'auto' }}>
                <p style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, color:'#1a1c5e', margin:'0 0 8px' }}>TERMOS DE USO — SIGEC-ELOS</p>
                <p style={{ fontSize:12, color:'#374151', lineHeight:1.6, margin:'0 0 8px' }}>
                  Ao utilizar a plataforma SIGEC-ELOS, operada pela EQPI Tech, o Fornecedor concorda com os seguintes termos:
                </p>
                <p style={{ fontSize:12, color:'#374151', lineHeight:1.6, margin:'0 0 8px' }}>
                  <strong>1. Veracidade das informações:</strong> O Fornecedor declara que todas as informações e documentos enviados são verdadeiros, autênticos e estão dentro da validade. A inserção de informações falsas ou documentos adulterados implicará no cancelamento imediato do Selo ELOS e poderá resultar em medidas legais.
                </p>
                <p style={{ fontSize:12, color:'#374151', lineHeight:1.6, margin:'0 0 8px' }}>
                  <strong>2. Atualização documental:</strong> O Fornecedor compromete-se a manter seus documentos atualizados durante toda a vigência do plano, substituindo certidões vencidas no prazo de até 15 dias após o vencimento.
                </p>
                <p style={{ fontSize:12, color:'#374151', lineHeight:1.6, margin:'0 0 8px' }}>
                  <strong>3. Suspensão do Selo:</strong> O descumprimento das obrigações documentais ou a identificação de irregularidades poderá resultar na suspensão ou cancelamento do Selo ELOS, sem direito a reembolso do valor pago.
                </p>
                <p style={{ fontSize:12, color:'#374151', lineHeight:1.6, margin:'0 0 8px' }}>
                  <strong>4. Responsabilidade:</strong> A EQPI Tech atua como facilitadora do processo de pré-homologação e não se responsabiliza por decisões de contratação tomadas pelos Compradores com base nas informações da plataforma.
                </p>
                <p style={{ fontSize:12, color:'#374151', lineHeight:1.6, margin:'0 0 8px' }}>
                  <strong>5. Cancelamento:</strong> O plano pode ser cancelado a qualquer momento, sem reembolso proporcional. O acesso à plataforma permanece ativo até o final do período contratado.
                </p>
                <p style={{ fontSize:12, color:'#374151', lineHeight:1.6 }}>
                  <strong>6. Foro:</strong> As partes elegem o foro da Comarca de Belo Horizonte/MG para dirimir quaisquer controvérsias.
                </p>
              </div>

              <label style={{ display:'flex', alignItems:'flex-start', gap:10, cursor:'pointer', marginBottom:12, padding:'12px', background:'rgba(46,49,146,.04)', borderRadius:10, border:`1px solid ${termsAccepted?'#2E3192':'#e2e4ef'}` }}>
                <input type="checkbox" checked={termsAccepted} onChange={e=>setTermsAccepted(e.target.checked)} style={{ marginTop:2, accentColor:'#2E3192' }}/>
                <span style={{ fontSize:13, color:'#374151' }}>
                  Li e concordo com os <strong>Termos de Uso</strong> da plataforma SIGEC-ELOS e com a <strong>Política de Privacidade</strong> da EQPI Tech.
                </span>
              </label>

              <label style={{ display:'flex', alignItems:'flex-start', gap:10, cursor:'pointer', marginBottom:16, padding:'12px', background:'rgba(244,126,47,.04)', borderRadius:10, border:`1px solid ${dataSharingAccepted?'#F47E2F':'#e2e4ef'}` }}>
                <input type="checkbox" checked={dataSharingAccepted} onChange={e=>setDataSharingAccepted(e.target.checked)} style={{ marginTop:2, accentColor:'#F47E2F' }}/>
                <span style={{ fontSize:13, color:'#374151' }}>
                  Autorizo a <strong>publicação dos dados da minha empresa</strong> (razão social, CNPJ, categorias de atuação e selos conquistados) no marketplace SIGEC-ELOS, tornando-os visíveis para Compradores cadastrados na plataforma.
                </span>
              </label>

              {error && <div style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:10, padding:'10px 14px', marginBottom:12, fontSize:13, color:'#dc2626' }}>{error}</div>}
              <div style={{ display:'flex', gap:8 }}>
                <Button variant="neutral" full onClick={() => { setStep(2); setError('') }}>← Voltar</Button>
                <Button variant="orange" full size="lg" style={{ borderRadius:12 }}
                  disabled={!termsAccepted || !dataSharingAccepted || loading}
                  onClick={handleAcceptTerms}>
                  {loading ? <><Spinner size={16}/> Cadastrando...</> : isSubsidiado ? 'Finalizar Cadastro →' : 'Aceitar e Continuar →'}
                </Button>
              </div>
            </div>
          )}

          {/* Step 4 — Plano */}
          {step === 4 && (
            <div>
              <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:18, color:'#1a1c5e', marginBottom:16 }}>Escolha seu plano</div>

              <div style={{ display:'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr', gap:12, marginBottom:20 }}>
                {['Simples','Premium'].map(pt => (
                  <button key={pt} onClick={() => setPlanType(pt)} style={{ padding:'16px 12px', borderRadius:14, border:`2px solid ${planType===pt?(pt==='Premium'?'#ea580c':'#2E3192'):'#e2e4ef'}`, background:planType===pt?(pt==='Premium'?'rgba(244,126,47,.06)':'rgba(46,49,146,.06)'):'#fff', cursor:'pointer', textAlign:'center', transition:'all .15s' }}>
                    <div style={{ fontSize:22 }}>{pt==='Premium'?'⭐':'🏷️'}</div>
                    <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:14, color:planType===pt?(pt==='Premium'?'#ea580c':'#2E3192'):'#1a1c5e', marginTop:4 }}>{pt}</div>
                    <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:20, color:'#1a1c5e', marginTop:4 }}>
                      R$ {PLAN_PRICES[pt].toLocaleString('pt-BR')}
                    </div>
                    <div style={{ fontSize:11, color:'#9B9B9B' }}>/ano</div>
                  </button>
                ))}
              </div>
              <div style={{ background:'rgba(46,49,146,.04)', borderRadius:12, padding:'12px 16px', marginBottom:20, fontSize:13, fontFamily:'DM Sans,sans-serif', color:'#1a1c5e' }}>
                <strong style={{ fontFamily:'Montserrat,sans-serif' }}>{planType}</strong> · R$ {price.toLocaleString('pt-BR')}/ano (~R$ {monthly.toLocaleString('pt-BR')}/mês)
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <Button variant="neutral" full onClick={() => setStep(3)}>← Voltar</Button>
                <Button variant="orange" full size="lg" style={{ borderRadius:12 }} onClick={() => setStep(5)}>Ir para pagamento →</Button>
              </div>
            </div>
          )}

          {/* Step 5 — Pagamento */}
          {step === 5 && (
            <div>
              <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:18, color:'#1a1c5e', marginBottom:16 }}>Confirmar e pagar</div>
              <div style={{ background:'rgba(46,49,146,.04)', borderRadius:14, padding:'16px 18px', marginBottom:20 }}>
                {[['Empresa', cnpjData?.razao_social || name], ['CNPJ', cnpj], ['Plano', planType], ['Valor', `R$ ${price.toLocaleString('pt-BR')}/ano`], ['E-mail', email]].map(([l,v]) => (
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
              <button onClick={() => setStep(4)} style={{ background:'none', border:'none', cursor:'pointer', color:'#9B9B9B', fontSize:12, fontFamily:'DM Sans,sans-serif', marginTop:8, display:'block', margin:'8px auto 0' }}>← Alterar plano</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
