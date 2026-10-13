// netlify/functions/migration-set-password.js
// Link pessoal "Criar minha senha" da migração HOC → ELOS (patch_135).
// O link de recuperação do Supabase dura no máximo ~1 dia; este token vale até
// a 1ª semana de uso da onda e é de uso único.
//   POST { token }            → { ok, email, nome }          (confere o link)
//   POST { token, password }  → { ok, email }                (grava a senha)

const { createClient } = require('@supabase/supabase-js')

const headers = { 'Content-Type': 'application/json' }
const resp = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) })

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return resp(405, { error: 'Method not allowed' })
  try {
    const { token, password } = JSON.parse(event.body || '{}')
    if (!token || typeof token !== 'string' || token.length < 20) return resp(400, { error: 'invalido' })
    const admin = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

    const { data: c } = await admin.from('hoc_migration_contacts')
      .select('id, email, nome, elos_user_id, senha_token_expira').eq('senha_token', token).maybeSingle()
    if (!c || !c.elos_user_id) return resp(404, { error: 'invalido' })
    if (!c.senha_token_expira || new Date(c.senha_token_expira) < new Date()) return resp(410, { error: 'expirado', email: c.email })

    if (password === undefined) return resp(200, { ok: true, email: c.email, nome: c.nome || null })

    if (typeof password !== 'string' || password.length < 8) return resp(400, { error: 'A senha precisa ter pelo menos 8 caracteres.' })
    const { error: upErr } = await admin.auth.admin.updateUserById(c.elos_user_id, { password })
    if (upErr) return resp(400, { error: upErr.message })

    // uso único: o token sai e fica a data em que a senha foi criada
    await admin.from('hoc_migration_contacts')
      .update({ senha_token: null, senha_criada_em: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', c.id)
    await admin.from('audit_log').insert({ user_id: c.elos_user_id, action: 'MIGRACAO_HOC_SENHA', entity_type: 'user', metadata: {} })
    return resp(200, { ok: true, email: c.email })
  } catch (e) {
    console.error('migration-set-password:', e)
    return resp(500, { error: 'Não foi possível concluir agora. Tente de novo em instantes.' })
  }
}
