// Conector: MPT — Certidão Negativa de Feitos. A rota unificada do handoff
// NÃO existe na API (sonda 19/09); o serviço é POR UF: mpt/{uf}/cnf, usando
// a UF da sede vinda do cnpj_base.
// Payload real (19/09): { nada_consta: bool, procedimentos: [{ ano_autuacao,
// classe, numero, partes_polo_passivo[], situacao }] } — classificar pelo
// campo explícito; só procedimentos ARQUIVADOS rebaixam para 'verificar'.
const { makeCertConnector } = require('./_cert_base.js')

module.exports = makeCertConnector({
  slug: 'mpt_cnf', nome: 'MPT Certidão de Feitos', costExtra: 0.04,
  pathFor: ({ company }) => company?.uf ? `mpt/${company.uf.toLowerCase()}/cnf` : null,
  unsupportedNote: 'UF da sede desconhecida (base CNPJ indisponível)',
  classify: (nome, d) => {
    if (d.nada_consta === true) return { result_flag: 'nada_consta', headline: 'MPT: certidão negativa — nada consta' }
    const procs = Array.isArray(d.procedimentos) ? d.procedimentos : []
    const ativos = procs.filter((p) => !/arquivad/i.test(p.situacao || ''))
    if (ativos.length) return { result_flag: 'apontamento', headline: `MPT: ${ativos.length} procedimento(s) ATIVO(s) (${procs.length} no total)` }
    if (procs.length) return { result_flag: 'verificar', headline: `MPT: ${procs.length} procedimento(s) ARQUIVADO(s) — histórico, verificar` }
    return { result_flag: 'verificar', headline: 'MPT: certidão positiva — ver detalhe' }
  },
  details: (d) => ({
    nada_consta: d.nada_consta ?? null,
    procedimentos: (d.procedimentos || []).map((p) => ({
      numero: p.numero, ano: p.ano_autuacao, classe: p.classe, situacao: p.situacao,
    })),
    verificacao: d.mensagem_sistema || null,
  }),
})
