// netlify/functions/ai-suggest-categories.js
// Proxy para API Anthropic — sugere categorias com base no CNAE da empresa
// POST body: { cnae, cnaeDescricao, categoryNames: string[] }

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' }
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers, body: '' }

  let body
  try { body = JSON.parse(event.body) } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ sugestoes: [] }) }
  }

  const { cnae, cnaeDescricao, categoryNames = [] } = body
  if (!cnaeDescricao && !cnae) {
    return { statusCode: 200, headers, body: JSON.stringify({ sugestoes: [] }) }
  }

  const cnaeText = cnaeDescricao || String(cnae)
  const apiKey  = process.env.ANTHROPIC_API_KEY

  if (!apiKey) {
    console.error('[ai-suggest] ANTHROPIC_API_KEY não configurada')
    return { statusCode: 200, headers, body: JSON.stringify({ sugestoes: [], error: 'API key não configurada' }) }
  }

  // Monta lista numerada para forçar a IA a retornar índices (evita erros de nome)
  const numbered = categoryNames.map((name, i) => `${i + 1}. ${name}`)
  const catList  = numbered.join('\n')

  const prompt = `Você é um assistente de classificação de fornecedores B2B brasileiro.

A empresa tem a seguinte atividade econômica (CNAE): "${cnaeText}"

Abaixo está a lista numerada de categorias disponíveis na plataforma:
${catList}

Sua tarefa: identificar quais categorias da lista acima são MAIS RELEVANTES para essa empresa.

Regras:
- Retorne EXATAMENTE os números das categorias relevantes (não os nomes)
- Selecione entre 1 e 5 categorias
- Priorize correspondências diretas, depois similares
- Responda APENAS com JSON válido, sem markdown, sem explicações

Formato esperado: {"indices": [1, 4, 7]}`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',  // modelo correto
        max_tokens: 150,
        messages: [{ role: 'user', content: prompt }]
      })
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('[ai-suggest] API error:', res.status, errText)
      return { statusCode: 200, headers, body: JSON.stringify({ sugestoes: [], error: `API ${res.status}` }) }
    }

    const data    = await res.json()
    const rawText = data.content?.[0]?.text || '{}'

    console.log('[ai-suggest] CNAE:', cnaeText)
    console.log('[ai-suggest] Response:', rawText)

    // Parse — aceita {"indices":[...]} ou {"sugestoes":[...]}
    const clean  = rawText.replace(/```json?|```/g, '').trim()
    const parsed = JSON.parse(clean)

    let sugestoes = []

    if (Array.isArray(parsed.indices)) {
      // Converte índices de volta para nomes (1-based)
      sugestoes = parsed.indices
        .filter(i => typeof i === 'number' && i >= 1 && i <= categoryNames.length)
        .map(i => categoryNames[i - 1])
    } else if (Array.isArray(parsed.sugestoes)) {
      sugestoes = parsed.sugestoes
    }

    console.log('[ai-suggest] Sugestoes:', sugestoes)

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ sugestoes })
    }
  } catch (err) {
    console.error('[ai-suggest] Erro:', err.message)
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ sugestoes: [], error: err.message })
    }
  }
}
