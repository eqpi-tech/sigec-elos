// lib/supplier_team.js — logins de fornecedor criados pelo servidor (29/10/2026,
// go-live VIXPAR): Acesso Total do pré-cadastro e usuários "Operacional" do 2º
// e-mail em diante. Senha: o mesmo token de /criar-senha da migração do HOC
// (hoc_migration_contacts + migration-set-password.js) — a linha entra sem
// cliente/fornecedor do HOC (arrays vazios), então não afeta a regra de primeiro
// acesso do HOC (lib/hoc_claim.js) nem os comunicados da migração.
const crypto = require('crypto')
const { frontendUrl } = require('./runtime_env.js')
const { guardedResend } = require('./mail_guard.js')

const VALIDADE_TOKEN_DIAS = 21
const SUPORTE = 'suporte@eqpitech.com.br · WhatsApp (11) 5039-6769 · Telefone (11) 2305-3881'

async function perfilId(admin, nome) {
  const { data } = await admin.from('access_profiles').select('id').eq('role_type', 'SUPPLIER').eq('name', nome).maybeSingle()
  return data?.id || null
}

// login pelo e-mail: reaproveita o existente; senão cria (senha aleatória — a
// pessoa define a dela pelo link). Retorna { id, novo }
async function ensureUser(admin, email, nome) {
  const e = String(email).trim().toLowerCase()
  const { data: existente } = await admin.rpc('admin_user_id_by_email', { p_email: e })
  if (existente) return { id: existente, novo: false }
  const { data, error } = await admin.auth.admin.createUser({
    email: e, email_confirm: true, password: crypto.randomBytes(18).toString('base64url'),
    user_metadata: { name: nome || null, role: 'SUPPLIER', golive: true },
  })
  if (error) {
    const { data: corrida } = await admin.rpc('admin_user_id_by_email', { p_email: e })   // criado em paralelo
    if (corrida) return { id: corrida, novo: false }
    throw new Error(`criar login ${e}: ${error.message}`)
  }
  return { id: data.user.id, novo: true }
}

// vincula o login à empresa com o perfil (idempotente; respeita o limite de 4
// usuários do patch_136 — o erro do gatilho volta como { ok:false })
async function vincular(admin, userId, supplierId, nomePerfil) {
  const { data: ja } = await admin.from('user_roles').select('id')
    .eq('user_id', userId).eq('role', 'SUPPLIER').eq('supplier_id', supplierId).maybeSingle()
  if (ja) return { ok: true, ja: true }
  // sem perfil o usuário veria tudo (fallback permissivo) — recusa em vez disso
  const perfil = await perfilId(admin, nomePerfil)
  if (!perfil) return { ok: false, erro: `perfil "${nomePerfil}" não encontrado` }
  const { count } = await admin.from('user_roles').select('id', { count: 'exact', head: true })
    .eq('user_id', userId).eq('role', 'SUPPLIER')
  const { error } = await admin.from('user_roles').insert({
    user_id: userId, role: 'SUPPLIER', supplier_id: supplierId, is_primary: !count, is_active: true,
    access_profile_id: perfil,
  })
  return error ? { ok: false, erro: error.message } : { ok: true }
}

// token de criação de senha (21 dias). null = a pessoa já tem senha própria
async function linkSenha(admin, userId, email, nome, { forcar = false } = {}) {
  const e = String(email).trim().toLowerCase()
  const { data: c } = await admin.from('hoc_migration_contacts').select('id, senha_criada_em').eq('email', e).maybeSingle()
  if (c?.senha_criada_em && !forcar) return null
  const token = crypto.randomBytes(24).toString('base64url')
  const expira = new Date(Date.now() + VALIDADE_TOKEN_DIAS * 864e5).toISOString()
  if (c) await admin.from('hoc_migration_contacts').update({ elos_user_id: userId, senha_token: token, senha_token_expira: expira, updated_at: new Date().toISOString() }).eq('id', c.id)
  else {
    const { error } = await admin.from('hoc_migration_contacts').insert({ email: e, nome: nome || null, tipo: 'SUPPLIER', elos_user_id: userId, senha_token: token, senha_token_expira: expira })
    if (error) throw new Error(`token de senha ${e}: ${error.message}`)
  }
  return `${frontendUrl()}/criar-senha?t=${token}`
}

const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

// UM e-mail de acesso por pessoa, com a lista das empresas
async function emailAcesso({ to, cliente, empresas, link, papel }) {
  const n = empresas.length
  const lista = n <= 25
    ? `<ul style="padding-left:20px;margin:6px 0 14px">${empresas.map((x) => `<li style="margin-bottom:4px">${esc(x)}</li>`).join('')}</ul>`
    : `<p style="margin:6px 0 14px">${n} empresas — a lista completa aparece no menu, ao trocar de empresa.</p>`
  const oQue = papel === 'Operacional'
    ? `Você foi incluído como usuário <strong>Operacional</strong> ${n > 1 ? `das ${n} empresas abaixo` : 'da empresa abaixo'} no SIGEC-ELOS, para a homologação com a <strong>${esc(cliente)}</strong>:`
    : n > 1
      ? `Para facilitar, a EQPI deixou as suas <strong>${n} empresas já cadastradas</strong> no SIGEC-ELOS, com o processo de homologação da <strong>${esc(cliente)}</strong> aberto em cada uma:`
      : `Para facilitar, a EQPI deixou a sua empresa <strong>já cadastrada</strong> no SIGEC-ELOS, com o processo de homologação da <strong>${esc(cliente)}</strong> aberto:`
  const passos = [
    link ? '<strong>Crie a sua senha</strong> pelo botão abaixo (o link vale 21 dias);' : '<strong>Entre com o seu e-mail e a senha</strong> que você já usa no SIGEC-ELOS;',
    'Ative a <strong>verificação em duas etapas</strong> (um código no celular);',
    ...(papel === 'Operacional' ? [] : [`Aceite os <strong>termos da ${esc(cliente)}</strong> no primeiro acesso;`]),
    n > 1 ? 'Escolha a empresa no menu do topo e, em cada uma, envie os documentos pedidos e responda o questionário.' : 'Envie os documentos pedidos e responda o questionário.',
  ]
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#374151">
  <div style="background:#2E3192;padding:26px 24px;border-radius:12px 12px 0 0;text-align:center">
    <div style="color:#fff;font-size:22px;font-weight:bold;letter-spacing:.5px">SIGEC-ELOS</div>
    <div style="color:#F47E2F;font-size:13px;margin-top:4px">Homologação de fornecedores ${esc(cliente)} · Seu acesso</div></div>
  <div style="background:#fff;padding:28px 26px;border:1px solid #e2e8f0;border-top:none;font-size:15px;line-height:1.65">
    <p>Olá!</p><p>${oQue}</p>${lista}
    <p style="margin-bottom:4px"><strong>Como começar:</strong></p>
    <ol style="padding-left:20px;margin:6px 0 16px">${passos.map((p) => `<li style="margin-bottom:6px">${p}</li>`).join('')}</ol>
    <p style="background:#f0fdf4;border-left:4px solid #22c55e;padding:10px 14px;border-radius:0 8px 8px 0"><strong>Sem custo para a sua empresa:</strong> a homologação é custeada pela ${esc(cliente)}.</p>
    <p style="text-align:center;margin:24px 0"><a href="${link || `${frontendUrl()}/login`}" style="display:inline-block;background:#F47E2F;color:#fff;padding:14px 34px;border-radius:9px;text-decoration:none;font-weight:bold;font-size:15px">${link ? 'Criar minha senha' : 'Acessar o SIGEC-ELOS'}</a></p>
    <p style="font-size:13px;color:#6b7280">Várias certidões são buscadas automaticamente nas fontes oficiais — você só envia o que faltar. O passo a passo está no manual: <a href="${frontendUrl()}/manual/fornecedor" style="color:#2E3192">elos.eqpitech.com.br/manual/fornecedor</a>.</p>
    <p style="margin-top:22px">Conte com a gente,<br><strong>Equipe SIGEC-ELOS · EQPI Tech</strong></p></div>
  <div style="background:#f8fafc;padding:16px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;text-align:center;font-size:12px;color:#6b7280;line-height:1.6">
    Dúvidas? Fale com o suporte — ${SUPORTE}<br>EQPI Tech · elos.eqpitech.com.br</div></div>`
  const subject = papel === 'Operacional'
    ? `Seu acesso ao SIGEC-ELOS — homologação ${cliente}`
    : n > 1 ? `Suas ${n} empresas já estão no SIGEC-ELOS — crie a sua senha (homologação ${cliente})` : `Sua empresa já está no SIGEC-ELOS — crie a sua senha (homologação ${cliente})`
  const r = await guardedResend('https://api.resend.com/emails', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    body: JSON.stringify({ from: 'SIGEC-ELOS <noreply@eqpitech.com.br>', reply_to: 'suporte@eqpitech.com.br', to: [to], subject, html }),
  })
  if (!r.ok) throw new Error(`e-mail de acesso ${to}: HTTP ${r.status}`)
  return true
}

// 2º e-mail em diante de UMA empresa (convite normal): usuário Operacional +
// e-mail de acesso. Chamado pelo create-supplier quando o convite traz
// operational_emails. Nunca derruba o cadastro: devolve o que fez.
async function adicionarOperacionais(admin, { supplierId, emails, cliente, razao }) {
  const out = []
  for (const e of emails || []) {
    try {
      const u = await ensureUser(admin, e, null)
      const v = await vincular(admin, u.id, supplierId, 'Operacional')
      if (!v.ok) { out.push({ email: e, erro: v.erro }); continue }
      if (v.ja) { out.push({ email: e, ja: true }); continue }
      // link de senha só para quem é novo ou nunca entrou; quem já usa o ELOS entra com a senha dele
      const { data: au } = await admin.auth.admin.getUserById(u.id)
      const link = (u.novo || !au?.user?.last_sign_in_at) ? await linkSenha(admin, u.id, e, null) : null
      await emailAcesso({ to: e, cliente, empresas: [razao], link, papel: 'Operacional' })
      await admin.from('audit_log').insert({ user_id: u.id, action: 'SUPPLIER_OPERACIONAL_ADDED', entity_type: 'supplier', entity_id: supplierId, metadata: { email: e, origem: 'convite' } })
      out.push({ email: e, ok: true })
    } catch (err) { out.push({ email: e, erro: err.message }) }
  }
  return out
}

module.exports = { ensureUser, vincular, linkSenha, emailAcesso, adicionarOperacionais, perfilId }
