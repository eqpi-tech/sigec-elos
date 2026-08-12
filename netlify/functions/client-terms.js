// netlify/functions/client-terms.js
// GET  → retorna o terms_content do cliente autenticado
// POST → salva terms_content para o cliente autenticado

const { createClient } = require('@supabase/supabase-js')

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const DEFAULT_TERMS = `TERMOS DE USO E CONDIÇÕES DE HOMOLOGAÇÃO

Ao aceitar este convite e iniciar o processo de homologação na plataforma SIGEC-ELOS, o fornecedor declara estar ciente e de acordo com as seguintes condições:

1. DOCUMENTAÇÃO
O fornecedor compromete-se a enviar documentos verdadeiros, atualizados e em conformidade com a legislação vigente. A falsidade de qualquer informação implica cancelamento imediato da homologação.

2. ATUALIZAÇÃO
O fornecedor é responsável por manter seus documentos atualizados. Documentos vencidos resultarão em suspensão do Selo ELOS até regularização.

3. CONFIDENCIALIDADE
As informações fornecidas serão utilizadas exclusivamente para fins de homologação e não serão divulgadas a terceiros sem consentimento prévio.

4. COMPLIANCE
O fornecedor declara não constar em cadastros de empresas sancionadas (CEIS, CNEP) e não possuir impedimentos legais para prestação de serviços.

5. VALIDADE
A homologação tem validade de 12 (doze) meses, podendo ser renovada mediante atualização dos documentos e nova análise.

Ao continuar, você confirma que leu, compreendeu e concorda com todos os termos acima.`

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: HEADERS, body: '' }

  const token = (event.headers.authorization || '').replace('Bearer ', '')
  if (!token) return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: 'Token ausente' }) }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: 'Token inválido' }) }

  // Busca o client_id do usuário
  const { data: roleRow } = await supabase
    .from('user_roles').select('client_id, role, access_profile').eq('user_id', user.id)
    .in('role', ['CLIENT', 'ADMIN']).maybeSingle()
  if (!roleRow) return { statusCode: 403, headers: HEADERS, body: JSON.stringify({ error: 'Acesso negado' }) }
  // Perfil readonly (patch_030) não altera termos
  if (event.httpMethod === 'POST' && roleRow.role === 'CLIENT' && roleRow.access_profile === 'readonly')
    return { statusCode: 403, headers: HEADERS, body: JSON.stringify({ error: 'Seu perfil de acesso é somente leitura' }) }

  if (event.httpMethod === 'GET') {
    if (!roleRow.client_id) {
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ terms: DEFAULT_TERMS, isDefault: true }) }
    }
    const { data: client } = await supabase
      .from('clients').select('terms_content').eq('id', roleRow.client_id).single()
    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({ terms: client?.terms_content || DEFAULT_TERMS, isDefault: !client?.terms_content }),
    }
  }

  if (event.httpMethod === 'POST') {
    if (!roleRow.client_id) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Cliente não encontrado' }) }
    let body
    try { body = JSON.parse(event.body) } catch {
      return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'JSON inválido' }) }
    }
    const { terms } = body
    if (!terms || typeof terms !== 'string') return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Campo terms obrigatório' }) }

    const { error } = await supabase
      .from('clients')
      .update({ terms_content: terms, terms_updated_at: new Date().toISOString() })
      .eq('id', roleRow.client_id)
    if (error) return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: error.message }) }

    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ saved: true }) }
  }

  return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) }
}
