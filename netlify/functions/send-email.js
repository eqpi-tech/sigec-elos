// netlify/functions/send-email.js
// Utilitário de e-mail via Resend.io
// RESEND_API_KEY nas env vars do Netlify
// Free tier: 100 emails/day
// Cadastro: https://resend.com (plano grátis, sem cartão)

const RESEND_API_KEY = process.env.RESEND_API_KEY
const FROM_EMAIL     = process.env.EMAIL_FROM || 'SIGEC-ELOS <noreply@eqpitech.com.br>'
// Em sandbox: use onboarding@resend.dev como from até verificar o domínio eqpitech.com.br

async function sendEmail({ to, subject, html }) {
  if (!RESEND_API_KEY) {
    console.warn('RESEND_API_KEY não configurado — e-mail não enviado')
    return { skipped: true }
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html }),
  })

  const data = await res.json()
  if (!res.ok) throw new Error(`Resend error: ${data.message || JSON.stringify(data)}`)
  return data
}

// Templates de e-mail
const TEMPLATES = {

  // ── Boas-vindas após pagamento ──────────────────────────────────────────────
  welcome: ({ razaoSocial, planType, userEmail }) => ({
    subject: `✅ Bem-vindo ao SIGEC-ELOS! Plano ${planType} ativado`,
    html: `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width"/></head>
<body style="margin:0;padding:0;background:#f4f5f9;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:600px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(46,49,146,.12)">
    <div style="background:linear-gradient(135deg,#2E3192,#3d40b5);padding:32px 40px;text-align:center">
      <h1 style="color:#fff;font-size:28px;margin:0;font-weight:900">SIGEC-ELOS</h1>
      <p style="color:rgba(255,255,255,.7);margin:6px 0 0;font-size:14px">Plataforma de Pré-Homologação EQPI Tech</p>
    </div>
    <div style="padding:40px">
      <h2 style="color:#1a1c5e;font-size:22px;margin:0 0 8px">🎉 Tudo certo! Seu plano foi ativado.</h2>
      <p style="color:#666;font-size:15px;line-height:1.6;margin:0 0 24px">
        Olá <strong>${razaoSocial}</strong>, seu plano <strong style="color:#F47E2F">${planType}</strong> no SIGEC-ELOS foi ativado com sucesso.
        Agora é só enviar seus documentos para iniciar a homologação.
      </p>

      <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:12px;padding:20px;margin-bottom:24px">
        <p style="color:#15803d;font-weight:700;margin:0 0 12px;font-size:14px">📋 Próximos passos:</p>
        <ol style="color:#166534;font-size:14px;margin:0;padding-left:20px;line-height:1.8">
          <li>Faça login em <a href="https://elos.eqpitech.com.br" style="color:#2E3192">elos.eqpitech.com.br</a></li>
          <li>Acesse <strong>Documentos</strong> e envie os documentos obrigatórios</li>
          <li>Aguarde a análise do backoffice EQPI Tech</li>
          <li>Receba seu <strong>Selo ELOS</strong> e fique visível no marketplace!</li>
        </ol>
      </div>

      <div style="text-align:center;margin:32px 0">
        <a href="https://elos.eqpitech.com.br/fornecedor/documentos"
           style="background:linear-gradient(135deg,#F47E2F,#ff9a52);color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:700;font-size:15px;display:inline-block">
          📤 Enviar Documentos Agora →
        </a>
      </div>

      <p style="color:#9B9B9B;font-size:13px;text-align:center;margin:24px 0 0">
        Dúvidas? Responda este e-mail ou acesse o painel.<br>
        <strong>EQPI Tech</strong> · Equipe SIGEC-ELOS
      </p>
    </div>
  </div>
</body>
</html>`,
  }),

  // ── Documento vencendo ──────────────────────────────────────────────────────
  expiring: ({ razaoSocial, documents }) => ({
    subject: `⚠️ ${documents.length} documento(s) vencendo — mantenha seu Selo ELOS ativo`,
    html: `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width"/></head>
<body style="margin:0;padding:0;background:#f4f5f9;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:600px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(46,49,146,.12)">
    <div style="background:linear-gradient(135deg,#2E3192,#3d40b5);padding:32px 40px;text-align:center">
      <h1 style="color:#fff;font-size:28px;margin:0;font-weight:900">SIGEC-ELOS</h1>
    </div>
    <div style="padding:40px">
      <h2 style="color:#1a1c5e;font-size:22px;margin:0 0 8px">⚠️ Atenção: documentos vencendo</h2>
      <p style="color:#666;font-size:15px;line-height:1.6;margin:0 0 24px">
        Olá <strong>${razaoSocial}</strong>, identificamos que os documentos abaixo vencerão em breve.
        Renove-os para manter seu <strong>Selo ELOS ativo</strong> e continuar visível no marketplace.
      </p>

      <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:20px;margin-bottom:24px">
        ${documents.map(d => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #fee0b4">
            <span style="font-weight:600;color:#92400e;font-size:14px">${d.label}</span>
            <span style="background:#dc2626;color:#fff;font-size:11px;font-weight:700;padding:2px 10px;border-radius:20px">
              Vence ${new Date(d.expires_at).toLocaleDateString('pt-BR')}
            </span>
          </div>
        `).join('')}
      </div>

      <div style="text-align:center;margin:32px 0">
        <a href="https://elos.eqpitech.com.br/fornecedor/documentos"
           style="background:linear-gradient(135deg,#F47E2F,#ff9a52);color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:700;font-size:15px;display:inline-block">
          📋 Renovar Documentos →
        </a>
      </div>

      <p style="color:#9B9B9B;font-size:13px;text-align:center;margin:0">
        Se o Selo ELOS for suspenso por falta de documentação, você deixará de aparecer no marketplace.<br>
        <strong>EQPI Tech</strong> · Equipe SIGEC-ELOS
      </p>
    </div>
  </div>
</body>
</html>`,
  }),

  // ── Senha redefinida com sucesso ────────────────────────────────────────────
  passwordChanged: ({ name }) => ({
    subject: 'Senha alterada com sucesso — SIGEC-ELOS',
    html: `
<body style="margin:0;padding:40px;background:#f4f5f9;font-family:Arial,sans-serif">
  <div style="max-width:500px;margin:0 auto;background:#fff;border-radius:16px;padding:40px;box-shadow:0 4px 24px rgba(46,49,146,.12)">
    <h2 style="color:#1a1c5e">🔐 Senha alterada</h2>
    <p style="color:#666">Olá <strong>${name}</strong>, sua senha foi alterada com sucesso.</p>
    <p style="color:#666">Se não foi você, entre em contato imediatamente respondendo este e-mail.</p>
    <a href="https://elos.eqpitech.com.br/login" style="background:#2E3192;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;display:inline-block;margin-top:16px;font-weight:700">Acessar plataforma</a>
  </div>
</body>`,
  }),
}

exports.handler = async (event) => {
  const headers = { 'Content-Type':'application/json', 'Access-Control-Allow-Origin':'*' }
  if (event.httpMethod === 'OPTIONS') return { statusCode:200, headers, body:'' }
  if (event.httpMethod !== 'POST') return { statusCode:405, headers, body: JSON.stringify({ error:'Method not allowed' }) }

  try {
    const { to, template, data } = JSON.parse(event.body)
    if (!to || !template || !TEMPLATES[template]) {
      return { statusCode:400, headers, body: JSON.stringify({ error:'to, template são obrigatórios' }) }
    }

    const { subject, html } = TEMPLATES[template](data || {})
    const result = await sendEmail({ to, subject, html })

    return { statusCode:200, headers, body: JSON.stringify({ success:true, result }) }
  } catch (err) {
    console.error('send-email error:', err)
    return { statusCode:500, headers, body: JSON.stringify({ error: err.message }) }
  }
}

// Exporta para uso interno em outras Netlify Functions
module.exports.sendEmail    = sendEmail
module.exports.TEMPLATES    = TEMPLATES
