// Telas demo que espelham os módulos atuais do ELOS (paridade com a
// aplicação real, dados 100% fictícios). Interações gravam só em estado local;
// nenhuma usa alert/confirm (não aparecem em alguns visualizadores).
import { useState } from 'react'
import { Card, Button, PageHeader, SectionTitle, Spinner } from '../../components/ui.jsx'
import {
  DEMO_QUESTIONNAIRES, DEMO_SUPPLIER_ANSWERS, DEMO_SUPPLIER_CATEGORIES, DEMO_MEUS_DADOS,
  DEMO_ELOS_CLIENTS, DEMO_TEAM_SUPPLIER, DEMO_TEAM_CLIENT, DEMO_SUPPLIER, DEMO_SEALS, HORIZONTE, PRIMATUS, fmtBR, isoD, brD,
} from './demoData.js'
import { useToast, InlineConfirm, copyText, SO_REAL } from './DemoFichaKit.jsx'
import { pickFile } from './DemoFichas.jsx'

const M  = 'Montserrat,sans-serif'
const D  = 'DM Sans,sans-serif'
const H1 = { fontFamily:M, fontWeight:800, fontSize:22, color:'#1a1c5e' }
const SUB = { fontFamily:D, fontSize:13, color:'#9B9B9B', marginTop:2 }
const LBL = { display:'block', fontFamily:M, fontWeight:700, fontSize:10, color:'#9B9B9B', letterSpacing:.5, textTransform:'uppercase', marginBottom:4 }
const INP = { width:'100%', padding:'9px 12px', borderRadius:10, border:'1px solid #e2e4ef', fontFamily:D, fontSize:13, color:'#1a1c5e', boxSizing:'border-box', outline:'none', background:'#fff' }

function Page({ title, sub, action, children, max = 1100 }) {
  return (
    <div style={{ padding:'28px 32px', maxWidth:max, margin:'0 auto' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:24, flexWrap:'wrap', gap:12 }}>
        <div><div style={H1}>{title}</div>{sub && <div style={SUB}>{sub}</div>}</div>
        {action}
      </div>
      {children}
    </div>
  )
}

// ── Fornecedor: Questionários (src/pages/supplier/Questionnaire.jsx) ──────
export function DemoSupplierQuestionario() {
  const lista = DEMO_QUESTIONNAIRES.filter(q => q.active)
  const [answers, setAnswers] = useState(DEMO_SUPPLIER_ANSWERS)
  const [saving, setSaving] = useState({})
  const [saved, setSaved] = useState({})
  const set = (id, field, value) => setAnswers(p => ({ ...p, [id]: { ...p[id], [field]: value } }))
  const salvar = (q) => {
    setSaving(p => ({ ...p, [q.id]: true }))
    setTimeout(() => {
      setSaving(p => ({ ...p, [q.id]: false })); setSaved(p => ({ ...p, [q.id]: true }))
      setTimeout(() => setSaved(p => ({ ...p, [q.id]: false })), 3000)
    }, 600)
  }
  const chip = (on) => ({ padding:'8px 18px', borderRadius:20, border:`1.5px solid ${on?'#2E3192':'#e2e4ef'}`, background:on?'#2E3192':'#fff', color:on?'#fff':'#1a1c5e', fontFamily:D, fontSize:13, fontWeight:600, cursor:'pointer' })
  return (
    <div style={{ padding:'28px 32px', maxWidth:860, margin:'0 auto' }}>
      <PageHeader title="Questionários" subtitle="Responda às perguntas enviadas pelos clientes que te convidaram"/>
      {lista.map(q => {
        const answered = q.questions.filter(qq => answers[qq.id] && (answers[qq.id].boolean !== undefined || answers[qq.id].text)).length
        return (
          <Card key={q.id} style={{ borderRadius:16, padding:'24px', marginBottom:20 }}>
            <div style={{ marginBottom:16 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, marginBottom:4 }}>
                <div style={{ fontFamily:M, fontWeight:800, fontSize:16, color:'#1a1c5e' }}>{q.title}</div>
                <span style={{ fontSize:11, color: answered === q.questions.length ? '#15803d' : '#9B9B9B', fontFamily:D, whiteSpace:'nowrap', fontWeight:600 }}>{answered}/{q.questions.length} respondidas</span>
              </div>
              <div style={{ fontSize:13, color:'#64748b', fontFamily:D }}>{q.description}</div>
              <div style={{ fontSize:11, color:'#9B9B9B', fontFamily:D, marginTop:4 }}>Cliente: {HORIZONTE.razao}</div>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:14, marginBottom:20 }}>
              {q.questions.map((qq, i) => (
                <div key={qq.id} style={{ padding:'14px 16px', borderRadius:12, background:'#f8faff', border:'1px solid #e2e4ef' }}>
                  <div style={{ fontSize:13, fontWeight:600, color:'#1a1c5e', fontFamily:D, marginBottom:10 }}>
                    <span style={{ color:'#9B9B9B', marginRight:6 }}>{i+1}.</span>{qq.text}{qq.required && <span style={{ color:'#dc2626', marginLeft:4 }}>*</span>}
                  </div>
                  {qq.type === 'boolean' && (
                    <div style={{ display:'flex', gap:8 }}>
                      {[{ v:true, l:'Sim' }, { v:false, l:'Não' }].map(o => <button key={o.l} onClick={() => set(qq.id, 'boolean', o.v)} style={chip(answers[qq.id]?.boolean === o.v)}>{o.l}</button>)}
                    </div>
                  )}
                  {qq.type === 'text' && (
                    <textarea value={answers[qq.id]?.text || ''} onChange={e => set(qq.id, 'text', e.target.value)} placeholder="Sua resposta..." rows={3} style={{ ...INP, resize:'vertical' }}/>
                  )}
                  {qq.type === 'select' && (
                    <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                      {qq.options.map(o => <button key={o} onClick={() => set(qq.id, 'text', o)} style={chip(answers[qq.id]?.text === o)}>{o}</button>)}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <Button variant="primary" onClick={() => salvar(q)} disabled={saving[q.id]}>{saving[q.id] ? '⏳ Salvando...' : 'Salvar Respostas'}</Button>
              {saved[q.id] && <span style={{ fontSize:13, color:'#22c55e', fontFamily:D, fontWeight:600 }}>✓ Salvo com sucesso</span>}
            </div>
          </Card>
        )
      })}
    </div>
  )
}

// ── Fornecedor: Categorias ────────────────────────────────────────────────
export function DemoSupplierCategorias() {
  const [cats, setCats] = useState(DEMO_SUPPLIER_CATEGORIES)
  const [remover, setRemover] = useState(null)
  const [, setToast, ToastEl] = useToast()
  return (
    <Page title="Minhas Categorias" sub={`${cats.length} categoria${cats.length !== 1 ? 's' : ''} selecionada${cats.length !== 1 ? 's' : ''} · as categorias definem os documentos exigidos no seu processo`}
      action={<Button variant="primary" onClick={() => setToast('ℹ️ Demonstração: aqui você busca no catálogo de categorias e inclui na sua empresa.')}>+ Adicionar Categoria</Button>}>
      {ToastEl}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))', gap:14 }}>
        {cats.map((c, i) => {
          const rej = c.status === 'REJECTED_CNAE'
          return (
            <Card key={c.name} style={{ borderRadius:14, padding:'18px 20px', border: rej ? '1px solid #fecaca' : undefined }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
                <div style={{ fontSize:22 }}>📦</div>
                <span style={{ fontSize:10, fontWeight:700, fontFamily:M, padding:'3px 10px', borderRadius:20, color: rej ? '#b91c1c' : '#15803d', background: rej ? '#fee2e2' : '#dcfce7' }}>
                  {rej ? '✕ Reprovada — Horizonte' : 'Ativa'}
                </span>
              </div>
              <div style={{ fontFamily:M, fontWeight:800, fontSize:14, color:'#1a1c5e', marginTop:10 }}>{c.name}</div>
              <div style={{ fontFamily:D, fontSize:11, color:'#9B9B9B' }}>{c.parent}</div>
              <div style={{ fontFamily:D, fontSize:12, color:'#64748b', marginTop:10 }}>📋 {c.docs} documentos exigidos</div>
              {rej && <div style={{ fontFamily:D, fontSize:11.5, color:'#b91c1c', marginTop:6, lineHeight:1.4 }}>A atividade (CNAE) da empresa não cobre a categoria — reprovada no processo Horizonte; as demais seguem normalmente.</div>}
              {remover === i ? (
                <InlineConfirm msg={`Remover ${c.name}?`} confirmLabel="Remover" variant="danger" onCancel={() => setRemover(null)}
                  onConfirm={() => { setCats(p => p.filter((_, j) => j !== i)); setRemover(null); setToast(`✅ ${c.name} removida.`) }}/>
              ) : (
                <button onClick={() => setRemover(i)}
                  style={{ marginTop:12, width:'100%', padding:'7px 0', borderRadius:8, border:'1px solid #fecaca', background:'#fff', color:'#dc2626', fontFamily:M, fontWeight:700, fontSize:11, cursor:'pointer' }}>Remover</button>
              )}
            </Card>
          )
        })}
      </div>
    </Page>
  )
}

// ── Fornecedor: Meus Dados (cadastro + sócios editáveis) ──────────────────
export function DemoSupplierMeusDados() {
  const d = DEMO_MEUS_DADOS
  const [saved, setSaved] = useState(false)
  const [socios, setSocios] = useState(d.socios)
  const [novo, setNovo] = useState(null)
  const [, setToast, ToastEl] = useToast()
  const fields = [
    ['Razão Social', d.razao_social], ['Nome Fantasia', d.nome_fantasia],
    ['CNPJ', d.cnpj], ['Inscrição Estadual', d.ie], ['Inscrição Municipal', d.im],
    ['Data de Abertura', d.data_abertura], ['Tipo', d.tipo_empresa], ['Porte', d.porte],
    ['Telefone', d.telefone], ['E-mail', d.email], ['E-mail Financeiro', d.email_financeiro],
    ['CEP', d.cep], ['Endereço', d.endereco], ['Bairro', d.bairro], ['Cidade', d.cidade], ['UF', d.uf],
  ]
  return (
    <Page title="Meus Dados" sub="Mantenha seu cadastro atualizado — os clientes veem estas informações"
      action={<Button variant="primary" onClick={() => { setSaved(true); setTimeout(()=>setSaved(false), 2500) }}>{saved ? '✓ Salvo!' : '💾 Salvar Alterações'}</Button>}>
      {ToastEl}
      <Card style={{ borderRadius:16, padding:'22px 26px', marginBottom:20 }}>
        <div style={{ fontFamily:M, fontWeight:800, fontSize:14, color:'#1a1c5e', marginBottom:16 }}>🏢 Dados Cadastrais</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:14 }}>
          {fields.map(([label, value]) => (
            <div key={label}>
              <span style={LBL}>{label}</span>
              <input defaultValue={value} readOnly={label==='CNPJ'} style={{ ...INP, background: label==='CNPJ' ? '#f8f9fc' : '#fff' }}/>
            </div>
          ))}
        </div>
      </Card>
      <Card style={{ borderRadius:16, padding:'22px 26px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <div style={{ fontFamily:M, fontWeight:800, fontSize:14, color:'#1a1c5e' }}>👥 Quadro Societário</div>
          <Button variant="neutral" size="sm" onClick={() => setNovo({ nome:'', cpf:'', cargo:'Sócio' })}>+ Adicionar Sócio</Button>
        </div>
        {novo && (
          <div style={{ display:'flex', gap:8, marginBottom:12, flexWrap:'wrap' }}>
            <input placeholder="Nome completo *" value={novo.nome} onChange={e => setNovo({ ...novo, nome:e.target.value })} style={{ ...INP, flex:2, width:'auto' }}/>
            <input placeholder="CPF (somente números)" value={novo.cpf} onChange={e => setNovo({ ...novo, cpf:e.target.value.replace(/\D/g,'').slice(0,11) })} style={{ ...INP, flex:1, width:'auto' }}/>
            <input placeholder="Cargo" value={novo.cargo} onChange={e => setNovo({ ...novo, cargo:e.target.value })} style={{ ...INP, flex:1, width:'auto' }}/>
            <Button variant="neutral" size="sm" onClick={() => setNovo(null)}>Cancelar</Button>
            <Button variant="primary" size="sm" disabled={!novo.nome.trim() || novo.cpf.length !== 11} onClick={() => {
              setSocios(p => [...p, { nome:novo.nome.trim(), cargo:novo.cargo || 'Sócio', cpf:`***.${novo.cpf.slice(3,6)}.${novo.cpf.slice(6,9)}-**`, desde:brD(0) }])
              setNovo(null); setToast('✅ Sócio incluído — fica registrado no log do processo.')
            }}>Salvar</Button>
          </div>
        )}
        {socios.map((s, i) => (
          <div key={i} style={{ display:'flex', alignItems:'center', gap:14, padding:'12px 16px', borderRadius:12, border:'1px solid #eef0f6', marginBottom:8 }}>
            <div style={{ width:38, height:38, borderRadius:10, background:'#EEF0FF', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:M, fontWeight:800, fontSize:13, color:'#2E3192' }}>
              {s.nome.split(' ').map(w=>w[0]).slice(0,2).join('')}
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontFamily:M, fontWeight:700, fontSize:13, color:'#1a1c5e' }}>{s.nome}</div>
              <div style={{ fontFamily:D, fontSize:11, color:'#9B9B9B' }}>{s.cargo} · CPF {s.cpf} · desde {s.desde}</div>
            </div>
            <button style={{ background:'none', border:'none', cursor:'pointer', fontSize:14 }} title="Editar sócio" onClick={() => setToast(SO_REAL)}>✏️</button>
          </div>
        ))}
        <div style={{ fontFamily:D, fontSize:11, color:'#9B9B9B', marginTop:6 }}>O CPF é sempre exibido mascarado (LGPD).</div>
      </Card>
    </Page>
  )
}

// ── Fornecedor: Clientes ELOS (src/pages/supplier/ClientsDirectory.jsx) ───
export function DemoSupplierClientesElos() {
  const [clients, setClients] = useState(DEMO_ELOS_CLIENTS)
  const [modal, setModal] = useState(null)
  const [, setToast, ToastEl] = useToast()
  const declaradas = clients.filter(c => c.interesse).length
  const set = (id, v) => setClients(p => p.map(c => c.id === id ? { ...c, interesse: v } : c))
  return (
    <Page title="Clientes ELOS" sub={`Empresas contratantes da plataforma · ${declaradas} intenç${declaradas === 1 ? 'ão' : 'ões'} declarada${declaradas === 1 ? '' : 's'}`}>
      {ToastEl}
      <Card style={{ borderRadius:14, padding:'14px 20px', marginBottom:20, background:'rgba(46,49,146,.04)', border:'1px solid rgba(46,49,146,.1)' }}>
        <div style={{ fontFamily:D, fontSize:13, color:'#1a1c5e', lineHeight:1.6 }}>
          💡 Identificou sinergia com algum cliente? Declare sua intenção de prestar serviços — a empresa verá
          seu perfil no relatório de interessados e poderá enviar convite de homologação, contato ou cotação.
        </div>
      </Card>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:14 }}>
        {clients.map(c => (
          <Card key={c.id} style={{ borderRadius:14, padding:'18px 20px', display:'flex', flexDirection:'column', gap:12, border: c.interesse ? '1.5px solid #2E319255' : undefined }}>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ width:42, height:42, borderRadius:10, background:'rgba(46,49,146,.08)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:17, color:'#2E3192', flexShrink:0 }}>{c.name[0]}</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontFamily:M, fontWeight:700, fontSize:13.5, color:'#1a1c5e', lineHeight:1.25 }}>{c.name}</div>
                <div style={{ fontSize:11, color:'#9B9B9B', fontFamily:D }}>{c.segmento} · {c.uf}{c.portal ? ' · ' : ''}{c.portal && <span style={{ color:'#2E3192' }}>Ver portal ↗</span>}</div>
              </div>
            </div>
            {c.emProcesso ? (
              <span style={{ fontSize:11.5, fontWeight:700, color:'#b45309', background:'#fef3c7', padding:'6px 12px', borderRadius:8, fontFamily:M, textAlign:'center' }}>⏳ Sua homologação está em análise</span>
            ) : c.interesse ? (
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <span style={{ flex:1, fontSize:11.5, fontWeight:700, color:'#15803d', background:'rgba(34,197,94,.1)', padding:'6px 12px', borderRadius:8, fontFamily:M, textAlign:'center' }}>✓ Intenção declarada</span>
                <Button variant="neutral" size="sm" onClick={() => { set(c.id, false); setToast('✅ Intenção retirada.') }}>Retirar</Button>
              </div>
            ) : (
              <Button variant="primary" size="sm" full onClick={() => setModal({ c, msg:'' })}>🤝 Quero prestar serviços</Button>
            )}
          </Card>
        ))}
      </div>
      {modal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'#fff', borderRadius:16, padding:28, maxWidth:440, width:'100%', boxShadow:'0 20px 60px rgba(0,0,0,.2)' }}>
            <div style={{ fontFamily:M, fontWeight:800, fontSize:16, color:'#1a1c5e', marginBottom:4 }}>🤝 Intenção de Prestação de Serviços</div>
            <div style={{ fontFamily:D, fontSize:12.5, color:'#9B9B9B', marginBottom:16 }}>Sua empresa aparecerá no relatório de fornecedores interessados de <strong style={{ color:'#2E3192' }}>{modal.c.name}</strong>.</div>
            <span style={LBL}>Mensagem de apresentação (opcional)</span>
            <textarea rows={3} value={modal.msg} onChange={e => setModal(m => ({ ...m, msg:e.target.value }))} placeholder="Ex: Somos especializados em manutenção industrial com 15 anos de experiência no setor de mineração..." style={{ ...INP, resize:'vertical', marginBottom:16 }}/>
            <div style={{ display:'flex', gap:8 }}>
              <Button variant="neutral" full onClick={() => setModal(null)}>Cancelar</Button>
              <Button variant="primary" full onClick={() => { set(modal.c.id, true); setModal(null); setToast(`✅ Intenção declarada para ${modal.c.name}.`) }}>Declarar intenção</Button>
            </div>
          </div>
        </div>
      )}
    </Page>
  )
}

// ── Equipe (fornecedor: limite 4 · cliente: sem limite) ───────────────────
const BLOQUEADOS = ['gmail.com','hotmail.com','outlook.com','yahoo.com','yahoo.com.br','icloud.com','live.com','bol.com.br','uol.com.br','terra.com.br']
export function DemoTeam({ role }) {
  return role === 'SUPPLIER' ? <SupplierTeam/> : <ClientTeam/>
}

function SupplierTeam() {
  const [members, setMembers] = useState(DEMO_TEAM_SUPPLIER)
  const [confirmMaster, setConfirmMaster] = useState(null)
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [perfil, setPerfil] = useState('Acesso Total')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [inviting, setInviting] = useState(false)
  const active = members.filter(m => m.ativo).length
  const me = members.find(m => m.me)
  const isMaster = !!me?.master
  const tornarMaster = (m) => {
    setMembers(p => p.map(x => ({ ...x, master: x.id === m.id })))
    setConfirmMaster(null); setError(''); setSuccess(`${m.nome} agora é o master da empresa.`)
  }
  const convidar = () => {
    setError(''); setSuccess('')
    if (!nome.trim() || !email.trim()) { setError('Preencha nome e e-mail.'); return }
    if (BLOQUEADOS.includes(email.split('@')[1]?.toLowerCase())) { setError('E-mails de domínios pessoais não são permitidos. Use um e-mail corporativo.'); return }
    if (active >= 4) { setError('Limite de 4 usuários atingido. Desative um membro antes de convidar outro.'); return }
    setInviting(true)
    setTimeout(() => {
      setMembers(p => [...p, { id:`n${Date.now()}`, nome:nome.trim(), email:email.trim(), perfil, ativo:true, master:false, me:false, desde:isoD(0) }])
      setSuccess(`Convite enviado para ${email}! Um e-mail com as credenciais foi enviado.`); setNome(''); setEmail(''); setInviting(false)
    }, 700)
  }
  return (
    <div style={{ padding:'24px 32px', maxWidth:760, margin:'0 auto' }}>
      <PageHeader title="Equipe" subtitle="Gerencie os usuários com acesso à conta da empresa"/>
      <div style={{ display:'flex', gap:12, marginBottom:20 }}>
        {[[`${active}/4`, 'Usuários ativos', '#2E3192'], [`${4 - active}`, 'Vagas disponíveis', active < 4 ? '#22c55e' : '#9B9B9B']].map(([v, l, c]) => (
          <div key={l} style={{ flex:1, textAlign:'center', padding:'14px', background:`${c}0d`, borderRadius:12, border:`1px solid ${c}22` }}>
            <div style={{ fontSize:22, fontWeight:900, color:c, fontFamily:M }}>{v}</div>
            <div style={{ fontSize:11, color:'#64748b', fontFamily:D, marginTop:2 }}>{l}</div>
          </div>
        ))}
      </div>
      <Card style={{ borderRadius:14, padding:'20px 24px', marginBottom:20 }}>
        <SectionTitle>Membros atuais</SectionTitle>
        {members.map(m => (
          <div key={m.id}>
            <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', borderRadius:10, background:'#fafbff', border:'1px solid #e2e4ef', marginBottom:8, flexWrap:'wrap' }}>
              <div style={{ width:36, height:36, borderRadius:10, background: m.master ? 'rgba(46,49,146,.12)' : 'rgba(100,116,139,.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0 }}>{m.master ? '👑' : '👤'}</div>
              <div style={{ flex:1, minWidth:180 }}>
                <div style={{ fontFamily:D, fontSize:13, fontWeight:600, color:'#1a1c5e' }}>
                  {m.nome}{m.me && <span style={{ fontSize:10, color:'#2E3192', marginLeft:8, fontWeight:700 }}>(você)</span>}
                  {!m.ativo && <span style={{ fontSize:10, color:'#9B9B9B', marginLeft:8 }}>(inativo)</span>}
                </div>
                <div style={{ fontSize:11, color:'#9B9B9B', fontFamily:D }}>{m.email} · Adicionado em {fmtBR(m.desde)}</div>
              </div>
              {!m.master && isMaster && !m.me && (<>
                <select value={m.perfil} onChange={e => { const v = e.target.value; setMembers(p => p.map(x => x.id === m.id ? { ...x, perfil:v } : x)); setSuccess('Perfil de acesso atualizado.') }}
                  style={{ ...INP, width:'auto', minWidth:150, padding:'6px 8px', fontSize:12 }}>
                  {['Acesso Total', 'Documentos'].map(p => <option key={p}>{p}</option>)}
                </select>
                {m.ativo && <Button variant="neutral" size="sm" title="Passa a função de master para esta pessoa" onClick={() => setConfirmMaster(m.id)}>👑 Tornar master</Button>}
                <Button variant={m.ativo ? 'neutral' : 'success'} size="sm" onClick={() => {
                  if (!m.ativo && active >= 4) { setError('Limite de 4 usuários atingido. Desative um membro antes de reativar outro.'); return }
                  setMembers(p => p.map(x => x.id === m.id ? { ...x, ativo:!x.ativo } : x))
                }}>{m.ativo ? 'Desativar' : 'Reativar'}</Button>
              </>)}
              {m.master && <span style={{ fontSize:10, fontWeight:700, color:'#2E3192', background:'rgba(46,49,146,.08)', padding:'2px 10px', borderRadius:20, fontFamily:M }}>👑 Master</span>}
            </div>
            {confirmMaster === m.id && (
              <InlineConfirm msg={`Tornar ${m.nome} o master da empresa? Você deixa de ser o master: quem convida e gerencia a equipe passa a ser essa pessoa.`}
                confirmLabel="👑 Tornar master" onCancel={() => setConfirmMaster(null)} onConfirm={() => tornarMaster(m)}/>
            )}
          </div>
        ))}
      </Card>
      {error && <div style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:10, padding:'10px 14px', marginBottom:12, fontSize:13, color:'#dc2626', fontFamily:D }}>{error}</div>}
      {success && <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:10, padding:'10px 14px', marginBottom:12, fontSize:13, color:'#15803d', fontFamily:D }}>{success}</div>}
      {isMaster && active < 4 && (
        <Card style={{ borderRadius:14, padding:'20px 24px' }}>
          <SectionTitle>Convidar membro adicional</SectionTitle>
          <div style={{ marginBottom:12 }}><span style={LBL}>Nome completo</span><input value={nome} onChange={e => setNome(e.target.value)} placeholder="Maria da Silva" style={INP}/></div>
          <div style={{ marginBottom:12 }}>
            <span style={LBL}>E-mail corporativo</span><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="maria@primatus.com.br" style={INP}/>
            <div style={{ fontSize:11, color:'#9B9B9B', fontFamily:D, marginTop:4 }}>E-mails pessoais (Gmail, Hotmail, etc.) não são aceitos.</div>
          </div>
          <div style={{ marginBottom:12 }}>
            <span style={LBL}>Perfil de acesso</span>
            <select value={perfil} onChange={e => setPerfil(e.target.value)} style={INP}>{['Acesso Total', 'Documentos'].map(p => <option key={p}>{p}</option>)}</select>
            <div style={{ fontSize:11, color:'#9B9B9B', fontFamily:D, marginTop:4 }}>O usuário verá apenas os módulos do perfil escolhido.</div>
          </div>
          <Button variant="primary" full disabled={inviting || !email || !nome} onClick={convidar}>{inviting ? <><Spinner size={14}/> Enviando convite...</> : '📧 Enviar convite'}</Button>
        </Card>
      )}
      {isMaster && active >= 4 && (
        <div style={{ background:'rgba(245,158,11,.06)', border:'1px solid rgba(245,158,11,.2)', borderRadius:12, padding:'14px 18px', fontFamily:D, fontSize:13, color:'#92400e', textAlign:'center' }}>⚠ Limite de 4 usuários atingido. Desative um membro para liberar uma vaga.</div>
      )}
      {!isMaster && (
        <div style={{ background:'rgba(46,49,146,.04)', border:'1px solid rgba(46,49,146,.12)', borderRadius:12, padding:'14px 18px', fontFamily:D, fontSize:13, color:'#64748b', textAlign:'center' }}>Apenas o usuário master pode convidar ou gerenciar membros.</div>
      )}
    </div>
  )
}

function ClientTeam() {
  const [members, setMembers] = useState(DEMO_TEAM_CLIENT)
  const [confirmMaster, setConfirmMaster] = useState(null)
  const [modal, setModal] = useState(null)
  const [, setToast, ToastEl] = useToast()
  const perfis = ['Acesso Total', 'Homologação', 'Consulta (leitura)']
  const souMaster = members.some(x => x.me && x.master)
  return (
    <div style={{ padding:'28px 32px', maxWidth:1000, margin:'0 auto' }}>
      {ToastEl}
      <PageHeader title="Equipe" subtitle={`${members.length} usuário${members.length !== 1 ? 's' : ''} da sua empresa · sem limite de usuários`}
        action={{ label:'+ Convidar Usuário', onClick: () => setModal({ nome:'', email:'', perfil:'Homologação' }) }}/>
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {members.map(m => (
          <div key={m.id}>
            <Card style={{ borderRadius:12, padding:'14px 18px', opacity: m.ativo ? 1 : 0.6 }}>
              <div style={{ display:'flex', alignItems:'center', gap:14, flexWrap:'wrap' }}>
                <div style={{ width:42, height:42, borderRadius:10, background:'rgba(5,150,105,.12)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:16, color:'#059669', flexShrink:0 }}>{m.nome[0]}</div>
                <div style={{ flex:1, minWidth:180 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                    <span style={{ fontFamily:M, fontWeight:700, fontSize:14, color:'#1a1c5e' }}>{m.nome}</span>
                    {m.master && <span style={{ fontSize:10, fontWeight:700, color:'#F47E2F', background:'rgba(244,126,47,.12)', padding:'2px 8px', borderRadius:20, fontFamily:M }}>👑 MASTER</span>}
                    {m.me && <span style={{ fontSize:10, fontWeight:700, color:'#2E3192', background:'rgba(46,49,146,.08)', padding:'2px 8px', borderRadius:20, fontFamily:M }}>VOCÊ</span>}
                    {!m.ativo && <span style={{ fontSize:10, fontWeight:700, color:'#dc2626', background:'rgba(239,68,68,.1)', padding:'2px 8px', borderRadius:20, fontFamily:M }}>INATIVO</span>}
                  </div>
                  <div style={{ fontSize:11.5, color:'#9B9B9B', fontFamily:D, marginTop:2 }}>{m.email} · Desde {fmtBR(m.desde)}</div>
                </div>
                <div style={{ minWidth:180 }}>
                  <select value={m.perfil} disabled={m.me || m.master} title={m.me ? 'O próprio acesso é alterado por outro gestor da equipe' : m.master ? 'O usuário master tem acesso total' : ''}
                    onChange={e => { const v = e.target.value; setMembers(p => p.map(x => x.id === m.id ? { ...x, perfil:v } : x)); setToast('✅ Perfil de acesso atualizado.') }}
                    style={{ ...INP, padding:'8px 10px', fontSize:13, opacity: (m.me || m.master) ? .6 : 1 }}>
                    {perfis.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                {!m.master && !m.me && m.ativo && souMaster && (
                  <Button variant="neutral" size="sm" title="Passa a função de master para esta pessoa" onClick={() => setConfirmMaster(m.id)}>👑 Tornar master</Button>
                )}
                {!m.master && !m.me && (
                  <Button variant={m.ativo ? 'danger' : 'success'} size="sm" onClick={() => setMembers(p => p.map(x => x.id === m.id ? { ...x, ativo:!x.ativo } : x))}>{m.ativo ? 'Desativar' : '↺ Reativar'}</Button>
                )}
              </div>
            </Card>
            {confirmMaster === m.id && (
              <InlineConfirm msg={`Tornar ${m.nome} o master da empresa? Você deixa de ser o master: quem convida e gerencia a equipe passa a ser essa pessoa.`}
                confirmLabel="👑 Tornar master" onCancel={() => setConfirmMaster(null)}
                onConfirm={() => { setMembers(p => p.map(x => ({ ...x, master: x.id === m.id }))); setConfirmMaster(null); setToast(`✅ ${m.nome} agora é o master da empresa.`) }}/>
            )}
          </div>
        ))}
      </div>
      {modal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'#fff', borderRadius:16, padding:'28px 32px', maxWidth:440, width:'100%', boxShadow:'0 20px 60px rgba(0,0,0,.2)' }}>
            <div style={{ fontFamily:M, fontWeight:800, fontSize:17, color:'#1a1c5e', marginBottom:4 }}>+ Convidar Usuário</div>
            <div style={{ fontFamily:D, fontSize:12.5, color:'#9B9B9B', marginBottom:18 }}>O usuário receberá as credenciais por e-mail e verá apenas os módulos do perfil escolhido.</div>
            <div style={{ marginBottom:12 }}><span style={LBL}>Nome *</span><input value={modal.nome} onChange={e => setModal(x => ({ ...x, nome:e.target.value }))} placeholder="Maria Souza" style={INP}/></div>
            <div style={{ marginBottom:12 }}><span style={LBL}>E-mail *</span><input value={modal.email} onChange={e => setModal(x => ({ ...x, email:e.target.value }))} placeholder="maria@horizonte.com.br" style={INP}/></div>
            <div style={{ marginBottom:18 }}><span style={LBL}>Perfil de acesso</span><select value={modal.perfil} onChange={e => setModal(x => ({ ...x, perfil:e.target.value }))} style={INP}>{perfis.map(p => <option key={p}>{p}</option>)}</select></div>
            <div style={{ display:'flex', gap:8 }}>
              <Button variant="neutral" full onClick={() => setModal(null)}>Cancelar</Button>
              <Button variant="primary" full disabled={!modal.nome.trim() || !modal.email.includes('@')} onClick={() => {
                setMembers(p => [...p, { id:`n${Date.now()}`, nome:modal.nome.trim(), email:modal.email.trim(), perfil:modal.perfil, ativo:true, master:false, me:false, desde:isoD(0) }])
                setToast(`✅ Convite enviado para ${modal.email.trim()}.`); setModal(null)
              }}>📨 Convidar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Meu Plano — fornecedor (Plans.jsx) e comprador Pro (BuyerPlan.jsx) ────
const SEALS_PLANS = [
  { type:'verificado', name:'ELOS Verificado', icon:'🔵', color:'#2E3192', highlight:false, priceAnual:199, priceMensal:29, badge:null, features:[
    'Verificação automática via Receita Federal e BrasilAPI', 'Consulta de sanções (CEIS, CNEP)', 'Perfil público no marketplace SIGEC-ELOS',
    'Perfil Comprador Free incluído automaticamente', 'Alertas de vencimento de documentos', 'Monitoramento mensal automático'] },
  { type:'homologado', name:'ELOS Homologado', icon:'🏅', color:'#F47E2F', highlight:true, priceAnual:690, priceMensal:null, badge:'RECOMENDADO', features:[
    'Tudo do Verificado +', 'Análise humana pelo backoffice EQPI', 'Prioridade de exibição no marketplace', 'Documentos completos da categoria (todos os níveis)',
    'Relatório Assertiva de análise de crédito', 'Balanço patrimonial e DRE (2 anos)', 'Elegível para processos de homologação de clientes'] },
]
export const FEATURES_FREE = [
  '✅ Acesso ao marketplace de fornecedores', '✅ Perfis dos fornecedores (contatos mascarados)', '✅ Envio de convites de homologação',
  '❌ Contatos completos dos fornecedores', '❌ Solicitar cotações (RFQ)',
]
export const FEATURES_PRO = [
  '✅ Tudo do plano Free', '✅ Contatos completos dos fornecedores e dos sócios (telefone e e-mail)',
  '✅ Solicitar cotações para múltiplos fornecedores e receber as propostas na plataforma',
]
export function DemoPlano({ role }) {
  return role === 'SUPPLIER' ? <SupplierPlans/> : <BuyerPlan/>
}
function SupplierPlans() {
  const [billing, setBilling] = useState({ verificado:'anual' })
  const [, setToast, ToastEl] = useToast()
  const plan = DEMO_SUPPLIER.activePlan
  const atual = 'verificado'
  return (
    <div style={{ maxWidth:860, margin:'0 auto', padding:'32px 24px' }}>
      {ToastEl}
      <PageHeader title="Selos SIGEC-ELOS" subtitle="Escolha o nível de homologação para sua empresa"/>
      <div style={{ background:'linear-gradient(135deg,#1a1c5e,#2E3192)', borderRadius:14, padding:'16px 22px', marginBottom:20 }}>
        <div style={{ fontFamily:M, fontWeight:800, fontSize:15, color:'#fff' }}>⭐ Seu plano atual: ELOS Verificado · Anual</div>
        <div style={{ fontFamily:D, fontSize:12.5, color:'rgba(255,255,255,.7)', marginTop:2 }}>Válido até {fmtBR(plan.ends_at)} · os valores abaixo servem de referência para upgrade ou renovação</div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))', gap:20, marginBottom:24 }}>
        {SEALS_PLANS.map(seal => {
          const cycle = billing[seal.type] || 'anual'
          const price = cycle === 'mensal' ? seal.priceMensal : seal.priceAnual
          const monthly = cycle === 'mensal' ? price : Math.ceil(price / 12)
          return (
            <div key={seal.type} style={{ background:'#fff', borderRadius:20, padding:'28px 24px', border: atual===seal.type ? '2px solid #22c55e' : seal.highlight ? `2px solid ${seal.color}` : '1px solid #e2e4ef', position:'relative', boxShadow: seal.highlight ? '0 8px 32px rgba(244,126,47,.15)' : '0 2px 12px rgba(0,0,0,.04)' }}>
              {atual===seal.type && <span style={{ position:'absolute', top:-11, right:20, fontSize:10, fontWeight:800, fontFamily:M, background:'#22c55e', color:'#fff', padding:'3px 12px', borderRadius:20 }}>SEU PLANO ATUAL</span>}
              {seal.badge && <div style={{ position:'absolute', top:-14, left:'50%', transform:'translateX(-50%)', background:'linear-gradient(135deg,#F47E2F,#ff9a52)', color:'#fff', fontSize:11, fontWeight:800, letterSpacing:1, padding:'4px 16px', borderRadius:20, fontFamily:M, whiteSpace:'nowrap' }}>✦ {seal.badge}</div>}
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
                <span style={{ fontSize:26 }}>{seal.icon}</span>
                <div style={{ fontSize:18, fontWeight:800, color:seal.color, fontFamily:M }}>{seal.name}</div>
              </div>
              {seal.priceMensal && (
                <div style={{ display:'flex', gap:6, marginBottom:14 }}>
                  {['anual','mensal'].map(c => (
                    <button key={c} onClick={() => setBilling(p => ({ ...p, [seal.type]: c }))}
                      style={{ flex:1, padding:'6px', borderRadius:8, border:`1.5px solid ${cycle===c?seal.color:'#e2e4ef'}`, background:cycle===c?`${seal.color}10`:'#fff', cursor:'pointer', fontFamily:D, fontSize:11, color:cycle===c?seal.color:'#9B9B9B', fontWeight:cycle===c?700:400 }}>
                      {c === 'anual' ? 'Anual' : 'Mensal'}
                    </button>
                  ))}
                </div>
              )}
              <div style={{ marginBottom:18 }}>
                <div style={{ fontSize:34, fontWeight:900, color:'#1a1c5e', fontFamily:M, lineHeight:1 }}>R$ {price.toLocaleString('pt-BR')}</div>
                <div style={{ fontSize:12, color:'#9B9B9B', fontFamily:D, marginTop:4 }}>{cycle === 'mensal' ? '/mês' : `/ano · ~R$ ${monthly}/mês`}</div>
              </div>
              <div style={{ marginBottom:22 }}>
                {seal.features.map((f, i) => (
                  <div key={i} style={{ display:'flex', gap:8, alignItems:'flex-start', marginBottom:7 }}>
                    <span style={{ color:seal.color, fontSize:13, flexShrink:0, marginTop:1 }}>✓</span>
                    <span style={{ fontSize:13, color:'#374151', fontFamily:D, lineHeight:1.4 }}>{f}</span>
                  </div>
                ))}
              </div>
              <Button variant={seal.highlight ? 'orange' : 'primary'} full size="lg" style={{ borderRadius:12 }}
                onClick={() => setToast(`ℹ️ Demonstração: no ambiente real abre o checkout seguro do Stripe (${seal.name} · ${cycle === 'mensal' ? 'Mensal' : 'Anual'}).`)}>
                Contratar {seal.name} →
              </Button>
            </div>
          )
        })}
      </div>
      <div style={{ textAlign:'center', marginTop:16, fontSize:12, color:'#9B9B9B', fontFamily:D }}>
        🔒 Pagamento seguro via <strong style={{ color:'#1a1c5e' }}>Stripe</strong> · Boleto ou Cartão · Planos mensais ou anuais · Cancele quando quiser
      </div>
    </div>
  )
}
function BuyerPlan() {
  return (
    <div style={{ padding:'28px 32px', maxWidth:860, margin:'0 auto' }}>
      <PageHeader title="Meu Plano" subtitle="Comprador Pro ativo"/>
      <Card style={{ borderRadius:16, padding:28, marginBottom:24, border:'2px solid #F47E2F' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:16 }}>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
              <span style={{ fontSize:32 }}>⭐</span>
              <div style={{ fontFamily:M, fontWeight:800, fontSize:22, color:'#F47E2F' }}>Comprador Pro</div>
            </div>
            <div style={{ fontSize:14, color:'#9B9B9B', marginBottom:16, fontFamily:D }}>Anual · Válido até {brD(243)}</div>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {FEATURES_PRO.map((f, i) => <div key={i} style={{ fontSize:14, color:'#1a1c5e', fontFamily:D }}>{f}</div>)}
            </div>
          </div>
          <div style={{ background:'rgba(244,126,47,.08)', border:'1px solid rgba(244,126,47,.3)', borderRadius:12, padding:'16px 24px', textAlign:'center', minWidth:160 }}>
            <div style={{ fontSize:11, color:'#9B9B9B', fontFamily:M, textTransform:'uppercase', letterSpacing:.5, marginBottom:4 }}>Status</div>
            <div style={{ fontSize:16, fontWeight:800, color:'#22c55e', fontFamily:M }}>ATIVO</div>
          </div>
        </div>
      </Card>
      {/* comparação Free × Pro (o que o plano entrega de fato) */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))', gap:20, marginBottom:24 }}>
        <Card style={{ borderRadius:16, padding:24, border:'2px solid #e2e4ef' }}>
          <div style={{ fontFamily:M, fontWeight:800, fontSize:18, color:'#9B9B9B', marginBottom:4 }}>Free</div>
          <div style={{ fontSize:26, fontWeight:800, color:'#1a1c5e', fontFamily:M, marginBottom:16 }}>R$ 0</div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {FEATURES_FREE.map((f, i) => <div key={i} style={{ fontSize:13, color: f.startsWith('❌') ? '#9B9B9B' : '#1a1c5e', fontFamily:D }}>{f}</div>)}
          </div>
        </Card>
        <Card style={{ borderRadius:16, padding:24, border:'2px solid #F47E2F', background:'linear-gradient(145deg,#fff,#fff9f5)' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
            <div style={{ fontFamily:M, fontWeight:800, fontSize:18, color:'#F47E2F' }}>⭐ Pro</div>
            <span style={{ fontSize:10, fontWeight:700, background:'#22c55e', color:'#fff', padding:'3px 10px', borderRadius:20, fontFamily:M }}>SEU PLANO</span>
          </div>
          <div style={{ fontSize:26, fontWeight:800, color:'#1a1c5e', fontFamily:M, marginBottom:2 }}>R$ 1.990<span style={{ fontSize:14, fontWeight:400, color:'#9B9B9B' }}>/ano</span></div>
          <div style={{ fontSize:11, color:'#64748b', marginBottom:12, fontFamily:D }}>ou R$ 199/mês</div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {FEATURES_PRO.map((f, i) => <div key={i} style={{ fontSize:13, color:'#1a1c5e', fontFamily:D }}>{f}</div>)}
          </div>
        </Card>
      </div>
      <Card style={{ borderRadius:16, padding:20, background:'rgba(46,49,146,.03)', border:'1px solid rgba(46,49,146,.08)' }}>
        <div style={{ fontFamily:M, fontWeight:700, fontSize:14, color:'#1a1c5e', marginBottom:10 }}>Dúvidas sobre planos</div>
        <div style={{ fontSize:13, color:'#9B9B9B', fontFamily:D, lineHeight:1.6 }}>
          O plano Free permite navegar pelo marketplace e visualizar os fornecedores, com os contatos mascarados.
          O plano Pro libera os contatos completos dos fornecedores e a cotação (RFQ): você solicita propostas
          de vários fornecedores ao mesmo tempo e acompanha as respostas em Cotações. Para cancelar a
          assinatura, acesse o portal do cliente no Stripe ou entre em contato com o suporte.
        </div>
      </Card>
    </div>
  )
}

// ── Cliente › Configurações › Portal de Fornecedores (Settings.jsx) ───────
const SLUG = 'horizonte-mineracao'
const PORTAL_URL = `https://elos.eqpitech.com.br/portal/${SLUG}/login`
function FieldLabel({ children, required }) {
  return <div style={{ fontSize:12, fontWeight:700, color:'#1a1c5e', fontFamily:M, marginBottom:6 }}>{children}{required && <span style={{ color:'#ef4444', marginLeft:2 }}>*</span>}</div>
}
export function DemoClientConfig({ navigate }) {
  const [lp, setLp] = useState({
    company_name: HORIZONTE.razao, logo_url:'', hero_image_url:'', accent_color:'#f59e0b', secondary_color:'#14532d',
    phone:'(31) 3290-4400', contact_email:'suprimentos@horizonte.com.br', website_url:'https://www.horizontemineracao.com.br',
    linkedin_url:'https://linkedin.com/company/horizonte-mineracao', compliance_url:'https://www.horizontemineracao.com.br/compliance',
    description:'Mineradora com operações em Minas Gerais. Buscamos fornecedores comprometidos com segurança, meio ambiente e integridade.',
    badges:['ISO 14001', 'ISO 45001'], is_active:true,
  })
  const [badge, setBadge] = useState('')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [, setToast, ToastEl] = useToast()
  const f = (k) => ({ value: lp[k] ?? '', onChange: e => setLp(p => ({ ...p, [k]: e.target.value })) })
  const inp = { ...INP, fontSize:14, padding:'10px 14px' }
  const hint = { fontSize:11, color:'#9B9B9B', fontFamily:D, marginBottom:6, lineHeight:1.5 }
  const upload = (k) => pickFile((nome) => { setLp(p => ({ ...p, [k]: `https://cdn.demo/${SLUG}/${nome}` })); setToast(`✅ ${nome} enviado (demonstração).`) }, 'image/jpeg,image/png,image/webp,image/svg+xml')
  const copiar = async () => setToast(await copyText(PORTAL_URL) ? '✅ Link copiado para a área de transferência.' : `ℹ️ Não foi possível copiar automaticamente — o link é ${PORTAL_URL}`)
  const addBadge = () => { const t = badge.trim(); if (t && !lp.badges.includes(t)) setLp(p => ({ ...p, badges: [...p.badges, t] })); setBadge('') }
  const upBtn = { background:'rgba(46,49,146,.06)', border:'1px solid rgba(46,49,146,.2)', borderRadius:8, padding:'5px 12px', fontSize:12, color:'#2E3192', cursor:'pointer', fontFamily:D, fontWeight:600 }
  const cor = (k, def) => (
    <div style={{ display:'flex', gap:10, alignItems:'center' }}>
      <input type="color" value={lp[k] || def} onChange={e => setLp(p => ({ ...p, [k]: e.target.value }))} style={{ width:44, height:38, border:'1px solid #e2e4ef', borderRadius:8, cursor:'pointer', padding:2, flexShrink:0 }}/>
      <input {...f(k)} style={{ ...inp, width:110, flex:'none' }}/>
      <div style={{ width:38, height:38, borderRadius:8, background: lp[k] || def, border:'1px solid #e2e4ef', flexShrink:0 }}/>
    </div>
  )
  return (
    <div style={{ padding:'28px 32px', maxWidth:900, margin:'0 auto' }}>
      {ToastEl}
      <PageHeader title="Portal de Fornecedores" subtitle="Personalize a página pública de cadastro dos seus fornecedores"/>
      <Card style={{ borderRadius:16, padding:'28px 32px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20, gap:12, flexWrap:'wrap' }}>
          <div>
            <SectionTitle>Portal de Fornecedores</SectionTitle>
            <div style={{ fontFamily:D, fontSize:13, color:'#64748b', marginTop:4, maxWidth:520 }}>Configure sua landing page pública. Fornecedores que se cadastrarem pelo portal serão automaticamente vinculados à sua conta.</div>
          </div>
          <button onClick={() => navigate('portal_landing')} style={{ fontSize:13, color:'#2E3192', fontFamily:D, fontWeight:600, whiteSpace:'nowrap', background:'none', border:'none', cursor:'pointer' }}>Visualizar portal ↗</button>
        </div>

        <div style={{ background:'rgba(46,49,146,.04)', border:'1px solid rgba(46,49,146,.12)', borderRadius:12, padding:'14px 18px', marginBottom:20, display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
          <div style={{ flex:1, minWidth:240 }}>
            <div style={{ fontFamily:M, fontWeight:700, fontSize:12, color:'#1a1c5e', marginBottom:2 }}>🔑 Login personalizado da sua empresa</div>
            <div style={{ fontFamily:D, fontSize:12, color:'#64748b' }}>Compartilhe este endereço com seus fornecedores — a tela de login usa a sua marca e cores.</div>
            <code style={{ display:'inline-block', marginTop:6, fontSize:12, background:'#fff', border:'1px solid #e2e4ef', borderRadius:8, padding:'5px 10px', color:'#2E3192', fontFamily:'ui-monospace,monospace' }}>elos.eqpitech.com.br/portal/{SLUG}/login</code>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <Button variant="neutral" size="sm" onClick={copiar}>📋 Copiar link</Button>
            <Button variant="primary" size="sm" onClick={() => navigate('portal_login')}>Abrir ↗</Button>
          </div>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'20px 24px' }}>
          <div style={{ gridColumn:'1/-1' }}>
            <FieldLabel required>URL do Portal (slug)</FieldLabel>
            <div style={{ display:'flex', alignItems:'center' }}>
              <span style={{ padding:'10px 12px', background:'#f4f5f9', border:'1px solid #e2e4ef', borderRight:'none', borderRadius:'10px 0 0 10px', fontSize:13, color:'#9B9B9B', fontFamily:D, whiteSpace:'nowrap' }}>/portal/</span>
              <input value={SLUG} disabled style={{ ...inp, borderRadius:'0 10px 10px 0', background:'#f9f9f9', color:'#9B9B9B' }}/>
            </div>
            <div style={{ fontSize:11, color:'#9B9B9B', fontFamily:D, marginTop:4 }}>O slug não pode ser alterado após a criação.</div>
          </div>
          <div style={{ gridColumn:'1/-1' }}><FieldLabel required>Nome da Empresa</FieldLabel><input {...f('company_name')} style={inp}/></div>
          <div>
            <FieldLabel>Logo da Empresa</FieldLabel>
            <div style={hint}>PNG ou SVG com fundo transparente · máx. 5 MB · dimensão ideal: 240 × 80 px</div>
            <input {...f('logo_url')} placeholder="https://..." style={inp}/>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:6 }}><span style={{ fontSize:11, color:'#9B9B9B', fontFamily:D }}>ou</span><button type="button" onClick={() => upload('logo_url')} style={upBtn}>⬆ Fazer upload</button></div>
          </div>
          <div>
            <FieldLabel>Imagem de Capa (hero)</FieldLabel>
            <div style={hint}>JPG ou PNG · máx. 5 MB · 1440 × 600 px recomendado · aparece com baixa opacidade no fundo</div>
            <input {...f('hero_image_url')} placeholder="https://..." style={inp}/>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:6 }}><span style={{ fontSize:11, color:'#9B9B9B', fontFamily:D }}>ou</span><button type="button" onClick={() => upload('hero_image_url')} style={upBtn}>⬆ Fazer upload</button></div>
          </div>
          <div><FieldLabel>Cor Principal</FieldLabel><div style={hint}>Botões, destaques e ícones — padrão: laranja</div>{cor('accent_color', '#F47E2F')}</div>
          <div><FieldLabel>Cor Secundária</FieldLabel><div style={hint}>Fundos escuros e seções — padrão: azul</div>{cor('secondary_color', '#1B2A4A')}</div>
          <div><FieldLabel>Telefone da Empresa</FieldLabel><input {...f('phone')} style={inp}/></div>
          <div><FieldLabel>E-mail de Contato</FieldLabel><input {...f('contact_email')} style={inp}/></div>
          <div><FieldLabel>Website</FieldLabel><input {...f('website_url')} style={inp}/></div>
          <div><FieldLabel>LinkedIn</FieldLabel><input {...f('linkedin_url')} style={inp}/></div>
          <div style={{ gridColumn:'1/-1' }}><FieldLabel>URL do Portal de Compliance</FieldLabel><input {...f('compliance_url')} style={inp}/></div>
          <div style={{ gridColumn:'1/-1' }}><FieldLabel>Descrição da Empresa</FieldLabel><textarea {...f('description')} rows={4} style={{ ...inp, resize:'vertical' }}/></div>
          <div style={{ gridColumn:'1/-1' }}>
            <FieldLabel>Selos e Certificações</FieldLabel>
            <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:10 }}>
              {lp.badges.map(b => (
                <span key={b} style={{ display:'inline-flex', alignItems:'center', gap:6, background:'rgba(46,49,146,.08)', color:'#2E3192', padding:'4px 10px 4px 12px', borderRadius:20, fontSize:12, fontFamily:M, fontWeight:700 }}>
                  {b}<button onClick={() => setLp(p => ({ ...p, badges: p.badges.filter(x => x !== b) }))} style={{ background:'none', border:'none', cursor:'pointer', color:'#9B9B9B', padding:0, fontSize:16, lineHeight:1 }}>×</button>
                </span>
              ))}
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <input value={badge} onChange={e => setBadge(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addBadge() } }} placeholder="Ex: ISO 9001, GPTW, FSC..." style={{ ...inp, flex:1 }}/>
              <Button variant="neutral" size="sm" onClick={addBadge}>+ Adicionar</Button>
            </div>
          </div>
          <div style={{ gridColumn:'1/-1' }}>
            <label style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer', userSelect:'none' }}>
              <input type="checkbox" checked={lp.is_active} onChange={e => setLp(p => ({ ...p, is_active: e.target.checked }))} style={{ width:18, height:18, cursor:'pointer' }}/>
              <div>
                <div style={{ fontSize:13, fontWeight:700, color:'#1a1c5e', fontFamily:M }}>Portal ativo</div>
                <div style={{ fontSize:11, color:'#9B9B9B', fontFamily:D }}>Quando inativo, o portal não aparece publicamente para novos cadastros.</div>
              </div>
            </label>
          </div>
        </div>
        <div style={{ display:'flex', justifyContent:'flex-end', alignItems:'center', gap:12, marginTop:24, paddingTop:20, borderTop:'1px solid #f0f0f0' }}>
          {saved && <span style={{ fontSize:12, fontWeight:700, color:'#22c55e', fontFamily:M }}>✓ Salvo com sucesso</span>}
          <Button variant="primary" disabled={saving} onClick={() => {
            if (!lp.company_name.trim()) { setToast('⚠ O nome da empresa é obrigatório.'); return }
            setSaving(true); setTimeout(() => { setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 3000) }, 600)
          }}>{saving ? '⏳ Salvando...' : 'Salvar Portal'}</Button>
        </div>
      </Card>
    </div>
  )
}

// ── Cliente › Configurações › Termos e Aceites (Terms.jsx + ClientTermsEditor) ─
const TERMOS_PADRAO = `TERMOS DE HOMOLOGAÇÃO — SIGEC-ELOS

1. O fornecedor declara que todas as informações e documentos enviados são verdadeiros, autênticos e estão dentro da validade.
2. O fornecedor compromete-se a manter seus documentos atualizados durante a vigência da homologação.
3. O descumprimento das obrigações documentais pode resultar na suspensão do processo de homologação.
4. A EQPI Tech atua como facilitadora da homologação; a decisão de contratação é da empresa contratante.`
export function DemoClientTerms() {
  const [items, setItems] = useState([
    { id:'t1', kind:'DOCUMENT', title:'Código de Conduta de Fornecedores', file_name:'codigo_conduta_horizonte.pdf', version:2, acceptances:37, active:true },
    { id:'t2', kind:'TEXT', title:'Política de Segurança da Informação', content:'O fornecedor se compromete a proteger as informações da Horizonte Mineração a que tiver acesso, usando-as apenas para a execução do contrato.', version:1, acceptances:12, active:true },
    { id:'t3', kind:'TEXT', title:'Termo de Confidencialidade (NDA)', content:'As partes mantêm sigilo sobre as informações técnicas e comerciais trocadas durante a homologação e a execução do contrato.', version:3, acceptances:0, active:false },
  ])
  const [showText, setShowText] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [fileTitle, setFileTitle] = useState('')
  const [remover, setRemover] = useState(null)
  const [err, setErr] = useState('')
  const [terms, setTerms] = useState(TERMOS_PADRAO)
  const [original, setOriginal] = useState(TERMOS_PADRAO)
  const [isDefault, setIsDefault] = useState(true)
  const [savedTerms, setSavedTerms] = useState(false)
  const [restaurar, setRestaurar] = useState(false)
  const [, setToast, ToastEl] = useToast()

  const saveText = () => {
    if (!title.trim()) return
    if (editItem) setItems(p => p.map(i => i.id === editItem.id ? { ...i, title:title.trim(), content, version: content !== editItem.content ? i.version + 1 : i.version } : i))
    else setItems(p => [...p, { id:`t${Date.now()}`, kind:'TEXT', title:title.trim(), content, version:1, acceptances:0, active:true }])
    setShowText(false); setEditItem(null); setTitle(''); setContent(''); setToast('✅ Item salvo.')
  }
  const upload = () => {
    if (!fileTitle.trim()) { setErr('Dê um título ao documento antes de escolher o arquivo.'); return }
    setErr('')
    pickFile((nome) => { setItems(p => [...p, { id:`t${Date.now()}`, kind:'DOCUMENT', title:fileTitle.trim(), file_name:nome, version:1, acceptances:0, active:true }]); setFileTitle(''); setToast('✅ PDF incluído nos documentos de aceite.') }, '.pdf')
  }
  const remove = (it) => {
    if (it.acceptances > 0) setItems(p => p.map(i => i.id === it.id ? { ...i, active:false } : i))
    else setItems(p => p.filter(i => i.id !== it.id))
    setRemover(null); setToast(it.acceptances > 0 ? `✅ "${it.title}" desativado — a trilha de aceites é preservada.` : `✅ "${it.title}" excluído.`)
  }
  return (
    <div style={{ padding:'28px 32px', maxWidth:900, margin:'0 auto' }}>
      {ToastEl}
      <PageHeader title="Termos e Aceites" subtitle="O que o fornecedor lê e aceita ao se cadastrar para a sua homologação"/>
      <Card style={{ borderRadius:16, padding:'22px 26px', marginBottom:20 }}>
        <SectionTitle style={{ marginBottom:6 }}>Documentos de aceite do fornecedor</SectionTitle>
        <div style={{ fontSize:12, color:'#9B9B9B', fontFamily:D, marginBottom:16 }}>
          Cada item aparece com um checkbox próprio no cadastro do fornecedor. O aceite fica registrado com versão, data, e-mail e IP. Itens com aceites nunca são apagados — apenas desativados.
        </div>
        {err && <div style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:10, padding:'8px 12px', marginBottom:12, fontSize:12, color:'#dc2626' }}>{err}</div>}
        {items.map(it => (
          <div key={it.id}>
            <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 14px', borderRadius:12, border:'1px solid #eef0f6', marginBottom:8, background: it.active ? '#fff' : '#f8f9fb', opacity: it.active ? 1 : .65, flexWrap:'wrap' }}>
              <span style={{ fontSize:20 }}>{it.kind === 'DOCUMENT' ? '📄' : '📝'}</span>
              <div style={{ flex:1, minWidth:200 }}>
                <div style={{ fontSize:13, fontWeight:700, color:'#1a1c5e', fontFamily:M }}>{it.title}</div>
                <div style={{ fontSize:11, color:'#9B9B9B', fontFamily:D }}>{it.kind === 'DOCUMENT' ? it.file_name : 'Texto'} · v{it.version} · {it.acceptances} aceite{it.acceptances !== 1 ? 's' : ''}{!it.active && ' · INATIVO'}</div>
              </div>
              {it.kind === 'DOCUMENT'
                ? <Button variant="neutral" size="sm" onClick={() => setToast('ℹ️ Demonstração: no ambiente real o PDF abre em nova aba.')}>👁 Ver</Button>
                : <Button variant="neutral" size="sm" onClick={() => { setEditItem(it); setTitle(it.title); setContent(it.content || ''); setShowText(true) }}>✏️ Editar</Button>}
              <Button variant="neutral" size="sm" onClick={() => setItems(p => p.map(i => i.id === it.id ? { ...i, active:!i.active } : i))}>{it.active ? '⏸ Desativar' : '▶ Ativar'}</Button>
              <Button variant="danger" size="sm" onClick={() => setRemover(it.id)}>🗑</Button>
            </div>
            {remover === it.id && (
              <InlineConfirm msg={it.acceptances > 0 ? `"${it.title}" tem ${it.acceptances} aceite(s) registrados — será apenas DESATIVADO (a trilha de aceites é preservada). Continuar?` : `Excluir "${it.title}"?`}
                confirmLabel={it.acceptances > 0 ? 'Desativar' : 'Excluir'} variant="danger" onCancel={() => setRemover(null)} onConfirm={() => remove(it)}/>
            )}
          </div>
        ))}
        <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginTop:16, alignItems:'center' }}>
          <Button variant="primary" size="sm" onClick={() => { setEditItem(null); setTitle(''); setContent(''); setShowText(true) }}>+ Item de texto</Button>
          <div style={{ display:'flex', gap:6, alignItems:'center' }}>
            <input value={fileTitle} onChange={e => setFileTitle(e.target.value)} placeholder="Título do documento (ex.: Código de Conduta)" style={{ padding:'8px 12px', borderRadius:10, border:'1px solid #e2e4ef', fontSize:12, fontFamily:D, width:260 }}/>
            <Button variant="orange" size="sm" onClick={upload}>↑ Subir PDF</Button>
          </div>
        </div>
        {showText && (
          <div style={{ marginTop:16, border:'1px solid #e2e4ef', borderRadius:12, padding:16, background:'#f8f9fb' }}>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título (ex.: Termos de Homologação)" style={{ ...INP, marginBottom:8 }}/>
            <textarea value={content} onChange={e => setContent(e.target.value)} rows={8} placeholder="Texto integral que o fornecedor deverá aceitar..." style={{ ...INP, fontSize:12, resize:'vertical' }}/>
            <div style={{ display:'flex', gap:8, marginTop:8 }}>
              <Button variant="primary" size="sm" onClick={saveText}>{editItem ? 'Salvar alterações' : 'Adicionar'}</Button>
              <Button variant="neutral" size="sm" onClick={() => { setShowText(false); setEditItem(null) }}>Cancelar</Button>
            </div>
            {editItem && <div style={{ fontSize:11, color:'#9B9B9B', marginTop:6, fontFamily:D }}>Alterar o texto cria a versão v{editItem.version + 1} — aceites antigos continuam vinculados à versão anterior.</div>}
          </div>
        )}
      </Card>

      <Card style={{ borderRadius:16, padding:'24px 28px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12, gap:10, flexWrap:'wrap' }}>
          <div>
            <SectionTitle>Termos de Homologação (texto de leitura)</SectionTitle>
            <div style={{ fontFamily:D, fontSize:12, color:'#64748b', marginTop:4, maxWidth:520 }}>Bloco de texto exibido no topo do passo de aceite do cadastro. Em branco, o fornecedor vê os termos padrão do SIGEC-ELOS.</div>
          </div>
          {isDefault && terms === original
            ? <span style={{ fontSize:11, fontWeight:700, color:'#9B9B9B', background:'#f0f0f0', borderRadius:20, padding:'4px 10px', fontFamily:M }}>Usando termos padrão — edite para personalizar</span>
            : <span style={{ fontSize:11, fontWeight:700, color:'#2E3192', background:'rgba(46,49,146,.1)', borderRadius:20, padding:'4px 10px', fontFamily:M }}>Personalizado</span>}
        </div>
        <textarea value={terms} onChange={e => setTerms(e.target.value)} rows={12}
          style={{ width:'100%', padding:'14px 16px', borderRadius:12, border:'1px solid #e2e4ef', fontFamily:'ui-monospace,monospace', fontSize:13, color:'#1a1c5e', resize:'vertical', lineHeight:1.6, boxSizing:'border-box', outline:'none' }}/>
        {restaurar && (
          <InlineConfirm msg="Restaurar os termos padrão SIGEC-ELOS? O texto personalizado será removido." confirmLabel="Restaurar" onCancel={() => setRestaurar(false)}
            onConfirm={() => { setTerms(TERMOS_PADRAO); setOriginal(TERMOS_PADRAO); setIsDefault(true); setRestaurar(false); setSavedTerms(true); setTimeout(() => setSavedTerms(false), 3000) }}/>
        )}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:12 }}>
          <button onClick={() => !isDefault && setRestaurar(true)} disabled={isDefault}
            style={{ background:'none', border:'none', cursor: isDefault ? 'default' : 'pointer', color:'#9B9B9B', fontSize:13, fontFamily:D, textDecoration: isDefault ? 'none' : 'underline', padding:0, opacity: isDefault ? 0.5 : 1 }}>Restaurar termos padrão</button>
          <div style={{ display:'flex', gap:10, alignItems:'center' }}>
            {savedTerms && <span style={{ color:'#22c55e', fontFamily:M, fontWeight:700, fontSize:12 }}>✓ Salvo</span>}
            <Button variant="primary" disabled={terms === original} onClick={() => { setOriginal(terms); setIsDefault(false); setSavedTerms(true); setTimeout(() => setSavedTerms(false), 3000) }}>Salvar Termos</Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

// ── Ajuda (src/pages/Help.jsx) ────────────────────────────────────────────
const MANUAIS = [
  { key:'fornecedor', icon:'🏭', title:'Manual do Fornecedor', desc:'Cadastro, documentos, processos, renovação, cotações e equipe' },
  { key:'cliente',    icon:'🏢', title:'Manual do Cliente',    desc:'Painel, fornecedores, convites, carta de exceção, relatórios e equipe' },
  { key:'comprador',  icon:'🛒', title:'Manual do Comprador',  desc:'Marketplace, ficha do fornecedor, convites, planos e cotações' },
  { key:'backoffice', icon:'⚙️', title:'Manual do Backoffice', desc:'Uso interno da equipe EQPI', admin:true },
]
const ROLE_MANUAL = { SUPPLIER:'fornecedor', CLIENT:'cliente', BUYER:'comprador', ADMIN:'backoffice' }
export function DemoHelp({ role }) {
  const meu = ROLE_MANUAL[role]
  const lista = MANUAIS.filter(m => !m.admin || role === 'ADMIN').sort((a, b) => (b.key === meu) - (a.key === meu))
  return (
    <div style={{ padding:'28px 32px', maxWidth:820, margin:'0 auto' }}>
      <PageHeader title="Ajuda" subtitle="Manuais da plataforma e canais de suporte da EQPI"/>
      <Card style={{ borderRadius:16, padding:'24px 28px', marginBottom:20 }}>
        <SectionTitle>Manuais</SectionTitle>
        <p style={{ fontFamily:D, fontSize:13.5, color:'#6b7280', margin:'0 0 16px' }}>Passo a passo com imagens das telas. As telas dos manuais mostram empresas e pessoas fictícias.</p>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(220px, 1fr))', gap:12 }}>
          {lista.map(m => (
            <div key={m.key} style={{ borderRadius:12, padding:'16px 18px', border:`1px solid ${m.key === meu ? '#F47E2F' : '#e2e4ef'}`, background: m.key === meu ? '#fff7ed' : '#f8f9fb' }}>
              <div style={{ fontSize:24, marginBottom:6 }}>{m.icon}</div>
              <div style={{ fontFamily:M, fontWeight:800, fontSize:14, color:'#1a1c5e' }}>{m.title}{m.key === meu && <span style={{ marginLeft:6, fontSize:10, color:'#F47E2F' }}>· seu perfil</span>}</div>
              <div style={{ fontFamily:D, fontSize:12.5, color:'#6b7280', marginTop:4, lineHeight:1.5 }}>{m.desc}</div>
              <div style={{ fontFamily:D, fontSize:12, color:'#9B9B9B', fontWeight:700, marginTop:10 }}>📄 PDF disponível no ambiente real</div>
            </div>
          ))}
        </div>
      </Card>
      <Card style={{ borderRadius:16, padding:'24px 28px' }}>
        <SectionTitle>Fale com o suporte</SectionTitle>
        <p style={{ fontFamily:D, fontSize:13.5, color:'#6b7280', margin:'0 0 16px' }}>Dúvidas sobre o acesso, documentos ou processos? A equipe da EQPI ajuda você.</p>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(220px, 1fr))', gap:12 }}>
          {[['✉️', 'E-mail', 'suporte@eqpitech.com.br'], ['💬', 'WhatsApp', '(11) 5039-6769']].map(([ic, l, v]) => (
            <div key={l} style={{ display:'flex', alignItems:'center', gap:12, borderRadius:12, padding:'14px 16px', border:'1px solid #e2e4ef', background:'#f8f9fb' }}>
              <span style={{ fontSize:22 }}>{ic}</span>
              <span>
                <span style={{ display:'block', fontFamily:M, fontWeight:700, fontSize:11, color:'#9B9B9B', textTransform:'uppercase', letterSpacing:.5 }}>{l}</span>
                <span style={{ display:'block', fontFamily:D, fontWeight:700, fontSize:14, color:'#1a1c5e' }}>{v}</span>
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

// ── Fornecedor: Certificado de Homologação (diploma imprimível) ───────────
// Réplica do certificado real (src/pages/supplier/Certificate.jsx) com
// dados fictícios — o comercial pode até imprimir/salvar PDF na demo.
export function DemoSupplierCertificado({ navigate }) {
  // certificado do selo próprio ELOS Verificado (mesmas categorias e datas da carteira de selos)
  const selo = DEMO_SEALS[0]
  const cats = PRIMATUS.categorias.map(c => c.nome).sort()
  const fmtDate = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { day:'2-digit', month:'long', year:'numeric' })

  return (
    <div style={{ minHeight:'calc(100vh - 58px)', background:'#3a3d52', padding:'32px 16px', fontFamily:D }}>
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 0; }
          body { background: #fff !important; }
          nav, .cert-toolbar { display: none !important; }
          .cert-sheet { box-shadow: none !important; margin: 0 auto !important; width: 100% !important; min-height: 100vh !important; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      {/* Barra de ações (some na impressão) */}
      <div className="cert-toolbar" style={{ maxWidth:1050, margin:'0 auto 20px', display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, flexWrap:'wrap' }}>
        <button onClick={() => navigate('dashboard')} style={{ background:'rgba(255,255,255,.12)', color:'#fff', border:'1px solid rgba(255,255,255,.25)', borderRadius:10, padding:'9px 18px', cursor:'pointer', fontFamily:D, fontSize:13 }}>← Voltar ao Dashboard</button>
        <button onClick={() => window.print()} style={{ background:'#F47E2F', color:'#fff', border:'none', borderRadius:10, padding:'11px 28px', cursor:'pointer', fontFamily:M, fontWeight:800, fontSize:14, boxShadow:'0 6px 20px rgba(244,126,47,.4)' }}>
          🖨️ Imprimir / Salvar PDF
        </button>
      </div>

      {/* Folha do certificado — A4 paisagem */}
      <div className="cert-sheet" style={{ maxWidth:1050, margin:'0 auto', background:'#fffdf8', boxShadow:'0 24px 80px rgba(0,0,0,.5)', position:'relative' }}>
        <div style={{ border:'4px solid #1a1c5e', padding:7 }}>
          <div style={{ border:'1.5px solid #b8860b', padding:'38px 56px 30px', position:'relative', minHeight:620, display:'flex', flexDirection:'column' }}>

            {/* Ornamentos de canto */}
            {[{ top:8, left:8, bt:'2px solid', bl:'2px solid' }, { top:8, right:8, bt:'2px solid', br:'2px solid' },
              { bottom:8, left:8, bb:'2px solid', bl:'2px solid' }, { bottom:8, right:8, bb:'2px solid', br:'2px solid' }].map((p, i) => (
              <div key={i} style={{ position:'absolute', width:34, height:34, borderColor:'#b8860b',
                top:p.top, left:p.left, right:p.right, bottom:p.bottom,
                borderTop:p.bt||'none', borderBottom:p.bb||'none', borderLeft:p.bl||'none', borderRight:p.br||'none' }}/>
            ))}

            {/* Cabeçalho */}
            <div style={{ textAlign:'center', marginBottom:22 }}>
              <div style={{ fontFamily:M, fontWeight:900, fontSize:13, letterSpacing:6, color:'#F47E2F', textTransform:'uppercase', marginBottom:14 }}>
                SIGEC · ELOS
              </div>
              <div style={{ fontFamily:"Georgia,'Times New Roman',serif", fontSize:52, fontWeight:700, color:'#1a1c5e', letterSpacing:10, textTransform:'uppercase', lineHeight:1 }}>
                Certificado
              </div>
              <div style={{ fontFamily:M, fontWeight:700, fontSize:12, letterSpacing:4, color:'#8a8fa8', textTransform:'uppercase', marginTop:10 }}>
                de Homologação de Fornecedor
              </div>
              <div style={{ width:180, height:2, background:'linear-gradient(90deg, transparent, #b8860b, transparent)', margin:'16px auto 0' }}/>
            </div>

            {/* Corpo */}
            <div style={{ textAlign:'center', flex:1 }}>
              <div style={{ fontFamily:'Georgia,serif', fontSize:16, color:'#4a4f66', marginBottom:10 }}>
                Certificamos que o fornecedor
              </div>
              <div style={{ fontFamily:'Georgia,serif', fontStyle:'italic', fontWeight:700, fontSize:34, color:'#1a1c5e', lineHeight:1.2, margin:'0 auto 8px', maxWidth:820 }}>
                {PRIMATUS.razao}
              </div>
              <div style={{ fontFamily:D, fontSize:14, color:'#4a4f66', marginBottom:18 }}>
                inscrito sob o CNPJ <strong style={{ color:'#1a1c5e' }}>{PRIMATUS.cnpj}</strong>
              </div>
              <div style={{ fontFamily:'Georgia,serif', fontSize:16.5, color:'#374151', lineHeight:1.7, maxWidth:840, margin:'0 auto' }}>
                está <strong>conforme</strong> no processo de homologação de fornecedores
                da plataforma <strong style={{ color:'#1a1c5e' }}>SIGEC-ELOS</strong>,
                para as categorias de prestação de serviço e/ou fornecimento:
              </div>
              <div style={{ margin:'16px auto 0', maxWidth:860, fontFamily:D, fontSize:12.5, color:'#4a4f66', lineHeight:1.9 }}>
                {cats.join('  ·  ')}
              </div>
            </div>

            {/* Rodapé: emissão · medalha · validade */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', marginTop:28, gap:20 }}>
              <div style={{ flex:1, textAlign:'left' }}>
                <div style={{ fontFamily:M, fontWeight:700, fontSize:10, letterSpacing:1.5, color:'#8a8fa8', textTransform:'uppercase', marginBottom:4 }}>Certificado Nº</div>
                <div style={{ fontFamily:D, fontSize:13, color:'#1a1c5e', fontWeight:700 }}>ELOS-DEMO4F2A81C09B</div>
                <div style={{ fontFamily:D, fontSize:11.5, color:'#8a8fa8', marginTop:6 }}>
                  Emitido em {fmtDate(selo.issued_at)}
                </div>
              </div>

              <div style={{ textAlign:'center', flexShrink:0 }}>
                <div style={{ width:92, height:92, borderRadius:'50%', margin:'0 auto',
                  background:'radial-gradient(circle at 35% 35%, #3d40b5, #1a1c5e)',
                  border:'4px solid #2E3192', boxShadow:'0 4px 16px rgba(0,0,0,.25)',
                  display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', color:'#fff' }}>
                  <div style={{ fontSize:26, lineHeight:1 }}>⭐</div>
                  <div style={{ fontFamily:M, fontWeight:900, fontSize:10, letterSpacing:1, marginTop:4 }}>VERIFICADO</div>
                </div>
              </div>

              <div style={{ flex:1, textAlign:'right' }}>
                <div style={{ fontFamily:M, fontWeight:700, fontSize:10, letterSpacing:1.5, color:'#8a8fa8', textTransform:'uppercase', marginBottom:4 }}>Válido até</div>
                <div style={{ fontFamily:D, fontSize:13, color:'#1a1c5e', fontWeight:700 }}>{fmtDate(selo.expires_at)}</div>
                <div style={{ borderTop:'1px solid #c9cddb', marginTop:14, paddingTop:6, display:'inline-block', minWidth:190 }}>
                  <div style={{ fontFamily:M, fontWeight:700, fontSize:11, color:'#1a1c5e' }}>EQPI Tech · SIGEC-ELOS</div>
                  <div style={{ fontFamily:D, fontSize:10, color:'#8a8fa8' }}>elos.eqpitech.com.br</div>
                </div>
              </div>
            </div>

            {/* Nota de verificação */}
            <div style={{ textAlign:'center', marginTop:16, fontFamily:D, fontSize:9.5, color:'#a8adc2' }}>
              Verifique a autenticidade e a situação atual deste certificado em <strong>elos.eqpitech.com.br/verificar</strong> — basta informar o número do certificado ·
              A validade está condicionada à manutenção da regularidade documental do fornecedor na plataforma SIGEC-ELOS.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Portal white-label FAKE (Horizonte Mineração) ─────────────────────────
// Landing page e login personalizados 100% fictícios, para a apresentação
// comercial não depender de nenhum portal real. Renderizam em tela cheia
// (sem a navbar do demo) com um botão discreto de retorno.
const HZ = { sec:'#14532d', acc:'#f59e0b', name:'Horizonte Mineração S/A' }

function BackPill({ navigate, to = 'configuracoes' }) {
  return (
    <button onClick={() => navigate(to)}
      style={{ position:'fixed', top:14, left:14, zIndex:1000, background:'rgba(0,0,0,.55)', color:'#fff', border:'1px solid rgba(255,255,255,.25)', borderRadius:20, padding:'7px 16px', cursor:'pointer', fontFamily:D, fontSize:12, backdropFilter:'blur(4px)' }}>
      ← Voltar ao demo
    </button>
  )
}

function HzLogo({ size = 26, light = true }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:9 }}>
      <div style={{ width:size+12, height:size+12, borderRadius:10, background:HZ.acc, display:'flex', alignItems:'center', justifyContent:'center', fontSize:size-6 }}>⛰️</div>
      <div>
        <div style={{ fontFamily:M, fontWeight:900, fontSize:size-8, color: light ? '#fff' : HZ.sec, letterSpacing:1, lineHeight:1 }}>HORIZONTE</div>
        <div style={{ fontFamily:M, fontWeight:700, fontSize:Math.max(8, size-18), color: light ? 'rgba(255,255,255,.65)' : '#9B9B9B', letterSpacing:3 }}>MINERAÇÃO</div>
      </div>
    </div>
  )
}

export function DemoPortalLanding({ navigate }) {
  const [, setToast, ToastEl] = useToast()
  return (
    <div style={{ minHeight:'100vh', background:'#fff', fontFamily:D }}>
      {ToastEl}
      <BackPill navigate={navigate}/>

      {/* Topbar */}
      <div style={{ background:HZ.sec, padding:'14px 5vw', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:12 }}>
        <HzLogo/>
        <div style={{ display:'flex', gap:10, alignItems:'center' }}>
          <button onClick={() => navigate('portal_login')}
            style={{ background:'none', border:'1px solid rgba(255,255,255,.4)', color:'#fff', borderRadius:10, padding:'9px 20px', cursor:'pointer', fontFamily:M, fontWeight:700, fontSize:12 }}>
            Já sou fornecedor — Entrar
          </button>
          <a href="#cadastro-demo" style={{ background:HZ.acc, color:'#1a1c1a', borderRadius:10, padding:'10px 22px', textDecoration:'none', fontFamily:M, fontWeight:800, fontSize:12 }}>
            Quero ser Fornecedor
          </a>
        </div>
      </div>

      {/* Hero */}
      <div style={{ background:`linear-gradient(150deg, ${HZ.sec} 0%, #1e6b3a 60%, ${HZ.acc}44 130%)`, padding:'72px 5vw 84px', textAlign:'center', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', inset:0, opacity:.08, fontSize:220, display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none' }}>⛰️</div>
        <div style={{ position:'relative' }}>
          <div style={{ fontFamily:M, fontWeight:700, fontSize:12, letterSpacing:3, color:HZ.acc, textTransform:'uppercase', marginBottom:16 }}>Programa de Homologação de Fornecedores</div>
          <h1 style={{ fontFamily:M, fontWeight:900, fontSize:'clamp(30px,4.5vw,52px)', color:'#fff', lineHeight:1.15, maxWidth:820, margin:'0 auto' }}>
            Faça parte da cadeia de fornecedores da Horizonte Mineração
          </h1>
          <p style={{ fontSize:16, color:'rgba(255,255,255,.75)', maxWidth:600, margin:'18px auto 32px', lineHeight:1.7 }}>
            Homologue sua empresa de forma 100% digital e torne-se apto a fornecer para uma das maiores mineradoras do país.
          </p>
          <a href="#cadastro-demo" style={{ background:HZ.acc, color:'#1a1c1a', borderRadius:12, padding:'16px 40px', textDecoration:'none', fontFamily:M, fontWeight:800, fontSize:16, boxShadow:`0 10px 30px ${HZ.acc}66`, display:'inline-block' }}>
            Iniciar Cadastro →
          </a>
          <div style={{ display:'flex', gap:'6vw', justifyContent:'center', marginTop:52, flexWrap:'wrap' }}>
            {[['128','fornecedores ativos'],['94','homologados'],['12 anos','de operação'],['5 dias','prazo médio de análise']].map(([v,l]) => (
              <div key={l}>
                <div style={{ fontFamily:M, fontWeight:900, fontSize:30, color:'#fff' }}>{v}</div>
                <div style={{ fontSize:12, color:'rgba(255,255,255,.6)' }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Benefícios */}
      <div style={{ padding:'64px 5vw', maxWidth:1100, margin:'0 auto' }}>
        <h2 style={{ fontFamily:M, fontWeight:800, fontSize:26, color:'#1a1c5e', textAlign:'center', marginBottom:40 }}>Por que se homologar?</h2>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))', gap:20 }}>
          {[
            ['📋','Processo 100% digital','Envie documentos pela plataforma e acompanhe a análise em tempo real.'],
            ['🏅','Selo de Homologado','Certificado oficial que comprova sua conformidade para fornecer.'],
            ['🔔','Renovação assistida','Alertas automáticos antes de qualquer documento vencer.'],
            ['🤝','Acesso ao ecossistema ELOS','Sua empresa visível para outros compradores da plataforma.'],
          ].map(([ic, t, d]) => (
            <div key={t} style={{ border:'1px solid #e2e4ef', borderRadius:16, padding:'26px 24px' }}>
              <div style={{ fontSize:30, marginBottom:12 }}>{ic}</div>
              <div style={{ fontFamily:M, fontWeight:800, fontSize:15, color:'#1a1c5e', marginBottom:8 }}>{t}</div>
              <div style={{ fontSize:13, color:'#64748b', lineHeight:1.6 }}>{d}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Cadastro CNPJ */}
      <div id="cadastro-demo" style={{ background:'#f4f5f9', padding:'56px 5vw' }}>
        <div style={{ maxWidth:520, margin:'0 auto', background:'#fff', borderRadius:20, padding:'36px 40px', boxShadow:'0 12px 40px rgba(0,0,0,.08)', textAlign:'center' }}>
          <div style={{ fontFamily:M, fontWeight:800, fontSize:20, color:'#1a1c5e', marginBottom:6 }}>Quero ser Fornecedor</div>
          <div style={{ fontSize:13, color:'#9B9B9B', marginBottom:22 }}>Informe o CNPJ da sua empresa para começar</div>
          <input placeholder="00.000.000/0000-00" style={{ ...INP, textAlign:'center', fontSize:16, padding:'13px', marginBottom:12 }}/>
          <button onClick={() => setToast('ℹ️ Demonstração: aqui o fornecedor inicia o cadastro já vinculado à Horizonte Mineração.')}
            style={{ width:'100%', padding:'14px', borderRadius:12, border:'none', background:HZ.sec, color:'#fff', fontFamily:M, fontWeight:800, fontSize:15, cursor:'pointer' }}>
            Iniciar Cadastro →
          </button>
          <div style={{ fontSize:11, color:'#9B9B9B', marginTop:12 }}>
            Ao solicitar o cadastro, você será vinculado como fornecedor da Horizonte Mineração.
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ background:HZ.sec, padding:'26px 5vw', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:12 }}>
        <HzLogo size={20}/>
        <div style={{ fontSize:12, color:'rgba(255,255,255,.55)' }}>
          Portal de Fornecedores · powered by <span style={{ color:HZ.acc, fontWeight:700 }}>SIGEC-ELOS</span>
        </div>
      </div>
    </div>
  )
}

export function DemoPortalLogin({ navigate }) {
  const inp = { width:'100%', padding:'12px 14px', borderRadius:10, border:'1px solid #e2e4ef', fontFamily:D, fontSize:14, color:'#1a1c5e', boxSizing:'border-box', outline:'none' }
  const lbl = { display:'block', fontFamily:M, fontWeight:600, fontSize:11, color:'#1a1c5e', letterSpacing:.5, marginBottom:6, textTransform:'uppercase' }
  const [, setToast, ToastEl] = useToast()
  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', padding:'32px 16px', position:'relative', fontFamily:D,
      background:`linear-gradient(150deg, ${HZ.sec} 0%, ${HZ.sec}ee 55%, ${HZ.acc}33 130%)` }}>
      <BackPill navigate={navigate}/>
      {ToastEl}

      <div style={{ width:'100%', maxWidth:420, position:'relative' }}>
        <div style={{ textAlign:'center', marginBottom:24, display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
          <HzLogo size={30}/>
          <div style={{ color:'rgba(255,255,255,.55)', fontSize:12, letterSpacing:.8 }}>
            Portal de Fornecedores · powered by <span style={{ color:HZ.acc, fontWeight:700 }}>SIGEC-ELOS</span>
          </div>
        </div>

        <div style={{ background:'#fff', borderRadius:20, padding:32, boxShadow:'0 24px 80px rgba(0,0,0,.35)' }}>
          <h2 style={{ fontFamily:M, fontWeight:800, fontSize:20, color:'#1a1c5e', marginBottom:4 }}>Entrar na plataforma</h2>
          <p style={{ fontSize:13, color:'#9B9B9B', marginBottom:22 }}>Acesso ao processo de homologação {HZ.name}</p>

          <div style={{ marginBottom:14 }}>
            <label style={lbl}>E-mail</label>
            <input type="email" placeholder="seu@email.com" defaultValue="lucas@primatus.com.br" style={inp}/>
          </div>
          <div style={{ marginBottom:18 }}>
            <label style={lbl}>Senha</label>
            <input type="password" placeholder="••••••••" defaultValue="demo1234" style={inp}/>
          </div>
          <button onClick={() => setToast('ℹ️ Demonstração: o fornecedor entra direto no ELOS, já no contexto da Horizonte Mineração.')}
            style={{ width:'100%', padding:'13px', borderRadius:12, border:'none', cursor:'pointer', background:HZ.acc, color:'#1a1c1a', fontFamily:M, fontWeight:800, fontSize:15, boxShadow:`0 8px 24px ${HZ.acc}55` }}>
            Entrar →
          </button>
          <div style={{ textAlign:'center', marginTop:12 }}>
            <button onClick={() => setToast('✅ Link de redefinição enviado por e-mail (demonstração).')}
              style={{ background:'none', border:'none', cursor:'pointer', color:'#9B9B9B', fontSize:13, fontFamily:D, textDecoration:'underline' }}>
              Esqueci minha senha
            </button>
          </div>
        </div>

        <div style={{ textAlign:'center', marginTop:18, display:'flex', flexDirection:'column', gap:8 }}>
          <span style={{ fontSize:13, color:'rgba(255,255,255,.65)' }}>
            Ainda não é fornecedor?{' '}
            <button onClick={() => navigate('portal_landing')}
              style={{ background:'none', border:'none', cursor:'pointer', color:HZ.acc, fontWeight:700, fontSize:13, fontFamily:D, textDecoration:'underline' }}>
              Solicite seu cadastro
            </button>
          </span>
        </div>
      </div>
    </div>
  )
}
