// lib/route_a.js — Rota A da homologação automática (SPEC_HOMOLOGACAO_AUTOMATICA.md)
// Tipo de documento → conector oficial (reaproveitado do BC Report) + regra do
// cliente. Nada aqui aprova ou reprova: o resultado vira SUGESTÃO para o
// analista, e o documento entra PENDING com o comprovante oficial.
// Ligado só com ROUTE_A_ENABLED=true (staging); em produção fica inerte.

const registry = require('./connectors/index.js')
const { requiredDocsForSeal } = require('./required_docs.js')

// validade: 'fonte' = a data que a própria certidão informa; {anos|meses} =
// contada da coleta (regra do cliente); null = sem regra do cliente — o
// analista define a data (premissa 10 da spec)
const ROUTE_A = {
  '37':    { connector: 'cartao_cnpj',      validade: { anos: 1 } },
  '62':    { connector: 'simples',          validade: { anos: 1 } },
  '10001': { connector: 'sintegra',         validade: { anos: 1 } },
  '42':    { connector: 'pgfn_cnd',         validade: 'fonte', positivaEfeitoNegativa: true },
  '7':     { connector: 'fgts_crf',         validade: 'fonte' },
  '8':     { connector: 'cndt',             validade: 'fonte', positivaEfeitoNegativa: true },
  '16':    { connector: 'sefaz_cnd',        validade: 'fonte', positivaEfeitoNegativa: true },
  // dívida ativa estadual (Medicina N2): a CND da Sefaz cobre débitos inscritos em
  // dívida ativa na maioria das UFs — confirmado com o Luiz em 28/09
  '10039': { connector: 'sefaz_cnd',        validade: 'fonte', positivaEfeitoNegativa: true },
  '6':     { connector: 'pref_cnd',         validade: null },
  '10040': { connector: 'pref_cnd',         validade: null },
  '10038': { connector: 'pgfn_devedores',   validade: null },
  '10002': { connector: 'trabalho_escravo', validade: { meses: 6 } },
  '150':   { connector: 'falencia_rj',      validade: null },
  // fase 1b (28/09): validade da própria certidão (~3 meses)
  '18':    { connector: 'ibama_cr',         validade: 'fonte' },
  // alvará da PF (segurança privada) — validade do próprio alvará
  '166':   { connector: 'pf_seguranca',     validade: 'fonte' },
}

const { env } = require('./runtime_env.js')
const enabled = () => env('ROUTE_A_ENABLED') === 'true'
const MAX_ATTEMPTS = 3
const RETRY_MIN = 15
// fonte pausada pela Infosimples (615) costuma voltar em horas: 6 tentativas
// com espera crescente (15, 30, 60, 120, 240 min ≈ 8 h) antes de pedir o arquivo
const MAX_ATTEMPTS_PAUSADA = 6
const esperaMin = (tentativa) => RETRY_MIN * 2 ** Math.max(0, tentativa - 1)

// datas das fontes vêm como dd/mm/aaaa (às vezes com hora) ou ISO
function parseData(v) {
  if (!v) return null
  const s = String(v).trim()
  let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]))
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  return null
}

function somar(base, { anos = 0, meses = 0 }) {
  const d = new Date(base)
  d.setUTCFullYear(d.getUTCFullYear() + anos)
  d.setUTCMonth(d.getUTCMonth() + meses)
  return d
}

// Resultado da fonte → sugestão para o analista, validade e dados de prova
function avaliar(docType, raw, parsed, agora = new Date()) {
  const cfg = ROUTE_A[docType]
  const flag = parsed?.result_flag
  const d0 = (Array.isArray(raw?.data) && raw.data[0]) || {}
  const erroFonte = (raw?.errors || [])[0] || raw?.codeMessage || ''

  // a fonte respondeu, mas NÃO emitiu a certidão (pendência do fornecedor):
  // não adianta tentar de novo — o fornecedor precisa regularizar ou enviar
  // a certidão que conseguir (ex.: positiva com efeito de negativa)
  if (parsed?.nao_emitida || d0.conseguiu_emitir_certidao_negativa === false) {
    return { indisponivel: true, permanente: true, fornecedor: true,
             motivo: `A fonte não emitiu a certidão: ${String(d0.mensagem || parsed?.headline || '').slice(0, 220)}` }
  }
  // 611 dados insuficientes p/ emitir pela internet · 620 erro permanente da
  // fonte (ex.: impedimentos na Caixa): a mensagem da fonte interessa ao fornecedor
  if (raw?.code === 611 || raw?.code === 620) {
    return { indisponivel: true, permanente: true, fornecedor: true, motivo: `A fonte informou: ${String(erroFonte).slice(0, 240)}` }
  }
  // 602 praça sem serviço · 606 a fonte exige dado que não coletamos (ex.:
  // inscrição municipal no Rio): permanente, mensagem técnica fica p/ a equipe
  if (raw?.code === 602 || raw?.code === 606) {
    return { indisponivel: true, permanente: true, fornecedor: false,
             motivo: `Consulta automática indisponível para esta praça (${raw.code}: ${String(erroFonte).slice(0, 160)})` }
  }
  if (flag === 'indisponivel') {
    const motivo = raw?.code === 615 ? `${parsed?.headline || 'fonte indisponível'} (consulta pausada pela Infosimples — instabilidade na fonte)` : (parsed?.headline || 'fonte indisponível')
    // praça fora da cobertura / fonte que exige certificado digital: não muda com retry
    const permanente = /n[aã]o coberta|fora da cobertura|emiss[aã]o indispon[ií]vel pela fonte|desconhecida|n[aã]o configurada/i.test(motivo)
    return { indisponivel: true, permanente, pausada: raw?.code === 615, motivo }
  }

  const d = (Array.isArray(raw?.data) && raw.data[0]) || {}
  // só o veredito do conector e os campos de TIPO/SITUAÇÃO da certidão — nunca
  // mensagens livres, que citam "positiva com efeito de negativa" como instrução
  const texto = [parsed?.headline || '', ...Object.entries(d)
    .filter(([k, v]) => typeof v === 'string' && /tipo|situa|conclus|resultado|^certidao$/i.test(k))
    .map(([, v]) => v)].join(' ')
  let sugestao = 'revisar', motivo = parsed?.headline || ''
  if (flag === 'nada_consta') sugestao = 'aprovar'
  else if (flag === 'apontamento') sugestao = 'reprovar'
  else if (flag === 'verificar' && cfg.positivaEfeitoNegativa && !parsed?.nao_emitida
           && /positiva com efeitos? de negativa/i.test(texto)) {
    sugestao = 'aprovar'                       // regra do cliente: aceita positiva c/ efeito de negativa
    motivo = `${motivo} — aceita pela regra do cliente`
  }

  const emissao = parseData(d.emissao_data || d.normalizado_emissao_data || d.expedicao || d.consulta_datahora || d.datahora)
  let validade = null
  if (cfg.validade === 'fonte') {
    validade = parseData(d.validade_fim_data || d.validade_data || d.normalizado_validade_data || d.normalizado_validade || d.validade)
    // qualquer outro campo de validade com data (cada Sefaz/prefeitura nomeia de um jeito)
    if (!validade) {
      for (const [k, v] of Object.entries(d)) {
        if (/valid/i.test(k) && typeof v === 'string' && (validade = parseData(v))) break
      }
    }
    // "validade de 6 (seis) meses / 90 dias contados da emissão"
    if (!validade) {
      const txt = Object.entries(d).filter(([k, v]) => /valid|mensagem|observ/i.test(k) && typeof v === 'string').map(([, v]) => v).join(' ')
      const m = txt.match(/(\d{1,3})\s*(?:\([^)]*\))?\s*(dias|meses)/i)
      if (m) {
        const base = emissao || agora
        validade = /dia/i.test(m[2]) ? new Date(base.getTime() + (+m[1]) * 864e5) : somar(base, { meses: +m[1] })
      }
    }
  } else if (cfg.validade) {
    validade = somar(agora, cfg.validade)
  }

  return {
    indisponivel: false,
    sugestao, motivo, validade,
    emissao,
    codigo: parsed?.protocol || d.certidao_codigo || null,
    comprovante: (parsed?.evidence || []).find((e) => e.url)?.url || null,
    resultado: flag,
    dados: resumoDados(d),
  }
}

// o que a fonte devolveu, para auditoria e para o analista (sem links de
// comprovante, que expiram, e limitado em tamanho)
function resumoDados(d) {
  const out = {}
  for (const [k, v] of Object.entries(d || {})) {
    if (/receipt|comprovante_url|html|pdf_base64/i.test(k) || v === '' || v == null) continue
    out[k] = typeof v === 'string' ? v.slice(0, 500) : v
  }
  const s = JSON.stringify(out)
  return s.length > 8000 ? JSON.parse(JSON.stringify(out, (k, v) => (typeof v === 'object' && v && k) ? '[…]' : v)) : out
}

// Infosimples só cobra quando a fonte devolve dado (código 200)
function custo(c, raw) {
  if (typeof c.costOf === 'function') return c.costOf(raw)
  if (c.route === 'infosimples') return raw?.code === 200 ? (c.costBase || 0) + (c.costExtra || 0) : 0
  return 0
}

// Enfileira a coleta para os processos abertos do ELOS de um fornecedor.
// Chamado ao fim do cadastro. Processos do HOC nunca entram (CLAUDE.md §7.2).
async function enqueueRouteA(sb, supplierId) {
  if (!enabled()) return 0
  const { data: seals } = await sb.from('seals')
    .select('id, client_id, flow_id, status, hoc_process_id')
    .eq('supplier_id', supplierId).eq('status', 'PENDING').is('hoc_process_id', null)
  let n = 0
  for (const seal of seals || []) {
    const exigidos = (await requiredDocsForSeal(sb, supplierId, seal)).map(String)
    const tipos = exigidos.filter((t) => ROUTE_A[t])
    if (!tipos.length) continue
    const { data: ins } = await sb.from('auto_collect_jobs')
      .upsert(tipos.map((doc_type) => ({ supplier_id: supplierId, seal_id: seal.id, doc_type })),
        { onConflict: 'seal_id,doc_type', ignoreDuplicates: true })
      .select('id')
    n += (ins || []).length
  }
  return n
}

function connectorFor(docType) {
  const cfg = ROUTE_A[docType]
  return cfg ? registry[cfg.connector] : null
}

module.exports = { ROUTE_A, enabled, avaliar, custo, enqueueRouteA, connectorFor, parseData, MAX_ATTEMPTS, MAX_ATTEMPTS_PAUSADA, RETRY_MIN, esperaMin }
