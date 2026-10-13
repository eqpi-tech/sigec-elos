// netlify/functions/client-rfq-create.js — cliente cria uma RFQ (patch_102).
// Grava a RFQ, gera uma resposta 'SENT' por fornecedor candidato e avisa cada
// um por e-mail (remetente = empresa do cliente, resolvida aqui — CLAUDE.md §14).
// POST { title, description?, categoryId, deadline? 'AAAA-MM-DD', scope 'own'|'elos' }
const { createClient } = require('@supabase/supabase-js')
const { avisarFornecedores } = require('./lib/rfq_mail.js')

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const HEADERS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' }
const res = (code, body) => ({ statusCode: code, headers: HEADERS, body: JSON.stringify(body) })

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return res(200, {})
  if (event.httpMethod !== 'POST') return res(405, { error: 'Method not allowed' })
  const token = (event.headers.authorization || '').replace('Bearer ', '')
  const { data: { user } = {}, error: authErr } = await sb.auth.getUser(token)
  if (authErr || !user) return res(401, { error: 'Sessão expirada — saia e entre novamente na plataforma' })

  let body
  try { body = JSON.parse(event.body || '{}') } catch { return res(400, { error: 'JSON inválido' }) }
  const title = String(body.title || '').trim()
  const categoryId = Number(body.categoryId)
  const scope = body.scope === 'elos' ? 'elos' : 'own'
  if (!title || !categoryId) return res(400, { error: 'Preencha o título e a categoria.' })
  if (body.deadline && !/^\d{4}-\d{2}-\d{2}$/.test(body.deadline)) return res(400, { error: 'Prazo inválido' })

  try {
    const { data: role } = await sb.from('user_roles').select('client_id')
      .eq('user_id', user.id).eq('role', 'CLIENT').not('client_id', 'is', null).limit(1).maybeSingle()
    if (!role?.client_id) return res(403, { error: 'Apenas usuários de cliente criam cotações' })
    const clientId = role.client_id
    const { data: cat } = await sb.from('categories').select('id, name, client_id').eq('id', categoryId).maybeSingle()
    if (!cat || cat.client_id !== clientId) return res(400, { error: 'Categoria não pertence ao seu cadastro' })
    const { data: cli } = await sb.from('clients').select('razao_social, nome_fantasia').eq('id', clientId).single()
    const empresa = cli?.nome_fantasia || cli?.razao_social || 'Cliente ELOS'

    const { data: cands, error: cErr } = await sb.rpc('rfq_candidates', { p_client: clientId, p_category: categoryId, p_scope: scope })
    if (cErr) throw new Error(cErr.message)
    if (!cands?.length) return res(400, { error: 'Nenhum fornecedor homologado nesta categoria para o alcance escolhido' })

    const { data: rfq, error: rErr } = await sb.from('rfqs').insert({
      client_id: clientId, title, description: String(body.description || '').trim() || null,
      category_id: categoryId, category: cat.name, deadline: body.deadline || null,
      requester_role: 'CLIENT', status: 'SENT', scope,
    }).select('id').single()
    if (rErr) throw new Error(rErr.message)

    const ids = [...new Set(cands.map((c) => c.supplier_id))]
    for (let i = 0; i < ids.length; i += 500) {
      const { error } = await sb.from('rfq_responses')
        .insert(ids.slice(i, i + 500).map((sid) => ({ rfq_id: rfq.id, supplier_id: sid, status: 'SENT' })))
      if (error) throw new Error(error.message)
    }

    // e-mail aos fornecedores (lib/rfq_mail — o mesmo da cotação do comprador)
    const enviados = await avisarFornecedores(sb, { supplierIds: ids, empresa, title,
      description: body.description, categoria: cat.name, deadline: body.deadline })

    await sb.from('audit_log').insert({ user_id: user.id, action: 'RFQ_CREATED', entity_type: 'rfq', entity_id: rfq.id,
      metadata: { client_id: clientId, category_id: categoryId, scope, fornecedores: ids.length, emails: enviados } })
    return res(200, { rfq_id: rfq.id, fornecedores: ids.length, proprios: cands.filter((c) => c.own).length, emails: enviados })
  } catch (e) {
    console.error('[client-rfq-create]', e)
    return res(500, { error: e.message })
  }
}
