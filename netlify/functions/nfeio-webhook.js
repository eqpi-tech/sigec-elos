// netlify/functions/nfeio-webhook.js
// Callback da NFE.io (mesmo contrato do lambda do HOC: dados em body.payload).
// Atualiza numero/código de verificação/status da nota em nfe_invoices.
// Registrar na NFE.io: https://elos.eqpitech.com.br/.netlify/functions/nfeio-webhook

const { createClient } = require('@supabase/supabase-js')

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST' || !event.body)
    return { statusCode: 200, body: 'Endpoint acessível' }

  try {
    const parsed = JSON.parse(event.body)
    const nota = parsed.payload           // NFE.io envia os dados dentro de "payload"
    if (!nota?.id)
      return { statusCode: 200, body: 'Teste de webhook recebido' }

    const { error } = await supabaseAdmin.from('nfe_invoices').update({
      nfe_status:         nota.status || null,
      numero:             nota.number ? String(nota.number) : null,
      codigo_verificacao: nota.checkCode || null,
      ...(String(nota.status || '').toLowerCase() === 'cancelled' ? { status: 'FAILED', log_erro: 'Cancelada na NFE.io' } : {}),
    }).eq('nfeio_id', nota.id)
    if (error) console.error('[nfeio-webhook]', error.message)

    console.log(`[nfeio-webhook] nota ${nota.id} → ${nota.status} (nº ${nota.number || '—'})`)
    return { statusCode: 200, body: JSON.stringify({ ok: true }) }
  } catch (e) {
    console.error('[nfeio-webhook]', e.message)
    return { statusCode: 200, body: 'ok' }  // nunca fazer a NFE.io reenviar em loop
  }
}
