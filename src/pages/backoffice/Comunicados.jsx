import { useState, useEffect, useRef } from 'react'
import { Button, Card, PageHeader, Spinner } from '../../components/ui.jsx'
import { supabase } from '../../lib/supabase.js'

const TIPO_COLOR = { novidade:'#22c55e', manutencao:'#ef4444', lancamento:'#2E3192', produto:'#F47E2F', feriado:'#f59e0b' }
const TIPO_ICON  = { novidade:'✨', manutencao:'🔧', lancamento:'🚀', produto:'📦', feriado:'🎉' }
const TIPO_OPTS  = [
  { value:'novidade',   label:'✨ Novidade' },
  { value:'lancamento', label:'🚀 Lançamento' },
  { value:'produto',    label:'📦 Produto' },
  { value:'manutencao', label:'🔧 Manutenção' },
  { value:'feriado',    label:'🎉 Feriado / Recesso' },
]

const EMPTY = {
  title:'', body:'', tipo:'novidade',
  cta_label:'', cta_url:'',
  starts_at: new Date().toISOString().slice(0,16),
  ends_at:'', active:true, sort_order:0,
  image_url:'', image_alt:'',
}

const IMG_W = 1200
const IMG_H = 200

function toLocalDT(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })
}

function StatusBadge({ banner }) {
  const now = new Date()
  const start = new Date(banner.starts_at)
  const end   = banner.ends_at ? new Date(banner.ends_at) : null

  if (!banner.active) return <span style={badge('#9B9B9B')}>Inativo</span>
  if (start > now)    return <span style={badge('#f59e0b')}>Agendado</span>
  if (end && end < now) return <span style={badge('#ef4444')}>Expirado</span>
  return <span style={badge('#22c55e')}>Ativo</span>
}

function badge(color) {
  return { background:`${color}18`, color, padding:'2px 10px', borderRadius:20,
    fontSize:11, fontWeight:700, fontFamily:'Montserrat,sans-serif', whiteSpace:'nowrap' }
}

// ── Preview component ────────────────────────────────────────────────────────
function BannerPreview({ form }) {
  const color = TIPO_COLOR[form.tipo] || '#2E3192'
  const icon  = TIPO_ICON[form.tipo]  || '📢'

  return (
    <div style={{ borderRadius:10, overflow:'hidden', border:'1px solid #e2e4ef', marginTop:16 }}>
      <div style={{ fontSize:10, fontWeight:700, color:'#9B9B9B', fontFamily:'Montserrat,sans-serif',
        textTransform:'uppercase', letterSpacing:.5, padding:'6px 10px', background:'#f8faff', borderBottom:'1px solid #e2e4ef' }}>
        Preview
      </div>
      {form.image_url ? (
        <div style={{ position:'relative', lineHeight:0 }}>
          <img src={form.image_url} alt={form.image_alt || 'preview'}
            style={{ width:'100%', maxHeight:80, objectFit:'cover', display:'block' }}/>
          {form.cta_label && (
            <div style={{ position:'absolute', bottom:6, right:28, background:color, color:'#fff',
              padding:'4px 12px', borderRadius:6, fontSize:11, fontWeight:700, fontFamily:'Montserrat,sans-serif' }}>
              {form.cta_label}
            </div>
          )}
        </div>
      ) : (
        <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 12px',
          minHeight:44, background:`${color}12`, borderBottom:`2px solid ${color}` }}>
          <span style={{ background:color, color:'#fff', padding:'2px 10px', borderRadius:20,
            fontSize:10, fontWeight:700, fontFamily:'Montserrat,sans-serif', whiteSpace:'nowrap' }}>
            {icon} {(form.tipo||'novidade').replace(/^./, c=>c.toUpperCase())}
          </span>
          <span style={{ flex:1, fontSize:12, fontWeight:600, color:'#1a1c5e', fontFamily:'DM Sans,sans-serif' }}>
            {form.title || 'Título do comunicado…'}
          </span>
          {form.cta_label && (
            <span style={{ background:color, color:'#fff', padding:'3px 10px', borderRadius:6,
              fontSize:11, fontWeight:700, fontFamily:'Montserrat,sans-serif', whiteSpace:'nowrap' }}>
              {form.cta_label}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────
export default function BackofficeComunicados() {
  const [banners,    setBanners]    = useState([])
  const [loading,    setLoading]    = useState(true)
  const [form,       setForm]       = useState(null)       // null = lista, objeto = edição/criação
  const [saving,     setSaving]     = useState(false)
  const [uploading,  setUploading]  = useState(false)
  const [imgWarn,    setImgWarn]    = useState('')
  const [deleteConf, setDeleteConf] = useState(null)       // id do banner a excluir
  const fileRef = useRef(null)

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('banners')
      .select('*').order('sort_order').order('created_at', { ascending: false })
    setBanners(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // ── Upload de imagem ──────────────────────────────────────────────────────
  const handleImageFile = async (file) => {
    if (!file) return
    if (file.type !== 'image/png') { setImgWarn('Apenas PNG é aceito.'); return }

    setImgWarn('')
    setUploading(true)

    // Verificar dimensões
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = async () => {
      if (img.naturalWidth !== IMG_W || img.naturalHeight !== IMG_H) {
        setImgWarn(`Dimensão detectada: ${img.naturalWidth}×${img.naturalHeight}px. Recomendado: ${IMG_W}×${IMG_H}px. A imagem será aceita, mas pode ficar cortada.`)
      }
      URL.revokeObjectURL(url)

      // Upload para Supabase Storage
      const ext  = 'png'
      const path = `${crypto.randomUUID()}.${ext}`
      const { error } = await supabase.storage.from('banners').upload(path, file, { contentType:'image/png', upsert:false })
      if (error) { setImgWarn('Erro ao enviar imagem: ' + error.message); setUploading(false); return }

      const { data: { publicUrl } } = supabase.storage.from('banners').getPublicUrl(path)
      setForm(f => ({ ...f, image_url: publicUrl }))
      setUploading(false)
    }
    img.onerror = () => { setImgWarn('Arquivo inválido.'); setUploading(false) }
    img.src = url
  }

  // ── Salvar banner ─────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.image_url && !form.title?.trim()) {
      alert('Informe um título ou carregue uma imagem.')
      return
    }
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()

    const payload = {
      title:      form.title     || null,
      body:       form.body      || null,
      tipo:       form.tipo,
      cta_label:  form.cta_label || null,
      cta_url:    form.cta_url   || null,
      image_url:  form.image_url || null,
      image_alt:  form.image_alt || null,
      starts_at:  form.starts_at ? new Date(form.starts_at).toISOString() : new Date().toISOString(),
      ends_at:    form.ends_at   ? new Date(form.ends_at).toISOString()   : null,
      active:     form.active,
      sort_order: Number(form.sort_order) || 0,
    }

    if (form.id) {
      await supabase.from('banners').update(payload).eq('id', form.id)
    } else {
      await supabase.from('banners').insert({ ...payload, created_by: session?.user?.id })
    }

    await load()
    setForm(null)
    setSaving(false)
  }

  // ── Toggle ativo ──────────────────────────────────────────────────────────
  const toggleActive = async (banner) => {
    await supabase.from('banners').update({ active: !banner.active }).eq('id', banner.id)
    setBanners(bs => bs.map(b => b.id === banner.id ? { ...b, active: !b.active } : b))
  }

  // ── Excluir ───────────────────────────────────────────────────────────────
  const handleDelete = async (id) => {
    await supabase.from('banners').delete().eq('id', id)
    setBanners(bs => bs.filter(b => b.id !== id))
    setDeleteConf(null)
  }

  const inp = { width:'100%', padding:'10px 12px', borderRadius:10, border:'1px solid #e2e4ef',
    fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#1a1c5e', boxSizing:'border-box', outline:'none' }
  const lbl = { display:'block', fontFamily:'Montserrat,sans-serif', fontWeight:600, fontSize:11,
    color:'#1a1c5e', letterSpacing:.5, marginBottom:5, textTransform:'uppercase' }

  // ── Formulário de criação/edição ─────────────────────────────────────────
  if (form) return (
    <div style={{ padding:'28px 32px', maxWidth:720, margin:'0 auto' }}>
      <PageHeader
        title={form.id ? 'Editar Comunicado' : 'Novo Comunicado'}
        subtitle="Banners exibidos na tela de login do SIGEC-ELOS e sistemas integrados"
        action={{ label:'← Voltar à lista', onClick:() => setForm(null) }}
      />

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>

        {/* Coluna esquerda */}
        <div>
          <Card style={{ borderRadius:16, padding:'20px 24px', marginBottom:16 }}>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:14, color:'#1a1c5e', marginBottom:16 }}>🖼️ Imagem (PNG 1200×200px)</div>

            {/* Drop zone */}
            <div
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); handleImageFile(e.dataTransfer.files[0]) }}
              onClick={() => fileRef.current?.click()}
              style={{ border:'2px dashed #c7caff', borderRadius:12, padding:'20px',
                textAlign:'center', cursor:'pointer', background:'#f8f9ff', marginBottom:10 }}>
              {uploading ? (
                <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                  <Spinner size={20}/> <span style={{ fontSize:13, color:'#9B9B9B' }}>Enviando…</span>
                </div>
              ) : form.image_url ? (
                <img src={form.image_url} alt="preview" style={{ maxHeight:80, maxWidth:'100%', borderRadius:8 }}/>
              ) : (
                <>
                  <div style={{ fontSize:28, marginBottom:6 }}>📤</div>
                  <div style={{ fontSize:13, color:'#2E3192', fontWeight:700, fontFamily:'DM Sans,sans-serif' }}>Clique ou arraste um PNG</div>
                  <div style={{ fontSize:11, color:'#9B9B9B', marginTop:4 }}>Dimensão ideal: 1200×200px</div>
                </>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/png" style={{ display:'none' }}
              onChange={e => handleImageFile(e.target.files[0])}/>

            {imgWarn && <div style={{ fontSize:11, color:'#f59e0b', marginBottom:8, fontFamily:'DM Sans,sans-serif' }}>⚠ {imgWarn}</div>}

            {form.image_url && (
              <>
                <div style={{ marginBottom:10 }}>
                  <label style={lbl}>Texto alternativo (acessibilidade)</label>
                  <input value={form.image_alt} onChange={e => setForm(f=>({...f, image_alt:e.target.value}))}
                    placeholder="Descrição breve da imagem" style={inp}/>
                </div>
                <button onClick={() => { setForm(f=>({...f, image_url:'', image_alt:''})); setImgWarn('') }}
                  style={{ fontSize:12, color:'#ef4444', background:'none', border:'none', cursor:'pointer',
                    fontFamily:'DM Sans,sans-serif', textDecoration:'underline', padding:0 }}>
                  Remover imagem
                </button>
              </>
            )}
          </Card>

          <Card style={{ borderRadius:16, padding:'20px 24px' }}>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:14, color:'#1a1c5e', marginBottom:16 }}>📝 Texto (usado se não houver imagem)</div>

            <div style={{ marginBottom:12 }}>
              <label style={lbl}>Tipo</label>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                {TIPO_OPTS.map(o => (
                  <button key={o.value} type="button" onClick={() => setForm(f=>({...f, tipo:o.value}))}
                    style={{ padding:'8px 10px', borderRadius:8, textAlign:'center', cursor:'pointer', fontSize:12,
                      fontFamily:'DM Sans,sans-serif', fontWeight:600,
                      border:`2px solid ${form.tipo===o.value ? TIPO_COLOR[o.value] : '#e2e4ef'}`,
                      background: form.tipo===o.value ? `${TIPO_COLOR[o.value]}12` : '#fff',
                      color: form.tipo===o.value ? TIPO_COLOR[o.value] : '#9B9B9B' }}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom:12 }}>
              <label style={lbl}>Título</label>
              <input value={form.title} onChange={e=>setForm(f=>({...f, title:e.target.value}))}
                placeholder="SIGEC-ELOS v2 — novos relatórios disponíveis" style={inp}/>
            </div>

            <div style={{ marginBottom:4 }}>
              <label style={lbl}>Subtítulo (opcional)</label>
              <input value={form.body} onChange={e=>setForm(f=>({...f, body:e.target.value}))}
                placeholder="Acesse e confira as novidades" style={inp}/>
            </div>
          </Card>
        </div>

        {/* Coluna direita */}
        <div>
          <Card style={{ borderRadius:16, padding:'20px 24px', marginBottom:16 }}>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:14, color:'#1a1c5e', marginBottom:16 }}>🔗 Call-to-Action</div>

            <div style={{ marginBottom:12 }}>
              <label style={lbl}>Texto do botão</label>
              <input value={form.cta_label} onChange={e=>setForm(f=>({...f, cta_label:e.target.value}))}
                placeholder="Saiba mais" style={inp}/>
            </div>
            <div style={{ marginBottom:4 }}>
              <label style={lbl}>URL de destino</label>
              <input value={form.cta_url} onChange={e=>setForm(f=>({...f, cta_url:e.target.value}))}
                placeholder="https://..." style={inp}/>
            </div>
          </Card>

          <Card style={{ borderRadius:16, padding:'20px 24px', marginBottom:16 }}>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:14, color:'#1a1c5e', marginBottom:16 }}>📅 Agendamento</div>

            <div style={{ marginBottom:12 }}>
              <label style={lbl}>Exibir a partir de *</label>
              <input type="datetime-local" value={form.starts_at}
                onChange={e=>setForm(f=>({...f, starts_at:e.target.value}))} style={inp}/>
            </div>
            <div style={{ marginBottom:12 }}>
              <label style={lbl}>Exibir até (vazio = sem prazo)</label>
              <input type="datetime-local" value={form.ends_at}
                onChange={e=>setForm(f=>({...f, ends_at:e.target.value}))} style={inp}/>
            </div>
            <div style={{ marginBottom:12 }}>
              <label style={lbl}>Ordem de exibição</label>
              <input type="number" value={form.sort_order} min={0}
                onChange={e=>setForm(f=>({...f, sort_order:e.target.value}))} style={inp}/>
              <div style={{ fontSize:11, color:'#9B9B9B', marginTop:4, fontFamily:'DM Sans,sans-serif' }}>Menor número = aparece primeiro</div>
            </div>

            <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer' }}>
              <input type="checkbox" checked={form.active} onChange={e=>setForm(f=>({...f, active:e.target.checked}))}
                style={{ accentColor:'#2E3192', width:16, height:16 }}/>
              <span style={{ fontSize:13, fontFamily:'DM Sans,sans-serif', color:'#1a1c5e', fontWeight:600 }}>Ativo</span>
            </label>
          </Card>

          <BannerPreview form={form}/>

          <div style={{ display:'flex', gap:10, marginTop:16 }}>
            <Button variant="neutral" full onClick={() => setForm(null)}>Cancelar</Button>
            <Button variant="primary" full disabled={saving} onClick={handleSave}>
              {saving ? <Spinner size={16}/> : form.id ? '💾 Salvar alterações' : '🚀 Publicar banner'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )

  // ── Lista de banners ──────────────────────────────────────────────────────
  return (
    <div style={{ padding:'28px 32px', maxWidth:960, margin:'0 auto' }}>
      <PageHeader
        title="Comunicados & Banners"
        subtitle="Banners exibidos na tela de login — SIGEC-ELOS e sistemas integrados"
        action={{ label:'+ Novo Banner', onClick:() => setForm({...EMPTY}) }}
      />

      {/* Instruções de embed */}
      <div style={{ background:'#1a1c5e', borderRadius:12, padding:'14px 18px', marginBottom:24, display:'flex', gap:16, alignItems:'flex-start' }}>
        <div style={{ fontSize:24, flexShrink:0 }}>🔌</div>
        <div>
          <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:13, color:'#fff', marginBottom:4 }}>
            Integração com sistemas legados (Sigec-Web / Sigec-HOC)
          </div>
          <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:12, color:'rgba(255,255,255,.7)', marginBottom:8 }}>
            Adicione esta linha no <code style={{ background:'rgba(255,255,255,.1)', padding:'1px 6px', borderRadius:4 }}>&lt;head&gt;</code> ou antes do <code style={{ background:'rgba(255,255,255,.1)', padding:'1px 6px', borderRadius:4 }}>&lt;/body&gt;</code> da página de login (.xhtml, .jsp ou .html):
          </div>
          <code style={{ display:'block', background:'rgba(0,0,0,.35)', color:'#7dd3fc', padding:'10px 14px',
            borderRadius:8, fontSize:12, fontFamily:'Courier New, monospace',
            userSelect:'all', wordBreak:'break-all' }}>
            {'<script src="https://elos.eqpitech.com.br/banners.js" defer></script>'}
          </code>
        </div>
      </div>

      {loading ? (
        <div style={{ display:'flex', justifyContent:'center', padding:40 }}><Spinner size={40}/></div>
      ) : banners.length === 0 ? (
        <Card style={{ borderRadius:16, padding:'48px 32px', textAlign:'center' }}>
          <div style={{ fontSize:48, marginBottom:12 }}>📢</div>
          <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:18, color:'#1a1c5e', marginBottom:8 }}>Nenhum banner cadastrado</div>
          <div style={{ fontSize:14, color:'#9B9B9B', marginBottom:20 }}>Crie o primeiro comunicado para aparecer na tela de login.</div>
          <Button variant="primary" onClick={() => setForm({...EMPTY})}>+ Novo Banner</Button>
        </Card>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {banners.map(b => {
            const color = TIPO_COLOR[b.tipo] || '#2E3192'
            const icon  = TIPO_ICON[b.tipo]  || '📢'
            return (
              <Card key={b.id} style={{ borderRadius:14, padding:0, overflow:'hidden', border:`1px solid ${color}30` }}>
                <div style={{ display:'flex', gap:0 }}>
                  {/* Thumbnail */}
                  <div style={{ width:140, flexShrink:0, background:`${color}10`, display:'flex', alignItems:'center', justifyContent:'center', borderRight:`1px solid ${color}20` }}>
                    {b.image_url ? (
                      <img src={b.image_url} alt={b.image_alt||''} style={{ width:'100%', height:'100%', objectFit:'cover', maxHeight:80 }}/>
                    ) : (
                      <div style={{ fontSize:28 }}>{icon}</div>
                    )}
                  </div>

                  {/* Info */}
                  <div style={{ flex:1, padding:'14px 16px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4, flexWrap:'wrap' }}>
                      <span style={{ fontSize:11, fontWeight:700, color, fontFamily:'Montserrat,sans-serif' }}>
                        {icon} {(b.tipo||'novidade').replace(/^./, c=>c.toUpperCase())}
                      </span>
                      <StatusBadge banner={b}/>
                    </div>
                    <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:14, color:'#1a1c5e', marginBottom:2 }}>
                      {b.title || <em style={{ color:'#9B9B9B', fontStyle:'normal' }}>Somente imagem</em>}
                    </div>
                    {b.body && <div style={{ fontSize:12, color:'#9B9B9B', marginBottom:4 }}>{b.body}</div>}
                    <div style={{ fontSize:11, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>
                      {toLocalDT(b.starts_at)}
                      {b.ends_at ? ` → ${toLocalDT(b.ends_at)}` : ' → sem prazo'}
                      {b.cta_url ? ` · CTA: ${b.cta_label || b.cta_url}` : ''}
                    </div>
                  </div>

                  {/* Ações */}
                  <div style={{ display:'flex', flexDirection:'column', gap:4, padding:'10px 12px', flexShrink:0, justifyContent:'center' }}>
                    <Button variant="neutral" size="sm" onClick={() => setForm({...EMPTY, ...b, starts_at: b.starts_at?.slice(0,16)||'', ends_at: b.ends_at?.slice(0,16)||''})}>
                      ✏ Editar
                    </Button>
                    <button onClick={() => toggleActive(b)}
                      style={{ padding:'5px 10px', borderRadius:8, border:`1px solid ${b.active?'#f59e0b':'#22c55e'}`,
                        background: b.active?'rgba(245,158,11,.08)':'rgba(34,197,94,.08)',
                        color: b.active?'#92400e':'#15803d', fontSize:12, fontWeight:600,
                        fontFamily:'DM Sans,sans-serif', cursor:'pointer' }}>
                      {b.active ? '⏸ Pausar' : '▶ Ativar'}
                    </button>
                    <button onClick={() => setDeleteConf(b.id)}
                      style={{ padding:'5px 10px', borderRadius:8, border:'1px solid rgba(239,68,68,.3)',
                        background:'rgba(239,68,68,.06)', color:'#dc2626', fontSize:12, fontWeight:600,
                        fontFamily:'DM Sans,sans-serif', cursor:'pointer' }}>
                      🗑 Excluir
                    </button>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Modal confirmar exclusão */}
      {deleteConf && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'#fff', borderRadius:16, padding:28, maxWidth:380, width:'90%', boxShadow:'0 20px 60px rgba(0,0,0,.25)' }}>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:17, color:'#1a1c5e', marginBottom:8 }}>Excluir banner?</div>
            <div style={{ fontSize:13, color:'#64748b', fontFamily:'DM Sans,sans-serif', marginBottom:20 }}>Esta ação não pode ser desfeita.</div>
            <div style={{ display:'flex', gap:8 }}>
              <Button variant="neutral" full onClick={() => setDeleteConf(null)}>Cancelar</Button>
              <Button variant="danger" full onClick={() => handleDelete(deleteConf)}>Excluir</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
