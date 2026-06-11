import { useState } from 'react'
import { Card, KpiCard, ScoreBar, Button, Spinner } from '../../components/ui.jsx'
import { DEMO_FORNECEDOR, DEMO_PROCESSES } from './demoData.js'

const STEPS    = ['Empresa', 'Categorias', 'Contato', 'Plano']
const CATS     = ['Manutenção Industrial','Serviços Elétricos','Construção Civil','Automação & Controle','Limpeza e Conservação','Tecnologia','Transporte','Segurança do Trabalho']
const STATUS_C = { ACTIVE:'#22c55e', PENDING:'#f59e0b', SUSPENDED:'#f59e0b', EXPIRED:'#9B9B9B' }
const STATUS_L = { ACTIVE:'Ativo', PENDING:'Em análise', SUSPENDED:'Suspenso', EXPIRED:'Expirado' }
const PLANOS   = [
  { id:'verificado', name:'ELOS Verificado', price:'R$ 199/ano', tag:'✅ Automático', c:'#2E3192', bg:'#EEF0FF',
    benefits:['Vitrine imediata no marketplace','Validação automática de CNPJ','Score calculado em tempo real','Visível para todos os compradores'] },
  { id:'homologado',  name:'ELOS Homologado',  price:'R$ 690/ano', tag:'⭐ Premium', c:'#F47E2F', bg:'#fff5ed',
    benefits:['Tudo do Verificado incluído','Análise humana completa','Selo de reputação verificado','Acesso a clientes corporativos'] },
]

function Steps({ step }) {
  return (
    <div style={{ display:'flex', gap:4, justifyContent:'center', marginBottom:24 }}>
      {STEPS.map((s,i) => (
        <div key={s} style={{ padding:'4px 14px', borderRadius:20, fontSize:11, fontWeight:700, fontFamily:'Montserrat,sans-serif',
          background: i===step?'#2E3192': i<step?'#EEF0FF':'#f4f5f9',
          color:      i===step?'#fff':    i<step?'#2E3192':'#9B9B9B', transition:'all .2s' }}>{s}</div>
      ))}
    </div>
  )
}

const inp = { padding:'11px 14px', borderRadius:10, border:'1.5px solid rgba(46,49,146,.2)', fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#1a1c5e', background:'#fff', width:'100%', boxSizing:'border-box', marginBottom:14, outline:'none' }
const lbl = { fontSize:11, fontWeight:700, color:'#9B9B9B', textTransform:'uppercase', letterSpacing:.5, marginBottom:6, fontFamily:'Montserrat,sans-serif', display:'block' }

export default function FornecedorView() {
  const [screen,  setScreen]  = useState('cnpj')
  const [loading, setLoading] = useState(false)
  const [cats,    setCats]    = useState(['Manutenção Industrial'])
  const [plano,   setPlano]   = useState(null)

  const f = DEMO_FORNECEDOR
  const scoreC = f.score >= 90 ? '#22c55e' : f.score >= 70 ? '#f59e0b' : '#ef4444'

  const header = (title, sub) => (
    <div style={{ textAlign:'center', marginBottom:24 }}>
      <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:22, color:'#1a1c5e', marginBottom:6 }}>{title}</div>
      <div style={{ fontSize:13, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>{sub}</div>
    </div>
  )

  /* ── CNPJ ── */
  if (screen === 'cnpj') {
    const go = () => { setLoading(true); setTimeout(() => { setLoading(false); setScreen('empresa') }, 900) }
    return (
      <div>
        {header('Cadastre sua empresa','Informe o CNPJ para buscarmos os dados automaticamente')}
        <Steps step={0} />
        <Card>
          <label style={lbl}>CNPJ da empresa</label>
          <div style={{ ...inp, marginBottom:20, letterSpacing:1 }}>{f.cnpj}</div>
          {loading
            ? <div style={{ display:'flex', justifyContent:'center', padding:'8px 0' }}><Spinner size={32}/></div>
            : <Button variant="primary" full size="lg" onClick={go}>Consultar CNPJ →</Button>}
        </Card>
      </div>
    )
  }

  /* ── EMPRESA ── */
  if (screen === 'empresa') return (
    <div>
      {header('Dados da Empresa','Encontramos sua empresa na Receita Federal')}
      <Steps step={0} />
      <div style={{ background:'rgba(34,197,94,.12)', border:'1px solid rgba(34,197,94,.33)', borderRadius:12, padding:'10px 16px', display:'flex', alignItems:'center', gap:8, marginBottom:14, fontSize:13, color:'#22c55e', fontFamily:'DM Sans,sans-serif' }}>
        ✓ CNPJ ativo e regular na Receita Federal
      </div>
      <Card style={{ padding:'18px 18px', marginBottom:16 }}>
        {[['Razão Social',f.razaoSocial],['CNPJ',f.cnpj],['Município / UF',`${f.cidade} / ${f.uf}`],['Situação','ATIVA'],['Regime','Simples Nacional']].map(([l,v]) => (
          <div key={l} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid #f4f5f9' }}>
            <span style={{ fontSize:11, color:'#9B9B9B', fontFamily:'Montserrat,sans-serif', fontWeight:700, textTransform:'uppercase', letterSpacing:.3 }}>{l}</span>
            <span style={{ fontSize:13, color:'#1a1c5e', fontFamily:'DM Sans,sans-serif', fontWeight:600, textAlign:'right' }}>{v}</span>
          </div>
        ))}
      </Card>
      <Button variant="primary" full size="lg" onClick={() => setScreen('categorias')}>Confirmar e continuar →</Button>
    </div>
  )

  /* ── CATEGORIAS ── */
  if (screen === 'categorias') {
    const toggle = c => setCats(prev => prev.includes(c) ? prev.filter(x => x!==c) : [...prev, c])
    return (
      <div>
        {header('Categorias de Atuação','Selecione as áreas em que sua empresa atua')}
        <Steps step={1} />
        <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:16 }}>
          {CATS.map(c => {
            const on = cats.includes(c)
            return (
              <button key={c} onClick={() => toggle(c)} style={{ padding:'8px 14px', borderRadius:20, fontSize:12, fontFamily:'Montserrat,sans-serif', fontWeight:700,
                border:`1.5px solid ${on?'#2E3192':'#e2e4ef'}`, background:on?'#EEF0FF':'#fff', color:on?'#2E3192':'#9B9B9B', cursor:'pointer', transition:'all .15s' }}>
                {on?'✓ ':''}{c}
              </button>
            )
          })}
        </div>
        {cats.length > 0 && <div style={{ fontSize:12, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', marginBottom:12 }}>{cats.length} categoria(s) selecionada(s)</div>}
        <Button variant="primary" full size="lg" disabled={!cats.length} onClick={() => setScreen('contato')}>Continuar →</Button>
      </div>
    )
  }

  /* ── CONTATO ── */
  if (screen === 'contato') return (
    <div>
      {header('Dados de Contato','Informações do responsável pela empresa')}
      <Steps step={2} />
      <Card style={{ marginBottom:16 }}>
        {[['Nome completo','Lucas Andrade'],['E-mail corporativo','lucas@primatus.com.br'],['Telefone / WhatsApp','(11) 99834-2210']].map(([l,v]) => (
          <div key={l} style={{ marginBottom:4 }}>
            <label style={lbl}>{l}</label>
            <div style={inp}>{v}</div>
          </div>
        ))}
      </Card>
      <Button variant="primary" full size="lg" onClick={() => setScreen('plano')}>Continuar →</Button>
    </div>
  )

  /* ── PLANO ── */
  if (screen === 'plano') {
    const assinar = pid => {
      setPlano(pid); setLoading(true)
      setTimeout(() => { setLoading(false); setScreen('sucesso') }, 1800)
    }
    if (loading) return (
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'72px 0' }}>
        <div style={{ marginBottom:22 }}><Spinner size={52}/></div>
        <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:16, color:'#1a1c5e', marginBottom:6 }}>Processando pagamento...</div>
        <div style={{ fontSize:13, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>Confirmando sua assinatura</div>
      </div>
    )
    return (
      <div>
        {header('Escolha seu Plano','Selecione como quer aparecer no marketplace')}
        <Steps step={3} />
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          {PLANOS.map(p => (
            <Card key={p.id} style={{ border:`2px solid ${p.c}33`, padding:'20px 18px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
                <div>
                  <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:16, color:'#1a1c5e', marginBottom:4 }}>{p.name}</div>
                  <span style={{ background:p.bg, color:p.c, fontSize:10, fontFamily:'Montserrat,sans-serif', fontWeight:700, padding:'3px 10px', borderRadius:20 }}>{p.tag}</span>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:22, color:p.c }}>{p.price}</div>
                  <div style={{ fontSize:11, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>por empresa</div>
                </div>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:16 }}>
                {p.benefits.map(b => (
                  <div key={b} style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, color:'#333', fontFamily:'DM Sans,sans-serif' }}>
                    <span style={{ color:p.c, fontWeight:700 }}>✓</span> {b}
                  </div>
                ))}
              </div>
              <Button variant={p.id==='homologado'?'orange':'primary'} full onClick={() => assinar(p.id)}>Assinar {p.name}</Button>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  /* ── SUCESSO ── */
  if (screen === 'sucesso') {
    const pName = plano === 'homologado' ? 'ELOS Homologado' : 'ELOS Verificado'
    return (
      <div style={{ textAlign:'center', padding:'24px 0' }}>
        <div style={{ fontSize:64, marginBottom:16 }}>🎉</div>
        <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:22, color:'#1a1c5e', marginBottom:8 }}>Cadastro realizado!</div>
        <div style={{ fontSize:14, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', marginBottom:24, lineHeight:1.6 }}>
          {f.razaoSocial} agora faz parte da rede ELOS.<br/>
          Plano <strong style={{ color:'#2E3192' }}>{pName}</strong> ativo.
        </div>
        <Card style={{ textAlign:'left', marginBottom:20 }}>
          {['Perfil publicado no marketplace','Score calculado automaticamente','Documentos sendo validados','Acesso liberado à plataforma'].map(item => (
            <div key={item} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8, fontSize:13, color:'#166534', fontFamily:'DM Sans,sans-serif' }}>
              <span style={{ color:'#22c55e', fontWeight:700 }}>✓</span> {item}
            </div>
          ))}
        </Card>
        <Button variant="orange" full size="lg" onClick={() => setScreen('dashboard')}>Ver meu painel →</Button>
      </div>
    )
  }

  /* ── PERFIL ── */
  if (screen === 'perfil') return (
    <div>
      <div style={{ background:'#1a1c5e', borderRadius:14, padding:'20px 18px', marginBottom:14 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14 }}>
          <div style={{ width:50, height:50, borderRadius:12, background:'#F47E2F', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:24, color:'#fff', flexShrink:0 }}>P</div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:15, color:'#fff', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{f.razaoSocial}</div>
            <div style={{ fontSize:12, color:'rgba(255,255,255,.5)', marginTop:2 }}>{f.cnpj} · {f.cidade}/{f.uf}</div>
          </div>
          <div style={{ textAlign:'right', flexShrink:0 }}>
            <div style={{ fontSize:11, color:'rgba(255,255,255,.5)', fontFamily:'DM Sans,sans-serif' }}>Score</div>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:26, color:scoreC, lineHeight:1 }}>{f.score}</div>
          </div>
        </div>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          <span style={{ background:'rgba(244,126,47,.28)', border:'1px solid rgba(244,126,47,.55)', borderRadius:20, padding:'3px 12px', fontSize:10, color:'#F47E2F', fontFamily:'Montserrat,sans-serif', fontWeight:700 }}>{f.seloStatus}</span>
          <span style={{ background:'rgba(255,255,255,.1)', borderRadius:20, padding:'3px 12px', fontSize:10, color:'rgba(255,255,255,.7)', fontFamily:'DM Sans,sans-serif' }}>{f.categoria}</span>
        </div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
        <Card style={{ padding:'14px 12px', borderRadius:12 }}>
          <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:10, color:'#9B9B9B', letterSpacing:1, textTransform:'uppercase', marginBottom:10 }}>Docs validados</div>
          {f.documentos.map(doc => (
            <div key={doc.nome} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8 }}>
              <span style={{ color:doc.status==='VALID'?'#22c55e':'#f59e0b', fontWeight:700, fontSize:13 }}>{doc.status==='VALID'?'✓':'⏳'}</span>
              <span style={{ fontSize:11, color:'#333', fontFamily:'DM Sans,sans-serif' }}>{doc.nome}</span>
            </div>
          ))}
        </Card>
        <Card style={{ padding:'14px 12px', borderRadius:12 }}>
          <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:10, color:'#9B9B9B', letterSpacing:1, textTransform:'uppercase', marginBottom:10 }}>Conformidade</div>
          {['Regularidade fiscal','Reg. trabalhista','Sem sanções','Simples Nacional'].map(item => (
            <div key={item} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8 }}>
              <span style={{ color:'#2E3192', fontSize:13 }}>🛡️</span>
              <span style={{ fontSize:11, color:'#333', fontFamily:'DM Sans,sans-serif' }}>{item}</span>
            </div>
          ))}
        </Card>
      </div>
      <div style={{ background:'rgba(34,197,94,.12)', border:'1px solid rgba(34,197,94,.33)', borderRadius:30, padding:'9px 16px', display:'flex', gap:8, marginBottom:18, fontSize:12, color:'#22c55e', fontFamily:'DM Sans,sans-serif' }}>
        <span>⚡</span> Última verificação automática: hoje, 09:14
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
        <Button variant="neutral" onClick={() => setScreen('dashboard')}>← Voltar</Button>
        <Button variant="neutral" style={{ color:'#2E3192', border:'2px solid #2E3192' }}>Cotação</Button>
        <Button variant="orange">Homologar</Button>
      </div>
    </div>
  )

  /* ── DASHBOARD ── */
  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
        <div>
          <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:20, color:'#1a1c5e' }}>Boa tarde, Lucas! 👋</div>
          <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#9B9B9B', marginTop:2 }}>{f.razaoSocial} · CNPJ {f.cnpj}</div>
        </div>
        <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4, flexShrink:0, marginLeft:8 }}>
          <div style={{ fontSize:11, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>Score geral</div>
          <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:22, color:scoreC, lineHeight:1 }}>{f.score}<span style={{ fontSize:13, color:'#9B9B9B', fontWeight:400 }}>/100</span></div>
          <div style={{ width:80 }}><ScoreBar score={f.score}/></div>
        </div>
      </div>

      <div style={{ background:'rgba(239,68,68,.08)', border:'1px solid rgba(239,68,68,.25)', borderRadius:14, padding:'12px 18px', marginBottom:20, display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
        <span style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, color:'#dc2626' }}>⚠ 1 documento pendente — Apólice de Seguro</span>
        <Button variant="danger" size="sm">Resolver</Button>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:22 }}>
        <KpiCard label="Processos Ativos" value={2}           sub="de 2 total"             icon="🔄" />
        <KpiCard label="Docs Válidos"     value="4/5"         sub="1 pendente" subColor="#f59e0b" icon="📋" iconBg="rgba(34,197,94,.1)" />
        <KpiCard label="Em Análise"       value={1}           sub="Aguardando backoffice"  subColor="#8b5cf6" icon="⏳" iconBg="rgba(139,92,246,.1)" />
        <KpiCard label="Plano"            value="Verificado"  sub="Válido até Jan/2026"   subColor="#22c55e" icon="⭐" iconBg="rgba(244,126,47,.1)" />
      </div>

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
        <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:15, color:'#1a1c5e' }}>Meus Processos</div>
        <Button variant="neutral" size="sm">📋 Gerenciar Docs</Button>
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:12, marginBottom:20 }}>
        {DEMO_PROCESSES.map(proc => {
          const sc = STATUS_C[proc.status] || '#9B9B9B'
          const sl = STATUS_L[proc.status] || proc.status
          return (
            <Card key={proc.id} style={{ borderRadius:14, padding:'18px 20px', border:`1px solid ${proc.status==='ACTIVE'?'rgba(34,197,94,.2)':'rgba(46,49,146,.1)'}` }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
                <div>
                  <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:14, color:'#1a1c5e' }}>{proc.name}</div>
                  <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:12, color:'#64748b', marginTop:2 }}>{proc.client}</div>
                </div>
                <span style={{ fontSize:10, fontWeight:700, color:sc, background:`${sc}18`, padding:'3px 10px', borderRadius:20, fontFamily:'Montserrat,sans-serif', flexShrink:0 }}>{sl}</span>
              </div>
              <div style={{ marginBottom:10 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                  <span style={{ fontFamily:'DM Sans,sans-serif', fontSize:11, color:'#9B9B9B' }}>Score</span>
                  <span style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:11, color:'#1a1c5e' }}>{proc.score}/100</span>
                </div>
                <ScoreBar score={proc.score}/>
              </div>
              <div style={{ display:'flex', gap:8, marginBottom:10 }}>
                {[['✓',proc.docsOk,'#22c55e'],['⏳',proc.docsPending,'#f59e0b'],['✗',proc.docsMissing,'#ef4444']].map(([icon,val,color],j) => (
                  <div key={j} style={{ flex:1, textAlign:'center', padding:'5px', borderRadius:8, background:`${color}10`, border:`1px solid ${color}22` }}>
                    <div style={{ fontSize:13 }}>{icon}</div>
                    <div style={{ fontSize:11, fontWeight:700, color, fontFamily:'Montserrat,sans-serif' }}>{val}</div>
                  </div>
                ))}
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div style={{ fontSize:10, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>{proc.date}</div>
                <Button variant="primary" size="sm">Ver Processo →</Button>
              </div>
            </Card>
          )
        })}
      </div>

      <Button variant="orange" full onClick={() => setScreen('perfil')}>Ver meu perfil no marketplace →</Button>
    </div>
  )
}
