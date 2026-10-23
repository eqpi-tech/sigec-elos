// Imagens do Manual do Backoffice — node scripts/manuais/shoot_backoffice.cjs
const { browser, entrar, ir, foto, borrar, borrarLinhas, escolher, clicar, buscarEscolher } = require('./shoot_lib.cjs')
const SO = process.argv[2] ? process.argv[2].split(',') : null   // refazer só algumas: node … 01,03,14
const quer = (n) => !SO || SO.includes(n)
const M = 'backoffice'
const CONSTRUTORA = 'e1a00000-0000-4000-8000-000000000101', BETA = 'e1a00000-0000-4000-8000-000000000103'
;(async () => {
  const b = await browser()
  const p = await entrar(b, 'analista@eqpi-exemplo.com.br')
  if (quer('01')) { await ir(p, '/backoffice'); await borrarLinhas(p, 'tr, li'); await borrar(p, 'Limite ultrapassado'); await borrar(p, 'Limite hoje'); await borrar(p, 'Risco'); await foto(p, M, '01-inicio', { clip: { x: 0, y: 0, width: 1440, height: 900 } }) }
  if (quer('02')) { await ir(p, '/backoffice/analise-documentos'); await escolher(p, 'Mineradora Exemplo'); await foto(p, M, '02-analise-documentos', { full: true }) }
  if (quer('03')) { await ir(p, '/backoffice/analise-documentos'); await escolher(p, 'Mineradora Exemplo')
    // abre a edição do documento do FGTS (tem sugestão da fonte oficial)
    await p.evaluate(() => {
      const bts = [...document.querySelectorAll('button')].filter(b => (b.innerText || '').includes('Editar'))
      const alvo = bts.find(b => { let c = b; for (let i = 0; i < 8 && c; i++, c = c.parentElement) if ((c.innerText || '').includes('FGTS') && !(c.innerText || '').includes('CNDT')) return true; return false })
      ;(alvo || bts[1] || bts[0])?.click()
    })
    await p.waitForTimeout(3000); await foto(p, M, '03-editar-documento', { full: true }) }
  if (quer('04')) { await ir(p, '/backoffice/processos'); await escolher(p, 'Mineradora Exemplo'); await clicar(p, 'Pesquisar', 5000); await foto(p, M, '04-processos', { full: true }) }
  if (quer('05')) { await ir(p, `/backoffice/analise/${BETA}`, 5000); await foto(p, M, '05-ficha-processo', { full: true }) }
  if (quer('06')) { await ir(p, `/backoffice/analise/${CONSTRUTORA}`, 5000); await escolher(p, 'ELOS'); await foto(p, M, '06-ficha-coleta-automatica', { full: true }) }
  if (quer('07')) { await ir(p, '/backoffice/homologados'); await borrar(p, 'Ver Ficha'); await foto(p, M, '07-homologados') }
  if (quer('08')) { await ir(p, '/backoffice/convites'); await escolher(p, 'Mineradora Exemplo'); await clicar(p, 'Pesquisar', 4000); await foto(p, M, '08-convites') }
  if (quer('09')) { await ir(p, '/backoffice/questionarios'); await escolher(p, 'Mineradora Exemplo'); await clicar(p, 'Questionário de Compliance'); await foto(p, M, '09-questionarios') }
  if (quer('10')) { await ir(p, '/backoffice/metricas'); await borrarLinhas(p, 'tr'); await foto(p, M, '10-financeiro') }
  if (quer('10')) {
    await clicar(p, '📥 Custos Captura', 4000); await borrarLinhas(p, 'tr'); await foto(p, M, '11-custos-captura', { full: true })
    await clicar(p, '🤖 Custos IA', 4000); await borrarLinhas(p, 'tr'); await foto(p, M, '12-custos-ia', { full: true })
  }
  if (quer('22')) {
    await ir(p, '/backoffice/metricas'); await clicar(p, '🤝 Subsidiados', 3000)
    await p.locator('#sub-de').fill('').catch(() => {}); await p.locator('#sub-pagamento').selectOption('todos').catch(() => {}); await p.waitForTimeout(1500)
    await borrarLinhas(p, 'tr'); await foto(p, M, '22-financeiro-subsidiados', { full: true })
  }
  if (quer('13')) { await ir(p, '/backoffice/clientes'); await borrar(p, '✏ Editar'); await foto(p, M, '13-clientes') }
  if (quer('14')) { await ir(p, '/backoffice/fluxo-documentos'); await buscarEscolher(p, 'Buscar cliente', 'Mineradora', 'Mineradora Exemplo'); await foto(p, M, '14-fluxos', { full: true }) }
  if (quer('15')) { await ir(p, '/backoffice/landing-pages'); await buscarEscolher(p, 'Buscar cliente', 'Mineradora', 'Mineradora Exemplo'); await foto(p, M, '15-portais') }
  if (quer('16')) { await ir(p, '/backoffice/usuarios'); await p.fill('input[placeholder*="nome"]', 'exemplo').catch(() => {}); await p.waitForTimeout(2500); await borrarLinhas(p, 'tr'); await foto(p, M, '16-usuarios') }
  if (quer('17')) { await ir(p, '/backoffice/perfis'); await foto(p, M, '17-perfis') }
  if (quer('18')) { await ir(p, '/backoffice/catalogo-documentos'); await p.locator('input[placeholder*="Buscar"]').first().fill('Certidão').catch(() => {}); await p.waitForTimeout(2000); await foto(p, M, '18-catalogo') }
  if (quer('19')) { await ir(p, '/backoffice/feriados'); await foto(p, M, '19-feriados') }
  if (quer('20')) { await ir(p, '/backoffice/precos'); await foto(p, M, '20-precos') }
  if (quer('21')) { await ir(p, '/backoffice/comunicados'); await foto(p, M, '21-comunicados') }
  await b.close()
})()
