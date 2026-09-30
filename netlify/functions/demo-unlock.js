// netlify/functions/demo-unlock.js — libera o perfil "Backoffice EQPI" do
// /demo (30/09). O /demo é público (clientes o acessam); a operação interna
// só aparece com o código de acesso, conferido AQUI — o código não vai no
// pacote do site. Valor na variável de ambiente DEMO_BACKOFFICE_CODE
// (painel do Netlify); sem ela, o perfil fica indisponível.
//
// POST body: { code }  →  200 { ok: true } | 403 | 503

const crypto = require('crypto')

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const igual = (a, b) => {
  const x = crypto.createHash('sha256').update(String(a)).digest()
  const y = crypto.createHash('sha256').update(String(b)).digest()
  return crypto.timingSafeEqual(x, y)
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: HEADERS, body: '' }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) }

  const esperado = process.env.DEMO_BACKOFFICE_CODE
  if (!esperado) return { statusCode: 503, headers: HEADERS, body: JSON.stringify({ error: 'Acesso interno não configurado' }) }

  let code = ''
  try { code = String(JSON.parse(event.body || '{}').code || '').trim() } catch { /* corpo inválido = código errado */ }

  if (!code || !igual(code, esperado)) {
    // atraso fixo: torna tentativa-e-erro lenta
    await new Promise((ok) => setTimeout(ok, 1200))
    return { statusCode: 403, headers: HEADERS, body: JSON.stringify({ error: 'Código inválido' }) }
  }
  return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: true }) }
}
