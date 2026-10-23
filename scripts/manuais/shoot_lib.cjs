// Utilitários das imagens dos manuais (staging, base fictícia — dataset_staging.sql)
const path = require('path')
const ROOT = path.resolve(__dirname, '../..')
const { chromium } = require(path.join(ROOT, 'node_modules/playwright-core'))
const BASE = process.env.MANUAL_BASE || 'https://staging--sigec-elos.netlify.app'
const SENHA = 'ManualElos#2026'
const OUT = (manual) => path.join(ROOT, 'docs/manuais/img', manual)
// Nomes reais que o staging copia da produção (clientes etc.) e NÃO podem
// aparecer nos manuais: trocados por um nome neutro antes de cada foto. A lista
// fica fora do repositório — variável MANUAIS_OCULTAR no .env (separada por ;)
const OCULTAR = (() => {
  try {
    const env = require('fs').readFileSync(path.join(ROOT, '.env'), 'utf8')
    const m = env.match(/^MANUAIS_OCULTAR=(.*)$/m)
    return (process.env.MANUAIS_OCULTAR || (m ? m[1] : '')).replace(/^["']|["']$/g, '').split(';').map(t => t.trim()).filter(Boolean)
  } catch { return [] }
})()

async function browser() { return chromium.launch({ channel: 'chrome' }) }
async function contexto(b) {
  return b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'pt-BR' })
}
async function entrar(b, email) {
  const ctx = await contexto(b); const p = await ctx.newPage()
  p.on('pageerror', e => console.warn('  [erro JS]', e.message.slice(0, 120)))
  await p.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await p.fill('input[type=email]', email); await p.fill('input[type=password]', SENHA)
  await p.locator('button[type=submit]').first().click(); await p.waitForTimeout(6000)
  return p
}
// espera a tela carregar de verdade: some o spinner e há conteúdo (até 20 s)
async function ir(p, rota, espera = 2500) {
  await p.goto(BASE + rota, { waitUntil: 'networkidle' }).catch(() => {})
  for (let i = 0; i < 40; i++) {
    const ok = await p.evaluate(() => {
      const main = document.body.innerText.length
      const spin = [...document.querySelectorAll('div,svg')].some(el => getComputedStyle(el).animationName && getComputedStyle(el).animationName !== 'none' && el.getBoundingClientRect().width > 20)
      return main > 600 && !spin
    }).catch(() => false)
    if (ok) break
    await p.waitForTimeout(500)
  }
  await p.waitForTimeout(espera)
}
// foto: tela visível (padrão), página inteira (full) ou um elemento (sel)
async function foto(p, manual, nome, { full = false, sel = null, clip = null } = {}) {
  const arq = path.join(OUT(manual), `${nome}.jpg`)
  // esconde o botão flutuante do tour e cursores
  await p.addStyleTag({ content: '*{caret-color:transparent!important}' }).catch(() => {})
  // sem o botão flutuante "Primeiros passos" (tour) nas imagens
  await p.evaluate(() => document.querySelectorAll('body *').forEach(el => {
    if (getComputedStyle(el).position === 'fixed' && /Primeiros passos|Tour concluído/.test(el.innerText || '')) el.style.display = 'none'
  })).catch(() => {})
  if (OCULTAR.length) await p.evaluate((termos) => {
    const re = new RegExp(termos.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gi')
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let n = w.nextNode(); n; n = w.nextNode()) if (re.test(n.nodeValue)) { re.lastIndex = 0; n.nodeValue = n.nodeValue.replace(re, 'Cliente Exemplo') }
    document.querySelectorAll('input, textarea').forEach(el => { if (re.test(el.value)) { re.lastIndex = 0; el.value = el.value.replace(re, 'Cliente Exemplo') } })
  }, OCULTAR).catch(() => {})
  if (sel) await p.locator(sel).first().screenshot({ path: arq, type: 'jpeg', quality: 82 })
  else await p.screenshot({ path: arq, type: 'jpeg', quality: 82, fullPage: full, clip: clip || undefined })
  console.log('  ✓', manual + '/' + nome)
}
// Borra os cartões/linhas que contêm `marcador` (texto de um botão ou rótulo
// presente em cada item) e NÃO citam nenhum nome permitido — tira das imagens
// os dados reais que o staging copia da produção (nomes de clientes etc.)
async function borrar(p, marcador, permitir = ['Exemplo', 'Modelo', 'Alfa', 'Beta', 'Gama', 'Delta', 'Epsilon', 'Ômega', 'Sigma', 'Comercial Exemplo']) {
  await p.evaluate(({ marcador, permitir }) => {
    const alvos = [...document.querySelectorAll('body *')].filter(el => el.children.length === 0 && (el.innerText || '').includes(marcador))
    for (const a of alvos) {
      let c = a
      while (c.parentElement && (c.getBoundingClientRect().height < 70 || c.getBoundingClientRect().width < 220)) c = c.parentElement
      const t = (c.innerText || '').toLowerCase()
      if (!permitir.some(n => t.includes(n.toLowerCase()))) c.style.filter = 'blur(7px)'
    }
  }, { marcador, permitir })
}
// borra QUALQUER elemento de texto que não seja permitido, dentro de um seletor (tabelas/listas)
async function borrarLinhas(p, seletor, permitir = ['Exemplo', 'Modelo', 'Alfa', 'Beta', 'Gama', 'Delta', 'Epsilon', 'Ômega', 'Sigma', 'Comercial Exemplo']) {
  await p.evaluate(({ seletor, permitir }) => {
    document.querySelectorAll(seletor).forEach(el => {
      const t = (el.innerText || '').toLowerCase()
      if (!permitir.some(n => t.includes(n.toLowerCase()))) el.style.filter = 'blur(7px)'
    })
  }, { seletor, permitir })
}
// escolhe, no primeiro <select> que tiver a opção, a opção cujo texto contém `texto`
async function escolher(p, texto) {
  const ok = await p.evaluate((texto) => {
    for (const s of document.querySelectorAll('select')) {
      const o = [...s.options].find(o => o.text.toLowerCase().includes(texto.toLowerCase()))
      if (o) {
        const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
        set.call(s, o.value); s.dispatchEvent(new Event('change', { bubbles: true })); return true
      }
    }
    return false
  }, texto)
  await p.waitForTimeout(3000); return ok
}
async function clicar(p, texto, espera = 2500) { await p.getByText(texto, { exact: false }).first().click().catch(e => console.warn('  [clique]', texto, e.message.slice(0, 60))); await p.waitForTimeout(espera) }
// campo de busca com lista (combobox): digita e clica na opção
async function buscarEscolher(p, placeholder, texto, opcao = texto) {
  await p.locator(`input[placeholder*="${placeholder}"]`).first().fill(texto).catch(() => {})
  await p.waitForTimeout(1200); await p.getByText(opcao, { exact: false }).last().click().catch(() => {})
  await p.waitForTimeout(3500)
}
module.exports = { BASE, browser, contexto, entrar, ir, foto, borrar, borrarLinhas, escolher, clicar, buscarEscolher }
