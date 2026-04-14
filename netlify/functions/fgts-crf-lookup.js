// netlify/functions/fgts-crf-lookup.js
// Consulta CRF FGTS - Caixa Econômica Federal (JSF sem captcha)

const BASE = 'https://consulta-crf.caixa.gov.br/consultacrf/pages/consultaEmpregador.jsf'
const UA   = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

function mergeCookies(existing, newHeaders) {
  const jar = {}
  if (existing) {
    existing.split(';').forEach(c => {
      const [k, ...v] = c.trim().split('=')
      if (k?.trim()) jar[k.trim()] = v.join('=').trim()
    })
  }
  const raw = newHeaders.raw?.()?.['set-cookie'] || []
  const arr = Array.isArray(raw) ? raw : (raw ? [raw] : [])
  arr.forEach(cookie => {
    const part = cookie.split(';')[0].trim()
    const [k, ...v] = part.split('=')
    if (k?.trim()) jar[k.trim()] = (v.join('=') || '').trim()
  })
  // Tenta também o get() padrão
  const single = newHeaders.get?.('set-cookie') || ''
  if (single) {
    single.split(',').forEach(cookie => {
      const part = cookie.split(';')[0].trim()
      const [k, ...v] = part.split('=')
      if (k?.trim()) jar[k.trim()] = (v.join('=') || '').trim()
    })
  }
  return Object.entries(jar).map(([k,v])=>`${k}=${v}`).join('; ')
}

function extractViewState(html) {
  const patterns = [
    /name="javax\.faces\.ViewState"[^>]*value="([^"]+)"/i,
    /value="([^"]+)"[^>]*name="javax\.faces\.ViewState"/i,
    /javax\.faces\.ViewState[^>]*value="([^"]+)"/i,
  ]
  for (const p of patterns) {
    const m = html.match(p)
    if (m?.[1]) return decodeURIComponent(m[1])
  }
  return null
}

function extractAllHiddenFields(html) {
  const fields = {}
  const re = /<input[^>]+type=["']?hidden["']?[^>]*>/gi
  let m
  while ((m = re.exec(html)) !== null) {
    const name  = m[0].match(/name="([^"]+)"/i)?.[1]
    const value = m[0].match(/value="([^"]+)"/i)?.[1] ?? ''
    if (name) fields[name] = value
  }
  return fields
}

// Encontra o ID real do formulário no HTML
function extractFormId(html) {
  const m = html.match(/<form[^>]+id="([^"]+)"[^>]*action="[^"]*consultaEmpregador[^"]*"/i)
    || html.match(/<form[^>]+action="[^"]*consultaEmpregador[^"]*"[^>]+id="([^"]+)"/i)
    || html.match(/<form[^>]+id="([^"]+)"[^>]*>/i)
  return m?.[1] || 'consultaEmpregador'
}

// Encontra o nome real do campo de CNPJ/inscrição
function findInputField(html, hints) {
  for (const hint of hints) {
    const re = new RegExp(`name="([^"]*${hint}[^"]*)"`, 'i')
    const m = html.match(re)
    if (m?.[1]) return m[1]
  }
  return null
}

// Encontra o nome real do botão de submit
function findSubmitButton(html) {
  // Procura por input type=submit ou button com nomes comuns
  const re = /<input[^>]+type=["']?submit["']?[^>]*>/gi
  const buttons = []
  let m
  while ((m = re.exec(html)) !== null) {
    const name  = m[0].match(/name="([^"]+)"/i)?.[1]
    const value = m[0].match(/value="([^"]+)"/i)?.[1] || ''
    if (name) buttons.push({ name, value })
  }
  return buttons
}

// Resultado APENAS se texto muito específico aparecer
function detectResult(html) {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').toUpperCase()

  // Padrões de REGULAR — muito específicos
  const regularPatterns = [
    /ESTÁ REGULAR PERANTE O FGTS/,
    /ESTÁ\s+REGULAR\s+PERANTE/,
    /SITUAÇÃO[^:]{0,20}:\s*REGULAR\b/,
    /CERTIDÃO DE REGULARIDADE DO FGTS/,
  ]
  // Padrões de IRREGULAR — muito específicos
  const irregularPatterns = [
    /ESTÁ IRREGULAR PERANTE O FGTS/,
    /ESTÁ\s+IRREGULAR\s+PERANTE/,
    /SITUAÇÃO[^:]{0,20}:\s*IRREGULAR\b/,
    /NÃO ESTÁ EM SITUAÇÃO REGULAR PERANTE O FGTS/,
  ]

  for (const p of regularPatterns) {
    if (p.test(text)) return 'REGULAR'
  }
  for (const p of irregularPatterns) {
    if (p.test(text)) return 'IRREGULAR'
  }
  return null
}

function extractCertData(html) {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
  const validadeMatch = text.match(/Validade[:\s]+(\d{2}\/\d{2}\/\d{4})\s+a\s+(\d{2}\/\d{2}\/\d{4})/i)
  const numMatch      = text.match(/Certificado\s+N[úu]mero[:\s]+(\d+)/i)
    || text.match(/N[úu]mero\s+(?:do\s+)?[Cc]ertificado[:\s]+(\d+)/i)
    || text.match(/(\d{20,})/i) // número longo
  const dataMatch     = text.match(/obtida\s+em[:\s]+(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2})/i)
  return {
    validadeInicio:    validadeMatch?.[1] || null,
    validadeFim:       validadeMatch?.[2] || null,
    numeroCertificado: numMatch?.[1]      || null,
    consultadoEm:      dataMatch?.[1]     || null,
  }
}

function extractEmpresa(html) {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
  // Tenta encontrar o nome da empresa após "EMPRESA" ou "RAZÃO SOCIAL"
  const m = text.match(/(?:EMPRESA|RAZ[ÃA]O SOCIAL)\s*[:\-]?\s*([A-Z][A-ZÁÉÍÓÚÂÊÎÔÛÃÕÀÈÌÒÙÇ][^:.\n]{3,60}?)(?:\s{2,}|\s*CNPJ|\s*CPF)/i)
  return m?.[1]?.trim() || null
}

exports.handler = async (event) => {
  const headers = { 'Content-Type':'application/json','Access-Control-Allow-Origin':'*' }
  if (event.httpMethod === 'OPTIONS') return { statusCode:200, headers, body:'' }

  const cnpj   = (event.queryStringParameters?.cnpj || '').replace(/\D/g,'')
  const uf     = (event.queryStringParameters?.uf   || '').toUpperCase().trim() || 'MG'
  const debug  = event.queryStringParameters?.debug === '1'

  if (!cnpj || cnpj.length !== 14) {
    return { statusCode:400, headers, body: JSON.stringify({ error:'CNPJ inválido' }) }
  }

  try {
    // ── ETAPA 1: GET página ─────────────────────────────────────────────────
    console.log(`[fgts-crf] GET ${BASE} CNPJ=${cnpj} UF=${uf}`)
    const step1 = await fetch(BASE, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.5',
        'Connection': 'keep-alive',
      }
    })
    let cookies = mergeCookies('', step1.headers)
    const html1 = await step1.text()

    const vs1      = extractViewState(html1)
    const hidden1  = extractAllHiddenFields(html1)
    const formId   = extractFormId(html1)
    const submitBtns = findSubmitButton(html1)

    // Descobre o nome real dos campos de CNPJ e UF no formulário
    const cnpjField = findInputField(html1, ['inscricao','cnpj','CNPJ','inscri']) || `${formId}:inscricao`
    const ufField   = findInputField(html1, ['uf','UF','estado']) || `${formId}:uf`

    console.log(`[fgts-crf] formId=${formId} cnpjField=${cnpjField} ufField=${ufField}`)
    console.log(`[fgts-crf] ViewState presente: ${!!vs1}`)
    console.log(`[fgts-crf] Campos hidden:`, JSON.stringify(Object.keys(hidden1)))
    console.log(`[fgts-crf] Botões submit:`, JSON.stringify(submitBtns))

    if (!vs1) {
      return { statusCode:200, headers, body: JSON.stringify({
        status: 'ERRO_VIEWSTATE',
        regular: null,
        message: 'Não foi possível obter ViewState. O site da Caixa pode ter mudado.',
        _debug: debug ? html1.slice(0, 2000) : 'use ?debug=1 para ver o HTML',
      })}
    }

    // ── ETAPA 2: POST formulário ────────────────────────────────────────────
    // Inclui TODOS os campos hidden + os valores do formulário
    const body2 = new URLSearchParams({
      ...hidden1,              // todos os campos hidden do form (incluindo ViewState)
      [cnpjField]: cnpj,       // campo CNPJ detectado
      [ufField]:   uf,         // campo UF detectado
    })

    // Adiciona o botão de submit (simula clique)
    if (submitBtns.length > 0) {
      body2.set(submitBtns[0].name, submitBtns[0].value)
    } else {
      // Fallback: tenta nomes comuns do botão
      body2.set(`${formId}:botaoConsultar`, 'Consultar')
    }

    // Garante que ViewState está no corpo (pode já estar via hidden1)
    if (vs1 && !body2.has('javax.faces.ViewState')) {
      body2.set('javax.faces.ViewState', vs1)
    }

    console.log(`[fgts-crf] POST body keys:`, [...body2.keys()])

    const step2 = await fetch(BASE, {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookies,
        'Referer': BASE,
        'Origin': 'https://consulta-crf.caixa.gov.br',
      },
      body: body2.toString(),
    })
    cookies = mergeCookies(cookies, step2.headers)
    const html2 = await step2.text()
    const result2 = detectResult(html2)
    const vs2 = extractViewState(html2)

    console.log(`[fgts-crf] Etapa 2: HTTP ${step2.status} | resultado=${result2}`)

    // ── Resultado IRREGULAR → para aqui ────────────────────────────────────
    if (result2 === 'IRREGULAR') {
      return { statusCode:200, headers, body: JSON.stringify({
        status: 'IRREGULAR',
        regular: false,
        empresa: extractEmpresa(html2),
        message: 'Empresa com pendências perante o FGTS.',
        _debug: debug ? html2.slice(0,2000) : undefined,
      })}
    }

    // ── Resultado indefinido → retorna diagnóstico ──────────────────────────
    if (result2 !== 'REGULAR') {
      console.warn('[fgts-crf] Resultado indefinido — HTML da etapa 2:', html2.slice(0,500))
      return { statusCode:200, headers, body: JSON.stringify({
        status: 'INDEFINIDO',
        regular: null,
        message: 'Não foi possível identificar o resultado. Verifique os logs do Netlify.',
        // Sempre retorna debug HTML neste caso para diagnóstico
        _debug_html_preview: html2.slice(0, 2000),
        _form_fields_detected: { formId, cnpjField, ufField, submitBtns },
        _hidden_fields: Object.keys(hidden1),
      })}
    }

    // ── REGULAR → tenta gerar certificado ──────────────────────────────────
    const empresa = extractEmpresa(html2)
    let certData  = extractCertData(html2) // tenta extrair da própria página de resultado

    if (vs2 && !certData.numeroCertificado) {
      const hidden2   = extractAllHiddenFields(html2)
      const certBtns  = findSubmitButton(html2)
        .filter(b => /cert|emitir|obter|gerar/i.test(b.name + b.value))

      if (certBtns.length > 0) {
        const body3 = new URLSearchParams({ ...hidden2 })
        body3.set(certBtns[0].name, certBtns[0].value)
        if (!body3.has('javax.faces.ViewState')) body3.set('javax.faces.ViewState', vs2)

        const step3 = await fetch(BASE, {
          method: 'POST',
          headers: {
            'User-Agent': UA,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Cookie': cookies,
            'Referer': BASE,
          },
          body: body3.toString(),
        })
        const html3 = await step3.text()
        console.log(`[fgts-crf] Etapa 3 (cert): HTTP ${step3.status}`)
        certData = extractCertData(html3)
        if (!certData.numeroCertificado) certData = extractCertData(html2)
      }
    }

    console.log(`[fgts-crf] ✅ REGULAR | empresa=${empresa} | cert=${certData.numeroCertificado}`)

    return { statusCode:200, headers, body: JSON.stringify({
      status: 'REGULAR',
      regular: true,
      empresa,
      validadeInicio:    certData.validadeInicio,
      validadeFim:       certData.validadeFim,
      numeroCertificado: certData.numeroCertificado,
      consultadoEm:      certData.consultadoEm || new Date().toISOString(),
      message: certData.validadeFim
        ? `✅ FGTS regular. Validade: ${certData.validadeInicio} a ${certData.validadeFim}`
        : '✅ Empresa regular perante o FGTS.',
      _debug: debug ? html2.slice(0,1000) : undefined,
    })}

  } catch (err) {
    console.error('[fgts-crf] Erro:', err.message)
    return { statusCode:500, headers, body: JSON.stringify({
      error: 'Erro na consulta FGTS',
      detail: err.message,
    })}
  }
}
