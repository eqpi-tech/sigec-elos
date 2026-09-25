// CnaeValidationModal — validação do doc 61 (Análise CNAEs): vincular cada
// categoria da homologação a um CNAE do fornecedor (principal ou secundário).
// Componente ÚNICO usado pela ficha do processo e pela fila de análise —
// antes a regra existia só no processo e a fila aprovava o CNAE sem vínculo
// (divergência encontrada em 25/09).
//
// Props: supplierId · clientId (filtra categorias do processo; null = todas)
//        onValidated() → segue para a aprovação do documento · onClose()
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'
import { Button, Spinner } from './ui.jsx'

const titleF = { fontFamily: 'Montserrat,sans-serif' }
const font   = { fontFamily: 'DM Sans,sans-serif' }
const fmtCnae = (c) => String(c || '').replace(/^(\d{4})(\d)(\d{2})$/, '$1-$2/$3')

export default function CnaeValidationModal({ supplierId, clientId = null, onValidated, onClose }) {
  const [cats, setCats]     = useState(null)   // [{ id, name, cnae }]
  const [options, setOptions] = useState([])   // CNAEs do CNPJ
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [{ data: scRows }, { data: consult }] = await Promise.all([
          supabase.from('supplier_categories')
            .select('category_id, cnae, categories(id, name, client_id)')
            .eq('supplier_id', supplierId),
          supabase.from('cnpj_consultations')
            .select('cnpj_data').eq('supplier_id', supplierId)
            .order('consulted_at', { ascending: false }).limit(1).maybeSingle(),
        ])
        if (!alive) return
        // categorias do processo (cliente do selo); sem cliente → todas
        const all = (scRows || []).filter(r => r.categories)
        const doProcesso = clientId ? all.filter(r => r.categories.client_id === clientId) : all
        const lista = (doProcesso.length ? doProcesso : all)
          .map(r => ({ id: r.category_id, name: r.categories.name, cnae: r.cnae || '' }))
        setCats(lista)

        const cd = consult?.cnpj_data || {}
        const opts = []
        if (cd.cnae_fiscal) opts.push({ code: String(cd.cnae_fiscal), desc: cd.cnae_fiscal_descricao || '', main: true })
        for (const c of (cd.cnaes_secundarios || [])) opts.push({ code: String(c.codigo), desc: c.descricao || '', main: false })
        setOptions(opts)
      } catch (e) { if (alive) { setError(e.message); setCats([]) } }
    })()
    return () => { alive = false }
  }, [supplierId, clientId])

  async function confirmar() {
    const faltam = cats.filter(c => !c.cnae)
    if (faltam.length) { setError(`Vincule um CNAE a todas as categorias (faltam ${faltam.length}).`); return }
    setSaving(true); setError('')
    try {
      const { data: { user: adminUser } } = await supabase.auth.getUser()
      for (const c of cats) {
        const { error: upErr } = await supabase.from('supplier_categories')
          .update({ cnae: c.cnae, cnae_validated_at: new Date().toISOString(), cnae_validated_by: adminUser?.id })
          .eq('supplier_id', supplierId).eq('category_id', c.id)
        if (upErr) throw new Error(upErr.message)
      }
      onValidated()
    } catch (e) { setError('Erro ao salvar vínculos: ' + e.message); setSaving(false) }
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:1200, display:'flex', alignItems:'center', justifyContent:'center' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background:'#fff', borderRadius:16, padding:28, maxWidth:640, width:'94%', maxHeight:'86vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,.2)' }}>
        <div style={{ ...titleF, fontWeight:800, fontSize:18, color:'#1a1c5e', marginBottom:4 }}>🧩 Validação do CNAE</div>
        <div style={{ ...font, fontSize:13, color:'#64748b', marginBottom:16 }}>
          Vincule cada categoria da homologação a um CNAE do fornecedor (principal ou secundário).
          O vínculo garante que a atividade da empresa cobre a categoria contratada.
        </div>

        {cats === null ? (
          <div style={{ display:'flex', justifyContent:'center', padding:24 }}><Spinner size={28}/></div>
        ) : cats.length === 0 ? (
          <div style={{ padding:16, background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:10, fontSize:13, color:'#92400e', marginBottom:16 }}>
            ⚠️ O fornecedor ainda não tem categorias neste processo.
          </div>
        ) : cats.map((c, i) => (
          <div key={c.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:10, border:'1px solid #eef0f6', marginBottom:8, background: c.cnae ? 'rgba(34,197,94,.04)' : '#fff' }}>
            <div style={{ flex:1, minWidth:0, fontSize:13, ...font, fontWeight:600, color:'#1a1c5e' }} title={c.name}>{c.name}</div>
            <span style={{ color:'#9B9B9B' }}>→</span>
            <select value={c.cnae}
              onChange={e => setCats(p => p.map((x, xi) => xi === i ? { ...x, cnae: e.target.value } : x))}
              style={{ flex:1.4, padding:'8px 10px', borderRadius:8, border:`1px solid ${c.cnae ? '#86efac' : '#e2e4ef'}`, ...font, fontSize:12, background:'#fff' }}>
              <option value="">Selecionar CNAE...</option>
              {options.map(o => (
                <option key={o.code} value={o.code}>
                  {o.main ? '★ ' : ''}{fmtCnae(o.code)} — {(o.desc || '').slice(0, 60)}
                </option>
              ))}
            </select>
          </div>
        ))}

        {options.length === 0 && cats?.length > 0 && (
          <div style={{ padding:'10px 14px', background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:10, fontSize:12, color:'#92400e', marginBottom:10 }}>
            ⚠️ Sem CNAEs na consulta do CNPJ deste fornecedor — verifique a consulta na ficha do processo.
          </div>
        )}
        {error && <div style={{ ...font, fontSize:12.5, color:'#dc2626', marginBottom:10 }}>{error}</div>}

        <div style={{ display:'flex', gap:8, marginTop:16 }}>
          <Button variant="neutral" full onClick={onClose}>Cancelar</Button>
          <Button variant="success" full disabled={saving || !cats?.length} onClick={confirmar}>
            {saving ? '⏳ Salvando...' : '✓ Validar vínculos e aprovar CNAE'}
          </Button>
        </div>
      </div>
    </div>
  )
}
