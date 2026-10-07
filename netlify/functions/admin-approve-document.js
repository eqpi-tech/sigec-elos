// netlify/functions/admin-approve-document.js
// Aprovar ou rejeitar um documento individual, com data de expiração.
// Após cada ação, verifica se todos os documentos foram revisados e
// dispara a homologação/rejeição automática do fornecedor.
//
// POST body:
//   documentId  string  UUID do documento
//   status      string  'VALID' | 'REJECTED'
//   expiresAt   string  ISO date (obrigatório para VALID, opcional para REJECTED)
//   note        string  Observação do analista

const { createClient } = require('@supabase/supabase-js')

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: HEADERS, body: '' }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) }

  // ── Autenticar chamador ──────────────────────────────────────────
  const token = (event.headers.authorization || '').replace('Bearer ', '')
  if (!token) return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: 'Token ausente' }) }

  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token)
  if (authErr || !user) return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: 'Token inválido' }) }

  // Verifica se é ADMIN
  const { data: roleRow } = await supabaseAdmin
    .from('user_roles').select('role').eq('user_id', user.id).eq('role', 'ADMIN').maybeSingle()
  if (!roleRow) return { statusCode: 403, headers: HEADERS, body: JSON.stringify({ error: 'Acesso negado' }) }

  // ── Parse body ───────────────────────────────────────────────────
  let body
  try { body = JSON.parse(event.body) } catch {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'JSON inválido' }) }
  }
  const { documentId, status, expiresAt, note, inscriptionNumber } = body
  if (!documentId || !['VALID', 'REJECTED', 'NOT_APPLICABLE'].includes(status)) {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'documentId e status (VALID|REJECTED|NOT_APPLICABLE) são obrigatórios' }) }
  }
  if (status === 'REJECTED' && !note) {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Motivo (note) é obrigatório para reprovação' }) }
  }

  // ── Guarda de revogação (25/09) ──────────────────────────────────────
  // Reprovar documento de fornecedor com selo ATIVO revoga a homologação
  // vigente (o cliente deixa de vê-lo homologado, o fornecedor recebe aviso
  // de reprovação dias depois do de aprovação). Exige confirmação explícita.
  if (status === 'REJECTED' && !body.confirmRevoke) {
    const { data: docRow } = await supabaseAdmin
      .from('documents').select('supplier_id, type').eq('id', documentId).maybeSingle()
    // documento coberto por carta de exceção vigente: reprovar não revoga (patch_101)
    const coberto = docRow?.supplier_id
      && (await coveredTypes(supabaseAdmin, docRow.supplier_id)).has(String(docRow.type))
    if (docRow?.supplier_id && !coberto) {
      const { data: activeSeal } = await supabaseAdmin
        .from('seals').select('seal_name, clients(razao_social, nome_fantasia)')
        .eq('supplier_id', docRow.supplier_id).eq('status', 'ACTIVE')
        .limit(1).maybeSingle()
      if (activeSeal) {
        return {
          statusCode: 409, headers: HEADERS,
          body: JSON.stringify({
            error: 'Fornecedor HOMOLOGADO: reprovar este documento suspende a homologação vigente.',
            requiresRevokeConfirm: true,
            sealName: activeSeal.seal_name || activeSeal.clients?.nome_fantasia
              || activeSeal.clients?.razao_social || null,
          }),
        }
      }
    }
  }

  // ── Atualizar documento ──────────────────────────────────────────
  const updatePayload = {
    status,
    review_note:  note || null,
    reviewed_by:  user.id,
    reviewed_at:  new Date().toISOString(),
  }
  if (expiresAt)          updatePayload.expires_at        = expiresAt
  if (inscriptionNumber)  updatePayload.inscription_number = inscriptionNumber

  const { data: updatedDoc, error: docErr } = await supabaseAdmin
    .from('documents')
    .update(updatePayload)
    .eq('id', documentId)
    .select('id, supplier_id, type, label, status')
    .single()
  if (docErr) return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: docErr.message }) }

  const supplierId = updatedDoc.supplier_id

  // ── Recalcula scores POR SELO (fluxo do cliente vs padrão) ──────
  await recalcSealScores(supabaseAdmin, supplierId).catch(e =>
    console.warn('[admin-approve-document] recalc scores:', e.message))

  const { data: allDocs } = await supabaseAdmin
    .from('documents')
    .select('id, type, label, status, source')
    .eq('supplier_id', supplierId)

  // ── Verificar se o PROCESSO está completo (16/09) ───────────────
  // O denominador é a matriz EXIGIDA do processo (fluxo do selo → matriz do
  // cliente → 6 docs do Verificado), nunca só as linhas já existentes:
  // documento exigido que nunca foi enviado não tem linha e ANTES não
  // bloqueava — dois fornecedores viraram homologados com docs faltando.
  const { data: procSeal } = await supabaseAdmin
    .from('seals')
    .select('id, client_id, flow_id')
    .eq('supplier_id', supplierId)
    .neq('status', 'ACTIVE')
    .order('created_at', { ascending: false })
    .limit(1).maybeSingle()

  // documentos cobertos por carta de exceção vigente saem da conta: não
  // travam nem reprovam o processo enquanto a carta valer (patch_101)
  const cobertos = await coveredTypes(supabaseAdmin, supplierId)
  const reqTypes = (await requiredDocsForSeal(supabaseAdmin, supplierId, procSeal))
    .filter(t => !cobertos.has(String(t)))
  const byType = {}
  for (const d of (allDocs || [])) byType[String(d.type)] = d

  // exigido sem linha OU com linha ainda não revisada → processo aberto
  const unreviewed = reqTypes.filter(t => {
    const d = byType[String(t)]
    return !d || ['PENDING', 'MISSING', 'EXPIRING', 'EXPIRED'].includes(d.status)
  })
  // Mobilidade bloqueia o selo (SPEC_MOBILIDADE §7): pessoas faltando ou
  // docs de posto/pessoa exigidos não revisados mantêm o processo aberto
  const mob = await mobilityPending(supabaseAdmin, supplierId, procSeal?.client_id)
    .catch(e => { console.warn('[admin-approve-document] mobilidade:', e.message); return { peopleShortfall: 0, missingOrUnreviewed: 0, rejected: 0 } })
  if (unreviewed.length > 0 || reqTypes.length === 0 || mob.peopleShortfall > 0 || mob.missingOrUnreviewed > 0) {
    // Régua divulgada: "Documento reprovado" é AUTO na reprovação — avisa o
    // fornecedor na hora com o motivo (na finalização, o e-mail de resultado
    // já cobre; aqui o processo segue aberto e ele precisa reenviar)
    if (status === 'REJECTED') {
      try {
        const { data: sup } = await supabaseAdmin
          .from('suppliers').select('razao_social, user_id').eq('id', supplierId).single()
        if (sup?.user_id) {
          await fetch(`${process.env.URL}/.netlify/functions/send-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: sup.user_id,
              subject: `⚠️ Documento reprovado — reenvio necessário · ${sup.razao_social}`,
              html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto">
  <div style="background:#2E3192;padding:24px;border-radius:12px 12px 0 0;text-align:center">
    <h1 style="color:#fff;margin:0;font-size:20px">SIGEC-ELOS</h1></div>
  <div style="background:#fff;padding:26px;border:1px solid #e2e8f0;border-top:none;color:#374151;font-size:15px;line-height:1.6">
    <p>O documento <strong>${updatedDoc.label || updatedDoc.type}</strong> foi reprovado pela análise:</p>
    <div style="background:#fff5f5;border:1px solid #fee2e2;border-radius:8px;padding:12px 16px;margin:14px 0;color:#b91c1c">
      ${note}
    </div>
    <p>Corrija o apontamento e reenvie o documento pela plataforma — o restante do seu processo continua normalmente.</p>
    <p style="text-align:center;margin:24px 0 8px"><a href="https://elos.eqpitech.com.br/fornecedor/documentos" style="display:inline-block;background:#F47E2F;color:#fff;padding:13px 30px;border-radius:9px;text-decoration:none;font-weight:bold">Reenviar documento</a></p>
  </div>
  <div style="background:#f8fafc;padding:12px;border-radius:0 0 12px 12px;text-align:center;font-size:11px;color:#9aa1b5">EQPI Tech · SIGEC-ELOS · elos.eqpitech.com.br</div></div>`,
            }),
          })
        }
      } catch (e) { console.warn('[admin-approve-document] email doc reprovado:', e.message) }
    }
    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({
        updated: true, autoFinalized: false,
        pendingCount: unreviewed.length + mob.peopleShortfall + mob.missingOrUnreviewed,
        mobilityPending: mob.peopleShortfall + mob.missingOrUnreviewed,
      }),
    }
  }

  // ── Auto-finalização: toda a matriz exigida foi revisada ─────────
  const rejected = reqTypes.filter(t => byType[String(t)]?.status === 'REJECTED')
  const approved = reqTypes.filter(t => ['VALID', 'NOT_APPLICABLE'].includes(byType[String(t)]?.status))
  const outcome  = (rejected.length === 0 && mob.rejected === 0) ? 'approved' : 'rejected'

  // Busca dados do fornecedor para o email
  const { data: supplier } = await supabaseAdmin
    .from('suppliers').select('razao_social, cnpj, user_id').eq('id', supplierId).single()

  // Busca convite para descobrir client_id e nome do cliente
  const { data: invite } = await supabaseAdmin
    .from('invitations')
    .select('client_id, flow_id, clients(razao_social, nome_fantasia)')
    .eq('supplier_id', supplierId)
    .not('client_id', 'is', null)
    .is('hoc_id', null)   // processo do HOC é decidido no HOC (patch_116)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const clientId   = invite?.client_id || null
  const clientName = invite?.clients?.razao_social || null

  if (outcome === 'approved') {
    // Determina nível/nome do selo pelo FLUXO do processo (16/09): fluxo
    // Verificado (ex.: 'ELOS Verificado' da EQPI) emite selo com o nome do
    // fluxo e nível Simples — não é homologação plena e o certificado deve
    // dizer isso. Demais fluxos mantêm a nomenclatura de homologação.
    let flowName = null
    const flowIdForName = procSeal?.flow_id || invite?.flow_id || null
    if (flowIdForName) {
      const { data: fl } = await supabaseAdmin
        .from('client_flows').select('name').eq('id', flowIdForName).maybeSingle()
      flowName = fl?.name || null
    }
    const isVerificadoFlow = (flowName || '').toLowerCase().includes('verificado')
    const sealLevel  = isVerificadoFlow ? 'Simples' : (clientId ? 'Premium' : 'Simples')
    const sealName   = isVerificadoFlow ? flowName : (clientId ? `Premium - ${clientName || clientId}` : 'Simples')
    const endsAt     = new Date(); endsAt.setFullYear(endsAt.getFullYear() + 1)

    // Calcula score final
    const total = reqTypes.length
    const valid = approved.length
    const score = total > 0 ? Math.round((valid / total) * 100) : 0

    // Ativa o selo do processo. SEM upsert onConflict: o índice único de
    // seals é parcial e o upsert falha SILENCIOSAMENTE (42P10) — era o bug
    // do 'homologou mas continua pendente'. select→update/insert + erro checado
    let sealQ = supabaseAdmin.from('seals').select('id, seal_name, seal_type, flow_id, released_at')
      .eq('supplier_id', supplierId)
    sealQ = clientId ? sealQ.eq('client_id', clientId) : sealQ.is('client_id', null)
    const { data: sealRow } = await sealQ.limit(1).maybeSingle()

    // Trava de pagamento (patch_112): processo sem pagamento confirmado (nem
    // subsídio) NÃO recebe selo — os documentos ficam aprovados e a
    // homologação sai sozinha quando o pagamento for confirmado e o analista
    // revisar de novo. O gatilho do banco também bloqueia (defesa em dobro).
    if (!sealRow?.released_at) {
      console.warn(`[auto-approve] ${supplierId}: processo sem pagamento confirmado — selo não emitido`)
      return {
        statusCode: 200, headers: HEADERS,
        body: JSON.stringify({ updated: true, autoFinalized: false, paymentPending: true }),
      }
    }

    const activation = {
      status:     'ACTIVE',
      score,
      issued_at:  new Date().toISOString(),
      expires_at: endsAt.toISOString(),
      issued_by:  user.id,
      // Fluxo Verificado: nome/nível vêm do fluxo SEMPRE (o selo criado no
      // cadastro nasce 'Processo {cliente}' e enganava o certificado).
      // Demais: preserva nome/tipo já definidos; fallback padrão do processo
      ...(isVerificadoFlow ? { seal_name: sealName, level: sealLevel }
        : { ...(sealRow?.seal_name ? {} : { seal_name: sealName }),
            ...(sealRow?.seal_type ? {} : { level: sealLevel }) }),
      // fluxo do convite → selo (dá o preço da homologação nos relatórios)
      ...(!sealRow?.flow_id && invite?.flow_id ? { flow_id: invite.flow_id } : {}),
    }
    const { data: sealIns, error: sealWriteErr } = sealRow
      ? await supabaseAdmin.from('seals').update(activation).eq('id', sealRow.id)
      : await supabaseAdmin.from('seals').insert({
          ...activation, supplier_id: supplierId, client_id: clientId || null,
          seal_name: sealRow?.seal_name || sealName, level: sealLevel,
        }).select('id').single()
    if (sealWriteErr) console.error('[auto-approve] seal write:', sealWriteErr.message)
    const sealIdEmitido = sealRow?.id || sealIns?.id || null   // nº do certificado no e-mail

    // Atualiza status do fornecedor
    await supabaseAdmin.from('suppliers').update({ status: 'ACTIVE' }).eq('id', supplierId)

    // Concede perfil BUYER automaticamente (para acesso ao marketplace)
    if (supplier?.user_id) {
      const { data: existingBuyer } = await supabaseAdmin
        .from('buyers').select('id').eq('user_id', supplier.user_id).maybeSingle()

      let buyerId = existingBuyer?.id
      if (!buyerId) {
        const { data: newBuyer } = await supabaseAdmin
          .from('buyers')
          .insert({ user_id: supplier.user_id, razao_social: supplier.razao_social })
          .select('id').single()
        buyerId = newBuyer?.id
      }

      if (buyerId) {
        const { data: existingRole } = await supabaseAdmin
          .from('user_roles').select('id').eq('user_id', supplier.user_id).eq('role', 'BUYER').maybeSingle()
        if (!existingRole) {
          await supabaseAdmin.from('user_roles').insert({
            user_id:  supplier.user_id,
            role:     'BUYER',
            buyer_id: buyerId,
          })
        }
      }
    }

    // Log de auditoria
    await supabaseAdmin.from('audit_log').insert({
      user_id: user.id, action: 'SEAL_AUTO_APPROVED',
      entity_type: 'supplier', entity_id: supplierId,
      metadata: { level: sealLevel, score, client_id: clientId, auto: true },
    })

    // Email de aprovação
    if (supplier?.user_id) {
      await fetch(`${process.env.URL}/.netlify/functions/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId:  supplier.user_id,
          subject: `✅ Homologação concluída — seu Certificado SIGEC ELOS está disponível`,
          html: buildApprovalEmail(supplier, { sealId: sealIdEmitido, clientName: invite?.clients?.nome_fantasia || clientName, expiresAt: endsAt }),
        }),
      }).catch(e => console.warn('Email aprovação:', e.message))
    }

    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({ updated: true, autoFinalized: true, outcome: 'approved', sealLevel, score }),
    }

  } else {
    // Rejeição automática (inclui docs de mobilidade rejeitados — o label
    // já carrega pessoa/posto, ex. "ASO — Fulano (Cidade/UF)")
    const mobRejected = (allDocs || []).filter(d =>
      String(d.type).startsWith('mob:') && d.status === 'REJECTED')
    const rejectedDocs   = [...rejected.map(t => byType[String(t)]), ...mobRejected]
    const rejectedLabels = rejectedDocs.map(d => d.label || `Documento tipo ${d.type}`).join(', ')
    const reason = `Homologação reprovada automaticamente. Documentos com pendências: ${rejectedLabels}. Corrija os documentos e solicite nova análise.`

    let rejQ = supabaseAdmin.from('seals')
      .update({ status: 'SUSPENDED', suspended_reason: reason })
      .eq('supplier_id', supplierId)
    rejQ = clientId ? rejQ.eq('client_id', clientId) : rejQ.is('client_id', null)
    const { error: rejErr } = await rejQ
    if (rejErr) console.error('[auto-reject] seal write:', rejErr.message)

    await supabaseAdmin.from('audit_log').insert({
      user_id: user.id, action: 'SEAL_AUTO_REJECTED',
      entity_type: 'supplier', entity_id: supplierId,
      metadata: { reason, rejectedDocs: rejectedDocs.map(d => d.type), auto: true },
    })

    // Email de rejeição
    if (supplier?.user_id) {
      await fetch(`${process.env.URL}/.netlify/functions/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId:  supplier.user_id,
          subject: '❌ Atualização sobre sua homologação SIGEC-ELOS',
          html: buildRejectionEmail(supplier, rejectedDocs),
        }),
      }).catch(e => console.warn('Email rejeição:', e.message))
    }

    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({ updated: true, autoFinalized: true, outcome: 'rejected', rejectedCount: rejected.length }),
    }
  }
}

// ── Score por selo ───────────────────────────────────────────────
// Cada selo usa o denominador do SEU fluxo: categorias do cliente
// (client_id, migradas do HOC) para selos HOC; categorias globais
// para o selo ELOS próprio. Fallbacks: client_document_flows → global.
// Matriz de documentos que o fluxo de um selo exige (categorias do fluxo →
// category_documents required). Vazio quando o selo não tem fluxo definido.
// requiredDocsForSeal/flowRequiredDocs extraídos p/ lib/required_docs.js (21/09)
const { requiredDocsForSeal, mobilityPending } = require('./lib/required_docs.js')
const { coveredTypes } = require('./lib/exception_cover.js')


async function recalcSealScores(sb, supplierId) {
  const [{ data: seals }, { data: allDocs }, { data: catRows }] = await Promise.all([
    sb.from('seals').select('id, client_id, flow_id').eq('supplier_id', supplierId),
    sb.from('documents').select('type, status').eq('supplier_id', supplierId),
    sb.from('supplier_categories').select('category_id, categories(id, client_id)').eq('supplier_id', supplierId),
  ])
  if (!seals?.length) return

  const catToOwner = {}
  for (const r of (catRows || []))
    catToOwner[r.category_id] = r.categories?.client_id || 'global'

  const allCatIds = Object.keys(catToOwner).map(Number)
  const reqByOwner = {}
  for (let i = 0; i < allCatIds.length; i += 200) {
    const { data: cdRows } = await sb
      .from('category_documents')
      .select('category_id, document_id')
      .in('category_id', allCatIds.slice(i, i + 200))
    for (const r of (cdRows || [])) {
      const owner = catToOwner[r.category_id] || 'global'
      ;(reqByOwner[owner] = reqByOwner[owner] || new Set()).add(r.document_id)
    }
  }

  // NOT_APPLICABLE conta como satisfeito (doc não exigível p/ este fornecedor)
  const validTypes = new Set((allDocs || []).filter(d => d.status === 'VALID' || d.status === 'NOT_APPLICABLE').map(d => String(d.type)))

  // Selo ELOS (sem cliente) = pré-homologação: denominador fixo de docs simples
  const ELOS_VERIFICADO_DOCS = [37, 61, 62, 7, 42, 8]

  for (const seal of seals) {
    const owner = seal.client_id || 'global'
    // Precedência (18/09): categorias do fornecedor DENTRO do cliente
    // primeiro; fluxo do selo como fallback (EQPI Verificado sem categorias)
    let req = seal.client_id ? [...(reqByOwner[owner] || [])] : ELOS_VERIFICADO_DOCS
    if (!req.length) req = await flowRequiredDocs(sb, seal.flow_id)
    if (!req.length && seal.client_id) {
      // Fallback 1: categorias dos fluxos ATIVOS do cliente (patch_043)
      const { data: fcRows } = await sb
        .from('client_flow_categories')
        .select('category_id, client_flows!inner(client_id, active)')
        .eq('client_flows.client_id', seal.client_id)
        .eq('client_flows.active', true)
      const flowCatIds = [...new Set((fcRows || []).map(r => r.category_id))]
      const docSet = new Set()
      for (let i = 0; i < flowCatIds.length; i += 200) {
        const { data: cdRows } = await sb
          .from('category_documents')
          .select('document_id')
          .in('category_id', flowCatIds.slice(i, i + 200))
        for (const r of (cdRows || [])) docSet.add(r.document_id)
      }
      req = [...docSet]
    }
    if (!req.length && seal.client_id) {
      // Fallback 2 (legado): fluxo doc-a-doc
      const { data: flowRows } = await sb
        .from('client_document_flows')
        .select('catalog_id, client_flows!inner(active)')
        .eq('client_id', seal.client_id).eq('required', true)
        .eq('client_flows.active', true)
      req = (flowRows || []).map(r => r.catalog_id)
    }
    if (!req.length) req = [...(reqByOwner['global'] || [])]
    if (!req.length) continue
    const valid = req.filter(id => validTypes.has(String(id))).length
    const score = Math.round((valid / req.length) * 100)
    await sb.from('seals').update({ score }).eq('id', seal.id)
  }
}

// E-mail de homologação concluída (07/10, texto aprovado pelo Luiz): certificado
// + código de verificação + valor da Vendor List. O nº do certificado É o código
// de verificação (seals.cert_code = ELOS- + 12 primeiros hex do id do selo),
// consultável em /verificar.
function buildApprovalEmail(supplier, { sealId, clientName, expiresAt }) {
  const site    = (process.env.FRONTEND_URL || 'https://elos.eqpitech.com.br').replace(/\/$/, '')
  const code    = sealId ? `ELOS-${String(sealId).replace(/-/g, '').slice(0, 12).toUpperCase()}` : null
  const certUrl = sealId ? `${site}/fornecedor/certificado/${sealId}` : `${site}/fornecedor/dashboard`
  const verUrl  = code ? `${site}/verificar?code=${code}` : `${site}/verificar`
  const d       = String(supplier.cnpj || '').replace(/\D/g, '')
  const cnpj    = d.length === 14 ? `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}` : (supplier.cnpj || '')
  const validade = expiresAt ? expiresAt.toLocaleDateString('pt-BR') : null
  const row = (k, v) => `<tr><td style="padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:bold;width:42%;font-size:13px;color:#1a1c5e">${k}</td><td style="padding:10px 12px;border:1px solid #e2e8f0;font-size:13px;color:#374151">${v}</td></tr>`
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#374151">
    <div style="background:#2E3192;padding:28px 32px;border-radius:12px 12px 0 0;text-align:center">
      <h1 style="color:#fff;margin:0 0 4px;font-size:22px">SIGEC ELOS</h1>
      <p style="color:#C7D2FE;margin:0;font-size:13px">Plataforma de Homologação de Fornecedores</p>
    </div>
    <div style="background:#fff;padding:32px;border:1px solid #e2e8f0;border-top:none;line-height:1.6;font-size:14px">
      <div style="text-align:center;margin-bottom:20px">
        <div style="font-size:44px">🏅</div>
        <h2 style="color:#15803d;margin:6px 0 0;font-size:20px">Homologação concluída!</h2>
      </div>
      <p style="margin:0 0 14px">Olá, <strong>${supplier.razao_social}</strong>. Como estão as coisas?</p>
      <p style="margin:0 0 14px">Gostaríamos de informar que o processo de homologação da sua empresa na plataforma SIGEC ELOS${clientName ? ` para a <strong>${clientName}</strong>` : ''} foi <strong>concluído com sucesso</strong>.</p>
      <p style="margin:0 0 20px">Seu <strong>Certificado de Homologação</strong> e o <strong>Selo ELOS</strong> já estão disponíveis em nosso portal, onde você também pode consultar a validade e o status da sua documentação a qualquer momento.</p>
      <div style="text-align:center;margin:0 0 20px">
        <a href="${certUrl}" style="display:inline-block;background:#F47E2F;color:#fff;padding:14px 30px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px">Acessar Certificado de Homologação →</a>
      </div>
      <table style="width:100%;border-collapse:collapse;margin:0 0 22px">
        ${code ? row('Certificado nº / código de verificação', `<span style="font-family:monospace;font-size:14px;color:#2E3192;font-weight:bold">${code}</span>`) : ''}
        ${row('CNPJ', `<span style="font-family:monospace">${cnpj}</span>`)}
        ${validade ? row('Validade', `até ${validade}`) : ''}
        ${row('Portal', `<a href="${site}" style="color:#2E3192">${site.replace(/^https?:\/\//, '')}</a>`)}
        ${row('Verificar autenticidade', `<a href="${verUrl}" style="color:#2E3192">${site.replace(/^https?:\/\//, '')}/verificar</a>`)}
      </table>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px 18px;margin:0 0 20px">
        <p style="margin:0 0 10px"><strong>Sua homologação abre portas:</strong> com ela, sua empresa passa a integrar o <strong>Vendor List SIGEC ELOS</strong> — a lista de fornecedores pré-qualificados consultada por grandes contratantes dos setores de Mineração, Energia e Gás.</p>
        <p style="margin:0 0 10px">Na prática, quando uma empresa compradora busca fornecedores, o seu cadastro aparece como apto, com documentação validada, reduzindo etapas e acelerando a sua contratação.</p>
        <p style="margin:0">Ou seja, o investimento na homologação não é só cumprir uma exigência: é ganhar <strong>visibilidade e prioridade</strong> junto a quem compra.</p>
      </div>
      <p style="margin:0 0 14px">Obrigado pela confiança, ter você com a gente é incrível!</p>
      <p style="margin:0">Atenciosamente,<br><strong>Equipe SIGEC ELOS | EQPI Tech</strong></p>
    </div>
    <div style="background:#f8fafc;padding:16px 24px;border-radius:0 0 12px 12px;text-align:center;font-size:11px;color:#9B9B9B;line-height:1.6">
      *Não responda a este e-mail. Em caso de dúvidas, entre em contato com o nosso suporte.<br>
      EQUIPO INFO SERVIÇOS DE TECNOLOGIA DA INFORMAÇÃO LTDA · CNPJ 21.270.860/0001-15 · São Paulo/SP
    </div>
  </div>`
}

function buildRejectionEmail(supplier, rejectedDocs) {
  const list = rejectedDocs.map(d => `<li style="margin-bottom:6px">${d.label || 'Documento tipo ' + d.type}</li>`).join('')
  return `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto">
    <div style="background:#dc2626;padding:32px;border-radius:12px 12px 0 0;text-align:center">
      <h1 style="color:#fff;margin:0 0 4px;font-size:24px">SIGEC-ELOS</h1>
    </div>
    <div style="background:#fff;padding:32px;border:1px solid #e2e8f0;border-top:none">
      <p>Ola, <strong>${supplier.razao_social}</strong>!</p>
      <p>Apos analise, sua solicitacao de homologacao foi <strong>reprovada</strong>. Os seguintes documentos precisam ser corrigidos:</p>
      <ul style="background:#fff5f5;border:1px solid #fca5a5;border-radius:8px;padding:16px 16px 16px 32px;color:#dc2626">${list}</ul>
      <p>Corrija os documentos e solicite uma nova analise pelo painel do fornecedor.</p>
      <div style="text-align:center;margin-top:24px">
        <a href="https://elos.eqpitech.com.br/fornecedor/documentos" style="display:inline-block;background:#2E3192;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px">Corrigir documentos →</a>
      </div>
    </div>
    <div style="background:#f8fafc;padding:16px;border-radius:0 0 12px 12px;text-align:center;font-size:12px;color:#9B9B9B">EQPI Tech - SIGEC-ELOS</div>
  </div>`
}
