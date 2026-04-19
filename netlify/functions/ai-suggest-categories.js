// netlify/functions/ai-suggest-categories.js
exports.handler = async (event) => {
  const headers = { 'Content-Type':'application/json', 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'Content-Type' }
  if (event.httpMethod === 'OPTIONS') return { statusCode:200, headers, body:'' }
  if (event.httpMethod !== 'POST') return { statusCode:405, headers, body:'' }

  let body
  try { body = JSON.parse(event.body) } catch { return { statusCode:400, headers, body: JSON.stringify({ sugestoes:[] }) } }

  const { cnae, cnaeDescricao, categoryNames = [] } = body
  const cnaeText = cnaeDescricao || String(cnae||'')
  if (!cnaeText) return { statusCode:200, headers, body: JSON.stringify({ sugestoes:[] }) }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('[ai-suggest] ANTHROPIC_API_KEY não configurada no Netlify')
    return { statusCode:200, headers, body: JSON.stringify({ sugestoes:[], error:'API key não configurada' }) }
  }

  // Lista numerada — IA retorna índices, eliminando erros de digitação de nomes
  const numbered = categoryNames.map((n, i) => `${i+1}. ${n}`).join('\n')

  const prompt = `Empresa brasileira com atividade econômica (CNAE): "${cnaeText}"

Lista de categorias disponíveis na plataforma de homologação de fornecedores:
${numbered}

Retorne os NÚMEROS das categorias mais relevantes para essa empresa (1 a 5 categorias).
Responda SOMENTE com JSON válido, sem texto adicional: {"indices":[1,5,12]}`

  try {
    if (categoryNames.length === 0) {
      return { statusCode:200, headers, body: JSON.stringify({ sugestoes:[] }) }
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,   // aumentado — resposta JSON com até 10 índices
        messages: [{ role: 'user', content: prompt }]
      })
    })

    if (!res.ok) {
      const errBody = await res.text()
      console.error('[ai-suggest] API error', res.status, errBody.slice(0, 500))
      return { statusCode:200, headers, body: JSON.stringify({ sugestoes:[], error:`API ${res.status}: ${errBody.slice(0,100)}` }) }
    }

    const data    = await res.json()
    const rawText = data.content?.[0]?.text || '{}'
    console.log('[ai-suggest] cnae:', cnaeText, '| response:', rawText)

    const clean  = rawText.replace(/```json?|```/g,'').trim()
    const parsed = JSON.parse(clean)
    const indices = Array.isArray(parsed.indices) ? parsed.indices : []

    const sugestoes = indices
      .filter(i => Number.isInteger(i) && i >= 1 && i <= categoryNames.length)
      .map(i => categoryNames[i - 1])

    console.log('[ai-suggest] sugestoes:', sugestoes)
    return { statusCode:200, headers, body: JSON.stringify({ sugestoes }) }

  } catch (err) {
    console.error('[ai-suggest] erro:', err.message)
    return { statusCode:200, headers, body: JSON.stringify({ sugestoes:[], error: err.message }) }
  }
}
