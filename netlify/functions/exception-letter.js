// netlify/functions/exception-letter.js
// Carta de Exceção: o CLIENTE anexa uma carta aprovando uma CATEGORIA
// específica do processo, mesmo com documento reprovado/faltante, e informa
// a VALIDADE da carta. Regra de 28/09 (patch_101): a exceção vale NA HORA,
// sem análise do backoffice — o processo fica "Homologado com Exceção".
// A carta cobre os documentos da categoria que estavam pendentes no anexo;
// vencida a carta sem regularização, o processo é suspenso
// (exception-letters-expire.js, rotina diária).
//
// POST body:
//   action 'upload'  { sealId, categoryId, validUntil 'AAAA-MM-DD', file {name, mime, base64}, note? }
//       → quem: CLIENT dono do processo (ou ADMIN em nome dele). Reenviar
//         para a mesma categoria substitui a carta (ex.: renovar a validade)
//   action 'approve' { sealId, note? }
//       → legado (cartas EXCEPTION_REQUESTED de antes de 28/09): ADMIN ativa

const { createClient } = require('@supabase/supabase-js')
const { pendingOfCategory, hojeBR, fmtBR } = require('./lib/exception_cover.js')
const { guardMail } = require('./lib/mail_guard.js')

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)
const HEADERS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' }

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: HEADERS, body: '' }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) }

  const token = (event.headers.authorization || '').replace('Bearer ', '')
  if (!token) return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: 'Token ausente' }) }
  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token)
  if (authErr || !user) return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: 'Sessão expirada — saia e entre novamente na plataforma' }) }

  let body
  try { body = JSON.parse(event.body) } catch { return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'JSON inválido' }) } }
  const { action, sealId, categoryId, file, note, validUntil } = body
  if (!sealId || !['upload', 'approve'].includes(action))
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: "sealId e action ('upload'|'approve') são obrigatórios" }) }

  try {
    const { data: seal } = await supabaseAdmin
      .from('seals').select('id, supplier_id, client_id, status, seal_name, clients(razao_social)')
      .eq('id', sealId).maybeSingle()
    if (!seal) throw new Error('Processo (selo) não encontrado')

    const { data: roles } = await supabaseAdmin
      .from('user_roles').select('role, client_id').eq('user_id', user.id)
    const isAdmin  = (roles || []).some(r => r.role === 'ADMIN')
    const isOwnerClient = seal.client_id &&
      (roles || []).some(r => r.role === 'CLIENT' && r.client_id === seal.client_id)

    // ── upload da carta (cliente do processo, ou admin em nome dele) ──
    if (action === 'upload') {
      if (!isAdmin && !isOwnerClient)
        return { statusCode: 403, headers: HEADERS, body: JSON.stringify({ error: 'Apenas o cliente do processo pode anexar a carta de exceção' }) }
      if (!categoryId || !file?.base64)
        return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'categoryId e file são obrigatórios' }) }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(validUntil || '') || validUntil <= hojeBR())
        return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Informe a validade da carta (uma data futura)' }) }

      const buffer = Buffer.from(file.base64, 'base64')
      if (buffer.length > 4.5 * 1024 * 1024)
        return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Arquivo acima de 4,5MB' }) }

      const ext  = (file.name || 'carta.pdf').split('.').pop().toLowerCase()
      const path = `exception-letters/${sealId}/${categoryId}_${Date.now()}.${ext}`
      const { error: upErr } = await supabaseAdmin.storage
        .from('documents')
        .upload(path, buffer, { upsert: true, contentType: file.mime || 'application/pdf' })
      if (upErr) throw new Error('Erro no storage: ' + upErr.message)

      // o que a carta cobre: documentos exigidos da categoria fora de dia AGORA
      const cobertos = await pendingOfCategory(supabaseAdmin, seal.supplier_id, categoryId)
      const { data: cat } = await supabaseAdmin.from('categories').select('name').eq('id', categoryId).maybeSingle()
      const agora = new Date().toISOString()

      const { error: rowErr } = await supabaseAdmin.from('supplier_category_approvals').upsert({
        supplier_id:  seal.supplier_id,
        seal_id:      sealId,
        category_id:  categoryId,
        client_id:    seal.client_id,
        status:       'EXCEPTION_APPROVED',          // vale na hora (28/09)
        letter_path:  path,
        letter_name:  file.name || 'carta.pdf',
        letter_valid_until: validUntil,
        covered_docs: cobertos.map((d) => d.type),
        client_note:  note || null,
        requested_by: user.id,
        approved_by:  user.id,
        approved_at:  agora,
        closed_at:    null,
        warned_at:    null,
      }, { onConflict: 'seal_id,category_id' })
      if (rowErr) throw new Error(rowErr.message)

      // processo homologado com exceção (datas do selo só mudam se ele ainda não estava ativo)
      const { data: vigentes } = await supabaseAdmin.from('supplier_category_approvals')
        .select('letter_valid_until, categories(name)').eq('seal_id', sealId).eq('status', 'EXCEPTION_APPROVED')
      const catNames = (vigentes || []).map((v) => `${v.categories?.name || 'categoria'} (até ${fmtBR(v.letter_valid_until)})`)
      const endsAt = new Date(); endsAt.setFullYear(endsAt.getFullYear() + 1)
      const { error: sealErr } = await supabaseAdmin.from('seals').update({
        status: 'ACTIVE',
        exception: true,
        exception_note: `Homologado com Exceção por carta do cliente${seal.clients?.razao_social ? ` ${seal.clients.razao_social}` : ''} — ${catNames.join(', ')}`,
        suspended_reason: null,
        ...(seal.status === 'ACTIVE' ? {} : { issued_at: agora, expires_at: endsAt.toISOString(), issued_by: user.id }),
      }).eq('id', sealId)
      if (sealErr) throw new Error(sealErr.message)
      await supabaseAdmin.from('suppliers').update({ status: 'ACTIVE' })
        .eq('id', seal.supplier_id).neq('status', 'SUSPENDED')

      await supabaseAdmin.from('audit_log').insert({
        user_id: user.id, action: 'EXCEPTION_LETTER_UPLOADED',
        entity_type: 'supplier', entity_id: seal.supplier_id,
        metadata: { seal_id: sealId, category_id: categoryId, letter: file.name, valid_until: validUntil,
                    covered_docs: cobertos.map((d) => d.type), note: note || null, auto_approved: true },
      })   // query builder do supabase não tem .catch: o erro vem no retorno e é ignorado

      // aviso ao fornecedor: homologado com exceção + o que regularizar até quando
      try {
        const { data: sup } = await supabaseAdmin.from('suppliers').select('razao_social, email, user_id').eq('id', seal.supplier_id).single()
        let to = sup?.email
        if (sup?.user_id) { const { data: u } = await supabaseAdmin.auth.admin.getUserById(sup.user_id); to = u?.user?.email || to }
        const cliente = seal.clients?.razao_social || 'o cliente'
        const site = process.env.FRONTEND_URL || 'https://elos.eqpitech.com.br'
        const subject = `🏅 Homologado com exceção — ${sup?.razao_social || ''} · regularize até ${fmtBR(validUntil)}`
        const g = guardMail(to, subject)
        if (!g.skip && process.env.RESEND_API_KEY) {
          const lista = cobertos.length ? `<ul style="padding-left:18px">${cobertos.map((d) => `<li>${d.label}</li>`).join('')}</ul>` : ''
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
            body: JSON.stringify({ from: process.env.EMAIL_FROM || 'noreply@eqpitech.com.br', to: g.to, subject: g.subject, html: `<div style="font-family:Arial,sans-serif;max-width:540px;margin:0 auto">
  <div style="background:#2E3192;padding:24px;border-radius:12px 12px 0 0;text-align:center"><h1 style="color:#fff;margin:0;font-size:20px">SIGEC-ELOS</h1></div>
  <div style="background:#fff;padding:26px;border:1px solid #e2e8f0;border-top:none;color:#374151;font-size:15px;line-height:1.6">
    <p>A <strong>${cliente}</strong> emitiu uma carta de exceção e a homologação da <strong>${sup?.razao_social || ''}</strong> na categoria <strong>${cat?.name || ''}</strong> está <strong>ativa com exceção até ${fmtBR(validUntil)}</strong>.</p>
    ${lista ? `<p>Para manter a homologação, regularize até essa data:</p>${lista}` : ''}
    <p style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:10px 14px;font-size:13px">Se os documentos não forem regularizados até ${fmtBR(validUntil)}, a homologação será <strong>suspensa</strong>.</p>
    <p style="text-align:center;margin:24px 0 8px"><a href="${site}/fornecedor/documentos" style="display:inline-block;background:#F47E2F;color:#fff;padding:13px 30px;border-radius:9px;text-decoration:none;font-weight:bold">Regularizar documentos</a></p>
  </div></div>` }),
          })
        }
      } catch (e) { console.warn('[exception-letter] e-mail fornecedor:', e.message) }

      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: true, letter_path: path, valid_until: validUntil, covered: cobertos }) }
    }

    // ── homologar com exceção (só backoffice) ─────────────────────────
    if (!isAdmin)
      return { statusCode: 403, headers: HEADERS, body: JSON.stringify({ error: 'Apenas o backoffice homologa com exceção' }) }

    const { data: letters } = await supabaseAdmin
      .from('supplier_category_approvals')
      .select('id, category_id, categories(name)')
      .eq('seal_id', sealId).eq('status', 'EXCEPTION_REQUESTED')
    if (!letters?.length)
      return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Nenhuma carta de exceção anexada para este processo' }) }

    const catNames = letters.map(l => l.categories?.name || `#${l.category_id}`)
    await supabaseAdmin.from('supplier_category_approvals')
      .update({ status: 'EXCEPTION_APPROVED', approved_by: user.id, approved_at: new Date().toISOString() })
      .in('id', letters.map(l => l.id))

    const endsAt = new Date(); endsAt.setFullYear(endsAt.getFullYear() + 1)
    const { error: sealErr } = await supabaseAdmin.from('seals').update({
      status: 'ACTIVE',
      exception: true,
      exception_note: `Homologado com Exceção a pedido do cliente${seal.clients?.razao_social ? ` ${seal.clients.razao_social}` : ''} — categorias: ${catNames.join(', ')}${note ? ` · ${note}` : ''}`,
      issued_at: new Date().toISOString(),
      expires_at: endsAt.toISOString(),
      issued_by: user.id,
    }).eq('id', sealId)
    if (sealErr) throw new Error(sealErr.message)

    await supabaseAdmin.from('suppliers').update({ status: 'ACTIVE' })
      .eq('id', seal.supplier_id).neq('status', 'SUSPENDED')

    await supabaseAdmin.from('audit_log').insert({
      user_id: user.id, action: 'SEAL_APPROVED_EXCEPTION',
      entity_type: 'supplier', entity_id: seal.supplier_id,
      metadata: { seal_id: sealId, categorias: catNames, note: note || null },
    })   // idem: sem .catch no query builder

    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: true, categorias: catNames }) }
  } catch (err) {
    console.error('[exception-letter]', err)
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) }
  }
}
