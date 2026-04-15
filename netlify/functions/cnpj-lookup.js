// netlify/functions/cnpj-lookup.js
// Consulta CNPJ na BrasilAPI e sanções no Portal da Transparência
// Chamado via: /.netlify/functions/cnpj-lookup?cnpj=00000000000000

/**
 * Filtra apenas sanções COMPROVADAMENTE ATIVAS.
 *
 * Regra conservadora (evitar falsos positivos):
 *   Uma sanção só é considerada ATIVA se PELO MENOS UMA das condições abaixo for verdadeira:
 *   a) situacaoDoSancionado é explicitamente "Ativo" ou "Vigente"
 *   b) dataFimSancao existe E é uma data FUTURA (> hoje)
 *
 *   Se ambos os campos estiverem ausentes/nulos, a sanção é tratada como HISTÓRICA
 *   (o Portal da Transparência tem muitos registros antigos sem data de fim registrada).
 *
 * Campos relevantes:
 *   situacaoDoSancionado : "Ativo" | "Inativo" | "" | null
 *   dataFimSancao        : "dd/MM/yyyy" | null
 */
function filterActiveSanctions(list) {
  if (!Array.isArray(list)) return []

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return list.filter(sanction => {
    const situacao = (sanction.situacaoDoSancionado || '').toLowerCase().trim()
    const rawFim   = sanction.dataFimSancao

    // Critério A: situação explicitamente ativa
    const situacaoAtiva = situacao === 'ativo' || situacao === 'vigente'

    // Critério B: data de fim existe e ainda não passou
    let dataFimFutura = false
    if (rawFim) {
      try {
        let endDate
        if (rawFim.includes('/')) {
          const [d, m, y] = rawFim.split('/')
          endDate = new Date(Number(y), Number(m) - 1, Number(d))
        } else {
          endDate = new Date(rawFim)
        }
        if (!isNaN(endDate.getTime())) {
          dataFimFutura = endDate >= today
        }
      } catch {}
    }

    // Sanção ativa SOMENTE se tiver evidência positiva (A ou B)
    // Registros sem situação E sem data de fim → histórico → NÃO conta
    return situacaoAtiva || dataFimFutura
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
      fetch(`https://api.portaldatransparencia.gov.br/api-de-dados/ceis?codigoSancionado=${cnpj}&pagina=1`, {
        headers: { 'chave-api-dados': apiKey, 'Accept': 'application/json' },
      }),
      fetch(`https://api.portaldatransparencia.gov.br/api-de-dados/cnep?codigoSancionado=${cnpj}&pagina=1`, {
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

    // Extrai e filtra por CNPJ exato — a API pode retornar registros de filiais
    // ou do grupo econômico inteiro ao buscar pela raiz do CNPJ (8 dígitos)
    const cnpjNums = cnpj.replace(/\D/g, '') // 14 dígitos limpos

    // Valida que cada registro retornado pertence ao CNPJ consultado.
    // Com o parâmetro correto (codigoSancionado), a API já filtra na fonte,
    // mas mantemos esta validação como camada de segurança.
    function extractAndFilterByCnpj(body) {
      if (!Array.isArray(body)) return []
      return body.filter(record => {
        const cnpjRecord = (
          record.sancionado?.codigoFormatado ||
          record.pessoa?.cnpjFormatado       ||
          ''
        ).replace(/\D/g, '')
        // Se a API retornou registro sem CNPJ identificável, mantém por precaução
        if (!cnpjRecord) return true
        return cnpjRecord === cnpjNums
      })
    }

    if (ceisRes.status === 'fulfilled' && ceisRes.value.ok) {
      try {
        const body = await ceisRes.value.json()
        const all = Array.isArray(body) ? body : []
        rawSanctions.ceis = extractAndFilterByCnpj(all)
        if (all.length !== rawSanctions.ceis.length) {
          console.log(`[sanctions] CEIS: ${all.length} registros brutos → ${rawSanctions.ceis.length} após filtro CNPJ exato`)
        }
      } catch { rawSanctions.ceis = [] }
    }

    if (cnepRes.status === 'fulfilled' && cnepRes.value.ok) {
      try {
        const body = await cnepRes.value.json()
        const all = Array.isArray(body) ? body : []
        rawSanctions.cnep = extractAndFilterByCnpj(all)
        if (all.length !== rawSanctions.cnep.length) {
          console.log(`[sanctions] CNEP: ${all.length} registros brutos → ${rawSanctions.cnep.length} após filtro CNPJ exato`)
        }
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
