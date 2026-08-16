// netlify/functions/update-supplier-profile.js
// Autoatendimento do fornecedor: dados cadastrais e quadro societário.
// Paridade com o HOC (Complemento de Cadastro / sócios).
//
// GET                                  → { supplier, partners } (campos editáveis + leitura)
// POST { action: 'update-profile', fields }        → atualiza campos WHITELISTED
// POST { action: 'add-partner'|'update-partner', partner } → upsert sócio
// POST { action: 'delete-partner', partnerId }     → remove sócio
//
// Segurança: service_role + WHITELIST de campos (RLS aberto deixaria o
// fornecedor alterar o próprio status). Qualquer usuário SUPPLIER ativo do
// fornecedor pode editar. Tudo auditado em audit_log.

const { createClient } = require('@supabase/supabase-js')

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

// Campos cadastrais que o fornecedor PODE editar (razão social, CNPJ e status
// ficam de fora — Receita/backoffice são as fontes)
const EDITABLE_FIELDS = [
  'nome_fantasia', 'phone', 'email', 'email_financeiro', 'contact_name',
  'inscricao_estadual', 'inscricao_municipal', 'tipo_empresa',
  'state', 'city', 'address',
]

const PARTNER_FIELDS = ['tipo', 'cpf_cnpj', 'nome', 'cargo', 'nacionalidade', 'participacao']

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: HEADERS, body: '' }

  const token = (event.headers.authorization || '').replace('Bearer ', '')
  if (!token) return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: 'Token ausente' }) }

  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const { data: { user }, error: authErr } = await sb.auth.getUser(token)
  if (authErr || !user) return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: 'Token inválido' }) }

  // Vínculo SUPPLIER ativo do caller
  const { data: roleRow } = await sb
    .from('user_roles')
    .select('supplier_id, is_active')
    .eq('user_id', user.id)
    .eq('role', 'SUPPLIER')
    .maybeSingle()
  if (!roleRow?.supplier_id || roleRow.is_active === false)
    return { statusCode: 403, headers: HEADERS, body: JSON.stringify({ error: 'Acesso restrito a fornecedores' }) }
  const supplierId = roleRow.supplier_id

  try {
    // ── GET: perfil + sócios ─────────────────────────────────
    if (event.httpMethod === 'GET') {
      const [{ data: supplier }, { data: partners }] = await Promise.all([
        sb.from('suppliers')
          .select('id, razao_social, cnpj, nome_fantasia, phone, email, email_financeiro, contact_name, inscricao_estadual, inscricao_municipal, tipo_empresa, data_abertura, state, city, address, status')
          .eq('id', supplierId).single(),
        sb.from('supplier_partners')
          .select('id, tipo, cpf_cnpj, nome, cargo, nacionalidade, participacao')
          .eq('supplier_id', supplierId).order('nome'),
      ])
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ supplier, partners: partners || [] }) }
    }

    if (event.httpMethod !== 'POST')
      return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Método não suportado' }) }

    let body
    try { body = JSON.parse(event.body || '{}') } catch {
      return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'JSON inválido' }) }
    }
    const { action } = body

    // ── Atualizar dados cadastrais ───────────────────────────
    if (action === 'update-profile') {
      const fields = body.fields || {}
      const payload = {}
      for (const k of EDITABLE_FIELDS)
        if (k in fields) payload[k] = fields[k] === '' ? null : fields[k]
      if (!Object.keys(payload).length)
        return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Nenhum campo editável informado' }) }

      const { error } = await sb.from('suppliers').update(payload).eq('id', supplierId)
      if (error) throw new Error(error.message)

      await sb.from('audit_log').insert({
        user_id: user.id, action: 'SUPPLIER_PROFILE_UPDATED',
        entity_type: 'supplier', entity_id: supplierId,
        metadata: { fields: Object.keys(payload) },
      })
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ success: true }) }
    }

    // ── Sócios ───────────────────────────────────────────────
    if (action === 'add-partner' || action === 'update-partner') {
      const p = body.partner || {}
      if (!p.nome?.trim())
        return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Nome do sócio é obrigatório' }) }
      const record = { supplier_id: supplierId, registered_by: user.id }
      for (const k of PARTNER_FIELDS) if (k in p) record[k] = p[k] === '' ? null : p[k]
      if (record.participacao != null) {
        record.participacao = Number(record.participacao)
        if (Number.isNaN(record.participacao) || record.participacao < 0 || record.participacao > 100)
          return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Participação deve estar entre 0 e 100' }) }
      }
      if (!['pf', 'pj', 'estrangeiro'].includes(record.tipo)) record.tipo = 'pf'

      if (action === 'update-partner') {
        if (!p.id) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'id do sócio obrigatório' }) }
        const { error } = await sb.from('supplier_partners').update(record)
          .eq('id', p.id).eq('supplier_id', supplierId)  // nunca edita sócio de outro fornecedor
        if (error) throw new Error(error.message)
      } else {
        const { error } = await sb.from('supplier_partners').insert(record)
        if (error) throw new Error(error.message)
      }

      await sb.from('audit_log').insert({
        user_id: user.id, action: action === 'add-partner' ? 'SUPPLIER_PARTNER_ADDED' : 'SUPPLIER_PARTNER_UPDATED',
        entity_type: 'supplier', entity_id: supplierId,
        metadata: { nome: record.nome },
      })
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ success: true }) }
    }

    if (action === 'delete-partner') {
      if (!body.partnerId)
        return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'partnerId obrigatório' }) }
      const { error } = await sb.from('supplier_partners').delete()
        .eq('id', body.partnerId).eq('supplier_id', supplierId)
      if (error) throw new Error(error.message)
      await sb.from('audit_log').insert({
        user_id: user.id, action: 'SUPPLIER_PARTNER_DELETED',
        entity_type: 'supplier', entity_id: supplierId,
        metadata: { partner_id: body.partnerId },
      })
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ success: true }) }
    }

    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'action inválida' }) }
  } catch (err) {
    console.error('[update-supplier-profile]', err)
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) }
  }
}
