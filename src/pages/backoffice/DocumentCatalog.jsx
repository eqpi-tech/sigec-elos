// Catálogo de Documentos — manutenção dos TIPOS de documento (backoffice).
// Regras:
//  · Docs do HOC (id < 10000): nome/responsabilidade/auto/ativo vêm do HOC
//    e são sobrescritos pelo sync noturno → travados aqui. Os campos SÓ do
//    ELOS (regra de validação, SLA, dado pessoal) são editáveis em todos.
//  · Docs ELOS (id >= 10000): totalmente editáveis; novos ids nessa faixa.
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase.js'
import { Card, Spinner, Button, PageHeader } from '../../components/ui.jsx'

const ELOS_ID_MIN = 10000
const RESP_LABEL = { fornecedor: '📎 Fornecedor', interna: '⚡ Interna/Plataforma', cliente: '🏢 Cliente' }

const font = { fontFamily:'DM Sans,sans-serif' }
const lbl  = { display:'block', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:10, color:'#9B9B9B', letterSpacing:.5, textTransform:'uppercase', marginBottom:5 }
const inp  = { width:'100%', padding:'9px 12px', borderRadius:10, border:'1px solid #e2e4ef', ...font, fontSize:13, color:'#1a1c5e', boxSizing:'border-box', outline:'none', background:'#fff' }

function DocModal({ doc, onSave, onClose }) {
  const isNew   = !doc.id
  const fromHoc = !isNew && doc.id < ELOS_ID_MIN
  const [f, setF] = useState({
    name: doc.name || '', responsibility: doc.responsibility || 'fornecedor',
    auto_collect: !!doc.auto_collect, active: doc.active !== false,
    analysis_sla_days: doc.analysis_sla_days ?? '', dado_pessoal: !!doc.dado_pessoal,
    validation_rule: doc.validation_rule || '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))

  async function save() {
    if (!f.name.trim()) return
    setSaving(true)
    try { await onSave(doc, f, fromHoc); onClose() }
    catch (e) { alert('Erro ao salvar: ' + e.message) }
    finally { setSaving(false) }
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'#fff', borderRadius:16, padding:'24px 28px', width:'100%', maxWidth:520, boxShadow:'0 24px 60px rgba(0,0,0,.3)', maxHeight:'92vh', overflowY:'auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:4 }}>
          <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:16, color:'#1a1c5e' }}>
            {isNew ? '➕ Novo Documento' : `✏️ Documento #${doc.id}`}
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#9B9B9B', fontSize:18, lineHeight:1 }}>✕</button>
        </div>
        {fromHoc && (
          <div style={{ ...font, fontSize:11.5, color:'#92400e', background:'#fff7ed', border:'1px solid #fde68a', borderRadius:8, padding:'8px 12px', marginBottom:14 }}>
            📌 Documento do HOC — nome, responsabilidade, coleta automática e ativo são geridos lá (o sync noturno sobrescreve). Aqui você edita os campos exclusivos do ELOS.
          </div>
        )}

        <span style={lbl}>Nome *</span>
        <input value={f.name} onChange={e => set('name', e.target.value)} disabled={fromHoc}
          style={{ ...inp, marginBottom:12, background: fromHoc ? '#f8f9fc' : '#fff' }}/>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
          <div>
            <span style={lbl}>Responsabilidade do envio</span>
            <select value={f.responsibility} onChange={e => set('responsibility', e.target.value)} disabled={fromHoc}
              style={{ ...inp, background: fromHoc ? '#f8f9fc' : '#fff' }}>
              <option value="fornecedor">Fornecedor (upload)</option>
              <option value="interna">Interna / Plataforma (robô ou formulário)</option>
              <option value="cliente">Cliente (comprador anexa)</option>
            </select>
          </div>
          <div>
            <span style={lbl}>SLA de análise (dias)</span>
            <input type="number" min="1" value={f.analysis_sla_days}
              onChange={e => set('analysis_sla_days', e.target.value)}
              placeholder="padrão: 5" style={inp}/>
          </div>
        </div>

        <div style={{ display:'flex', gap:18, marginBottom:14, flexWrap:'wrap' }}>
          <label style={{ ...font, fontSize:13, color:'#1a1c5e', display:'flex', alignItems:'center', gap:7, cursor: fromHoc ? 'not-allowed' : 'pointer' }}>
            <input type="checkbox" checked={f.auto_collect} disabled={fromHoc}
              onChange={e => set('auto_collect', e.target.checked)} style={{ accentColor:'#22c55e' }}/>
            ⚡ Coleta automática
          </label>
          <label style={{ ...font, fontSize:13, color:'#1a1c5e', display:'flex', alignItems:'center', gap:7, cursor: fromHoc ? 'not-allowed' : 'pointer' }}>
            <input type="checkbox" checked={f.active} disabled={fromHoc}
              onChange={e => set('active', e.target.checked)} style={{ accentColor:'#2E3192' }}/>
            Ativo
          </label>
          <label style={{ ...font, fontSize:13, color:'#1a1c5e', display:'flex', alignItems:'center', gap:7, cursor:'pointer' }}>
            <input type="checkbox" checked={f.dado_pessoal}
              onChange={e => set('dado_pessoal', e.target.checked)} style={{ accentColor:'#ef4444' }}/>
            🔒 Dado pessoal (LGPD)
          </label>
        </div>

        <span style={lbl}>Regra de validação (orientação para o analista)</span>
        <textarea value={f.validation_rule} onChange={e => set('validation_rule', e.target.value)} rows={5}
          placeholder={'Descreva COMO validar este documento. Ex.:\n· Conferir razão social e CNPJ iguais ao cadastro\n· Verificar data de emissão < 90 dias\n· Checar autenticidade no site do órgão emissor (código de verificação)'}
          style={{ ...inp, resize:'vertical', marginBottom:16 }}/>

        <div style={{ display:'flex', gap:8 }}>
          <Button variant="neutral" full onClick={onClose}>Cancelar</Button>
          <Button variant="primary" full disabled={saving || !f.name.trim()} onClick={save}>
            {saving ? <Spinner size={14}/> : '💾 Salvar'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function BackofficeDocumentCatalog() {
  const [docs, setDocs]     = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filtro, setFiltro] = useState('todos')   // todos | com_regra | sem_regra | elos | hoc
  const [modal, setModal]   = useState(null)

  const load = () => {
    setLoading(true)
    supabase.from('documents_catalog').select('*').order('name')
      .then(({ data }) => { setDocs(data || []); setLoading(false) })
  }
  useEffect(load, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return docs.filter(d => {
      if (q && !`${d.name} ${d.id}`.toLowerCase().includes(q)) return false
      if (filtro === 'com_regra' && !d.validation_rule) return false
      if (filtro === 'sem_regra' && d.validation_rule) return false
      if (filtro === 'elos' && d.id < ELOS_ID_MIN) return false
      if (filtro === 'hoc'  && d.id >= ELOS_ID_MIN) return false
      return true
    })
  }, [docs, search, filtro])

  async function handleSave(doc, f, fromHoc) {
    // Docs do HOC: grava SÓ os campos exclusivos do ELOS (sync não os toca)
    const payload = fromHoc
      ? { validation_rule: f.validation_rule.trim() || null,
          analysis_sla_days: f.analysis_sla_days ? Number(f.analysis_sla_days) : null,
          dado_pessoal: f.dado_pessoal }
      : { name: f.name.trim(), responsibility: f.responsibility,
          auto_collect: f.auto_collect, active: f.active,
          validation_rule: f.validation_rule.trim() || null,
          analysis_sla_days: f.analysis_sla_days ? Number(f.analysis_sla_days) : null,
          dado_pessoal: f.dado_pessoal }
    if (doc.id) {
      const { error } = await supabase.from('documents_catalog').update(payload).eq('id', doc.id)
      if (error) throw error
    } else {
      // novo doc na faixa ELOS (>= 10000; HOC vai até ~600 — sync não alcança)
      const maxElos = Math.max(ELOS_ID_MIN - 1, ...docs.map(d => d.id))
      const { error } = await supabase.from('documents_catalog')
        .insert({ id: maxElos + 1, ...payload })
      if (error) throw error
    }
    load()
  }

  const semRegra = docs.filter(d => d.active && !d.validation_rule).length

  return (
    <div style={{ padding:'24px 32px', maxWidth:1080, margin:'0 auto' }}>
      <PageHeader title="Catálogo de Documentos"
        subtitle="Tipos de documento da plataforma — inclua, edite e defina a regra de validação de cada um"
        action={<Button variant="primary" onClick={() => setModal({})}>➕ Novo Documento</Button>}/>

      <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap', alignItems:'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Buscar por nome ou id..." style={{ ...inp, maxWidth:340 }}/>
        {[['todos','Todos'],['sem_regra',`Sem regra (${semRegra})`],['com_regra','Com regra'],['hoc','Do HOC'],['elos','ELOS']].map(([v, l]) => (
          <button key={v} onClick={() => setFiltro(v)}
            style={{ padding:'7px 14px', borderRadius:20, border:`1px solid ${filtro===v?'#2E3192':'#e2e4ef'}`, background:filtro===v?'#2E3192':'#fff', color:filtro===v?'#fff':'#64748b', ...font, fontSize:12, fontWeight:600, cursor:'pointer' }}>
            {l}
          </button>
        ))}
        <span style={{ ...font, fontSize:12, color:'#9B9B9B', marginLeft:'auto' }}>{filtered.length} de {docs.length}</span>
      </div>

      {loading ? (
        <div style={{ display:'flex', justifyContent:'center', padding:60 }}><Spinner size={40}/></div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {filtered.slice(0, 200).map(d => (
            <Card key={d.id} style={{ borderRadius:12, padding:'12px 18px', opacity: d.active ? 1 : .55 }}>
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ ...font, fontSize:13, fontWeight:700, color:'#1a1c5e' }}>
                    {d.name}
                    <span style={{ fontWeight:400, color:'#9B9B9B', marginLeft:8, fontSize:11 }}>#{d.id}</span>
                  </div>
                  <div style={{ display:'flex', gap:6, marginTop:5, flexWrap:'wrap' }}>
                    <span style={{ fontSize:10, fontWeight:700, fontFamily:'Montserrat,sans-serif', padding:'2px 8px', borderRadius:20, background:'#f1f2f8', color:'#64748b' }}>
                      {RESP_LABEL[d.responsibility] || d.responsibility || '—'}
                    </span>
                    {d.auto_collect && <span style={{ fontSize:10, fontWeight:700, fontFamily:'Montserrat,sans-serif', padding:'2px 8px', borderRadius:20, background:'#dcfce7', color:'#15803d' }}>⚡ auto</span>}
                    {d.dado_pessoal && <span style={{ fontSize:10, fontWeight:700, fontFamily:'Montserrat,sans-serif', padding:'2px 8px', borderRadius:20, background:'#fee2e2', color:'#991b1b' }}>🔒 LGPD</span>}
                    {d.id < ELOS_ID_MIN
                      ? <span style={{ fontSize:10, fontWeight:700, fontFamily:'Montserrat,sans-serif', padding:'2px 8px', borderRadius:20, background:'#EEF0FF', color:'#2E3192' }}>HOC</span>
                      : <span style={{ fontSize:10, fontWeight:700, fontFamily:'Montserrat,sans-serif', padding:'2px 8px', borderRadius:20, background:'#fff7ed', color:'#c2410c' }}>ELOS</span>}
                    {!d.active && <span style={{ fontSize:10, fontWeight:700, fontFamily:'Montserrat,sans-serif', padding:'2px 8px', borderRadius:20, background:'#f1f2f8', color:'#9B9B9B' }}>inativo</span>}
                    {d.validation_rule
                      ? <span style={{ fontSize:10, fontWeight:700, fontFamily:'Montserrat,sans-serif', padding:'2px 8px', borderRadius:20, background:'#dcfce7', color:'#15803d' }}>📋 regra definida</span>
                      : <span style={{ fontSize:10, fontWeight:700, fontFamily:'Montserrat,sans-serif', padding:'2px 8px', borderRadius:20, background:'#fef3c7', color:'#92400e' }}>sem regra de validação</span>}
                  </div>
                  {d.validation_rule && (
                    <div style={{ ...font, fontSize:11.5, color:'#64748b', marginTop:6, whiteSpace:'pre-line', maxHeight:54, overflow:'hidden' }}>
                      {d.validation_rule}
                    </div>
                  )}
                </div>
                <Button variant="neutral" size="sm" onClick={() => setModal(d)}>✏️ Editar</Button>
              </div>
            </Card>
          ))}
          {filtered.length > 200 && (
            <div style={{ ...font, fontSize:12, color:'#9B9B9B', textAlign:'center', padding:12 }}>
              Exibindo 200 de {filtered.length} — refine a busca
            </div>
          )}
        </div>
      )}

      {modal && <DocModal doc={modal} onSave={handleSave} onClose={() => setModal(null)}/>}
    </div>
  )
}
