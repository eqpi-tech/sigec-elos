import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, PageHeader, Spinner } from '../../components/ui.jsx'
import { supabase } from '../../lib/supabase.js'

const STEPS = ['Empresa', 'Precificação', 'Landing Page', 'Revisão']

function slugify(str) {
  return (str || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
}

function formatCnpj(v) {
  const n = v.replace(/\D/g,'').slice(0,14)
  return n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2}).*/, (_,a,b,c,d,e) =>
    e ? `${a}.${b}.${c}/${d}-${e}` : d ? `${a}.${b}.${c}/${d}` : c ? `${a}.${b}.${c}` : b ? `${a}.${b}` : a)
}

export default function BackofficeCreateClient() {
  const navigate  = useNavigate()
  const [step,    setStep]    = useState(0)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [result,  setResult]  = useState(null)

  // Step 1 — Empresa
  const [cnpj,   setCnpj]   = useState('')
  const [razao,  setRazao]  = useState('')
  const [email,  setEmail]  = useState('')
  const [nome,   setNome]   = useState('')
  const [cnpjLoading, setCnpjLoading] = useState(false)

  // Step 2 — Precificação
  const [price,  setPrice]  = useState('390')
  const [payer,  setPayer]  = useState('supplier')

  // Step 3 — Landing Page
  const [slug,      setSlug]      = useState('')
  const [lpName,    setLpName]    = useState('')
  const [accentColor, setAccentColor] = useState('#F47E2F')
  const [desc,      setDesc]      = useState('')
  const [complianceUrl, setComplianceUrl] = useState('')
  const [skipLp,    setSkipLp]    = useState(false)

  const inp  = { width:'100%', padding:'11px 14px', borderRadius:10, border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#1a1c5e', boxSizing:'border-box', outline:'none' }
  const lbl  = { display:'block', fontFamily:'Montserrat,sans-serif', fontWeight:600, fontSize:11, color:'#1a1c5e', letterSpacing:.5, marginBottom:6, textTransform:'uppercase' }
  const frow = { marginBottom:16 }

  async function lookupCnpj() {
    const digits = cnpj.replace(/\D/g,'')
    if (digits.length !== 14) return
    setCnpjLoading(true)
    try {
      const res  = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`)
      const data = await res.json()
      if (data.razao_social) {
        setRazao(data.razao_social)
        const autoSlug = slugify(data.razao_social)
        setSlug(autoSlug)
        setLpName(data.nome_fantasia || data.razao_social)
      }
    } catch {} finally { setCnpjLoading(false) }
  }

  function nextStep() {
    setError('')
    if (step === 0) {
      if (cnpj.replace(/\D/g,'').length !== 14) { setError('CNPJ inválido.'); return }
      if (!razao.trim()) { setError('Informe a razão social.'); return }
      if (!email.trim()) { setError('Informe o e-mail do responsável.'); return }
      if (!nome.trim())  { setError('Informe o nome do responsável.'); return }
      if (!slug) setSlug(slugify(razao))
      if (!lpName) setLpName(razao)
    }
    if (step === 2 && !skipLp && !slug.trim()) { setError('Informe o slug da landing page.'); return }
    setStep(s => s + 1)
  }

  async function handleCreate() {
    setLoading(true); setError('')
    try {
      // 1. Criar usuário + registro clients via função existente
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/.netlify/functions/admin-create-user', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${session.access_token}` },
        body: JSON.stringify({
          email, role: 'CLIENT', name: nome,
          organization: razao, cnpj: cnpj.replace(/\D/g,''),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      // 2. Buscar o client_id recém-criado
      const { data: clientRow } = await supabase
        .from('clients').select('id')
        .eq('cnpj', cnpj.replace(/\D/g,'')).maybeSingle()

      if (clientRow?.id) {
        // 3. Salvar precificação
        await supabase.from('clients').update({
          homologation_price: Number(price) || 390,
          homologation_payer: payer,
        }).eq('id', clientRow.id)

        // 4. Criar landing page (se não pulou)
        if (!skipLp && slug.trim()) {
          await supabase.from('client_landing_pages').upsert({
            client_id:    clientRow.id,
            slug:         slug.trim().toLowerCase(),
            company_name: lpName || razao,
            accent_color: accentColor,
            description:  desc || null,
            compliance_url: complianceUrl || null,
          }, { onConflict: 'client_id' })
        }

        setResult({ password: data.password, clientId: clientRow.id, razao, email, slug: skipLp ? null : slug })
      } else {
        setResult({ password: data.password, clientId: null, razao, email, slug: null })
      }
    } catch (e) {
      setError(e.message)
    } finally { setLoading(false) }
  }

  const StepBar = () => (
    <div style={{ display:'flex', alignItems:'center', gap:0, marginBottom:28 }}>
      {STEPS.map((s, i) => (
        <div key={i} style={{ display:'flex', alignItems:'center', flex: i < STEPS.length-1 ? 1 : 0 }}>
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
            <div style={{ width:30, height:30, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:13,
              background: i < step ? '#22c55e' : i === step ? '#2E3192' : '#e2e4ef',
              color: i <= step ? '#fff' : '#9B9B9B' }}>
              {i < step ? '✓' : i+1}
            </div>
            <div style={{ fontSize:10, fontWeight:700, color: i===step?'#2E3192':i<step?'#22c55e':'#9B9B9B', fontFamily:'Montserrat,sans-serif', whiteSpace:'nowrap' }}>{s}</div>
          </div>
          {i < STEPS.length-1 && (
            <div style={{ flex:1, height:2, background: i < step ? '#22c55e' : '#e2e4ef', marginBottom:18, marginLeft:4, marginRight:4 }}/>
          )}
        </div>
      ))}
    </div>
  )

  if (result) return (
    <div style={{ padding:'28px 32px', maxWidth:640, margin:'0 auto' }}>
      <PageHeader title="Novo Cliente" subtitle="Cliente criado com sucesso"/>
      <Card style={{ borderRadius:16, padding:'28px 32px' }}>
        <div style={{ fontSize:40, textAlign:'center', marginBottom:16 }}>🎉</div>
        <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:18, color:'#15803d', textAlign:'center', marginBottom:20 }}>
          {result.razao} criado!
        </div>

        <div style={{ background:'#fff', border:'2px solid #2E3192', borderRadius:12, padding:'16px 20px', marginBottom:20 }}>
          <div style={{ fontSize:10, color:'#9B9B9B', fontFamily:'Montserrat,sans-serif', fontWeight:700, textTransform:'uppercase', letterSpacing:.5, marginBottom:6 }}>Senha gerada</div>
          <div style={{ fontSize:22, fontFamily:'Courier New, monospace', fontWeight:700, color:'#2E3192', letterSpacing:2 }}>{result.password}</div>
          <div style={{ fontSize:11, color:'#9B9B9B', marginTop:6 }}>⚠️ Anote esta senha — não será exibida novamente. Um e-mail com as credenciais foi enviado ao cliente.</div>
        </div>

        <div style={{ display:'grid', gap:8, marginBottom:24 }}>
          {[
            ['E-mail', result.email],
            ['Empresa', result.razao],
            ['Precificação', `R$ ${Number(price).toLocaleString('pt-BR')} · ${payer==='client'?'Subsidiado pelo cliente':'Fornecedor paga'}`],
            result.slug ? ['Landing page', `elos.eqpitech.com.br/${result.slug}`] : null,
          ].filter(Boolean).map(([k,v]) => (
            <div key={k} style={{ display:'flex', gap:12, alignItems:'baseline' }}>
              <span style={{ fontSize:12, color:'#9B9B9B', minWidth:100, fontFamily:'DM Sans,sans-serif' }}>{k}</span>
              <span style={{ fontSize:13, color:'#1a1c5e', fontWeight:600, fontFamily:'DM Sans,sans-serif' }}>{v}</span>
            </div>
          ))}
        </div>

        <div style={{ background:'#FFF3E8', border:'1px solid #FDBA74', borderRadius:10, padding:'12px 16px', marginBottom:20 }}>
          <div style={{ fontSize:12, color:'#92400e', fontFamily:'DM Sans,sans-serif', fontWeight:600, marginBottom:4 }}>Próximo passo recomendado</div>
          <div style={{ fontSize:12, color:'#92400e', fontFamily:'DM Sans,sans-serif' }}>
            Configure quais documentos serão exigidos por categoria para este cliente — isso determina o checklist de homologação dos fornecedores.
          </div>
        </div>

        <div style={{ display:'flex', gap:10 }}>
          <Button variant="neutral" full onClick={() => navigate('/backoffice/fluxo-documentos')}>
            ⚙️ Configurar Fluxo de Docs
          </Button>
          <Button variant="primary" full onClick={() => {
            setCnpj(''); setRazao(''); setEmail(''); setNome('')
            setPrice('390'); setPayer('supplier')
            setSlug(''); setLpName(''); setDesc(''); setComplianceUrl('')
            setSkipLp(false); setStep(0); setResult(null)
          }}>
            + Novo Cliente
          </Button>
        </div>
      </Card>
    </div>
  )

  return (
    <div style={{ padding:'28px 32px', maxWidth:640, margin:'0 auto' }}>
      <PageHeader title="Novo Cliente" subtitle="Wizard de cadastro completo"/>

      <StepBar/>

      <Card style={{ borderRadius:16, padding:'28px 32px' }}>

        {/* ── Step 0: Empresa ─────────────────────────────────────────────── */}
        {step === 0 && (
          <>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:16, color:'#1a1c5e', marginBottom:20 }}>🏢 Dados da Empresa</div>

            <div style={frow}>
              <label style={lbl}>CNPJ *</label>
              <div style={{ display:'flex', gap:8 }}>
                <input value={cnpj} onChange={e => setCnpj(formatCnpj(e.target.value))}
                  placeholder="00.000.000/0001-00" style={{ ...inp, flex:1 }}/>
                <Button variant="neutral" size="sm" disabled={cnpjLoading || cnpj.replace(/\D/g,'').length < 14} onClick={lookupCnpj}>
                  {cnpjLoading ? <Spinner size={14}/> : '🔍 Consultar'}
                </Button>
              </div>
              <div style={{ fontSize:11, color:'#9B9B9B', marginTop:4 }}>Clique em Consultar para preencher os dados automaticamente.</div>
            </div>

            <div style={frow}>
              <label style={lbl}>Razão Social *</label>
              <input value={razao} onChange={e => setRazao(e.target.value)} placeholder="Empresa S.A." required style={inp}/>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
              <div style={frow}>
                <label style={lbl}>Nome do Responsável *</label>
                <input value={nome} onChange={e => setNome(e.target.value)} placeholder="João da Silva" style={inp}/>
              </div>
              <div style={frow}>
                <label style={lbl}>E-mail do Responsável *</label>
                <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="contato@empresa.com.br" style={inp}/>
              </div>
            </div>

            <div style={{ background:'rgba(46,49,146,.05)', border:'1px solid rgba(46,49,146,.15)', borderRadius:10, padding:'10px 14px', marginBottom:16 }}>
              <div style={{ fontSize:12, color:'#2E3192', fontFamily:'DM Sans,sans-serif' }}>
                🔑 Uma senha segura será gerada automaticamente e enviada por e-mail ao responsável.
              </div>
            </div>
          </>
        )}

        {/* ── Step 1: Precificação ────────────────────────────────────────── */}
        {step === 1 && (
          <>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:16, color:'#1a1c5e', marginBottom:20 }}>💰 Precificação de Homologação</div>

            <div style={frow}>
              <label style={lbl}>Preço por homologação (R$)</label>
              <input type="number" value={price} onChange={e => setPrice(e.target.value)} min="0" step="0.01" style={inp}/>
              <div style={{ fontSize:11, color:'#9B9B9B', marginTop:4 }}>Valor cobrado por cada fornecedor homologado neste cliente. Padrão: R$ 390,00</div>
            </div>

            <div style={frow}>
              <label style={lbl}>Quem paga a homologação?</label>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                {[
                  { value:'supplier', icon:'💳', title:'Fornecedor paga', desc:'O custo da homologação é cobrado direto do fornecedor via Stripe.' },
                  { value:'client',   icon:'🤝', title:'Subsidiado pelo cliente', desc:'O cliente assume o custo. Os fornecedores homologam gratuitamente.' },
                ].map(o => (
                  <button key={o.value} type="button" onClick={() => setPayer(o.value)}
                    style={{ padding:'16px', borderRadius:12, textAlign:'left', cursor:'pointer',
                      border:`2px solid ${payer===o.value?'#2E3192':'#e2e4ef'}`,
                      background: payer===o.value?'rgba(46,49,146,.06)':'#fff' }}>
                    <div style={{ fontSize:22, marginBottom:6 }}>{o.icon}</div>
                    <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, color:payer===o.value?'#2E3192':'#1a1c5e', marginBottom:4 }}>{o.title}</div>
                    <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:11, color:'#9B9B9B', lineHeight:1.4 }}>{o.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── Step 2: Landing Page ───────────────────────────────────────── */}
        {step === 2 && (
          <>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:16, color:'#1a1c5e', marginBottom:4 }}>🌐 Landing Page White-label</div>
            <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#9B9B9B', marginBottom:20 }}>Página pública para o cliente compartilhar com seus fornecedores.</div>

            <label style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer', marginBottom:20 }}>
              <input type="checkbox" checked={skipLp} onChange={e => setSkipLp(e.target.checked)} style={{ accentColor:'#2E3192', width:16, height:16 }}/>
              <span style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#64748b' }}>Pular por agora — configurar landing page depois</span>
            </label>

            {!skipLp && (
              <>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                  <div style={frow}>
                    <label style={lbl}>Slug (URL) *</label>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <span style={{ fontSize:12, color:'#9B9B9B', whiteSpace:'nowrap' }}>elos.eqpitech.com.br/</span>
                      <input value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,''))}
                        placeholder="nome-empresa" style={{ ...inp, flex:1 }}/>
                    </div>
                  </div>
                  <div style={frow}>
                    <label style={lbl}>Nome na Landing Page *</label>
                    <input value={lpName} onChange={e => setLpName(e.target.value)} placeholder={razao} style={inp}/>
                  </div>
                </div>

                <div style={frow}>
                  <label style={lbl}>Cor de destaque</label>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <input type="color" value={accentColor} onChange={e => setAccentColor(e.target.value)}
                      style={{ width:44, height:44, borderRadius:8, border:'1px solid #e2e4ef', cursor:'pointer', padding:2 }}/>
                    <input value={accentColor} onChange={e => setAccentColor(e.target.value)}
                      placeholder="#F47E2F" style={{ ...inp, flex:1 }}/>
                    <div style={{ width:36, height:36, borderRadius:8, background:accentColor, border:'1px solid #e2e4ef', flexShrink:0 }}/>
                  </div>
                </div>

                <div style={frow}>
                  <label style={lbl}>Descrição / Chamada (opcional)</label>
                  <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2}
                    placeholder="Faça parte da cadeia de fornecedores certificados da [Empresa]..."
                    style={{ ...inp, resize:'vertical', minHeight:64 }}/>
                </div>

                <div style={frow}>
                  <label style={lbl}>URL da Política de Compliance (opcional)</label>
                  <input value={complianceUrl} onChange={e => setComplianceUrl(e.target.value)}
                    placeholder="https://empresa.com.br/compliance" style={inp}/>
                </div>
              </>
            )}
          </>
        )}

        {/* ── Step 3: Revisão ────────────────────────────────────────────── */}
        {step === 3 && (
          <>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:16, color:'#1a1c5e', marginBottom:20 }}>✅ Revisão e Confirmação</div>

            {[
              { section:'Empresa', items:[
                ['CNPJ', cnpj],
                ['Razão Social', razao],
                ['Responsável', nome],
                ['E-mail', email],
              ]},
              { section:'Precificação', items:[
                ['Preço por homologação', `R$ ${Number(price).toLocaleString('pt-BR')}`],
                ['Quem paga', payer==='client' ? '🤝 Subsidiado pelo cliente' : '💳 Fornecedor paga'],
              ]},
              ...(!skipLp ? [{ section:'Landing Page', items:[
                ['URL', `elos.eqpitech.com.br/${slug}`],
                ['Nome', lpName],
                ['Cor de destaque', accentColor],
                ...( desc ? [['Descrição', desc.slice(0,60) + (desc.length>60?'...':'')]] : [] ),
              ]}] : [{ section:'Landing Page', items:[['Status','⏭ Pulada — configurar depois']] }]),
            ].map(({ section, items }) => (
              <div key={section} style={{ marginBottom:18 }}>
                <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:11, color:'#9B9B9B', textTransform:'uppercase', letterSpacing:.5, marginBottom:8 }}>{section}</div>
                <div style={{ background:'#f8faff', borderRadius:10, padding:'12px 16px' }}>
                  {items.map(([k,v]) => (
                    <div key={k} style={{ display:'flex', gap:12, alignItems:'baseline', marginBottom:6, ':last-child':{marginBottom:0} }}>
                      <span style={{ fontSize:12, color:'#9B9B9B', minWidth:130, fontFamily:'DM Sans,sans-serif', flexShrink:0 }}>{k}</span>
                      <span style={{ fontSize:13, color:'#1a1c5e', fontWeight:600, fontFamily:'DM Sans,sans-serif', wordBreak:'break-all' }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <div style={{ background:'#FFF3E8', border:'1px solid #FDBA74', borderRadius:10, padding:'12px 14px', marginBottom:8 }}>
              <div style={{ fontSize:12, color:'#92400e', fontFamily:'DM Sans,sans-serif' }}>
                Após criar o cliente, configure o <strong>Fluxo de Documentos</strong> para definir quais documentos serão exigidos dos fornecedores.
              </div>
            </div>
          </>
        )}

        {error && (
          <div style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:10, padding:'10px 14px', marginBottom:16, fontSize:13, color:'#dc2626', fontFamily:'DM Sans,sans-serif' }}>
            {error}
          </div>
        )}

        {/* Botões de navegação */}
        <div style={{ display:'flex', gap:10, marginTop:8 }}>
          {step > 0 && (
            <Button variant="neutral" full onClick={() => { setError(''); setStep(s => s-1) }}>← Voltar</Button>
          )}
          {step < 3 ? (
            <Button variant="primary" full onClick={nextStep}>
              Avançar →
            </Button>
          ) : (
            <Button variant="primary" full disabled={loading} onClick={handleCreate}>
              {loading ? <><Spinner size={16}/> Criando...</> : '🚀 Criar Cliente'}
            </Button>
          )}
        </div>
      </Card>
    </div>
  )
}
