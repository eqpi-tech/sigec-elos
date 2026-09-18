// Conector: CEPIM — Entidades Privadas sem fins lucrativos Impedidas
// (Portal da Transparência). Parâmetro correto: cnpjSancionado (swagger v3).
const { consultaTransparencia } = require('../transparencia.js')

module.exports = {
  slug: 'cepim',
  route: 'free',
  ttlDays: 1,
  inLight: true, inFull: true,
  costBase: 0, costExtra: 0,

  async fetch({ cnpj }) {
    const registros = await consultaTransparencia('cepim', { cnpjSancionado: cnpj })
    // valida o CNPJ no shape próprio do CEPIM (pessoaJuridica.cnpjFormatado)
    const exatos = (registros || []).filter((r) => {
      const doc = (r.pessoaJuridica?.cnpjFormatado || '').replace(/\D/g, '')
      return !doc || doc === cnpj
    })
    return { registros: exatos }
  },

  parse(raw) {
    const regs = raw.registros || []
    return {
      result_flag: regs.length ? 'apontamento' : 'nada_consta',
      headline: regs.length
        ? `CEPIM: ${regs.length} impedimento(s) — entidade impedida de firmar convênios`
        : 'CEPIM: nada consta',
      details: {
        registros: regs.map((r) => ({
          orgao: r.orgaoSuperior?.nome || null,
          convenio: r.convenio || null,
          motivo: r.motivo || null,
        })),
      },
      evidence: [],
      protocol: null,
    }
  },
}
