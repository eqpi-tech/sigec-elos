// netlify/functions/verify-certificate.js
// Verificação PÚBLICA de certificado ELOS (sem auth): qualquer pessoa
// informa o código impresso (ELOS-XXXXXXXXXXXX) e recebe se é verídico
// e se AINDA está válido — o certificado pode ser emitido hoje e o selo
// cancelado amanhã por documento vencido/faltante; a resposta reflete o
// status ATUAL do selo, nunca o momento da emissão.
// GET /.netlify/functions/verify-certificate?code=ELOS-...

const { createClient } = require('@supabase/supabase-js')

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)
const HEADERS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: HEADERS, body: '' }

  const raw = (event.queryStringParameters?.code || '').trim().toUpperCase()
  // Normaliza: aceita com/sem prefixo, com espaços ou hífens extras
  const hex = raw.replace(/^ELOS[\s-]*/i, '').replace(/[^0-9A-F]/g, '')
  if (hex.length !== 12) {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ found: false, error: 'Código inválido — o formato é ELOS- seguido de 12 caracteres.' }) }
  }
  const code = `ELOS-${hex}`

  try {
    const { data: seal } = await supabaseAdmin
      .from('seals')
      .select('cert_code, status, seal_name, level, issued_at, expires_at, exception, client_suspended_at, suppliers(razao_social, cnpj), clients(razao_social)')
      .eq('cert_code', code)
      .maybeSingle()

    if (!seal) {
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ found: false }) }
    }

    // Situação ATUAL (não a da emissão)
    const now = new Date()
    const expired = seal.expires_at && new Date(seal.expires_at) < now
    let situation, valid = false
    if (seal.status === 'ACTIVE' && !expired) { situation = 'VALIDO'; valid = true }
    else if (seal.status === 'ACTIVE' && expired) situation = 'VENCIDO'
    else if (seal.status === 'SUSPENDED') situation = 'SUSPENSO'
    else if (seal.status === 'EXPIRED' || expired) situation = 'VENCIDO'
    else situation = 'CANCELADO' // PENDING/afins: certificado não vigente

    const fmtCnpj = c => c && c.length === 14
      ? `${c.slice(0,2)}.${c.slice(2,5)}.${c.slice(5,8)}/${c.slice(8,12)}-${c.slice(12)}`
      : c || null

    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({
        found:      true,
        valid,
        situation,                                  // VALIDO | VENCIDO | SUSPENSO | CANCELADO
        cert_code:  seal.cert_code,
        supplier:   seal.suppliers?.razao_social || null,
        cnpj:       fmtCnpj((seal.suppliers?.cnpj || '').replace(/\D/g, '')),
        seal_name:  seal.seal_name || seal.level || 'ELOS',
        client:     seal.clients?.razao_social || null,
        exception:  !!seal.exception,
        issued_at:  seal.issued_at,
        expires_at: seal.expires_at,
        checked_at: now.toISOString(),
      }),
    }
  } catch (err) {
    console.error('[verify-certificate]', err)
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: 'Erro na verificação — tente novamente.' }) }
  }
}
