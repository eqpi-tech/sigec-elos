// get-supplier-profile.js
// Usa service_role para ler todos os dados do fornecedor sem RLS
// GET /.netlify/functions/get-supplier-profile?id=<supplier_uuid>

const { createClient } = require('@supabase/supabase-js')

exports.handler = async (event) => {
  const h = { 'Content-Type':'application/json', 'Access-Control-Allow-Origin':'*' }
  if (event.httpMethod === 'OPTIONS') return { statusCode:200, headers:h, body:'' }

  const id = event.queryStringParameters?.id
  if (!id) return { statusCode:400, headers:h, body: JSON.stringify({ error:'id obrigatório' }) }

  // Verifica autenticação — qualquer usuário logado pode ver perfil público
  const token = (event.headers.authorization||'').replace('Bearer ','')
  if (!token) return { statusCode:401, headers:h, body: JSON.stringify({ error:'Não autorizado' }) }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  // Papel do chamador decide a abertura dos contatos dos sócios:
  // CLIENT/ADMIN veem telefone aberto; BUYER vê mascarado até existir
  // assinatura de comprador; CPF é SEMPRE mascarado (LGPD).
  let openContacts = false
  try {
    const { data: { user } } = await supabase.auth.getUser(token)
    if (user) {
      const { data: roles } = await supabase
        .from('user_roles').select('role').eq('user_id', user.id)
      openContacts = (roles || []).some(r => r.role === 'CLIENT' || r.role === 'ADMIN')
    }
  } catch { /* segue mascarado */ }

  try {
    const [supplierRes, sealsRes, docsRes, cnpjRes, catRes, partnersRes] = await Promise.allSettled([
      supabase.from('suppliers').select('*').eq('id', id).single(),
      supabase.from('seals').select('*').eq('supplier_id', id).order('issued_at', { ascending: false }),
      supabase.from('documents').select('id,status,label,type,expires_at,source').eq('supplier_id', id),
      supabase.from('cnpj_consultations')
        .select('cnpj_data, sanctions_data, has_sanctions, consulted_at, cnpj')
        .eq('supplier_id', id)
        .order('consulted_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from('supplier_categories')
        .select('category_id, categories(id, name, parent_id)')
        .eq('supplier_id', id),
      // Quadro societário (migrado do HOC / backoffice / legado EQPI)
      supabase.from('supplier_partners')
        .select('nome, tipo, cargo, nacionalidade, participacao, cpf_cnpj, telefone')
        .eq('supplier_id', id)
        .order('nome'),
    ])

    const supplierRaw = supplierRes.value?.data
    if (!supplierRaw) return { statusCode:404, headers:h, body: JSON.stringify({ error:'Fornecedor não encontrado' }) }

    // hoc_extra contém dados sensíveis (histórico bancário) — NÃO vaza para o
    // perfil público; expõe apenas os endereços
    const { hoc_extra, ...supplier } = supplierRaw
    const hocEnderecos = (hoc_extra?.enderecos || []).map(e => ({
      logradouro: e.nome_logradouro, numero: e.numero_endereco, complemento: e.complemento,
      bairro: e.bairro, municipio: e.municipio, uf: e.uf, cep: e.cep, tipo: e.tipo,
    }))

    const cnpjRec = cnpjRes.value?.data
    const seal    = sealsRes.value?.data?.[0]
    const docs    = docsRes.value?.data || []
    const cats    = catRes.value?.data  || []

    // CPF sempre mascarado (LGPD); CNPJ de sócio PJ parcialmente
    const maskDoc = (v) => {
      const d = String(v || '').replace(/\D/g, '')
      if (d.length === 11) return `***.${d.slice(3,6)}.${d.slice(6,9)}-**`
      if (d.length === 14) return `**.***.${d.slice(5,8)}/****-**`
      return null
    }
    // Telefone mascarado: mantém DDD e 2 últimos dígitos
    const maskFone = (v) => {
      const d = String(v || '').replace(/\D/g, '')
      if (d.length < 10) return null
      return `(${d.slice(0,2)}) ${'*'.repeat(d.length-6)}-**${d.slice(-2)}`
    }
    const partners = (partnersRes.value?.data || []).map(p => ({
      nome: p.nome, tipo: p.tipo, cargo: p.cargo,
      nacionalidade: p.nacionalidade, participacao: p.participacao,
      cpf: maskDoc(p.cpf_cnpj),
      telefone: p.telefone ? (openContacts ? p.telefone : maskFone(p.telefone)) : null,
      telefone_mascarado: !!p.telefone && !openContacts,
    }))

    return {
      statusCode: 200,
      headers: h,
      body: JSON.stringify({
        ...supplier,
        seals:             sealsRes.value?.data || [],
        documents:         docs,
        supplier_categories: cats,
        partners,
        hocEnderecos,
        planType:          null,
        cnpjData:          cnpjRec?.cnpj_data         || null,
        sanctionsData:     cnpjRec?.sanctions_data    || null,
        hasSanctions:      cnpjRec?.has_sanctions     || false,
        cnpjConsultedAt:   cnpjRec?.consulted_at      || null,
        sealLevel:         seal?.level                || null,
        sealStatus:        seal?.status               || 'PENDING',
        sealScore:         seal?.score                || 0,
        sealIssuedAt:      seal?.issued_at            || null,
      })
    }
  } catch (err) {
    console.error('[get-supplier-profile]', err.message)
    return { statusCode:500, headers:h, body: JSON.stringify({ error: err.message }) }
  }
}
