// netlify/functions/cnpj-lookup.js
// Consulta CNPJ na BrasilAPI, sanções e verifica presença no banco de dados SIGEC
// Chamado via: /.netlify/functions/cnpj-lookup?cnpj=00000000000000

const { createClient } = require('@supabase/supabase-js')

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

    // Verifica presença do CNPJ no banco SIGEC (server-side — bypassa RLS)
    let dbInfo = { isClient: false, isSupplier: false, hasActiveSeal: false, supplierId: null }
    try {
      const supabaseAdmin = createClient(
        process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      )
      const [clientRes, supplierRes] = await Promise.allSettled([
        supabaseAdmin.from('clients').select('id').eq('cnpj', cnpj).maybeSingle(),
        supabaseAdmin.from('suppliers').select('id, status, razao_social').eq('cnpj', cnpj).maybeSingle(),
      ])
      if (clientRes.value?.data) {
        dbInfo.isClient = true
      }
      if (supplierRes.value?.data) {
        dbInfo.isSupplier  = true
        dbInfo.supplierId  = supplierRes.value.data.id
        dbInfo.razaoSocial = supplierRes.value.data.razao_social || null
        // limit(1): fornecedor pode ter VÁRIOS selos ativos (um por cliente) —
        // maybeSingle() sem limit erra com 2+ linhas e derrubava hasActiveSeal
        const { data: sealData } = await supabaseAdmin
          .from('seals').select('status').eq('supplier_id', supplierRes.value.data.id)
          .eq('status', 'ACTIVE').limit(1).maybeSingle()
        dbInfo.hasActiveSeal = !!sealData

        // REGRA: a consulta ATUALIZA o banco com os dados frescos da Receita —
        // o sistema sempre LÊ do banco. Só grava campos que a BrasilAPI trouxe.
        if (cnpjData?.razao_social) {
          const fresh = {
            razao_social:   cnpjData.razao_social,
            nome_fantasia:  cnpjData.nome_fantasia || undefined,
            cnae_main:      cnpjData.cnae_fiscal ? String(cnpjData.cnae_fiscal) : undefined,
            state:          cnpjData.uf || undefined,
            city:           cnpjData.municipio || undefined,
            capital_social: cnpjData.capital_social ?? undefined,
            simples_nacional: cnpjData.opcao_pelo_simples ?? undefined,
            data_abertura:  cnpjData.data_inicio_atividade || undefined,
            phone:          cnpjData.ddd_telefone_1 || undefined,
            address: {
              logradouro: [cnpjData.descricao_tipo_de_logradouro, cnpjData.logradouro].filter(Boolean).join(' ') || undefined,
              numero:     cnpjData.numero || undefined,
              bairro:     cnpjData.bairro || undefined,
              municipio:  cnpjData.municipio || undefined,
              uf:         cnpjData.uf || undefined,
              cep:        cnpjData.cep || undefined,
            },
          }
          Object.keys(fresh).forEach(k => fresh[k] === undefined && delete fresh[k])
          await supabaseAdmin.from('suppliers').update(fresh)
            .eq('id', supplierRes.value.data.id)
            .then(() => console.log(`[cnpj-lookup] suppliers atualizado com dados frescos da Receita`))
            .catch(e => console.warn('[cnpj-lookup] update supplier:', e.message))
        }
      }
    } catch (dbErr) {
      console.warn('[cnpj-lookup] DB check não crítico:', dbErr.message)
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        cnpj:       cnpjData,
        sanctions: {
          ceis: activeCeis,  // Apenas sanções ativas
          cnep: activeCnep,
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
        mei:    cnpjData?.opcao_pelo_mei === true,
        dbInfo,
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
