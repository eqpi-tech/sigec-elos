// Demo · fichas do processo fiéis às telas reais:
//  - fornecedor: processo (Visão Geral / Documentos / Histórico) e Meus
//    Documentos (envio, substituir, emitir na fonte, automáticos, mobilização)
//  - cliente: ficha do fornecedor (Resumo / Documentos / Questionários /
//    Inteligência CNPJ / Log do Processo, documentos da sua responsabilidade,
//    carta de exceção com a categoria reprovada pelo CNAE)
//  - comprador Pro e cliente: perfil do fornecedor (contatos completos)
// Documentos do processo e log usam os MESMOS componentes da produção
// (ProcessDocuments, ProcessLog) com os dados fictícios de DemoFichaKit.
import { useState } from 'react'
import { Card, Button, ScoreBar, SectionTitle } from '../../components/ui.jsx'
import SealBadge from '../../components/SealBadge.jsx'
import ProcessDocuments, { DOC_STATUS } from '../../components/ProcessDocuments.jsx'
import ProcessLog from '../../components/ProcessLog.jsx'
import {
  FICHA, M, D, pill, fmt, Tabs, Modal, DocViewer, HistoryModal, Field, contar, StatusDot,
  effStatus, processData, findDoc, historyOf, logFetcher, useToast,
} from './DemoFichaKit.jsx'
import { DEMO_MARKETPLACE, PRIMATUS, SCORE_NOTE, isoD, brD } from './demoData.js'
import { InviteModal } from './DemoClientDashboard.jsx'

const wrap = { padding: '28px 32px', maxWidth: 1200, margin: '0 auto' }
const back = (onClick, label) => (
  <button onClick={onClick} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: D, fontSize: 13, color: '#2E3192', fontWeight: 600, marginBottom: 14, padding: 0 }}>{label}</button>
)
const SEAL = { client_id: 'hz', client_name: FICHA.cliente, status: 'PENDING', score: FICHA.score }
const UPLOADABLE = ['MISSING', 'REJECTED', 'EXPIRED', 'EXPIRING']
const nota = (t) => <div style={{ fontFamily: D, fontSize: 11.5, color: '#64748b', marginTop: 6, lineHeight: 1.45 }}>ℹ️ {t}</div>

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
// abre o seletor de arquivo do navegador e chama ok(nomeDoArquivo)
export function pickFile(ok, accept = '.pdf,.jpg,.jpeg,.png,.docx,.zip') {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = accept
  inp.onchange = () => { if (inp.files?.[0]) ok(inp.files[0].name) }
  inp.click()
}

// ══ FORNECEDOR · ficha do processo ═════════════════════════════════════════
export function DemoSupplierProcessoFicha({ navigate }) {
  const [tab, setTab] = useState('geral')
  const [ver, setVer] = useState(null)
  const [hist, setHist] = useState(null)
  const data = processData({ viewer: 'SUPPLIER' })
  const t = data.totals
  return (
    <div style={wrap}>
      {back(() => navigate('dashboard'), '← Voltar ao Dashboard')}
      <Card style={{ borderRadius: 18, padding: '22px 26px', marginBottom: 16, background: 'linear-gradient(135deg,#fff,#f4f5ff)' }}>
        <div style={{ display: 'flex', gap: 22, alignItems: 'center', flexWrap: 'wrap' }}>
          <SealBadge seal={SEAL} size="lg"/>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ fontFamily: M, fontWeight: 900, fontSize: 20, color: '#1a1c5e' }}>{FICHA.processo}</div>
            <div style={{ fontFamily: D, fontSize: 13, color: '#64748b', marginBottom: 12 }}>{FICHA.cliente}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 8 }}>
              <Field label="Selo" value={`Homologado — Horizonte Mineração`}/>
              <Field label="Nível" value={FICHA.nivel}/>
              <Field label="Status" value="Em análise" strong/>
              <Field label="Na fila desde" value={fmt(FICHA.naFilaDesde)}/>
              <Field label="Score do processo" value={`${FICHA.score}/100`} strong/>
            </div>
            {nota(SCORE_NOTE)}
          </div>
        </div>
      </Card>
      <Tabs tabs={[['geral', 'Visão Geral'], ['docs', 'Documentos'], ['hist', 'Histórico']]} value={tab} onChange={setTab}/>
      {tab === 'geral' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(360px,1fr))', gap: 14 }}>
          <Card style={{ borderRadius: 16, padding: '18px 22px' }}>
            <Titulo right={<strong style={{ fontFamily: M, color: '#2E3192' }}>{Math.round((t.valid / t.required) * 100)}%</strong>}>Progresso dos Documentos</Titulo>
            <ScoreBar score={Math.round((t.valid / t.required) * 100)}/>
            <div style={{ height: 12 }}/>
            <Tiles items={[['Aprovados', t.valid, '#22c55e'], ['Em análise', t.in_review, '#f59e0b'], ['Reprovados / vencidos', t.rejected + t.expired, '#ef4444'], ['Score', FICHA.score, '#2E3192']]}/>
          </Card>
          <Card style={{ borderRadius: 16, padding: '18px 22px' }}>
            <Titulo>Dados do Processo</Titulo>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <Field label="Contato" value={FICHA.convite.contato}/>
              <Field label="Tipo de Fornecimento" value={FICHA.convite.tipo}/>
              <Field label="Subsidiado" value={FICHA.convite.subsidiado ? 'Sim — custo assumido pela Horizonte' : 'Não'}/>
              <Field label="Convite enviado em" value={fmt(FICHA.convite.em)}/>
            </div>
            <div style={{ background: '#fafbff', border: '1px solid #eef0f6', borderRadius: 10, padding: '8px 12px', marginTop: 8, fontFamily: D, fontSize: 12.5, color: '#374151' }}>
              <strong style={{ fontFamily: M, fontSize: 9.5, color: '#9B9B9B', textTransform: 'uppercase' }}>Escopo</strong><br/>{FICHA.convite.escopo}
            </div>
          </Card>
          <Card style={{ borderRadius: 16, padding: '18px 22px' }}>
            <Titulo>Empresa Contratante</Titulo>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <Field label="Razão Social" value={FICHA.cliente}/><Field label="CNPJ" value={FICHA.clienteCnpj}/>
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
          <ProcessDocuments data={data} canView onView={(d) => setVer(findDoc(d.type))} onHistory={(d) => setHist(findDoc(d.type))}/>
        </Card>
      )}
      {tab === 'hist' && (
        <Card style={{ borderRadius: 16, padding: '18px 22px' }}>
          <ProcessLog fetcher={logFetcher} note="Histórico do seu processo com a Horizonte Mineração: envios, análises e decisões."/>
        </Card>
      )}
      <DocViewer doc={ver} onClose={() => setVer(null)}/>
      <HistoryModal doc={hist} onClose={() => setHist(null)} onView={(v) => { setHist(null); setVer(v) }}/>
    </div>
  )
}

// ══ FORNECEDOR · Meus Documentos (envio) ═══════════════════════════════════
export function DemoSupplierDocumentosFicha() {
  const [docs, setDocs] = useState(FICHA.docs)
  const [colab, setColab] = useState(FICHA.mobilizacao.colaboradores)
  const [postDocs, setPostDocs] = useState(FICHA.mobilizacao.docsPosto)
  const [, setToast, ToastEl] = useToast()
  const [ver, setVer] = useState(null)
  const [hist, setHist] = useState(null)
  const [aberto, setAberto] = useState(true)
  const [novo, setNovo] = useState(null)
  const [naFila, setNaFila] = useState(true)          // processo Horizonte já na fila de análise
  const [isento, setIsento] = useState({})            // Inscrição Municipal declarada isenta
  const [extraHist, setExtraHist] = useState({})      // novas versões enviadas nesta sessão

  const versoes = (d) => historyOf(d).filter(h => h.versao).length + (extraHist[d.id]?.length || 0)
  const novaVersao = (d) => {
    pickFile(() => {
      const v = versoes(d) + 1
      const ev = { ev: 'UPLOADED', em: `${isoD(0)}T${new Date().toTimeString().slice(0, 5)}:00`, versao: v }
      setExtraHist(h => ({ ...h, [d.id]: [ev, ...(h[d.id] || [])] }))
      const upd = (x) => (x.id === d.id ? { ...x, status: 'PENDING', note: null, sent: isoD(0) } : x)
      setDocs(ds => ds.map(upd)); setPostDocs(ds => ds.map(upd))
      setColab(cs => cs.map(p => ({ ...p, docs: p.docs.map(upd) })))
      setToast(effStatus(d) === 'VALID' || effStatus(d) === 'PENDING'
        ? `✅ Versão ${v} enviada — o documento volta para análise.`
        : '✅ Documento enviado! Aguardando validação.')
    })
  }
  const c = contar(docs)
  const m = FICHA.mobilizacao
  const linha = (d) => {
    const st = effStatus(d)
    const soEqpi = !!d.soEqpi
    const cfg = soEqpi && ['MISSING', 'REJECTED', 'EXPIRED'].includes(st)
      ? { bg: '#f8fafc', bd: '#e2e8f0', color: '#64748b', label: 'Com a EQPI' }
      : (DOC_STATUS[st] || DOC_STATUS.MISSING)
    const instant = d.kind === 'instant'
    const assertiva = d.kind === 'assertiva'
    const marcadoIsento = !!isento[d.id]
    const canReplace = !naFila && d.source !== 'AUTO' && ['PENDING', 'VALID'].includes(st) && !!d.sent
    const podeEnviar = !soEqpi && (UPLOADABLE.includes(st) || canReplace)
    const comHist = { ...d, history: [...(extraHist[d.id] || []), ...historyOf(d)] }
    return (
      <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 12, marginBottom: 7, background: cfg.bg, border: `1px solid ${cfg.bd}`, flexWrap: 'wrap' }}>
        <StatusDot status={st}/>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontFamily: M, fontWeight: 700, fontSize: 13, color: '#1a1c5e' }}>{d.label}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 3 }}>
            <span style={pill(cfg.color, `${cfg.color}18`)}>{cfg.label}</span>
            {instant && <span style={pill('#15803d', '#dcfce7')}>⚡ Auto</span>}
            {assertiva && <span style={pill('#2563eb', '#dbeafe')}>🤖 Automático</span>}
            {d.expires && <span style={{ fontFamily: D, fontSize: 11, color: '#9B9B9B' }}>vence {fmt(d.expires)}</span>}
            {d.meta && <span style={{ fontFamily: D, fontSize: 11, color: '#64748b' }}>{d.meta}</span>}
          </div>
          {d.note && <div style={{ fontFamily: D, fontSize: 11, color: '#dc2626', marginTop: 2 }}>⚠ {d.note}</div>}
          {soEqpi && ['MISSING', 'REJECTED', 'EXPIRED'].includes(st) && <div style={{ fontFamily: D, fontSize: 10.5, color: '#64748b', marginTop: 2 }}>A equipe EQPI obtém este documento — você não precisa enviar.</div>}
          {d.reused && st === 'VALID' && <div style={{ fontFamily: D, fontSize: 10.5, color: '#0369a1', marginTop: 2 }}>♻ Validado — aproveitado neste processo</div>}
        </div>
        {d.kind === 'emitir' && <Button variant={st === 'VALID' ? 'neutral' : 'orange'} size="sm" title="Abre o site oficial para emitir a certidão" onClick={() => setToast('ℹ️ No ambiente real o botão abre o site oficial para emitir a certidão.')}>🌐 Emitir</Button>}
        {assertiva && <Button variant="neutral" size="sm" onClick={() => setToast('ℹ️ Relatório Assertiva atualizado na demonstração (no real, gera um novo PDF).')}>↺ Atualizar</Button>}
        {d.sent && !instant && <Button variant="neutral" size="sm" title="Visualizar documento enviado" onClick={() => setVer(d)}>👁 Ver</Button>}
        {!instant && !assertiva && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {d.isento && !soEqpi && (
              <button onClick={() => { setIsento(x => ({ ...x, [d.id]: !marcadoIsento })); setToast(marcadoIsento ? '✅ Declaração de isenção retirada.' : '✅ Declarado isento pelo fornecedor.') }}
                style={{ padding: '4px 10px', borderRadius: 8, border: '1px solid #9B9B9B', background: marcadoIsento ? '#e0f2fe' : 'transparent', color: marcadoIsento ? '#0369a1' : '#9B9B9B', fontFamily: M, fontWeight: 700, fontSize: 10, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {marcadoIsento ? '✓ Isento' : 'Isento'}
              </button>
            )}
            {d.sent && <Button variant="neutral" size="sm" title="Histórico e versões do documento" onClick={() => setHist(comHist)}>🕓</Button>}
            {soEqpi ? null : podeEnviar ? (
              <Button variant="orange" size="sm" disabled={marcadoIsento} onClick={() => novaVersao(d)}>
                {st === 'EXPIRING' ? '↑ Renovar' : UPLOADABLE.includes(st) ? '↑ Enviar' : '↻ Substituir'}
              </Button>
            ) : st === 'PENDING' ? (
              <span title="O processo já está na fila de análise: o documento só pode ser reenviado se for reprovado" style={{ fontSize: 10.5, color: '#f59e0b', fontFamily: D, fontWeight: 600, whiteSpace: 'nowrap' }}>Na análise</span>
            ) : st === 'VALID' ? (
              <span style={{ fontSize: 10.5, color: '#22c55e', fontFamily: D, fontWeight: 600, whiteSpace: 'nowrap' }}>✓ Aprovado</span>
            ) : null}
          </div>
        )}
      </div>
    )
  }
  const mobSlots = [...postDocs, ...colab.flatMap(p => p.docs)]
  const mobOk = mobSlots.filter(x => ['VALID', 'EXPIRING'].includes(effStatus(x))).length
  const exigidos = docs.filter(d => !d.soEqpi).length
  return (
    <div style={wrap}>
      {ToastEl}
      <div style={{ fontFamily: M, fontWeight: 800, fontSize: 22, color: '#1a1c5e' }}>Meus Documentos</div>
      <div style={{ fontFamily: D, fontSize: 13, color: '#9B9B9B', marginBottom: 18 }}>{FICHA.razao} · {c.ok}/{exigidos} documentos válidos</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 14 }}>
        {[['✅ Válidos', c.ok, '#22c55e'], ['⏳ Pendentes', exigidos - c.ok, '#f59e0b'], ['📊 Score ELOS', `${FICHA.scoreGeral}/100`, '#2E3192']].map(([l, v, cor]) => (
          <Card key={l}><div style={{ fontFamily: M, fontWeight: 700, fontSize: 11, color: '#9B9B9B', textTransform: 'uppercase' }}>{l}</div><div style={{ fontFamily: M, fontWeight: 900, fontSize: 26, color: cor }}>{v}</div></Card>
        ))}
      </div>
      <Card style={{ borderRadius: 16, padding: '14px 20px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 26 }}>📊</span>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontFamily: M, fontWeight: 700, fontSize: 13.5, color: '#1a1c5e' }}>Apresentação da Empresa</div>
          <div style={{ fontFamily: D, fontSize: 12, color: '#9B9B9B' }}>Enviada em {brD(-50)} · aparece para clientes e compradores</div>
        </div>
        <Button variant="neutral" size="sm" onClick={() => setVer({ id: 'apr', label: 'Apresentação da Empresa', sent: isoD(-50), source: 'MANUAL' })}>👁 Ver</Button>
        <Button variant="neutral" size="sm" onClick={() => pickFile(() => setToast('✅ Apresentação atualizada.'), '.pdf,.ppt,.pptx')}>↑ Atualizar</Button>
      </Card>

      {/* situação do processo na fila — define se dá para substituir o que já foi enviado */}
      <div style={{ background: naFila ? '#fffbeb' : 'rgba(46,49,146,.05)', border: `1px solid ${naFila ? '#fde68a' : 'rgba(46,49,146,.15)'}`, borderRadius: 12, padding: '10px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 260, fontFamily: D, fontSize: 12.5, color: naFila ? '#78350f' : '#2E3192', lineHeight: 1.5 }}>
          {naFila
            ? <>⏳ <strong>Processo Horizonte na fila de análise desde {fmt(FICHA.naFilaDesde)}.</strong> Documentos em análise ficam travados ("Na análise"); só um documento reprovado, vencido ou a vencer pode ser reenviado.</>
            : <>✎ <strong>Antes da fila:</strong> enquanto o processo não entra na fila de análise, qualquer documento já enviado pode ser trocado — vira uma nova versão (↻ Substituir) e o histórico guarda as anteriores.</>}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[[true, '⏳ Na fila'], [false, '✎ Antes da fila']].map(([v, l]) => (
            <button key={l} onClick={() => setNaFila(v)} title="Simulação da demonstração"
              style={{ padding: '5px 12px', borderRadius: 20, cursor: 'pointer', fontFamily: M, fontWeight: 700, fontSize: 11, border: `1.5px solid ${naFila === v ? '#2E3192' : '#e2e4ef'}`, background: naFila === v ? 'rgba(46,49,146,.08)' : '#fff', color: naFila === v ? '#2E3192' : '#64748b' }}>{l}</button>
          ))}
        </div>
      </div>

      <Card style={{ borderRadius: 16, padding: '18px 22px' }}>
        <Titulo right={<span style={{ fontFamily: D, fontSize: 12, color: '#64748b' }}>{c.ok}/{exigidos} válidos</span>}>🏢 Processo — {FICHA.cliente}</Titulo>
        {docs.map((d) => linha(d))}
        <div style={{ fontFamily: D, fontSize: 11.5, color: '#9B9B9B', marginTop: 8 }}>
          ⚡ Auto = coletado automaticamente · 🌐 Emitir = abre o site oficial · 🤖 Automático = relatório gerado pela plataforma · 🕓 = histórico e versões · PDF, JPG ou PNG · Máx 10MB
        </div>
        {/* Mobilização: parte deste processo */}
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1.5px dashed #c7c9e2' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontFamily: M, fontWeight: 800, fontSize: 14, color: '#1a1c5e' }}>👷 Documentos de Mobilização</span>
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
              <span style={pill('#b45309', '#fef3c7')}>{colab.length}/{m.pessoas} pessoas · {mobOk}/{mobSlots.length} docs</span>
            </div>
            {aberto && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontFamily: M, fontWeight: 700, fontSize: 10, color: '#9B9B9B', margin: '6px 0' }}>DOCUMENTOS DO POSTO ({m.cidade}/{m.uf})</div>
                {postDocs.map((d) => linha(d))}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '10px 0 6px' }}>
                  <span style={{ fontFamily: M, fontWeight: 700, fontSize: 10, color: '#9B9B9B' }}>COLABORADORES ({colab.length}/{m.pessoas})</span>
                  <Button variant="neutral" size="sm" onClick={() => setNovo({ nome: '', cpf: '' })}>+ Cadastrar colaborador</Button>
                </div>
                {novo && (
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                    <input placeholder="NOME COMPLETO *" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} style={{ flex: 2, padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e4ef', fontFamily: D }}/>
                    <input placeholder="000.000.000-00" value={novo.cpf} onChange={(e) => setNovo({ ...novo, cpf: e.target.value.replace(/\D/g, '').slice(0, 11) })} style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e4ef', fontFamily: D }}/>
                    <Button variant="neutral" size="sm" onClick={() => setNovo(null)}>Cancelar</Button>
                    <Button variant="primary" size="sm" disabled={!novo.nome.trim() || novo.cpf.length !== 11} onClick={() => {
                      const k = Date.now(); const cpf = `***.${novo.cpf.slice(3, 6)}.${novo.cpf.slice(6, 9)}-**`
                      setColab((cs) => [...cs, { id: `n${k}`, nome: novo.nome.trim(), cpf, docs: [{ id: `n${k}a`, label: 'ASO', status: 'MISSING' }, { id: `n${k}b`, label: 'Certificado de reciclagem', status: 'MISSING' }] }])
                      setNovo(null); setToast('✅ Colaborador cadastrado — envie os documentos da pessoa.')
                    }}>Salvar</Button>
                  </div>
                )}
                {colab.map((p) => (
                  <div key={p.id} style={{ marginLeft: 12, marginTop: 8 }}>
                    <div style={{ fontFamily: D, fontWeight: 700, fontSize: 12.5, color: '#374151', marginBottom: 6 }}>
                      👤 {p.nome} <span style={{ fontWeight: 400, color: '#9B9B9B' }}>· CPF {p.cpf}</span>
                      {p.docs.every((x) => ['VALID', 'EXPIRING'].includes(effStatus(x))) && <span style={{ ...pill('#15803d', '#dcfce7'), marginLeft: 6 }}>✓ completo</span>}
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
      <HistoryModal doc={hist} onClose={() => setHist(null)} onView={(v) => { setHist(null); setVer(v) }}/>
    </div>
  )
}

// ══ CLIENTE · ficha do fornecedor ══════════════════════════════════════════
export function DemoClientProcesso({ navigate }) {
  const [tab, setTab] = useState('resumo')
  const [ver, setVer] = useState(null)
  const [hist, setHist] = useState(null)
  const [cartaAberta, setCartaAberta] = useState(true)
  const [carta, setCarta] = useState({})   // categoria → validade
  const [validade, setValidade] = useState({})
  const [laudo, setLaudo] = useState(FICHA.docCliente)
  const [banco, setBanco] = useState(false)
  const [, setToast, ToastEl] = useToast()
  const data = processData({ viewer: 'CLIENT', clienteDoc: laudo })
  const t = data.totals
  const pct = Math.round((t.valid / t.required) * 100)
  const amanha = isoD(1)
  return (
    <div style={wrap}>
      {ToastEl}
      {back(() => navigate('fornecedores'), '← Voltar a Meus Fornecedores')}
      <Card style={{ borderRadius: 18, padding: '20px 24px', marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ width: 54, height: 54, borderRadius: 14, background: '#EEF0FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: M, fontWeight: 900, fontSize: 18, color: '#2E3192' }}>PS</div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontFamily: M, fontWeight: 900, fontSize: 19, color: '#1a1c5e' }}>{FICHA.razao}</div>
            <div style={{ fontFamily: D, fontSize: 12.5, color: '#64748b' }}>CNPJ {FICHA.cnpj} · {FICHA.cidade} / {FICHA.uf} · {FICHA.nivel}</div>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: D, fontSize: 13, color: '#1a1c5e', flexWrap: 'wrap' }}>
          {laudo.label}
          {laudo.sent ? <span style={pill('#b45309', '#fef3c7')}>✓ Anexado em {fmt(laudo.sent)} — em análise</span>
            : <button onClick={() => pickFile(() => { setLaudo(l => ({ ...l, status: 'PENDING', sent: isoD(0) })); setToast('✅ Laudo anexado — a EQPI confere na análise.') })} style={{ border: '1.5px dashed #c7c9e2', background: '#fff', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontFamily: D, fontSize: 12, color: '#2E3192' }}>📎 Anexar</button>}
        </div>
      </Card>

      <Card style={{ borderRadius: 14, padding: '14px 20px', marginBottom: 14, border: '1px solid rgba(245,158,11,.35)' }}>
        <div onClick={() => setCartaAberta((a) => !a)} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: 10 }}>
          <span style={{ fontSize: 18 }}>📜</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: M, fontWeight: 800, fontSize: 13.5, color: '#92400e' }}>Carta de Exceção</div>
            <div style={{ fontFamily: D, fontSize: 12, color: '#9B9B9B' }}>Aprove uma categoria mesmo com documento reprovado ou faltando: anexe a carta e informe a validade — a homologação com exceção vale na hora</div>
          </div>
          <span style={{ color: '#9B9B9B', fontSize: 12 }}>{cartaAberta ? '▲' : '▼'}</span>
        </div>
        {cartaAberta && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {FICHA.categorias.map((cat) => (
              <div key={cat.nome} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10, border: '1px solid #eef0f6', flexWrap: 'wrap', fontFamily: D, fontSize: 12.5 }}>
                <span style={{ flex: 1, color: '#1a1c5e', fontSize: 13, minWidth: 180 }}>{cat.nome}</span>
                {!cat.cnae ? (
                  // reprovada na validação do CNAE — carta de exceção não se aplica
                  <span style={{ fontSize: 10, fontWeight: 700, fontFamily: M, color: '#b91c1c', background: '#fee2e2', padding: '3px 10px', borderRadius: 20 }}>
                    ✕ Reprovada — a atividade (CNAE) do fornecedor não cobre a categoria
                  </span>
                ) : carta[cat.nome] ? (
                  <span style={{ fontSize: 10, fontWeight: 700, fontFamily: M, color: '#15803d', background: '#dcfce7', padding: '3px 10px', borderRadius: 20 }}>✓ Exceção vigente até {fmt(carta[cat.nome])}</span>
                ) : (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <label style={{ fontSize: 10, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 4 }}>
                      Validade da carta
                      <input type="date" min={amanha} value={validade[cat.nome] || ''} onChange={(e) => setValidade((v) => ({ ...v, [cat.nome]: e.target.value }))} style={{ fontSize: 11, padding: '4px 6px', borderRadius: 6, border: '1px solid #e2e4ef' }}/>
                    </label>
                    <button disabled={!validade[cat.nome]} title={validade[cat.nome] ? '' : 'Informe a validade da carta primeiro'}
                      onClick={() => pickFile(() => { setCarta((x) => ({ ...x, [cat.nome]: validade[cat.nome] })); setToast(`✅ Carta registrada — ${cat.nome} homologada com exceção até ${fmt(validade[cat.nome])}. O fornecedor precisa regularizar o Alvará de Funcionamento até lá.`) }, '.pdf,.png,.jpg,.jpeg')}
                      style={{ fontSize: 11, fontWeight: 700, fontFamily: M, color: validade[cat.nome] ? '#2E3192' : '#9B9B9B', border: `1px dashed ${validade[cat.nome] ? '#2E319266' : '#d1d5db'}`, padding: '6px 12px', borderRadius: 8, background: '#fff', cursor: validade[cat.nome] ? 'pointer' : 'not-allowed' }}>📎 Anexar carta</button>
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Tabs tabs={[['resumo', 'Resumo'], ['docs', 'Documentos'], ['quest', 'Questionários'], ['intel', 'Inteligência CNPJ'], ['log', 'Log do Processo']]} value={tab} onChange={setTab}/>
      {tab === 'resumo' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(360px,1fr))', gap: 14 }}>
          <Card style={{ borderRadius: 16, padding: '18px 22px' }}>
            <Titulo right={<strong style={{ fontFamily: M, color: '#2E3192' }}>{pct}%</strong>}>Progresso dos Documentos</Titulo>
            <div style={{ fontFamily: D, fontSize: 12, color: '#64748b', marginBottom: 6 }}>Conformidade documental · score do processo {FICHA.score}/100</div>
            <ScoreBar score={pct}/><div style={{ height: 12 }}/>
            <Tiles items={[['Aprovados', t.valid, '#22c55e'], ['Em análise', t.in_review, '#f59e0b'], ['Não enviados', t.missing, '#9B9B9B'], ['Reprovados / vencidos', t.rejected + t.expired, '#ef4444']]}/>
            {nota(SCORE_NOTE)}
          </Card>
          <Card style={{ borderRadius: 16, padding: '18px 22px' }}>
            <Titulo>Detalhes do Convite</Titulo>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <Field label="Tipo de Fornecimento" value={FICHA.convite.tipo}/><Field label="Custeio" value="🟢 Subsidiado"/>
              <Field label="Localização" value={`${FICHA.cidade} / ${FICHA.uf}`}/><Field label="Convidado em" value={fmt(FICHA.convite.em)}/>
              <Field label="Situação" value="Em análise (na fila da EQPI)" strong/><Field label="Na fila desde" value={fmt(FICHA.naFilaDesde)}/>
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
          <Card style={{ borderRadius: 16, padding: '18px 22px' }}>
            <Titulo>Contato</Titulo>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <Field label="Telefone" value={FICHA.contato.telefone}/><Field label="Telefone 2" value={FICHA.contato.telefone2}/>
              <Field label="E-mail" value={FICHA.contato.email}/><Field label="Responsável" value="Lucas Andrade"/>
            </div>
          </Card>
        </div>
      )}
      {tab === 'docs' && (
        <Card style={{ borderRadius: 16, padding: '18px 22px' }}>
          <SectionTitle>Documentos do processo · {FICHA.cliente}</SectionTitle>
          <ProcessDocuments data={data} canView onView={(d) => setVer(findDoc(d.type) || laudo)} onHistory={(d) => setHist(findDoc(d.type) || laudo)}/>
        </Card>
      )}
      {tab === 'quest' && FICHA.questionario.map((qq) => (
        <Card key={qq.titulo} style={{ borderRadius: 16, padding: '18px 22px', marginBottom: 12 }}>
          <Titulo right={<span style={{ fontFamily: D, fontSize: 12, color: '#64748b' }}>{qq.itens.filter(i => i.r).length}/{qq.itens.length} respondidas</span>}>📋 {qq.titulo}</Titulo>
          {qq.itens.map((q) => (
            <div key={q.q} style={{ padding: '9px 0', borderTop: '1px solid #f4f5f9' }}>
              <div style={{ fontFamily: D, fontWeight: 700, fontSize: 13, color: '#1a1c5e' }}>{q.q}</div>
              <div style={{ fontFamily: D, fontSize: 13, color: q.r ? '#15803d' : '#cbd5e1' }}>{q.r || 'sem resposta'}</div>
            </div>
          ))}
        </Card>
      ))}
      {tab === 'intel' && <InteligenciaCnpj/>}
      {tab === 'log' && (
        <Card style={{ borderRadius: 14, padding: '20px 24px' }}>
          <SectionTitle>Log do processo</SectionTitle>
          <ProcessLog fetcher={logFetcher}
            note="Histórico do processo com a sua empresa: análises e decisões no SIGEC-ELOS e alterações no cadastro do fornecedor (últimos 300 eventos)."/>
        </Card>
      )}
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
          <div style={{ marginTop: 10 }}><Button variant="neutral" size="sm" onClick={() => { setBanco(false); setVer(findDoc('d10')) }}>👁 Ver comprovante</Button></div>
        </Modal>
      )}
      <DocViewer doc={ver} onClose={() => setVer(null)}/>
      <HistoryModal doc={hist} onClose={() => setHist(null)} onView={(v) => { setHist(null); setVer(v) }}/>
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
            <strong style={{ color: '#1a1c5e' }}>{s.nome}</strong><span style={{ color: '#64748b' }}>{s.qual} · CPF {s.cpf}</span>
          </div>
        ))}
      </Card>
    </div>
  )
}

// ══ PERFIL DO FORNECEDOR (comprador Pro e cliente) ═════════════════════════
// Primatus usa a ficha completa; os demais fornecedores do marketplace (ou de
// pré-cadastros/interessados) ganham um perfil fictício coerente com o card.
const CNAE_DE = {
  'Serviços Elétricos': ['4321-5/00', 'Instalação e manutenção elétrica'],
  'Automação & Controle': ['3321-0/00', 'Instalação de máquinas e equipamentos industriais'],
  'Manutenção Mecânica': ['3314-7/99', 'Manutenção e reparação de outras máquinas e equipamentos'],
  'Instalações Industriais': ['4292-8/02', 'Obras de montagem industrial'],
  'TI Industrial': ['6201-5/01', 'Desenvolvimento de programas de computador sob encomenda'],
}
function perfilDe(id, extra) {
  const mk = DEMO_MARKETPLACE.find(s => s.id === id)
  if ((!mk && !extra) || id === 1) {
    return {
      ...FICHA, primatus: true, sealType: 'verificado', score: PRIMATUS.score, desde: brD(-281), consultado: brD(-50),
      socios: FICHA.qsa, docs: FICHA.docs.filter(d => !d.soEqpi),
    }
  }
  const b = mk || {}
  const e = extra || {}
  const razao = e.razao_social || b.razao_social
  const [cod, desc] = CNAE_DE[b.cnae] || ['8299-7/99', 'Outras atividades de serviços prestados principalmente às empresas']
  const dig = String(e.cnpj || b.cnpj || '').replace(/\D/g, '')
  const fone = `(${['11', '31', '19', '51', '94', '21'][(b.id || 1) - 1] || '31'}) 3${dig.slice(2, 5)}-${dig.slice(5, 9)}`
  const dominio = (razao || 'empresa').split(' ')[0].normalize('NFD').replace(/[^a-zA-Z]/g, '').toLowerCase()
  return {
    razao, fantasia: b.fantasia || razao?.split(' ')[0], cnpj: e.cnpj || b.cnpj, cidade: e.city || b.city || '—', uf: e.state || b.state || '—', matriz: 'Matriz',
    sealType: b.sealType ?? null, score: b.score ?? null, desde: brD(-160 - (b.id || 3) * 17), consultado: brD(-12),
    cnpjData: { situacao: 'ATIVA', desde: '14/05/2010', abertura: '14/05/2010', porte: b.porte === 'ME' || b.porte === 'MEI' ? b.porte : 'Demais',
      capital: b.capital ? b.capital.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—', natureza: '206-2 — Sociedade Empresária Limitada', municipio: `${e.city || b.city || '—'} / ${e.state || b.state || '—'}` },
    regime: { simples: !!b.simples, desde: '01/01/2012' },
    contato: { telefone: e.telefone || fone, telefone2: null, email: e.email || `contato@${dominio}.com.br` },
    cnaePrincipal: { codigo: cod, desc }, cnaesSec: [],
    socios: (b.socios || [{ nome: e.contato || 'Sócio responsável', qual: 'Sócio-Administrador', pct: '100%' }]).map((s, i) => ({
      ...s, desde: '14/05/2010', cpf: `***.${dig.slice(i * 3, i * 3 + 3) || '000'}.${dig.slice(6 + i, 9 + i) || '000'}-**`, fone: `(${fone.slice(1, 3)}) 9${dig.slice(4, 8)}-${dig.slice(8, 12) || '0000'}`, nac: 'Brasileira', faixa: '41 a 50 anos' })),
    docs: FICHA.docs.filter(d => !d.soEqpi).slice(0, 9).map((d, i) => ({ ...d, status: !b.sealType ? 'MISSING' : i === 6 ? 'PENDING' : 'VALID', note: null, meta: null, reused: false })),
    categorias: [{ nome: b.cnae || 'Serviços gerais' }], servicos: [b.cnae || 'Serviços gerais'],
    capacidade: { faturamento: b.capital > 1000000 ? 'R$ 10 a 30 milhões/ano' : 'R$ 1 a 4,8 milhões/ano', funcionarios: b.capital > 1000000 ? '100 a 249' : '10 a 49', plano: b.sealType === 'homologado' ? 'ELOS Homologado' : b.sealType ? 'ELOS Verificado' : 'Sem plano' },
  }
}

export function DemoSupplierProfile({ role = 'BUYER', supplierId, supplier, backTab, navigate }) {
  const isClient = role === 'CLIENT'
  const p = perfilDe(supplierId, supplier)
  const [tab, setTab] = useState('cad')
  const [convite, setConvite] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [objetivo, setObjetivo] = useState('contato')
  const validos = p.docs.filter((d) => ['VALID', 'EXPIRING'].includes(effStatus(d)))
  const pend = p.docs.filter((d) => !['VALID', 'EXPIRING'].includes(effStatus(d)))
  const linha = (k, v) => (
    <div key={k} style={{ display: 'grid', gridTemplateColumns: '190px 1fr', gap: 10, padding: '7px 0', borderTop: '1px solid #f4f5f9', fontFamily: D, fontSize: 13 }}>
      <span style={{ color: '#64748b' }}>{k}</span><span style={{ color: '#1a1c5e', fontWeight: 500 }}>{v || '—'}</span>
    </div>
  )
  const seloLabel = p.sealType === 'homologado' ? '🏅 Selo ELOS Homologado' : p.sealType ? '🏅 Selo ELOS Verificado' : 'Sem selo ELOS'
  const liberado = (t) => <div style={{ background: isClient ? '#f0fdf4' : '#fff7ed', border: `1px solid ${isClient ? '#86efac' : '#fed7aa'}`, borderRadius: 10, padding: '8px 12px', marginTop: 10, fontFamily: D, fontSize: 12, color: isClient ? '#166534' : '#9a3412' }}>{t}</div>
  return (
    <div style={wrap}>
      {isClient ? back(() => navigate('fornecedores', { tab: backTab || 'todos' }), '← Voltar à busca') : back(() => navigate('marketplace'), '← Voltar ao marketplace')}
      <Card style={{ borderRadius: 18, padding: '20px 24px', marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          {p.sealType ? <SealBadge seal={{ client_id: null, status: 'ACTIVE', score: p.score }} size="sm"/>
            : <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: M, fontWeight: 900, color: '#64748b' }}>{p.razao?.[0]}</div>}
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: M, fontWeight: 900, fontSize: 19, color: '#1a1c5e' }}>{p.razao}</span>
              <span style={pill(p.sealType ? '#2E3192' : '#64748b', p.sealType ? 'rgba(46,49,146,.08)' : '#f1f5f9')}>{seloLabel}</span>
            </div>
            <div style={{ fontFamily: D, fontSize: 12.5, color: '#64748b', fontStyle: 'italic' }}>"{p.fantasia}"</div>
            <div style={{ fontFamily: D, fontSize: 12.5, color: '#64748b' }}>CNPJ {p.cnpj} · {p.cidade}/{p.uf} · {p.matriz}{p.sealType ? ` · Selo desde ${p.desde}` : ''}</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
              <span style={pill('#15803d', '#dcfce7')}>✓ {p.cnpjData.situacao}</span>{p.regime.simples && <span style={pill('#15803d', '#dcfce7')}>✓ Simples Nacional</span>}<span style={pill('#475569', '#f1f5f9')}>Porte: {p.cnpjData.porte}</span>
            </div>
            {p.score != null && <div style={{ marginTop: 8, maxWidth: 360 }}><ScoreBar score={p.score}/><div style={{ fontFamily: D, fontSize: 11, color: '#9B9B9B' }}>{validos.length}/{p.docs.length} docs validados · score geral ELOS</div></div>}
          </div>
          <div style={{ textAlign: 'right' }}>
            {enviado ? <div style={{ fontFamily: M, fontWeight: 700, color: '#15803d' }}>✅ Convite enviado!</div>
              : <Button variant="orange" onClick={() => setConvite(true)}>{isClient ? '🤝 Convidar Fornecedor' : '🤝 Enviar Convite'}</Button>}
            <div style={{ fontFamily: D, fontSize: 11, color: '#9B9B9B', marginTop: 6 }}>🔄 Receita Federal {p.consultado}</div>
          </div>
        </div>
      </Card>
      <Tabs pills value={tab} onChange={setTab} tabs={[['cad', '📋 Cadastral'], ['ativ', '🏭 Atividade'], ['soc', `👥 Sócios (${p.socios.length})`], ['docs', `📄 Docs (${validos.length}/${p.docs.length})`], ['cat', '🏷️ Categorias']]}/>
      <Card style={{ borderRadius: 16, padding: '18px 22px' }}>
        {tab === 'cad' && (<>
          <Titulo>🏢 Identificação</Titulo>
          {[['Razão Social', p.razao], ['Nome Fantasia', p.fantasia], ['CNPJ', p.cnpj], ['Situação Cadastral', `${p.cnpjData.situacao} (desde ${p.cnpjData.desde})`], ['Data de Abertura', p.cnpjData.abertura], ['Natureza Jurídica', p.cnpjData.natureza], ['Porte', p.cnpjData.porte], ['Capital Social', p.cnpjData.capital], ['Opção pelo Simples', p.regime.simples ? `Sim (desde ${p.regime.desde})` : 'Não']].map(([k, v]) => linha(k, v))}
          <div style={{ height: 14 }}/>
          <Titulo>📞 Contato</Titulo>
          {linha('Telefone', p.contato.telefone)}{p.contato.telefone2 && linha('Telefone 2', p.contato.telefone2)}{linha('E-mail', p.contato.email)}
          {liberado(isClient ? '✓ Contatos completos — sua empresa é cliente da plataforma.' : '⭐ Comprador Pro: contatos completos do fornecedor e dos sócios liberados.')}
        </>)}
        {tab === 'ativ' && (<>
          <Titulo>🏭 CNAE Principal</Titulo>
          <div style={{ fontFamily: D, fontSize: 13, color: '#1a1c5e', marginBottom: 12 }}><strong>{p.cnaePrincipal.codigo}</strong> — {p.cnaePrincipal.desc}</div>
          {p.cnaesSec.length > 0 && (<>
            <Titulo>📋 CNAEs Secundários ({p.cnaesSec.length})</Titulo>
            {p.cnaesSec.map((c) => <div key={c.codigo} style={{ fontFamily: D, fontSize: 12.5, color: '#374151', padding: '3px 0' }}><strong>{c.codigo}</strong> — {c.desc}</div>)}
            <div style={{ height: 12 }}/>
          </>)}
          <Titulo>🔧 Serviços Declarados</Titulo>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{p.servicos.map((s) => <span key={s} style={pill('#15803d', '#dcfce7')}>{s}</span>)}</div>
        </>)}
        {tab === 'soc' && (<>
          <Titulo>👥 Quadro Societário — {p.socios.length} membro{p.socios.length !== 1 ? 's' : ''}</Titulo>
          {p.socios.map((s) => (
            <div key={s.nome} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 0', borderTop: '1px solid #f4f5f9' }}>
              <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#EEF0FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: M, fontWeight: 800, color: '#2E3192' }}>{s.nome[0]}</div>
              <div>
                <div style={{ fontFamily: M, fontWeight: 700, fontSize: 13, color: '#1a1c5e' }}>{s.nome}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '3px 0' }}><span style={pill('#475569', '#f1f5f9')}>{s.qual}</span>{s.pct && <span style={pill('#c2410c', '#fff7ed')}>{s.pct}</span>}<span style={pill('#475569', '#f1f5f9')}>{s.nac}</span><span style={pill('#475569', '#f1f5f9')}>{s.faixa}</span></div>
                <div style={{ fontFamily: D, fontSize: 11.5, color: '#64748b' }}>Sócio desde {s.desde} · CPF: {s.cpf} · 📞 {s.fone}</div>
              </div>
            </div>
          ))}
          <div style={{ fontFamily: D, fontSize: 11.5, color: '#9B9B9B', marginTop: 8 }}>CPF dos sócios é sempre mascarado (LGPD), em qualquer plano.</div>
        </>)}
        {tab === 'docs' && (<>
          <Titulo>✅ Documentos Validados ({validos.length})</Titulo>
          {validos.length === 0 && <div style={{ fontFamily: D, fontSize: 12.5, color: '#9B9B9B' }}>Nenhum documento validado — o fornecedor ainda não tem selo ELOS.</div>}
          {validos.map((d) => (
            <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderTop: '1px solid #f4f5f9', fontFamily: D, fontSize: 13 }}>
              <StatusDot status={effStatus(d)}/><span style={{ flex: 1, color: '#1a1c5e' }}>{d.label}</span>
              {d.source === 'AUTO' && <span style={pill('#15803d', '#dcfce7')}>⚡ Auto</span>}
              <span style={{ color: '#64748b', fontSize: 12 }}>{d.expires ? `Válido até ${fmt(d.expires)}` : 'sem validade'}</span>
            </div>
          ))}
          <div style={{ height: 12 }}/>
          <Titulo>⏳ Pendentes / Vencidos ({pend.length})</Titulo>
          {pend.map((d) => { const st = effStatus(d); const cfg = DOC_STATUS[st] || DOC_STATUS.MISSING; return <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: '1px solid #f4f5f9', fontFamily: D, fontSize: 12.5 }}><span style={{ color: '#1a1c5e' }}>{d.label}</span><span style={{ color: cfg.color, fontWeight: 700 }}>{cfg.label}</span></div> })}
          <div style={{ fontFamily: D, fontSize: 11.5, color: '#9B9B9B', marginTop: 10 }}>{isClient ? 'Os arquivos ficam disponíveis na ficha do processo quando o fornecedor está em homologação com a sua empresa.' : 'O comprador vê a situação de cada documento; os arquivos ficam restritos ao fornecedor, aos clientes do processo e à EQPI.'}</div>
        </>)}
        {tab === 'cat' && (<>
          <Titulo>🏷️ Categorias de Atuação</Titulo>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>{p.categorias.map((c) => <span key={c.nome} style={pill('#2E3192', 'rgba(46,49,146,.08)')}>{c.nome}</span>)}</div>
          <Titulo>💰 Capacidade Financeira</Titulo>
          {[['Porte', p.cnpjData.porte], ['Capital Social', p.cnpjData.capital], ['Faixa de Faturamento', p.capacidade.faturamento], ['Nº de Funcionários', p.capacidade.funcionarios], ['Plano SIGEC-ELOS', p.capacidade.plano]].map(([k, v]) => linha(k, v))}
          <div style={{ fontFamily: D, fontSize: 11.5, color: '#9B9B9B', fontStyle: 'italic', marginTop: 8 }}>ℹ️ Dados financeiros via Receita Federal ou autodeclarados. A EQPI Tech não garante exatidão para fins de crédito.</div>
        </>)}
      </Card>
      {convite && isClient && (
        <InviteModal prefill={{ razao_social: p.razao, cnpj: p.cnpj, email: p.contato.email }} onClose={() => setConvite(false)} onSent={() => setEnviado(true)}/>
      )}
      {convite && !isClient && (
        <Modal onClose={() => setConvite(false)}>
          <div style={{ fontFamily: M, fontWeight: 800, fontSize: 17, color: '#1a1c5e' }}>Convidar Fornecedor</div>
          <div style={{ fontFamily: D, fontSize: 13, color: '#64748b', marginBottom: 12 }}>Para: {p.razao}</div>
          <BuyerObjective value={objetivo} onChange={setObjetivo}/>
          <div style={{ fontFamily: M, fontWeight: 700, fontSize: 10, color: '#9B9B9B', margin: '8px 0 4px' }}>PRÉVIA DA MENSAGEM (EDITÁVEL)</div>
          <textarea key={objetivo} rows={4} defaultValue={`Olá! Encontrei a ${p.razao} no marketplace SIGEC-ELOS e gostaria de ${objetivo === 'contato' ? 'conversar sobre uma proposta' : 'convidá-los para a nossa homologação de fornecedores'}.`} style={{ width: '100%', boxSizing: 'border-box', borderRadius: 10, border: '1px solid #e2e4ef', padding: 10, fontFamily: D, fontSize: 13 }}/>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <Button variant="neutral" full onClick={() => setConvite(false)}>Cancelar</Button>
            <Button variant="primary" full onClick={() => { setConvite(false); setEnviado(true) }}>{objetivo === 'contato' ? '📞 Enviar Contato' : '📨 Enviar Convite'}</Button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// objetivo do convite do COMPRADOR (não há "subsidiado" — isso é do cliente)
export function BuyerObjective({ value, onChange }) {
  return (<>
    <div style={{ fontFamily: M, fontWeight: 700, fontSize: 10, color: '#9B9B9B', marginBottom: 6 }}>OBJETIVO DO CONVITE *</div>
    {[['contato', '📞 Fazer contato com o Fornecedor', 'Você quer conversar e pedir uma proposta.'], ['homologacao', '🏅 Enviar convite para solicitar homologação', 'O fornecedor passa pela homologação da sua empresa.']].map(([k, t, d]) => (
      <div key={k} onClick={() => onChange(k)} style={{ border: `1.5px solid ${value === k ? '#2E3192' : '#e2e4ef'}`, background: value === k ? 'rgba(46,49,146,.05)' : '#fff', borderRadius: 10, padding: '9px 12px', marginBottom: 6, cursor: 'pointer' }}>
        <div style={{ fontFamily: M, fontWeight: 700, fontSize: 12.5, color: '#1a1c5e' }}>{t}</div><div style={{ fontFamily: D, fontSize: 12, color: '#64748b' }}>{d}</div>
      </div>
    ))}
    {value === 'homologacao' && <div style={{ background: '#eff6ff', borderRadius: 8, padding: '8px 12px', fontFamily: D, fontSize: 12, color: '#1e40af', marginBottom: 6 }}>💡 Preços diferenciados disponíveis: planos corporativos para homologar sua cadeia inteira.</div>}
  </>)
}

