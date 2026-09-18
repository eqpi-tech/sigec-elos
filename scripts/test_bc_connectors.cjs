// Estágio 2 (handoff §12) — testa os conectores-piloto contra CNPJ REAL,
// grava source_results (raw+parsed+custo) e persiste os receipts no bucket
// bc-reports com SHA-256 (L6). Cada execução CONSOME créditos Infosimples.
//
// Uso: node scripts/test_bc_connectors.js <cnpj> [slugs...]
//   ex: node scripts/test_bc_connectors.js 08932635000139 pgfn_cnd fgts_crf cndt

// .env manual (sem depender de dotenv)
const fs = require('fs')
for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
  const mm = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (mm && !process.env[mm[1]]) process.env[mm[1]] = mm[2].replace(/^"|"$/g, '')
}

const { createClient } = require('@supabase/supabase-js')
const { downloadReceipt, mapCode } = require('../netlify/functions/lib/infosimples.js')

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const CONNECTORS = {
  pgfn_cnd: require('../netlify/functions/lib/connectors/pgfn_cnd.js'),
  fgts_crf: require('../netlify/functions/lib/connectors/fgts_crf.js'),
  cndt:     require('../netlify/functions/lib/connectors/cndt.js'),
}

async function main() {
  const cnpj = String(process.argv[2] || '').replace(/\D/g, '')
  if (cnpj.length !== 14) { console.error('informe um CNPJ com 14 dígitos'); process.exit(1) }
  const slugs = process.argv.slice(3).length ? process.argv.slice(3) : Object.keys(CONNECTORS)

  for (const slug of slugs) {
    const c = CONNECTORS[slug]
    if (!c) { console.error(`conector desconhecido: ${slug}`); continue }
    process.stdout.write(`\n── ${slug} (${cnpj}) ──\n`)
    const t0 = Date.now()
    let raw, parsed, status
    try {
      raw = await c.fetch({ cnpj })
      status = mapCode(raw.code, raw.codeMessage)
      parsed = c.parse(raw)
    } catch (e) {
      raw = { error: e.message }; status = 'failed_soft'
      parsed = { result_flag: 'indisponivel', headline: `${slug}: erro — ${e.message}`, details: {}, evidence: [] }
    }
    const cost = status === 'ok' || status === 'not_found' ? c.costBase + c.costExtra : 0
    console.log(`  code=${raw.code} (${raw.codeMessage || '-'}) status=${status} ${Date.now() - t0}ms`)
    console.log(`  → ${parsed.headline}`)
    console.log(`  flag=${parsed.result_flag} · validade=${parsed.details?.validade_oficial || '-'} · protocolo=${parsed.protocol || '-'}`)

    // persiste source_result
    const validUntil = new Date(Date.now() + c.ttlDays * 24 * 3600 * 1000).toISOString()
    const { data: sr, error: srErr } = await sb.from('source_results').insert({
      cnpj, connector: slug, route: c.route, status,
      parsed, raw, result_flag: parsed.result_flag,
      cost_brl: cost, valid_until: validUntil, protocol: parsed.protocol || null,
    }).select('id').single()
    if (srErr) { console.error('  save source_results:', srErr.message); continue }

    // baixa receipts imediatamente (expiram) e sobe ao bucket com sha256
    let i = 0
    for (const ev of (parsed.evidence || [])) {
      if (!ev.url) continue
      try {
        const { buf, sha256, contentType, ext } = await downloadReceipt(ev.url)
        const path = `evidences/${cnpj}/${slug}-${Date.now()}-${i++}.${ext}`
        const { error: upErr } = await sb.storage.from('bc-reports')
          .upload(path, buf, { contentType, upsert: true })
        if (upErr) throw new Error(upErr.message)
        await sb.from('report_evidences').insert({
          source_result_id: sr.id, kind: ev.kind, storage_path: path, sha256,
        })
        console.log(`  🧾 receipt salvo: ${path} (${(buf.length / 1024).toFixed(0)} KB, sha256 ${sha256.slice(0, 12)}…)`)
      } catch (e) { console.warn(`  receipt falhou: ${e.message}`) }
    }
    console.log(`  💰 custo registrado: R$ ${cost.toFixed(2)} · TTL até ${validUntil.slice(0, 10)}`)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
