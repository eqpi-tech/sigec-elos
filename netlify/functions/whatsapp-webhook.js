// netlify/functions/whatsapp-webhook.js — retorno do Twilio (13/11/2026)
//  · status da mensagem enviada (StatusCallback): sent/delivered/read/failed
//  · mensagem recebida do fornecedor: "SAIR" (e variações) tira o número dos
//    avisos por WhatsApp; qualquer outra recebe a orientação de contato.
// Configurar no Messaging Service do Twilio: Incoming messages → esta URL.
// Segurança: assinatura X-Twilio-Signature conferida com o Auth Token.
const crypto = require('crypto')
const { createClient } = require('@supabase/supabase-js')
const { soDigitos } = require('./lib/whatsapp.js')

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const twiml = (msg) => ({
  statusCode: 200, headers: { 'Content-Type': 'text/xml; charset=utf-8' },
  body: `<?xml version="1.0" encoding="UTF-8"?><Response>${msg ? `<Message>${msg.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</Message>` : ''}</Response>`,
})
const SAIR = /^(sair|parar|pare|stop|cancelar|descadastrar|nao quero|não quero)\b/i

function assinaturaValida(event, params) {
  const token = process.env.TWILIO_AUTH_TOKEN
  const sig = event.headers['x-twilio-signature'] || event.headers['X-Twilio-Signature']
  if (!token || !sig) return false
  const url = event.rawUrl || `${process.env.URL}${event.path}`
  const base = url + Object.keys(params).sort().map((k) => k + params[k]).join('')
  const esperado = crypto.createHmac('sha1', token).update(Buffer.from(base, 'utf-8')).digest('base64')
  return crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(sig)) || false
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: '' }
  const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf-8') : (event.body || '')
  const params = Object.fromEntries(new URLSearchParams(raw))
  let valida = false
  try { valida = assinaturaValida(event, params) } catch { valida = false }
  if (!valida) { console.warn('[whatsapp-webhook] assinatura inválida'); return { statusCode: 403, body: '' } }

  // status de mensagem enviada
  if (params.MessageStatus && params.MessageSid && !params.Body) {
    await sb.from('whatsapp_messages').update({
      status: params.MessageStatus, erro_codigo: params.ErrorCode || null,
      erro_msg: params.ErrorMessage || null, status_em: new Date().toISOString(),
    }).eq('twilio_sid', params.MessageSid)
    return { statusCode: 204, body: '' }
  }

  // mensagem recebida
  const numero = soDigitos(String(params.From || '').replace(/^whatsapp:/, ''))
  const texto = String(params.Body || '').trim()
  await sb.from('whatsapp_messages').insert({ direcao: 'entrada', numero, corpo: texto.slice(0, 2000), twilio_sid: params.MessageSid || null, status: 'received', status_em: new Date().toISOString() })
  if (SAIR.test(texto.normalize('NFD').replace(/\p{Mn}/gu, ''))) {
    const { data: n } = await sb.rpc('whatsapp_optout', { p_numero: numero })
    await sb.from('audit_log').insert({ action: 'WHATSAPP_OPTOUT', entity_type: 'numero', metadata: { numero, empresas: n || 0 } })
    return twiml('Pronto! Você não vai mais receber avisos do SIGEC-ELOS por aqui. Os avisos continuam chegando por e-mail. Para voltar a receber pelo WhatsApp, informe o celular em Meus Dados.')
  }
  return twiml('Este número envia apenas avisos automáticos do SIGEC-ELOS. Para falar com a equipe: suporte@eqpitech.com.br ou WhatsApp (11) 5039-6769. Para não receber mais estes avisos, responda SAIR.')
}
