// lib/runtime_env.js — variáveis de ambiente não sensíveis das functions.
// Ordem: process.env (painel do Netlify) → _build_env.json (gerado no build
// por scripts/write_build_env.cjs a partir do contexto do netlify.toml).
// Sem nenhuma das duas, o valor é undefined.
let built = {}
try { built = require('./_build_env.json') } catch { /* build local sem o arquivo */ }

const env = (k) => process.env[k] || built[k]

// Endereços do site. Em PRODUÇÃO, exatamente o que já se usava. Fora dela,
// o próprio deploy (DEPLOY_PRIME_URL do build): no branch deploy o Netlify
// preenche URL com o endereço PRINCIPAL do site — um convite do staging
// apontava para produção e uma function do staging chamava o send-email de
// produção (28/09).
const isProdEnv = () => (env('ELOS_ENV') || 'production') === 'production'
const PROD_SITE = 'https://elos.eqpitech.com.br'
// link que vai para o navegador (e-mails, retorno do Stripe)
const frontendUrl = () => isProdEnv()
  ? (process.env.FRONTEND_URL || PROD_SITE)
  : (env('DEPLOY_PRIME_URL') || process.env.FRONTEND_URL || PROD_SITE)
// base para uma function chamar outra function
const functionsUrl = () => isProdEnv()
  ? (process.env.URL || process.env.FRONTEND_URL || PROD_SITE)
  : (env('DEPLOY_PRIME_URL') || process.env.URL)

module.exports = { env, frontendUrl, functionsUrl }
