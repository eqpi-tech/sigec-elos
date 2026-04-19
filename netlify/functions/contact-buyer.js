// Envia formulário de interesse de Comprador para comercial@eqpitech.com.br
exports.handler = async (event) => {
  const h = { 'Content-Type':'application/json','Access-Control-Allow-Origin':'*' }
  if (event.httpMethod === 'OPTIONS') return { statusCode:200, headers:h, body:'' }
  let body; try { body = JSON.parse(event.body) } catch { return { statusCode:400, headers:h, body:'{}' } }
  const { email, empresa } = body
  if (!email) return { statusCode:400, headers:h, body: JSON.stringify({ error:'E-mail obrigatório' }) }

  if (!process.env.RESEND_API_KEY) return { statusCode:200, headers:h, body: JSON.stringify({ ok:true, warn:'no_key' }) }

  const html = `<div style="font-family:Arial,sans-serif;max-width:520px">
    <div style="background:#2E3192;padding:24px;border-radius:12px 12px 0 0;text-align:center">
      <h2 style="color:#fff;margin:0">SIGEC-ELOS — Novo Interesse de Comprador</h2>
    </div>
    <div style="background:#fff;padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px">
      <p><strong>E-mail:</strong> ${email}</p>
      <p><strong>Empresa:</strong> ${empresa || 'Não informado'}</p>
      <p style="color:#9B9B9B;font-size:13px">Enviado pela Landing Page do SIGEC-ELOS</p>
    </div>
  </div>`

  try {
    await fetch('https://api.resend.com/emails', {
      method:'POST',
      headers:{ 'Content-Type':'application/json','Authorization':`Bearer ${process.env.RESEND_API_KEY}` },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || 'noreply@eqpitech.com.br',
        to: ['comercial@eqpitech.com.br'],
        reply_to: email,
        subject: `🏢 Novo interesse de Comprador: ${empresa || email}`,
        html,
      })
    })
    return { statusCode:200, headers:h, body: JSON.stringify({ ok:true }) }
  } catch (e) {
    return { statusCode:500, headers:h, body: JSON.stringify({ error:e.message }) }
  }
}
