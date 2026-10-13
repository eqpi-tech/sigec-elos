// Gera os PDFs dos manuais a partir dos .md (docs/manuais/*.md → docs/manuais/pdf/*.pdf)
//   node scripts/manuais/gerar_pdf.cjs            (os 4)
//   node scripts/manuais/gerar_pdf.cjs fornecedor (um)
// Conversor de markdown próprio (só o que os manuais usam) — sem dependência nova.
const fs = require('fs'), path = require('path')
const { browser } = require('./shoot_lib.cjs')
const ROOT = path.resolve(__dirname, '../..'), DOCS = path.join(ROOT, 'docs/manuais')
const TITULOS = { fornecedor: 'Manual do Fornecedor', cliente: 'Manual do Cliente', comprador: 'Manual do Comprador', backoffice: 'Manual do Backoffice' }
const PUBLICO = { fornecedor: 'Para fornecedores', cliente: 'Para empresas contratantes', comprador: 'Para compradores do marketplace', backoffice: 'Uso interno — equipe EQPI' }

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-')
function inline(t) {
  t = esc(t)
  t = t.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => `<img alt="${alt}" src="${src}">`)
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>')
  return t
}
function md2html(md) {
  const L = md.split('\n'), out = []; let i = 0
  const lista = (ordenada) => {
    const tag = ordenada ? 'ol' : 'ul', re = ordenada ? /^(\s*)\d+\.\s+(.*)$/ : /^(\s*)[-*]\s+(.*)$/
    let html = `<${tag}>`, aberto = false
    while (i < L.length && (re.test(L[i]) || /^\s{2,}[-*]\s+/.test(L[i]))) {
      const sub = L[i].match(/^\s{2,}[-*]\s+(.*)$/)
      if (sub) { const items = []; while (i < L.length && /^\s{2,}[-*]\s+/.test(L[i])) items.push(`<li>${inline(L[i++].replace(/^\s+[-*]\s+/, ''))}</li>`); html += `<ul>${items.join('')}</ul>`; continue }
      if (aberto) html += '</li>'
      html += `<li>${inline(L[i].match(re)[2])}`; aberto = true; i++
    }
    return html + (aberto ? '</li>' : '') + `</${tag}>`
  }
  while (i < L.length) {
    const l = L[i]
    if (!l.trim()) { i++; continue }
    let m
    if ((m = l.match(/^(#{1,3})\s+(.*)$/))) { const n = m[1].length; out.push(`<h${n} id="${slug(m[2])}">${inline(m[2])}</h${n}>`); i++; continue }
    if (/^---+\s*$/.test(l)) { out.push('<hr>'); i++; continue }
    if (/^>\s?/.test(l)) { const b = []; while (i < L.length && /^>\s?/.test(L[i])) b.push(L[i++].replace(/^>\s?/, '')); out.push(`<blockquote>${inline(b.join(' '))}</blockquote>`); continue }
    if (/^\|/.test(l)) {
      const rows = []; while (i < L.length && /^\|/.test(L[i])) rows.push(L[i++])
      const cells = (r) => r.replace(/^\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim())
      const head = cells(rows[0]), body = rows.slice(2).map(cells)
      out.push(`<table><thead><tr>${head.map(h => `<th>${inline(h)}</th>`).join('')}</tr></thead><tbody>${body.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`); continue
    }
    if (/^\s*\d+\.\s+/.test(l)) { out.push(lista(true)); continue }
    if (/^\s*[-*]\s+/.test(l)) { out.push(lista(false)); continue }
    if (/^!\[/.test(l.trim())) { const alt = (l.match(/^!\[([^\]]*)\]/) || [])[1] || ''; out.push(`<figure>${inline(l.trim())}${alt ? `<figcaption>${esc(alt)}</figcaption>` : ''}</figure>`); i++; continue }
    const p = []; while (i < L.length && L[i].trim() && !/^(#{1,3}\s|>|\||---|\s*[-*]\s|\s*\d+\.\s|!\[)/.test(L[i])) p.push(L[i++])
    if (p.length) out.push(`<p>${inline(p.join(' '))}</p>`); else { out.push(`<p>${inline(l)}</p>`); i++ }
  }
  return out.join('\n')
}

const CSS = `
@page { size: A4; margin: 18mm 16mm 18mm 16mm; }
* { box-sizing: border-box; }
body { font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1f2937; font-size: 10.5pt; line-height: 1.55; margin: 0; }
.capa { height: 255mm; display: flex; flex-direction: column; justify-content: center; page-break-after: always; border-radius: 14px;
  background: linear-gradient(160deg, #1a1c5e, #2E3192 60%, #1a1c5e); color: #fff; margin: 0; padding: 0 20mm; }
.capa img { height: 64px; width: auto; align-self: flex-start; margin-bottom: 18mm; background: #fff; padding: 10px 14px; border-radius: 14px; }
.capa .tit { font-size: 34pt; font-weight: 800; line-height: 1.1; }
.capa .sub { font-size: 14pt; color: #F47E2F; font-weight: 700; margin-top: 6mm; }
.capa .pub { font-size: 11pt; color: rgba(255,255,255,.75); margin-top: 3mm; }
.capa .rod { margin-top: 40mm; font-size: 9.5pt; color: rgba(255,255,255,.6); }
h1 { display: none; }
h2 { color: #1a1c5e; font-size: 16pt; border-bottom: 3px solid #F47E2F; padding-bottom: 4px; margin: 0 0 10px; page-break-before: always; page-break-after: avoid; }
h2#sumario { page-break-before: auto; }
h3 { color: #2E3192; font-size: 12pt; margin: 16px 0 6px; page-break-after: avoid; }
p { margin: 6px 0; }
a { color: #2E3192; text-decoration: none; }
code { background: #f1f5f9; border-radius: 4px; padding: 1px 4px; font-size: 9.5pt; }
blockquote { margin: 10px 0; padding: 8px 12px; background: #fff7ed; border-left: 4px solid #F47E2F; border-radius: 0 6px 6px 0; page-break-inside: avoid; }
table { border-collapse: collapse; width: 100%; margin: 8px 0 12px; font-size: 9.5pt; page-break-inside: avoid; }
th { background: #2E3192; color: #fff; text-align: left; padding: 6px 8px; }
td { border-bottom: 1px solid #e5e7eb; padding: 5px 8px; vertical-align: top; }
tr:nth-child(even) td { background: #f8f9fb; }
ul, ol { margin: 6px 0 8px; padding-left: 20px; } li { margin: 2px 0; }
figure { margin: 10px 0 14px; page-break-inside: avoid; text-align: center; }
figure img { max-width: 100%; max-height: 175mm; border: 1px solid #e2e4ef; border-radius: 6px; box-shadow: 0 2px 8px rgba(0,0,0,.08); }
figcaption { font-size: 8.5pt; color: #6b7280; margin-top: 4px; }
hr { display: none; }
`

async function gerar(b, m) {
  const md = fs.readFileSync(path.join(DOCS, `manual-${m}.md`), 'utf8')
  const logo = 'data:image/png;base64,' + fs.readFileSync(path.join(ROOT, 'public/logo.png')).toString('base64')
  const hoje = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  // imagens embutidas (o PDF não depende de arquivos soltos)
  const corpo = md2html(md).replace(/src="(img\/[^"]+)"/g, (_, src) =>
    `src="data:image/jpeg;base64,${fs.readFileSync(path.join(DOCS, src)).toString('base64')}"`)
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${TITULOS[m]} — SIGEC-ELOS</title><style>${CSS}</style></head><body>
<section class="capa"><img src="${logo}"><div class="tit">${TITULOS[m]}</div><div class="sub">SIGEC-ELOS</div><div class="pub">${PUBLICO[m]}</div>
<div class="rod">EQPI Tech · elos.eqpitech.com.br · suporte@eqpitech.com.br<br>Versão de ${hoje}</div></section>
${corpo}</body></html>`
  const p = await b.newPage()
  await p.setContent(html, { waitUntil: 'load' })
  fs.mkdirSync(path.join(DOCS, 'pdf'), { recursive: true })
  const out = path.join(DOCS, 'pdf', `manual-${m}.pdf`)
  await p.pdf({ path: out, format: 'A4', printBackground: true, displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate: `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:8px;color:#9ca3af;width:100%;padding:0 16mm;display:flex;justify-content:space-between"><span>${TITULOS[m]} — SIGEC-ELOS</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
    margin: { top: '18mm', bottom: '18mm', left: '16mm', right: '16mm' } })
  await p.close(); console.log('  ✓', path.relative(ROOT, out), (fs.statSync(out).size / 1048576).toFixed(1) + ' MB')
}
;(async () => {
  const lista = process.argv[2] ? [process.argv[2]] : Object.keys(TITULOS)
  const b = await browser(); for (const m of lista) await gerar(b, m); await b.close()
})()
