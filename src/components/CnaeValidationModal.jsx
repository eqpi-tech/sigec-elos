// CnaeValidationModal — validação do doc 61 (Análise CNAEs): vincular cada
// categoria da homologação a um CNAE do fornecedor (principal ou secundário).
// Componente ÚNICO usado pela ficha do processo e pela fila de análise —
// antes a regra existia só no processo e a fila aprovava o CNAE sem vínculo
// (divergência encontrada em 25/09).
// 16/10 (caso HAVI, 204 categorias): nome da categoria e descrição do CNAE por
// inteiro, "repetir em todas" a partir do primeiro CNAE escolhido e gravação
// em lote (uma por CNAE, não uma por categoria).
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
  const [ultimo, setUltimo] = useState('')     // último CNAE escolhido → "repetir em todas"
  const [soPendentes, setSoPendentes] = useState(false)

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

  const descDe = (code) => options.find(o => o.code === String(code))
  const escolher = (id, cnae) => {
    setCats(p => p.map(x => x.id === id ? { ...x, cnae } : x))
    if (cnae) setUltimo(cnae)
  }
  // na maioria das categorias o CNAE é o mesmo
  const repetir = (substituir) => setCats(p => p.map(x => (substituir || !x.cnae) ? { ...x, cnae: ultimo } : x))

  async function confirmar() {
    const faltam = cats.filter(c => !c.cnae)
    if (faltam.length) { setError(`Vincule um CNAE a todas as categorias (faltam ${faltam.length}).`); return }
    setSaving(true); setError('')
    try {
      const { data: { user: adminUser } } = await supabase.auth.getUser()
      const porCnae = new Map()
      for (const c of cats) porCnae.set(c.cnae, [...(porCnae.get(c.cnae) || []), c.id])
      for (const [cnae, ids] of porCnae) {
        for (let i = 0; i < ids.length; i += 200) {
          const { error: upErr } = await supabase.from('supplier_categories')
            .update({ cnae, cnae_validated_at: new Date().toISOString(), cnae_validated_by: adminUser?.id })
            .eq('supplier_id', supplierId).in('category_id', ids.slice(i, i + 200))
          if (upErr) throw new Error(upErr.message)
        }
      }
      onValidated()
    } catch (e) { setError('Erro ao salvar vínculos: ' + e.message); setSaving(false) }
  }

  const vinculadas = (cats || []).filter(c => c.cnae).length
  const semCnae = (cats || []).length - vinculadas
  const visiveis = (cats || []).filter(c => !soPendentes || !c.cnae)
  const ult = descDe(ultimo)

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:1200, display:'flex', alignItems:'center', justifyContent:'center' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background:'#fff', borderRadius:16, maxWidth:1040, width:'96%', maxHeight:'90vh', display:'flex', flexDirection:'column', boxShadow:'0 20px 60px rgba(0,0,0,.2)' }}>
        <div style={{ padding:'24px 28px 12px' }}>
          <div style={{ ...titleF, fontWeight:800, fontSize:18, color:'#1a1c5e', marginBottom:4 }}>🧩 Validação do CNAE</div>
          <div style={{ ...font, fontSize:13, color:'#64748b' }}>
            Vincule cada categoria da homologação a um CNAE do fornecedor (principal ou secundário).
            O vínculo garante que a atividade da empresa cobre a categoria contratada.
          </div>

          {cats?.length > 0 && (
            <div style={{ display:'flex', alignItems:'center', gap:14, flexWrap:'wrap', marginTop:12, ...font, fontSize:12.5, color:'#475569' }}>
              <strong style={{ color: semCnae ? '#b45309' : '#15803d' }}>{vinculadas} de {cats.length} categorias vinculadas</strong>
              <label style={{ display:'flex', alignItems:'center', gap:5, cursor:'pointer' }}>
                <input type="checkbox" checked={soPendentes} onChange={e => setSoPendentes(e.target.checked)}/> mostrar só as sem CNAE
              </label>
            </div>
          )}

          {ultimo && cats?.length > 1 && (
            <div style={{ marginTop:10, padding:'10px 14px', borderRadius:10, background:'#eef2ff', border:'1px solid #c7d2fe', display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
              <div style={{ flex:'1 1 320px', ...font, fontSize:12.5, color:'#1e1b4b', lineHeight:1.4 }}>
                Último CNAE escolhido: <strong>{fmtCnae(ultimo)}</strong>{ult?.desc ? ` — ${ult.desc}` : ''}
              </div>
              <Button variant="primary" size="sm" disabled={!semCnae} onClick={() => repetir(false)}>
                ↻ Repetir nas {semCnae} sem CNAE
              </Button>
              <Button variant="neutral" size="sm"
                onClick={() => { if (confirm(`Aplicar ${fmtCnae(ultimo)} em TODAS as ${cats.length} categorias, substituindo as já vinculadas?`)) repetir(true) }}>
                Aplicar em todas
              </Button>
            </div>
          )}
        </div>

        <div style={{ padding:'4px 28px', overflowY:'auto', flex:1 }}>
          {cats === null ? (
            <div style={{ display:'flex', justifyContent:'center', padding:24 }}><Spinner size={28}/></div>
          ) : cats.length === 0 ? (
            <div style={{ padding:16, background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:10, fontSize:13, color:'#92400e', marginBottom:16 }}>
              ⚠️ O fornecedor ainda não tem categorias neste processo.
            </div>
          ) : visiveis.map(c => {
            const o = descDe(c.cnae)
            return (
              <div key={c.id} style={{ display:'grid', gridTemplateColumns:'minmax(0,1fr) minmax(0,1.25fr)', gap:12, alignItems:'start', padding:'10px 12px', borderRadius:10, border:'1px solid #eef0f6', marginBottom:8, background: c.cnae ? 'rgba(34,197,94,.04)' : '#fff' }}>
                <div style={{ fontSize:13, ...font, fontWeight:600, color:'#1a1c5e', lineHeight:1.35, overflowWrap:'anywhere', paddingTop:6 }}>{c.name}</div>
                <div style={{ minWidth:0 }}>
                  <select value={c.cnae} onChange={e => escolher(c.id, e.target.value)} title={o ? `${fmtCnae(o.code)} — ${o.desc}` : ''}
                    style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:`1px solid ${c.cnae ? '#86efac' : '#e2e4ef'}`, ...font, fontSize:12, background:'#fff' }}>
                    <option value="">Selecionar CNAE...</option>
                    {options.map(op => (
                      <option key={op.code} value={op.code}>{op.main ? '★ ' : ''}{fmtCnae(op.code)} — {op.desc}</option>
                    ))}
                  </select>
                  {o && (
                    <div style={{ ...font, fontSize:11.5, color:'#475569', marginTop:4, lineHeight:1.35 }}>
                      {o.main ? '★ Principal' : 'Secundário'} · {fmtCnae(o.code)} — {o.desc}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
          {cats?.length > 0 && !visiveis.length && (
            <div style={{ ...font, fontSize:13, color:'#15803d', padding:12 }}>✓ Todas as categorias já têm CNAE.</div>
          )}
        </div>

        <div style={{ padding:'12px 28px 22px', borderTop:'1px solid #eef0f6' }}>
          {options.length === 0 && cats?.length > 0 && (
            <div style={{ padding:'10px 14px', background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:10, fontSize:12, color:'#92400e', marginBottom:10 }}>
              ⚠️ Sem CNAEs na consulta do CNPJ deste fornecedor — verifique a consulta na ficha do processo.
            </div>
          )}
          {error && <div style={{ ...font, fontSize:12.5, color:'#dc2626', marginBottom:10 }}>{error}</div>}
          <div style={{ display:'flex', gap:8 }}>
            <Button variant="neutral" full onClick={onClose}>Cancelar</Button>
            <Button variant="success" full disabled={saving || !cats?.length} onClick={confirmar}>
              {saving ? '⏳ Salvando...' : '✓ Validar vínculos e aprovar CNAE'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
