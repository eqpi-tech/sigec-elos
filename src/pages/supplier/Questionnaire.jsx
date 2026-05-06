// Fornecedor responde questionários dos clientes que o convidaram
import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext.jsx'
import { questionnaireApi } from '../../services/api.js'
import { Button, Card, Spinner, PageHeader, SectionTitle, EmptyState } from '../../components/ui.jsx'

export default function SupplierQuestionnaire() {
  const { user } = useAuth()
  const [questionnaires, setQuestionnaires] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [answers,  setAnswers]  = useState({})   // { [questionId]: { boolean?: bool, text?: string } }
  const [saving,   setSaving]   = useState({})   // { [questionnaireId]: bool }
  const [saved,    setSaved]    = useState({})   // { [questionnaireId]: bool }

  useEffect(() => {
    if (!user?.supplierId) return
    questionnaireApi.getForSupplier(user.supplierId)
      .then(list => {
        setQuestionnaires(list)
        // Pré-popula respostas existentes
        const init = {}
        list.forEach(q => {
          q.questionnaire_questions.forEach(qq => {
            if (qq.existingAnswer) {
              init[qq.id] = {
                boolean: qq.existingAnswer.answer_boolean,
                text:    qq.existingAnswer.answer_text,
              }
            }
          })
        })
        setAnswers(init)
      })
      .finally(() => setLoading(false))
  }, [user?.supplierId])

  const set = (questionId, field, value) => {
    setAnswers(prev => ({ ...prev, [questionId]: { ...prev[questionId], [field]: value } }))
  }

  const handleSave = async (questionnaire) => {
    setSaving(prev => ({ ...prev, [questionnaire.id]: true }))
    try {
      await Promise.all(
        questionnaire.questionnaire_questions.map(qq =>
          questionnaireApi.saveAnswer({
            questionId:    qq.id,
            supplierId:    user.supplierId,
            answerBoolean: answers[qq.id]?.boolean ?? null,
            answerText:    answers[qq.id]?.text    ?? null,
          })
        )
      )
      setSaved(prev => ({ ...prev, [questionnaire.id]: true }))
      setTimeout(() => setSaved(prev => ({ ...prev, [questionnaire.id]: false })), 3000)
    } catch(e) {
      alert('Erro ao salvar: ' + e.message)
    }
    setSaving(prev => ({ ...prev, [questionnaire.id]: false }))
  }

  if (loading) return <div style={{ display:'flex',justifyContent:'center',padding:80 }}><Spinner size={40}/></div>

  return (
    <div style={{ padding:'28px 32px', maxWidth:860, margin:'0 auto' }}>
      <PageHeader
        title="Questionários"
        subtitle="Responda às perguntas enviadas pelos clientes que te convidaram"
      />

      {questionnaires.length === 0 ? (
        <EmptyState icon="📋" title="Nenhum questionário disponível" subtitle="Os clientes ainda não criaram questionários para você responder."/>
      ) : (
        questionnaires.map(q => {
          const questions = q.questionnaire_questions
          const answered  = questions.filter(qq => answers[qq.id] !== undefined && (answers[qq.id]?.boolean !== undefined || answers[qq.id]?.text)).length
          return (
            <Card key={q.id} style={{ borderRadius:16, padding:'24px', marginBottom:20 }}>
              <div style={{ marginBottom:16 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, marginBottom:4 }}>
                  <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:16, color:'#1a1c5e' }}>{q.title}</div>
                  <span style={{ fontSize:11, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', whiteSpace:'nowrap' }}>
                    {answered}/{questions.length} respondidas
                  </span>
                </div>
                {q.description && <div style={{ fontSize:13, color:'#64748b', fontFamily:'DM Sans,sans-serif' }}>{q.description}</div>}
                <div style={{ fontSize:11, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', marginTop:4 }}>Cliente: {q.clients?.razao_social}</div>
              </div>

              <div style={{ display:'flex', flexDirection:'column', gap:14, marginBottom:20 }}>
                {questions.map((qq, i) => (
                  <div key={qq.id} style={{ padding:'14px 16px', borderRadius:12, background:'#f8faff', border:'1px solid #e2e4ef' }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'#1a1c5e', fontFamily:'DM Sans,sans-serif', marginBottom:10 }}>
                      <span style={{ color:'#9B9B9B', marginRight:6 }}>{i+1}.</span>
                      {qq.text}
                      {qq.required && <span style={{ color:'#dc2626', marginLeft:4 }}>*</span>}
                    </div>

                    {qq.type === 'boolean' && (
                      <div style={{ display:'flex', gap:8 }}>
                        {[{v:true,l:'Sim'},{v:false,l:'Não'}].map(opt => (
                          <button key={String(opt.v)} onClick={() => set(qq.id, 'boolean', opt.v)}
                            style={{ padding:'8px 20px', borderRadius:20, border:`1.5px solid ${answers[qq.id]?.boolean===opt.v?'#2E3192':'#e2e4ef'}`, background:answers[qq.id]?.boolean===opt.v?'#2E3192':'#fff', color:answers[qq.id]?.boolean===opt.v?'#fff':'#1a1c5e', fontFamily:'DM Sans,sans-serif', fontSize:13, fontWeight:600, cursor:'pointer' }}>
                            {opt.l}
                          </button>
                        ))}
                      </div>
                    )}

                    {qq.type === 'text' && (
                      <textarea
                        value={answers[qq.id]?.text || ''}
                        onChange={e => set(qq.id, 'text', e.target.value)}
                        placeholder="Sua resposta..."
                        rows={3}
                        style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:13, resize:'vertical', boxSizing:'border-box' }}
                      />
                    )}

                    {qq.type === 'select' && qq.options?.length > 0 && (
                      <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                        {qq.options.map(opt => (
                          <button key={opt} onClick={() => set(qq.id, 'text', opt)}
                            style={{ padding:'8px 16px', borderRadius:20, border:`1.5px solid ${answers[qq.id]?.text===opt?'#2E3192':'#e2e4ef'}`, background:answers[qq.id]?.text===opt?'#2E3192':'#fff', color:answers[qq.id]?.text===opt?'#fff':'#1a1c5e', fontFamily:'DM Sans,sans-serif', fontSize:13, fontWeight:600, cursor:'pointer' }}>
                            {opt}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                <Button variant="primary" onClick={() => handleSave(q)} disabled={saving[q.id]}>
                  {saving[q.id] ? '⏳ Salvando...' : 'Salvar Respostas'}
                </Button>
                {saved[q.id] && (
                  <span style={{ fontSize:13, color:'#22c55e', fontFamily:'DM Sans,sans-serif', fontWeight:600 }}>✓ Salvo com sucesso</span>
                )}
              </div>
            </Card>
          )
        })
      )}
    </div>
  )
}
