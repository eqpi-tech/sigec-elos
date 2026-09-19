// Conector: Assertiva — Análise Restritiva PJ (rota C). Handoff §6/§7 e L1/L2.
// REFACTOR sem mudança de comportamento: o OAuth e a chamada score/v3 foram
// EXTRAÍDOS de netlify/functions/assertiva-report.js, que passa a consumir
// este módulo (casos 429/202 preservados lá).
//
// Cache em duas camadas (TTL 30d — L2):
//   1. assertiva_reports < 30d (relatórios já emitidos no fluxo do doc #578;
//      supplier_id NOT NULL → só cobre CNPJ que é fornecedor ELOS)
//   2. source_results (orquestrador) — cobre emissões avulsas por CNPJ
// cost_brl = 9.576 SÓ quando emite de fato (raw.emitted).

const { getAdminClient } = require('../bcdb.js')

const ASSERTIVA_BASE = 'https://api.assertivasolucoes.com.br'

function formatCnpj(raw) {
  const d = String(raw || '').replace(/\D/g, '')
  if (d.length !== 14) return raw
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`
}

async function getAssertivaToken() {
  const clientId = process.env.ASSERTIVA_CLIENT_ID
  const secret = process.env.ASSERTIVA_CLIENT_SECRET
  if (!clientId || !secret) throw new Error('Credenciais Assertiva não configuradas (ASSERTIVA_CLIENT_ID, ASSERTIVA_CLIENT_SECRET)')
  const credentials = Buffer.from(`${clientId}:${secret}`).toString('base64')
  const res = await fetch(`${ASSERTIVA_BASE}/oauth2/v3/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Assertiva auth falhou (${res.status}): ${text}`)
  }
  const data = await res.json()
  if (!data.access_token) throw new Error('Assertiva não retornou access_token')
  return data.access_token
}

// Chamada crua da Análise Restritiva PJ. Devolve { httpStatus, reportData }
// SEM decidir política de erro — quem chama trata 429/202 no seu contexto
// (a function devolve esses status ao front; o orquestrador mapeia p/ retry).
async function consultaRestritivaPJ(cnpj) {
  const token = await getAssertivaToken()
  const cnpjEncoded = encodeURIComponent(formatCnpj(cnpj))
  const res = await fetch(`${ASSERTIVA_BASE}/score/v3/pj/credito/${cnpjEncoded}?idFinalidade=2`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  })
  if (res.status === 429 || res.status === 202) return { httpStatus: res.status, reportData: null }
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Assertiva API error ${res.status}: ${errText.slice(0, 200)}`)
  }
  return { httpStatus: 200, reportData: await res.json() }
}

module.exports = {
  slug: 'assertiva_pj',
  route: 'assertiva',
  ttlDays: 30,
  inLight: true, inFull: true,
  costBase: 9.576, costExtra: 0,

  // exporta as peças p/ a function legada (refactor sem mudança de comportamento)
  getAssertivaToken,
  consultaRestritivaPJ,
  formatCnpj,

  async fetch({ cnpj, supplierId = null, forceRefresh = false, requestedBy = null }) {
    const sb = getAdminClient()

    // camada 1: relatório recente já emitido no fluxo do doc #578
    if (!forceRefresh) {
      const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
      const { data: recent } = await sb
        .from('assertiva_reports')
        .select('id, report_data, protocol, generated_at')
        .eq('cnpj', cnpj)
        .gte('generated_at', cutoff)
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (recent?.report_data) {
        return { emitted: false, reusedReportId: recent.id, generatedAt: recent.generated_at, reportData: recent.report_data }
      }
    }

    // emissão real (consome R$ 9,576)
    const { httpStatus, reportData } = await consultaRestritivaPJ(cnpj)
    if (httpStatus === 429) return { emitted: false, duplicated: true, reportData: null }
    if (httpStatus === 202) return { emitted: false, notFound: true, reportData: null }

    // grava em assertiva_reports como hoje — só quando o CNPJ é fornecedor
    // (supplier_id NOT NULL); avulso fica cacheado via source_results
    let savedId = null
    if (supplierId) {
      const { data: saved, error } = await sb
        .from('assertiva_reports')
        .insert({
          supplier_id: supplierId, cnpj, report_data: reportData,
          protocol: reportData?.cabecalho?.protocolo || null,
          score_classe: reportData?.resposta?.score?.classe || null,
          score_pontos: reportData?.resposta?.score?.pontos ?? null,
          generated_by: requestedBy,
        })
        .select('id').single()
      if (error) console.error('[assertiva_pj] save assertiva_reports:', error.message)
      savedId = saved?.id || null
    }
    return { emitted: true, savedReportId: savedId, generatedAt: new Date().toISOString(), reportData }
  },

  parse(raw) {
    if (raw?.duplicated) {
      return { result_flag: 'indisponivel', headline: 'Assertiva: consulta duplicada (aguardar 2 min)', details: {}, evidence: [], protocol: null }
    }
    if (raw?.notFound) {
      return { result_flag: 'verificar', headline: 'Assertiva: CNPJ não encontrado ou restrição LGPD', details: {}, evidence: [], protocol: null }
    }
    const resp = raw?.reportData?.resposta || {}
    const cab = raw?.reportData?.cabecalho || {}
    const score = resp.score || {}
    const protestos = resp.protestosPublicos || {}
    const acoes = resp.acoesJudiciais || resp.acaoJudicial || {}
    const cheques = resp.cheques || {}
    const debitos = resp.registroDebitos || resp.debitosVencidos || {}
    const consultas = resp.registroConsultas || resp.consultas || {}
    const faturamento = resp.faturamentoPJ || {}

    const qtdProt = protestos.qtdProtestos ?? protestos.quantidade ?? 0
    const qtdAcoes = acoes.qtd ?? acoes.quantidade ?? acoes.qtdAcoes ?? 0
    const qtdCheq = cheques.qtd ?? cheques.quantidade ?? 0
    const qtdDeb = debitos.qtd ?? debitos.quantidade ?? debitos.qtdDebitos ?? 0
    const classe = score.classe || null

    // heurística do quadro (o Score EQPI pondera de verdade na seção 8):
    // restrição objetiva = apontamento · classe D ou ações = verificar
    let result_flag = 'nada_consta'
    if (qtdProt > 0 || qtdCheq > 0 || qtdDeb > 0 || classe === 'E' || classe === 'F') result_flag = 'apontamento'
    else if (classe === 'D' || qtdAcoes > 0) result_flag = 'verificar'

    const partes = []
    if (classe) partes.push(`score ${classe} (${score.pontos ?? '-'}/1000)`)
    partes.push(qtdProt ? `${qtdProt} protesto(s)` : 'sem protestos')
    if (qtdAcoes) partes.push(`${qtdAcoes} ação(ões) judicial(is)`)
    if (qtdCheq) partes.push(`${qtdCheq} cheque(s) sem fundo`)
    if (qtdDeb) partes.push(`${qtdDeb} débito(s)`)

    return {
      result_flag,
      headline: `Assertiva: ${partes.join(' · ')}${raw?.emitted === false && raw?.reusedReportId ? ' (reuso ≤30d)' : ''}`,
      details: {
        score: { classe, pontos: score.pontos ?? null, faixa: score.faixa?.descricao || score.faixa?.titulo || null },
        protestos: { qtd: qtdProt, valor_total: protestos.valorTotal ?? null },
        acoes_judiciais: { qtd: qtdAcoes, valor: acoes.valor ?? null },
        cheques_sem_fundo: { qtd: qtdCheq, valor: cheques.valor ?? null },
        debitos: { qtd: qtdDeb, valor: debitos.valor ?? null },
        consultas: {
          qtd: consultas.qtdConsultas ?? consultas.quantidade ?? consultas.qtd ?? null,
          ultima: consultas.ultimaConsulta || consultas.ultimaData || null,
        },
        faturamento_presumido: faturamento.faturamentoPJ ?? faturamento.valor ?? faturamento.faturamento ?? null,
        dados_cadastrais: resp.dadosCadastrais || null,
        emitido_agora: raw?.emitted === true,
        reuso_report_id: raw?.reusedReportId || null,
      },
      evidence: [],
      protocol: cab.protocolo || null,
    }
  },

  // o orquestrador cobra só quando emitiu de fato (L2)
  costOf(raw) {
    return raw?.emitted === true ? 9.576 : 0
  },
}
