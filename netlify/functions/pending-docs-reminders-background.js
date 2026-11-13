// netlify/functions/pending-docs-reminders-background.js — lembrete
// AUTOMÁTICO de pendências (21/09, pedido pós-demo VIX): fornecedor
// cadastrado com processo ELOS em aberto recebe, A CADA 3 DIAS, a lista
// do que falta (documentos exigidos + questionário), até completar ou
// atingir 5 lembretes (depois a cobrança volta a ser manual do analista).
//
// Escopo deliberado: processos do ELOS (hoc_process_id IS NULL) e, a partir
// da virada, os do HOC de clientes já migrados (patch_146) — de clientes
// ativos. Os do HOC de cliente não migrado continuam cobrados pelo HOC.
//
// Disparo: workflow daily-notifications (Bearer CRON_SECRET). Background
// function (15 min) com teto de e-mails por execução.

const { createClient } = require('@supabase/supabase-js')
const { frontendUrl } = require('./lib/runtime_env.js')
const { guardMail } = require('./lib/mail_guard.js')
const { requiredDocsForSeal, mobilityTodo, filtroAutomacao } = require('./lib/required_docs.js')
const { DOCS_SO_EQPI } = require('./lib/route_a.js')
const whatsapp = require('./lib/whatsapp.js')

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

const INTERVAL_DAYS = 3
const MAX_REMINDERS = 5
const MAX_EMAILS_PER_RUN = 100
const SENT_STATUSES = ['PENDING', 'VALID', 'EXPIRING', 'NOT_APPLICABLE'] // já enviado/atendido

async function sendEmail(to, subject, html) {
  const g = guardMail(to, subject)   // trava: fora de produção não sai para o real
  if (g.skip) { console.log('[pending-docs] descartado (não-produção):', subject); return }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    body: JSON.stringify({ from: process.env.EMAIL_FROM || 'noreply@eqpitech.com.br', to: g.to, subject: g.subject, html }),
  })
  if (!res.ok) throw new Error(`Resend ${res.status}`)
}

// mobilização agrupada (14/10): um item por posto e um por pessoa
const ST_MARCA = { REJECTED: ' (reprovado)', EXPIRED: ' (vencido)' }
function mobLis(groups) {
  return (groups || []).map((g) => {
    const partes = []
    if (g.peopleMissing) partes.push(`cadastrar ${g.peopleMissing} colaborador${g.peopleMissing > 1 ? 'es' : ''}`)
    if (g.docs.length) partes.push(`enviar ${g.docs.map((d) => d.name + (ST_MARCA[d.status] || '')).join(', ')}`)
    return `<li style="margin-bottom:6px">${g.kind === 'posto' ? '👷' : '👤'} <strong>${g.kind === 'posto' ? 'Posto ' : ''}${g.where}</strong>: ${partes.join(' · ')}</li>`
  }).join('')
}

function buildHtml(clientName, missingDocs, questPending, mobGroups = []) {
  const docsLis = missingDocs.map((d) => `<li style="margin-bottom:6px">📄 ${d}</li>`).join('')
  return `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto">
  <div style="background:#2E3192;padding:24px;border-radius:12px 12px 0 0;text-align:center">
    <h1 style="color:#fff;margin:0;font-size:20px">SIGEC-ELOS</h1></div>
  <div style="background:#fff;padding:26px;border:1px solid #e2e8f0;border-top:none;color:#374151;font-size:15px;line-height:1.6">
    <p>Sua homologação${clientName ? ` com <strong>${clientName}</strong>` : ''} está quase lá — falta pouco para o processo entrar em análise:</p>
    ${missingDocs.length ? `<p><strong>Documentos da empresa:</strong></p><ul style="padding-left:18px">${docsLis}</ul>` : ''}
    ${mobGroups.length ? `<p><strong>Mobilização (postos e colaboradores):</strong></p><ul style="padding-left:18px">${mobLis(mobGroups)}</ul>` : ''}
    ${questPending ? `<p>❓ <strong>Questionário do cliente</strong> aguardando suas respostas.</p>` : ''}
    <p>Assim que tudo estiver enviado, o processo entra automaticamente na fila de análise.</p>
    <p style="text-align:center;margin:24px 0 8px"><a href="${frontendUrl()}/fornecedor/documentos" style="display:inline-block;background:#F47E2F;color:#fff;padding:13px 30px;border-radius:9px;text-decoration:none;font-weight:bold">Completar agora</a></p>
  </div>
  <div style="background:#f8fafc;padding:12px;border-radius:0 0 12px 12px;text-align:center;font-size:11px;color:#9aa1b5">EQPI Tech · SIGEC-ELOS · elos.eqpitech.com.br</div></div>`
}

// Trava de pagamento (01/10, patch_112): processo sem pagamento confirmado
// nem subsídio recebe o aviso para concluir o pagamento, não a lista de docs
function buildPaymentHtml(razao, clientName) {
  return `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto">
  <div style="background:#2E3192;padding:24px;border-radius:12px 12px 0 0;text-align:center">
    <h1 style="color:#fff;margin:0;font-size:20px">SIGEC-ELOS</h1></div>
  <div style="background:#fff;padding:26px;border:1px solid #e2e8f0;border-top:none;color:#374151;font-size:15px;line-height:1.6">
    <p>Olá, <strong>${razao}</strong>.</p>
    <p>Seu cadastro no SIGEC-ELOS está feito, mas a sua homologação${clientName ? ` com <strong>${clientName}</strong>` : ''} ainda não começou: <strong>falta confirmar o pagamento do plano</strong>.</p>
    <p>Pagamentos com cartão ou PIX liberam o acesso na hora; com boleto, a liberação acontece assim que o banco confirma a compensação.</p>
    <p>Depois da confirmação você envia os documentos e o processo entra na fila de análise da EQPI.</p>
    <p style="text-align:center;margin:24px 0 8px"><a href="https://elos.eqpitech.com.br/fornecedor/pagamento" style="display:inline-block;background:#F47E2F;color:#fff;padding:13px 30px;border-radius:9px;text-decoration:none;font-weight:bold">Escolher o plano e pagar</a></p>
  </div>
  <div style="background:#f8fafc;padding:12px;border-radius:0 0 12px 12px;text-align:center;font-size:11px;color:#9aa1b5">EQPI Tech · SIGEC-ELOS · elos.eqpitech.com.br</div></div>`
}

// várias empresas no mesmo login (29/10): uma linha por empresa
function buildHtmlVarias(itens) {
  const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  const linhas = itens.slice(0, 150).map((i) => {
    const partes = []
    if (i.missingTypes.length) partes.push(`${i.missingTypes.length} documento${i.missingTypes.length > 1 ? 's' : ''}`)
    if (i.mobGroups.length) partes.push('Mobilização')
    if (i.questPending) partes.push('questionário')
    return `<tr><td style="padding:6px 8px;border-bottom:1px solid #eef0f6">${esc(i.seal.suppliers?.razao_social || '')}${i.clientName ? `<div style="font-size:11px;color:#9aa1b5">${esc(i.clientName)}</div>` : ''}</td><td style="padding:6px 8px;border-bottom:1px solid #eef0f6;color:#b45309">${partes.join(' · ')}</td></tr>`
  }).join('')
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
  <div style="background:#2E3192;padding:24px;border-radius:12px 12px 0 0;text-align:center"><h1 style="color:#fff;margin:0;font-size:20px">SIGEC-ELOS</h1></div>
  <div style="background:#fff;padding:24px;border:1px solid #e2e8f0;border-top:none;color:#374151;font-size:14px;line-height:1.6">
    <p>Olá! Estas empresas do seu acesso ainda têm pendências para a homologação seguir para a análise:</p>
    <table style="width:100%;border-collapse:collapse;font-size:13px">${linhas}</table>
    ${itens.length > 150 ? `<p style="font-size:12px;color:#6b7280">… e mais ${itens.length - 150} empresas.</p>` : ''}
    <p>No SIGEC-ELOS, escolha a empresa no menu do topo e envie o que falta em <strong>Documentos</strong>. Várias certidões já foram buscadas automaticamente.</p>
    <p style="text-align:center;margin:22px 0 6px"><a href="${frontendUrl()}/fornecedor/documentos" style="display:inline-block;background:#F47E2F;color:#fff;padding:12px 28px;border-radius:9px;text-decoration:none;font-weight:bold">Enviar documentos</a></p>
  </div></div>`
}

exports.handler = async (event) => {
  const bearer = (event.headers?.authorization || '').replace('Bearer ', '')
  if (!process.env.CRON_SECRET || bearer !== process.env.CRON_SECRET) return { statusCode: 401 }

  const deadline = Date.now() + 12 * 60 * 1000
  let sent = 0, skipped = 0
  try {
    // processos em aberto nas filas automáticas (patch_146), de clientes ativos
    const filtro = await filtroAutomacao(supabase)
    const { data: seals } = await supabase
      .from('seals')
      .select('id, supplier_id, client_id, flow_id, created_at, released_at, clients(active, nome_fantasia, razao_social), suppliers(razao_social, email, user_id)')
      .eq('status', 'PENDING')
      .or(filtro)
      .limit(500)

    // e-mails de login em lote (fallback: e-mail de cadastro — regra nº 14)
    const userIds = [...new Set((seals || []).map((s) => s.suppliers?.user_id).filter(Boolean))]
    const emailMap = {}
    for (let i = 0; i < userIds.length; i += 100) {
      const { data: users } = await supabase.rpc('get_user_emails_by_ids', { user_ids: userIds.slice(i, i + 100) })
      for (const u of users || []) if (u.email) emailMap[u.id] = u.email
    }

    // 13/11: histórico de lembretes de TODOS os processos numa leitura (antes:
    // uma consulta por processo) e ordem justa — primeiro quem está há mais tempo
    // sem lembrete. A varredura sem ordem parava no tempo-limite antes de chegar
    // aos processos mais novos (136 da VIX nunca receberam lembrete).
    const ids = (seals || []).map((s) => s.id)
    const hist = {}   // seal_id → { doc: [datas desc], pay: [datas desc] }
    for (let i = 0; i < ids.length; i += 100) {
      const { data: rows } = await supabase.from('audit_log').select('entity_id, action, created_at')
        .in('action', ['DOC_PENDING_REMINDER', 'PAYMENT_PENDING_REMINDER']).in('entity_id', ids.slice(i, i + 100))
        .order('created_at', { ascending: false })
      for (const r of rows || []) {
        const h = hist[r.entity_id] || (hist[r.entity_id] = { doc: [], pay: [] })
        h[r.action === 'DOC_PENDING_REMINDER' ? 'doc' : 'pay'].push(r.created_at)
      }
    }
    const supIds = [...new Set((seals || []).filter((s) => !s.released_at).map((s) => s.supplier_id))]
    const planoPendente = new Set()
    for (let i = 0; i < supIds.length; i += 100) {
      const { data: pl } = await supabase.from('plans').select('supplier_id').eq('status', 'PENDING').in('supplier_id', supIds.slice(i, i + 100))
      for (const r of pl || []) planoPendente.add(r.supplier_id)
    }
    const prazo = INTERVAL_DAYS * 86400000
    const candidatos = []
    for (const seal of seals || []) {
      if (seal.clients && seal.clients.active === false) { skipped++; continue }
      const h = hist[seal.id] || { doc: [], pay: [] }
      const lista = seal.released_at ? h.doc : h.pay
      if (lista.length >= MAX_REMINDERS) { skipped++; continue }
      if (!seal.released_at && planoPendente.has(seal.supplier_id)) { skipped++; continue }   // boleto aguardando compensação
      // 1º lembrete só ≥3 dias após o início do processo (régua divulgada: "a cada 3 dias")
      const ultimo = lista[0] || seal.created_at
      if (ultimo && Date.now() - new Date(ultimo).getTime() < prazo) { skipped++; continue }
      candidatos.push({ seal, hist: lista, ordem: lista[0] ? new Date(lista[0]).getTime() : 0, criado: new Date(seal.created_at || 0).getTime() })
    }
    candidatos.sort((a, b) => a.ordem - b.ordem || a.criado - b.criado)

    // catálogo e questionários lidos uma vez (antes: a cada processo)
    const { data: catRows } = await supabase.from('documents_catalog').select('id, name, responsibility')
    const catalogo = Object.fromEntries((catRows || []).map((c) => [String(c.id), c]))
    const reqQPorCliente = {}
    const reqQ = async (clientId) => {
      if (!(clientId in reqQPorCliente)) {
        const { data: qs } = await supabase.from('questionnaires').select('id, active, questionnaire_questions(id, required)').eq('client_id', clientId)
        reqQPorCliente[clientId] = (qs || []).filter((q) => q.active !== false)
          .flatMap((q) => (q.questionnaire_questions || []).filter((x) => x.required).map((x) => x.id))
      }
      return reqQPorCliente[clientId]
    }

    // 29/10 (go-live VIXPAR): pendências juntadas POR DESTINATÁRIO — um login com
    // várias empresas (pré-cadastro: BRMED 107) recebe UM e-mail com a lista; com
    // uma empresa só, o e-mail é o mesmo de antes. Cadência segue por processo.
    const porDest = new Map()
    const waItens = []
    const RESERVA_ENVIO = 4 * 60 * 1000   // tempo guardado para enviar o que foi juntado
    for (const { seal, hist: h } of candidatos) {
      if (Date.now() > deadline - RESERVA_ENVIO || porDest.size >= MAX_EMAILS_PER_RUN) break
      const to = emailMap[seal.suppliers?.user_id] || seal.suppliers?.email
      if (!to) { skipped++; continue }

      // processo sem pagamento confirmado: aviso de pagamento (mesma cadência)
      if (!seal.released_at) {
        const clientName = seal.clients?.nome_fantasia || seal.clients?.razao_social || null
        try {
          await sendEmail(to, '💳 Falta confirmar o pagamento da sua homologação — SIGEC-ELOS',
            buildPaymentHtml(seal.suppliers?.razao_social || '', clientName))
          await supabase.from('audit_log').insert({
            action: 'PAYMENT_PENDING_REMINDER', entity_type: 'seal', entity_id: seal.id,
            metadata: { to, lembrete_n: h.length + 1 },
          })
          sent++
        } catch (e) { console.warn(`[payment-reminders] ${seal.id}: ${e.message}`) }
        continue
      }

      // pendências de documentos: exigidos sem envio (REJECTED/EXPIRED contam
      // como pendente — o fornecedor precisa reenviar)
      const reqTypes = (await requiredDocsForSeal(supabase, seal.supplier_id, seal)).map(String)
      // mobilização (PF) também é exigida pelo fluxo (14/10): agrupada por posto e por pessoa
      const mobGroups = seal.client_id ? await mobilityTodo(supabase, seal.supplier_id, seal.client_id) : []
      if (!reqTypes.length && !mobGroups.length) { skipped++; continue }
      const { data: docs } = await supabase
        .from('documents').select('type, status')
        .eq('supplier_id', seal.supplier_id).in('type', reqTypes)
      const okTypes = new Set((docs || []).filter((d) => SENT_STATUSES.includes(d.status)).map((d) => String(d.type)))
      // documento de responsabilidade do CLIENTE não é cobrado do fornecedor;
      // o interno (captado pela EQPI) que não foi captado é (Luiz, 14/10);
      // obtido pela EQPI (Inscrição Estadual, patch_148) nunca é cobrado
      const missingTypes = reqTypes.filter((t) => !okTypes.has(t) && catalogo[t]?.responsibility !== 'cliente' && !DOCS_SO_EQPI.includes(String(t)))

      // questionário do cliente: perguntas obrigatórias sem resposta
      let questPending = false
      if (seal.client_id) {
        const req = await reqQ(seal.client_id)
        if (req.length) {
          const { data: ans } = await supabase
            .from('questionnaire_answers').select('question_id')
            .eq('supplier_id', seal.supplier_id).in('question_id', req)
          questPending = new Set((ans || []).map((a) => a.question_id)).size < req.length
        }
      }

      if (!missingTypes.length && !questPending && !mobGroups.length) { skipped++; continue } // completo → fila cuida

      const missingNames = missingTypes.map((t) => catalogo[t]?.name || `Documento #${t}`).slice(0, 15)
      const clientName = seal.clients?.nome_fantasia || seal.clients?.razao_social || null

      if (!porDest.has(to)) porDest.set(to, [])
      porDest.get(to).push({ seal, clientName, missingTypes, missingNames, questPending, mobGroups, lembreteN: h.length + 1, primeiro: h.length ? h[h.length - 1] : null })
    }

    for (const [to, itens] of porDest) {
      if (Date.now() > deadline + 60000) break   // margem do limite de 15 min da função
      try {
        if (itens.length === 1) {
          const i = itens[0]
          await sendEmail(to, `📋 Faltam ${i.missingTypes.length + i.mobGroups.length + (i.questPending ? 1 : 0)} pendência(s) na sua homologação — SIGEC-ELOS`,
            buildHtml(i.clientName, i.missingNames, i.questPending, i.mobGroups.slice(0, 20)))
        } else {
          await sendEmail(to, `📋 Pendências em ${itens.length} empresas da sua homologação — SIGEC-ELOS`, buildHtmlVarias(itens))
        }
        await supabase.from('audit_log').insert(itens.map((i) => ({
          action: 'DOC_PENDING_REMINDER', entity_type: 'seal', entity_id: i.seal.id,
          metadata: { to, agrupado: itens.length > 1 ? itens.length : undefined, missing_docs: i.missingTypes.length, mob_pessoas: i.mobGroups.reduce((n, g) => n + g.peopleMissing, 0), mob_docs: i.mobGroups.reduce((n, g) => n + g.docs.length, 0), quest_pendente: i.questPending, lembrete_n: i.lembreteN },
        })))
        sent++
        // 13/11: WhatsApp junto com o 3º e o 5º e-mail, se nada foi feito desde o 1º
        for (const i of itens) if ((i.lembreteN === 3 || i.lembreteN === 5) && i.primeiro) waItens.push(i)
      } catch (e) { console.warn(`[pending-reminders] ${to}: ${e.message}`) }
    }

    // ── WhatsApp: último recurso (decisões do Luiz, 13/11) ────────────────
    // só o titular, agrupado por número, máx. 2 por processo; só com o modelo
    // aprovado pela Meta (antes disso fica registrado o motivo e nada sai)
    let waEnviados = 0, waMotivo = null
    if (waItens.length) {
      const disp = await whatsapp.disponivel(supabase, 'pendencias')
      if (!disp.ok) waMotivo = disp.motivo
      else {
        const porNumero = new Map()
        for (const i of waItens) {
          if (Date.now() > deadline + 90000) break
          const { data: numero } = await supabase.rpc('supplier_whatsapp_numero', { p_supplier: i.seal.supplier_id })
          if (!numero) continue
          const { data: semAcao } = await supabase.rpc('supplier_sem_acao_desde', { p_supplier: i.seal.supplier_id, p_desde: i.primeiro })
          if (!semAcao) continue
          const { count } = await supabase.from('whatsapp_messages').select('id', { count: 'exact', head: true })
            .eq('direcao', 'saida').eq('modelo', 'pendencias').contains('seal_ids', [i.seal.id]).neq('status', 'failed')
          if ((count || 0) >= 2) continue
          if (!porNumero.has(numero)) porNumero.set(numero, [])
          porNumero.get(numero).push(i)
        }
        for (const [numero, its] of porNumero) {
          const r = await whatsapp.enviar(supabase, {
            numero, modelo: 'pendencias',
            variaveis: {
              1: whatsapp.rotuloEmpresas(its.map((i) => i.seal.suppliers?.razao_social)),
              2: [...new Set(its.map((i) => i.clientName).filter(Boolean))].join(' e ') || 'o SIGEC-ELOS',
              3: its.reduce((n, i) => n + i.missingTypes.length + i.mobGroups.length + (i.questPending ? 1 : 0), 0),
            },
            sealIds: its.map((i) => i.seal.id), supplierIds: [...new Set(its.map((i) => i.seal.supplier_id))],
          })
          if (r.ok) waEnviados++
          else console.warn(`[pending-reminders] whatsapp ${numero.slice(0, 6)}…: ${r.motivo}`)
        }
      }
    }

    console.log(`[pending-reminders] candidatos=${candidatos.length} enviados=${sent} pulados=${skipped}`)
    await supabase.from('audit_log').insert({ action: 'PENDING_REMINDERS_RUN', entity_type: 'rotina',
      metadata: { abertos: (seals || []).length, candidatos: candidatos.length, destinatarios: porDest.size, enviados: sent, pulados: skipped,
        whatsapp: { elegiveis: waItens.length, enviados: waEnviados, motivo: waMotivo } } })
    return { statusCode: 200, body: JSON.stringify({ sent, skipped }) }
  } catch (e) {
    console.error('[pending-reminders]', e)
    return { statusCode: 500 }
  }
}
