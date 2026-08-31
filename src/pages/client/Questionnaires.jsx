// Questionários (visão do CLIENTE) — SOMENTE CONSULTA.
// A manutenção (criar/editar/excluir) é feita pelo backoffice em
// /backoffice/questionarios; aqui o cliente vê o que está cadastrado.
import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext.jsx'
import { questionnaireApi } from '../../services/api.js'
import { Card, Spinner, PageHeader, SectionTitle, EmptyState } from '../../components/ui.jsx'

const TYPE_LABEL = { boolean:'Sim/Não', text:'Texto livre', select:'Múltipla escolha' }

export default function ClientQuestionnaires() {
  const { user } = useAuth()
  const [questionnaires, setQuestionnaires] = useState([])
  const [selected,       setSelected]       = useState(null)
  const [loading,        setLoading]        = useState(true)

  useEffect(() => {
    if (!user?.clientId) return
    questionnaireApi.listByClient(user.clientId)
      .then(list => { setQuestionnaires(list); setSelected(list[0] || null) })
      .finally(() => setLoading(false))
  }, [user?.clientId])

  if (loading) return <div style={{ display:'flex', justifyContent:'center', alignItems:'center', height:'50vh' }}><Spinner size={48}/></div>

  const questions = (selected?.questionnaire_questions || []).sort((a, b) => a.order_index - b.order_index)

  return (
    <div style={{ padding:'28px 32px', maxWidth:1100, margin:'0 auto' }}>
      <PageHeader
        title="Questionários"
        subtitle="Consulta dos questionários aplicados aos seus fornecedores"
      />

      <div style={{ background:'rgba(46,49,146,.04)', border:'1px solid rgba(46,49,146,.1)', borderRadius:12, padding:'10px 16px', marginBottom:20, fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#1a1c5e' }}>
        ℹ️ A criação e a alteração de questionários são feitas pela equipe EQPI. Para incluir ou ajustar perguntas, fale com o seu contato no backoffice.
      </div>

      {questionnaires.length === 0 ? (
        <EmptyState icon="📋" title="Nenhum questionário" subtitle="Nenhum questionário cadastrado para a sua empresa ainda."/>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'280px 1fr', gap:20 }}>
          {/* Lista */}
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:'#9B9B9B', fontFamily:'Montserrat,sans-serif', textTransform:'uppercase', letterSpacing:.5, marginBottom:10 }}>
              {questionnaires.length} questionário{questionnaires.length !== 1 ? 's' : ''}
            </div>
            {questionnaires.map(q => (
              <div key={q.id} onClick={() => setSelected(q)}
                style={{ padding:'12px 14px', borderRadius:12, marginBottom:8, cursor:'pointer', border:`1.5px solid ${selected?.id === q.id ? '#2E3192' : '#e2e4ef'}`, background:selected?.id === q.id ? 'rgba(46,49,146,.05)' : '#fff', transition:'all .15s' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:'#1a1c5e', fontFamily:'Montserrat,sans-serif', flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{q.title}</div>
                  <span style={{ fontSize:10, fontWeight:700, color:q.active?'#22c55e':'#9B9B9B', background:q.active?'rgba(34,197,94,.1)':'#f0f0f0', padding:'2px 6px', borderRadius:20, flexShrink:0 }}>
                    {q.active ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
                <div style={{ fontSize:11, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', marginTop:3 }}>
                  {q.questionnaire_questions?.length || 0} perguntas
                </div>
              </div>
            ))}
          </div>

          {/* Detalhes (somente leitura) */}
          {!selected ? (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', fontSize:14, padding:60 }}>
              Selecione um questionário para ver as perguntas
            </div>
          ) : (
            <Card style={{ borderRadius:16, padding:'24px' }}>
              <div style={{ marginBottom:20 }}>
                <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:18, color:'#1a1c5e' }}>{selected.title}</div>
                {selected.description && <div style={{ fontSize:13, color:'#64748b', marginTop:4 }}>{selected.description}</div>}
              </div>

              <SectionTitle>Perguntas ({questions.length})</SectionTitle>

              {questions.length === 0 ? (
                <div style={{ textAlign:'center', padding:'24px', color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', fontSize:13 }}>
                  Nenhuma pergunta cadastrada neste questionário.
                </div>
              ) : (
                <div>
                  {questions.map((q, i) => (
                    <div key={q.id} style={{ display:'flex', alignItems:'flex-start', gap:12, padding:'12px 14px', borderRadius:10, background:'#f8faff', border:'1px solid #e2e4ef', marginBottom:6 }}>
                      <div style={{ width:24, height:24, borderRadius:8, background:'rgba(46,49,146,.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:800, color:'#2E3192', flexShrink:0, marginTop:1 }}>{i+1}</div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:600, color:'#1a1c5e', fontFamily:'DM Sans,sans-serif' }}>{q.text}</div>
                        <div style={{ fontSize:11, color:'#9B9B9B', marginTop:2 }}>
                          {TYPE_LABEL[q.type]}{q.required ? ' · Obrigatória' : ''}
                          {q.options?.length ? ` · Opções: ${q.options.join(', ')}` : ''}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
