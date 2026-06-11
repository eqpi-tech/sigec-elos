import { useState } from 'react'
import { Card, Button, PageHeader, Spinner } from '../../components/ui.jsx'

const TYPE_LABEL = { boolean:'Sim/Não', text:'Texto livre', select:'Múltipla escolha' }

const DEMO_QUESTIONNAIRES = [
  {
    id: 1,
    title: 'Compliance Ambiental',
    description: 'Avaliação das práticas ambientais e conformidade com legislação vigente.',
    active: true,
    questions: [
      { id:1, text:'A empresa possui Licença de Operação válida?', type:'boolean', required:true, options:[] },
      { id:2, text:'Possui programa de descarte de resíduos sólidos?', type:'boolean', required:true, options:[] },
      { id:3, text:'Descreva as principais ações de gestão ambiental adotadas:', type:'text', required:false, options:[] },
      { id:4, text:'Qual o nível de conformidade com a PNRS?', type:'select', required:true, options:['Total','Parcial','Não se aplica','Em implantação'] },
      { id:5, text:'A empresa realiza auditorias ambientais internas?', type:'boolean', required:false, options:[] },
    ],
  },
  {
    id: 2,
    title: 'Qualidade e Segurança',
    description: 'Verificação de certificações, processos de qualidade e segurança do trabalho.',
    active: true,
    questions: [
      { id:6,  text:'Possui certificação ISO 9001?', type:'boolean', required:true, options:[] },
      { id:7,  text:'Possui PPRA e PCMSO atualizados?', type:'boolean', required:true, options:[] },
      { id:8,  text:'Qual o índice de acidentes com afastamento nos últimos 12 meses?', type:'select', required:true, options:['Nenhum','1 a 2','3 a 5','Mais de 5'] },
      { id:9,  text:'Descreva o programa de treinamentos em segurança:', type:'text', required:false, options:[] },
    ],
  },
  {
    id: 3,
    title: 'Dados Financeiros',
    description: 'Informações sobre a saúde financeira e capacidade de execução de contratos.',
    active: false,
    questions: [
      { id:10, text:'A empresa está em situação regular com o Fisco (Federal, Estadual, Municipal)?', type:'boolean', required:true, options:[] },
      { id:11, text:'Possui capital social adequado ao escopo de fornecimento?', type:'boolean', required:true, options:[] },
      { id:12, text:'Qual a faixa de faturamento anual?', type:'select', required:true, options:['Até R$360K (MEI/ME)','R$360K–R$4,8M','R$4,8M–R$30M','Acima de R$30M'] },
      { id:13, text:'Descreva eventuais restrições de crédito ou processos judiciais relevantes:', type:'text', required:false, options:[] },
    ],
  },
]

const EMPTY_Q = { text:'', type:'boolean', required:true, options:'' }
const EMPTY_FORM = { title:'', description:'' }

export default function DemoClientQuestionarios({ navigate }) {
  const [questionnaires, setQuestionnaires] = useState(DEMO_QUESTIONNAIRES)
  const [selected,    setSelected]    = useState(null)
  const [showForm,    setShowForm]    = useState(false)
  const [formData,    setFormData]    = useState(EMPTY_FORM)
  const [showQForm,   setShowQForm]   = useState(false)
  const [qData,       setQData]       = useState(EMPTY_Q)
  const [saving,      setSaving]      = useState(false)

  const handleCreate = (e) => {
    e.preventDefault()
    if (!formData.title) return
    setSaving(true)
    setTimeout(() => {
      const novo = { id: Date.now(), title: formData.title, description: formData.description, active: true, questions: [] }
      setQuestionnaires(prev => [...prev, novo])
      setSelected(novo)
      setShowForm(false)
      setFormData(EMPTY_FORM)
      setSaving(false)
    }, 600)
  }

  const handleAddQuestion = () => {
    if (!qData.text) return
    setSaving(true)
    setTimeout(() => {
      const newQ = {
        id: Date.now(),
        text: qData.text,
        type: qData.type,
        required: qData.required,
        options: qData.type === 'select' ? qData.options.split(',').map(s => s.trim()).filter(Boolean) : [],
      }
      const updated = questionnaires.map(q => q.id === selected.id
        ? { ...q, questions: [...q.questions, newQ] }
        : q
      )
      setQuestionnaires(updated)
      setSelected(updated.find(q => q.id === selected.id))
      setShowQForm(false)
      setQData(EMPTY_Q)
      setSaving(false)
    }, 500)
  }

  const handleRemoveQuestion = (qId) => {
    const updated = questionnaires.map(q => q.id === selected.id
      ? { ...q, questions: q.questions.filter(x => x.id !== qId) }
      : q
    )
    setQuestionnaires(updated)
    setSelected(updated.find(q => q.id === selected.id))
  }

  const handleToggleActive = (q) => {
    const updated = questionnaires.map(x => x.id === q.id ? { ...x, active: !x.active } : x)
    setQuestionnaires(updated)
    if (selected?.id === q.id) setSelected(updated.find(x => x.id === q.id))
  }

  const handleDelete = (q) => {
    setQuestionnaires(prev => prev.filter(x => x.id !== q.id))
    if (selected?.id === q.id) setSelected(null)
  }

  const inp = { width:'100%', padding:'10px 12px', borderRadius:10, border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:13, boxSizing:'border-box', outline:'none', color:'#1a1c5e', background:'#fff' }

  return (
    <div style={{ padding:'28px 32px', maxWidth:1100, margin:'0 auto' }}>
      <PageHeader
        title="Questionários"
        subtitle="Crie perguntas para seus fornecedores responderem no painel"
        action={<Button variant="primary" onClick={() => setShowForm(true)}>+ Novo Questionário</Button>}
      />

      {/* Modal novo questionário */}
      {showForm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'#fff', borderRadius:16, padding:32, maxWidth:480, width:'90%', boxShadow:'0 20px 60px rgba(0,0,0,.2)' }}>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:18, color:'#1a1c5e', marginBottom:20 }}>Novo Questionário</div>
            <form onSubmit={handleCreate}>
              <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                <input value={formData.title} onChange={e => setFormData(f=>({...f, title:e.target.value}))}
                  placeholder="Título do questionário" required style={inp}/>
                <textarea value={formData.description} onChange={e => setFormData(f=>({...f, description:e.target.value}))}
                  placeholder="Descrição (opcional)" rows={2} style={{ ...inp, resize:'vertical' }}/>
              </div>
              <div style={{ display:'flex', gap:8, marginTop:20 }}>
                <Button type="button" variant="neutral" full onClick={() => setShowForm(false)}>Cancelar</Button>
                <Button type="submit" variant="primary" full disabled={saving}>{saving ? '⏳...' : 'Criar'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {questionnaires.length === 0 ? (
        <Card style={{ borderRadius:16, padding:'60px 40px', textAlign:'center' }}>
          <div style={{ fontSize:48, marginBottom:12 }}>📋</div>
          <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:18, color:'#1a1c5e', marginBottom:6 }}>Nenhum questionário</div>
          <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#9B9B9B' }}>Crie o primeiro clicando em + Novo Questionário</div>
        </Card>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'280px 1fr', gap:20 }}>
          {/* Lista lateral */}
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:'#9B9B9B', fontFamily:'Montserrat,sans-serif', textTransform:'uppercase', letterSpacing:.5, marginBottom:10 }}>
              {questionnaires.length} questionário{questionnaires.length !== 1 ? 's' : ''}
            </div>
            {questionnaires.map(q => (
              <div key={q.id} onClick={() => setSelected(q)}
                style={{ padding:'12px 14px', borderRadius:12, marginBottom:8, cursor:'pointer', border:`1.5px solid ${selected?.id === q.id ? '#2E3192' : '#e2e4ef'}`, background:selected?.id === q.id ? 'rgba(46,49,146,.05)' : '#fff', transition:'all .15s' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:'#1a1c5e', fontFamily:'Montserrat,sans-serif', flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {q.title}
                  </div>
                  <span style={{ fontSize:10, fontWeight:700, color:q.active?'#22c55e':'#9B9B9B', background:q.active?'rgba(34,197,94,.1)':'#f0f0f0', padding:'2px 6px', borderRadius:20, flexShrink:0 }}>
                    {q.active ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
                <div style={{ fontSize:11, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', marginTop:3 }}>
                  {q.questions.length} perguntas
                </div>
              </div>
            ))}
          </div>

          {/* Detalhes */}
          {!selected ? (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', fontSize:14, padding:60 }}>
              Selecione um questionário para ver e editar as perguntas
            </div>
          ) : (
            <Card style={{ borderRadius:16, padding:'24px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
                <div>
                  <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:18, color:'#1a1c5e' }}>{selected.title}</div>
                  {selected.description && <div style={{ fontSize:13, color:'#64748b', marginTop:4 }}>{selected.description}</div>}
                </div>
                <div style={{ display:'flex', gap:8 }}>
                  <Button variant="neutral" size="sm" onClick={() => handleToggleActive(selected)}>
                    {selected.active ? 'Inativar' : 'Ativar'}
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => handleDelete(selected)}>Excluir</Button>
                </div>
              </div>

              <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:12, color:'#9B9B9B', letterSpacing:.5, textTransform:'uppercase', marginBottom:12 }}>
                Perguntas ({selected.questions.length})
              </div>

              {selected.questions.length === 0 ? (
                <div style={{ textAlign:'center', padding:'24px', color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', fontSize:13 }}>
                  Nenhuma pergunta ainda. Adicione a primeira abaixo.
                </div>
              ) : (
                <div style={{ marginBottom:16 }}>
                  {selected.questions.map((q, i) => (
                    <div key={q.id} style={{ display:'flex', alignItems:'flex-start', gap:12, padding:'12px 14px', borderRadius:10, background:'#f8faff', border:'1px solid #e2e4ef', marginBottom:6 }}>
                      <div style={{ width:24, height:24, borderRadius:8, background:'rgba(46,49,146,.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:800, color:'#2E3192', flexShrink:0, marginTop:1 }}>{i+1}</div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:600, color:'#1a1c5e', fontFamily:'DM Sans,sans-serif' }}>{q.text}</div>
                        <div style={{ fontSize:11, color:'#9B9B9B', marginTop:2 }}>
                          {TYPE_LABEL[q.type]}{q.required ? ' · Obrigatória' : ''}
                          {q.options?.length ? ` · Opções: ${q.options.join(', ')}` : ''}
                        </div>
                      </div>
                      <button onClick={() => handleRemoveQuestion(q.id)}
                        style={{ background:'none', border:'none', cursor:'pointer', color:'#dc2626', fontSize:16, flexShrink:0, padding:'2px 4px' }}>✕</button>
                    </div>
                  ))}
                </div>
              )}

              {showQForm ? (
                <div style={{ background:'rgba(46,49,146,.04)', border:'1px solid rgba(46,49,146,.15)', borderRadius:12, padding:16, marginTop:8 }}>
                  <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, color:'#1a1c5e', marginBottom:12 }}>Nova Pergunta</div>
                  <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                    <textarea value={qData.text} onChange={e => setQData(d=>({...d, text:e.target.value}))}
                      placeholder="Texto da pergunta..." rows={2}
                      style={{ ...inp, resize:'vertical' }}/>
                    <div style={{ display:'flex', gap:10 }}>
                      <select value={qData.type} onChange={e => setQData(d=>({...d, type:e.target.value}))}
                        style={{ flex:1, ...inp }}>
                        {Object.entries(TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                      <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, color:'#64748b', fontFamily:'DM Sans,sans-serif', cursor:'pointer', whiteSpace:'nowrap' }}>
                        <input type="checkbox" checked={qData.required} onChange={e => setQData(d=>({...d, required:e.target.checked}))}/>
                        Obrigatória
                      </label>
                    </div>
                    {qData.type === 'select' && (
                      <input value={qData.options} onChange={e => setQData(d=>({...d, options:e.target.value}))}
                        placeholder="Opções separadas por vírgula: Sim, Não, Parcialmente"
                        style={inp}/>
                    )}
                  </div>
                  <div style={{ display:'flex', gap:8, marginTop:12 }}>
                    <Button variant="neutral" size="sm" onClick={() => { setShowQForm(false); setQData(EMPTY_Q) }}>Cancelar</Button>
                    <Button variant="primary" size="sm" disabled={saving || !qData.text} onClick={handleAddQuestion}>
                      {saving ? <><Spinner size={12}/> Salvando...</> : 'Adicionar Pergunta'}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button variant="neutral" full onClick={() => setShowQForm(true)}>+ Adicionar Pergunta</Button>
              )}
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
