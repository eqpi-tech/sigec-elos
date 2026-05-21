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
  const { documentId, status, expiresAt, note } = body
  if (!documentId || !['VALID', 'REJECTED'].includes(status)) {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'documentId e status (VALID|REJECTED) são obrigatórios' }) }
  }

  // ── Atualizar documento ──────────────────────────────────────────
  const updatePayload = {
    status,
    review_note:  note || null,
    reviewed_by:  user.id,
    reviewed_at:  new Date().toISOString(),
  }
  if (expiresAt) updatePayload.expires_at = expiresAt

  const { data: updatedDoc, error: docErr } = await supabaseAdmin
    .from('documents')
    .update(updatePayload)
    .eq('id', documentId)
    .select('id, supplier_id, type, label, status')
    .single()
  if (docErr) return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: docErr.message }) }

  const supplierId = updatedDoc.supplier_id

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

    // Upsert do selo (suporta múltiplos selos por fornecedor após patch_012)
    const sealFilter = clientId
      ? { supplier_id: supplierId, client_id: clientId }
      : { supplier_id: supplierId }

    await supabaseAdmin
      .from('seals')
      .upsert({
        ...sealFilter,
        seal_name:   sealName,
        level:       sealLevel,
        status:      'ACTIVE',
        score,
        issued_at:   new Date().toISOString(),
        expires_at:  endsAt.toISOString(),
        issued_by:   user.id,
      }, {
        onConflict: clientId ? 'supplier_id,client_id' : 'supplier_id',
      })

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

    await supabaseAdmin
      .from('seals')
      .update({ status: 'SUSPENDED', suspended_reason: reason })
      .eq('supplier_id', supplierId)
      .is(clientId ? null : 'client_id', clientId || null)

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
