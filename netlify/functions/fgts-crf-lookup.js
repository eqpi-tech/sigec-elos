// netlify/functions/fgts-crf-lookup.js
// Consulta automática do CRF FGTS na Caixa Econômica Federal
// Sem captcha — usa scraping de formulário JSF (JavaServer Faces)
//
// Fluxo JSF:
//   1. GET  /consultaEmpregador.jsf  → obtém cookies + ViewState oculto no HTML
//   2. POST /consultaEmpregador.jsf  → envia CNPJ → recebe resultado (REGULAR/IRREGULAR)
//   3. POST /consultaEmpregador.jsf  → clica "Gerar Certificado" → obtém PDF com dados de validade
//
// Campos esperados no HTML de resultado:
//   "REGULAR"  → ok
//   "IRREGULAR" → nok
//   Validade: 31/03/2026 a 29/04/2026
//   Certificado Número: 2026033118491661973409
//   Informação obtida em 14/04/2026 18:30:42

const BASE = 'https://consulta-crf.caixa.gov.br/consultacrf/pages/consultaEmpregador.jsf'
const UA   = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Extrai Set-Cookie headers e monta uma string "Cookie: k=v; k2=v2" */
function mergeCookies(existingCookies, newHeaders) {
  const existing = {}
  if (existingCookies) {
    existingCookies.split(';').forEach(c => {
      const [k, ...v] = c.trim().split('=')
      if (k) existing[k.trim()] = v.join('=').trim()
    })
  }
  // set-cookie pode vir como array ou string
  const setCookieRaw = newHeaders.get('set-cookie') || ''
  setCookieRaw.split(',').forEach(cookie => {
    const part = cookie.split(';')[0].trim()
    const [k, ...v] = part.split('=')
    if (k?.trim()) existing[k.trim()] = (v.join('=') || '').trim()
  })
  return Object.entries(existing).map(([k, v]) => `${k}=${v}`).join('; ')
}

/** Extrai javax.faces.ViewState do HTML */
function extractViewState(html) {
  // Tenta vários padrões comuns em implementações JSF
  const patterns = [
    /name="javax\.faces\.ViewState"\s+id="[^"]*"\s+value="([^"]+)"/i,
    /name="javax\.faces\.ViewState"\s+value="([^"]+)"/i,
    /javax\.faces\.ViewState[^>]*value="([^"]+)"/i,
    /id="j_id[^"]*:javax\.faces\.ViewState[^"]*"\s+value="([^"]+)"/i,
  ]
  for (const p of patterns) {
    const m = html.match(p)
    if (m?.[1]) return m[1]
  }
  return null
}

/** Extrai todos os campos hidden de um formulário JSF */
function extractHiddenFields(html, formId) {
  const fields = {}
  // Pega todos os inputs hidden dentro do form (ou global)
  const re = /<input[^>]+type="hidden"[^>]*>/gi
  let match
  while ((match = re.exec(html)) !== null) {
    const tag = match[0]
    const name  = tag.match(/name="([^"]+)"/i)?.[1]
    const value = tag.match(/value="([^"]+)"/i)?.[1] || ''
    if (name) fields[name] = value
  }
  return fields
}

/** Tenta identificar o ID do formulário de consulta */
function extractFormAction(html) {
  const m = html.match(/<form[^>]+action="([^"]*consultaEmpregador[^"]*)"[^>]*>/i)
    || html.match(/<form[^>]+id="([^"]+)"[^>]*>/i)
  return m?.[1] || BASE
}

/** Extrai o nome da empresa do HTML de resultado */
function extractEmpresa(html) {
  // "A EMPRESA abaixo identificada está REGULAR perante o FGTS:"
  // seguido de uma linha com a razão social
  const m = html.match(/EMPRESA[^:]*:\s*<[^>]+>\s*([A-Z][^<]{3,})/i)
    || html.match(/Empresa\s*[:\-]\s*<[^>]+>([^<]+)/i)
    || html.match(/class="[^"]*empresa[^"]*"[^>]*>([^<]+)/i)
  return m?.[1]?.trim() || null
}

/** Extrai os dados do certificado */
function extractCertData(html) {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

  // Validade: 31/03/2026 a 29/04/2026
  const validadeMatch = text.match(/Validade[:\s]+(\d{2}\/\d{2}\/\d{4})\s+a\s+(\d{2}\/\d{2}\/\d{4})/i)

  // Certificado Número: 2026033118491661973409
  const numMatch = text.match(/Certificado\s+N[úu]mero[:\s]+(\d+)/i)
    || text.match(/N[úu]mero\s+do\s+certificado[:\s]+(\d+)/i)

  // Informação obtida em 14/04/2026 18:30:42
  const dataMatch = text.match(/[Ii]nforma[çc][ãa]o\s+obtida\s+em[:\s]+(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2})/i)

  return {
    validadeInicio: validadeMatch?.[1] || null,
    validadeFim:    validadeMatch?.[2] || null,
    numeroCertificado: numMatch?.[1] || null,
    consultadoEm:   dataMatch?.[1] || null,
  }
}

/** Verifica se o resultado é REGULAR */
function isRegular(html) {
  return /est[aá]\s+REGULAR\s+perante\s+o\s+FGTS/i.test(html)
      || /SITUAÇÃO[^:]*:\s*REGULAR/i.test(html)
      || /class="[^"]*regular[^"]*"/i.test(html)
}

/** Verifica se o resultado é IRREGULAR */
function isIrregular(html) {
  return /IRREGULAR\s+perante\s+o\s+FGTS/i.test(html)
      || /SITUAÇÃO[^:]*:\s*IRREGULAR/i.test(html)
      || /n[ãa]o\s+est[aá]\s+regular/i.test(html)
}

/** Encontra o botão/link para gerar o certificado */
function findCertButton(html) {
  // Procura por botão "Certificado" ou "Gerar" nos forms
  const m = html.match(/name="([^"]*certificado[^"]*)"[^>]*value="([^"]*)"/i)
    || html.match(/id="([^"]*certificado[^"]*)"[^>]*>/i)
    || html.match(/<input[^>]+value="[^"]*[Cc]ertificado[^"]*"[^>]*name="([^"]+)"/i)
    || html.match(/<input[^>]+value="[^"]*[Gg]erar[^"]*"[^>]*name="([^"]+)"/i)
    || html.match(/name="([^"]*:j_id[^"]*)"[^>]*value="[^"]*[Cc]ert[^"]*"/i)
  return m?.[1] || null
}

// ─── Handler principal ────────────────────────────────────────────────────────

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  }

  if (event.httpMethod === 'OPTIONS') return { statusCode:200, headers, body:'' }

  const cnpj = (event.queryStringParameters?.cnpj || '').replace(/\D/g, '')
  const uf   = (event.queryStringParameters?.uf   || '').toUpperCase().trim()

  if (!cnpj || cnpj.length !== 14) {
    return { statusCode:400, headers, body: JSON.stringify({ error:'CNPJ inválido' }) }
  }

  // UF é necessária pelo formulário da Caixa
  const ufFinal = uf || 'SP' // fallback; idealmente vir da base (supplier.state)

  try {
    // ── ETAPA 1: GET página inicial ─────────────────────────────────────────
    console.log(`[fgts-crf] Iniciando consulta CNPJ=${cnpj} UF=${ufFinal}`)

    const step1 = await fetch(BASE, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
      redirect: 'follow',
    })

    if (!step1.ok) throw new Error(`Etapa 1 falhou: HTTP ${step1.status}`)
    let cookies   = mergeCookies('', step1.headers)
    const html1   = await step1.text()
    const vs1     = extractViewState(html1)
    const hidden1 = extractHiddenFields(html1)

    if (!vs1) {
      console.error('[fgts-crf] ViewState não encontrado. HTML preview:', html1.slice(0,800))
      throw new Error('Não foi possível obter ViewState da página da Caixa. A estrutura do site pode ter mudado.')
    }

    console.log('[fgts-crf] Etapa 1 OK — ViewState obtido, cookies:', cookies.slice(0,60))

    // ── ETAPA 2: POST com CNPJ ──────────────────────────────────────────────
    // Monta o corpo do formulário JSF
    // O campo de CNPJ varia: 'inscricao', 'cnpj', 'txtCnpj', etc.
    // Inclui todos os campos hidden + os campos do formulário
    const formBody2 = new URLSearchParams({
      ...hidden1,
      // Campos possíveis para CNPJ (JSF usa o ID do componente como prefixo)
      'consultaEmpregador:inscricao': cnpj,
      'consultaEmpregador:uf':        ufFinal,
      // Botão de submit — nome varia; tentamos os mais comuns
      'consultaEmpregador:botaoConsultar': 'Consultar',
      'javax.faces.ViewState': vs1,
    })

    console.log('[fgts-crf] Etapa 2: POST form...')

    const step2 = await fetch(BASE, {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie':   cookies,
        'Referer':  BASE,
        'Origin':   'https://consulta-crf.caixa.gov.br',
      },
      body: formBody2.toString(),
      redirect: 'follow',
    })

    cookies = mergeCookies(cookies, step2.headers)
    const html2 = await step2.text()
    const vs2   = extractViewState(html2)

    console.log('[fgts-crf] Etapa 2: HTTP', step2.status,
                '| regular?', isRegular(html2),
                '| irregular?', isIrregular(html2),
                '| html preview:', html2.slice(0,300))

    // Verifica resultado
    if (!isRegular(html2) && !isIrregular(html2)) {
      // Nenhum dos padrões reconhecidos — pode ser que os campo IDs sejam diferentes
      // Loga o HTML completo para diagnóstico
      console.warn('[fgts-crf] Resultado indefinido. HTML (2000 chars):', html2.slice(0,2000))
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          status: 'INDEFINIDO',
          regular: null,
          empresa: null,
          message: 'Não foi possível identificar REGULAR/IRREGULAR na resposta. Ver logs para diagnóstico.',
          _debug_html: html2.slice(0, 1500),
        }),
      }
    }

    const regular = isRegular(html2)
    const empresa = extractEmpresa(html2)

    if (!regular) {
      console.log('[fgts-crf] IRREGULAR — CNPJ com pendências FGTS')
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          status: 'IRREGULAR',
          regular: false,
          empresa,
          message: 'Empresa com pendências perante o FGTS.',
          certificado: null,
          consultadoEm: new Date().toISOString(),
        }),
      }
    }

    // ── ETAPA 3: Gerar certificado (segundo POST) ───────────────────────────
    console.log('[fgts-crf] REGULAR — tentando gerar certificado...')

    let certData = {}

    if (vs2) {
      const hidden2     = extractHiddenFields(html2)
      const certButton  = findCertButton(html2)

      // Monta o corpo para "clicar" no botão de certificado
      const formBody3 = new URLSearchParams({
        ...hidden2,
        'javax.faces.ViewState': vs2,
      })

      // Adiciona o botão de geração (nome varia)
      if (certButton) {
        formBody3.set(certButton, 'Obtenha o Certificado de Regularidade do FGTS')
      } else {
        // Tentativa com nomes comuns
        formBody3.set('consultaEmpregador:botaoCertificado', 'Obtenha o Certificado de Regularidade do FGTS')
        formBody3.set('consultaEmpregador:linkCertificado', 'Certificado')
      }

      const step3 = await fetch(BASE, {
        method: 'POST',
        headers: {
          'User-Agent': UA,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cookie':   cookies,
          'Referer':  BASE,
          'Origin':   'https://consulta-crf.caixa.gov.br',
        },
        body: formBody3.toString(),
        redirect: 'follow',
      })

      const html3 = await step3.text()
      console.log('[fgts-crf] Etapa 3: HTTP', step3.status, '| html preview:', html3.slice(0,300))

      certData = extractCertData(html3)

      // Se o certificado não veio na etapa 3, tenta extrair da etapa 2 (alguns sites mostram direto)
      if (!certData.numeroCertificado) {
        certData = extractCertData(html2)
        if (certData.numeroCertificado) console.log('[fgts-crf] Certificado extraído da etapa 2')
      }
    }

    console.log('[fgts-crf] Resultado final:', { regular, empresa, certData })

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        status: 'REGULAR',
        regular: true,
        empresa,
        validadeInicio:    certData.validadeInicio    || null,
        validadeFim:       certData.validadeFim       || null,
        numeroCertificado: certData.numeroCertificado || null,
        consultadoEm:      certData.consultadoEm      || new Date().toISOString(),
        message: 'Empresa regular perante o FGTS.',
      }),
    }

  } catch (err) {
    console.error('[fgts-crf] Erro:', err.message)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Erro na consulta FGTS',
        detail: err.message,
        tip: 'Verifique os logs do Netlify Functions para ver o HTML de resposta e ajustar os IDs dos campos JSF.',
      }),
    }
  }
}
