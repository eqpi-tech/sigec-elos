// Demo · fichas do processo fiéis às telas reais (refresh 30/09):
//  - fornecedor: processo (Visão Geral / Documentos / Histórico) e Meus
//    Documentos (envio, emitir na fonte, automáticos, mobilidade)
//  - cliente: ficha do fornecedor (Resumo / Documentos / Questionários /
//    Inteligência CNPJ, documentos da sua responsabilidade, carta de exceção)
//  - comprador: perfil do fornecedor (contatos mascarados, só a situação dos docs)
// Dados fictícios em DemoFichaKit.FICHA — a mesma história nas quatro visões.
import { useState } from 'react'
import { Card, Button, ScoreBar } from '../../components/ui.jsx'
import SealBadge from '../../components/SealBadge.jsx'
import { FICHA, M, D, pill, ROW, fmt, Tabs, Toast, Modal, DocViewer, HistoryModal, Field, contar, StatusDot } from './DemoFichaKit.jsx'

const wrap = { padding: '28px 32px', maxWidth: 1200, margin: '0 auto' }
const back = (onClick, label) => (
  <button onClick={onClick} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: D, fontSize: 13, color: '#2E3192', fontWeight: 600, marginBottom: 14, padding: 0 }}>{label}</button>
)
const SEAL = { client_id: 'hz', client_name: FICHA.cliente, status: 'PENDING', score: FICHA.score }
const SUP_LABEL = { VALID: 'Válido', EXPIRING: 'Vencendo', MISSING: 'Pendente', PENDING: 'Em análise', EXPIRED: 'Vencido', REJECTED: 'Rejeitado', NOT_APPLICABLE: 'Não se aplica' }
const SUP_COLOR = { VALID: '#22c55e', EXPIRING: '#f59e0b', MISSING: '#ef4444', PENDING: '#f59e0b', EXPIRED: '#ef4444', REJECTED: '#ef4444', NOT_APPLICABLE: '#64748b' }
const CLI_LABEL = { VALID: 'Aprovado', PENDING: 'Aguardando análise', MISSING: 'Não enviado', REJECTED: 'Rejeitado', EXPIRED: 'Vencido', EXPIRING: 'Vence em breve' }

function Titulo({ children, right }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 10, flexWrap: 'wrap' }}>
      <div style={{ fontFamily: M, fontWeight: 800, fontSize: 15, color: '#1a1c5e' }}>{children}</div>{right}
    </div>
  )
}
function Tiles({ items }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${items.length},1fr)`, gap: 10 }}>
      {items.map(([l, v, c]) => (
        <div key={l} style={{ background: `${c}10`, border: `1px solid ${c}33`, borderRadius: 12, padding: '10px 12px' }}>
          <div style={{ fontFamily: M, fontWeight: 900, fontSize: 22, color: c }}>{v}</div>
          <div style={{ fontFamily: D, fontSize: 11.5, color: '#64748b' }}>{l}</div>
        </div>
      ))}
    </div>
  )
}

// ══ FORNECEDOR · ficha do processo ═════════════════════════════════════════
export function DemoSupplierProcessoFicha({ navigate }) {
  const [tab, setTab] = useState('geral')
  const [ver, setVer] = useState(null)
  const c = contar(FICHA.docs)
  return (
    <div style={wrap}>
      {back(() => navigate('dashboard'), '← Voltar ao Dashboard')}
      <Card style={{ borderRadius: 18, padding: '22px 26px', marginBottom: 16, background: 'linear-gradient(135deg,#fff,#f4f5ff)' }}>
        <div style={{ display: 'flex', gap: 22, alignItems: 'center', flexWrap: 'wrap' }}>
          <SealBadge seal={SEAL} size="lg"/>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ fontFamily: M, fontWeight: 900, fontSize: 20, color: '#1a1c5e' }}>{FICHA.processo}</div>
            <div style={{ fontFamily: D, fontSize: 13, color: '#64748b', marginBottom: 12 }}>{FICHA.cliente}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 8 }}>
              <Field label="Nível" value="Simples"/>
              <Field label="Status" value="Em análise" strong/>
              <Field label="Emitido em" value="—"/>
              <Field label="Válido até" value="—"/>
              <Field label="Score" value={`${FICHA.score}/100`} strong/>
            </div>
          </div>
        </div>
      </Card>
      <Tabs tabs={[['geral', 'Visão Geral'], ['docs', 'Documentos'], ['hist', 'Histórico']]} value={tab} onChange={setTab}/>
      {tab === 'geral' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(360px,1fr))', gap: 14 }}>
          <Card style={{ borderRadius: 16, padding: '18px 22px' }}>
            <Titulo right={<strong style={{ fontFamily: M, color: '#2E3192' }}>{FICHA.score}%</strong>}>Progresso dos Documentos</Titulo>
            <div style={{ fontFamily: D, fontSize: 12, color: '#64748b', marginBottom: 6 }}>Conformidade geral</div>
            <ScoreBar score={FICHA.score}/>
            <div style={{ height: 12 }}/>
            <Tiles items={[['Aprovados', c.ok, '#22c55e'], ['Em análise', c.analise, '#f59e0b'], ['Não enviados', c.falta + c.rej, '#ef4444'], ['Score', FICHA.score, '#2E3192']]}/>
          </Card>
          <Card style={{ borderRadius: 16, padding: '18px 22px' }}>
            <Titulo>Dados do Processo</Titulo>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <Field label="Contato" value={FICHA.convite.contato}/>
              <Field label="Tipo de Fornecimento" value={FICHA.convite.tipo}/>
              <Field label="Subsidiado" value={FICHA.convite.subsidiado ? 'Sim' : 'Não'}/>
              <Field label="Convite enviado em" value={fmt(FICHA.convite.em)}/>
            </div>
            <div style={{ background: '#fafbff', border: '1px solid #eef0f6', borderRadius: 10, padding: '8px 12px', marginTop: 8, fontFamily: D, fontSize: 12.5, color: '#374151' }}>
              <strong style={{ fontFamily: M, fontSize: 9.5, color: '#9B9B9B', textTransform: 'uppercase' }}>Escopo</strong><br/>{FICHA.convite.escopo}
            </div>
          </Card>
          <Card style={{ borderRadius: 16, padding: '18px 22px' }}>
            <Titulo>Empresa Contratante</Titulo>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <Field label="Razão Social" value={FICHA.cliente}/><Field label="CNPJ" value="12.908.441/0001-06"/>
            </div>
          </Card>
        </div>
      )}
      {tab === 'docs' && (
        <Card style={{ borderRadius: 16, padding: '18px 22px' }}>
          <div style={{ background: 'rgba(46,49,146,.06)', borderRadius: 10, padding: '9px 12px', marginBottom: 12, fontFamily: D, fontSize: 12.5, color: '#2E3192', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <span>📋 Documentos exigidos por {FICHA.cliente} para este processo.</span>
            <button onClick={() => navigate('documentos')} style={{ background: 'none', border: 'none', color: '#2E3192', fontWeight: 700, cursor: 'pointer', fontFamily: D }}>Enviar / atualizar documentos →</button>
          </div>
          <Tiles items={[['✓ Aprovados', c.ok, '#22c55e'], ['⏳ Em análise', c.analise, '#f59e0b'], ['✗ Pendentes', c.falta + c.rej, '#ef4444']]}/>
          <div style={{ height: 12 }}/>
          {FICHA.docs.map((d) => (
            <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 12, marginBottom: 7, background: (ROW[d.status] || ROW.MISSING).bg, border: `1px solid ${(ROW[d.status] || ROW.MISSING).bd}` }}>
              <StatusDot status={d.status}/>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: M, fontWeight: 700, fontSize: 13, color: '#1a1c5e' }}>{d.label} {d.source === 'AUTO' && <span style={pill('#15803d', '#dcfce7')}>⚡ Auto</span>}</div>
                <div style={{ fontFamily: D, fontSize: 11.5, color: SUP_COLOR[d.status] }}>
                  {({ VALID: 'Aprovado', PENDING: 'Em análise', MISSING: 'Não enviado', REJECTED: 'Rejeitado', EXPIRED: 'Vencido', EXPIRING: 'Vence em breve' })[d.status]}
                  {d.expires ? ` · Validade: ${d.expires}` : ''}
                </div>
                {d.note && <div style={{ fontFamily: D, fontSize: 11.5, color: '#dc2626', fontStyle: 'italic' }}>Motivo: {d.note}</div>}
              </div>
              {d.sent && <Button variant="neutral" size="sm" onClick={() => setVer(d)}>👁 Ver</Button>}
            </div>
          ))}
        </Card>
      )}
      {tab === 'hist' && (
        <Card style={{ borderRadius: 16, padding: '18px 22px' }}>
          {[['Aprovado', 'CND Tributos Federais', '05/09/2026 09:18', '#22c55e', 'Validade: 30/03/2027'], ['Rejeitado', 'Alvará de Funcionamento', '12/09/2026 16:40', '#ef4444', 'Documento vencido — envie o alvará do exercício atual'],
            ['Novo arquivo enviado', 'CNDT', '28/09/2026 10:02', '#2E3192', ''], ['Vencido', 'Certidão de Regularidade do FGTS', '14/09/2026 00:00', '#f59e0b', 'Renovada em 15/09/2026']].map(([ev, doc, em, cor, det]) => (
            <div key={ev + doc} style={{ borderLeft: `3px solid ${cor}`, background: '#fafbff', borderRadius: '0 10px 10px 0', padding: '8px 12px', marginBottom: 8 }}>
              <div style={{ fontFamily: M, fontWeight: 700, fontSize: 12.5, color: cor }}>{ev} <span style={{ color: '#1a1c5e' }}>· {doc}</span></div>
              <div style={{ fontFamily: D, fontSize: 11.5, color: '#64748b' }}>{em}{det ? ` · ${det}` : ''}</div>
            </div>
          ))}
        </Card>
      )}
      <DocViewer doc={ver} onClose={() => setVer(null)}/>
    </div>
  )
}

// ══ FORNECEDOR · Meus Documentos (envio) ═══════════════════════════════════
export function DemoSupplierDocumentosFicha() {
  const [docs, setDocs] = useState(FICHA.docs)
  const [toast, setToast] = useState('')
  const [ver, setVer] = useState(null)
  const [aberto, setAberto] = useState(true)
  const [colab, setColab] = useState(FICHA.mobilidade.colaboradores)
  const [novo, setNovo] = useState(null)
  const enviar = (id) => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.pdf,.jpg,.jpeg,.png,.docx,.zip'
    inp.onchange = () => {
      setDocs((ds) => ds.map((d) => (d.id === id ? { ...d, status: 'PENDING', note: null, sent: new Date().toISOString().slice(0, 10) } : d)))
      setToast('✅ Documento enviado! Aguardando validação.')
    }
    inp.click()
  }
  const c = contar(docs)
  const m = FICHA.mobilidade
  const linha = (d, extra) => {
    const cfg = ROW[d.status] || ROW.MISSING
    const podeEnviar = ['MISSING', 'REJECTED', 'EXPIRED', 'EXPIRING'].includes(d.status)
    return (
      <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 12, marginBottom: 7, background: cfg.bg, border: `1px solid ${cfg.bd}` }}>
        <StatusDot status={d.status}/>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: M, fontWeight: 700, fontSize: 13, color: '#1a1c5e' }}>{d.label}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 3 }}>
            <span style={pill(SUP_COLOR[d.status], `${SUP_COLOR[d.status]}18`)}>{SUP_LABEL[d.status]}</span>
            {d.kind === 'instant' && <span style={pill('#15803d', '#dcfce7')}>⚡ Auto</span>}
            {d.kind === 'assertiva' && <span style={pill('#2563eb', '#dbeafe')}>🤖 Automático</span>}
            {d.expires && <span style={{ fontFamily: D, fontSize: 11, color: '#9B9B9B' }}>vence {d.expires}</span>}
            {d.meta && <span style={{ fontFamily: D, fontSize: 11, color: '#64748b' }}>{d.meta}</span>}
            {d.reused && <span style={{ fontFamily: D, fontSize: 11, color: '#2563eb' }}>♻ Validado — aproveitado neste processo</span>}
            {d.note && <span style={{ fontFamily: D, fontSize: 11, color: '#dc2626' }}>⚠ {d.note}</span>}
          </div>
        </div>
        {extra}
        {d.kind === 'emitir' && <Button variant={d.status === 'VALID' ? 'neutral' : 'orange'} size="sm" title="Abre o site oficial para emitir a certidão">🌐 Emitir</Button>}
        {d.kind === 'assertiva' && <Button variant="neutral" size="sm">↺ Atualizar</Button>}
        {d.sent && d.kind !== 'instant' && <Button variant="neutral" size="sm" onClick={() => setVer(d)}>👁 Ver</Button>}
        {d.kind === 'instant' ? null : podeEnviar ? <Button variant="orange" size="sm" onClick={() => enviar(d.id)}>↑ Enviar</Button>
          : <span style={{ fontFamily: D, fontSize: 11.5, fontWeight: 700, color: d.status === 'PENDING' ? '#f59e0b' : '#22c55e', minWidth: 76, textAlign: 'right' }}>{d.status === 'PENDING' ? 'Em análise' : '✓ Aprovado'}</span>}
      </div>
    )
  }
  return (
    <div style={wrap}>
      <Toast msg={toast} onDone={() => setToast('')}/>
      <div style={{ fontFamily: M, fontWeight: 800, fontSize: 22, color: '#1a1c5e' }}>Meus Documentos</div>
      <div style={{ fontFamily: D, fontSize: 13, color: '#9B9B9B', marginBottom: 18 }}>{FICHA.razao} · {c.ok}/{docs.length} documentos válidos</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 14 }}>
        {[['✅ Válidos', c.ok, '#22c55e'], ['⏳ Pendentes', docs.length - c.ok, '#f59e0b'], ['📊 Score ELOS', `${FICHA.score}/100`, '#2E3192']].map(([l, v, cor]) => (
          <Card key={l}><div style={{ fontFamily: M, fontWeight: 700, fontSize: 11, color: '#9B9B9B', textTransform: 'uppercase' }}>{l}</div><div style={{ fontFamily: M, fontWeight: 900, fontSize: 26, color: cor }}>{v}</div></Card>
        ))}
      </div>
      <Card style={{ borderRadius: 16, padding: '14px 20px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 26 }}>📊</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: M, fontWeight: 700, fontSize: 13.5, color: '#1a1c5e' }}>Apresentação da Empresa</div>
          <div style={{ fontFamily: D, fontSize: 12, color: '#9B9B9B' }}>Enviada · 2026-09-02 · aparece para clientes e compradores</div>
        </div>
        <Button variant="neutral" size="sm">👁 Ver</Button><Button variant="neutral" size="sm">↑ Atualizar</Button>
      </Card>
      <Card style={{ borderRadius: 16, padding: '18px 22px' }}>
        <Titulo right={<span style={{ fontFamily: D, fontSize: 12, color: '#64748b' }}>{c.ok}/{docs.length} válidos</span>}>🏢 Processo — {FICHA.cliente}</Titulo>
        {docs.map((d) => linha(d))}
        <div style={{ fontFamily: D, fontSize: 11.5, color: '#9B9B9B', marginTop: 8 }}>
          ⚡ Auto = coletado automaticamente · 🌐 Emitir = abre o site oficial · 📊 Emitir = gera relatório automático · PDF, JPG ou PNG · Máx 10MB
        </div>
        {/* Mobilidade: parte deste processo */}
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1.5px dashed #c7c9e2' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontFamily: M, fontWeight: 800, fontSize: 14, color: '#1a1c5e' }}>👷 Documentos de Mobilidade</span>
            <span style={pill('#2E3192', 'rgba(46,49,146,.08)')}>parte deste processo</span>
          </div>
          <div style={{ fontFamily: D, fontSize: 12, color: '#64748b', marginBottom: 10 }}>
            Postos com mão de obra alocada deste cliente. Cadastre cada colaborador (nome e CPF) e envie os documentos da pessoa para aquele posto.
          </div>
          <div style={{ border: '1px solid #e2e4ef', borderRadius: 12, padding: '10px 14px' }}>
            <div onClick={() => setAberto((a) => !a)} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <span style={{ color: '#9B9B9B' }}>{aberto ? '▼' : '▶'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: M, fontWeight: 700, fontSize: 13, color: '#1a1c5e' }}>📍 {m.posto} — {m.cidade}/{m.uf}</div>
                <div style={{ fontFamily: D, fontSize: 11.5, color: '#9B9B9B' }}>{FICHA.cliente} · {m.funcao} · {m.postos} postos / {m.pessoas} pessoas</div>
              </div>
              <span style={pill('#b45309', '#fef3c7')}>{colab.length}/{m.pessoas} pessoas · 5/8 docs</span>
            </div>
            {aberto && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontFamily: M, fontWeight: 700, fontSize: 10, color: '#9B9B9B', margin: '6px 0' }}>DOCUMENTOS DO POSTO ({m.cidade}/{m.uf})</div>
                {m.docsPosto.map((d) => linha(d))}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '10px 0 6px' }}>
                  <span style={{ fontFamily: M, fontWeight: 700, fontSize: 10, color: '#9B9B9B' }}>COLABORADORES ({colab.length}/{m.pessoas})</span>
                  <Button variant="neutral" size="sm" onClick={() => setNovo({ nome: '', cpf: '' })}>+ Cadastrar colaborador</Button>
                </div>
                {novo && (
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                    <input placeholder="NOME COMPLETO *" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} style={{ flex: 2, padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e4ef', fontFamily: D }}/>
                    <input placeholder="000.000.000-00" value={novo.cpf} onChange={(e) => setNovo({ ...novo, cpf: e.target.value })} style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e4ef', fontFamily: D }}/>
                    <Button variant="neutral" size="sm" onClick={() => setNovo(null)}>Cancelar</Button>
                    <Button variant="primary" size="sm" onClick={() => { if (novo.nome.trim()) { setColab((cs) => [...cs, { nome: novo.nome.trim(), cpf: '***.***.***-**', docs: [{ id: `n${cs.length}`, label: 'ASO', status: 'MISSING' }, { id: `n${cs.length}b`, label: 'Certificado de reciclagem', status: 'MISSING' }] }]); setNovo(null); setToast('✅ Colaborador cadastrado — envie os documentos da pessoa.') } }}>Salvar</Button>
                  </div>
                )}
                {colab.map((p) => (
                  <div key={p.nome} style={{ marginLeft: 12, marginTop: 8 }}>
                    <div style={{ fontFamily: D, fontWeight: 700, fontSize: 12.5, color: '#374151', marginBottom: 6 }}>
                      👤 {p.nome} <span style={{ fontWeight: 400, color: '#9B9B9B' }}>· CPF {p.cpf}</span>
                      {p.docs.every((x) => x.status === 'VALID') && <span style={{ ...pill('#15803d', '#dcfce7'), marginLeft: 6 }}>✓ completo</span>}
                    </div>
                    {p.docs.map((d) => linha(d))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Card>
      <DocViewer doc={ver} onClose={() => setVer(null)}/>
    </div>
  )
}

// ══ CLIENTE · ficha do fornecedor ══════════════════════════════════════════
export function DemoClientProcesso({ navigate }) {
  const [tab, setTab] = useState('resumo')
  const [ver, setVer] = useState(null)
  const [cartaAberta, setCartaAberta] = useState(false)
  const [carta, setCarta] = useState({})   // categoria → validade
  const [validade, setValidade] = useState({})
  const [anexo, setAnexo] = useState(false)
  const [banco, setBanco] = useState(false)
  const c = contar(FICHA.docs)
  const pct = Math.round((c.ok / FICHA.docs.length) * 100)
  return (
    <div style={wrap}>
      {back(() => navigate('fornecedores'), '← Voltar a Meus Fornecedores')}
      <Card style={{ borderRadius: 18, padding: '20px 24px', marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ width: 54, height: 54, borderRadius: 14, background: '#EEF0FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: M, fontWeight: 900, fontSize: 18, color: '#2E3192' }}>PS</div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontFamily: M, fontWeight: 900, fontSize: 19, color: '#1a1c5e' }}>{FICHA.razao}</div>
            <div style={{ fontFamily: D, fontSize: 12.5, color: '#64748b' }}>CNPJ {FICHA.cnpj} · {FICHA.cidade} / {FICHA.uf}</div>
            <span style={{ ...pill('#475569', '#f1f5f9'), display: 'inline-block', marginTop: 6 }}>Escopo: {FICHA.convite.escopo}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <SealBadge seal={SEAL} size="sm"/>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={pill('#065f46', '#d1fae5')}>SUBSIDIADO</span>
              <Button variant="primary" size="sm" onClick={() => setBanco(true)}>🏦 Dados Bancários</Button>
            </div>
          </div>
        </div>
      </Card>

      <Card style={{ borderRadius: 14, padding: '14px 20px', marginBottom: 12 }}>
        <div style={{ fontFamily: M, fontWeight: 800, fontSize: 13.5, color: '#1a1c5e' }}>📎 Documentos da sua responsabilidade</div>
        <div style={{ fontFamily: D, fontSize: 12, color: '#64748b', marginBottom: 8 }}>Este processo exige documento(s) anexado(s) pela sua empresa</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: D, fontSize: 13, color: '#1a1c5e' }}>
          Laudo técnico de visita (engenharia Horizonte)
          {anexo ? <span style={pill('#15803d', '#dcfce7')}>✓ Anexado</span>
            : <button onClick={() => setAnexo(true)} style={{ border: '1.5px dashed #c7c9e2', background: '#fff', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontFamily: D, fontSize: 12, color: '#2E3192' }}>📎 Anexar</button>}
        </div>
      </Card>

      <Card style={{ borderRadius: 14, padding: '14px 20px', marginBottom: 14, border: '1.5px solid #fcd34d' }}>
        <div onClick={() => setCartaAberta((a) => !a)} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: M, fontWeight: 800, fontSize: 13.5, color: '#92400e' }}>📜 Carta de Exceção</div>
            <div style={{ fontFamily: D, fontSize: 12, color: '#78350f' }}>Aprove uma categoria mesmo com documento reprovado ou faltando: anexe a carta e informe a validade — a homologação com exceção vale na hora</div>
          </div>
          <span style={{ color: '#b45309' }}>{cartaAberta ? '▲' : '▼'}</span>
        </div>
        {cartaAberta && FICHA.categorias.map((cat) => (
          <div key={cat.nome} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid #fef3c7', flexWrap: 'wrap', fontFamily: D, fontSize: 12.5 }}>
            <strong style={{ flex: 1, color: '#1a1c5e', minWidth: 180 }}>{cat.nome}</strong>
            {carta[cat.nome] ? <span style={{ color: '#15803d', fontWeight: 700 }}>✓ Exceção vigente até {fmt(carta[cat.nome])}</span> : (<>
              <span style={{ color: '#6b7280' }}>Validade da carta</span>
              <input type="date" value={validade[cat.nome] || ''} onChange={(e) => setValidade((v) => ({ ...v, [cat.nome]: e.target.value }))} style={{ padding: '5px 8px', borderRadius: 8, border: '1px solid #e2e4ef', fontFamily: D }}/>
              <button disabled={!validade[cat.nome]} onClick={() => setCarta((x) => ({ ...x, [cat.nome]: validade[cat.nome] }))}
                style={{ border: '1.5px dashed #f59e0b', background: '#fff', borderRadius: 8, padding: '4px 10px', cursor: validade[cat.nome] ? 'pointer' : 'not-allowed', opacity: validade[cat.nome] ? 1 : 0.5, fontFamily: D, fontSize: 12, color: '#b45309' }}>📎 Anexar carta</button>
            </>)}
          </div>
        ))}
      </Card>

      <Tabs tabs={[['resumo', 'Resumo'], ['docs', 'Documentos'], ['quest', 'Questionários'], ['intel', 'Inteligência CNPJ']]} value={tab} onChange={setTab}/>
      {tab === 'resumo' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(360px,1fr))', gap: 14 }}>
          <Card style={{ borderRadius: 16, padding: '18px 22px' }}>
            <Titulo right={<strong style={{ fontFamily: M, color: '#2E3192' }}>{pct}%</strong>}>Progresso dos Documentos</Titulo>
            <div style={{ fontFamily: D, fontSize: 12, color: '#64748b', marginBottom: 6 }}>Conformidade documental</div>
            <ScoreBar score={pct}/><div style={{ height: 12 }}/>
            <Tiles items={[['Aprovados', c.ok, '#22c55e'], ['Em análise', c.analise, '#f59e0b'], ['Não enviados', c.falta, '#9B9B9B'], ['Rejeitados', c.rej, '#ef4444']]}/>
          </Card>
          <Card style={{ borderRadius: 16, padding: '18px 22px' }}>
            <Titulo>Detalhes do Convite</Titulo>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <Field label="Tipo de Fornecimento" value={FICHA.convite.tipo}/><Field label="Custeio" value="🟢 Subsidiado"/>
              <Field label="Localização" value={`${FICHA.cidade} / ${FICHA.uf}`}/><Field label="Convidado em" value={fmt(FICHA.convite.em)}/>
            </div>
          </Card>
          <Card style={{ borderRadius: 16, padding: '18px 22px', gridColumn: '1 / -1' }}>
            <Titulo>Dados Cadastrais</Titulo>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
              <Field label="Situação Cadastral" value={FICHA.cnpjData.situacao} strong/><Field label="Data de Abertura" value={FICHA.cnpjData.abertura}/>
              <Field label="Porte" value={FICHA.cnpjData.porte}/><Field label="Capital Social" value={FICHA.cnpjData.capital}/>
              <Field label="Natureza Jurídica" value={FICHA.cnpjData.natureza}/><Field label="Município / UF" value={FICHA.cnpjData.municipio}/>
            </div>
          </Card>
          <Card style={{ borderRadius: 16, padding: '18px 22px' }}>
            <Titulo>Endereço</Titulo>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <Field label="Logradouro" value={FICHA.endereco.logradouro}/><Field label="Bairro" value={FICHA.endereco.bairro}/>
              <Field label="Cidade / UF" value={FICHA.endereco.cidade}/><Field label="CEP" value={FICHA.endereco.cep}/>
            </div>
          </Card>
        </div>
      )}
      {tab === 'docs' && (
        <Card style={{ borderRadius: 16, padding: '18px 22px' }}>
          <Titulo right={<span style={{ fontFamily: D, fontSize: 12, color: '#64748b' }}>✓ {c.ok} aprovados · ⏳ {c.analise} em análise · ○ {c.falta} não enviados · ✕ {c.rej} rejeitados</span>}>Documentos</Titulo>
          {FICHA.docs.map((d) => (
            <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 12, marginBottom: 7, background: d.status === 'VALID' ? '#f0fdf4' : (ROW[d.status] || ROW.MISSING).bg, border: `1px solid ${(ROW[d.status] || ROW.MISSING).bd}` }}>
              <StatusDot status={d.status}/>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: M, fontWeight: 700, fontSize: 13, color: '#1a1c5e' }}>{d.label}</div>
                <div style={{ fontFamily: D, fontSize: 11.5, color: '#64748b' }}>
                  {CLI_LABEL[d.status]}{d.source === 'AUTO' ? ' · Auto-coletado' : ''}{d.expires ? ` · Vence ${fmt(d.expires)}` : ''}{d.sent ? ` · Enviado ${fmt(d.sent)}` : ''}
                </div>
                {d.note && <div style={{ fontFamily: D, fontSize: 11.5, color: '#dc2626' }}>⚠ {d.note}</div>}
              </div>
              {d.sent && <Button variant="neutral" size="sm" onClick={() => setVer(d)}>👁 Ver</Button>}
            </div>
          ))}
        </Card>
      )}
      {tab === 'quest' && (
        <Card style={{ borderRadius: 16, padding: '18px 22px' }}>
          <Titulo>📋 Questionário de Integridade — Horizonte</Titulo>
          {FICHA.questionario.map((q) => (
            <div key={q.q} style={{ padding: '9px 0', borderTop: '1px solid #f4f5f9' }}>
              <div style={{ fontFamily: D, fontWeight: 700, fontSize: 13, color: '#1a1c5e' }}>{q.q}</div>
              <div style={{ fontFamily: D, fontSize: 13, color: q.r.startsWith('Não') ? '#dc2626' : '#15803d' }}>{q.r}</div>
            </div>
          ))}
        </Card>
      )}
      {tab === 'intel' && <InteligenciaCnpj/>}
      {banco && (
        <Modal onClose={() => setBanco(false)} max={600}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontFamily: M, fontWeight: 800, fontSize: 16, color: '#1a1c5e' }}>🏦 Comprovante de Conta Bancária</div>
            <Button variant="neutral" size="sm" onClick={() => setBanco(false)}>✕</Button>
          </div>
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 18, fontFamily: D, fontSize: 13, color: '#1a1c5e' }}>
            {Object.entries({ Banco: `${FICHA.banco.banco} (${FICHA.banco.compe})`, Agência: FICHA.banco.agencia, Conta: `${FICHA.banco.conta} · ${FICHA.banco.tipo}`, Titular: `${FICHA.razao} — ${FICHA.cnpj}` }).map(([k, v]) => (
              <div key={k} style={{ display: 'grid', gridTemplateColumns: '110px 1fr', padding: '5px 0' }}><span style={{ color: '#64748b' }}>{k}</span><strong>{v}</strong></div>
            ))}
          </div>
          <div style={{ marginTop: 10 }}><Button variant="neutral" size="sm">↗ Abrir em nova aba</Button></div>
        </Modal>
      )}
      <DocViewer doc={ver} onClose={() => setVer(null)}/>
    </div>
  )
}

export function InteligenciaCnpj() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(360px,1fr))', gap: 14 }}>
      <Card style={{ borderRadius: 16, padding: '18px 22px' }}>
        <Titulo>Sanções CEIS / CNEP</Titulo>
        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: '10px 12px', fontFamily: D, fontSize: 13, color: '#166534' }}>✅ Sem ocorrências em CEIS e CNEP</div>
        <div style={{ fontFamily: D, fontSize: 11, color: '#9B9B9B', marginTop: 8 }}>Consultado: {FICHA.cnpjData.consultado} · Portal da Transparência</div>
      </Card>
      <Card style={{ borderRadius: 16, padding: '18px 22px' }}>
        <Titulo>Regime Tributário</Titulo>
        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: '10px 12px', fontFamily: D, fontSize: 13, color: '#166534' }}>✅ <strong>Simples Nacional</strong> · Optante desde {FICHA.regime.desde}</div>
      </Card>
      <Card style={{ borderRadius: 16, padding: '18px 22px' }}>
        <Titulo>CNAEs</Titulo>
        <div style={{ fontFamily: M, fontWeight: 700, fontSize: 10, color: '#9B9B9B', marginBottom: 4 }}>PRINCIPAL</div>
        <div style={{ background: 'rgba(46,49,146,.06)', borderRadius: 8, padding: '8px 10px', fontFamily: D, fontSize: 12.5, color: '#1a1c5e', marginBottom: 10 }}><strong>{FICHA.cnaePrincipal.codigo}</strong> — {FICHA.cnaePrincipal.desc}</div>
        <div style={{ fontFamily: M, fontWeight: 700, fontSize: 10, color: '#9B9B9B', marginBottom: 4 }}>SECUNDÁRIOS ({FICHA.cnaesSec.length})</div>
        {FICHA.cnaesSec.map((c) => <div key={c.codigo} style={{ fontFamily: D, fontSize: 12.5, color: '#374151', padding: '3px 0' }}>{c.codigo} — {c.desc}</div>)}
      </Card>
      <Card style={{ borderRadius: 16, padding: '18px 22px' }}>
        <Titulo>Quadro Societário ({FICHA.qsa.length})</Titulo>
        {FICHA.qsa.map((s) => (
          <div key={s.nome} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: '1px solid #f4f5f9', fontFamily: D, fontSize: 13 }}>
            <strong style={{ color: '#1a1c5e' }}>{s.nome}</strong><span style={{ color: '#64748b' }}>{s.qual}</span>
          </div>
        ))}
      </Card>
    </div>
  )
}

// ══ COMPRADOR · perfil do fornecedor ═══════════════════════════════════════
export function DemoBuyerFicha({ navigate }) {
  const [tab, setTab] = useState('cad')
  const [convite, setConvite] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [objetivo, setObjetivo] = useState('contato')
  const validos = FICHA.docs.filter((d) => d.status === 'VALID')
  const pend = FICHA.docs.filter((d) => d.status !== 'VALID')
  const linha = (k, v) => (
    <div key={k} style={{ display: 'grid', gridTemplateColumns: '190px 1fr', gap: 10, padding: '7px 0', borderTop: '1px solid #f4f5f9', fontFamily: D, fontSize: 13 }}>
      <span style={{ color: '#64748b' }}>{k}</span><span style={{ color: '#1a1c5e', fontWeight: 500 }}>{v || '—'}</span>
    </div>
  )
  const upsell = (t) => <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, padding: '9px 12px', marginTop: 10, fontFamily: D, fontSize: 12.5, color: '#9a3412' }}>🔒 {t} <button onClick={() => navigate('plano')} style={{ background: 'none', border: 'none', color: '#c2410c', fontWeight: 700, cursor: 'pointer' }}>Conhecer o Comprador Pro →</button></div>
  return (
    <div style={wrap}>
      {back(() => navigate('marketplace'), '← Voltar ao marketplace')}
      <Card style={{ borderRadius: 18, padding: '20px 24px', marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <SealBadge seal={{ client_id: null, status: 'ACTIVE', score: 87 }} size="sm"/>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: M, fontWeight: 900, fontSize: 19, color: '#1a1c5e' }}>{FICHA.razao}</span>
              <span style={pill('#2E3192', 'rgba(46,49,146,.08)')}>🏅 Selo ELOS Verificado</span>
            </div>
            <div style={{ fontFamily: D, fontSize: 12.5, color: '#64748b', fontStyle: 'italic' }}>"{FICHA.fantasia}"</div>
            <div style={{ fontFamily: D, fontSize: 12.5, color: '#64748b' }}>CNPJ {FICHA.cnpj} · {FICHA.cidade}/{FICHA.uf} · {FICHA.matriz} · Homologado em 15/01/2026</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
              <span style={pill('#15803d', '#dcfce7')}>✓ ATIVA</span><span style={pill('#15803d', '#dcfce7')}>✓ Simples Nacional</span><span style={pill('#475569', '#f1f5f9')}>Porte: Demais</span>
            </div>
            <div style={{ marginTop: 8, maxWidth: 360 }}><ScoreBar score={87}/><div style={{ fontFamily: D, fontSize: 11, color: '#9B9B9B' }}>{validos.length}/{FICHA.docs.length} docs validados</div></div>
          </div>
          <div style={{ textAlign: 'right' }}>
            {enviado ? <div style={{ fontFamily: M, fontWeight: 700, color: '#15803d' }}>✅ Convite enviado!</div> : <Button variant="orange" onClick={() => setConvite(true)}>🤝 Enviar Convite</Button>}
            <div style={{ fontFamily: D, fontSize: 11, color: '#9B9B9B', marginTop: 6 }}>🔄 Receita Federal 02/09/2026</div>
          </div>
        </div>
      </Card>
      <Tabs pills value={tab} onChange={setTab} tabs={[['cad', '📋 Cadastral'], ['ativ', '🏭 Atividade'], ['soc', `👥 Sócios (${FICHA.qsa.length})`], ['docs', `📄 Docs (${validos.length}/${FICHA.docs.length})`], ['cat', '🏷️ Categorias']]}/>
      <Card style={{ borderRadius: 16, padding: '18px 22px' }}>
        {tab === 'cad' && (<>
          <Titulo>🏢 Identificação</Titulo>
          {[['Razão Social', FICHA.razao], ['Nome Fantasia', FICHA.fantasia], ['CNPJ', FICHA.cnpj], ['Situação Cadastral', `${FICHA.cnpjData.situacao} (desde ${FICHA.cnpjData.desde})`], ['Data de Abertura', FICHA.cnpjData.abertura], ['Natureza Jurídica', FICHA.cnpjData.natureza], ['Porte', FICHA.cnpjData.porte], ['Capital Social', FICHA.cnpjData.capital], ['Opção pelo Simples', `Sim (desde ${FICHA.regime.desde})`]].map(([k, v]) => linha(k, v))}
          <div style={{ height: 14 }}/>
          <Titulo>📞 Contato</Titulo>
          {linha('Telefone', '(11) 34**-****')}{linha('Telefone 2', '(11) 97***-****')}{linha('E-mail', 'co*****@primatus.com.br')}
          {upsell('Assine um plano para ver os contatos completos do fornecedor e dos sócios.')}
        </>)}
        {tab === 'ativ' && (<>
          <Titulo>🏭 CNAE Principal</Titulo>
          <div style={{ fontFamily: D, fontSize: 13, color: '#1a1c5e', marginBottom: 12 }}><strong>{FICHA.cnaePrincipal.codigo}</strong> — {FICHA.cnaePrincipal.desc}</div>
          <Titulo>📋 CNAEs Secundários ({FICHA.cnaesSec.length})</Titulo>
          {FICHA.cnaesSec.map((c) => <div key={c.codigo} style={{ fontFamily: D, fontSize: 12.5, color: '#374151', padding: '3px 0' }}><strong>{c.codigo}</strong> — {c.desc}</div>)}
          <div style={{ height: 12 }}/>
          <Titulo>🔧 Serviços Declarados</Titulo>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{FICHA.servicos.map((s) => <span key={s} style={pill('#15803d', '#dcfce7')}>{s}</span>)}</div>
        </>)}
        {tab === 'soc' && (<>
          <Titulo>👥 Quadro Societário — {FICHA.qsa.length} membros</Titulo>
          {FICHA.qsa.map((s) => (
            <div key={s.nome} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 0', borderTop: '1px solid #f4f5f9' }}>
              <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#EEF0FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: M, fontWeight: 800, color: '#2E3192' }}>{s.nome[0]}</div>
              <div>
                <div style={{ fontFamily: M, fontWeight: 700, fontSize: 13, color: '#1a1c5e' }}>{s.nome}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '3px 0' }}><span style={pill('#475569', '#f1f5f9')}>{s.qual}</span><span style={pill('#c2410c', '#fff7ed')}>{s.pct}</span><span style={pill('#475569', '#f1f5f9')}>{s.nac}</span><span style={pill('#475569', '#f1f5f9')}>{s.faixa}</span></div>
                <div style={{ fontFamily: D, fontSize: 11.5, color: '#64748b' }}>Sócio desde {s.desde} · CPF: {s.cpf} · 📞 {s.fone}</div>
              </div>
            </div>
          ))}
          {upsell('Assine um plano para ver os contatos completos dos sócios.')}
        </>)}
        {tab === 'docs' && (<>
          <Titulo>✅ Documentos Validados ({validos.length})</Titulo>
          {validos.map((d) => (
            <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderTop: '1px solid #f4f5f9', fontFamily: D, fontSize: 13 }}>
              <StatusDot status="VALID"/><span style={{ flex: 1, color: '#1a1c5e' }}>{d.label}</span>
              {d.source === 'AUTO' && <span style={pill('#15803d', '#dcfce7')}>⚡ Auto</span>}
              <span style={{ color: '#64748b', fontSize: 12 }}>{d.expires ? `Válido até ${d.expires}` : 'sem validade'}</span>
            </div>
          ))}
          <div style={{ height: 12 }}/>
          <Titulo>⏳ Pendentes / Vencidos ({pend.length})</Titulo>
          {pend.map((d) => <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: '1px solid #f4f5f9', fontFamily: D, fontSize: 12.5 }}><span style={{ color: '#1a1c5e' }}>{d.label}</span><span style={{ color: '#b45309', fontWeight: 700 }}>{d.status}</span></div>)}
          <div style={{ fontFamily: D, fontSize: 11.5, color: '#9B9B9B', marginTop: 10 }}>O comprador vê a situação de cada documento; os arquivos ficam restritos ao fornecedor, aos clientes do processo e à EQPI.</div>
        </>)}
        {tab === 'cat' && (<>
          <Titulo>🏷️ Categorias de Atuação</Titulo>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>{FICHA.categorias.map((c) => <span key={c.nome} style={pill('#2E3192', 'rgba(46,49,146,.08)')}>{c.nome}</span>)}</div>
          <Titulo>💰 Capacidade Financeira</Titulo>
          {[['Porte', FICHA.cnpjData.porte], ['Capital Social', FICHA.cnpjData.capital], ['Faixa de Faturamento', FICHA.capacidade.faturamento], ['Nº de Funcionários', FICHA.capacidade.funcionarios], ['Plano SIGEC-ELOS', FICHA.capacidade.plano]].map(([k, v]) => linha(k, v))}
          <div style={{ fontFamily: D, fontSize: 11.5, color: '#9B9B9B', fontStyle: 'italic', marginTop: 8 }}>ℹ️ Dados financeiros via Receita Federal ou autodeclarados. A EQPI Tech não garante exatidão para fins de crédito.</div>
        </>)}
      </Card>
      {convite && (
        <Modal onClose={() => setConvite(false)}>
          <div style={{ fontFamily: M, fontWeight: 800, fontSize: 17, color: '#1a1c5e' }}>Convidar Fornecedor</div>
          <div style={{ fontFamily: D, fontSize: 13, color: '#64748b', marginBottom: 12 }}>Para: {FICHA.razao}</div>
          <div style={{ fontFamily: M, fontWeight: 700, fontSize: 10, color: '#9B9B9B', marginBottom: 6 }}>OBJETIVO DO CONVITE *</div>
          {[['contato', '📞 Fazer contato com o Fornecedor', 'Você quer conversar e pedir uma proposta.'], ['homologacao', '🏅 Enviar convite para solicitar homologação', 'O fornecedor passa pela homologação da sua empresa.']].map(([k, t, d]) => (
            <div key={k} onClick={() => setObjetivo(k)} style={{ border: `1.5px solid ${objetivo === k ? '#2E3192' : '#e2e4ef'}`, background: objetivo === k ? 'rgba(46,49,146,.05)' : '#fff', borderRadius: 10, padding: '9px 12px', marginBottom: 6, cursor: 'pointer' }}>
              <div style={{ fontFamily: M, fontWeight: 700, fontSize: 12.5, color: '#1a1c5e' }}>{t}</div><div style={{ fontFamily: D, fontSize: 12, color: '#64748b' }}>{d}</div>
            </div>
          ))}
          {objetivo === 'homologacao' && <div style={{ background: '#eff6ff', borderRadius: 8, padding: '8px 12px', fontFamily: D, fontSize: 12, color: '#1e40af', marginBottom: 6 }}>💡 Preços diferenciados disponíveis: planos corporativos para homologar sua cadeia inteira.</div>}
          <div style={{ fontFamily: M, fontWeight: 700, fontSize: 10, color: '#9B9B9B', margin: '8px 0 4px' }}>PRÉVIA DA MENSAGEM (EDITÁVEL)</div>
          <textarea rows={4} defaultValue={`Olá! Encontrei a ${FICHA.razao} no marketplace SIGEC-ELOS e gostaria de ${objetivo === 'contato' ? 'conversar sobre uma proposta' : 'convidá-los para a nossa homologação de fornecedores'}.`} style={{ width: '100%', boxSizing: 'border-box', borderRadius: 10, border: '1px solid #e2e4ef', padding: 10, fontFamily: D, fontSize: 13 }}/>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <Button variant="neutral" full onClick={() => setConvite(false)}>Cancelar</Button>
            <Button variant="primary" full onClick={() => { setConvite(false); setEnviado(true) }}>{objetivo === 'contato' ? '📞 Enviar Contato' : '📨 Enviar Convite'}</Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
