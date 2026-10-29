// netlify/functions/supplier-terms.js — aceite dos termos do cliente no 1º acesso
// (29/10/2026, go-live VIXPAR). Vale SÓ para empresas que entraram pelo
// pré-cadastro do go-live (golive_suppliers CADASTRADO): elas não passaram pela
// etapa de termos do cadastro. Quem se cadastrou pela tela já aceitou lá; os
// migrados do HOC ficam fora (a trava não pode surgir para eles).
// GET  → { pendentes: [{ client_id, cliente, itens: [{ id, title, kind, content, url, version }] }] }
// POST { client_id, aceites: [{ item_id, version }] } → grava o aceite para TODAS as
//      empresas do login pré-cadastradas com esse cliente (a BRMED aceita uma vez só)
const { createClient } = require('@supabase/supabase-js')

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const H = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Supplier-Id' }
const res = (c, b) => ({ statusCode: c, headers: H, body: JSON.stringify(b) })

// empresas do login que vieram do pré-cadastro, por cliente
async function empresasPre(userId) {
  const { data: roles } = await sb.from('user_roles').select('supplier_id, access_profiles(name)').eq('user_id', userId).eq('role', 'SUPPLIER').neq('is_active', false)
  // o Operacional não aceita em nome da empresa — só quem tem acesso de gestão
  const ids = (roles || []).filter((r) => r.access_profiles?.name !== 'Operacional').map((r) => r.supplier_id).filter(Boolean)
  if (!ids.length) return new Map()
  const { data: pre } = await sb.from('golive_suppliers').select('supplier_id').in('supplier_id', ids).eq('status', 'CADASTRADO')
  const preIds = [...new Set((pre || []).map((p) => p.supplier_id))]
  if (!preIds.length) return new Map()
  const { data: seals } = await sb.from('seals').select('supplier_id, client_id').in('supplier_id', preIds).not('client_id', 'is', null)
  const porCliente = new Map()
  for (const s of seals || []) {
    if (!porCliente.has(s.client_id)) porCliente.set(s.client_id, new Set())
    porCliente.get(s.client_id).add(s.supplier_id)
  }
  return porCliente
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return res(200, {})
  const token = (event.headers.authorization || '').replace('Bearer ', '')
  const { data: { user } = {} } = await sb.auth.getUser(token)
  if (!user) return res(401, { error: 'Sessão expirada' })
  const porCliente = await empresasPre(user.id)
  if (!porCliente.size) return res(200, { pendentes: [] })

  if (event.httpMethod === 'GET') {
    const pendentes = []
    for (const [clientId, emps] of porCliente) {
      const { data: itens } = await sb.from('client_terms_items').select('id, title, kind, content, storage_path, version, required')
        .eq('client_id', clientId).eq('active', true).eq('required', true).order('sort')
      if (!itens?.length) continue
      const { data: aceitos } = await sb.from('client_term_acceptances').select('item_id, item_version, supplier_id')
        .eq('client_id', clientId).in('supplier_id', [...emps])
      // pendente se ALGUMA empresa do login ainda não aceitou a versão atual
      const faltam = itens.filter((it) => [...emps].some((s) => !(aceitos || []).some((a) => a.supplier_id === s && a.item_id === it.id && a.item_version === it.version)))
      if (!faltam.length) continue
      const { data: cl } = await sb.from('clients').select('razao_social, nome_fantasia').eq('id', clientId).maybeSingle()
      const out = []
      for (const it of faltam) {
        let url = null
        if (it.kind === 'DOCUMENT' && it.storage_path) {
          const { data: s } = await sb.storage.from('client-terms').createSignedUrl(it.storage_path, 7200)
          url = s?.signedUrl || null
        }
        out.push({ id: it.id, title: it.title, kind: it.kind, content: it.kind === 'TEXT' ? it.content : null, url, version: it.version })
      }
      pendentes.push({ client_id: clientId, cliente: cl?.nome_fantasia || cl?.razao_social || 'Cliente', empresas: emps.size, itens: out })
    }
    return res(200, { pendentes })
  }

  if (event.httpMethod === 'POST') {
    let body
    try { body = JSON.parse(event.body || '{}') } catch { return res(400, { error: 'JSON inválido' }) }
    const emps = porCliente.get(body.client_id)
    if (!emps) return res(403, { error: 'Sem empresas deste cliente no seu acesso' })
    const { data: itens } = await sb.from('client_terms_items').select('id, version').eq('client_id', body.client_id).eq('active', true).eq('required', true)
    const pedidos = new Set((body.aceites || []).map((a) => `${a.item_id}:${a.version}`))
    if (!(itens || []).every((it) => pedidos.has(`${it.id}:${it.version}`))) return res(400, { error: 'Aceite todos os termos obrigatórios' })
    const ip = event.headers['x-nf-client-connection-ip'] || event.headers['x-forwarded-for'] || null
    const { data: ja } = await sb.from('client_term_acceptances').select('item_id, item_version, supplier_id').eq('client_id', body.client_id).in('supplier_id', [...emps])
    const rows = []
    for (const s of emps) for (const it of itens || []) {
      if ((ja || []).some((a) => a.supplier_id === s && a.item_id === it.id && a.item_version === it.version)) continue
      rows.push({ item_id: it.id, item_version: it.version, client_id: body.client_id, supplier_id: s,
        accepted_name: user.user_metadata?.name || user.email, accepted_email: user.email, accepted_ip: ip })
    }
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await sb.from('client_term_acceptances').insert(rows.slice(i, i + 200))
      if (error) return res(500, { error: error.message })
    }
    await sb.from('audit_log').insert({ user_id: user.id, action: 'GOLIVE_TERMOS_ACEITOS', entity_type: 'client', entity_id: body.client_id,
      metadata: { empresas: emps.size, itens: (itens || []).length, linhas: rows.length } })
    return res(200, { ok: true, empresas: emps.size })
  }
  return res(405, { error: 'Method not allowed' })
}
