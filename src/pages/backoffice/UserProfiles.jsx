// Perfis de Usuário — o backoffice define conjuntos de módulos para
// usuários de CLIENTES e FORNECEDORES (patch_038). Cada usuário
// vincula-se a um perfil; o menu/rotas montam conforme os módulos.
// "Acesso Total" é de sistema: não edita, não exclui.
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase.js'
import { MODULES } from '../../lib/modules.js'
import { Button, Card, Spinner, PageHeader, SectionTitle } from '../../components/ui.jsx'

const TYPE_LABEL = { SUPPLIER: 'Fornecedor', CLIENT: 'Cliente' }
const TYPE_COLOR = { SUPPLIER: '#2563eb',    CLIENT: '#059669' }

export default function BackofficeUserProfiles() {
  const [profiles, setProfiles] = useState([])
  const [counts,   setCounts]   = useState({})   // profile_id → usuários vinculados
  const [loading,  setLoading]  = useState(true)
  const [modal,    setModal]    = useState(null)  // { id?, name, role_type, modules:Set }
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: aps }, { data: links }] = await Promise.all([
      supabase.from('access_profiles').select('*').order('role_type').order('is_system', { ascending: false }).order('name'),
      supabase.from('user_roles').select('access_profile_id').not('access_profile_id', 'is', null),
    ])
    setProfiles(aps || [])
    const c = {}
    ;(links || []).forEach(l => { c[l.access_profile_id] = (c[l.access_profile_id] || 0) + 1 })
    setCounts(c)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const openNew  = (roleType) => setModal({ name: '', role_type: roleType, modules: new Set(MODULES[roleType].map(m => m.key)) })
  const openEdit = (p) => setModal({ id: p.id, name: p.name, role_type: p.role_type, modules: new Set(p.modules || []) })

  const toggleModule = (key) => setModal(m => {
    const next = new Set(m.modules)
    next.has(key) ? next.delete(key) : next.add(key)
    return { ...m, modules: next }
  })

  const save = async () => {
    if (!modal.name.trim()) { setError('Informe o nome do perfil.'); return }
    if (!modal.modules.size) { setError('Selecione ao menos um módulo.'); return }
    setSaving(true); setError('')
    try {
      const userId = (await supabase.auth.getUser()).data.user?.id
      const record = { name: modal.name.trim(), role_type: modal.role_type, modules: [...modal.modules] }
      if (modal.id) {
        const { error: err } = await supabase.from('access_profiles').update(record).eq('id', modal.id).eq('is_system', false)
        if (err) throw new Error(err.message)
      } else {
        const { error: err } = await supabase.from('access_profiles').insert({ ...record, created_by: userId })
        if (err) throw new Error(err.code === '23505' ? 'Já existe um perfil com este nome para este tipo.' : err.message)
      }
      setModal(null)
      await load()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  const remove = async (p) => {
    if (counts[p.id] > 0) { alert(`Este perfil tem ${counts[p.id]} usuário(s) vinculado(s). Reatribua-os antes de excluir.`); return }
    if (!confirm(`Excluir o perfil "${p.name}" (${TYPE_LABEL[p.role_type]})?`)) return
    const { error: err } = await supabase.from('access_profiles').delete().eq('id', p.id).eq('is_system', false)
    if (err) { alert('Erro: ' + err.message); return }
    setProfiles(prev => prev.filter(x => x.id !== p.id))
  }

  if (loading) return <div style={{ display:'flex', justifyContent:'center', alignItems:'center', height:'50vh' }}><Spinner size={48}/></div>

  const moduleLabel = (roleType, key) => MODULES[roleType]?.find(m => m.key === key)?.label || key

  return (
    <div style={{ padding:'28px 32px', maxWidth:960, margin:'0 auto' }}>
      <PageHeader
        title="Perfis de Usuário"
        subtitle="Conjuntos de módulos para usuários de Clientes e Fornecedores — o menu de cada usuário monta conforme o perfil"
      />

      {['CLIENT', 'SUPPLIER'].map(roleType => (
        <div key={roleType} style={{ marginBottom:28 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
            <SectionTitle style={{ marginBottom:0 }}>
              Perfis de {TYPE_LABEL[roleType]} ({profiles.filter(p => p.role_type === roleType).length})
            </SectionTitle>
            <Button variant="primary" size="sm" onClick={() => openNew(roleType)}>+ Novo Perfil</Button>
          </div>

          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {profiles.filter(p => p.role_type === roleType).map(p => (
              <Card key={p.id} style={{ borderRadius:12, padding:'14px 18px' }}>
                <div style={{ display:'flex', alignItems:'flex-start', gap:14, flexWrap:'wrap' }}>
                  <div style={{ width:40, height:40, borderRadius:10, background:`${TYPE_COLOR[roleType]}15`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>
                    {p.is_system ? '🔒' : '🎛️'}
                  </div>
                  <div style={{ flex:1, minWidth:240 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                      <span style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:14, color:'#1a1c5e' }}>{p.name}</span>
                      {p.is_system && (
                        <span style={{ fontSize:10, fontWeight:700, color:'#64748b', background:'#f0f0f5', padding:'2px 8px', borderRadius:20, fontFamily:'Montserrat,sans-serif' }}>SISTEMA</span>
                      )}
                      <span style={{ fontSize:11, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>
                        {counts[p.id] || 0} usuário{(counts[p.id] || 0) !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:5, marginTop:8 }}>
                      {(p.modules || []).map(key => (
                        <span key={key} style={{ fontSize:10.5, color:TYPE_COLOR[roleType], background:`${TYPE_COLOR[roleType]}10`, border:`1px solid ${TYPE_COLOR[roleType]}25`, padding:'2px 9px', borderRadius:6, fontFamily:'DM Sans,sans-serif', fontWeight:600 }}>
                          {moduleLabel(roleType, key)}
                        </span>
                      ))}
                    </div>
                  </div>
                  {!p.is_system && (
                    <div style={{ display:'flex', gap:6 }}>
                      <Button variant="neutral" size="sm" onClick={() => openEdit(p)}>✏</Button>
                      <Button variant="danger" size="sm" onClick={() => remove(p)}>🗑</Button>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      ))}

      {/* Modal criar/editar */}
      {modal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'#fff', borderRadius:16, padding:'28px 32px', maxWidth:520, width:'100%', boxShadow:'0 20px 60px rgba(0,0,0,.2)', maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:17, color:'#1a1c5e', marginBottom:4 }}>
              {modal.id ? '✏ Editar Perfil' : '+ Novo Perfil'} · {TYPE_LABEL[modal.role_type]}
            </div>
            <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:12.5, color:'#9B9B9B', marginBottom:18 }}>
              Usuários vinculados a este perfil verão apenas os módulos marcados.
            </div>

            <div style={{ marginBottom:16 }}>
              <label style={{ display:'block', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:10, color:'#9B9B9B', letterSpacing:.5, textTransform:'uppercase', marginBottom:5 }}>
                Nome do perfil *
              </label>
              <input value={modal.name} onChange={e => setModal(m => ({ ...m, name: e.target.value }))}
                placeholder="Ex: Operacional, Somente Documentos, Financeiro..."
                style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:14, boxSizing:'border-box' }}/>
            </div>

            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:10, color:'#9B9B9B', letterSpacing:.5, textTransform:'uppercase', marginBottom:8 }}>
              Módulos ({modal.modules.size}/{MODULES[modal.role_type].length})
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:18 }}>
              {MODULES[modal.role_type].map(m => (
                <label key={m.key}
                  style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', borderRadius:10, cursor:'pointer',
                    border:`1.5px solid ${modal.modules.has(m.key) ? '#2E3192' : '#e2e4ef'}`,
                    background: modal.modules.has(m.key) ? 'rgba(46,49,146,.04)' : '#fff' }}>
                  <input type="checkbox" checked={modal.modules.has(m.key)} onChange={() => toggleModule(m.key)}
                    style={{ accentColor:'#2E3192' }}/>
                  <span style={{ fontSize:16 }}>{m.icon}</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:'#1a1c5e', fontFamily:'DM Sans,sans-serif' }}>{m.label}</div>
                    <div style={{ fontSize:11, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>{m.desc}</div>
                  </div>
                </label>
              ))}
            </div>

            {error && (
              <div style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:10, padding:'9px 12px', marginBottom:14, fontSize:12.5, color:'#dc2626', fontFamily:'DM Sans,sans-serif' }}>
                {error}
              </div>
            )}

            <div style={{ display:'flex', gap:8 }}>
              <Button variant="neutral" full onClick={() => { setModal(null); setError('') }}>Cancelar</Button>
              <Button variant="primary" full disabled={saving} onClick={save}>
                {saving ? <Spinner size={14}/> : '💾 Salvar Perfil'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
