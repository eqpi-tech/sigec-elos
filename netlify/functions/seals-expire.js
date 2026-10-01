// netlify/functions/seals-expire.js — vencimento dos selos do ELOS (01/10/2026).
// Selo ELOS (pago no Stripe) com o período pago encerrado continuava "Ativo"
// (caso VP Treinamento: Verificado mensal vencido em 24/09, ativo em 01/10).
// Diariamente (workflow daily-notifications, Bearer CRON_SECRET):
//  - selo ACTIVE do ELOS (hoc_process_id IS NULL) com expires_at vencido há
//    mais de 3 dias → EXPIRED (a tolerância cobre a renovação da assinatura,
//    que estende a validade pelo webhook invoice.payment_succeeded);
//  - plano avulso do Stripe (sem assinatura) vencido → CANCELED;
//  - e-mail ao fornecedor: o selo venceu, renove o plano.
// Processos espelhados do HOC ficam de fora: a validade deles vem do HOC.

const { createClient } = require('@supabase/supabase-js')
const { guardMail } = require('./lib/mail_guard.js')

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const TOLERANCIA_DIAS = 3

function html(razao, selo, venceu) {
  return `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto">
  <div style="background:#2E3192;padding:24px;border-radius:12px 12px 0 0;text-align:center"><h1 style="color:#fff;margin:0;font-size:20px">SIGEC-ELOS</h1></div>
  <div style="background:#fff;padding:26px;border:1px solid #e2e8f0;border-top:none;color:#374151;font-size:15px;line-height:1.6">
    <p>Olá, <strong>${razao}</strong>.</p>
    <p>O seu selo <strong>${selo}</strong> venceu em <strong>${venceu}</strong> e deixou de aparecer como vigente para clientes e compradores.</p>
    <p>Para reativá-lo, renove o seu plano na plataforma — os documentos já aprovados continuam guardados.</p>
    <p style="text-align:center;margin:24px 0 8px"><a href="https://elos.eqpitech.com.br/fornecedor/planos" style="display:inline-block;background:#F47E2F;color:#fff;padding:13px 30px;border-radius:9px;text-decoration:none;font-weight:bold">Renovar meu plano</a></p>
  </div>
  <div style="background:#f8fafc;padding:12px;border-radius:0 0 12px 12px;text-align:center;font-size:11px;color:#9aa1b5">EQPI Tech · SIGEC-ELOS · elos.eqpitech.com.br</div></div>`
}

exports.handler = async (event) => {
  const bearer = (event.headers?.authorization || '').replace('Bearer ', '')
  if (!process.env.CRON_SECRET || bearer !== process.env.CRON_SECRET) return { statusCode: 401 }

  const limite = new Date(Date.now() - TOLERANCIA_DIAS * 86400000).toISOString()
  const { data: vencidos, error } = await sb.from('seals')
    .select('id, supplier_id, seal_name, level, expires_at, suppliers(razao_social, email, user_id)')
    .eq('status', 'ACTIVE').is('hoc_process_id', null).not('expires_at', 'is', null).lt('expires_at', limite)
    .limit(200)
  if (error) { console.error('[seals-expire]', error.message); return { statusCode: 500 } }

  let n = 0
  for (const s of vencidos || []) {
    const { error: e1 } = await sb.from('seals').update({ status: 'EXPIRED' }).eq('id', s.id).eq('status', 'ACTIVE')
    if (e1) { console.warn(`[seals-expire] ${s.id}: ${e1.message}`); continue }
    // plano avulso (sem assinatura recorrente) vencido não renova sozinho
    await sb.from('plans').update({ status: 'CANCELED' })
      .eq('supplier_id', s.supplier_id).eq('source', 'STRIPE').eq('status', 'ACTIVE')
      .is('stripe_sub_id', null).lt('ends_at', limite)
    const venceu = new Date(s.expires_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    const selo = s.seal_name || `ELOS ${s.level || ''}`.trim()
    await sb.from('audit_log').insert({
      action: 'SEAL_EXPIRED', entity_type: 'supplier', entity_id: s.supplier_id,
      metadata: { seal_id: s.id, selo, venceu_em: s.expires_at, auto: true },
    })
    // e-mail: login do fornecedor; sem login, o e-mail do cadastro (regra nº 14)
    let to = s.suppliers?.email
    if (s.suppliers?.user_id) {
      const { data: u } = await sb.auth.admin.getUserById(s.suppliers.user_id)
      to = u?.user?.email || to
    }
    if (to && process.env.RESEND_API_KEY) {
      const g = guardMail(to, `⏰ Seu selo ${selo} venceu — renove o plano · SIGEC-ELOS`)
      if (!g.skip) await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
        body: JSON.stringify({ from: process.env.EMAIL_FROM || 'noreply@eqpitech.com.br', to: g.to, subject: g.subject, html: html(s.suppliers?.razao_social || '', selo, venceu) }),
      }).catch((e) => console.warn('[seals-expire] e-mail:', e.message))
    }
    n++
  }
  console.log(`[seals-expire] ${n} selo(s) vencido(s)`)
  return { statusCode: 200, body: JSON.stringify({ vencidos: n }) }
}
