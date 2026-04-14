// netlify/functions/cnpj-lookup.js
// Consulta CNPJ na BrasilAPI e sanções no Portal da Transparência
// Chamado via: /.netlify/functions/cnpj-lookup?cnpj=00000000000000

/**
 * Filtra apenas sanções ATIVAS.
 * O Portal da Transparência retorna TODAS as sanções históricas do CNPJ,
 * incluindo as já expiradas. É necessário filtrar por data e situação.
 *
 * Campos relevantes (Portal da Transparência API):
 *   dataInicioSancao : "dd/MM/yyyy" — início da sanção
 *   dataFimSancao    : "dd/MM/yyyy" | null — fim; null = sem prazo (permanente)
 *   situacaoDoSancionado: "Ativo" | "Inativo" | outros — situação atual
 */
function filterActiveSanctions(list) {
  if (!Array.isArray(list)) return []

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return list.filter(sanction => {
    // 1. Verifica campo de situação (quando disponível)
    const situacao = (sanction.situacaoDoSancionado || '').toLowerCase()
    if (situacao && situacao !== 'ativo' && situacao !== 'vigente') {
      // Se explicitamente inativo/expirado → descarta
      return false
    }

    // 2. Verifica data de fim
    const rawFim = sanction.dataFimSancao
    if (!rawFim) {
      // Sem data de fim = sanção permanente/sem prazo → ATIVA
      return true
    }

    // Converte "dd/MM/yyyy" → Date
    // Formato alternativo "yyyy-MM-dd" também suportado
    let endDate
    if (rawFim.includes('/')) {
      const [d, m, y] = rawFim.split('/')
      endDate = new Date(Number(y), Number(m) - 1, Number(d))
    } else {
      endDate = new Date(rawFim)
    }

    if (isNaN(endDate.getTime())) return true  // Data inválida: mantém por precaução

    // Sanção ativa se a data de fim ainda não passou
    return endDate >= today
  })
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' }
  }

  const cnpj = (event.queryStringParameters?.cnpj || '').replace(/\D/g, '')
  if (!cnpj || cnpj.length !== 14) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'CNPJ inválido — informe 14 dígitos' }) }
  }

  const apiKey = process.env.TRANSPARENCY_API_KEY

  try {
    // Executa as 3 consultas em paralelo
    const [cnpjRes, ceisRes, cnepRes] = await Promise.allSettled([
      fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
        headers: { 'Accept': 'application/json', 'User-Agent': 'SIGEC-ELOS/1.0' },
      }),
      fetch(`https://api.portaldatransparencia.gov.br/api-de-dados/ceis?cnpjSancionado=${cnpj}&pagina=1`, {
        headers: { 'chave-api-dados': apiKey, 'Accept': 'application/json' },
      }),
      fetch(`https://api.portaldatransparencia.gov.br/api-de-dados/cnep?cnpjSancionado=${cnpj}&pagina=1`, {
        headers: { 'chave-api-dados': apiKey, 'Accept': 'application/json' },
      }),
    ])

    // CNPJ data (BrasilAPI)
    let cnpjData = null
    if (cnpjRes.status === 'fulfilled' && cnpjRes.value.ok) {
      try { cnpjData = await cnpjRes.value.json() } catch {}
    }

    // Sanções — captura o raw para logging e diagnóstico
    const rawSanctions = { ceis: [], cnep: [] }

    if (ceisRes.status === 'fulfilled' && ceisRes.value.ok) {
      try {
        const body = await ceisRes.value.json()
        rawSanctions.ceis = Array.isArray(body) ? body : []
      } catch { rawSanctions.ceis = [] }
    }

    if (cnepRes.status === 'fulfilled' && cnepRes.value.ok) {
      try {
        const body = await cnepRes.value.json()
        rawSanctions.cnep = Array.isArray(body) ? body : []
      } catch { rawSanctions.cnep = [] }
    }

    // LOG para diagnóstico — vai aparecer no Netlify Functions log
    if (rawSanctions.ceis.length > 0 || rawSanctions.cnep.length > 0) {
      console.log(`[sanctions-raw] CNPJ=${cnpj} ceis=${rawSanctions.ceis.length} cnep=${rawSanctions.cnep.length}`)
      // Loga campos do primeiro registro para entender a estrutura
      const sample = rawSanctions.ceis[0] || rawSanctions.cnep[0]
      if (sample) console.log('[sanctions-fields]', JSON.stringify(Object.keys(sample)))
      if (sample) console.log('[sanctions-sample]', JSON.stringify(sample))
    }

    // Filtra apenas sanções ATIVAS (exclui históricas/expiradas)
    const activeCeis = filterActiveSanctions(rawSanctions.ceis)
    const activeCnep = filterActiveSanctions(rawSanctions.cnep)

    // hasSanctions = true APENAS se houver sanções ativas
    const hasSanctions = activeCeis.length > 0 || activeCnep.length > 0

    // Extrai status do Simples Nacional
    const simplesAtivo  = cnpjData?.opcao_pelo_simples === true
    const simplesExcluido = cnpjData?.data_exclusao_do_simples != null

    // Log final para diagnóstico
    console.log(
      `[cnpj-lookup] CNPJ=${cnpj}`,
      `raw_total=${rawSanctions.ceis.length + rawSanctions.cnep.length}`,
      `active=${activeCeis.length + activeCnep.length}`,
      `hasSanctions=${hasSanctions}`
    )

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        cnpj:       cnpjData,
        sanctions: {
          ceis: activeCeis,  // Apenas sanções ativas
          cnep: activeCnep,
          // Mantém o histórico completo separado para o backoffice
          ceisHistory: rawSanctions.ceis,
          cnepHistory: rawSanctions.cnep,
        },
        hasSanctions,
        status:      cnpjData?.descricao_situacao_cadastral || 'DESCONHECIDA',
        razaoSocial: cnpjData?.razao_social || null,
        municipio:   cnpjData?.municipio   || null,
        uf:          cnpjData?.uf          || null,
        simplesNacional: {
          optante:      simplesAtivo && !simplesExcluido,
          status:       simplesAtivo && !simplesExcluido ? 'OPTANTE' : 'NAO_OPTANTE',
          dataOpcao:    cnpjData?.data_opcao_pelo_simples    || null,
          dataExclusao: cnpjData?.data_exclusao_do_simples   || null,
        },
        mei: cnpjData?.opcao_pelo_mei === true,
      }),
    }
  } catch (err) {
    console.error('cnpj-lookup error:', err)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Erro interno ao consultar CNPJ', detail: err.message }),
    }
  }
}
