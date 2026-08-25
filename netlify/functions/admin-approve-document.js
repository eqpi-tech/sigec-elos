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

  // ── Verificar se todos os documentos foram revisados ────────────
  const { data: allDocs } = await supabaseAdmin
    .from('documents')
    .select('id, type, label, status, source')
    .eq('supplier_id', supplierId)

  const pending = (allDocs || []).filter(d =>
    ['PENDING', 'MISSING', 'EXPIRING', 'EXPIRED'].includes(d.status)
  )

  // Se ainda há pendências, apenas retorna o doc atualizado
  if (pending.length > 0) {
    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({ updated: true, autoFinalized: false, pendingCount: pending.length }),
    }
  }

  // ── Auto-finalização: todos os docs foram revisados ──────────────
  const rejected = (allDocs || []).filter(d => d.status === 'REJECTED')
  const approved = (allDocs || []).filter(d => d.status === 'VALID')
  const outcome  = rejected.length === 0 ? 'approved' : 'rejected'

  // Busca dados do fornecedor para o email
  const { data: supplier } = await supabaseAdmin
    .from('suppliers').select('razao_social, cnpj, user_id').eq('id', supplierId).single()

  // Busca convite para descobrir client_id e nome do cliente
  const { data: invite } = await supabaseAdmin
    .from('invitations')
    .select('client_id, clients(razao_social)')
    .eq('supplier_id', supplierId)
    .not('client_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const clientId   = invite?.client_id || null
  const clientName = invite?.clients?.razao_social || null

  if (outcome === 'approved') {
    // Determina nível do selo
    const sealLevel  = clientId ? 'Premium' : 'Simples'
    const sealName   = clientId ? `Premium - ${clientName || clientId}` : 'Simples'
    const endsAt     = new Date(); endsAt.setFullYear(endsAt.getFullYear() + 1)

    // Calcula score final
    const total = (allDocs || []).length
    const valid = approved.length
    const score = total > 0 ? Math.round((valid / total) * 100) : 0

    // Ativa o selo do processo. SEM upsert onConflict: o índice único de
    // seals é parcial e o upsert falha SILENCIOSAMENTE (42P10) — era o bug
    // do 'homologou mas continua pendente'. select→update/insert + erro checado
    let sealQ = supabaseAdmin.from('seals').select('id, seal_name, seal_type')
      .eq('supplier_id', supplierId)
    sealQ = clientId ? sealQ.eq('client_id', clientId) : sealQ.is('client_id', null)
    const { data: sealRow } = await sealQ.limit(1).maybeSingle()

    const activation = {
      status:     'ACTIVE',
      score,
      issued_at:  new Date().toISOString(),
      expires_at: endsAt.toISOString(),
      issued_by:  user.id,
      // preserva nome/tipo já definidos (ex.: 'ELOS Verificado' do plano);
      // fallback para o padrão do processo
      ...(sealRow?.seal_name ? {} : { seal_name: sealName }),
      ...(sealRow?.seal_type ? {} : { level: sealLevel }),
    }
    const { error: sealWriteErr } = sealRow
      ? await supabaseAdmin.from('seals').update(activation).eq('id', sealRow.id)
      : await supabaseAdmin.from('seals').insert({
          ...activation, supplier_id: supplierId, client_id: clientId || null,
          seal_name: sealRow?.seal_name || sealName, level: sealLevel,
        })
    if (sealWriteErr) console.error('[auto-approve] seal write:', sealWriteErr.message)

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
          subject: `✅ Parabéns! Homologação aprovada — ${supplier.razao_social}`,
          html: buildApprovalEmail(supplier, sealName, score, endsAt),
        }),
      }).catch(e => console.warn('Email aprovação:', e.message))
    }

    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({ updated: true, autoFinalized: true, outcome: 'approved', sealLevel, score }),
    }

  } else {
    // Rejeição automática
    const rejectedLabels = rejected.map(d => d.label || `Documento tipo ${d.type}`).join(', ')
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
      metadata: { reason, rejectedDocs: rejected.map(d => d.type), auto: true },
    })

    // Email de rejeição
    if (supplier?.user_id) {
      await fetch(`${process.env.URL}/.netlify/functions/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId:  supplier.user_id,
          subject: '❌ Atualização sobre sua homologação SIGEC-ELOS',
          html: buildRejectionEmail(supplier, rejected),
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
async function recalcSealScores(sb, supplierId) {
  const [{ data: seals }, { data: allDocs }, { data: catRows }] = await Promise.all([
    sb.from('seals').select('id, client_id').eq('supplier_id', supplierId),
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
    let req = seal.client_id ? [...(reqByOwner[owner] || [])] : ELOS_VERIFICADO_DOCS
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

function buildApprovalEmail(supplier, sealName, score, expiresAt) {
  const expStr = expiresAt.toLocaleDateString('pt-BR')
  return `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto">
    <div style="background:#2E3192;padding:32px;border-radius:12px 12px 0 0;text-align:center">
      <h1 style="color:#fff;margin:0 0 4px;font-size:24px">SIGEC-ELOS</h1>
      <p style="color:#C7D2FE;margin:0;font-size:13px">Plataforma de Homologacao de Fornecedores</p>
    </div>
    <div style="background:#fff;padding:32px;border:1px solid #e2e8f0;border-top:none">
      <div style="text-align:center;margin-bottom:24px">
        <div style="font-size:48px">🏅</div>
        <h2 style="color:#15803d;margin:8px 0 4px;font-size:20px">Homologacao Aprovada!</h2>
      </div>
      <p style="color:#374151;margin:0 0 16px">Ola, <strong>${supplier.razao_social}</strong>!</p>
      <p style="color:#374151;margin:0 0 20px">Sua empresa foi <strong>homologada</strong> com sucesso na rede SIGEC-ELOS.</p>
      <table style="width:100%;border-collapse:collapse;margin:0 0 24px">
        <tr><td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:bold;width:40%;font-size:13px">Empresa</td><td style="padding:10px;border:1px solid #e2e8f0;font-size:13px">${supplier.razao_social}</td></tr>
        <tr><td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:bold;font-size:13px">CNPJ</td><td style="padding:10px;border:1px solid #e2e8f0;font-size:13px;font-family:monospace">${supplier.cnpj}</td></tr>
        <tr><td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:bold;font-size:13px">Selo</td><td style="padding:10px;border:1px solid #e2e8f0;font-size:14px;color:#F47E2F;font-weight:bold">${sealName}</td></tr>
        <tr><td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:bold;font-size:13px">Score</td><td style="padding:10px;border:1px solid #e2e8f0;font-size:13px">${score}/100</td></tr>
        <tr><td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:bold;font-size:13px">Validade</td><td style="padding:10px;border:1px solid #e2e8f0;font-size:13px">Ate ${expStr}</td></tr>
      </table>
      <div style="text-align:center">
        <a href="https://sigecelos.com.br/fornecedor/dashboard" style="display:inline-block;background:#F47E2F;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px">Acessar meu painel →</a>
      </div>
    </div>
    <div style="background:#f8fafc;padding:16px;border-radius:0 0 12px 12px;text-align:center;font-size:12px;color:#9B9B9B">EQPI Tech - SIGEC-ELOS</div>
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
        <a href="https://sigecelos.com.br/fornecedor/documentos" style="display:inline-block;background:#2E3192;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px">Corrigir documentos →</a>
      </div>
    </div>
    <div style="background:#f8fafc;padding:16px;border-radius:0 0 12px 12px;text-align:center;font-size:12px;color:#9B9B9B">EQPI Tech - SIGEC-ELOS</div>
  </div>`
}
