// Conector: CEIS — Empresas Inidôneas e Suspensas (Portal da Transparência)
const { consultaTransparencia, filterActiveSanctions, onlyExactCnpj } = require('../transparencia.js')

module.exports = {
  slug: 'ceis',
  nome: 'CEIS — Portal da Transparência (CGU)',
  route: 'free',
  ttlDays: 1,
  inLight: true, inFull: true,
  costBase: 0, costExtra: 0,

  async fetch({ cnpj }) {
    const registros = await consultaTransparencia('ceis', { codigoSancionado: cnpj })
    return { registros: onlyExactCnpj(registros, cnpj) }
  },

  parse(raw) {
    const todos = raw.registros || []
    const ativos = filterActiveSanctions(todos)
    const result_flag = ativos.length ? 'apontamento' : 'nada_consta'
    return {
      result_flag,
      headline: ativos.length
        ? `CEIS: ${ativos.length} sanção(ões) ATIVA(s) — empresa inidônea/suspensa`
        : todos.length
          ? `CEIS: nada consta ativo (${todos.length} registro(s) histórico(s))`
          : 'CEIS: nada consta',
      details: {
        ativos: ativos.map(resumo),
        historico: todos.filter((t) => !ativos.includes(t)).map(resumo),
      },
      evidence: [],
      protocol: null,
      // Rota A (doc 12, 23/10): o CEIS não emite comprovante — o registro da
      // consulta gerado pelo ELOS lista cada sanção encontrada
      registro: registro(ativos, todos.filter((t) => !ativos.includes(t))),
    }
  },
}

function registro(ativos, historico) {
  const linha = (s) => {
    const r = resumo(s)
    const fim = /^\d/.test(String(r.fim || '')) ? r.fim : 'sem data de fim'
    return [r.tipo, r.orgao, `${r.inicio || '?'} a ${fim}`].filter(Boolean).join(' · ')
  }
  const out = { 'Sanções ativas': String(ativos.length), 'Registros históricos': String(historico.length) }
  ativos.slice(0, 15).forEach((s, i) => { out[`Sanção ativa ${i + 1}`] = linha(s) })
  historico.slice(0, 10).forEach((s, i) => { out[`Histórico ${i + 1}`] = linha(s) })
  return out
}

function resumo(s) {
  return {
    tipo: s.tipoSancao?.descricaoResumida || null,
    orgao: s.orgaoSancionador?.nome || null,
    inicio: s.dataInicioSancao || null,
    fim: s.dataFimSancao || null,
    situacao: s.situacaoDoSancionado || null,
    fundamentacao: (s.fundamentacao || []).map((f) => f.descricao).join('; ') || null,
  }
}
