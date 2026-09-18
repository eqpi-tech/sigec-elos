// Conector: Base CNPJ (Receita via BrasilAPI) — handoff §7, rota A grátis.
// É o PRIMEIRO conector do plano: além do próprio quadro, fornece
// company/socios para os demais (OFAC/ONU/CEAF/mídia usam o QSA).
module.exports = {
  slug: 'cnpj_base',
  route: 'free',
  ttlDays: 7,
  inLight: true, inFull: true,
  costBase: 0, costExtra: 0,

  async fetch({ cnpj }) {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'SIGEC-ELOS/1.0' },
    })
    if (res.status === 404) return { notFound: true }
    if (!res.ok) throw new Error(`BrasilAPI HTTP ${res.status}`)
    return await res.json()
  },

  parse(raw) {
    if (raw?.notFound) {
      return { result_flag: 'verificar', headline: 'CNPJ não encontrado na base da Receita', details: {}, evidence: [], protocol: null }
    }
    const situacao = raw.descricao_situacao_cadastral || 'DESCONHECIDA'
    const ativa = /^ativa$/i.test(situacao)
    const abertura = raw.data_inicio_atividade || null
    let idadeAnos = null
    if (abertura) idadeAnos = Math.floor((Date.now() - new Date(abertura).getTime()) / 31557600000)
    const socios = (raw.qsa || []).map((s) => ({
      nome: s.nome_socio,
      qualificacao: s.qualificacao_socio || null,
      entrada: s.data_entrada_sociedade || null,
      doc: s.cnpj_cpf_do_socio || null, // CPF vem mascarado pela Receita
    }))
    return {
      result_flag: ativa ? 'nada_consta' : 'apontamento',
      headline: ativa
        ? `Situação cadastral ATIVA desde ${abertura || '—'}`
        : `Situação cadastral: ${situacao}${raw.data_situacao_cadastral ? ' em ' + raw.data_situacao_cadastral : ''}`,
      details: {
        razao_social: raw.razao_social || null,
        nome_fantasia: raw.nome_fantasia || null,
        situacao,
        data_situacao: raw.data_situacao_cadastral || null,
        abertura,
        idade_anos: idadeAnos,
        natureza_juridica: raw.natureza_juridica || null,
        capital_social: raw.capital_social ?? null,
        porte: raw.porte || null,
        cnae_principal: raw.cnae_fiscal ? `${raw.cnae_fiscal} — ${raw.cnae_fiscal_descricao || ''}`.trim() : null,
        simples: raw.opcao_pelo_simples === true,
        mei: raw.opcao_pelo_mei === true,
        endereco: {
          logradouro: [raw.descricao_tipo_de_logradouro, raw.logradouro].filter(Boolean).join(' ') || null,
          numero: raw.numero || null, bairro: raw.bairro || null,
          municipio: raw.municipio || null, uf: raw.uf || null, cep: raw.cep || null,
        },
        socios,
      },
      evidence: [],
      protocol: null,
    }
  },

  // usado pelo orquestrador para alimentar os outros conectores
  extractContext(parsed) {
    return {
      company: { razao_social: parsed.details?.razao_social, uf: parsed.details?.endereco?.uf, municipio: parsed.details?.endereco?.municipio },
      socios: parsed.details?.socios || [],
    }
  },
}
