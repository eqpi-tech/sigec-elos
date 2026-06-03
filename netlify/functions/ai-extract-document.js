// netlify/functions/ai-extract-document.js
// POST { storagePath, extractType: 'bank' | 'dre', supplierId }
// Baixa o documento do Storage, envia ao Claude Sonnet e retorna JSON com dados extraídos

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
  bank: `Você é um especialista em leitura de documentos financeiros brasileiros.

Analise a imagem/documento e extraia os dados bancários. Campos típicos em comprovantes brasileiros:
- Nome do banco (ex: "Banco do Brasil", "Bradesco", "Itaú", "Nubank", "Caixa", "Santander")
- Código COMPE (ex: 001 = BB, 033 = Santander, 104 = Caixa, 237 = Bradesco, 260 = Nu, 341 = Itaú)
- Número da agência (4 dígitos, sem dígito verificador)
- Número da conta (com dígito verificador, separado por hífen)
- Tipo de conta (corrente ou poupança/poupanca)
- Chave PIX (CNPJ, e-mail, telefone ou UUID aleatório), se presente

Retorne SOMENTE este JSON (sem markdown, sem explicação):
{
  "bank_name": "...",
  "bank_code": "...",
  "bank_agency": "...",
  "bank_account": "...",
  "account_type": "corrente ou poupanca",
  "pix_key": "... ou null"
}

Se um campo não estiver visível no documento, use null.`,

  dre: `Você é um especialista em contabilidade e análise de demonstrações financeiras brasileiras.

Analise o DRE (Demonstração de Resultado do Exercício) ou Balanço Patrimonial e extraia os valores.
Procure por: Receita Bruta/Líquida, Ativo Total, Passivo Total, Lucro Líquido, EBITDA/LAJIDA, Estoques.
O ano geralmente aparece no cabeçalho do documento.

Retorne SOMENTE este JSON (sem markdown, sem explicação). Valores numéricos sem pontos de milhar, usando ponto decimal:
{
  "year": 2024,
  "receita": 0.00,
  "ativo": 0.00,
  "passivo": 0.00,
  "lucro": 0.00,
  "ebitda": 0.00,
  "estoque": 0.00
}

Se um campo não estiver visível no documento, use null.`,
}

// Tenta extrair JSON de uma string que pode ter texto ao redor
function extractJson(text) {
  if (!text) return null
  // Tenta parse direto primeiro
  try { return JSON.parse(text) } catch {}
  // Remove markdown code blocks
  const clean = text.replace(/```json?\s*/gi, '').replace(/```/g, '').trim()
  try { return JSON.parse(clean) } catch {}
  // Tenta encontrar o primeiro { ... } válido
  const start = text.indexOf('{')
  const end   = text.lastIndexOf('}')
  if (start !== -1 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)) } catch {}
  }
  return null
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
  if (!apiKey) return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY não configurada no Netlify' }) }

  // Baixar arquivo do Storage
  const { data: fileData, error: dlErr } = await supabaseAdmin.storage
    .from('documents')
    .download(storagePath)

  if (dlErr || !fileData) {
    console.error('[ai-extract] download error:', dlErr?.message, '| path:', storagePath)
    return { statusCode: 404, headers: HEADERS, body: JSON.stringify({ error: 'Arquivo não encontrado no Storage: ' + (dlErr?.message || 'sem dados') }) }
  }

  // Converter para base64
  const arrayBuffer = await fileData.arrayBuffer()
  const bytes       = new Uint8Array(arrayBuffer)
  const base64      = Buffer.from(bytes).toString('base64')

  console.log('[ai-extract] arquivo baixado:', storagePath, '| tamanho bytes:', bytes.length, '| base64 len:', base64.length)

  if (bytes.length === 0) {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Arquivo vazio no Storage — faça upload novamente.' }) }
  }

  // Determinar media_type pela extensão
  const ext = storagePath.split('.').pop()?.toLowerCase().split('?')[0] // remove query string se houver
  const mediaTypeMap = {
    pdf:  'application/pdf',
    png:  'image/png',
    jpg:  'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif:  'image/gif',
  }
  const mediaType = mediaTypeMap[ext] || 'image/jpeg'
  const isPdf     = mediaType === 'application/pdf'

  console.log('[ai-extract] ext:', ext, '| mediaType:', mediaType)

  // Montar o content block conforme o tipo de arquivo
  // PDFs usam o tipo 'document' com o beta header; imagens usam 'image'
  const contentBlock = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
    : { type: 'image',    source: { type: 'base64', media_type: mediaType,          data: base64 } }

  // Headers da API — inclui beta de PDF apenas quando necessário
  const apiHeaders = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    ...(isPdf ? { 'anthropic-beta': 'pdfs-2024-09-25' } : {}),
  }

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: apiHeaders,
      body: JSON.stringify({
        // Sonnet é significativamente melhor que Haiku para leitura de documentos
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            contentBlock,
            { type: 'text', text: PROMPTS[extractType] },
          ],
        }],
      }),
    })

    const responseText = await res.text()
    console.log('[ai-extract] HTTP status:', res.status, '| response:', responseText.slice(0, 600))

    if (!res.ok) {
      return {
        statusCode: 502,
        headers: HEADERS,
        body: JSON.stringify({ error: `Erro na API Claude (${res.status}): ${responseText.slice(0, 200)}` }),
      }
    }

    const data    = JSON.parse(responseText)
    const rawText = data.content?.[0]?.text || ''
    console.log('[ai-extract] modelo retornou:', rawText)

    const parsed = extractJson(rawText)

    if (!parsed) {
      // Modelo retornou texto mas não JSON — devolver o texto bruto para diagnóstico
      return {
        statusCode: 200,
        headers: HEADERS,
        body: JSON.stringify({
          extracted: null,
          rawText,
          warning: 'O modelo não retornou JSON válido. Verifique o documento.',
        }),
      }
    }

    // Verificar se todos os campos são nulos (modelo não conseguiu ler o documento)
    const values     = Object.values(parsed)
    const hasData    = values.some(v => v !== null && v !== undefined && v !== '')
    if (!hasData) {
      return {
        statusCode: 200,
        headers: HEADERS,
        body: JSON.stringify({
          extracted: parsed,
          rawText,
          warning: 'Nenhum dado foi extraído. Verifique se o documento está legível e tente com uma imagem mais nítida.',
        }),
      }
    }

    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ extracted: parsed }) }

  } catch (e) {
    console.error('[ai-extract] exception:', e.message)
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: 'Erro interno: ' + e.message }) }
  }
}
