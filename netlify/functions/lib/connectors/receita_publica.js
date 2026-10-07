// Conectores GRATUITOS da Rota A (28/09): Cartão CNPJ (doc 37) e Simples
// Nacional (doc 62) a partir da base pública da Receita (BrasilAPI) que o
// cadastro já grava em cnpj_consultations — sem custo por consulta. Trocam
// cartao_cnpj/simples da Infosimples (R$ 0,24 + R$ 0,40), cuja única
// diferença era o PDF da Receita; o comprovante passa a ser o registro da
// consulta gerado pelo ELOS (o coletor gera quando não há recibo da fonte).
// O collector entrega os dados em ctx.cnpjData (do banco; BrasilAPI se não houver).

const semDados = { unsupported: true, motivo: 'dados públicos do CNPJ indisponíveis' }
const fmtData = (v) => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : null)

function base(slug, nome, campos, classify) {
  return {
    slug, route: 'free', ttlDays: 30, inLight: false, inFull: false, costBase: 0, costExtra: 0,
    async fetch(ctx) {
      const d = ctx?.cnpjData
      if (!d || !d.cnpj) return semDados
      // só os campos pertinentes (o QSA com nomes de sócios não vai para o registro)
      const sel = Object.fromEntries(campos.filter((k) => d[k] !== undefined && d[k] !== null && d[k] !== '').map((k) => [k, d[k]]))
      return { code: 200, data: [sel], receipts: [], fonte: 'Receita Federal — base pública (BrasilAPI)' }
    },
    parse(raw) {
      if (raw?.unsupported) return { result_flag: 'indisponivel', headline: `${nome}: ${raw.motivo}`, details: {}, evidence: [], protocol: null }
      const d = raw.data?.[0] || {}
      return { ...classify(nome, d), details: d, evidence: [], protocol: null }
    },
  }
}

const receita_cadastro = base('receita_cadastro', 'Cartão CNPJ (Receita Federal)',
  ['cnpj', 'razao_social', 'nome_fantasia', 'descricao_situacao_cadastral', 'data_situacao_cadastral', 'descricao_motivo_situacao_cadastral',
   'data_inicio_atividade', 'natureza_juridica', 'porte', 'cnae_fiscal', 'cnae_fiscal_descricao', 'uf', 'municipio', 'logradouro', 'numero', 'bairro', 'cep'],
  (nome, d) => {
    const sit = String(d.descricao_situacao_cadastral || '').toUpperCase()
    if (sit === 'ATIVA') return { result_flag: 'nada_consta', headline: `${nome}: situação cadastral ATIVA${d.data_situacao_cadastral ? ` desde ${fmtData(d.data_situacao_cadastral)}` : ''}` }
    if (sit) return { result_flag: 'apontamento', headline: `${nome}: situação cadastral ${sit}${d.descricao_motivo_situacao_cadastral ? ` (${d.descricao_motivo_situacao_cadastral})` : ''}` }
    return { result_flag: 'verificar', headline: `${nome}: situação cadastral não informada` }
  })

// Mesma regra de antes (browser): a consulta CONFIRMA o regime tributário —
// optante ou não, o documento é atendido; a sugestão informa qual é
const receita_simples = base('receita_simples', 'Simples Nacional (Receita Federal)',
  ['cnpj', 'razao_social', 'opcao_pelo_simples', 'data_opcao_pelo_simples', 'data_exclusao_do_simples', 'opcao_pelo_mei', 'data_opcao_pelo_mei', 'data_exclusao_do_mei'],
  (nome, d) => {
    const optante = d.opcao_pelo_simples === true && !d.data_exclusao_do_simples
    const mei = d.opcao_pelo_mei === true && !d.data_exclusao_do_mei
    if (mei) return { result_flag: 'nada_consta', headline: `${nome}: MEI${d.data_opcao_pelo_mei ? ` desde ${fmtData(d.data_opcao_pelo_mei)}` : ''} (optante pelo Simples)` }
    if (optante) return { result_flag: 'nada_consta', headline: `${nome}: OPTANTE${d.data_opcao_pelo_simples ? ` desde ${fmtData(d.data_opcao_pelo_simples)}` : ''}` }
    return { result_flag: 'nada_consta', headline: `${nome}: NÃO optante${d.data_exclusao_do_simples ? ` (excluído em ${fmtData(d.data_exclusao_do_simples)})` : ''} — regime confirmado` }
  })

module.exports = { receita_cadastro, receita_simples }
