// lib/ai_review — Rota B: pré-análise por IA de um documento enviado pelo
// fornecedor (SPEC_ROTA_B.md). A IA sugere aprovar/reprovar/revisar com uma
// checklist e evidências; quem decide é o analista.
//
// LGPD (premissas aprovadas em 28/09): PDF com camada de texto vai como TEXTO
// com CPF/RG mascarados; PDF escaneado/imagem vai como arquivo (não há como
// mascarar). Documentos de pessoa física e de saúde NÃO passam por aqui.
const _sdk = require('@anthropic-ai/sdk')
const Anthropic = _sdk.default || _sdk
const { zodOutputFormat } = require('@anthropic-ai/sdk/helpers/zod')
const { z } = require('zod')

const MODEL = process.env.ROUTE_B_MODEL || 'claude-sonnet-5'
// US$ por milhão de tokens (tabela da API, 06/2026) e câmbio de referência
const PRICE = { 'claude-sonnet-5': { in: 2, out: 10 }, 'claude-opus-5': { in: 5, out: 25 }, 'claude-haiku-4-5': { in: 1, out: 5 } }
const USD_BRL = Number(process.env.USD_BRL || 5.5)

const ReviewSchema = z.object({
  documento_solicitado: z.boolean().describe('O arquivo é o tipo de documento pedido?'),
  documento_identificado: z.string().describe('Que documento é, na verdade (ex.: "Alvará de Funcionamento", "Cartão CNPJ").'),
  cnpj_encontrado: z.string().nullable(),
  cnpj_confere: z.boolean().nullable().describe('CNPJ do documento igual ao do fornecedor; null se o documento não traz CNPJ.'),
  razao_social_confere: z.boolean().nullable(),
  data_emissao: z.string().nullable().describe('AAAA-MM-DD'),
  data_validade: z.string().nullable().describe('AAAA-MM-DD; null se não houver'),
  vencido_na_data_de_referencia: z.boolean().nullable(),
  legivel: z.boolean(),
  checklist: z.array(z.object({
    item: z.string().describe('Critério da regra do cliente'),
    atende: z.boolean().nullable().describe('null = não foi possível verificar'),
    evidencia: z.string().nullable().describe('Trecho curto do documento que justifica'),
    pagina: z.number().nullable(),
  })),
  veredito: z.enum(['aprovar', 'reprovar', 'revisar']),
  motivo_codigo: z.string().nullable().describe('Código da lista de motivos quando reprovar; null ao aprovar'),
  motivo_texto: z.string().describe('Uma frase para o analista'),
  confianca: z.number().describe('0 a 1'),
})

function systemPrompt(motivos) {
  return `Você é analista de homologação de fornecedores da EQPI. Sua tarefa é fazer a PRÉ-ANÁLISE de um documento enviado por um fornecedor, aplicando a regra do cliente para aquele tipo de documento. Um analista humano sempre confere sua conclusão.

Como decidir:
- "reprovar" quando há falha objetiva: não é o documento solicitado; CNPJ ou razão social de outra empresa; vencido na data de referência; falta um item obrigatório da regra.
- "aprovar" somente quando o documento é o solicitado, pertence ao fornecedor, está válido na data de referência e atende a todos os itens obrigatórios da regra.
- "revisar" quando algo depende de julgamento ou não pode ser verificado (documento parcialmente ilegível, regra com exceção que exige conferência externa, dúvida real).
- Nunca aprove se "documento_solicitado" for falso. Falha de leitura sozinha não é motivo para reprovar: use "revisar".
- Julgue a validade pela DATA DE REFERÊNCIA informada, não pela data de hoje.
- Na checklist, um item por critério da regra, com uma evidência curta do próprio documento.
- CPF e RG podem aparecer mascarados; isso é intencional e não é defeito do documento.

Ao reprovar, use em "motivo_codigo" o código mais adequado desta lista:
${motivos.map((m) => `${m.code} — ${m.label}`).join('\n')}`
}

// CPF e RG → mascarados (só na camada de texto)
function mascararPII(texto) {
  return String(texto)
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '***.***.***-**')
    .replace(/\b(RG|R\.G\.|C\.I\.|identidade)(\s*(n[ºo°.]*)?\s*[:\-]?\s*)([\dXx][\dXx.\-\/ ]{4,14}[\dXx])/gi, '$1$2[RG mascarado]')
}

// Conteúdo do documento: texto mascarado quando o PDF tem texto; senão o arquivo
function blocoDocumento(arquivo) {
  if (arquivo.modo === 'texto')
    return { type: 'text', text: `CONTEÚDO DO DOCUMENTO (texto extraído do PDF, dados pessoais mascarados):\n\n${arquivo.texto}` }
  if (arquivo.modo === 'pdf')
    return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: arquivo.b64 } }
  return { type: 'image', source: { type: 'base64', media_type: arquivo.mime, data: arquivo.b64 } }
}

async function revisar({ client, motivos, tipoNome, regra, fornecedor, dataReferencia, arquivo, model = MODEL }) {
  client = client || new Anthropic()
  const contexto = `Tipo de documento solicitado: ${tipoNome}

Regra do cliente para este documento:
${regra}

Fornecedor (dados do cadastro): CNPJ ${fornecedor.cnpj} · razão social ${fornecedor.razao_social}${fornecedor.municipio ? ` · município ${fornecedor.municipio}` : ''}
Categorias de atuação no processo: ${(fornecedor.categorias || []).join('; ') || 'não informadas'}
Data de referência da análise: ${dataReferencia}`
  const t0 = Date.now()
  const resp = await client.messages.parse({
    model,
    max_tokens: 16000,
    system: [{ type: 'text', text: systemPrompt(motivos), cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: [blocoDocumento(arquivo), { type: 'text', text: contexto }] }],
    output_config: { format: zodOutputFormat(ReviewSchema) },
  })
  const u = resp.usage || {}
  const p = PRICE[model] || PRICE['claude-sonnet-5']
  const usd = ((u.input_tokens || 0) + 1.25 * (u.cache_creation_input_tokens || 0) + 0.1 * (u.cache_read_input_tokens || 0)) / 1e6 * p.in
            + (u.output_tokens || 0) / 1e6 * p.out
  return {
    resultado: resp.parsed_output,
    stop_reason: resp.stop_reason,
    usage: u,
    custo_brl: Math.round(usd * USD_BRL * 10000) / 10000,
    ms: Date.now() - t0,
    model,
  }
}

module.exports = { Anthropic, ReviewSchema, systemPrompt, mascararPII, blocoDocumento, revisar, MODEL }
