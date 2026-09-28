// write_build_env.cjs — roda no início do `npm run build`.
// As variáveis de contexto do netlify.toml ([context.*.environment]) existem
// só DURANTE O BUILD: as functions não as enxergam em runtime (verificado no
// staging em 28/09 — ELOS_ENV chegava vazio e a trava de e-mails tratava o
// staging como produção). Este script grava as variáveis NÃO sensíveis de
// ambiente num JSON que o esbuild empacota junto das functions
// (lib/runtime_env.js). Nunca coloque segredo aqui.
const fs = require('fs')
const path = require('path')

const KEYS = ['ELOS_ENV', 'ROUTE_A_ENABLED', 'CONTEXT', 'BRANCH', 'URL', 'DEPLOY_PRIME_URL']
const out = Object.fromEntries(KEYS.filter((k) => process.env[k]).map((k) => [k, process.env[k]]))
const file = path.join(__dirname, '..', 'netlify', 'functions', 'lib', '_build_env.json')
fs.writeFileSync(file, JSON.stringify(out, null, 2) + '\n')
console.log(`[build-env] ${file}: ${Object.keys(out).join(', ') || '(vazio — build local)'}`)
