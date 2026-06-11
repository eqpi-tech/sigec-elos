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
    { nome: 'Cartão CNPJ',       status: 'valid',   expira: null },
    { nome: 'CND Federal',       status: 'valid',   expira: 'Jun/2026' },
    { nome: 'CRF (FGTS)',        status: 'valid',   expira: 'Jul/2026' },
    { nome: 'Certidão Municipal', status: 'valid',  expira: 'Mai/2026' },
    { nome: 'Apólice de Seguro', status: 'pending', expira: null },
  ],
}

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
  pendentes: 11,
  saudeGeral: 73,
  processos: [
    { empresa: 'Primatus Serviços Técnicos', categoria: 'Manutenção Industrial',   status: 'Homologado',    score: 92 },
    { empresa: 'Ômega Engenharia Ltda',      categoria: 'Serviços Elétricos',      status: 'Em revisão',    score: 88 },
    { empresa: 'Sulbras Serviços',           categoria: 'Manutenção Mecânica',     status: 'Homologado',    score: 79 },
    { empresa: 'Norte Industrial Ltda',      categoria: 'Instalações Industriais', status: 'Doc. pendente', score: 74 },
    { empresa: 'Inova Sistemas Ltda',        categoria: 'TI Industrial',           status: 'Em análise',    score: null },
  ],
}
