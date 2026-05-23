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
      invitation_token,
      ref_slug,
      is_existing_active,
    } = body

    if (!cnpj || !razao_social) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'cnpj e razao_social são obrigatórios' }) }
    }

    const cleanCnpj = cnpj.replace(/\D/g, '')

    // 1. Verifica se CNPJ já existe — upsert em vez de insert cego
    const { data: existingSupplier } = await supabaseAdmin
      .from('suppliers').select('*').eq('cnpj', cleanCnpj).maybeSingle()

    let supplier
    let isNewSupplier = false

    if (existingSupplier) {
      // Fornecedor já existe (migrado do HOC ou cadastro anterior)
      // Atualiza dados com informações frescas da Receita Federal
      const updatePayload = {
        razao_social,
        nome_fantasia:   nome_fantasia   || existingSupplier.nome_fantasia,
        cnae_main:       cnae_main       || existingSupplier.cnae_main,
        cnae_list:       cnae_list?.length ? cnae_list : existingSupplier.cnae_list,
        state:           state           || existingSupplier.state,
        city:            city            || existingSupplier.city,
        phone:           phone           || existingSupplier.phone,
      }
      // Só reivindica user_id se ainda não tem dono (fornecedores importados do HOC)
      if (!existingSupplier.user_id) updatePayload.user_id = user.id

      const { data: updated } = await supabaseAdmin
        .from('suppliers').update(updatePayload).eq('id', existingSupplier.id).select().single()
      supplier = updated || existingSupplier
    } else {
      // Novo fornecedor — cria registro completo
      isNewSupplier = true
      const { data: newSupplier, error: supplierError } = await supabaseAdmin
        .from('suppliers')
        .insert({
          user_id:           user.id,
          cnpj:              cleanCnpj,
          razao_social,
          nome_fantasia:     nome_fantasia   || null,
          cnae_main:         cnae_main       || null,
          cnae_list:         cnae_list       || [],
          state:             state           || null,
          city:              city            || null,
          phone:             phone           || null,
          services:          services        || [],
          certifications:    certifications  || [],
          status:            'PENDING',
          sanctions_checked: !!sanctions_checked,
          sanctions_result:  sanctions_result || null,
        })
        .select()
        .single()
      if (supplierError) throw new Error(supplierError.message)
      supplier = newSupplier
    }

    // 2a. Auto-valida documentos que podem ser confirmados pelo CNPJ lookup
    //     Doc 62 = Comprovante Simples Nacional
    //     Doc 61 = Análise CNAEs
    const autoDocuments = []

    // Simples Nacional — confirmado pela BrasilAPI
    if (body.cnpj_full_data?.opcao_pelo_simples !== undefined) {
      const isOptante = body.cnpj_full_data.opcao_pelo_simples === true
                        && !body.cnpj_full_data.data_exclusao_do_simples
      autoDocuments.push({
        supplier_id:  supplier.id,
        type:         '62',
        label:        'Comprovante de Deferimento do Simples Nacional',
        source:       'AUTO',
        // VALID independente de ser optante: a consulta foi feita e o status é conhecido
        status:       'VALID',
        storage_path: null,
        metadata: {
          auto_collect: true,
          source: 'BrasilAPI',
          optante: isOptante,
          regime: isOptante ? 'Simples Nacional' : 'Lucro Presumido / Real',
          data_opcao: body.cnpj_full_data.data_opcao_pelo_simples || null,
          data_exclusao: body.cnpj_full_data.data_exclusao_do_simples || null,
          note: 'Situação tributária confirmada via Receita Federal (BrasilAPI)',
        },
      })
    }

    // Análise CNAEs — doc 61 (dados já capturados, backoffice analisa)
    if (body.cnpj_full_data?.cnae_fiscal) {
      autoDocuments.push({
        supplier_id:  supplier.id,
        type:         '61',
        label:        'Analise CNAES',
        source:       'AUTO',
        status:       'VALID',
        storage_path: null,
        metadata: {
          auto_collect: true,
          source: 'BrasilAPI',
          cnae_principal: body.cnpj_full_data.cnae_fiscal,
          cnae_descricao: body.cnpj_full_data.cnae_fiscal_descricao,
          cnaes_secundarios: body.cnpj_full_data.cnaes_secundarios || [],
        },
      })
    }

    // Cartão CNPJ — doc 37 (já criado no Documents.jsx mas garantimos aqui também)
    autoDocuments.push({
      supplier_id:  supplier.id,
      type:         '37',
      label:        'Cartão de Inscrição no CNPJ',
      source:       'AUTO',
      status:       body.cnpj_full_data?.descricao_situacao_cadastral === 'ATIVA' ? 'VALID' : 'PENDING',
      storage_path: null,
      metadata: {
        auto_collect: true,
        source: 'BrasilAPI',
        situacao: body.cnpj_full_data?.descricao_situacao_cadastral || 'DESCONHECIDA',
        data_abertura: body.cnpj_full_data?.data_inicio_atividade || null,
      },
    })

    // Insere todos os documentos auto-coletados
    if (autoDocuments.length > 0) {
      for (const doc of autoDocuments) {
        try {
          const { error: docErr } = await supabaseAdmin.from('documents')
            .upsert(doc, { onConflict: 'supplier_id,type' })
          if (docErr) console.warn(`Auto-doc ${doc.type} warn:`, docErr.message)
        } catch (e) { console.warn(`Auto-doc ${doc.type} catch:`, e.message) }
      }
      console.log(`⚡ ${autoDocuments.length} documento(s) auto-coletado(s) para ${supplier.id}`)
    }

    // 2. Persiste consulta CNPJ completa para análise do backoffice
    //    Dados: QSA, CNAEs, endereços, capital social, histórico de situações
    if (body.cnpj_full_data || body.sanctions_result) {
      // try/catch porque .catch() não existe no PostgrestFilterBuilder
      try {
        const activeCeis = body.sanctions_result?.ceis || []
        const activeCnep = body.sanctions_result?.cnep || []
        const hasSanctions = activeCeis.length > 0 || activeCnep.length > 0

        const { error: cnpjInsertErr } = await supabaseAdmin
          .from('cnpj_consultations')
          .insert({
            cnpj:           body.cnpj.replace(/\D/g, ''),
            supplier_id:    supplier.id,
            cnpj_data:      body.cnpj_full_data    || null,
            sanctions_data: body.sanctions_result  || null,
            has_sanctions:  hasSanctions,
            consulted_at:   new Date().toISOString(),
          })
        if (cnpjInsertErr) {
          // Tenta sem campos novos (compatibilidade com schema antigo)
          if (cnpjInsertErr.code === 'PGRST204' || cnpjInsertErr.message?.includes('column')) {
            console.warn('cnpj_consultations: tentando sem campo sanctions_history...')
            await supabaseAdmin.from('cnpj_consultations').insert({
              cnpj:        body.cnpj.replace(/\D/g, ''),
              supplier_id: supplier.id,
              cnpj_data:   body.cnpj_full_data || null,
              has_sanctions: hasSanctions,
              consulted_at: new Date().toISOString(),
            })
          } else {
            console.warn('cnpj_consultations insert warn:', cnpjInsertErr.message)
          }
        }
      } catch (cnpjErr) {
        console.warn('cnpj_consultations insert (não crítico):', cnpjErr.message)
      }
      // .catch para não bloquear o fluxo se falhar
    }

    // 3. Cria Seal inicial apenas para fornecedores NOVOS
    //    Para fornecedores já existentes (HOC ou cadastro anterior), mantém o seal existente
    if (isNewSupplier) {
      const { error: sealError } = await supabaseAdmin
        .from('seals')
        .insert({ supplier_id: supplier.id, level: 'Simples', status: 'PENDING', score: 0 })
      if (sealError && sealError.code !== '23505') {
        console.error('Seal create error:', sealError)
      }
    }

    // 3. Vincula supplier_id ao perfil do usuário
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({ supplier_id: supplier.id })
      .eq('id', user.id)
    if (profileError) console.error('Profile update error:', profileError)

    // 3b. Registra SUPPLIER em user_roles
    await supabaseAdmin.from('user_roles').upsert({
      user_id: user.id, role: 'SUPPLIER', supplier_id: supplier.id, is_primary: true
    }, { onConflict: 'user_id,role' })

    // 3c. Todo fornecedor ganha também perfil BUYER para acessar o marketplace
    try {
      const { data: existingBuyer } = await supabaseAdmin
        .from('buyers').select('id').eq('user_id', user.id).maybeSingle()
      let buyerId = existingBuyer?.id
      if (!existingBuyer) {
        const { data: newBuyer } = await supabaseAdmin.from('buyers').insert({
          user_id:      user.id,
          razao_social: razao_social,
          cnpj:         cleanCnpj,
        }).select('id').single()
        buyerId = newBuyer?.id
      }
      if (buyerId) {
        await supabaseAdmin.from('user_roles').upsert({
          user_id: user.id, role: 'BUYER', buyer_id: buyerId, is_primary: false
        }, { onConflict: 'user_id,role' })
      }
    } catch (e) { console.warn('BUYER role setup (não crítico):', e.message) }

    // 4. Salva categorias selecionadas
    const categoryIds = body.category_ids || []
    if (categoryIds.length > 0) {
      const catRows = categoryIds.map(cid => ({ supplier_id: supplier.id, category_id: cid }))
      const { error: catErr } = await supabaseAdmin
        .from('supplier_categories')
        .insert(catRows)
      if (catErr) console.warn('supplier_categories insert warn:', catErr.message)
    }

    // 5. Vincula convite ao fornecedor recém-criado (pelo token do URL, e-mail ou CNPJ)
    try {
      const cleanCnpj = cnpj.replace(/\D/g, '')

      if (invitation_token) {
        // Prioridade 1: token único do link de convite
        await supabaseAdmin.from('invitations')
          .update({ status: 'REGISTERED', supplier_id: supplier.id })
          .eq('token', invitation_token)
          .neq('status', 'REGISTERED')
      } else {
        // Fallback: tenta pelo e-mail E pelo CNPJ (convites antigos sem token)
        const { data: { user: currentUser } } = await supabaseAdmin.auth.admin.getUserById(user.id)
        const userEmail = currentUser?.email

        // Busca convites pendentes que combinam com e-mail ou CNPJ
        const { data: matchingInvites } = await supabaseAdmin
          .from('invitations')
          .select('id')
          .neq('status', 'REGISTERED')
          .or(userEmail
            ? `supplier_email.eq.${userEmail},supplier_cnpj.eq.${cleanCnpj}`
            : `supplier_cnpj.eq.${cleanCnpj}`)

        if (matchingInvites?.length > 0) {
          const ids = matchingInvites.map(i => i.id)
          await supabaseAdmin.from('invitations')
            .update({ status: 'REGISTERED', supplier_id: supplier.id })
            .in('id', ids)
        }
      }
    } catch (e) { console.warn('invitation link (não crítico):', e.message) }

    // 5b. Se veio de landing page de cliente (?ref=slug), cria vínculo client_id ↔ supplier
    if (ref_slug) {
      try {
        const { data: lp } = await supabaseAdmin
          .from('client_landing_pages')
          .select('client_id')
          .eq('slug', ref_slug)
          .eq('is_active', true)
          .single()

        if (lp?.client_id) {
          await supabaseAdmin.from('invitations').insert({
            client_id:        lp.client_id,
            supplier_id:      supplier.id,
            supplier_cnpj:    cnpj.replace(/\D/g, ''),
            status:           'REGISTERED',
            invited_by_role:  'CLIENT',
          })
          console.log(`🔗 Fornecedor vinculado ao cliente via LP slug="${ref_slug}"`)
        }
      } catch (e) { console.warn('LP invitation link (não crítico):', e.message) }
    }

    console.log(`✅ Fornecedor criado: ${supplier.id} (${razao_social}) para user ${user.id} — ${categoryIds.length} categorias`)

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
