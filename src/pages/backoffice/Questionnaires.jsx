// Gestão de Questionários — Admin cria questionários por cliente, define perguntas
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase.js'
import { questionnaireApi } from '../../services/api.js'
import { Button, Card, Spinner, PageHeader, SectionTitle, EmptyState } from '../../components/ui.jsx'

const TYPE_LABEL = { boolean:'Sim/Não', text:'Texto livre', select:'Múltipla escolha' }

export default function BackofficeQuestionnaires() {
  const [clients,       setClients]       = useState([])
  const [questionnaires,setQuestionnaires]= useState([])
  const [selected,      setSelected]      = useState(null) // questionário aberto
  const [loading,       setLoading]       = useState(true)
  const [saving,        setSaving]        = useState(false)

  // Formulário novo questionário
  const [showForm,   setShowForm]   = useState(false)
  const [formClient, setFormClient] = useState('')
  const [formTitle,  setFormTitle]  = useState('')
  const [formDesc,   setFormDesc]   = useState('')

  // Formulário nova pergunta
  const [showQForm,  setShowQForm]  = useState(false)
  const [qText,      setQText]      = useState('')
  const [qType,      setQType]      = useState('boolean')
  const [qRequired,  setQRequired]  = useState(true)
  const [qOptions,   setQOptions]   = useState('') // CSV para type=select

  useEffect(() => {
    Promise.all([
      supabase.from('clients').select('id, razao_social').order('razao_social'),
      questionnaireApi.listAll(),
    ]).then(([clientsRes, qList]) => {
      setClients(clientsRes.data || [])
      setQuestionnaires(qList)
    }).finally(() => setLoading(false))
  }, [])

  const reload = async () => {
    const list = await questionnaireApi.listAll()
    setQuestionnaires(list)
    if (selected) {
      const updated = list.find(q => q.id === selected.id)
      if (updated) setSelected(updated)
    }
  }

  const handleCreateQuestionnaire = async () => {
    if (!formClient || !formTitle.trim()) { alert('Selecione o cliente e informe o título'); return }
    setSaving(true)
    try {
      const q = await questionnaireApi.create({ clientId: formClient, title: formTitle.trim(), description: formDesc.trim() || null })
      setShowForm(false); setFormTitle(''); setFormDesc(''); setFormClient('')
      await reload()
      setSelected(q)
    } catch(e) { alert(e.message) }
    setSaving(false)
  }

  const handleAddQuestion = async () => {
    if (!qText.trim()) { alert('Informe o texto da pergunta'); return }
    setSaving(true)
    try {
      const opts = qType === 'select' ? qOptions.split(',').map(s => s.trim()).filter(Boolean) : null
      await questionnaireApi.addQuestion(selected.id, {
        text: qText.trim(), type: qType, options: opts, required: qRequired,
        orderIndex: (selected.questionnaire_questions?.length || 0),
      })
      setShowQForm(false); setQText(''); setQType('boolean'); setQRequired(true); setQOptions('')
      await reload()
    } catch(e) { alert(e.message) }
    setSaving(false)
  }

  const handleRemoveQuestion = async (qId) => {
    if (!confirm('Remover esta pergunta?')) return
    await questionnaireApi.removeQuestion(qId)
    await reload()
  }

  const handleToggleActive = async (q) => {
    await questionnaireApi.update(q.id, { active: !q.active })
    await reload()
  }

  const handleDeleteQuestionnaire = async (q) => {
    if (!confirm(`Excluir "${q.title}"? Todas as perguntas e respostas serão removidas.`)) return
    await questionnaireApi.remove(q.id)
    if (selected?.id === q.id) setSelected(null)
    await reload()
  }

  if (loading) return <div style={{ display:'flex',justifyContent:'center',alignItems:'center',height:'50vh' }}><Spinner size={48}/></div>

  const questions = (selected?.questionnaire_questions || []).sort((a,b)=>a.order_index-b.order_index)

  return (
    <div style={{ padding:'28px 32px', maxWidth:1100, margin:'0 auto' }}>
      <PageHeader
        title="Questionários"
        subtitle="Crie perguntas por cliente; fornecedores respondem no painel"
        action={<Button variant="primary" onClick={()=>setShowForm(true)}>+ Novo Questionário</Button>}
      />

      {/* Modal novo questionário */}
      {showForm && (
        <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.5)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center' }}>
          <div style={{ background:'#fff',borderRadius:16,padding:32,maxWidth:480,width:'90%',boxShadow:'0 20px 60px rgba(0,0,0,.2)' }}>
            <div style={{ fontFamily:'Montserrat,sans-serif',fontWeight:800,fontSize:18,color:'#1a1c5e',marginBottom:20 }}>Novo Questionário</div>
            <div style={{ display:'flex',flexDirection:'column',gap:12 }}>
              <select value={formClient} onChange={e=>setFormClient(e.target.value)}
                style={{ padding:'10px 12px',borderRadius:10,border:'1px solid #e2e4ef',fontFamily:'DM Sans,sans-serif',fontSize:13,color:'#1a1c5e' }}>
                <option value="">Selecionar cliente...</option>
                {clients.map(c=><option key={c.id} value={c.id}>{c.razao_social}</option>)}
              </select>
              <input value={formTitle} onChange={e=>setFormTitle(e.target.value)} placeholder="Título do questionário"
                style={{ padding:'10px 12px',borderRadius:10,border:'1px solid #e2e4ef',fontFamily:'DM Sans,sans-serif',fontSize:13 }}/>
              <textarea value={formDesc} onChange={e=>setFormDesc(e.target.value)} placeholder="Descrição (opcional)" rows={2}
                style={{ padding:'10px 12px',borderRadius:10,border:'1px solid #e2e4ef',fontFamily:'DM Sans,sans-serif',fontSize:13,resize:'vertical' }}/>
            </div>
            <div style={{ display:'flex',gap:8,marginTop:20 }}>
              <Button variant="neutral" full onClick={()=>setShowForm(false)}>Cancelar</Button>
              <Button variant="primary" full disabled={saving} onClick={handleCreateQuestionnaire}>
                {saving?'⏳...':'Criar'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display:'grid',gridTemplateColumns:'280px 1fr',gap:20 }}>
        {/* Lista de questionários */}
        <div>
          <div style={{ fontSize:11,fontWeight:700,color:'#9B9B9B',fontFamily:'Montserrat,sans-serif',textTransform:'uppercase',letterSpacing:.5,marginBottom:10 }}>
            {questionnaires.length} questionário{questionnaires.length!==1?'s':''}
          </div>
          {questionnaires.length === 0
            ? <EmptyState icon="📋" title="Nenhum questionário" subtitle="Crie o primeiro clicando em + Novo Questionário"/>
            : questionnaires.map(q => (
              <div key={q.id}
                onClick={()=>setSelected(q)}
                style={{ padding:'12px 14px',borderRadius:12,marginBottom:8,cursor:'pointer',border:`1.5px solid ${selected?.id===q.id?'#2E3192':'#e2e4ef'}`,background:selected?.id===q.id?'rgba(46,49,146,.05)':'#fff',transition:'all .15s' }}>
                <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',gap:8 }}>
                  <div style={{ fontSize:13,fontWeight:700,color:'#1a1c5e',fontFamily:'Montserrat,sans-serif',flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{q.title}</div>
                  <span style={{ fontSize:10,fontWeight:700,color:q.active?'#22c55e':'#9B9B9B',background:q.active?'rgba(34,197,94,.1)':'#f0f0f0',padding:'2px 6px',borderRadius:20,flexShrink:0 }}>
                    {q.active?'Ativo':'Inativo'}
                  </span>
                </div>
                <div style={{ fontSize:11,color:'#9B9B9B',fontFamily:'DM Sans,sans-serif',marginTop:3 }}>
                  {q.clients?.razao_social} · {q.questionnaire_questions?.length||0} perguntas
                </div>
              </div>
            ))
          }
        </div>

        {/* Detalhes do questionário selecionado */}
        {!selected ? (
          <div style={{ display:'flex',alignItems:'center',justifyContent:'center',color:'#9B9B9B',fontFamily:'DM Sans,sans-serif',fontSize:14,padding:60 }}>
            Selecione um questionário para ver e editar as perguntas
          </div>
        ) : (
          <Card style={{ borderRadius:16,padding:'24px' }}>
            <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:20 }}>
              <div>
                <div style={{ fontFamily:'Montserrat,sans-serif',fontWeight:800,fontSize:18,color:'#1a1c5e' }}>{selected.title}</div>
                {selected.description && <div style={{ fontSize:13,color:'#64748b',marginTop:4 }}>{selected.description}</div>}
                <div style={{ fontSize:12,color:'#9B9B9B',marginTop:4 }}>Cliente: {selected.clients?.razao_social}</div>
              </div>
              <div style={{ display:'flex',gap:8 }}>
                <Button variant="neutral" size="sm" onClick={()=>handleToggleActive(selected)}>
                  {selected.active?'Inativar':'Ativar'}
                </Button>
                <Button variant="danger" size="sm" onClick={()=>handleDeleteQuestionnaire(selected)}>
                  Excluir
                </Button>
              </div>
            </div>

            <SectionTitle>Perguntas ({questions.length})</SectionTitle>

            {questions.length === 0 ? (
              <div style={{ textAlign:'center',padding:'24px',color:'#9B9B9B',fontFamily:'DM Sans,sans-serif',fontSize:13 }}>
                Nenhuma pergunta ainda. Adicione a primeira abaixo.
              </div>
            ) : (
              <div style={{ marginBottom:16 }}>
                {questions.map((q, i) => (
                  <div key={q.id} style={{ display:'flex',alignItems:'flex-start',gap:12,padding:'12px 14px',borderRadius:10,background:'#f8faff',border:'1px solid #e2e4ef',marginBottom:6 }}>
                    <div style={{ width:24,height:24,borderRadius:8,background:'rgba(46,49,146,.1)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:800,color:'#2E3192',flexShrink:0,marginTop:1 }}>{i+1}</div>
                    <div style={{ flex:1,minWidth:0 }}>
                      <div style={{ fontSize:13,fontWeight:600,color:'#1a1c5e',fontFamily:'DM Sans,sans-serif' }}>{q.text}</div>
                      <div style={{ fontSize:11,color:'#9B9B9B',marginTop:2 }}>
                        {TYPE_LABEL[q.type]}{q.required?' · Obrigatória':''}
                        {q.options?.length ? ` · Opções: ${q.options.join(', ')}` : ''}
                      </div>
                    </div>
                    <button onClick={()=>handleRemoveQuestion(q.id)}
                      style={{ background:'none',border:'none',cursor:'pointer',color:'#dc2626',fontSize:16,flexShrink:0,padding:'2px 4px' }}>✕</button>
                  </div>
                ))}
              </div>
            )}

            {/* Formulário adicionar pergunta */}
            {showQForm ? (
              <div style={{ background:'rgba(46,49,146,.04)',border:'1px solid rgba(46,49,146,.15)',borderRadius:12,padding:16,marginTop:8 }}>
                <div style={{ fontFamily:'Montserrat,sans-serif',fontWeight:700,fontSize:13,color:'#1a1c5e',marginBottom:12 }}>Nova Pergunta</div>
                <div style={{ display:'flex',flexDirection:'column',gap:10 }}>
                  <textarea value={qText} onChange={e=>setQText(e.target.value)} placeholder="Texto da pergunta..." rows={2}
                    style={{ padding:'10px 12px',borderRadius:10,border:'1px solid #e2e4ef',fontFamily:'DM Sans,sans-serif',fontSize:13,resize:'vertical' }}/>
                  <div style={{ display:'flex',gap:10 }}>
                    <select value={qType} onChange={e=>setQType(e.target.value)}
                      style={{ flex:1,padding:'10px 12px',borderRadius:10,border:'1px solid #e2e4ef',fontFamily:'DM Sans,sans-serif',fontSize:13,background:'#fff' }}>
                      {Object.entries(TYPE_LABEL).map(([v,l])=><option key={v} value={v}>{l}</option>)}
                    </select>
                    <label style={{ display:'flex',alignItems:'center',gap:6,fontSize:13,color:'#64748b',fontFamily:'DM Sans,sans-serif',cursor:'pointer',whiteSpace:'nowrap' }}>
                      <input type="checkbox" checked={qRequired} onChange={e=>setQRequired(e.target.checked)}/>
                      Obrigatória
                    </label>
                  </div>
                  {qType === 'select' && (
                    <input value={qOptions} onChange={e=>setQOptions(e.target.value)}
                      placeholder="Opções separadas por vírgula: Sim, Não, Parcialmente"
                      style={{ padding:'10px 12px',borderRadius:10,border:'1px solid #e2e4ef',fontFamily:'DM Sans,sans-serif',fontSize:13 }}/>
                  )}
                </div>
                <div style={{ display:'flex',gap:8,marginTop:12 }}>
                  <Button variant="neutral" size="sm" onClick={()=>setShowQForm(false)}>Cancelar</Button>
                  <Button variant="primary" size="sm" disabled={saving} onClick={handleAddQuestion}>
                    {saving?'⏳...':'Adicionar Pergunta'}
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="neutral" full onClick={()=>setShowQForm(true)}>+ Adicionar Pergunta</Button>
            )}
          </Card>
        )}
      </div>
    </div>
  )
}
