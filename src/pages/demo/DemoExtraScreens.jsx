// Telas demo que espelham os módulos atuais do ELOS (paridade com a
// aplicação real, dados 100% fictícios). Interações gravam só em estado local.
import { useState } from 'react'
import { Card, Button, ScoreBar } from '../../components/ui.jsx'
import {
  DEMO_QUESTIONARIO, DEMO_SUPPLIER_CATEGORIES, DEMO_MEUS_DADOS,
  DEMO_ELOS_CLIENTS, DEMO_TEAM_SUPPLIER, DEMO_TEAM_CLIENT,
} from './demoData.js'

const M  = 'Montserrat,sans-serif'
const D  = 'DM Sans,sans-serif'
const H1 = { fontFamily:M, fontWeight:800, fontSize:22, color:'#1a1c5e' }
const SUB = { fontFamily:D, fontSize:13, color:'#9B9B9B', marginTop:2 }
const LBL = { display:'block', fontFamily:M, fontWeight:700, fontSize:10, color:'#9B9B9B', letterSpacing:.5, textTransform:'uppercase', marginBottom:4 }
const INP = { width:'100%', padding:'9px 12px', borderRadius:10, border:'1px solid #e2e4ef', fontFamily:D, fontSize:13, color:'#1a1c5e', boxSizing:'border-box', outline:'none', background:'#fff' }

function Page({ title, sub, action, children }) {
  return (
    <div style={{ padding:'28px 32px', maxWidth:1100, margin:'0 auto' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:24, flexWrap:'wrap', gap:12 }}>
        <div><div style={H1}>{title}</div>{sub && <div style={SUB}>{sub}</div>}</div>
        {action}
      </div>
      {children}
    </div>
  )
}

// ── Fornecedor: Questionário ──────────────────────────────────────────────
export function DemoSupplierQuestionario() {
  const q = DEMO_QUESTIONARIO
  const pct = Math.round((q.progress / q.total) * 100)
  return (
    <Page title="Questionário de Homologação" sub={`Solicitado por ${q.clientName}`}>
      <Card style={{ borderRadius:16, padding:'20px 24px', marginBottom:20 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
          <span style={{ fontFamily:M, fontWeight:700, fontSize:13, color:'#1a1c5e' }}>Progresso</span>
          <span style={{ fontFamily:M, fontWeight:800, fontSize:13, color: pct===100?'#22c55e':'#F47E2F' }}>{q.progress}/{q.total} respondidas</span>
        </div>
        <ScoreBar score={pct}/>
      </Card>
      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        {q.questions.map((item, i) => (
          <Card key={i} style={{ borderRadius:12, padding:'16px 20px', border:`1px solid ${item.done?'#dcfce7':'#fde68a'}` }}>
            <div style={{ display:'flex', gap:12, alignItems:'flex-start' }}>
              <span style={{ fontSize:16 }}>{item.done ? '✅' : '📝'}</span>
              <div style={{ flex:1 }}>
                <div style={{ fontFamily:M, fontWeight:700, fontSize:13, color:'#1a1c5e' }}>{i+1}. {item.q}</div>
                {item.done
                  ? <div style={{ fontFamily:D, fontSize:13, color:'#15803d', marginTop:6 }}>{item.a}</div>
                  : <textarea rows={2} placeholder="Digite sua resposta..." style={{ ...INP, marginTop:8, resize:'vertical' }}/>
                }
              </div>
            </div>
          </Card>
        ))}
      </div>
      <div style={{ marginTop:20, textAlign:'right' }}>
        <Button variant="primary" onClick={() => alert('Demo: respostas enviadas ao cliente para avaliação!')}>Enviar Respostas</Button>
      </div>
    </Page>
  )
}

// ── Fornecedor: Categorias ────────────────────────────────────────────────
export function DemoSupplierCategorias() {
  const [cats, setCats] = useState(DEMO_SUPPLIER_CATEGORIES)
  return (
    <Page title="Minhas Categorias" sub="As categorias definem os documentos exigidos no seu processo"
      action={<Button variant="primary" onClick={() => alert('Demo: busque no catálogo de categorias e solicite inclusão.')}>+ Adicionar Categoria</Button>}>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))', gap:14 }}>
        {cats.map((c, i) => (
          <Card key={i} style={{ borderRadius:14, padding:'18px 20px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
              <div style={{ fontSize:22 }}>📦</div>
              <span style={{ fontSize:10, fontWeight:700, fontFamily:M, padding:'3px 10px', borderRadius:20,
                color: c.status==='ACTIVE'?'#15803d':'#b45309', background: c.status==='ACTIVE'?'#dcfce7':'#fef3c7' }}>
                {c.status==='ACTIVE' ? 'Ativa' : 'Em aprovação'}
              </span>
            </div>
            <div style={{ fontFamily:M, fontWeight:800, fontSize:14, color:'#1a1c5e', marginTop:10 }}>{c.name}</div>
            <div style={{ fontFamily:D, fontSize:11, color:'#9B9B9B' }}>{c.parent}</div>
            <div style={{ fontFamily:D, fontSize:12, color:'#64748b', marginTop:10 }}>📋 {c.docs} documentos exigidos</div>
            <button onClick={() => setCats(p => p.filter((_,j) => j!==i))}
              style={{ marginTop:12, width:'100%', padding:'7px 0', borderRadius:8, border:'1px solid #fecaca', background:'#fff', color:'#dc2626', fontFamily:M, fontWeight:700, fontSize:11, cursor:'pointer' }}>
              Remover
            </button>
          </Card>
        ))}
      </div>
    </Page>
  )
}

// ── Fornecedor: Meus Dados (cadastro + sócios editáveis) ──────────────────
export function DemoSupplierMeusDados() {
  const d = DEMO_MEUS_DADOS
  const [saved, setSaved] = useState(false)
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
          <Button variant="neutral" size="sm" onClick={() => alert('Demo: adicione sócios com nome, CPF e cargo.')}>+ Adicionar Sócio</Button>
        </div>
        {d.socios.map((s, i) => (
          <div key={i} style={{ display:'flex', alignItems:'center', gap:14, padding:'12px 16px', borderRadius:12, border:'1px solid #eef0f6', marginBottom:8 }}>
            <div style={{ width:38, height:38, borderRadius:10, background:'#EEF0FF', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:M, fontWeight:800, fontSize:13, color:'#2E3192' }}>
              {s.nome.split(' ').map(w=>w[0]).slice(0,2).join('')}
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontFamily:M, fontWeight:700, fontSize:13, color:'#1a1c5e' }}>{s.nome}</div>
              <div style={{ fontFamily:D, fontSize:11, color:'#9B9B9B' }}>{s.cargo} · CPF {s.cpf} · desde {s.desde}</div>
            </div>
            <button style={{ background:'none', border:'none', cursor:'pointer', fontSize:14 }} onClick={() => alert('Demo: edição de sócio')}>✏️</button>
          </div>
        ))}
      </Card>
    </Page>
  )
}

// ── Fornecedor: Clientes ELOS (convite reverso) ───────────────────────────
export function DemoSupplierClientesElos() {
  const [clients, setClients] = useState(DEMO_ELOS_CLIENTS)
  function toggle(id) {
    setClients(p => p.map(c => c.id === id ? { ...c, interesse: !c.interesse } : c))
  }
  return (
    <Page title="Clientes ELOS" sub="Empresas que homologam fornecedores na plataforma — declare interesse em fornecer">
      <div style={{ background:'#EEF0FF', border:'1px solid #c7cdf5', borderRadius:12, padding:'12px 18px', marginBottom:20, fontFamily:D, fontSize:13, color:'#2E3192' }}>
        💡 Ao declarar interesse, a empresa vê sua ficha no relatório <strong>"Fornecedores com intenção"</strong> e pode convidá-lo para homologação.
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(250px,1fr))', gap:14 }}>
        {clients.map(c => (
          <Card key={c.id} style={{ borderRadius:14, padding:'20px 22px', border:`1px solid ${c.homologado?'rgba(34,197,94,.3)':'#e2e4ef'}` }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
              <div style={{ width:42, height:42, borderRadius:11, background:'#EEF0FF', display:'flex', alignItems:'center', justifyContent:'center', fontSize:19 }}>🏢</div>
              {c.homologado && (
                <span style={{ fontSize:10, fontWeight:700, fontFamily:M, padding:'3px 10px', borderRadius:20, color:'#15803d', background:'#dcfce7' }}>✓ Homologado</span>
              )}
            </div>
            <div style={{ fontFamily:M, fontWeight:800, fontSize:14, color:'#1a1c5e', marginTop:12 }}>{c.name}</div>
            <div style={{ fontFamily:D, fontSize:12, color:'#9B9B9B', marginTop:2 }}>{c.segmento} · {c.uf}</div>
            <div style={{ fontFamily:D, fontSize:11, color:'#64748b', marginTop:8 }}>🏭 {c.fornecedores} fornecedores na cadeia</div>
            {!c.homologado && (
              <button onClick={() => toggle(c.id)}
                style={{ marginTop:14, width:'100%', padding:'9px 0', borderRadius:10, cursor:'pointer', fontFamily:M, fontWeight:700, fontSize:12,
                  border: c.interesse ? '1px solid #dcfce7' : 'none',
                  background: c.interesse ? '#f0fdf4' : '#F47E2F',
                  color: c.interesse ? '#15803d' : '#fff' }}>
                {c.interesse ? '✓ Interesse declarado' : '🤝 Tenho interesse em fornecer'}
              </button>
            )}
          </Card>
        ))}
      </div>
    </Page>
  )
}

// ── Equipe (fornecedor: limite 4 · cliente: sem limite) ───────────────────
export function DemoTeam({ role }) {
  const isSupplier = role === 'SUPPLIER'
  const [team] = useState(isSupplier ? DEMO_TEAM_SUPPLIER : DEMO_TEAM_CLIENT)
  const perfis = isSupplier
    ? ['Acesso Total', 'Documentos']
    : ['Acesso Total', 'Homologação', 'Consulta (leitura)']
  return (
    <Page title="Equipe" sub={isSupplier ? `Usuários da sua empresa (${team.length}/4 — limite do plano)` : 'Usuários da sua empresa — sem limite'}
      action={<Button variant="primary" onClick={() => alert('Demo: convide por e-mail e vincule a um perfil de acesso.')}>+ Convidar Usuário</Button>}>
      <div style={{ background:'#EEF0FF', border:'1px solid #c7cdf5', borderRadius:12, padding:'12px 18px', marginBottom:20, fontFamily:D, fontSize:13, color:'#2E3192' }}>
        🎛️ Cada usuário é vinculado a um <strong>perfil de acesso</strong> que define os módulos visíveis: {perfis.join(' · ')}
      </div>
      <Card style={{ borderRadius:16, padding:'8px 0' }}>
        {team.map((u, i) => (
          <div key={i} style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 22px', borderBottom: i < team.length-1 ? '1px solid #f4f5f9' : 'none', opacity: u.ativo ? 1 : .5 }}>
            <div style={{ width:38, height:38, borderRadius:10, background:'#EEF0FF', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:M, fontWeight:800, fontSize:13, color:'#2E3192' }}>
              {u.nome.split(' ').map(w=>w[0]).slice(0,2).join('')}
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontFamily:M, fontWeight:700, fontSize:13, color:'#1a1c5e' }}>
                {u.nome} {u.titular && <span style={{ fontSize:9, fontWeight:700, color:'#F47E2F', background:'#fff7ed', padding:'2px 8px', borderRadius:20, marginLeft:6 }}>TITULAR</span>}
              </div>
              <div style={{ fontFamily:D, fontSize:11, color:'#9B9B9B' }}>{u.email}</div>
            </div>
            <select defaultValue={u.perfil} disabled={u.titular} style={{ ...INP, width:190 }}>
              {perfis.map(p => <option key={p}>{p}</option>)}
            </select>
            <span style={{ fontSize:10, fontWeight:700, fontFamily:M, padding:'3px 10px', borderRadius:20,
              color: u.ativo ? '#15803d' : '#9B9B9B', background: u.ativo ? '#dcfce7' : '#f1f2f8' }}>
              {u.ativo ? 'Ativo' : 'Inativo'}
            </span>
          </div>
        ))}
      </Card>
    </Page>
  )
}

// ── Meu Plano (fornecedor e comprador) ────────────────────────────────────
export function DemoPlano({ role }) {
  const isSupplier = role === 'SUPPLIER'
  const plans = isSupplier
    ? [
        { name:'ELOS Verificado', price:'R$ 79/mês',  current:true,  perks:['Selo ELOS Verificado','Documentos automáticos (CNDs)','Presença no Marketplace','Score público'] },
        { name:'ELOS Homologado', price:'R$ 189/mês', current:false, perks:['Tudo do Verificado','Análise documental completa','Selo Homologado (maior destaque)','Prioridade em convites de clientes'] },
      ]
    : [
        { name:'Comprador Free',  price:'Grátis',      current:true,  perks:['Busca no Marketplace','5 fichas completas/mês','Convites ilimitados'] },
        { name:'Comprador Pro',   price:'R$ 149/mês',  current:false, perks:['Fichas ilimitadas','RFQ (cotações) ilimitadas','Alertas de novos fornecedores','Exportação de relatórios'] },
      ]
  return (
    <Page title="Meu Plano" sub={isSupplier ? 'Assinatura ativa · renova em 15/01/2027' : 'Escolha o plano ideal para sua operação de compras'}>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:18 }}>
        {plans.map((p, i) => (
          <Card key={i} style={{ borderRadius:18, padding:'26px 28px', border: p.current ? '2px solid #22c55e' : '2px solid #EEF0FF', position:'relative' }}>
            {p.current && (
              <span style={{ position:'absolute', top:-11, left:24, fontSize:10, fontWeight:800, fontFamily:M, background:'#22c55e', color:'#fff', padding:'3px 12px', borderRadius:20 }}>PLANO ATUAL</span>
            )}
            <div style={{ fontFamily:M, fontWeight:800, fontSize:16, color:'#1a1c5e' }}>{p.name}</div>
            <div style={{ fontFamily:M, fontWeight:900, fontSize:26, color: p.current ? '#22c55e' : '#F47E2F', margin:'8px 0 16px' }}>{p.price}</div>
            {p.perks.map((perk, j) => (
              <div key={j} style={{ fontFamily:D, fontSize:13, color:'#374151', padding:'5px 0', display:'flex', gap:8 }}>
                <span style={{ color:'#22c55e' }}>✓</span>{perk}
              </div>
            ))}
            {!p.current && (
              <Button variant="orange" full style={{ marginTop:16 }} onClick={() => alert('Demo: checkout via Stripe na versão completa.')}>
                Fazer Upgrade →
              </Button>
            )}
          </Card>
        ))}
      </div>
    </Page>
  )
}

// ── Cliente: Configurações (inclui portal white-label) ────────────────────
export function DemoClientConfig() {
  const [copied, setCopied] = useState(false)
  const portalUrl = 'elos.eqpitech.com.br/portal/horizonte-mineracao/login'
  return (
    <Page title="Configurações" sub="Dados da empresa, portal personalizado e preferências">
      <Card style={{ borderRadius:16, padding:'22px 26px', marginBottom:20 }}>
        <div style={{ fontFamily:M, fontWeight:800, fontSize:14, color:'#1a1c5e', marginBottom:16 }}>🏢 Dados da Empresa</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:14 }}>
          {[['Razão Social','Horizonte Mineração S/A'],['CNPJ','18.442.706/0001-30'],['Segmento','Mineração'],['Responsável','Rafael Costa']].map(([l,v]) => (
            <div key={l}><span style={LBL}>{l}</span><input defaultValue={v} style={INP}/></div>
          ))}
        </div>
      </Card>

      <Card style={{ borderRadius:16, padding:'22px 26px', marginBottom:20, border:'1px solid rgba(244,126,47,.3)', background:'linear-gradient(135deg,#fff 60%,#fff7ed)' }}>
        <div style={{ fontFamily:M, fontWeight:800, fontSize:14, color:'#1a1c5e', marginBottom:6 }}>🌐 Portal White-label</div>
        <div style={{ fontFamily:D, fontSize:13, color:'#64748b', marginBottom:14 }}>
          Página de login e cadastro com a <strong>sua marca</strong> — envie este link aos fornecedores convidados:
        </div>
        <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
          <code style={{ background:'#1a1c5e', color:'#a5b4fc', padding:'10px 16px', borderRadius:10, fontSize:12, flex:1, minWidth:260 }}>{portalUrl}</code>
          <Button variant="primary" size="sm" onClick={() => { setCopied(true); setTimeout(()=>setCopied(false),2000) }}>
            {copied ? '✓ Copiado!' : '📋 Copiar link'}
          </Button>
        </div>
        <div style={{ display:'flex', gap:14, marginTop:14, flexWrap:'wrap' }}>
          {[['Logo','sua logomarca no topo'],['Cores','identidade visual própria'],['Mensagem','texto de boas-vindas']].map(([l,v]) => (
            <div key={l} style={{ fontFamily:D, fontSize:12, color:'#64748b' }}>🎨 <strong>{l}:</strong> {v}</div>
          ))}
        </div>
      </Card>

      <Card style={{ borderRadius:16, padding:'22px 26px' }}>
        <div style={{ fontFamily:M, fontWeight:800, fontSize:14, color:'#1a1c5e', marginBottom:16 }}>📂 Fluxos de Homologação</div>
        {[['Fluxo Padrão','38 documentos', true],['Fluxo Serviços Críticos','44 documentos', true],['Fluxo Materiais','21 documentos', false]].map(([n, docs, active], i) => (
          <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', borderRadius:12, border:'1px solid #eef0f6', marginBottom:8, opacity: active ? 1 : .55 }}>
            <span style={{ fontSize:16 }}>📂</span>
            <div style={{ flex:1 }}>
              <div style={{ fontFamily:M, fontWeight:700, fontSize:13, color:'#1a1c5e' }}>{n}</div>
              <div style={{ fontFamily:D, fontSize:11, color:'#9B9B9B' }}>{docs} exigidos</div>
            </div>
            <span style={{ fontSize:10, fontWeight:700, fontFamily:M, padding:'3px 10px', borderRadius:20, color: active?'#15803d':'#9B9B9B', background: active?'#dcfce7':'#f1f2f8' }}>
              {active ? 'Ativo' : 'Inativo'}
            </span>
          </div>
        ))}
        <div style={{ fontFamily:D, fontSize:12, color:'#9B9B9B', marginTop:8 }}>
          💡 Cada categoria de fornecedor pode ter seu próprio fluxo de documentos.
        </div>
      </Card>
    </Page>
  )
}

// ── Fornecedor: Certificado de Homologação (diploma imprimível) ───────────
// Réplica do certificado real (src/pages/supplier/Certificate.jsx) com
// dados fictícios — o comercial pode até imprimir/salvar PDF na demo.
export function DemoSupplierCertificado({ navigate }) {
  const cats = ['Automação & Controle', 'Manutenção Industrial', 'Serviços Elétricos']
  const fmtDate = (d) => d.toLocaleDateString('pt-BR', { day:'2-digit', month:'long', year:'numeric' })
  const hoje = new Date()
  const validade = new Date(hoje); validade.setFullYear(validade.getFullYear() + 1)

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
                Primatus Serviços Técnicos Ltda
              </div>
              <div style={{ fontFamily:D, fontSize:14, color:'#4a4f66', marginBottom:18 }}>
                inscrito sob o CNPJ <strong style={{ color:'#1a1c5e' }}>34.218.904/0001-72</strong>
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
                  Emitido em {fmtDate(hoje)}
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
                <div style={{ fontFamily:D, fontSize:13, color:'#1a1c5e', fontWeight:700 }}>{fmtDate(validade)}</div>
                <div style={{ borderTop:'1px solid #c9cddb', marginTop:14, paddingTop:6, display:'inline-block', minWidth:190 }}>
                  <div style={{ fontFamily:M, fontWeight:700, fontSize:11, color:'#1a1c5e' }}>EQPI Tech · SIGEC-ELOS</div>
                  <div style={{ fontFamily:D, fontSize:10, color:'#8a8fa8' }}>elos.eqpitech.com.br</div>
                </div>
              </div>
            </div>

            {/* Nota de verificação */}
            <div style={{ textAlign:'center', marginTop:16, fontFamily:D, fontSize:9.5, color:'#a8adc2' }}>
              A autenticidade deste certificado pode ser verificada junto à EQPI Tech informando o número do certificado ·
              A validade está condicionada à manutenção da regularidade documental do fornecedor na plataforma SIGEC-ELOS.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
