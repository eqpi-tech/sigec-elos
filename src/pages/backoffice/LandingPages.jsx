import { useState, useEffect, useRef } from 'react'
import { adminApi } from '../../services/api.js'
import { supabase } from '../../lib/supabase.js'
import { Button, Card, Spinner, PageHeader, SectionTitle } from '../../components/ui.jsx'

function slugify(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD').replace(/\p{Mn}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
}

const EMPTY_FORM = {
  slug: '', company_name: '', logo_url: '', hero_image_url: '',
  accent_color: '#F47E2F', description: '', compliance_url: '',
  website_url: '', linkedin_url: '', contact_email: '', phone: '',
  badges: [], is_active: true,
}

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

export default function BackofficeLandingPages() {
  const [clients,    setClients]    = useState([])
  const [selClient,  setSelClient]  = useState('')
  const [lp,         setLp]         = useState(null)
  const [form,       setForm]       = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [loadingLp,  setLoadingLp]  = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [saved,      setSaved]      = useState(false)
  const [badgeInput, setBadgeInput] = useState('')
  const [uploadingField, setUploadingField] = useState(null) // 'logo' | 'hero' | null

  const logoRef = useRef(null)
  const heroRef = useRef(null)

  useEffect(() => {
    adminApi.listClients().then(setClients).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!selClient) { setLp(null); setForm(null); return }
    setLoadingLp(true)
    adminApi.getClientLandingPage(selClient)
      .then(data => {
        if (data) {
          setLp(data); setForm({ ...data })
        } else {
          const c = clients.find(x => x.id === selClient)
          const name = c?.nome_fantasia || c?.razao_social || ''
          setLp(null); setForm({ ...EMPTY_FORM, slug: slugify(name), company_name: name })
        }
      })
      .finally(() => setLoadingLp(false))
  }, [selClient, clients])

  const f = (key) => ({
    value: form?.[key] ?? '',
    onChange: e => setForm(prev => ({ ...prev, [key]: e.target.value })),
  })

  const uploadImage = async (file, formKey) => {
    const ext = file.name.split('.').pop().toLowerCase()
    const allowed = ['jpg','jpeg','png','webp','svg']
    if (!allowed.includes(ext)) { alert('Formato não suportado. Use JPG, PNG, WEBP ou SVG.'); return }
    if (file.size > 5 * 1024 * 1024) { alert('Arquivo muito grande. Tamanho máximo: 5 MB.'); return }
    const fieldTag = formKey === 'logo_url' ? 'logo' : 'hero'
    setUploadingField(fieldTag)
    try {
      const path = `${selClient}/${fieldTag}-${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('client-lp').upload(path, file, { upsert: true })
      if (error) throw new Error(error.message)
      const { data } = supabase.storage.from('client-lp').getPublicUrl(path)
      setForm(prev => ({ ...prev, [formKey]: data.publicUrl }))
    } catch (e) { alert('Erro no upload: ' + e.message) }
    setUploadingField(null)
  }

  const handleSave = async () => {
    if (!form?.slug?.trim())         { alert('O slug é obrigatório.'); return }
    if (!form?.company_name?.trim()) { alert('O nome da empresa é obrigatório.'); return }
    setSaving(true); setSaved(false)
    try {
      const result = await adminApi.saveClientLandingPage(selClient, form)
      setLp(result); setForm({ ...result })
      setSaved(true); setTimeout(() => setSaved(false), 3000)
    } catch (e) { alert('Erro: ' + e.message) }
    setSaving(false)
  }

  const addBadge = () => {
    const t = badgeInput.trim()
    if (t && !(form.badges || []).includes(t))
      setForm(prev => ({ ...prev, badges: [...(prev.badges || []), t] }))
    setBadgeInput('')
  }

  if (loading) return (
    <div style={{ display:'flex', justifyContent:'center', alignItems:'center', height:'50vh' }}>
      <Spinner size={48}/>
    </div>
  )

  return (
    <div style={{ padding:'28px 32px', maxWidth:900, margin:'0 auto' }}>
      <PageHeader title="Portais de Fornecedores"
        subtitle="Landing pages públicas personalizáveis por cliente"/>

      {/* Seletor */}
      <Card style={{ borderRadius:16, padding:'22px 28px', marginBottom:24 }}>
        <SectionTitle style={{ marginBottom:10 }}>Selecionar Cliente</SectionTitle>
        <select value={selClient} onChange={e => setSelClient(e.target.value)}
          style={{ ...inp, cursor:'pointer' }}>
          <option value="">— Selecione um cliente —</option>
          {clients.map(c => (
            <option key={c.id} value={c.id}>{c.nome_fantasia || c.razao_social}</option>
          ))}
        </select>
        {selClient && lp && (
          <div style={{ marginTop:10, display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:12, fontFamily:'DM Sans,sans-serif', color:'#9B9B9B' }}>URL:</span>
            <a href={`/portal/${lp.slug}`} target="_blank" rel="noreferrer"
              style={{ fontSize:12, color:'#2E3192', fontFamily:'DM Sans,sans-serif' }}>
              /portal/{lp.slug} ↗
            </a>
            <span style={{ fontSize:11, fontWeight:700,
              color: lp.is_active ? '#22c55e' : '#9B9B9B',
              background: lp.is_active ? 'rgba(34,197,94,.1)' : '#f0f0f0',
              padding:'2px 8px', borderRadius:20, fontFamily:'Montserrat,sans-serif' }}>
              {lp.is_active ? 'Ativo' : 'Inativo'}
            </span>
          </div>
        )}
      </Card>

      {loadingLp && (
        <div style={{ display:'flex', justifyContent:'center', padding:'40px' }}>
          <Spinner size={40}/>
        </div>
      )}

      {form && !loadingLp && (
        <Card style={{ borderRadius:16, padding:'28px 32px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 }}>
            <SectionTitle style={{ marginBottom:0 }}>
              {lp ? 'Editar Portal' : 'Criar Portal'}
            </SectionTitle>
            <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer',
              fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#1a1c5e', userSelect:'none' }}>
              <input type="checkbox"
                checked={form.is_active ?? true}
                onChange={e => setForm(prev => ({ ...prev, is_active: e.target.checked }))}
                style={{ width:16, height:16, cursor:'pointer' }}/>
              Portal ativo
            </label>
          </div>

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
                <input {...f('slug')} placeholder="meu-cliente" disabled={!!lp}
                  style={{ ...inp, borderRadius:'0 10px 10px 0', background: lp?'#f9f9f9':'#fff', color: lp?'#9B9B9B':'#1a1c5e' }}/>
              </div>
              {!!lp && <div style={{ fontSize:11, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', marginTop:4 }}>O slug não pode ser alterado após a criação.</div>}
            </div>

            {/* Company name */}
            <div style={{ gridColumn:'1/-1' }}>
              <FieldLabel required>Nome da Empresa (exibido na landing page)</FieldLabel>
              <input {...f('company_name')} placeholder="Ex: Kinross Brasil Mineração" style={inp}/>
            </div>

            {/* Logo */}
            <div>
              <FieldLabel>Logo da Empresa</FieldLabel>
              <div style={hint}>PNG ou SVG com fundo transparente · máx. 5 MB · dimensão ideal: 240 × 80 px</div>
              <input {...f('logo_url')} placeholder="https://..." style={inp}/>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:6 }}>
                <span style={{ fontSize:11, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>ou</span>
                <button type="button" disabled={uploadingField === 'logo'} onClick={() => logoRef.current?.click()}
                  style={{ background:'rgba(46,49,146,.06)', border:'1px solid rgba(46,49,146,.2)', borderRadius:8,
                    padding:'5px 12px', fontSize:12, color: uploadingField==='logo'?'#9B9B9B':'#2E3192',
                    cursor: uploadingField==='logo'?'not-allowed':'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600 }}>
                  {uploadingField === 'logo' ? '⏳ Enviando...' : '⬆ Fazer upload'}
                </button>
                <input ref={logoRef} type="file" accept="image/jpeg,image/png,image/webp,image/svg+xml"
                  style={{ display:'none' }}
                  onChange={e => { const fl = e.target.files?.[0]; if (fl) uploadImage(fl, 'logo_url'); e.target.value = '' }}/>
              </div>
              {form.logo_url && (
                <img src={form.logo_url} alt="" onError={e => e.target.style.display='none'}
                  style={{ marginTop:8, height:40, objectFit:'contain', maxWidth:'100%',
                    border:'1px solid #e2e4ef', borderRadius:8, padding:4, display:'block' }}/>
              )}
            </div>

            {/* Hero */}
            <div>
              <FieldLabel>Imagem de Capa (hero)</FieldLabel>
              <div style={hint}>JPG ou PNG · máx. 5 MB · 1440 × 600 px recomendado · aparece com baixa opacidade no fundo</div>
              <input {...f('hero_image_url')} placeholder="https://..." style={inp}/>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:6 }}>
                <span style={{ fontSize:11, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>ou</span>
                <button type="button" disabled={uploadingField === 'hero'} onClick={() => heroRef.current?.click()}
                  style={{ background:'rgba(46,49,146,.06)', border:'1px solid rgba(46,49,146,.2)', borderRadius:8,
                    padding:'5px 12px', fontSize:12, color: uploadingField==='hero'?'#9B9B9B':'#2E3192',
                    cursor: uploadingField==='hero'?'not-allowed':'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600 }}>
                  {uploadingField === 'hero' ? '⏳ Enviando...' : '⬆ Fazer upload'}
                </button>
                <input ref={heroRef} type="file" accept="image/jpeg,image/png,image/webp"
                  style={{ display:'none' }}
                  onChange={e => { const fl = e.target.files?.[0]; if (fl) uploadImage(fl, 'hero_image_url'); e.target.value = '' }}/>
              </div>
              {form.hero_image_url && (
                <img src={form.hero_image_url} alt="" onError={e => e.target.style.display='none'}
                  style={{ marginTop:8, height:40, objectFit:'cover', width:'100%',
                    border:'1px solid #e2e4ef', borderRadius:8, display:'block' }}/>
              )}
            </div>

            {/* Accent color */}
            <div>
              <FieldLabel>Cor de Destaque</FieldLabel>
              <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                <input type="color" value={form.accent_color || '#F47E2F'}
                  onChange={e => setForm(prev => ({ ...prev, accent_color: e.target.value }))}
                  style={{ width:44, height:38, border:'1px solid #e2e4ef', borderRadius:8, cursor:'pointer', padding:2, flexShrink:0 }}/>
                <input {...f('accent_color')} placeholder="#F47E2F"
                  style={{ ...inp, width:110, flex:'none' }}/>
                <div style={{ width:38, height:38, borderRadius:8, background: form.accent_color||'#F47E2F',
                  border:'1px solid #e2e4ef', flexShrink:0 }}/>
              </div>
            </div>

            {/* Phone */}
            <div>
              <FieldLabel>Telefone da Empresa</FieldLabel>
              <input {...f('phone')} placeholder="(11) 3000-0000" style={inp}/>
            </div>

            {/* Contact email */}
            <div>
              <FieldLabel>E-mail de Contato</FieldLabel>
              <input {...f('contact_email')} type="email" placeholder="contato@empresa.com.br" style={inp}/>
            </div>

            {/* Website */}
            <div>
              <FieldLabel>Website</FieldLabel>
              <input {...f('website_url')} placeholder="https://empresa.com.br" style={inp}/>
            </div>

            {/* LinkedIn */}
            <div>
              <FieldLabel>LinkedIn</FieldLabel>
              <input {...f('linkedin_url')} placeholder="https://linkedin.com/company/..." style={inp}/>
            </div>

            {/* Compliance */}
            <div style={{ gridColumn:'1/-1' }}>
              <FieldLabel>URL do Portal de Compliance</FieldLabel>
              <input {...f('compliance_url')} placeholder="https://..." style={inp}/>
            </div>

            {/* Description */}
            <div style={{ gridColumn:'1/-1' }}>
              <FieldLabel>Descrição da Empresa</FieldLabel>
              <textarea value={form.description || ''}
                onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                rows={4} placeholder="Apresentação da empresa para os fornecedores..."
                style={{ ...inp, resize:'vertical' }}/>
            </div>

            {/* Badges */}
            <div style={{ gridColumn:'1/-1' }}>
              <FieldLabel>Selos e Certificações</FieldLabel>
              {(form.badges || []).length > 0 && (
                <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:10 }}>
                  {form.badges.map(b => (
                    <span key={b} style={{ display:'inline-flex', alignItems:'center', gap:6,
                      background:'rgba(46,49,146,.08)', color:'#2E3192',
                      padding:'4px 10px 4px 12px', borderRadius:20,
                      fontSize:12, fontFamily:'Montserrat,sans-serif', fontWeight:700 }}>
                      {b}
                      <button onClick={() => setForm(prev => ({ ...prev, badges: prev.badges.filter(x => x !== b) }))}
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
          </div>

          <div style={{ display:'flex', justifyContent:'flex-end', alignItems:'center', gap:12,
            marginTop:24, paddingTop:20, borderTop:'1px solid #f0f0f0' }}>
            {saved && <span style={{ fontSize:12, fontWeight:700, color:'#22c55e', fontFamily:'Montserrat,sans-serif' }}>✓ Salvo com sucesso</span>}
            <Button variant="primary" disabled={saving} onClick={handleSave}>
              {saving ? '⏳ Salvando...' : lp ? 'Salvar Alterações' : 'Criar Portal'}
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}
