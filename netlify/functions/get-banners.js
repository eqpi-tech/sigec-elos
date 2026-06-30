// netlify/functions/get-banners.js
// Endpoint público (sem autenticação) — retorna banners ativos dentro do período vigente.
// Usado pelo BannerStrip React e pelo embed vanilla banners.js nos sistemas legados.

const { createClient } = require('@supabase/supabase-js')

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'public, max-age=60', // cache 1 min no CDN
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: HEADERS, body: '' }
  if (event.httpMethod !== 'GET')    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('banners')
    .select('id, title, body, tipo, image_url, image_alt, cta_label, cta_url, starts_at, ends_at')
    .eq('active', true)
    .lte('starts_at', now)
    .or(`ends_at.is.null,ends_at.gte.${now}`)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[get-banners]', error)
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: error.message }) }
  }

  return { statusCode: 200, headers: HEADERS, body: JSON.stringify(data || []) }
}
