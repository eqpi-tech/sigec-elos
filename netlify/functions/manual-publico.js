// netlify/functions/manual-publico.js — link PÚBLICO dos manuais (29/10/2026).
// Comunicado do go-live da VIXPAR: o fornecedor recebe o manual antes de ter
// login. elos.eqpitech.com.br/manual/<fornecedor|cliente|comprador> → redireciona
// para um link temporário (1 h) do PDF no bucket privado "manuais" — sempre a
// versão mais recente publicada. O manual do backoffice NUNCA sai daqui (só
// pela Ajuda, para ADMIN — help-docs.js).
const { createClient } = require('@supabase/supabase-js')
const PUBLICOS = ['fornecedor', 'cliente', 'comprador']

exports.handler = async (event) => {
  const m = String(event.queryStringParameters?.m || '').toLowerCase()
  if (!PUBLICOS.includes(m)) return { statusCode: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body: 'Manual não encontrado' }
  try {
    const sb = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    const { data, error } = await sb.storage.from('manuais').createSignedUrl(`manual-${m}.pdf`, 3600, { download: false })
    if (error || !data?.signedUrl) throw new Error(error?.message || 'sem link')
    return { statusCode: 302, headers: { Location: data.signedUrl, 'Cache-Control': 'no-store' }, body: '' }
  } catch (e) {
    console.error('manual-publico:', e.message)
    return { statusCode: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body: 'Manual indisponível no momento — tente de novo em instantes ou fale com suporte@eqpitech.com.br' }
  }
}
