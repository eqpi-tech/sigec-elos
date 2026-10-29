// netlify/functions/client-notify.js — e-mails "Acompanhar fornecedor" (29/10/2026,
// patch_166). Lê a fila client_notify_outbox (preenchida por gatilhos do banco) e
// manda, NA HORA, um e-mail a cada usuário do cliente que acompanha aquele CNPJ.
// Disparo: client-notify-cron (a cada 5 min, produção) ou POST com CRON_SECRET.
const { createClient } = require('@supabase/supabase-js')
const { guardedResend } = require('./lib/mail_guard.js')
const { frontendUrl } = require('./lib/runtime_env.js')

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const fmtCnpj = (c) => (/^\d{14}$/.test(c || '') ? c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : c || '')

const TEXTO = {
  CADASTRO:   { icone: '📝', titulo: 'concluiu o cadastro', frase: 'concluiu o cadastro no SIGEC-ELOS pelo seu convite. O próximo passo é ele enviar os documentos e responder o questionário.' },
  EM_ANALISE: { icone: '🔍', titulo: 'entrou em análise', frase: 'enviou todos os documentos e o processo entrou na análise da EQPI.' },
  HOMOLOGADO: { icone: '🏅', titulo: 'foi homologado', frase: 'foi homologado.' },
  REPROVADO:  { icone: '⛔', titulo: 'teve o processo reprovado ou suspenso', frase: 'teve o processo reprovado ou suspenso.' },
}

exports.handler = async (event) => {
  const bearer = (event.headers?.authorization || '').replace('Bearer ', '')
  if (!process.env.CRON_SECRET || bearer !== process.env.CRON_SECRET) return { statusCode: 401, body: 'unauthorized' }
  const inicio = Date.now()
  const { data: fila } = await sb.from('client_notify_outbox').select('*').is('processed_at', null).order('id').limit(100)
  let enviados = 0
  for (const ev of fila || []) {
    if (Date.now() - inicio > 20000) break                       // limite de ~26 s da função
    try {
      const [{ data: w }, { data: sup }, { data: cli }] = await Promise.all([
        sb.from('client_supplier_watch').select('user_id').eq('client_id', ev.client_id).eq('cnpj', ev.cnpj),
        ev.supplier_id ? sb.from('suppliers').select('razao_social').eq('id', ev.supplier_id).maybeSingle() : Promise.resolve({ data: null }),
        sb.from('clients').select('razao_social, nome_fantasia').eq('id', ev.client_id).maybeSingle(),
      ])
      const t = TEXTO[ev.evento]
      const nome = sup?.razao_social || fmtCnpj(ev.cnpj)
      const link = ev.supplier_id ? `${frontendUrl()}/cliente/fornecedor/${ev.supplier_id}` : `${frontendUrl()}/cliente/convites`
      // só usuários ATIVOS do cliente que acompanham
      const ids = (w || []).map((x) => x.user_id)
      const { data: ativos } = ids.length ? await sb.from('user_roles').select('user_id')
        .in('user_id', ids).eq('role', 'CLIENT').eq('client_id', ev.client_id).neq('is_active', false) : { data: [] }
      for (const { user_id } of ativos || []) {
        const { data: u } = await sb.auth.admin.getUserById(user_id).catch(() => ({ data: null }))
        const to = u?.user?.email
        if (!to) continue
        const motivo = ev.evento === 'REPROVADO' && ev.detalhe?.motivo ? `<p style="background:#fff1f2;border-left:4px solid #ef4444;padding:10px 14px;border-radius:0 8px 8px 0"><strong>Motivo:</strong> ${String(ev.detalhe.motivo).slice(0, 400)}</p>` : ''
        await guardedResend('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
          body: JSON.stringify({
            from: process.env.EMAIL_FROM || 'SIGEC-ELOS <noreply@eqpitech.com.br>', to: [to], reply_to: 'suporte@eqpitech.com.br',
            subject: `${t.icone} ${nome} ${t.titulo} — SIGEC-ELOS`,
            html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#374151">
  <div style="background:#2E3192;padding:22px;border-radius:12px 12px 0 0;text-align:center"><div style="color:#fff;font-size:20px;font-weight:bold">SIGEC-ELOS</div>
    <div style="color:#F47E2F;font-size:12px;margin-top:4px">Fornecedor que você acompanha${cli ? ` · ${cli.nome_fantasia || cli.razao_social}` : ''}</div></div>
  <div style="background:#fff;padding:24px;border:1px solid #e2e8f0;border-top:none;font-size:15px;line-height:1.6">
    <p><strong>${nome}</strong> (CNPJ ${fmtCnpj(ev.cnpj)}) ${t.frase}</p>${motivo}
    <p style="text-align:center;margin:22px 0 6px"><a href="${link}" style="display:inline-block;background:#F47E2F;color:#fff;padding:12px 28px;border-radius:9px;text-decoration:none;font-weight:bold">${ev.supplier_id ? 'Ver o processo' : 'Ver os convites'}</a></p>
  </div>
  <div style="background:#f8fafc;padding:12px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;text-align:center;font-size:11.5px;color:#6b7280">
    Você recebe este aviso porque marcou <strong>Acompanhar</strong> neste fornecedor. Para parar, desmarque no fornecedor ou no convite.</div></div>`,
          }),
        }).catch((e) => console.warn('[client-notify] e-mail:', e.message))
        enviados++
      }
      await sb.from('client_notify_outbox').update({ processed_at: new Date().toISOString() }).eq('id', ev.id)
    } catch (e) { console.error('[client-notify] evento', ev.id, e.message) }
  }
  return { statusCode: 200, body: JSON.stringify({ eventos: (fila || []).length, enviados }) }
}
