// Estágio 3 (handoff §12) — testa os conectores da rota A (grátis) contra
// CNPJ real. NÃO consome créditos (APIs públicas + listas locais).
//
// Uso: node scripts/test_bc_free_connectors.cjs <cnpj> [slugs...] [--preview]
//   ex: node scripts/test_bc_free_connectors.cjs 08932635000139
//   --preview: usa SUPABASE_URL_PREVIEW/SUPABASE_SERVICE_ROLE_KEY_PREVIEW
//              para os conectores local_db (listas no banco do branch)

const fs = require('fs')
for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
  const mm = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (mm && !process.env[mm[1]]) process.env[mm[1]] = mm[2].replace(/^"|"$/g, '')
}

const args = process.argv.slice(2).filter((a) => a !== '--preview')
const usePreview = process.argv.includes('--preview')
if (usePreview) {
  if (!process.env.SUPABASE_URL_PREVIEW || !process.env.SUPABASE_SERVICE_ROLE_KEY_PREVIEW) {
    console.error('defina SUPABASE_URL_PREVIEW e SUPABASE_SERVICE_ROLE_KEY_PREVIEW no .env')
    process.exit(1)
  }
  process.env.SUPABASE_URL = process.env.SUPABASE_URL_PREVIEW
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY_PREVIEW
}

const CONNECTORS = {
  cnpj_base:        require('../netlify/functions/lib/connectors/cnpj_base.js'),
  ceis:             require('../netlify/functions/lib/connectors/ceis.js'),
  cnep:             require('../netlify/functions/lib/connectors/cnep.js'),
  cepim:            require('../netlify/functions/lib/connectors/cepim.js'),
  ceaf:             require('../netlify/functions/lib/connectors/ceaf.js'),
  renuncias:        require('../netlify/functions/lib/connectors/renuncias.js'),
  trabalho_escravo: require('../netlify/functions/lib/connectors/trabalho_escravo.js'),
  ofac:             require('../netlify/functions/lib/connectors/ofac.js'),
  onu:              require('../netlify/functions/lib/connectors/onu.js'),
  leniencia:        require('../netlify/functions/lib/connectors/leniencia.js'),
}

async function main() {
  const cnpj = String(args[0] || '').replace(/\D/g, '')
  if (cnpj.length !== 14) { console.error('informe um CNPJ com 14 dígitos'); process.exit(1) }
  const slugs = args.slice(1).length ? args.slice(1) : Object.keys(CONNECTORS)

  // cnpj_base primeiro: alimenta company/socios dos demais (como no orquestrador)
  let ctx = { cnpj, company: {}, socios: [] }
  if (slugs.some((s) => ['ceaf', 'ofac', 'onu'].includes(s)) || slugs.includes('cnpj_base')) {
    try {
      const base = CONNECTORS.cnpj_base
      const raw = await base.fetch(ctx)
      const parsed = base.parse(raw)
      ctx = { cnpj, ...base.extractContext(parsed) }
      console.log(`contexto: ${ctx.company?.razao_social || '?'} · ${ctx.socios.length} sócio(s) no QSA`)
    } catch (e) { console.warn(`cnpj_base p/ contexto falhou: ${e.message}`) }
  }

  for (const slug of slugs) {
    const c = CONNECTORS[slug]
    if (!c) { console.error(`conector desconhecido: ${slug}`); continue }
    process.stdout.write(`\n── ${slug} (${cnpj}) · route=${c.route} ──\n`)
    const t0 = Date.now()
    try {
      const raw = await c.fetch(ctx)
      const parsed = c.parse(raw)
      console.log(`  ok em ${Date.now() - t0}ms`)
      console.log(`  → ${parsed.headline}`)
      console.log(`  flag=${parsed.result_flag}`)
      const d = JSON.stringify(parsed.details)
      console.log(`  details: ${d.length > 400 ? d.slice(0, 400) + '…' : d}`)
    } catch (e) {
      console.error(`  FALHOU (${Date.now() - t0}ms): ${e.message}`)
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
