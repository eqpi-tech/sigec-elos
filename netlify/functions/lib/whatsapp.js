// lib/whatsapp.js — WhatsApp (Twilio + modelos aprovados pela Meta) como último
// recurso nos lembretes (13/11/2026; decisões do Luiz em memória/whatsapp_lembretes).
// · Só envia com o modelo APROVADO na Meta (consulta o Twilio a cada rodada) —
//   antes disso a rotina segue só com e-mail, sem erro.
// · Fora de produção vai SEMPRE para WHATSAPP_TEST_TO (nunca para fornecedor real).
// · Pausa: app_settings 'whatsapp_pausado' = true.
// · Número no banco: só dígitos (5527998123456); no Twilio: whatsapp:+5527998123456.
const { env, functionsUrl } = require('./runtime_env.js')

const MODELOS = { pendencias: 'TWILIO_CONTENT_PENDENCIAS', vencidos: 'TWILIO_CONTENT_VENCIDOS' }
const isProd = () => (env('ELOS_ENV') || 'production') === 'production'

// número para o Twilio: whatsapp:+55DDD9XXXXXXXX (null se não for celular BR válido)
function paraTwilio(numero) {
  let d = String(numero || '').replace(/\D/g, '')
  if (/^[1-9]\d9\d{8}$/.test(d)) d = '55' + d
  return /^55[1-9]\d9\d{8}$/.test(d) ? `whatsapp:+${d}` : null
}
// 11 dígitos (DDD + celular) ganham o 55 — inclusive DDD 55 (Santa Maria/RS)
const soDigitos = (n) => { const d = String(n || '').replace(/\D/g, ''); return /^[1-9]\d9\d{8}$/.test(d) ? '55' + d : d }

const auth = () => 'Basic ' + Buffer.from(`${env('TWILIO_ACCOUNT_SID')}:${env('TWILIO_AUTH_TOKEN')}`).toString('base64')
const configurado = () => !!(env('TWILIO_ACCOUNT_SID') && env('TWILIO_AUTH_TOKEN') && env('TWILIO_MESSAGING_SERVICE_SID'))

const aprovadoCache = {}
async function modeloAprovado(modelo) {
  const sid = env(MODELOS[modelo])
  if (!sid || !configurado()) return false
  if (sid in aprovadoCache) return aprovadoCache[sid]
  try {
    const r = await fetch(`https://content.twilio.com/v1/Content/${sid}/ApprovalRequests`, { headers: { Authorization: auth() }, signal: AbortSignal.timeout(10000) })
    const d = r.ok ? await r.json() : {}
    aprovadoCache[sid] = d?.whatsapp?.status === 'approved'
  } catch { aprovadoCache[sid] = false }
  return aprovadoCache[sid]
}

async function pausado(sb) {
  const { data } = await sb.from('app_settings').select('value').eq('key', 'whatsapp_pausado').maybeSingle()
  return data?.value === true || data?.value?.pausado === true
}

// Pronto para enviar este modelo? { ok, motivo }
async function disponivel(sb, modelo) {
  if (!configurado() || !env(MODELOS[modelo])) return { ok: false, motivo: 'sem_configuracao' }
  if (await pausado(sb)) return { ok: false, motivo: 'pausado' }
  if (!(await modeloAprovado(modelo))) return { ok: false, motivo: 'modelo_nao_aprovado' }
  if (!isProd() && !paraTwilio(env('WHATSAPP_TEST_TO'))) return { ok: false, motivo: 'staging_sem_numero_de_teste' }
  return { ok: true }
}

// Envia um modelo. variaveis: { 1: '...', 2: '...' }. Registra em whatsapp_messages.
async function enviar(sb, { numero, modelo, variaveis, sealIds = [], supplierIds = [] }) {
  const destino = isProd() ? paraTwilio(numero) : paraTwilio(env('WHATSAPP_TEST_TO'))
  if (!destino) return { ok: false, motivo: 'numero_invalido' }
  const form = new URLSearchParams({
    MessagingServiceSid: env('TWILIO_MESSAGING_SERVICE_SID'),
    To: destino,
    ContentSid: env(MODELOS[modelo]),
    ContentVariables: JSON.stringify(Object.fromEntries(Object.entries(variaveis).map(([k, v]) => [k, String(v ?? '').slice(0, 300)]))),
    StatusCallback: `${functionsUrl()}/.netlify/functions/whatsapp-webhook`,
  })
  let r, d
  try {
    r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env('TWILIO_ACCOUNT_SID')}/Messages.json`,
      { method: 'POST', headers: { Authorization: auth(), 'Content-Type': 'application/x-www-form-urlencoded' }, body: form, signal: AbortSignal.timeout(15000) })
    d = await r.json().catch(() => ({}))
  } catch (e) { d = { message: e.message } }
  const ok = !!r?.ok
  await sb.from('whatsapp_messages').insert({
    direcao: 'saida', modelo, numero: soDigitos(numero), supplier_ids: supplierIds, seal_ids: sealIds, variaveis,
    twilio_sid: d?.sid || null, status: ok ? (d.status || 'queued') : 'failed',
    erro_codigo: ok ? null : String(d?.code || r?.status || ''), erro_msg: ok ? null : String(d?.message || '').slice(0, 500),
    status_em: new Date().toISOString(),
  })
  return ok ? { ok: true, sid: d.sid } : { ok: false, motivo: d?.message || `HTTP ${r?.status}` }
}

// "EMPRESA X" ou "EMPRESA X e mais N empresas"
const rotuloEmpresas = (nomes) => {
  const u = [...new Set(nomes.filter(Boolean))]
  return u.length <= 1 ? (u[0] || 'sua empresa') : `${u[0]} e mais ${u.length - 1} empresa${u.length - 1 > 1 ? 's' : ''}`
}

module.exports = { paraTwilio, soDigitos, disponivel, enviar, modeloAprovado, rotuloEmpresas, isProd }
