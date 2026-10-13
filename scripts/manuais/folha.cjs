// Folha de miniaturas para revisão: node scripts/manuais/folha.cjs fornecedor
const fs = require('fs'), path = require('path')
const { browser } = require('./shoot_lib.cjs')
const m = process.argv[2], dir = path.resolve(__dirname, '../../docs/manuais/img', m)
const arqs = fs.readdirSync(dir).filter(f => f.endsWith('.jpg')).sort()
const html = `<html><body style="margin:0;font:12px sans-serif;display:grid;grid-template-columns:repeat(4,480px);gap:6px;background:#fff">${arqs.map(a =>
  `<div><div>${a}</div><img src="file://${dir}/${a}" style="width:480px;height:300px;object-fit:cover;object-position:top;border:1px solid #ccc"></div>`).join('')}</body></html>`
const tmp = path.join(require('os').tmpdir(), `folha_${m}.html`); fs.writeFileSync(tmp, html)
;(async () => { const b = await browser(); const p = await b.newPage({ viewport: { width: 1940, height: 800 } })
  await p.goto('file://' + tmp); await p.waitForTimeout(1500)
  const out = process.argv[3] || `/tmp/folha_${m}.jpg`
  await p.screenshot({ path: out, fullPage: true, type: 'jpeg', quality: 70 }); console.log(out); await b.close() })()
