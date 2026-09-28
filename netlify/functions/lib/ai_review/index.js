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
// v2 (28/09, após o piloto): validade da regra ≠ idade do documento; tipo de
// empresa do cadastro; compatibilidade de atividade só "claramente"; exceção
// da regra (outro documento aceito) → revisar
// v3 (28/09, integração ao sistema): a checagem de tipo de empresa vale só
// para o ato constitutivo (contrato social/estatuto) — no piloto ela foi
// aplicada indevidamente a uma Licença de Operação
const PROMPT_VERSION = 'v3'
// tipos cujo documento É o ato constitutivo (natureza jurídica verificável)
const TIPOS_ATO_CONSTITUTIVO = new Set(['39'])
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

function systemPrompt(motivos, { checarTipoEmpresa = false } = {}) {
  return `Você é analista de homologação de fornecedores da EQPI. Sua tarefa é fazer a PRÉ-ANÁLISE de um documento enviado por um fornecedor, aplicando a regra do cliente para aquele tipo de documento. Um analista humano sempre confere sua conclusão.

Como decidir:
- "reprovar" quando há falha objetiva: não é o documento solicitado; CNPJ ou razão social de outra empresa; vencido na data de referência; falta um item obrigatório da regra.
- "aprovar" somente quando o documento é o solicitado, pertence ao fornecedor, está válido na data de referência e atende a todos os itens obrigatórios da regra.
- "revisar" quando algo depende de julgamento ou não pode ser verificado (documento parcialmente ilegível, regra com exceção que exige conferência externa, dúvida real).
- Nunca aprove se "documento_solicitado" for falso. Falha de leitura sozinha não é motivo para reprovar: use "revisar".
- Julgue a validade pela DATA DE REFERÊNCIA informada, não pela data de hoje.

Validade (leia com atenção):
- A linha "VALIDADE:" da regra diz qual vencimento o analista vai REGISTRAR depois de aprovar (ex.: "1 ano da data de análise" = o sistema considera o documento válido por 1 ano a partir da análise). Isso NÃO é uma idade máxima do documento: um contrato social registrado há 3 anos continua aceitável.
- O documento só está vencido se ele PRÓPRIO trouxer uma validade já expirada na data de referência, ou se a regra fixar expressamente um prazo máximo desde a emissão (ex.: "emitido há no máximo 90 dias"). Alvará "de exercício" vale até o fim do ano de exercício.

${checarTipoEmpresa ? `Tipo de empresa: compare a natureza do documento com o tipo de empresa do CADASTRO (ex.: estatuto/ata de S.A. para empresa cadastrada como LTDA, ou o contrário). Divergência de tipo de empresa é motivo para reprovar.

` : ''}Atividade × categorias: só conclua que a atividade licenciada/autorizada atende quando a relação com as categorias do processo for CLARA. Se a compatibilidade depender de interpretação, use "revisar" (não aprove nem reprove por inferência).

Documento diferente aceito por exceção: se o arquivo não é o documento principal pedido, mas pode ser aceito por uma exceção da regra (ex.: dispensa, autorização de outro órgão, decreto), use "revisar" e cite no motivo qual item da regra permitiria aceitá-lo.
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

// Esforço de raciocínio (28/09): o Sonnet 5 raciocina por padrão quando nada
// é configurado — no piloto, 2/3 da saída cobrada era raciocínio (o JSON tem
// ~600 tokens; a saída média foi ~2.800). 'low' corta esse custo; a regra do
// cliente já traz o critério, a tarefa é conferir, não deduzir.
const EFFORT = process.env.ROUTE_B_EFFORT || 'low'
const FORMATO = zodOutputFormat(ReviewSchema)

// Monta a requisição (a mesma para chamada direta e para o modo lote).
// Cache: 1º bloco = instruções + motivos (iguais para todos os tipos);
// 2º bloco = tipo + regra do cliente (iguais para todos os arquivos do tipo).
// Só o documento e os dados do fornecedor mudam a cada arquivo.
function montarRequisicao({ motivos, tipo, tipoNome, regra, fornecedor, dataReferencia, arquivo, model = MODEL, effort = EFFORT }) {
  // sem o tipo (eval antigo), mantém o comportamento do v2
  const checarTipoEmpresa = tipo == null || TIPOS_ATO_CONSTITUTIVO.has(String(tipo))
  const regraTipo = `Tipo de documento solicitado: ${tipoNome}

Regra do cliente para este documento:
${regra}`
  const contexto = `Fornecedor (dados do cadastro): CNPJ ${fornecedor.cnpj} · razão social ${fornecedor.razao_social}${fornecedor.municipio ? ` · município ${fornecedor.municipio}` : ''}${checarTipoEmpresa && fornecedor.tipo_empresa ? ` · tipo de empresa ${fornecedor.tipo_empresa}` : ''}${fornecedor.regime_tributario ? ` · regime tributário ${fornecedor.regime_tributario}` : ''}
Categorias de atuação no processo: ${(fornecedor.categorias || []).join('; ') || 'não informadas'}
Data de referência da análise: ${dataReferencia}`
  return {
    model,
    max_tokens: 16000,
    system: [
      { type: 'text', text: systemPrompt(motivos, { checarTipoEmpresa }), cache_control: { type: 'ephemeral' } },
      { type: 'text', text: regraTipo, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: [blocoDocumento(arquivo), { type: 'text', text: contexto }] }],
    output_config: { format: { type: FORMATO.type, schema: FORMATO.schema }, ...(effort ? { effort } : {}) },
  }
}

// Custo em R$ a partir do uso informado pela API (lote = 50% do preço)
function custoBRL(usage, model = MODEL, { lote = false } = {}) {
  const u = usage || {}
  const p = PRICE[model] || PRICE['claude-sonnet-5']
  const usd = ((u.input_tokens || 0) + 1.25 * (u.cache_creation_input_tokens || 0) + 0.1 * (u.cache_read_input_tokens || 0)) / 1e6 * p.in
            + (u.output_tokens || 0) / 1e6 * p.out
  return Math.round(usd * (lote ? 0.5 : 1) * USD_BRL * 10000) / 10000
}

// Lê a resposta (direta ou do lote): o bloco de texto é o JSON do formato pedido
function lerResposta(message, { lote = false } = {}) {
  const texto = (message.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('')
  let resultado = null
  if (message.stop_reason !== 'max_tokens' && message.stop_reason !== 'refusal') {
    try {
      const r = ReviewSchema.safeParse(JSON.parse(texto))
      if (r.success) resultado = r.data
    } catch { /* JSON inválido: sem sugestão */ }
  }
  return {
    resultado,
    stop_reason: message.stop_reason,
    usage: message.usage,
    custo_brl: custoBRL(message.usage, message.model || MODEL, { lote }),
    model: message.model || MODEL,
    prompt_version: PROMPT_VERSION,
    effort: EFFORT,
  }
}

// Chamada direta (eval local e modo síncrono do processador)
async function revisar({ client, ...args }) {
  client = client || new Anthropic()
  const t0 = Date.now()
  const resp = await client.messages.create(montarRequisicao(args))
  return { ...lerResposta(resp), ms: Date.now() - t0 }
}

// Prepara o arquivo para a IA dentro da function (sem pdftotext): PDF com
// camada de texto → texto com CPF/RG mascarados; PDF escaneado → o próprio
// PDF; imagem → imagem. Mesmos limiares do piloto (scripts/eval_rota_b.cjs).
function sniff(buf) {
  if (buf.slice(0, 4).toString('latin1') === '%PDF') return 'pdf'
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg'
  if (buf[0] === 0x89 && buf.slice(1, 4).toString('latin1') === 'PNG') return 'image/png'
  if (buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') return 'image/webp'
  return null
}
const MAX_PDF_BYTES = 20e6      // base64 cresce ~33%; a requisição tem teto de 32 MB
const MAX_IMG_BYTES = 5e6       // limite da API para imagem
const MAX_PAGINAS = 100

async function prepararArquivo(buf) {
  const t = sniff(buf)
  if (!t) return { modo: 'pular', motivo: 'formato não suportado (envie PDF, JPG ou PNG)' }
  if (t !== 'pdf') {
    if (buf.length > MAX_IMG_BYTES) return { modo: 'pular', motivo: 'imagem grande demais para a pré-análise' }
    return { modo: 'imagem', mime: t, b64: buf.toString('base64'), paginas: 1 }
  }
  let texto = '', paginas = 1
  try {
    const { extractText, getDocumentProxy } = await import('unpdf')
    const pdf = await getDocumentProxy(new Uint8Array(buf))
    const r = await extractText(pdf, { mergePages: false })
    paginas = r.totalPages || 1
    texto = r.text.map((p, i) => `--- página ${i + 1} ---\n${p}`).join('\n\n')
  } catch { /* PDF sem camada de texto ou protegido: segue como arquivo */ }
  if (paginas > MAX_PAGINAS) return { modo: 'pular', motivo: `PDF com ${paginas} páginas (máx. ${MAX_PAGINAS})`, paginas }
  const util = texto.replace(/---\s*página\s*\d+\s*---/g, '').replace(/\s+/g, '').length
  if (util >= 250 * paginas * 0.5 && util > 300) return { modo: 'texto', texto: mascararPII(texto), paginas }
  if (buf.length > MAX_PDF_BYTES) return { modo: 'pular', motivo: 'PDF escaneado grande demais para a pré-análise', paginas }
  return { modo: 'pdf', b64: buf.toString('base64'), paginas }
}

module.exports = { Anthropic, PROMPT_VERSION, EFFORT, TIPOS_ATO_CONSTITUTIVO, ReviewSchema, systemPrompt, mascararPII, blocoDocumento, montarRequisicao, lerResposta, custoBRL, revisar, prepararArquivo, MODEL }
