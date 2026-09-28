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
  '6':     { connector: 'pref_cnd',         validade: null },
  '10040': { connector: 'pref_cnd',         validade: null },
  '10038': { connector: 'pgfn_devedores',   validade: null },
  '10002': { connector: 'trabalho_escravo', validade: { meses: 6 } },
  '150':   { connector: 'falencia_rj',      validade: null },
}

const enabled = () => process.env.ROUTE_A_ENABLED === 'true'
const MAX_ATTEMPTS = 3
const RETRY_MIN = 15

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
  if (flag === 'indisponivel') return { indisponivel: true, motivo: parsed?.headline || 'fonte indisponível' }

  const d = (Array.isArray(raw?.data) && raw.data[0]) || {}
  const texto = `${parsed?.headline || ''} ${JSON.stringify(d).slice(0, 4000)}`
  let sugestao = 'revisar', motivo = parsed?.headline || ''
  if (flag === 'nada_consta') sugestao = 'aprovar'
  else if (flag === 'apontamento') sugestao = 'reprovar'
  else if (flag === 'verificar' && cfg.positivaEfeitoNegativa
           && /positiva com efeitos? de negativa/i.test(texto)) {
    sugestao = 'aprovar'                       // regra do cliente: aceita positiva c/ efeito de negativa
    motivo = `${motivo} — aceita pela regra do cliente`
  }

  let validade = null
  if (cfg.validade === 'fonte') {
    validade = parseData(d.validade_fim_data || d.validade_data || d.normalizado_validade || d.validade)
  } else if (cfg.validade) {
    validade = somar(agora, cfg.validade)
  }

  return {
    indisponivel: false,
    sugestao, motivo, validade,
    emissao: parseData(d.emissao_data || d.expedicao || d.consulta_datahora || d.datahora),
    codigo: parsed?.protocol || d.certidao_codigo || null,
    comprovante: (parsed?.evidence || []).find((e) => e.url)?.url || null,
    resultado: flag,
  }
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

module.exports = { ROUTE_A, enabled, avaliar, custo, enqueueRouteA, connectorFor, parseData, MAX_ATTEMPTS, RETRY_MIN }
