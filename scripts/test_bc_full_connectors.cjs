// Estágio 8 (handoff §12) — testa os conectores Full contra CNPJ real.
// Os Infosimples consomem créditos (~R$0,24-0,40 cada). local_db usa
// SUPABASE_URL/SERVICE_ROLE_KEY do ambiente (ou _PREVIEW com --preview).
// Uso: node scripts/test_bc_full_connectors.cjs <cnpj> [slugs...] [--preview]
const fs = require('fs')
for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
  const mm = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (mm && !process.env[mm[1]]) process.env[mm[1]] = mm[2].replace(/^"|"$/g, '')
}
const args = process.argv.slice(2).filter((a) => a !== '--preview')
if (process.argv.includes('--preview')) {
  process.env.SUPABASE_URL = process.env.SUPABASE_URL_PREVIEW
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY_PREVIEW
}
const registry = require('../netlify/functions/lib/connectors/index.js')

async function main() {
  const cnpj = String(args[0] || '').replace(/\D/g, '')
  if (cnpj.length !== 14) { console.error('informe um CNPJ com 14 dígitos'); process.exit(1) }
  const slugs = args.slice(1)
  if (!slugs.length) { console.error('informe os slugs a testar'); process.exit(1) }

  const base = registry.cnpj_base
  const parsedBase = base.parse(await base.fetch({ cnpj }))
  const ctx = { cnpj, tipo: 'full', prefOverrides: {}, ...base.extractContext(parsedBase) }
  console.log(`contexto: ${ctx.company?.razao_social} · ${ctx.company?.municipio}/${ctx.company?.uf} · ${ctx.socios.length} sócio(s)\n`)

  for (const slug of slugs) {
    const c = registry[slug]
    if (!c) { console.error(`desconhecido: ${slug}`); continue }
    const t0 = Date.now()
    try {
      const raw = await c.fetch(ctx)
      const p = c.parse(raw)
      console.log(`${slug.padEnd(16)} ${String(raw.code ?? '-').padEnd(5)} flag=${p.result_flag.padEnd(12)} ${Date.now() - t0}ms · ${p.headline}`)
    } catch (e) {
      console.log(`${slug.padEnd(16)} FALHOU ${Date.now() - t0}ms · ${e.message.slice(0, 100)}`)
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
