// get-portal-terms.js
// Endpoint público (sem auth): termos do CLIENTE para quem se cadastra pelo
// portal dele (/portal/:slug → /cadastro?ref=slug). Mesmo formato dos termos
// de get-invitation — sem isto o portal mostrava só o termo ELOS (12/10, VIX)
// GET /.netlify/functions/get-portal-terms?slug=xxx

const { createClient } = require('@supabase/supabase-js')

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

exports.handler = async (event) => {
  const h = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: h, body: '' }

  const slug = event.queryStringParameters?.slug
  if (!slug) return { statusCode: 400, headers: h, body: JSON.stringify({ error: 'slug obrigatório' }) }

  const { data: lp, error } = await supabaseAdmin
    .from('client_landing_pages')
    .select('client_id, clients(razao_social, nome_fantasia, terms_content)')
    .eq('slug', slug).eq('is_active', true)
    .maybeSingle()

  if (error) return { statusCode: 500, headers: h, body: JSON.stringify({ error: error.message }) }
  if (!lp?.client_id) return { statusCode: 404, headers: h, body: JSON.stringify({ error: 'Portal não encontrado' }) }

  // Itens de aceite do cliente (patch_073); DOCUMENT vira URL assinada (2h)
  const { data: items } = await supabaseAdmin
    .from('client_terms_items')
    .select('id, title, kind, content, storage_path, file_name, version, required')
    .eq('client_id', lp.client_id).eq('active', true)
    .order('sort').order('created_at')
  const termsItems = await Promise.all((items || []).map(async it => {
    let url = null
    if (it.kind === 'DOCUMENT' && it.storage_path) {
      const { data: signed } = await supabaseAdmin.storage
        .from('client-terms').createSignedUrl(it.storage_path, 7200)
      url = signed?.signedUrl || null
    }
    return { id: it.id, title: it.title, kind: it.kind, version: it.version,
             required: it.required, content: it.kind === 'TEXT' ? it.content : null,
             file_name: it.file_name, url }
  }))

  return {
    statusCode: 200,
    headers: h,
    body: JSON.stringify({
      client_id:    lp.client_id,
      sender_name:  lp.clients?.nome_fantasia || lp.clients?.razao_social || null,
      client_terms: lp.clients?.terms_content || null,   // null = termo padrão ELOS
      terms_items:  termsItems,
    }),
  }
}
