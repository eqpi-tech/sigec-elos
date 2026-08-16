import { useState, useEffect, useRef } from 'react'
import { clientApi } from '../../services/api.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { supabase } from '../../lib/supabase.js'
import { Button, Card, Spinner, PageHeader, SectionTitle } from '../../components/ui.jsx'

function FieldLabel({ children, required }) {
  return (
    <div style={{ fontSize:12, fontWeight:700, color:'#1a1c5e', fontFamily:'Montserrat,sans-serif', marginBottom:6 }}>
      {children}{required && <span style={{ color:'#ef4444', marginLeft:2 }}>*</span>}
    </div>
  )
}

const inp = {
  width:'100%', padding:'10px 14px', borderRadius:10,
  border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif',
  fontSize:14, color:'#1a1c5e', outline:'none', boxSizing:'border-box', background:'#fff',
}

const hint = { fontSize:11, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', marginBottom:6, lineHeight:1.5 }

const EMPTY_LP = {
  slug:'', company_name:'', logo_url:'', hero_image_url:'',
  accent_color:'#F47E2F', secondary_color:'#1B2A4A', description:'', compliance_url:'',
  website_url:'', linkedin_url:'', contact_email:'', phone:'',
  badges:[], is_active:true,
}

export default function ClientSettings() {
  const { user } = useAuth()

  // ── Terms ──
  const [terms,    setTerms]    = useState('')
  const [original, setOriginal] = useState('')
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [saved,    setSaved]    = useState(false)

  // ── Landing page ──
  const [lp,             setLp]             = useState(null)
  const [lpForm,         setLpForm]         = useState(null)
  const [lpLoading,      setLpLoading]      = useState(true)
  const [lpSaving,       setLpSaving]       = useState(false)
  const [lpSaved,        setLpSaved]        = useState(false)
  const [badgeInput,     setBadgeInput]     = useState('')
  const [uploadingField, setUploadingField] = useState(null) // 'logo' | 'hero' | null

  const logoRef = useRef(null)
  const heroRef = useRef(null)

  useEffect(() => {
    clientApi.getTerms()
      .then(t => { setTerms(t || ''); setOriginal(t || '') })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!user?.clientId) { setLpLoading(false); return }
    clientApi.getLandingPage(user.clientId)
      .then(data => {
        if (data) { setLp(data); setLpForm({ ...data }) }
        else       setLpForm({ ...EMPTY_LP })
      })
      .finally(() => setLpLoading(false))
  }, [user?.clientId])

  const handleSaveTerms = async () => {
    setSaving(true); setSaved(false)
    try {
      await clientApi.saveTerms(terms)
      setOriginal(terms); setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch(e) { alert('Erro ao salvar: ' + e.message) }
    setSaving(false)
  }

  const handleResetTerms = () => {
    if (!confirm('Restaurar para os termos padrão SIGEC-ELOS? Seus termos personalizados serão removidos.')) return
    setTerms('')
  }

  const handleSaveLp = async () => {
    if (!lpForm?.slug?.trim())         { alert('O slug é obrigatório.'); return }
    if (!lpForm?.company_name?.trim()) { alert('O nome da empresa é obrigatório.'); return }
    setLpSaving(true); setLpSaved(false)
    try {
      const result = await clientApi.saveLandingPage(user.clientId, lpForm)
      setLp(result); setLpForm({ ...result })
      setLpSaved(true); setTimeout(() => setLpSaved(false), 3000)
    } catch(e) { alert('Erro ao salvar portal: ' + e.message) }
    setLpSaving(false)
  }

  const uploadImage = async (file, formKey) => {
    const ext = file.name.split('.').pop().toLowerCase()
    const allowed = ['jpg','jpeg','png','webp','svg']
    if (!allowed.includes(ext)) { alert('Formato não suportado. Use JPG, PNG, WEBP ou SVG.'); return }
    if (file.size > 5 * 1024 * 1024) { alert('Arquivo muito grande. Tamanho máximo: 5 MB.'); return }
    const fieldTag = formKey === 'logo_url' ? 'logo' : 'hero'
    setUploadingField(fieldTag)
    try {
      const path = `${user.clientId}/${fieldTag}-${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('client-lp').upload(path, file, { upsert: true })
      if (error) throw new Error(error.message)
      const { data } = supabase.storage.from('client-lp').getPublicUrl(path)
      setLpForm(prev => ({ ...prev, [formKey]: data.publicUrl }))
    } catch (e) { alert('Erro no upload: ' + e.message) }
    setUploadingField(null)
  }

  const lpF = (key) => ({
    value: lpForm?.[key] ?? '',
    onChange: e => setLpForm(prev => ({ ...prev, [key]: e.target.value })),
  })

  const addBadge = () => {
    const t = badgeInput.trim()
    if (t && !(lpForm.badges || []).includes(t))
      setLpForm(prev => ({ ...prev, badges: [...(prev.badges || []), t] }))
    setBadgeInput('')
  }

  const isDirty = terms !== original

  if (loading) return (
    <div style={{ display:'flex', justifyContent:'center', alignItems:'center', height:'50vh' }}>
      <Spinner size={48}/>
    </div>
  )

  return (
    <div style={{ padding:'28px 32px', maxWidth:900, margin:'0 auto' }}>
      <PageHeader title="Configurações" subtitle="Personalize a experiência para seus fornecedores"/>

      {/* ── Termos de Uso ── */}
      <Card style={{ borderRadius:16, padding:'28px 32px', marginBottom:24 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
          <div>
            <SectionTitle>Termos de Uso Personalizados</SectionTitle>
            <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#64748b', marginTop:4, maxWidth:520 }}>
              Seu fornecedor verá estes termos durante o onboarding. Deixe em branco para usar os termos padrão do SIGEC-ELOS.
            </div>
          </div>
          {!terms
            ? <div style={{ fontSize:11, fontWeight:700, color:'#9B9B9B', background:'#f0f0f0', borderRadius:20, padding:'4px 10px', fontFamily:'Montserrat,sans-serif', flexShrink:0 }}>Usando termos padrão</div>
            : <div style={{ fontSize:11, fontWeight:700, color:'#2E3192', background:'rgba(46,49,146,.1)', borderRadius:20, padding:'4px 10px', fontFamily:'Montserrat,sans-serif', flexShrink:0 }}>Termos personalizados ativos</div>
          }
        </div>
        <div style={{ background:'rgba(46,49,146,.04)', border:'1px solid rgba(46,49,146,.15)', borderRadius:10, padding:'10px 14px', marginBottom:16, fontFamily:'DM Sans,sans-serif', fontSize:12, color:'#1a1c5e' }}>
          <strong>Dica:</strong> Inclua cláusulas específicas do seu processo de homologação, prazos, responsabilidades e requisitos legais. Novos convites passarão a exibir estes termos automaticamente.
        </div>
        <textarea value={terms} onChange={e => setTerms(e.target.value)}
          placeholder="Cole aqui o texto dos seus Termos de Uso personalizados...&#10;&#10;Ex: Termos e Condições de Homologação de Fornecedores&#10;&#10;1. O fornecedor declara que as informações prestadas são verdadeiras...&#10;2. ..."
          rows={20}
          style={{ width:'100%', padding:'14px 16px', borderRadius:12, border:'1px solid #e2e4ef', fontFamily:'DM Mono,monospace,DM Sans,sans-serif', fontSize:13, color:'#1a1c5e', resize:'vertical', lineHeight:1.6, boxSizing:'border-box', outline:'none' }}/>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:16 }}>
          <button onClick={handleResetTerms}
            style={{ background:'none', border:'none', cursor:'pointer', color:'#9B9B9B', fontSize:13, fontFamily:'DM Sans,sans-serif', textDecoration:'underline', padding:0 }}>
            Restaurar termos padrão
          </button>
          <div style={{ display:'flex', gap:10, alignItems:'center' }}>
            {saved && <span style={{ color:'#22c55e', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:12 }}>✓ Salvo com sucesso</span>}
            <Button variant="primary" disabled={saving || !isDirty} onClick={handleSaveTerms}>
              {saving ? '⏳ Salvando...' : 'Salvar Termos'}
            </Button>
          </div>
        </div>
      </Card>

      {/* ── Portal de Fornecedores ── */}
      <Card style={{ borderRadius:16, padding:'28px 32px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
          <div>
            <SectionTitle>Portal de Fornecedores</SectionTitle>
            <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#64748b', marginTop:4, maxWidth:520 }}>
              Configure sua landing page pública. Fornecedores que se cadastrarem pelo portal serão automaticamente vinculados à sua conta.
            </div>
          </div>
          {lp && (
            <a href={`/portal/${lp.slug}`} target="_blank" rel="noreferrer"
              style={{ fontSize:13, color:'#2E3192', fontFamily:'DM Sans,sans-serif', fontWeight:600,
                whiteSpace:'nowrap', flexShrink:0, textDecoration:'none' }}>
              Visualizar portal ↗
            </a>
          )}
        </div>

        {/* Link do login personalizado — para o cliente distribuir aos fornecedores */}
        {lp && (
          <div style={{ background:'rgba(46,49,146,.04)', border:'1px solid rgba(46,49,146,.12)', borderRadius:12,
            padding:'14px 18px', marginBottom:20, display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
            <div style={{ flex:1, minWidth:240 }}>
              <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:12, color:'#1a1c5e', marginBottom:2 }}>
                🔑 Login personalizado da sua empresa
              </div>
              <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:12, color:'#64748b' }}>
                Compartilhe este endereço com seus fornecedores — a tela de login usa a sua marca e cores.
              </div>
              <code style={{ display:'inline-block', marginTop:6, fontSize:12, background:'#fff', border:'1px solid #e2e4ef',
                borderRadius:8, padding:'5px 10px', color:'#2E3192', fontFamily:'ui-monospace,monospace' }}>
                elos.eqpitech.com.br/portal/{lp.slug}/login
              </code>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <Button variant="neutral" size="sm"
                onClick={() => { navigator.clipboard.writeText(`https://elos.eqpitech.com.br/portal/${lp.slug}/login`) }}>
                📋 Copiar link
              </Button>
              <a href={`/portal/${lp.slug}/login`} target="_blank" rel="noreferrer" style={{ textDecoration:'none' }}>
                <Button variant="primary" size="sm">Abrir ↗</Button>
              </a>
            </div>
          </div>
        )}

        {lpLoading ? (
          <div style={{ display:'flex', justifyContent:'center', padding:'30px' }}><Spinner size={36}/></div>
        ) : lpForm && (
          <>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'20px 24px' }}>

              {/* Slug */}
              <div style={{ gridColumn:'1/-1' }}>
                <FieldLabel required>URL do Portal (slug)</FieldLabel>
                <div style={{ display:'flex', alignItems:'center' }}>
                  <span style={{ padding:'10px 12px', background:'#f4f5f9', border:'1px solid #e2e4ef', borderRight:'none',
                    borderRadius:'10px 0 0 10px', fontSize:13, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif',
                    whiteSpace:'nowrap', flexShrink:0 }}>
                    /portal/
                  </span>
                  <input {...lpF('slug')} placeholder="meu-portal" disabled={!!lp}
                    style={{ ...inp, borderRadius:'0 10px 10px 0', background: lp?'#f9f9f9':'#fff', color: lp?'#9B9B9B':'#1a1c5e' }}/>
                </div>
                {!!lp && <div style={{ fontSize:11, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', marginTop:4 }}>O slug não pode ser alterado após a criação.</div>}
              </div>

              {/* Company name */}
              <div style={{ gridColumn:'1/-1' }}>
                <FieldLabel required>Nome da Empresa</FieldLabel>
                <input {...lpF('company_name')} placeholder="Ex: Kinross Brasil Mineração" style={inp}/>
              </div>

              {/* Logo */}
              <div>
                <FieldLabel>Logo da Empresa</FieldLabel>
                <div style={hint}>PNG ou SVG com fundo transparente · máx. 5 MB · dimensão ideal: 240 × 80 px</div>
                <input {...lpF('logo_url')} placeholder="https://..." style={inp}/>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:6 }}>
                  <span style={{ fontSize:11, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>ou</span>
                  <button type="button" disabled={uploadingField === 'logo'} onClick={() => logoRef.current?.click()}
                    style={{ background:'rgba(46,49,146,.06)', border:'1px solid rgba(46,49,146,.2)', borderRadius:8,
                      padding:'5px 12px', fontSize:12,
                      color: uploadingField==='logo' ? '#9B9B9B' : '#2E3192',
                      cursor: uploadingField==='logo' ? 'not-allowed' : 'pointer',
                      fontFamily:'DM Sans,sans-serif', fontWeight:600 }}>
                    {uploadingField === 'logo' ? '⏳ Enviando...' : '⬆ Fazer upload'}
                  </button>
                  <input ref={logoRef} type="file" accept="image/jpeg,image/png,image/webp,image/svg+xml"
                    style={{ display:'none' }}
                    onChange={e => { const fl = e.target.files?.[0]; if (fl) uploadImage(fl, 'logo_url'); e.target.value = '' }}/>
                </div>
                {lpForm.logo_url && (
                  <img src={lpForm.logo_url} alt="" onError={e => e.target.style.display='none'}
                    style={{ marginTop:8, height:36, objectFit:'contain', maxWidth:'100%',
                      border:'1px solid #e2e4ef', borderRadius:8, padding:4, display:'block' }}/>
                )}
              </div>

              {/* Hero */}
              <div>
                <FieldLabel>Imagem de Capa (hero)</FieldLabel>
                <div style={hint}>JPG ou PNG · máx. 5 MB · 1440 × 600 px recomendado · aparece com baixa opacidade no fundo</div>
                <input {...lpF('hero_image_url')} placeholder="https://..." style={inp}/>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:6 }}>
                  <span style={{ fontSize:11, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>ou</span>
                  <button type="button" disabled={uploadingField === 'hero'} onClick={() => heroRef.current?.click()}
                    style={{ background:'rgba(46,49,146,.06)', border:'1px solid rgba(46,49,146,.2)', borderRadius:8,
                      padding:'5px 12px', fontSize:12,
                      color: uploadingField==='hero' ? '#9B9B9B' : '#2E3192',
                      cursor: uploadingField==='hero' ? 'not-allowed' : 'pointer',
                      fontFamily:'DM Sans,sans-serif', fontWeight:600 }}>
                    {uploadingField === 'hero' ? '⏳ Enviando...' : '⬆ Fazer upload'}
                  </button>
                  <input ref={heroRef} type="file" accept="image/jpeg,image/png,image/webp"
                    style={{ display:'none' }}
                    onChange={e => { const fl = e.target.files?.[0]; if (fl) uploadImage(fl, 'hero_image_url'); e.target.value = '' }}/>
                </div>
                {lpForm.hero_image_url && (
                  <img src={lpForm.hero_image_url} alt="" onError={e => e.target.style.display='none'}
                    style={{ marginTop:8, height:36, objectFit:'cover', width:'100%',
                      border:'1px solid #e2e4ef', borderRadius:8, display:'block' }}/>
                )}
              </div>

              {/* Primary color */}
              <div>
                <FieldLabel>Cor Principal</FieldLabel>
                <div style={hint}>Botões, destaques e ícones — padrão: laranja</div>
                <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                  <input type="color" value={lpForm.accent_color || '#F47E2F'}
                    onChange={e => setLpForm(prev => ({ ...prev, accent_color: e.target.value }))}
                    style={{ width:44, height:38, border:'1px solid #e2e4ef', borderRadius:8, cursor:'pointer', padding:2, flexShrink:0 }}/>
                  <input {...lpF('accent_color')} placeholder="#F47E2F"
                    style={{ ...inp, width:110, flex:'none' }}/>
                  <div style={{ width:38, height:38, borderRadius:8, background: lpForm.accent_color||'#F47E2F',
                    border:'1px solid #e2e4ef', flexShrink:0 }}/>
                </div>
              </div>

              {/* Secondary color */}
              <div>
                <FieldLabel>Cor Secundária</FieldLabel>
                <div style={hint}>Fundos escuros e seções — padrão: azul</div>
                <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                  <input type="color" value={lpForm.secondary_color || '#1B2A4A'}
                    onChange={e => setLpForm(prev => ({ ...prev, secondary_color: e.target.value }))}
                    style={{ width:44, height:38, border:'1px solid #e2e4ef', borderRadius:8, cursor:'pointer', padding:2, flexShrink:0 }}/>
                  <input {...lpF('secondary_color')} placeholder="#1B2A4A"
                    style={{ ...inp, width:110, flex:'none' }}/>
                  <div style={{ width:38, height:38, borderRadius:8, background: lpForm.secondary_color||'#1B2A4A',
                    border:'1px solid #e2e4ef', flexShrink:0 }}/>
                </div>
              </div>

              {/* Phone */}
              <div>
                <FieldLabel>Telefone da Empresa</FieldLabel>
                <input {...lpF('phone')} placeholder="(11) 3000-0000" style={inp}/>
              </div>

              {/* Contact email */}
              <div>
                <FieldLabel>E-mail de Contato</FieldLabel>
                <input {...lpF('contact_email')} type="email" placeholder="contato@empresa.com.br" style={inp}/>
              </div>

              {/* Website */}
              <div>
                <FieldLabel>Website</FieldLabel>
                <input {...lpF('website_url')} placeholder="https://empresa.com.br" style={inp}/>
              </div>

              {/* LinkedIn */}
              <div>
                <FieldLabel>LinkedIn</FieldLabel>
                <input {...lpF('linkedin_url')} placeholder="https://linkedin.com/company/..." style={inp}/>
              </div>

              {/* Compliance */}
              <div style={{ gridColumn:'1/-1' }}>
                <FieldLabel>URL do Portal de Compliance</FieldLabel>
                <input {...lpF('compliance_url')} placeholder="https://..." style={inp}/>
              </div>

              {/* Description */}
              <div style={{ gridColumn:'1/-1' }}>
                <FieldLabel>Descrição da Empresa</FieldLabel>
                <textarea value={lpForm.description || ''}
                  onChange={e => setLpForm(prev => ({ ...prev, description: e.target.value }))}
                  rows={4} placeholder="Apresentação da empresa para os fornecedores..."
                  style={{ ...inp, resize:'vertical' }}/>
              </div>

              {/* Badges */}
              <div style={{ gridColumn:'1/-1' }}>
                <FieldLabel>Selos e Certificações</FieldLabel>
                {(lpForm.badges || []).length > 0 && (
                  <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:10 }}>
                    {lpForm.badges.map(b => (
                      <span key={b} style={{ display:'inline-flex', alignItems:'center', gap:6,
                        background:'rgba(46,49,146,.08)', color:'#2E3192',
                        padding:'4px 10px 4px 12px', borderRadius:20,
                        fontSize:12, fontFamily:'Montserrat,sans-serif', fontWeight:700 }}>
                        {b}
                        <button onClick={() => setLpForm(prev => ({ ...prev, badges: prev.badges.filter(x => x !== b) }))}
                          style={{ background:'none', border:'none', cursor:'pointer', color:'#9B9B9B',
                            padding:0, fontSize:16, lineHeight:1, display:'flex', alignItems:'center' }}>
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div style={{ display:'flex', gap:8 }}>
                  <input value={badgeInput}
                    onChange={e => setBadgeInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addBadge() } }}
                    placeholder="Ex: ISO 9001, GPTW, FSC..."
                    style={{ ...inp, flex:1 }}/>
                  <Button variant="neutral" size="sm" onClick={addBadge}>+ Adicionar</Button>
                </div>
              </div>

              {/* is_active */}
              <div style={{ gridColumn:'1/-1' }}>
                <label style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer', userSelect:'none' }}>
                  <input type="checkbox"
                    checked={lpForm.is_active ?? true}
                    onChange={e => setLpForm(prev => ({ ...prev, is_active: e.target.checked }))}
                    style={{ width:18, height:18, cursor:'pointer' }}/>
                  <div>
                    <div style={{ fontSize:13, fontWeight:700, color:'#1a1c5e', fontFamily:'Montserrat,sans-serif' }}>Portal ativo</div>
                    <div style={{ fontSize:11, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>
                      Quando inativo, o portal não aparece publicamente para novos cadastros.
                    </div>
                  </div>
                </label>
              </div>
            </div>

            <div style={{ display:'flex', justifyContent:'flex-end', alignItems:'center', gap:12,
              marginTop:24, paddingTop:20, borderTop:'1px solid #f0f0f0' }}>
              {lpSaved && <span style={{ fontSize:12, fontWeight:700, color:'#22c55e', fontFamily:'Montserrat,sans-serif' }}>✓ Salvo com sucesso</span>}
              <Button variant="primary" disabled={lpSaving} onClick={handleSaveLp}>
                {lpSaving ? '⏳ Salvando...' : lp ? 'Salvar Portal' : 'Criar Portal'}
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
