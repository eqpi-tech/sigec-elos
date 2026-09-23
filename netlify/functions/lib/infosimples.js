// lib/infosimples.js — cliente único da API Infosimples (handoff §6)
// POST https://api.infosimples.com/api/v2/consultas/<caminho>
// token via env INFOSIMPLES_TOKEN (Netlify env em produção; .env local nos
// testes). NUNCA logar o token. timeout=300 (o deles), abort local em 320s.
//
// Retorno normalizado: { httpStatus, code, codeMessage, data, receipts,
// errors, elapsedMs } — mapeamento de status do conector fica no chamador
// via mapCode() (200 ok · 6xx not_found/failed_soft conforme doc v2).

const crypto = require('crypto')

async function consulta(path, params = {}, { token } = {}) {
  const tk = token || process.env.INFOSIMPLES_TOKEN
  if (!tk) throw new Error('INFOSIMPLES_TOKEN não configurado')
  const body = new URLSearchParams({ token: tk, timeout: '300', ...params })
  const t0 = Date.now()
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 320000)
  try {
    const res = await fetch(`https://api.infosimples.com/api/v2/consultas/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: ctrl.signal,
    })
    const json = await res.json().catch(() => ({}))
    return {
      httpStatus: res.status,
      code: json.code,
      codeMessage: json.code_message,
      data: json.data || [],
      receipts: json.site_receipts || [],
      errors: json.errors || [],
      elapsedMs: Date.now() - t0,
    }
  } finally { clearTimeout(timer) }
}

// Doc API v2: 200 sucesso · 600–699 falhas de consulta (site fora, dado não
// encontrado, validação). Não-encontrado NÃO é erro de infraestrutura.
function mapCode(code, codeMessage = '') {
  if (code === 200) return 'ok'
  if (code === 612) return 'not_found' // 'a consulta não retornou dados' = sem registros (23/09)
  const msg = String(codeMessage).toLowerCase()
  if (code >= 600 && code < 700) {
    if (/n[aã]o (foi )?encontrad|n[aã]o consta|sem resultado|n[aã]o retornou dados|inexistente/.test(msg)) return 'not_found'
    return 'failed_soft'   // site fora do ar / instável → retry do orquestrador
  }
  return 'failed_soft'
}

// Baixa um site_receipt IMEDIATAMENTE (expiram — L6) e devolve buffer+sha256
async function downloadReceipt(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`receipt HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex')
  const ct = res.headers.get('content-type') || 'text/html'
  const ext = ct.includes('pdf') ? 'pdf' : ct.includes('png') ? 'png' : 'html'
  return { buf, sha256, contentType: ct, ext }
}

module.exports = { consulta, mapCode, downloadReceipt }
