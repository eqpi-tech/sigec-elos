// netlify/functions/ai-extract-document.js
// POST { storagePath, extractType: 'bank' | 'dre', supplierId }
// Baixa o documento do Storage, envia ao Claude Haiku e retorna JSON com dados extraídos
// Usado pelo backoffice para pré-preencher formulários de dados bancários e DRE

const { createClient } = require('@supabase/supabase-js')

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const PROMPTS = {
  bank: `Você é um assistente de análise de documentos financeiros. Analise este comprovante de conta bancária e extraia os seguintes dados em JSON.

Retorne APENAS um objeto JSON válido, sem markdown, sem explicações:
{
  "bank_name": "nome do banco por extenso",
  "bank_code": "código COMPE de 3 dígitos (ex: 001, 033, 341)",
  "bank_agency": "número da agência sem dígito verificador",
  "bank_account": "número da conta com dígito verificador",
  "account_type": "corrente ou poupanca",
  "pix_key": "chave PIX se encontrada (CNPJ, e-mail, telefone ou chave aleatória), null se não encontrado"
}

Se algum campo não estiver presente no documento, use null.`,

  dre: `Você é um assistente de análise de documentos contábeis. Analise este DRE (Demonstração de Resultado do Exercício) ou Balanço Patrimonial e extraia os dados em JSON.

Retorne APENAS um objeto JSON válido, sem markdown, sem explicações. Valores devem ser números (sem pontos de milhar, use ponto decimal):
{
  "year": 2024,
  "receita": 1500000.00,
  "ativo": 800000.00,
  "passivo": 300000.00,
  "lucro": 250000.00,
  "ebitda": 320000.00,
  "estoque": 150000.00
}

- year: ano de referência do exercício (inteiro)
- receita: Receita Bruta ou Receita Líquida de Vendas
- ativo: Total do Ativo
- passivo: Total do Passivo
- lucro: Lucro Líquido do Exercício
- ebitda: EBITDA/LAJIDA (se não informado explicitamente, calcule como Lucro + Depreciação + Amortização + IR/CS + Resultado Financeiro)
- estoque: valor dos Estoques

Se algum campo não estiver presente, use null.`,
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: HEADERS, body: '' }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) }

  // Validar sessão
  const authHeader = event.headers.authorization || event.headers.Authorization || ''
  const token = authHeader.replace('Bearer ', '')
  if (!token) return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: 'Não autorizado' }) }

  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token)
  if (authErr || !user) return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: 'Token inválido' }) }

  // Verificar role ADMIN
  const { data: roleData } = await supabaseAdmin
    .from('user_roles').select('role').eq('user_id', user.id).eq('role', 'ADMIN').maybeSingle()
  if (!roleData) return { statusCode: 403, headers: HEADERS, body: JSON.stringify({ error: 'Acesso restrito ao backoffice' }) }

  let body
  try { body = JSON.parse(event.body) } catch { return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Body inválido' }) } }

  const { storagePath, extractType } = body
  if (!storagePath || !extractType) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'storagePath e extractType são obrigatórios' }) }
  if (!PROMPTS[extractType]) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'extractType deve ser "bank" ou "dre"' }) }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY não configurada' }) }

  // Baixar arquivo do Storage
  const { data: fileData, error: dlErr } = await supabaseAdmin.storage
    .from('documents')
    .download(storagePath)
  if (dlErr || !fileData) {
    console.error('[ai-extract] download error:', dlErr)
    return { statusCode: 404, headers: HEADERS, body: JSON.stringify({ error: 'Arquivo não encontrado no Storage' }) }
  }

  // Converter para base64
  const arrayBuffer = await fileData.arrayBuffer()
  const base64      = Buffer.from(arrayBuffer).toString('base64')

  // Determinar media_type
  const ext = storagePath.split('.').pop()?.toLowerCase()
  const mediaTypeMap = { pdf:'application/pdf', png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', webp:'image/webp' }
  const mediaType = mediaTypeMap[ext] || 'application/pdf'
  const isPdf     = mediaType === 'application/pdf'

  // Montar mensagem para Claude
  const contentBlock = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: mediaType, data: base64 } }
    : { type: 'image',    source: { type: 'base64', media_type: mediaType, data: base64 } }

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'pdfs-2024-09-25',  // necessário para suporte a PDF
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        messages: [{
          role: 'user',
          content: [
            contentBlock,
            { type: 'text', text: PROMPTS[extractType] },
          ],
        }],
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('[ai-extract] API error', res.status, errText.slice(0, 500))
      return { statusCode: 502, headers: HEADERS, body: JSON.stringify({ error: `Erro na API de IA: ${res.status}` }) }
    }

    const data    = await res.json()
    const rawText = data.content?.[0]?.text || '{}'
    console.log('[ai-extract] extractType:', extractType, '| raw:', rawText.slice(0, 300))

    const clean  = rawText.replace(/```json?|```/g, '').trim()
    const parsed = JSON.parse(clean)

    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ extracted: parsed }) }
  } catch (e) {
    console.error('[ai-extract] error:', e.message)
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: 'Erro ao processar documento com IA: ' + e.message }) }
  }
}
