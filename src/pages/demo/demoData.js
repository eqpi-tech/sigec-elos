// ── Usuários demo ──────────────────────────────────────────────────────────
export const DEMO_USER = {
  SUPPLIER: { name: 'Lucas Andrade', email: 'lucas@primatus.com.br', role: 'SUPPLIER', initials: 'LA' },
  BUYER:    { name: 'Ricardo Mendes', email: 'ricardo@horizonte.com.br', role: 'BUYER', initials: 'RM' },
  CLIENT:   { name: 'Rafael Costa', email: 'rafael@horizonte.com.br', role: 'CLIENT', initials: 'RC' },
}

// ── Fornecedor ─────────────────────────────────────────────────────────────
export const DEMO_SUPPLIER = {
  razao_social: 'Primatus Serviços Técnicos Ltda',
  cnpj: '34.218.904/0001-72',
  city: 'São Paulo', state: 'SP',
  score: 87,
  activePlan: { type: 'Verificado', ends_at: '2027-01-15' },
}

export const DEMO_SEALS = [
  { id: 'seal-1', name: 'SIGEC Simples', clientName: 'SIGEC-ELOS',          status: 'ACTIVE',  score: 87, issued_at: '2025-01-15', expires_at: '2026-01-15', color: '#2E3192', icon: '✦' },
  { id: 'seal-2', name: 'Processo HOC',  clientName: 'Horizonte Mineração',  status: 'PENDING', score: 72, issued_at: null,          expires_at: null,         color: '#F47E2F', icon: '⭐' },
]

export const DEMO_DOCS = [
  { id:1,  label:'Cartão CNPJ',            status:'VALID',    source:'AUTO',   expires_at:'2099-12-31' },
  { id:2,  label:'CND Federal',             status:'VALID',    source:'MANUAL', expires_at:'2026-06-30' },
  { id:3,  label:'CRF / FGTS',             status:'VALID',    source:'MANUAL', expires_at:'2026-07-31' },
  { id:4,  label:'Certidão Municipal',      status:'EXPIRING', source:'MANUAL', expires_at:'2026-06-20' },
  { id:5,  label:'Análise CNAEs',           status:'VALID',    source:'AUTO',   expires_at:'2099-12-31' },
  { id:6,  label:'Simples Nacional',        status:'VALID',    source:'AUTO',   expires_at:'2099-12-31' },
  { id:7,  label:'Apólice de Seguro',       status:'PENDING',  source:'MANUAL', expires_at:null },
  { id:8,  label:'Certidão Trabalhista',    status:'VALID',    source:'MANUAL', expires_at:'2026-08-15' },
  { id:9,  label:'Alvará de Funcionamento', status:'MISSING',  source:'MANUAL', expires_at:null },
  { id:10, label:'Relatório Assertiva 360', status:'VALID',    source:'AUTO',   expires_at:'2026-06-11' },
]

export const DEMO_PROCESSO = {
  id: 'seal-2',
  clientName: 'Horizonte Mineração S/A',
  sealName: 'Processo HOC',
  status: 'PENDING',
  score: 72,
  docs: [
    { label:'Cartão CNPJ',          status:'VALID',    source:'AUTO'   },
    { label:'CND Federal',           status:'VALID',    source:'MANUAL' },
    { label:'CRF / FGTS',           status:'VALID',    source:'MANUAL' },
    { label:'Certidão Municipal',    status:'EXPIRING', source:'MANUAL' },
    { label:'Apólice de Seguro',     status:'PENDING',  source:'MANUAL' },
    { label:'Alvará de Funcionamento', status:'MISSING', source:'MANUAL' },
    { label:'Certidão Trabalhista',  status:'VALID',    source:'MANUAL' },
  ],
}

// ── Marketplace ─────────────────────────────────────────────────────────────
export const DEMO_MARKETPLACE = [
  { id:1, razao_social:'Primatus Serviços Técnicos Ltda', city:'São Paulo',       state:'SP', cnae:'Serv. Manutenção Industrial', score:92, sealType:'homologado', porte:'Médio',    simples:true,  capital:850000  },
  { id:2, razao_social:'Ômega Engenharia Ltda',           city:'Belo Horizonte',  state:'MG', cnae:'Serviços Elétricos',          score:88, sealType:'homologado', porte:'Médio',    simples:false, capital:1200000 },
  { id:3, razao_social:'TechFix Industrial S.A.',          city:'Campinas',        state:'SP', cnae:'Automação & Controle',        score:85, sealType:'verificado', porte:'Médio',    simples:false, capital:2300000 },
  { id:4, razao_social:'Sulbras Serviços Ltda',            city:'Porto Alegre',    state:'RS', cnae:'Manutenção Mecânica',         score:79, sealType:'verificado', porte:'ME',       simples:true,  capital:320000  },
  { id:5, razao_social:'Norte Industrial Ltda',            city:'Parauapebas',     state:'PA', cnae:'Instalações Industriais',     score:74, sealType:'verificado', porte:'ME',       simples:true,  capital:280000  },
  { id:6, razao_social:'Inova Sistemas Ltda',              city:'Rio de Janeiro',  state:'RJ', cnae:'TI Industrial',               score:null, sealType:null,       porte:'MEI',      simples:true,  capital:80000   },
]

// ── Perfil completo do fornecedor (buyer view) ────────────────────────────
export const DEMO_BUYER_SUPPLIER_PROFILE = {
  razao_social: 'Primatus Serviços Técnicos Ltda',
  cnpj: '34.218.904/0001-72',
  city: 'São Paulo', state: 'SP',
  score: 92,
  sealType: 'homologado',
  porte: 'Médio',
  simples: true,
  capital: 850000,
  fundacao: '2012-03-10',
  cnae_principal: 'Manutenção e reparação de equipamentos industriais',
  socios: ['Lucas Andrade — Sócio Administrador', 'Maria Ferreira — Sócia'],
  telefone: '(11) 3421-8900',
  email: 'contato@primatus.com.br',
  verificacoes: [
    { label:'Regularidade fiscal',        ok:true },
    { label:'Regularidade trabalhista',   ok:true },
    { label:'Sem listas restritivas',     ok:true },
    { label:'Alvará em dia',              ok:true },
    { label:'CRF/FGTS regular',          ok:true },
    { label:'Certidão Trabalhista OK',   ok:true },
  ],
  docs: [
    { label:'Cartão CNPJ',           status:'VALID',    expires:'—'         },
    { label:'CND Federal',            status:'VALID',    expires:'Jun/2026'  },
    { label:'CRF / FGTS',            status:'VALID',    expires:'Jul/2026'  },
    { label:'Certidão Municipal',     status:'EXPIRING', expires:'Jun/2026'  },
    { label:'Certidão Trabalhista',   status:'VALID',    expires:'Ago/2026'  },
    { label:'Relatório Assertiva',    status:'VALID',    expires:'Jun/2026'  },
  ],
  categorias: ['Manutenção Industrial','Serviços Elétricos','Automação & Controle'],
}

// ── Cliente ────────────────────────────────────────────────────────────────
export const DEMO_CLIENT = {
  razao_social: 'Horizonte Mineração S/A',
  totalFornecedores: 128,
  homologados: 94,
  emAnalise: 23,
  subsidiados: 8,
  saudeGeral: 73,
}

export const DEMO_CLIENT_SUPPLIERS = [
  { id:1, razao_social:'Primatus Serviços Técnicos Ltda', initials:'PS', city:'São Paulo',       state:'SP', subsidiado:false, sealStatus:'ACTIVE',  score:92, seal_name:'HOC Homologado' },
  { id:2, razao_social:'Ômega Engenharia Ltda',           initials:'ÔE', city:'Belo Horizonte',  state:'MG', subsidiado:true,  sealStatus:'ACTIVE',  score:88, seal_name:'HOC Homologado' },
  { id:3, razao_social:'TechFix Industrial',               initials:'TF', city:'Campinas',        state:'SP', subsidiado:false, sealStatus:'PENDING', score:null, seal_name:'Em análise'  },
  { id:4, razao_social:'Sulbras Serviços',                 initials:'SS', city:'Porto Alegre',    state:'RS', subsidiado:true,  sealStatus:'ACTIVE',  score:79, seal_name:'HOC Homologado' },
  { id:5, razao_social:'Norte Industrial Ltda',            initials:'NI', city:'Parauapebas',     state:'PA', subsidiado:false, sealStatus:'PENDING', score:null, seal_name:'Em análise'  },
  { id:6, razao_social:'BioTech Serviços Ambientais',      initials:'BS', city:'Curitiba',        state:'PR', subsidiado:false, sealStatus:'ACTIVE',  score:81, seal_name:'HOC Homologado' },
  { id:7, razao_social:'Metalmax Ind. Ltda',               initials:'MI', city:'Contagem',        state:'MG', subsidiado:false, sealStatus:'SUSPENDED', score:55, seal_name:'Suspenso'   },
  { id:8, razao_social:'LogFlex Transportes',              initials:'LF', city:'Santos',          state:'SP', subsidiado:true,  sealStatus:'ACTIVE',  score:90, seal_name:'HOC Homologado' },
]

// ── Questionário do cliente (fornecedor responde) ──────────────────────────
export const DEMO_QUESTIONARIO = {
  clientName: 'Horizonte Mineração S/A',
  progress: 7,
  total: 10,
  questions: [
    { q:'A empresa possui certificação ISO 9001 vigente?',                          a:'Sim — válida até 03/2027',            done:true },
    { q:'Possui programa formal de segurança do trabalho (SESMT/CIPA)?',            a:'Sim — CIPA constituída, 12 membros',  done:true },
    { q:'Qual o efetivo médio alocado em contratos industriais?',                   a:'45 colaboradores',                     done:true },
    { q:'A empresa já prestou serviços em unidades de mineração?',                  a:'Sim — 3 contratos nos últimos 5 anos', done:true },
    { q:'Possui política de meio ambiente documentada?',                            a:'Sim',                                  done:true },
    { q:'Descreva a estrutura de atendimento de emergência 24h.',                   a:'Plantão técnico com SLA de 4h',        done:true },
    { q:'Possui seguro de responsabilidade civil vigente? Qual cobertura?',         a:'Sim — R$ 2.000.000',                   done:true },
    { q:'Relacione os principais equipamentos próprios disponíveis.',               a:null, done:false },
    { q:'A empresa possui plano de contingência para paradas não programadas?',     a:null, done:false },
    { q:'Informe três referências comerciais com contato.',                         a:null, done:false },
  ],
}

// ── Categorias do fornecedor ───────────────────────────────────────────────
export const DEMO_SUPPLIER_CATEGORIES = [
  { name:'Manutenção Industrial',   parent:'Serviços',    docs:9,  status:'ACTIVE' },
  { name:'Serviços Elétricos',      parent:'Serviços',    docs:11, status:'ACTIVE' },
  { name:'Automação & Controle',    parent:'Engenharia',  docs:8,  status:'ACTIVE' },
  { name:'Montagem Mecânica',       parent:'Engenharia',  docs:10, status:'PENDING' },
]

// ── Meus Dados (fornecedor edita cadastro + sócios) ────────────────────────
export const DEMO_MEUS_DADOS = {
  razao_social:'Primatus Serviços Técnicos Ltda', nome_fantasia:'Primatus',
  cnpj:'34.218.904/0001-72', ie:'110.042.490.114', im:'8.421.907-0',
  data_abertura:'10/03/2012', tipo_empresa:'LTDA', porte:'Médio',
  telefone:'(11) 3421-8900', email:'contato@primatus.com.br',
  email_financeiro:'financeiro@primatus.com.br',
  endereco:'Av. das Nações Unidas, 12.901 — Torre Norte, cj. 1204',
  bairro:'Brooklin', cidade:'São Paulo', uf:'SP', cep:'04578-910',
  socios: [
    { nome:'Lucas Andrade',  cargo:'Sócio Administrador', cpf:'***.842.318-**', desde:'2012' },
    { nome:'Maria Ferreira', cargo:'Sócia',               cpf:'***.104.226-**', desde:'2015' },
  ],
}

// ── Clientes ELOS (diretório p/ fornecedor declarar interesse) ─────────────
export const DEMO_ELOS_CLIENTS = [
  { id:1, name:'Horizonte Mineração S/A', segmento:'Mineração',      uf:'MG', fornecedores:128, homologado:true,  interesse:false },
  { id:2, name:'Vale Verde Agroflorestal', segmento:'Agronegócio',   uf:'BA', fornecedores:64,  homologado:false, interesse:true  },
  { id:3, name:'Construtora Meridiano',    segmento:'Construção',    uf:'SP', fornecedores:97,  homologado:false, interesse:false },
  { id:4, name:'EnergiaSul Distribuição',  segmento:'Energia',       uf:'RS', fornecedores:211, homologado:false, interesse:false },
]

// ── Equipes ────────────────────────────────────────────────────────────────
export const DEMO_TEAM_SUPPLIER = [
  { nome:'Lucas Andrade',   email:'lucas@primatus.com.br',    perfil:'Acesso Total', ativo:true,  titular:true  },
  { nome:'Paula Rocha',     email:'paula@primatus.com.br',    perfil:'Documentos',   ativo:true,  titular:false },
  { nome:'João Siqueira',   email:'joao@primatus.com.br',     perfil:'Acesso Total', ativo:false, titular:false },
]

export const DEMO_TEAM_CLIENT = [
  { nome:'Rafael Costa',    email:'rafael@horizonte.com.br',   perfil:'Acesso Total',        ativo:true,  titular:true  },
  { nome:'Fernanda Lima',   email:'fernanda@horizonte.com.br', perfil:'Homologação',         ativo:true,  titular:false },
  { nome:'Carlos Nunes',    email:'carlos@horizonte.com.br',   perfil:'Consulta (leitura)',  ativo:true,  titular:false },
  { nome:'Beatriz Souza',   email:'beatriz@horizonte.com.br',  perfil:'Homologação',         ativo:true,  titular:false },
  { nome:'Diego Martins',   email:'diego@horizonte.com.br',    perfil:'Consulta (leitura)',  ativo:false, titular:false },
]

// ── Fornecedores com intenção (convite reverso, visão do cliente) ──────────
export const DEMO_INTERESTED_SUPPLIERS = [
  { id:1, razao_social:'Delta Caldeiraria Ltda',     cidade:'Betim/MG',     categoria:'Caldeiraria e Solda',  selo:'ELOS Verificado', score:84, desde:'05/08/2026' },
  { id:2, razao_social:'ProServ Facilities S.A.',    cidade:'São Paulo/SP', categoria:'Facilities',           selo:'ELOS Homologado', score:91, desde:'28/07/2026' },
  { id:3, razao_social:'Andaimes Rocha ME',          cidade:'Contagem/MG',  categoria:'Acesso e Andaimes',    selo:'ELOS Verificado', score:77, desde:'19/07/2026' },
]
