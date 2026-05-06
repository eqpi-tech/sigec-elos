// netlify/functions/assertiva-report.js
// Gera Análise Restritiva PJ (Assertiva Soluções) para um fornecedor
// POST { supplierId? }  — supplierId obrigatório para ADMIN; SUPPLIER usa o próprio
// GET  ?supplierId=xxx  — retorna o último relatório salvo

const { createClient } = require('@supabase/supabase-js')

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Formata CNPJ para XX.XXX.XXX/XXXX-XX
function formatCnpj(raw) {
  const d = raw.replace(/\D/g, '')
  if (d.length !== 14) return raw
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12,14)}`
}

// Obtém access_token da Assertiva via OAuth2 Basic Auth
async function getAssertivaToken() {
  const clientId = process.env.ASSERTIVA_CLIENT_ID
  const secret   = process.env.ASSERTIVA_CLIENT_SECRET
  if (!clientId || !secret) throw new Error('Credenciais Assertiva não configuradas (ASSERTIVA_CLIENT_ID, ASSERTIVA_CLIENT_SECRET)')

  const credentials = Buffer.from(`${clientId}:${secret}`).toString('base64')
  const res = await fetch('https://api.assertivasolucoes.com.br/oauth2/v3/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type':  'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Assertiva auth falhou (${res.status}): ${text}`)
  }

  const data = await res.json()
  if (!data.access_token) throw new Error('Assertiva não retornou access_token')
  return data.access_token
}

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' }

  // ── Autenticação do chamador ───────────────────────────────────────────────
  const token = (event.headers.authorization || '').replace('Bearer ', '')
  if (!token) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Token ausente' }) }

  const { data: { user: caller }, error: authErr } = await supabaseAdmin.auth.getUser(token)
  if (authErr || !caller) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Token inválido' }) }

  const { data: callerRole } = await supabaseAdmin
    .from('user_roles').select('role').eq('user_id', caller.id).order('is_primary', { ascending: false }).limit(1).maybeSingle()
  const isAdmin    = callerRole?.role === 'ADMIN'
  const isSupplier = callerRole?.role === 'SUPPLIER'
  if (!isAdmin && !isSupplier) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Sem permissão' }) }

  // ── GET: retorna último relatório salvo ───────────────────────────────────
  if (event.httpMethod === 'GET') {
    const qsSupplierId = event.queryStringParameters?.supplierId

    let targetSupplierId = qsSupplierId
    if (!isAdmin) {
      // SUPPLIER: só pode ver o seu próprio
      const { data: profile } = await supabaseAdmin.from('profiles').select('supplier_id').eq('id', caller.id).maybeSingle()
      targetSupplierId = profile?.supplier_id
    }
    if (!targetSupplierId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'supplierId ausente' }) }

    const { data: report } = await supabaseAdmin
      .from('assertiva_reports')
      .select('id, cnpj, score_classe, score_pontos, protocol, generated_at, report_data')
      .eq('supplier_id', targetSupplierId)
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    return { statusCode: 200, headers, body: JSON.stringify({ report: report || null }) }
  }

  // ── POST: gera novo relatório ─────────────────────────────────────────────
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método não suportado' }) }

  let body = {}
  try { body = JSON.parse(event.body || '{}') } catch { /* ok, usa vazio */ }

  let targetSupplierId = body.supplierId
  if (!isAdmin) {
    // SUPPLIER gera para si mesmo
    const { data: profile } = await supabaseAdmin.from('profiles').select('supplier_id').eq('id', caller.id).maybeSingle()
    targetSupplierId = profile?.supplier_id
  }
  if (!targetSupplierId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'supplierId ausente' }) }

  // Busca CNPJ do supplier
  const { data: supplier, error: supErr } = await supabaseAdmin
    .from('suppliers').select('cnpj, razao_social').eq('id', targetSupplierId).maybeSingle()
  if (supErr || !supplier?.cnpj) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Fornecedor ou CNPJ não encontrado' }) }

  const cnpjFormatado = formatCnpj(supplier.cnpj)
  const cnpjEncoded   = encodeURIComponent(cnpjFormatado)

  try {
    // 1. Obtém token Assertiva (expira em ~60s)
    const assertivaToken = await getAssertivaToken()

    // 2. Chama Análise Restritiva PJ (Score Completo)
    const apiRes = await fetch(
      `https://api.assertivasolucoes.com.br/score/v3/pj/credito/${cnpjEncoded}?idFinalidade=2`,
      {
        headers: {
          'Authorization': `Bearer ${assertivaToken}`,
          'Accept':        'application/json',
        },
      }
    )

    if (apiRes.status === 429) {
      return { statusCode: 429, headers, body: JSON.stringify({ error: 'Consulta duplicada. Aguarde 2 minutos antes de gerar novamente.' }) }
    }
    if (apiRes.status === 202) {
      return { statusCode: 202, headers, body: JSON.stringify({ error: 'CNPJ não encontrado ou restrição LGPD.' }) }
    }
    if (!apiRes.ok) {
      const errText = await apiRes.text()
      throw new Error(`Assertiva API error ${apiRes.status}: ${errText.slice(0, 200)}`)
    }

    const reportData = await apiRes.json()

    // Extrai campos-chave para acesso rápido
    const scoreClasse = reportData?.resposta?.score?.classe || null
    const scorePontos = reportData?.resposta?.score?.pontos ?? null
    const protocol    = reportData?.cabecalho?.protocolo    || null

    // 3. Salva no banco
    const { data: saved, error: saveErr } = await supabaseAdmin
      .from('assertiva_reports')
      .insert({
        supplier_id:  targetSupplierId,
        cnpj:         supplier.cnpj,
        report_data:  reportData,
        protocol,
        score_classe: scoreClasse,
        score_pontos: scorePontos,
        generated_by: caller.id,
      })
      .select('id, generated_at')
      .single()

    if (saveErr) console.error('[assertiva-report] save error:', saveErr.message)

    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        success:      true,
        reportId:     saved?.id,
        generatedAt:  saved?.generated_at,
        scoreClasse,
        scorePontos,
        report:       reportData,
      }),
    }
  } catch (err) {
    console.error('[assertiva-report]', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) }
  }
}
