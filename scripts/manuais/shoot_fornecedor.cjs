// Imagens do Manual do Fornecedor — node scripts/manuais/shoot_fornecedor.cjs
const { BASE, browser, contexto, entrar, ir, foto, borrar } = require('./shoot_lib.cjs')
const M = 'fornecedor'
// consulta à Receita simulada: empresa fictícia (nenhum CNPJ real é consultado)
const RECEITA = {
  cnpj: { cnpj: '90901234000140', razao_social: 'ÔMEGA SERVIÇOS GERAIS LTDA', nome_fantasia: 'Ômega Serviços',
    descricao_situacao_cadastral: 'ATIVA', municipio: 'BELO HORIZONTE', uf: 'MG', cnae_fiscal: 8121400,
    cnae_fiscal_descricao: 'Limpeza em prédios e em domicílios', cnaes_secundarios: [], qsa: [], opcao_pelo_simples: false },
  sanctions: { ceis: [], cnep: [] }, hasSanctions: false, status: 'ATIVA', dbInfo: { isClient: false, isSupplier: false },
}

;(async () => {
  const b = await browser()

  // ── páginas públicas e cadastro pelo portal do cliente ───────────────────
  let ctx = await contexto(b); let p = await ctx.newPage()
  await p.route('**/.netlify/functions/cnpj-lookup*', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify(RECEITA) }))
  await ir(p, '/portal/mineradora-exemplo', 5000)
  await foto(p, M, '01-portal-cliente')
  await ir(p, '/cadastro?ref=mineradora-exemplo&cnpj=90901234000140', 4000)
  await foto(p, M, '02-cadastro-cnpj')
  await p.getByText('Consultar CNPJ').click(); await p.waitForTimeout(3500)
  await p.getByText('Serviços', { exact: true }).first().click().catch(() => {}); await p.waitForTimeout(1200)
  await p.locator('div[style*="width: 18px"]').nth(1).click().catch(() => {}); await p.waitForTimeout(600)
  await foto(p, M, '03-cadastro-categorias')
  await p.getByText('Próximo →').click(); await p.waitForTimeout(800)
  await p.fill('input[placeholder="João da Silva"]', 'Sérgio Nunes')
  await p.fill('input[type=email]', 'sergio.nunes@omegaservicos.com.br')
  const pw = p.locator('input[type=password]'); await pw.nth(0).fill('Exemplo12345'); await pw.nth(1).fill('Exemplo12345')
  await foto(p, M, '04-cadastro-conta')
  await p.getByText('Próximo →').click(); await p.waitForTimeout(1200)
  await foto(p, M, '05-cadastro-termos', { full: true })
  const boxes = p.locator('input[type=checkbox]'); const n = await boxes.count()
  for (let i = 0; i < n; i++) await boxes.nth(i).check()
  await p.getByText('Aceitar e Continuar →').click(); await p.waitForTimeout(2500)
  await foto(p, M, '06-cadastro-plano')
  await ctx.close()

  ctx = await contexto(b); p = await ctx.newPage()
  await ir(p, '/login', 3000); await foto(p, M, '07-login')
  await ir(p, '/verificar', 3000); await foto(p, M, '20-verificar-certificado')
  await ctx.close()

  // ── fornecedor logado (Construtora Modelo) ───────────────────────────────
  p = await entrar(b, 'carlos.lima@construtoramodelo.com.br')
  await ir(p, '/fornecedor', 6000); await foto(p, M, '08-painel', { full: true })
  await ir(p, '/fornecedor/documentos', 6000); await foto(p, M, '09-documentos', { full: true })
  await ir(p, '/fornecedor/processo/e1a41000-0000-4000-8000-000000000401', 5000); await foto(p, M, '10-processo')
  await ir(p, '/fornecedor/certificado/e1a41000-0000-4000-8000-000000000401', 5000); await foto(p, M, '11-certificado')
  await ir(p, '/fornecedor/questionario', 5000); await foto(p, M, '12-questionario')
  await ir(p, '/fornecedor/categorias', 5000); await foto(p, M, '13-categorias')
  await ir(p, '/fornecedor/dados', 5000); await foto(p, M, '14-meus-dados')
  await ir(p, '/fornecedor/clientes', 5000); await borrar(p, 'Quero prestar serviços'); await foto(p, M, '15-clientes-elos')
  await ir(p, '/fornecedor/cotacoes', 5000); await foto(p, M, '16-cotacoes')
  await ir(p, '/fornecedor/equipe', 5000); await foto(p, M, '17-equipe')
  await ir(p, '/fornecedor/planos', 5000); await foto(p, M, '18-planos')
  await ir(p, '/conta', 4000); await foto(p, M, '19-minha-conta')
  await b.close()
})()
