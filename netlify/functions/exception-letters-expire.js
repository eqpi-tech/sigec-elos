// netlify/functions/exception-letters-expire.js — rotina diária das Cartas de
// Exceção (patch_101). POST com Bearer CRON_SECRET (daily-notifications.yml).
//  · 7 dias antes do vencimento: avisa o fornecedor do que falta regularizar
//  · carta vencida: documentos cobertos em dia → exceção ENCERRADA
//    (EXCEPTION_RESOLVED); senão o processo é SUSPENSO (EXCEPTION_EXPIRED)
//    e o fornecedor é avisado. Nunca apaga nada.
const { createClient } = require('@supabase/supabase-js')
const { hojeBR, fmtBR } = require('./lib/exception_cover.js')
const { guardMail } = require('./lib/mail_guard.js')

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const EM_DIA = ['VALID', 'NOT_APPLICABLE', 'EXPIRING']
const AVISO_DIAS = 7

async function destinatario(supplierId) {
  const { data: sup } = await sb.from('suppliers').select('razao_social, email, user_id').eq('id', supplierId).single()
  let to = sup?.email
  if (sup?.user_id) { const { data: u } = await sb.auth.admin.getUserById(sup.user_id); to = u?.user?.email || to }
  return { to, razao: sup?.razao_social || '' }
}

async function enviar(to, subject, corpo) {
  const g = guardMail(to, subject)
  if (g.skip || !process.env.RESEND_API_KEY) return false
  const site = process.env.FRONTEND_URL || 'https://elos.eqpitech.com.br'
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    body: JSON.stringify({ from: process.env.EMAIL_FROM || 'noreply@eqpitech.com.br', to: g.to, subject: g.subject, html: `<div style="font-family:Arial,sans-serif;max-width:540px;margin:0 auto">
  <div style="background:#2E3192;padding:24px;border-radius:12px 12px 0 0;text-align:center"><h1 style="color:#fff;margin:0;font-size:20px">SIGEC-ELOS</h1></div>
  <div style="background:#fff;padding:26px;border:1px solid #e2e8f0;border-top:none;color:#374151;font-size:15px;line-height:1.6">${corpo}
    <p style="text-align:center;margin:24px 0 8px"><a href="${site}/fornecedor/documentos" style="display:inline-block;background:#F47E2F;color:#fff;padding:13px 30px;border-radius:9px;text-decoration:none;font-weight:bold">Regularizar documentos</a></p>
  </div></div>` }),
  }).catch((e) => console.warn('[exception-expire] e-mail:', e.message))
  return true
}

// documentos cobertos que continuam fora de dia
async function pendentes(row) {
  const tipos = row.covered_docs || []
  if (!tipos.length) return []
  const { data: docs } = await sb.from('documents').select('type, status, label').eq('supplier_id', row.supplier_id).in('type', tipos)
  const st = Object.fromEntries((docs || []).map((d) => [d.type, d]))
  const { data: cat } = await sb.from('documents_catalog').select('id, name').in('id', tipos.map(Number).filter(Boolean))
  const nome = Object.fromEntries((cat || []).map((c) => [String(c.id), c.name]))
  return tipos.filter((t) => !EM_DIA.includes(st[t]?.status)).map((t) => st[t]?.label || nome[t] || `Documento ${t}`)
}

exports.handler = async (event) => {
  const bearer = (event.headers?.authorization || '').replace('Bearer ', '')
  if (!process.env.CRON_SECRET || bearer !== process.env.CRON_SECRET) return { statusCode: 401, body: '{}' }
  const hoje = hojeBR()
  const limiteAviso = new Date(Date.parse(hoje) + AVISO_DIAS * 864e5).toISOString().slice(0, 10)
  const out = { avisos: 0, encerradas: 0, suspensos: 0 }

  const { data: abertas, error } = await sb.from('supplier_category_approvals')
    .select('id, seal_id, supplier_id, category_id, covered_docs, letter_valid_until, warned_at, categories(name), clients(razao_social)')
    .eq('status', 'EXCEPTION_APPROVED').not('letter_valid_until', 'is', null)
    .lte('letter_valid_until', limiteAviso)
  if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) }

  for (const row of abertas || []) {
    try {
      const falta = await pendentes(row)
      const cat = row.categories?.name || 'categoria'
      const cliente = row.clients?.razao_social || 'o cliente'

      // ainda vigente (vence em até 7 dias): aviso único
      if (row.letter_valid_until >= hoje) {
        if (row.warned_at || !falta.length) continue
        const { to, razao } = await destinatario(row.supplier_id)
        await enviar(to, `⏳ Carta de exceção vence em ${fmtBR(row.letter_valid_until)} — ${razao}`,
          `<p>A carta de exceção da <strong>${cliente}</strong> para a categoria <strong>${cat}</strong> vence em <strong>${fmtBR(row.letter_valid_until)}</strong>.</p>
           <p>Ainda falta regularizar:</p><ul style="padding-left:18px">${falta.map((f) => `<li>${f}</li>`).join('')}</ul>
           <p style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:10px 14px;font-size:13px">Sem a regularização até essa data, a homologação será <strong>suspensa</strong>.</p>`)
        await sb.from('supplier_category_approvals').update({ warned_at: new Date().toISOString() }).eq('id', row.id)
        out.avisos++
        continue
      }

      // vencida
      const agora = new Date().toISOString()
      if (!falta.length) {
        await sb.from('supplier_category_approvals').update({ status: 'EXCEPTION_RESOLVED', closed_at: agora }).eq('id', row.id)
        const { data: resto } = await sb.from('supplier_category_approvals').select('id')
          .eq('seal_id', row.seal_id).eq('status', 'EXCEPTION_APPROVED').limit(1)
        if (!resto?.length) await sb.from('seals').update({ exception: false }).eq('id', row.seal_id)
        await sb.from('audit_log').insert({ action: 'EXCEPTION_LETTER_RESOLVED', entity_type: 'supplier', entity_id: row.supplier_id,
          metadata: { seal_id: row.seal_id, category_id: row.category_id, valid_until: row.letter_valid_until } })
        out.encerradas++
        continue
      }

      const motivo = `Carta de exceção (${cat}) vencida em ${fmtBR(row.letter_valid_until)} sem regularização de: ${falta.join(', ')}.`
      await sb.from('supplier_category_approvals').update({ status: 'EXCEPTION_EXPIRED', closed_at: agora }).eq('id', row.id)
      await sb.from('seals').update({ status: 'SUSPENDED', suspended_reason: motivo }).eq('id', row.seal_id)
      await sb.from('audit_log').insert({ action: 'SEAL_EXCEPTION_EXPIRED', entity_type: 'supplier', entity_id: row.supplier_id,
        metadata: { seal_id: row.seal_id, category_id: row.category_id, valid_until: row.letter_valid_until, pendentes: falta } })
      const { to, razao } = await destinatario(row.supplier_id)
      await enviar(to, `⚠️ Homologação suspensa — carta de exceção vencida · ${razao}`,
        `<p>A carta de exceção da <strong>${cliente}</strong> para a categoria <strong>${cat}</strong> venceu em <strong>${fmtBR(row.letter_valid_until)}</strong> e os documentos abaixo não foram regularizados:</p>
         <ul style="padding-left:18px">${falta.map((f) => `<li>${f}</li>`).join('')}</ul>
         <p>A homologação foi <strong>suspensa</strong>. Envie os documentos pela plataforma para retomar o processo.</p>`)
      out.suspensos++
    } catch (e) { console.warn('[exception-expire]', row.id, e.message) }
  }
  console.log('[exception-expire]', JSON.stringify(out))
  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(out) }
}
