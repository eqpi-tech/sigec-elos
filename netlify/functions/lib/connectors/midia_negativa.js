// Conector: mídia negativa — buscador/google (Infosimples) com a query
// padrão EQP (D3). Light: 1 consulta (empresa); Full: empresa + sócio adm.
// Achados NUNCA pontuam sozinhos como apontamento — 'verificar' p/ analista
// (o score aplica -15 só em apontamento confirmado manualmente; D3).
const { consulta, mapCode } = require('../infosimples.js')

const TERMOS = '(fraude OR corrupção OR "lavagem de dinheiro" OR condenação OR "trabalho escravo" OR propina OR investigação)'

module.exports = {
  slug: 'midia_negativa', route: 'infosimples', ttlDays: 7,
  inLight: true, inFull: true, costBase: 0.20, costExtra: 0,
  needsCompany: true,
  async fetch({ company = {}, socios = [], tipo }) {
    const alvos = []
    if (company.razao_social) alvos.push(company.razao_social)
    if (tipo === 'full') {
      const adm = socios.find((s) => /admin/i.test(s.qualificacao || '')) || socios[0]
      if (adm?.nome) alvos.push(adm.nome)
    }
    if (!alvos.length) return { unsupported: true }
    const out = []
    for (const alvo of alvos) {
      // parâmetro validado por sonda 19/09: 'query' (q → 606)
      const raw = await consulta('buscador/google', { query: `"${alvo}" ${TERMOS}` })
      out.push({ alvo, code: raw.code, codeMessage: raw.codeMessage, data: raw.data, receipts: raw.receipts })
    }
    // code no topo p/ o orquestrador (composto)
    const codes = out.map((c) => c.code)
    return { consultas: out, code: codes.some((c) => c === 200) ? 200 : codes[0], codeMessage: out[0]?.codeMessage }
  },
  // 2 buscas no Full (empresa + sócio adm): fatura cada consulta 200
  costOf(raw) {
    return (raw?.consultas || []).filter((c) => c.code === 200).length * 0.20
  },
  parse(raw) {
    if (raw?.unsupported) return { result_flag: 'indisponivel', headline: 'Mídia negativa: sem razão social para pesquisar', details: {}, evidence: [], protocol: null }
    let hits = 0
    const porAlvo = []
    for (const c of raw.consultas || []) {
      const st = mapCode(c.code, c.codeMessage)
      const resultados = st === 'ok' ? (c.data?.[0]?.resultados || c.data || []) : []
      const n = Array.isArray(resultados) ? resultados.length : 0
      hits += n
      // feedback 23/09: o relatório citava 'achados' sem mostrar O QUE —
      // agora 5 itens com título + domínio da fonte
      const dom = (u) => { try { return new URL(u).hostname.replace('www.', '') } catch { return '' } }
      const top = (Array.isArray(resultados) ? resultados : []).slice(0, 5)
        .map((r) => {
          const titulo = r?.titulo || r?.title || r?.descricao || null
          const fonte = dom(r?.link || r?.url || '')
          return titulo ? (fonte ? `${titulo} [${fonte}]` : titulo) : null
        }).filter(Boolean)
      porAlvo.push({ alvo: c.alvo, resultados: n, achados: top })
    }
    return {
      result_flag: hits > 0 ? 'verificar' : 'nada_consta',
      headline: hits > 0 ? `Mídia negativa: ${hits} resultado(s) na busca padrão — revisão manual` : 'Mídia negativa: sem resultados na busca padrão',
      details: { por_alvo: porAlvo },
      evidence: (raw.consultas || []).flatMap((c) => (c.receipts || []).map((url) => ({ kind: 'site_receipt', url }))),
      protocol: null,
    }
  },
}
