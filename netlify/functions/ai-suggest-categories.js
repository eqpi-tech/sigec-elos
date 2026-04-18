// netlify/functions/ai-suggest-categories.js
// Proxy para a API da Anthropic — evita CORS e não expõe a key no frontend
// POST body: { cnae, cnaeDescricao, categoryNames: string[] }

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }

  let body
  try { body = JSON.parse(event.body) } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) }
  }

  const { cnae, cnaeDescricao, categoryNames = [] } = body
  if (!cnaeDescricao && !cnae) {
    return { statusCode: 400, headers, body: JSON.stringify({ sugestoes: [] }) }
  }

  const cnaeText = cnaeDescricao || String(cnae)
  const catList  = categoryNames.slice(0, 120).join(', ')

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY || '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001', // modelo rápido e barato para sugestões
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: `A empresa tem CNAE: "${cnaeText}". Das seguintes categorias disponíveis: ${catList}. Sugira no máximo 5 categorias mais relevantes para esta empresa. Responda APENAS com JSON sem markdown: {"sugestoes":["cat1","cat2"]}`
        }]
      })
    })

    const data = await res.json()
    const text = data.content?.[0]?.text || '{}'
    const clean = text.replace(/```json?|```/g, '').trim()
    const parsed = JSON.parse(clean)

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ sugestoes: parsed.sugestoes || [] })
    }
  } catch (err) {
    console.error('[ai-suggest-categories]', err.message)
    return {
      statusCode: 200, // não quebra o fluxo — retorna lista vazia
      headers,
      body: JSON.stringify({ sugestoes: [], error: err.message })
    }
  }
}
