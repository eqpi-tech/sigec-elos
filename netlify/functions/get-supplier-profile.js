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

  try {
    const [supplierRes, sealsRes, docsRes, cnpjRes, catRes] = await Promise.allSettled([
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
    ])

    const supplier = supplierRes.value?.data
    if (!supplier) return { statusCode:404, headers:h, body: JSON.stringify({ error:'Fornecedor não encontrado' }) }

    const cnpjRec = cnpjRes.value?.data
    const seal    = sealsRes.value?.data?.[0]
    const docs    = docsRes.value?.data || []
    const cats    = catRes.value?.data  || []

    return {
      statusCode: 200,
      headers: h,
      body: JSON.stringify({
        ...supplier,
        seals:             sealsRes.value?.data || [],
        documents:         docs,
        supplier_categories: cats,
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
