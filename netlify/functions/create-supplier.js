// netlify/functions/create-supplier.js
// Cria o fornecedor + seal + vincula ao perfil usando service_role
// Chamado pelo onboarding APÓS o signup — não depende de RLS

const { createClient } = require('@supabase/supabase-js')

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' }
  if (event.httpMethod !== 'POST')   return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }

  // Verifica o token do usuário recém-criado
  const authHeader = event.headers.authorization || event.headers.Authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Token ausente' }) }
  }

  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  // Valida o JWT do usuário
  const token = authHeader.slice(7)
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)

  if (authError || !user) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Token inválido ou sessão expirada' }) }
  }

  try {
    const body = JSON.parse(event.body)
    const {
      cnpj, razao_social, nome_fantasia, cnae_main, cnae_list,
      state, city, phone, services, certifications,
      sanctions_checked, sanctions_result,
    } = body

    if (!cnpj || !razao_social) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'cnpj e razao_social são obrigatórios' }) }
    }

    // 1. Cria o fornecedor com service_role (bypassa RLS)
    const { data: supplier, error: supplierError } = await supabaseAdmin
      .from('suppliers')
      .insert({
        user_id:          user.id,
        cnpj:             cnpj.replace(/\D/g, ''),
        razao_social,
        nome_fantasia:    nome_fantasia || null,
        cnae_main:        cnae_main || null,
        cnae_list:        cnae_list || [],
        state:            state || null,
        city:             city || null,
        phone:            phone || null,
        services:         services || [],
        certifications:   certifications || [],
        status:           'PENDING',
        sanctions_checked: !!sanctions_checked,
        sanctions_result:  sanctions_result || null,
      })
      .select()
      .single()

    if (supplierError) {
      // CNPJ duplicado
      if (supplierError.code === '23505') {
        return { statusCode: 409, headers, body: JSON.stringify({ error: 'Este CNPJ já está cadastrado na plataforma.' }) }
      }
      throw new Error(supplierError.message)
    }

    // 2. Persiste consulta CNPJ completa para análise do backoffice
    //    Dados: QSA, CNAEs, endereços, capital social, histórico de situações
    if (body.cnpj_full_data || body.sanctions_result) {
      // try/catch porque .catch() não existe no PostgrestFilterBuilder
      try {
        await supabaseAdmin.from('cnpj_consultations').insert({
          cnpj:           body.cnpj.replace(/\D/g, ''),
          supplier_id:    supplier.id,
          cnpj_data:      body.cnpj_full_data    || null,
          sanctions_data: body.sanctions_result  || null,
          has_sanctions:  !!(body.sanctions_result?.ceis?.length || body.sanctions_result?.cnep?.length),
          consulted_at:   new Date().toISOString(),
        })
      } catch (cnpjErr) {
        console.warn('cnpj_consultations insert (não crítico):', cnpjErr.message)
      }
      // .catch para não bloquear o fluxo se falhar
    }

    // 3. Cria o Seal inicial como PENDING
    const { error: sealError } = await supabaseAdmin
      .from('seals')
      .insert({
        supplier_id: supplier.id,
        level:       'Simples',
        status:      'PENDING',
        score:       0,
      })

    if (sealError && sealError.code !== '23505') { // ignora duplicado
      console.error('Seal create error:', sealError)
    }

    // 3. Vincula supplier_id ao perfil do usuário
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({ supplier_id: supplier.id })
      .eq('id', user.id)

    if (profileError) {
      console.error('Profile update error:', profileError)
    }

    console.log(`✅ Fornecedor criado: ${supplier.id} (${razao_social}) para user ${user.id}`)

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({ supplier }),
    }
  } catch (err) {
    console.error('create-supplier error:', err)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    }
  }
}
