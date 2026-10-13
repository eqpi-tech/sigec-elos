// netlify/functions/hoc-claim-check.js
// Cadastro do fornecedor, ANTES de criar o login: o e-mail digitado pode fazer
// o primeiro acesso desta empresa migrada do HOC? (trava em lib/hoc_claim.js)
// Evita criar uma conta que o create-supplier vai recusar depois.
// POST { cnpj, email } → { allowed, message? }

const { createClient } = require('@supabase/supabase-js')
const { normalizeCnpj } = require('./lib/cnpj.js')
const { claimRule, canClaim, msgRefused } = require('./lib/hoc_claim.js')

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json' }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }
  try {
    const { cnpj, email } = JSON.parse(event.body || '{}')
    if (!cnpj || !email) return { statusCode: 400, headers, body: JSON.stringify({ error: 'cnpj e email são obrigatórios' }) }
    const admin = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    const { data: sup } = await admin.from('suppliers')
      .select('id, hoc_id, user_id').eq('cnpj', normalizeCnpj(cnpj)).maybeSingle()
    // empresa com dono segue a regra do login existente (create-supplier)
    if (!sup || sup.user_id) return { statusCode: 200, headers, body: JSON.stringify({ allowed: true }) }
    const rule = await claimRule(admin, sup)
    const allowed = canClaim(rule, email)
    if (!allowed) console.warn(`[hoc-claim-check] e-mail fora da lista HOC p/ fornecedor ${sup.id}`)
    return { statusCode: 200, headers, body: JSON.stringify(allowed ? { allowed } : { allowed, message: msgRefused(rule) }) }
  } catch (e) {
    console.error('hoc-claim-check:', e)
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) }
  }
}
