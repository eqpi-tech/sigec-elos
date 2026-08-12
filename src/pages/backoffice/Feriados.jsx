// Cadastro de Feriados — datas que ajustam os prazos do farol de documentos.
// Vencimentos e datas-limite que caem em feriado/fim de semana rolam para o próximo dia útil.
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase.js'
import { Button, Card, Spinner, PageHeader, EmptyState } from '../../components/ui.jsx'

export default function BackofficeFeriados() {
  const [holidays, setHolidays] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [form,     setForm]     = useState({ descricao: '', data: '' })
  const [error,    setError]    = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('holidays').select('*').order('data')
    setHolidays(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function add(e) {
    e.preventDefault()
    if (!form.descricao.trim() || !form.data) return
    setSaving(true); setError('')
    try {
      const userId = (await supabase.auth.getUser()).data.user?.id
      const { error: err } = await supabase.from('holidays')
        .insert({ descricao: form.descricao.trim(), data: form.data, created_by: userId })
      if (err) throw new Error(err.code === '23505' ? 'Já existe um feriado nesta data.' : err.message)
      setForm({ descricao: '', data: '' })
      await load()
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  async function remove(h) {
    if (!confirm(`Excluir o feriado "${h.descricao}" (${fmtDate(h.data)})?`)) return
    const { error: err } = await supabase.from('holidays').delete().eq('id', h.id)
    if (err) { alert('Erro: ' + err.message); return }
    setHolidays(prev => prev.filter(x => x.id !== h.id))
  }

  const fmtDate = (iso) => {
    const [y, m, d] = String(iso).split('-')
    return `${d}/${m}/${y}`
  }

  const today = new Date().toISOString().slice(0, 10)
  const byYear = holidays.reduce((acc, h) => {
    const y = String(h.data).slice(0, 4)
    ;(acc[y] = acc[y] || []).push(h)
    return acc
  }, {})

  const inp = { padding:'10px 12px', borderRadius:10, border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#1a1c5e', outline:'none', boxSizing:'border-box' }
  const lbl = { display:'block', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:10, color:'#9B9B9B', letterSpacing:.5, textTransform:'uppercase', marginBottom:5 }

  return (
    <div style={{ padding:'28px 32px', maxWidth:760, margin:'0 auto' }}>
      <PageHeader
        title="Feriados"
        subtitle="Prazos do farol que caem em feriado ou fim de semana rolam para o próximo dia útil"
      />

      {/* Formulário de inclusão */}
      <Card style={{ borderRadius:14, padding:'18px 22px', marginBottom:20 }}>
        <form onSubmit={add} style={{ display:'flex', gap:12, alignItems:'flex-end', flexWrap:'wrap' }}>
          <div style={{ flex:1, minWidth:200 }}>
            <span style={lbl}>Descrição</span>
            <input value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
              placeholder="Ex: Carnaval" required style={{ ...inp, width:'100%' }}/>
          </div>
          <div>
            <span style={lbl}>Data</span>
            <input type="date" value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))}
              required style={inp}/>
          </div>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? <Spinner size={14}/> : '+ Adicionar'}
          </Button>
        </form>
        {error && (
          <div style={{ marginTop:10, fontSize:12, color:'#dc2626', fontFamily:'DM Sans,sans-serif' }}>{error}</div>
        )}
      </Card>

      {loading ? (
        <div style={{ display:'flex', justifyContent:'center', padding:40 }}><Spinner size={32}/></div>
      ) : holidays.length === 0 ? (
        <EmptyState icon="📅" title="Nenhum feriado cadastrado" subtitle="Adicione as datas que devem ajustar os prazos do farol"/>
      ) : (
        Object.keys(byYear).sort().map(year => (
          <div key={year} style={{ marginBottom:20 }}>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:13, color:'#9B9B9B', letterSpacing:1, marginBottom:8 }}>{year}</div>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {byYear[year].map(h => {
                const past = h.data < today
                return (
                  <Card key={h.id} style={{ borderRadius:10, padding:'12px 16px', opacity: past ? 0.55 : 1 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:14 }}>
                      <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:13, color:'#2E3192', minWidth:86 }}>
                        {fmtDate(h.data)}
                      </div>
                      <div style={{ flex:1, fontFamily:'DM Sans,sans-serif', fontSize:13.5, color:'#1a1c5e' }}>
                        {h.descricao}
                        {past && <span style={{ marginLeft:8, fontSize:10, color:'#9B9B9B' }}>(passado)</span>}
                      </div>
                      <Button variant="danger" size="sm" onClick={() => remove(h)}>🗑</Button>
                    </div>
                  </Card>
                )
              })}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
