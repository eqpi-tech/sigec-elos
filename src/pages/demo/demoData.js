export const DEMO_FORNECEDOR = {
  razaoSocial: 'Primatus Serviços Técnicos Ltda',
  cnpj: '34.218.904/0001-72',
  cidade: 'São Paulo',
  uf: 'SP',
  score: 87,
  categoria: 'Manutenção Industrial',
  seloStatus: 'ELOS Verificado',
  membroDesde: 'Jan/2025',
  visualizacoes30dias: 250,
  visualizacoesSemana: [23, 31, 18, 42, 38, 51, 47],
  documentos: [
    { nome: 'Cartão CNPJ',        status: 'VALID',   expira: null },
    { nome: 'CND Federal',        status: 'VALID',   expira: 'Jun/2026' },
    { nome: 'CRF (FGTS)',         status: 'VALID',   expira: 'Jul/2026' },
    { nome: 'Certidão Municipal', status: 'VALID',   expira: 'Mai/2026' },
    { nome: 'Apólice de Seguro',  status: 'PENDING', expira: null },
  ],
}

export const DEMO_PROCESSES = [
  { id: 1, name: 'SIGEC Simples', client: 'SIGEC-ELOS',         status: 'ACTIVE',  score: 87, docsOk: 4, docsPending: 1, docsMissing: 0, date: 'Emitido 2025-01-15' },
  { id: 2, name: 'Processo Horizonte', client: 'Horizonte Mineração', status: 'PENDING', score: 79, docsOk: 4, docsPending: 0, docsMissing: 1, date: 'Aguardando análise' },
]

export const DEMO_MARKETPLACE = [
  { id: 1, razaoSocial: 'Primatus Serviços Técnicos',  cidade: 'São Paulo',      uf: 'SP', categoria: 'Manutenção Industrial',  score: 92, selo: 'ELOS Verificado', destaque: true  },
  { id: 2, razaoSocial: 'Ômega Engenharia Ltda',       cidade: 'Belo Horizonte', uf: 'MG', categoria: 'Serviços Elétricos',     score: 88, selo: 'ELOS Verificado', destaque: false },
  { id: 3, razaoSocial: 'TechFix Industrial',           cidade: 'Campinas',       uf: 'SP', categoria: 'Automação & Controle',  score: 85, selo: 'ELOS Verificado', destaque: false },
  { id: 4, razaoSocial: 'Sulbras Serviços',             cidade: 'Porto Alegre',   uf: 'RS', categoria: 'Manutenção Mecânica',   score: 79, selo: 'ELOS Verificado', destaque: false },
  { id: 5, razaoSocial: 'Norte Industrial Ltda',        cidade: 'Parauapebas',    uf: 'PA', categoria: 'Instalações Ind.',      score: 74, selo: 'ELOS Verificado', destaque: false },
  { id: 6, razaoSocial: 'Inova Sistemas Ltda',          cidade: 'Rio de Janeiro', uf: 'RJ', categoria: 'TI Industrial',         score: null, selo: 'Em Análise',  destaque: false },
]

export const DEMO_CLIENTE = {
  nome: 'Horizonte Mineração S/A',
  totalFornecedores: 128,
  verificados: 94,
  emAnalise: 23,
  subsidiados: 8,
  saudeGeral: 73,
  fornecedoresRecentes: [
    { empresa: 'Primatus Serviços Técnicos', initials: 'PS', cidade: 'São Paulo',  uf: 'SP', subsidiado: false, sealStatus: 'ACTIVE',  score: 92 },
    { empresa: 'Ômega Engenharia Ltda',      initials: 'ÔE', cidade: 'BH',         uf: 'MG', subsidiado: true,  sealStatus: 'ACTIVE',  score: 88 },
    { empresa: 'TechFix Industrial',          initials: 'TF', cidade: 'Campinas',   uf: 'SP', subsidiado: false, sealStatus: 'PENDING', score: null },
    { empresa: 'Sulbras Serviços',            initials: 'SS', cidade: 'Porto Alegre', uf: 'RS', subsidiado: true, sealStatus: 'ACTIVE', score: 79 },
    { empresa: 'Norte Industrial Ltda',       initials: 'NI', cidade: 'Parauapebas', uf: 'PA', subsidiado: false, sealStatus: 'PENDING', score: null },
  ],
}
