import { useState, useEffect } from 'react'
import { Button, Spinner } from '../../components/ui.jsx'

const STEPS = ['Empresa', 'Categorias', 'Conta', 'Termos', 'Plano', 'Pagamento']

const DEMO_CNPJ       = '34.218.904/0001-72'
const DEMO_COMPANY    = { razao_social:'Primatus Serviços Técnicos Ltda', situacao:'ATIVA', municipio:'São Paulo', uf:'SP', cnae:'Manutenção e reparação de equipamentos industriais', fundacao:'2012-03-10' }
const DEMO_CATEGORIES = [
  { id:1, name:'Manutenção Industrial',     checked:true  },
  { id:2, name:'Serviços Elétricos',        checked:true  },
  { id:3, name:'Automação & Controle',      checked:true  },
  { id:4, name:'Construção Civil',          checked:false },
  { id:5, name:'Logística e Transporte',    checked:false },
  { id:6, name:'TI e Telecomunicações',     checked:false },
  { id:7, name:'Segurança do Trabalho',     checked:false },
  { id:8, name:'Gestão Ambiental',          checked:false },
]

const inp = { width:'100%', padding:'12px 14px', borderRadius:10, border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#1a1c5e', boxSizing:'border-box', transition:'all .15s', outline:'none' }
const lbl = { display:'block', fontFamily:'Montserrat,sans-serif', fontWeight:600, fontSize:11, color:'#1a1c5e', letterSpacing:.5, marginBottom:6, textTransform:'uppercase' }

function StepBar({ step }) {
  return (
    <div style={{ display:'flex', gap:0, marginBottom:24 }}>
      {STEPS.map((s, i) => (
        <div key={i} style={{ flex:1, display:'flex', alignItems:'center' }}>
          <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center' }}>
            <div style={{ width:32, height:32, borderRadius:'50%', background:i<=step?'#F47E2F':'rgba(255,255,255,.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:i<step?16:12, fontWeight:700, color:'#fff', fontFamily:'Montserrat,sans-serif', transition:'all .3s' }}>
              {i < step ? '✓' : i+1}
            </div>
            <div style={{ fontSize:10, color:i===step?'#F47E2F':'rgba(255,255,255,.4)', fontFamily:'Montserrat,sans-serif', fontWeight:600, marginTop:4, whiteSpace:'nowrap' }}>{s}</div>
          </div>
          {i < STEPS.length-1 && <div style={{ flex:1, height:2, background:i<step?'#F47E2F':'rgba(255,255,255,.15)', margin:'0 0 16px', transition:'background .3s' }}/>}
        </div>
      ))}
    </div>
  )
}

export default function DemoSupplierOnboarding({ onComplete }) {
  const [step,       setStep]       = useState(0)
  const [cnpj,       setCnpj]       = useState('')
  const [looking,    setLooking]    = useState(false)
  const [cnpjOk,     setCnpjOk]     = useState(false)
  const [cats,       setCats]       = useState(DEMO_CATEGORIES)
  const [planType,   setPlanType]   = useState('homologado')
  const [billing,    setBilling]    = useState('anual')
  const [terms1,     setTerms1]     = useState(false)
  const [terms2,     setTerms2]     = useState(false)
  const [paying,     setPaying]     = useState(false)
  const [done,       setDone]       = useState(false)

  // Form state (pre-filled)
  const [name,  setName]  = useState('Lucas Andrade')
  const [email, setEmail] = useState('lucas@primatus.com.br')
  const [pass,  setPass]  = useState('••••••••')

  const formatCnpj = (v) => {
    const d = v.replace(/\D/g,'').slice(0,14)
    return d.replace(/^(\d{2})(\d)/,'$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/,'$1.$2.$3').replace(/\.(\d{3})(\d)/,'.$1/$2').replace(/(\d{4})(\d)/,'$1-$2')
  }

  const handleConsultar = () => {
    setLooking(true)
    setTimeout(() => { setLooking(false); setCnpjOk(true) }, 900)
  }

  const handlePay = () => {
    setPaying(true)
    setTimeout(() => { setPaying(false); setDone(true) }, 1800)
  }

  const priceMap = { verificado_anual:199, verificado_mensal:29, homologado_anual:690 }
  const isMensal = planType === 'verificado' && billing === 'mensal'
  const priceKey = isMensal ? 'verificado_mensal' : `${planType}_anual`
  const price = priceMap[priceKey]

  const selectedCats = cats.filter(c => c.checked)

  if (done) {
    return (
      <div style={{ minHeight:'100vh', background:'linear-gradient(160deg,#1a1c5e,#2E3192 50%,#1a1c5e)', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
        <div style={{ width:'100%', maxWidth:520 }}>
          <div style={{ textAlign:'center', marginBottom:28 }}>
            <img src="/logo.png" alt="SIGEC-ELOS" style={{ height:56, objectFit:'contain', marginBottom:12 }}/>
          </div>
          <div style={{ background:'#fff', borderRadius:20, padding:40, boxShadow:'0 24px 80px rgba(0,0,0,.3)', textAlign:'center' }}>
            <div style={{ fontSize:64, marginBottom:16 }}>🎉</div>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:22, color:'#15803d', marginBottom:8 }}>Cadastro concluído!</div>
            <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#374151', lineHeight:1.6, marginBottom:8 }}>
              Pagamento confirmado. Seu Selo <strong>{planType === 'homologado' ? 'ELOS Homologado' : 'ELOS Verificado'}</strong> foi ativado.
            </div>
            <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#9B9B9B', marginBottom:28 }}>
              Credenciais de acesso enviadas para <strong>{email}</strong>
            </div>
            <div style={{ background:'#f0fdf4', border:'1px solid #86efac', borderRadius:12, padding:'14px 16px', marginBottom:24, fontSize:13, color:'#166534', fontFamily:'DM Sans,sans-serif' }}>
              ✅ Primatus Serviços Técnicos Ltda agora está visível no marketplace SIGEC-ELOS
            </div>
            <Button variant="orange" full size="lg" style={{ borderRadius:12 }} onClick={onComplete}>
              Ir para o painel →
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight:'100vh', background:'linear-gradient(160deg,#1a1c5e,#2E3192 50%,#1a1c5e)', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ width:'100%', maxWidth:520 }}>

        {/* Header */}
        <div style={{ textAlign:'center', marginBottom:28 }}>
          <img src="/logo.png" alt="SIGEC-ELOS" style={{ height:56, objectFit:'contain', marginBottom:12 }}/>
          <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:20, color:'#fff' }}>Criar conta no SIGEC-ELOS</div>
          <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, color:'rgba(255,255,255,.55)', marginTop:4 }}>
            Já tem conta? <span style={{ color:'#F47E2F', fontWeight:700, cursor:'pointer' }}>Fazer login →</span>
          </div>
        </div>

        {/* Toggle bar */}
        <div style={{ display:'flex', background:'rgba(255,255,255,.1)', borderRadius:14, padding:4, marginBottom:24, gap:4 }}>
          <button style={{ flex:1, padding:'11px 0', borderRadius:10, border:'none', cursor:'default', background:'#fff', color:'#2E3192', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, boxShadow:'0 2px 8px rgba(0,0,0,.15)' }}>
            🏭 Fornecedor
          </button>
          <button style={{ flex:1, padding:'11px 0', borderRadius:10, border:'none', cursor:'default', background:'transparent', color:'rgba(255,255,255,.7)', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13 }}>
            🛒 Comprador
          </button>
        </div>

        <StepBar step={step}/>

        <div style={{ background:'#fff', borderRadius:20, padding:28, boxShadow:'0 24px 80px rgba(0,0,0,.3)' }}>

          {/* ── Step 0: CNPJ ── */}
          {step === 0 && (
            <div>
              <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:18, color:'#1a1c5e', marginBottom:6 }}>Qual é o CNPJ da sua empresa?</div>
              <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#9B9B9B', marginBottom:20 }}>Preencheremos os dados automaticamente via Receita Federal.</div>
              <label style={lbl}>CNPJ</label>
              <input value={cnpj || DEMO_CNPJ} onChange={e => setCnpj(formatCnpj(e.target.value))}
                style={{ ...inp, fontSize:20, fontWeight:700, fontFamily:'Montserrat,sans-serif', letterSpacing:1 }}/>
              {cnpjOk && (
                <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:12, padding:'12px 16px', marginTop:12 }}>
                  <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, color:'#15803d', marginBottom:4 }}>✅ Empresa encontrada na Receita Federal</div>
                  <div style={{ fontSize:13, color:'#1a1c5e' }}><strong>{DEMO_COMPANY.razao_social}</strong></div>
                  <div style={{ fontSize:12, color:'#9B9B9B' }}>{DEMO_COMPANY.municipio} · {DEMO_COMPANY.uf} · Situação: {DEMO_COMPANY.situacao}</div>
                </div>
              )}
              {cnpjOk ? (
                <Button variant="orange" full size="lg" style={{ borderRadius:12, marginTop:20 }} onClick={() => setStep(1)}>Próximo →</Button>
              ) : (
                <Button variant="orange" full size="lg" style={{ borderRadius:12, marginTop:20 }} disabled={looking} onClick={handleConsultar}>
                  {looking ? <><Spinner size={16}/> Consultando...</> : 'Consultar CNPJ →'}
                </Button>
              )}
            </div>
          )}

          {/* ── Step 1: Categorias ── */}
          {step === 1 && (
            <div>
              <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:18, color:'#1a1c5e', marginBottom:6 }}>Em quais categorias você atua?</div>
              <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#9B9B9B', marginBottom:16 }}>Os documentos exigidos serão calculados automaticamente.</div>
              <div style={{ maxHeight:280, overflowY:'auto', paddingRight:4, marginBottom:4 }}>
                {cats.map(c => (
                  <label key={c.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:10, border:`1px solid ${c.checked?'#2E3192':'#e2e4ef'}`, background:c.checked?'rgba(46,49,146,.05)':'#fff', cursor:'pointer', marginBottom:6, transition:'all .15s' }}>
                    <input type="checkbox" checked={c.checked} onChange={e => setCats(prev => prev.map(x => x.id === c.id ? {...x, checked: e.target.checked} : x))} style={{ accentColor:'#2E3192', width:16, height:16 }}/>
                    <span style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#1a1c5e', fontWeight:c.checked?600:400 }}>{c.name}</span>
                  </label>
                ))}
              </div>
              <div style={{ fontSize:12, color:'#9B9B9B', marginBottom:16 }}>{selectedCats.length} categorias selecionadas</div>
              <div style={{ display:'flex', gap:8 }}>
                <Button variant="neutral" full onClick={() => setStep(0)}>← Voltar</Button>
                <Button variant="orange" full size="lg" style={{ borderRadius:12 }} disabled={selectedCats.length === 0} onClick={() => setStep(2)}>Próximo →</Button>
              </div>
            </div>
          )}

          {/* ── Step 2: Conta ── */}
          {step === 2 && (
            <div>
              <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:18, color:'#1a1c5e', marginBottom:6 }}>Crie sua conta</div>
              <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:12, padding:'12px 16px', marginBottom:20 }}>
                <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, color:'#15803d', marginBottom:4 }}>✅ Empresa encontrada</div>
                <div style={{ fontSize:13, color:'#1a1c5e' }}><strong>{DEMO_COMPANY.razao_social}</strong></div>
                <div style={{ fontSize:12, color:'#9B9B9B' }}>{DEMO_COMPANY.municipio} · {DEMO_COMPANY.uf} · Situação: {DEMO_COMPANY.situacao}</div>
              </div>
              <div style={{ marginBottom:14 }}>
                <label style={lbl}>Seu nome completo</label>
                <input value={name} onChange={e => setName(e.target.value)} style={inp}/>
              </div>
              <div style={{ marginBottom:14 }}>
                <label style={lbl}>E-mail corporativo</label>
                <input value={email} onChange={e => setEmail(e.target.value)} type="email" style={inp}/>
              </div>
              <div style={{ marginBottom:14 }}>
                <label style={lbl}>Senha (mín. 8 caracteres)</label>
                <input value={pass} onChange={e => setPass(e.target.value)} type="password" style={inp}/>
              </div>
              <div style={{ marginBottom:20 }}>
                <label style={lbl}>Confirmar senha</label>
                <input value={pass} type="password" style={inp}/>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <Button variant="neutral" full onClick={() => setStep(1)}>← Voltar</Button>
                <Button variant="orange" full size="lg" style={{ borderRadius:12 }} onClick={() => setStep(3)}>Próximo →</Button>
              </div>
            </div>
          )}

          {/* ── Step 3: Termos ── */}
          {step === 3 && (
            <div>
              <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:18, color:'#1a1c5e', marginBottom:6 }}>Termos de Uso</div>
              <div style={{ fontSize:13, color:'#9B9B9B', marginBottom:16 }}>Leia e aceite os termos antes de continuar.</div>
              <div style={{ background:'#f8f9fb', border:'1px solid #e2e4ef', borderRadius:12, padding:'16px', marginBottom:16, maxHeight:200, overflowY:'auto' }}>
                <p style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, color:'#1a1c5e', margin:'0 0 8px' }}>TERMOS DE USO — SIGEC-ELOS</p>
                <p style={{ fontSize:12, color:'#374151', lineHeight:1.6, margin:'0 0 8px' }}>
                  <strong>1. Veracidade das informações:</strong> O Fornecedor declara que todas as informações e documentos enviados são verdadeiros, autênticos e estão dentro da validade.
                </p>
                <p style={{ fontSize:12, color:'#374151', lineHeight:1.6, margin:'0 0 8px' }}>
                  <strong>2. Atualização documental:</strong> O Fornecedor compromete-se a manter seus documentos atualizados, substituindo certidões vencidas no prazo de até 15 dias após o vencimento.
                </p>
                <p style={{ fontSize:12, color:'#374151', lineHeight:1.6, margin:'0 0 8px' }}>
                  <strong>3. Suspensão do Selo:</strong> O descumprimento das obrigações documentais poderá resultar na suspensão ou cancelamento do Selo ELOS, sem direito a reembolso.
                </p>
                <p style={{ fontSize:12, color:'#374151', lineHeight:1.6, margin:'0 0 8px' }}>
                  <strong>4. Responsabilidade:</strong> A EQPI Tech atua como facilitadora do processo de pré-homologação e não se responsabiliza por decisões de contratação.
                </p>
                <p style={{ fontSize:12, color:'#374151', lineHeight:1.6 }}>
                  <strong>5. Foro:</strong> As partes elegem o foro da Comarca de Belo Horizonte/MG.
                </p>
              </div>
              <label style={{ display:'flex', alignItems:'flex-start', gap:10, cursor:'pointer', marginBottom:12, padding:'12px', background:'rgba(46,49,146,.04)', borderRadius:10, border:`1px solid ${terms1?'#2E3192':'#e2e4ef'}` }}>
                <input type="checkbox" checked={terms1} onChange={e => setTerms1(e.target.checked)} style={{ marginTop:2, accentColor:'#2E3192' }}/>
                <span style={{ fontSize:13, color:'#374151', fontFamily:'DM Sans,sans-serif' }}>Li e concordo com os <strong>Termos de Uso</strong> e a <strong>Política de Privacidade</strong> da EQPI Tech.</span>
              </label>
              <label style={{ display:'flex', alignItems:'flex-start', gap:10, cursor:'pointer', marginBottom:20, padding:'12px', background:'rgba(244,126,47,.04)', borderRadius:10, border:`1px solid ${terms2?'#F47E2F':'#e2e4ef'}` }}>
                <input type="checkbox" checked={terms2} onChange={e => setTerms2(e.target.checked)} style={{ marginTop:2, accentColor:'#F47E2F' }}/>
                <span style={{ fontSize:13, color:'#374151', fontFamily:'DM Sans,sans-serif' }}>Autorizo a <strong>publicação dos dados da minha empresa</strong> no marketplace SIGEC-ELOS.</span>
              </label>
              <div style={{ display:'flex', gap:8 }}>
                <Button variant="neutral" full onClick={() => setStep(2)}>← Voltar</Button>
                <Button variant="orange" full size="lg" style={{ borderRadius:12 }} disabled={!terms1 || !terms2} onClick={() => setStep(4)}>
                  Aceitar e Continuar →
                </Button>
              </div>
            </div>
          )}

          {/* ── Step 4: Plano ── */}
          {step === 4 && (
            <div>
              <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:18, color:'#1a1c5e', marginBottom:6 }}>Escolha seu Selo ELOS</div>
              <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#9B9B9B', marginBottom:20 }}>Selecione o nível de homologação desejado.</div>

              {/* Verificado */}
              <button onClick={() => setPlanType('verificado')} style={{ width:'100%', textAlign:'left', padding:'16px', borderRadius:14, border:`2px solid ${planType==='verificado'?'#2E3192':'#e2e4ef'}`, background:planType==='verificado'?'rgba(46,49,146,.05)':'#fff', cursor:'pointer', marginBottom:10, transition:'all .15s' }}>
                <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                  <span style={{ fontSize:28 }}>🔵</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:15, color:'#1a1c5e' }}>ELOS Verificado</div>
                    <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:12, color:'#64748b', marginTop:2 }}>Verificação automática · Vitrine imediata · Perfil Comprador incluso</div>
                  </div>
                  <div style={{ textAlign:'right', flexShrink:0 }}>
                    <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:18, color:'#2E3192' }}>R$ 199<span style={{ fontSize:11, fontWeight:400, color:'#9B9B9B' }}>/ano</span></div>
                    <div style={{ fontSize:11, color:'#64748b' }}>ou R$ 29/mês</div>
                  </div>
                </div>
                {planType === 'verificado' && (
                  <div style={{ display:'flex', gap:8, marginTop:12, paddingTop:12, borderTop:'1px solid rgba(46,49,146,.12)' }}>
                    {[['anual','R$ 199/ano (~R$ 17/mês)'],['mensal','R$ 29/mês']].map(([cycle, label]) => (
                      <button key={cycle} onClick={e => { e.stopPropagation(); setBilling(cycle) }}
                        style={{ flex:1, padding:'8px', borderRadius:10, border:`1.5px solid ${billing===cycle?'#2E3192':'#e2e4ef'}`, background:billing===cycle?'rgba(46,49,146,.08)':'#fff', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontSize:12, color:billing===cycle?'#2E3192':'#9B9B9B', fontWeight:billing===cycle?700:400 }}>
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </button>

              {/* Homologado */}
              <button onClick={() => setPlanType('homologado')} style={{ width:'100%', textAlign:'left', padding:'16px', borderRadius:14, border:`2px solid ${planType==='homologado'?'#F47E2F':'#e2e4ef'}`, background:planType==='homologado'?'rgba(244,126,47,.05)':'#fff', cursor:'pointer', marginBottom:20, transition:'all .15s', position:'relative' }}>
                <div style={{ position:'absolute', top:-12, right:16, background:'linear-gradient(135deg,#F47E2F,#ff9a52)', color:'#fff', fontSize:10, fontWeight:800, padding:'3px 12px', borderRadius:20, fontFamily:'Montserrat,sans-serif' }}>✦ RECOMENDADO</div>
                <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                  <span style={{ fontSize:28 }}>🏅</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:15, color:'#1a1c5e' }}>ELOS Homologado</div>
                    <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:12, color:'#64748b', marginTop:2 }}>Análise humana EQPI · Selo Bronze/Prata/Ouro · Prioridade no marketplace</div>
                  </div>
                  <div style={{ textAlign:'right', flexShrink:0 }}>
                    <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:18, color:'#F47E2F' }}>R$ 690<span style={{ fontSize:11, fontWeight:400, color:'#9B9B9B' }}>/ano</span></div>
                  </div>
                </div>
              </button>

              <div style={{ display:'flex', gap:8 }}>
                <Button variant="neutral" full onClick={() => setStep(3)}>← Voltar</Button>
                <Button variant="orange" full size="lg" style={{ borderRadius:12 }} onClick={() => setStep(5)}>Ir para pagamento →</Button>
              </div>
            </div>
          )}

          {/* ── Step 5: Pagamento ── */}
          {step === 5 && (
            <div>
              <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:18, color:'#1a1c5e', marginBottom:16 }}>Confirmar e pagar</div>
              <div style={{ background:'rgba(46,49,146,.04)', borderRadius:14, padding:'16px 18px', marginBottom:20 }}>
                {[
                  ['Empresa', DEMO_COMPANY.razao_social],
                  ['CNPJ', DEMO_CNPJ],
                  ['Categorias', selectedCats.map(c=>c.name).join(', ')],
                  ['Selo', planType === 'verificado' ? 'ELOS Verificado' : 'ELOS Homologado'],
                  ['Periodicidade', isMensal ? 'Mensal' : 'Anual'],
                  ['Valor', isMensal ? `R$ ${price}/mês` : `R$ ${price.toLocaleString('pt-BR')}/ano`],
                  ['E-mail', email],
                ].map(([l, v]) => (
                  <div key={l} style={{ display:'flex', justifyContent:'space-between', marginBottom:8, fontSize:13, fontFamily:'DM Sans,sans-serif', flexWrap:'wrap', gap:4 }}>
                    <span style={{ color:'#9B9B9B' }}>{l}</span>
                    <span style={{ fontWeight:600, color:'#1a1c5e', textAlign:'right', maxWidth:'60%' }}>{v}</span>
                  </div>
                ))}
              </div>
              <Button variant="orange" full size="lg" style={{ borderRadius:12, fontSize:15 }} disabled={paying} onClick={handlePay}>
                {paying ? <><Spinner size={16}/> Processando pagamento...</> : '🔐 Pagar com segurança via Stripe →'}
              </Button>
              <div style={{ textAlign:'center', marginTop:12, fontSize:11, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>Boleto, PIX ou Cartão de crédito · Parcelamento em até 12x</div>
              <button onClick={() => setStep(4)} style={{ background:'none', border:'none', cursor:'pointer', color:'#9B9B9B', fontSize:12, fontFamily:'DM Sans,sans-serif', marginTop:8, display:'block', margin:'8px auto 0' }}>← Alterar plano</button>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
