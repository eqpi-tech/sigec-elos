// lib/runtime_env.js — variáveis de ambiente não sensíveis das functions.
// Ordem: process.env (painel do Netlify) → _build_env.json (gerado no build
// por scripts/write_build_env.cjs a partir do contexto do netlify.toml).
// Sem nenhuma das duas, o valor é undefined.
let built = {}
try { built = require('./_build_env.json') } catch { /* build local sem o arquivo */ }

const env = (k) => process.env[k] || built[k]

module.exports = { env }
