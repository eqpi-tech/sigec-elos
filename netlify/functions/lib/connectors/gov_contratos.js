// Conector: Contratos com o Governo Federal (Portal da Transparência).
// Feedback de cliente 23/09: "prestação de serviço para o Governo Federal".
// Rota validada no swagger v3: /contratos/cpf-cnpj?cpfCnpj= (informativo).
const { consultaTransparencia } = require('../transparencia.js')

module.exports = {
  slug: 'gov_contratos',
  route: 'free',
  ttlDays: 7,
  inLight: false, inFull: true,
  costBase: 0, costExtra: 0,

  async fetch({ cnpj }) {
    const contratos = await consultaTransparencia('contratos/cpf-cnpj', { cpfCnpj: cnpj }, { maxPaginas: 2 })
    return { contratos: contratos || [] }
  },

  parse(raw) {
    const cs = raw.contratos || []
    const valor = cs.reduce((s, c) => s + Number(c.valorFinalCompra ?? c.valorInicialCompra ?? 0), 0)
    return {
      result_flag: cs.length ? 'verificar' : 'nada_consta',
      headline: cs.length
        ? `Governo Federal: ${cs.length} contrato(s) como fornecedor da administração (informativo)`
        : 'Governo Federal: sem contratos como fornecedor da administração',
      details: cs.length ? {
        contratos: cs.slice(0, 8).map((c) => ({
          orgao: c.unidadeGestora?.orgaoVinculado?.nome || c.unidadeGestora?.nome || null,
          objeto: (c.objeto || '').slice(0, 120) || null,
          vigencia: c.dataFimVigencia || null,
          valor: c.valorFinalCompra ?? c.valorInicialCompra ?? null,
        })),
        valor_total_aproximado: valor || null,
      } : {},
      evidence: [],
      protocol: null,
    }
  },
}
