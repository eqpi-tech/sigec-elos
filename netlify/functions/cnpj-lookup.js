// netlify/functions/cnpj-lookup.js
// Consulta CNPJ na BrasilAPI e sanções no Portal da Transparência
// Chamado via: /.netlify/functions/cnpj-lookup?cnpj=00000000000000

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' }
  }

  const cnpj = (event.queryStringParameters?.cnpj || '').replace(/\D/g, '')
  if (!cnpj || cnpj.length !== 14) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'CNPJ inválido — informe 14 dígitos' }) }
  }

  const apiKey = process.env.TRANSPARENCY_API_KEY

  try {
    // Executa as 3 consultas em paralelo
    const [cnpjRes, ceisRes, cnepRes] = await Promise.allSettled([
      fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
        headers: { 'Accept': 'application/json', 'User-Agent': 'SIGEC-ELOS/1.0' },
      }),
      fetch(`https://api.portaldatransparencia.gov.br/api-de-dados/ceis?cnpjSancionado=${cnpj}&pagina=1`, {
        headers: { 'chave-api-dados': apiKey, 'Accept': 'application/json' },
      }),
      fetch(`https://api.portaldatransparencia.gov.br/api-de-dados/cnep?cnpjSancionado=${cnpj}&pagina=1`, {
        headers: { 'chave-api-dados': apiKey, 'Accept': 'application/json' },
      }),
    ])

    // CNPJ data (BrasilAPI)
    let cnpjData = null
    if (cnpjRes.status === 'fulfilled' && cnpjRes.value.ok) {
      cnpjData = await cnpjRes.value.json()
    }

    // Sanções
    const sanctions = { ceis: [], cnep: [] }
    if (ceisRes.status === 'fulfilled' && ceisRes.value.ok) {
      try { sanctions.ceis = await ceisRes.value.json() } catch {}
    }
    if (cnepRes.status === 'fulfilled' && cnepRes.value.ok) {
      try { sanctions.cnep = await cnepRes.value.json() } catch {}
    }

    const hasSanctions = (Array.isArray(sanctions.ceis) && sanctions.ceis.length > 0) ||
                         (Array.isArray(sanctions.cnep) && sanctions.cnep.length > 0)

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        cnpj: cnpjData,
        sanctions,
        hasSanctions,
        status: cnpjData?.descricao_situacao_cadastral || 'DESCONHECIDA',
        razaoSocial: cnpjData?.razao_social || null,
        municipio: cnpjData?.municipio || null,
        uf: cnpjData?.uf || null,
      }),
    }
  } catch (err) {
    console.error('cnpj-lookup error:', err)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Erro interno ao consultar CNPJ', detail: err.message }),
    }
  }
}
