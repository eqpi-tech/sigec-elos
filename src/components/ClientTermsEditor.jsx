// Editor da COLEÇÃO de termos de aceite de um cliente (patch_073) — usado
// na visão cliente (/cliente/termos) e no backoffice (clientId via prop).
// Cada item é um texto ou um PDF hospedado; o fornecedor aceita item a item
// no cadastro e cada aceite fica registrado (versão, data, e-mail, IP).
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase.js'
import { Button, Card, Spinner, SectionTitle } from './ui.jsx'

async function callTerms(payload) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch('/.netlify/functions/client-terms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
    body: JSON.stringify(payload),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Erro')
  return data
}

// Texto legado dos Termos de Homologação (clients.terms_content) — mesmo
// editor no cliente e no backoffice (clientId só é enviado pelo ADMIN)
function LegacyTermsCard({ clientId }) {
  const [terms, setTerms]       = useState('')
  const [original, setOriginal] = useState('')
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)

  useEffect(() => {
    (async () => {
      setLoading(true)
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const qs = clientId ? `?clientId=${clientId}` : ''
        const res = await fetch(`/.netlify/functions/client-terms${qs}`, {
          headers: { 'Authorization': `Bearer ${session?.access_token}` },
        })
        const d = await res.json()
        const v = d.isDefault ? '' : (d.terms || '')
        setTerms(v); setOriginal(v)
      } catch { /* mantém vazio */ }
      setLoading(false)
    })()
  }, [clientId])

  const save = async () => {
    setSaving(true); setSaved(false)
    try {
      await callTerms({ terms, clientId })
      setOriginal(terms); setSaved(true); setTimeout(() => setSaved(false), 3000)
    } catch (e) { alert('Erro ao salvar: ' + e.message) }
    setSaving(false)
  }

  if (loading) return <Card style={{ borderRadius: 16, padding: 30, display: 'flex', justifyContent: 'center' }}><Spinner size={28} /></Card>

  return (
    <Card style={{ borderRadius: 16, padding: '24px 28px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap: 10 }}>
        <div>
          <SectionTitle>Termos de Homologação (texto de leitura)</SectionTitle>
          <div style={{ fontFamily: 'DM Sans,sans-serif', fontSize: 12, color: '#64748b', marginTop: 4, maxWidth: 520 }}>
            Bloco de texto exibido no topo do passo de aceite do cadastro. Em branco, o fornecedor vê os termos padrão do SIGEC-ELOS.
          </div>
        </div>
        {!terms
          ? <span style={{ fontSize: 11, fontWeight: 700, color: '#9B9B9B', background: '#f0f0f0', borderRadius: 20, padding: '4px 10px', fontFamily: 'Montserrat,sans-serif', flexShrink: 0 }}>Usando termos padrão</span>
          : <span style={{ fontSize: 11, fontWeight: 700, color: '#2E3192', background: 'rgba(46,49,146,.1)', borderRadius: 20, padding: '4px 10px', fontFamily: 'Montserrat,sans-serif', flexShrink: 0 }}>Personalizado</span>}
      </div>
      <textarea value={terms} onChange={e => setTerms(e.target.value)} rows={12}
        placeholder="Cole aqui o texto dos Termos de Homologação deste cliente..."
        style={{ width: '100%', padding: '14px 16px', borderRadius: 12, border: '1px solid #e2e4ef', fontFamily: 'DM Mono,monospace,DM Sans,sans-serif', fontSize: 13, color: '#1a1c5e', resize: 'vertical', lineHeight: 1.6, boxSizing: 'border-box', outline: 'none' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
        <button onClick={() => { if (confirm('Restaurar os termos padrão SIGEC-ELOS? (salve para confirmar)')) setTerms('') }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9B9B9B', fontSize: 13, fontFamily: 'DM Sans,sans-serif', textDecoration: 'underline', padding: 0 }}>
          Restaurar termos padrão
        </button>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {saved && <span style={{ color: '#22c55e', fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 12 }}>✓ Salvo</span>}
          <Button variant="primary" disabled={saving || terms === original} onClick={save}>
            {saving ? '⏳ Salvando...' : 'Salvar Termos'}
          </Button>
        </div>
      </div>
    </Card>
  )
}

export default function ClientTermsEditor({ clientId }) {
  const [items, setItems]     = useState(null)
  const [err, setErr]         = useState('')
  const [busy, setBusy]       = useState(false)
  const [showText, setShowText] = useState(false)
  const [editItem, setEditItem] = useState(null)   // item TEXT em edição
  const [title, setTitle]     = useState('')
  const [content, setContent] = useState('')
  const fileRef = useRef(null)
  const [fileTitle, setFileTitle] = useState('')

  const load = () => callTerms({ action: 'items_list', clientId })
    .then(d => setItems(d.items)).catch(e => setErr(e.message))
  useEffect(() => { load() }, [clientId])

  const saveText = async () => {
    if (!title.trim()) return
    setBusy(true)
    try {
      await callTerms({ action: 'item_save', clientId, id: editItem?.id, title: title.trim(), content })
      setShowText(false); setEditItem(null); setTitle(''); setContent(''); await load()
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }

  const uploadDoc = async (file) => {
    if (!file) return
    if (!fileTitle.trim()) { setErr('Dê um título ao documento antes de escolher o arquivo.'); return }
    setBusy(true); setErr('')
    try {
      const base64 = await new Promise((ok, ko) => {
        const r = new FileReader()
        r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = ko
        r.readAsDataURL(file)
      })
      await callTerms({ action: 'item_upload', clientId, title: fileTitle.trim(), file: { name: file.name, base64 } })
      setFileTitle(''); await load()
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }

  const viewDoc = async (it) => {
    try { const { url } = await callTerms({ action: 'item_view', clientId, id: it.id }); if (url) window.open(url, '_blank') }
    catch (e) { setErr(e.message) }
  }

  const toggle = async (it) => { await callTerms({ action: 'item_toggle', clientId, id: it.id, active: !it.active }); load() }
  const remove = async (it) => {
    if (!confirm(it.acceptances > 0
      ? `"${it.title}" tem ${it.acceptances} aceite(s) registrados — será apenas DESATIVADO (a trilha de aceites é preservada). Continuar?`
      : `Excluir "${it.title}"?`)) return
    await callTerms({ action: 'item_delete', clientId, id: it.id }); load()
  }

  if (!items) return <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner size={32} /></div>

  return (<>
    <Card style={{ borderRadius: 16, padding: '22px 26px', marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 6 }}>
        <SectionTitle style={{ marginBottom: 0 }}>Documentos de aceite do fornecedor</SectionTitle>
      </div>
      <div style={{ fontSize: 12, color: '#9B9B9B', fontFamily: 'DM Sans,sans-serif', marginBottom: 16 }}>
        Cada item aparece com um checkbox próprio no cadastro do fornecedor. O aceite fica
        registrado com versão, data, e-mail e IP. Itens com aceites nunca são apagados — apenas desativados.
      </div>

      {err && <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 10, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#dc2626' }}>{err}</div>}

      {items.length === 0 && (
        <div style={{ fontSize: 13, color: '#9B9B9B', fontStyle: 'italic', marginBottom: 14 }}>
          Nenhum item ainda — o fornecedor vê apenas os termos padrão da plataforma.
        </div>
      )}
      {items.map(it => (
        <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 12, border: '1px solid #eef0f6', marginBottom: 8, background: it.active ? '#fff' : '#f8f9fb', opacity: it.active ? 1 : .65 }}>
          <span style={{ fontSize: 20 }}>{it.kind === 'DOCUMENT' ? '📄' : '📝'}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1c5e', fontFamily: 'Montserrat,sans-serif' }}>{it.title}</div>
            <div style={{ fontSize: 11, color: '#9B9B9B', fontFamily: 'DM Sans,sans-serif' }}>
              {it.kind === 'DOCUMENT' ? (it.file_name || 'PDF') : 'Texto'} · v{it.version} · {it.acceptances} aceite{it.acceptances !== 1 ? 's' : ''}{!it.active && ' · INATIVO'}
            </div>
          </div>
          {it.kind === 'DOCUMENT'
            ? <Button variant="neutral" size="sm" onClick={() => viewDoc(it)}>👁 Ver</Button>
            : <Button variant="neutral" size="sm" onClick={() => { setEditItem(it); setTitle(it.title); setContent(it.content || ''); setShowText(true) }}>✏️ Editar</Button>}
          <Button variant="neutral" size="sm" onClick={() => toggle(it)}>{it.active ? '⏸ Desativar' : '▶ Ativar'}</Button>
          <Button variant="danger" size="sm" onClick={() => remove(it)}>🗑</Button>
        </div>
      ))}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16, alignItems: 'center' }}>
        <Button variant="primary" size="sm" onClick={() => { setEditItem(null); setTitle(''); setContent(''); setShowText(true) }}>+ Item de texto</Button>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input value={fileTitle} onChange={e => setFileTitle(e.target.value)}
            placeholder="Título do documento (ex.: Código de Conduta)"
            style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid #e2e4ef', fontSize: 12, fontFamily: 'DM Sans,sans-serif', width: 260 }} />
          <input type="file" accept=".pdf" ref={fileRef} style={{ display: 'none' }}
            onChange={e => { uploadDoc(e.target.files[0]); e.target.value = '' }} />
          <Button variant="orange" size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? '⏳...' : '↑ Subir PDF'}
          </Button>
        </div>
      </div>

      {showText && (
        <div style={{ marginTop: 16, border: '1px solid #e2e4ef', borderRadius: 12, padding: 16, background: '#f8f9fb' }}>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título (ex.: Termos de Homologação)"
            style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid #e2e4ef', fontSize: 13, fontFamily: 'DM Sans,sans-serif', marginBottom: 8, boxSizing: 'border-box' }} />
          <textarea value={content} onChange={e => setContent(e.target.value)} rows={8} placeholder="Texto integral que o fornecedor deverá aceitar..."
            style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid #e2e4ef', fontSize: 12, fontFamily: 'DM Sans,sans-serif', resize: 'vertical', boxSizing: 'border-box' }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <Button variant="primary" size="sm" disabled={busy} onClick={saveText}>{busy ? '⏳...' : editItem ? 'Salvar alterações' : 'Adicionar'}</Button>
            <Button variant="neutral" size="sm" onClick={() => { setShowText(false); setEditItem(null) }}>Cancelar</Button>
          </div>
          {editItem && <div style={{ fontSize: 11, color: '#9B9B9B', marginTop: 6 }}>Alterar o texto cria a versão v{editItem.version + 1} — aceites antigos continuam vinculados à versão anterior.</div>}
        </div>
      )}
    </Card>
    <LegacyTermsCard clientId={clientId} />
  </>)
}
