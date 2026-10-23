// Dados 100% fictícios do /demo. TODAS as datas são relativas a hoje
// (calculadas ao carregar a página) para a demonstração nunca ficar velha:
// documento válido vence no futuro, "vence em breve" em até 30 dias, vencido
// no passado, prazos de cotação em aberto no futuro, séries mensais terminam
// no mês corrente e convites ficam nos últimos ~60 dias.

// ── Datas relativas ───────────────────────────────────────────────────────
const DAY = 86400000
const pad = (n) => String(n).padStart(2, '0')
const hoje = () => { const d = new Date(); d.setHours(12, 0, 0, 0); return d }
export const dAdd = (n) => new Date(hoje().getTime() + n * DAY)
const toIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
/** 'YYYY-MM-DD' a n dias de hoje (negativo = passado) */
export const isoD = (n) => toIso(dAdd(n))
/** 'dd/mm/aaaa' a n dias de hoje */
export const brD = (n) => isoD(n).split('-').reverse().join('/')
/** ISO com hora (parseável por new Date) — n dias de hoje às hh:mm */
export const isoDT = (n, hm = '10:00') => `${isoD(n)}T${hm}:00`
/** 'YYYY-MM-DD…' → 'dd/mm/aaaa' */
export const fmtBR = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—')
/** 'YYYY-MM-DDThh:mm' → 'dd/mm/aaaa hh:mm' */
export const fmtBRDT = (iso) => (iso ? `${fmtBR(iso)} ${String(iso).slice(11, 16)}` : '—')
const isBiz = (d) => d.getDay() !== 0 && d.getDay() !== 6
/** soma n dias úteis (fins de semana pulam; a demo não carrega feriados) */
export function addBusinessDaysIso(iso, n) {
  const d = new Date(`${iso}T12:00:00`); let k = 0
  while (k < n) { d.setDate(d.getDate() + 1); if (isBiz(d)) k++ }
  return toIso(d)
}
/** rola para o próximo dia útil */
export function toBusinessDayIso(iso) {
  const d = new Date(`${iso}T12:00:00`)
  while (!isBiz(d)) d.setDate(d.getDate() + 1)
  return toIso(d)
}
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
/** série mensal terminando no mês corrente: [{ key:'YYYY-MM', label:'Out/26', value }] */
export function monthSeries(values) {
  const now = hoje()
  return values.map((value, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (values.length - 1 - i), 1)
    return { key: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`, label: `${MESES[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`, value }
  })
}

// ── Empresas âncora (as mesmas em todas as telas) ─────────────────────────
export const HORIZONTE = { razao: 'Horizonte Mineração S/A', cnpj: '18.442.706/0001-30', cidade: 'Belo Horizonte', uf: 'MG' }
export const MERIDIANO = { razao: 'Construtora Meridiano', cnpj: '22.615.380/0001-47' }

// Fornecedor principal da demo — Primatus (mesmo CNPJ, endereço, sócios,
// categorias e score em todas as visões)
export const PRIMATUS = {
  razao: 'Primatus Serviços Técnicos Ltda', fantasia: 'Primatus', cnpj: '34.218.904/0001-72',
  ie: '110.042.490.114', im: '8.421.907-0', abertura: '10/03/2012',
  endereco: { logradouro: 'Av. das Indústrias, 1450 — Galpão 3', bairro: 'Distrito Industrial', cidade: 'São Paulo', uf: 'SP', cep: '04710-020' },
  telefone: '(11) 3421-8900', telefone2: '(11) 97410-2231', email: 'contato@primatus.com.br', emailFin: 'financeiro@primatus.com.br',
  socios: [
    { nome: 'Lucas Andrade',  qual: 'Sócio-Administrador', pct: '60%', desde: '10/03/2012', cpf: '***.482.918-**', fone: '(11) 98734-8821', foneMask: '(11) 9****-8821', nac: 'Brasileira', faixa: '41 a 50 anos' },
    { nome: 'Maria Ferreira', qual: 'Sócia',               pct: '40%', desde: '22/07/2015', cpf: '***.107.334-**', fone: '(11) 99215-1907', foneMask: '(11) 9****-1907', nac: 'Brasileira', faixa: '31 a 40 anos' },
  ],
  // Caldeiraria: a atividade (CNAE) da empresa não cobre a categoria →
  // reprovada no processo Horizonte na validação do CNAE
  categorias: [
    { nome: 'Manutenção Industrial', grupo: 'Serviços',   docs: 9,  cnae: '3314-7/10' },
    { nome: 'Serviços Elétricos',    grupo: 'Serviços',   docs: 11, cnae: '4321-5/00' },
    { nome: 'Automação & Controle',  grupo: 'Engenharia', docs: 8,  cnae: '3321-0/00' },
    { nome: 'Caldeiraria',           grupo: 'Engenharia', docs: 10, cnae: null },
  ],
  score: 87,          // score geral ELOS (selo próprio ELOS Verificado)
  scoreProcesso: 72,  // score do processo Horizonte (só os documentos exigidos pela Horizonte)
}
export const SCORE_NOTE = 'O score do processo (72) considera só os documentos exigidos pela Horizonte Mineração; o score geral ELOS (87) considera os documentos do selo próprio ELOS Verificado.'

// ── Usuários demo ──────────────────────────────────────────────────────────
export const DEMO_USER = {
  SUPPLIER: { name: 'Lucas Andrade', email: 'lucas@primatus.com.br', role: 'SUPPLIER', initials: 'LA' },
  BUYER:    { name: 'Ricardo Mendes', email: 'ricardo@meridiano.com.br', role: 'BUYER', initials: 'RM' },
  CLIENT:   { name: 'Rafael Costa', email: 'rafael@horizonte.com.br', role: 'CLIENT', initials: 'RC' },
  ADMIN:    { name: 'Ana Ribeiro', email: 'ana.ribeiro@eqpitech.com.br', role: 'ADMIN', initials: 'AR' },
}

// ── Fornecedor ─────────────────────────────────────────────────────────────
export const DEMO_SUPPLIER = {
  razao_social: PRIMATUS.razao, cnpj: PRIMATUS.cnpj, city: PRIMATUS.endereco.cidade, state: PRIMATUS.endereco.uf,
  score: PRIMATUS.score,
  activePlan: { type: 'verificado_anual', starts_at: isoD(-281), ends_at: isoD(84) },
}

// Selos/processos do fornecedor: selo próprio ELOS Verificado (ativo) +
// processo Horizonte (em análise). reqIds = documentos exigidos no processo
export const DEMO_SEALS = [
  { id: 'seal-elos', client_id: null, client_name: null, name: 'ELOS Verificado', clientName: 'SIGEC-ELOS', status: 'ACTIVE', score: PRIMATUS.score,
    issued_at: isoD(-281), expires_at: isoD(84), reqIds: ['d37', 'd61', 'd62', 'd7', 'd42', 'd8'] },
  { id: 'seal-hz', client_id: 'hz', client_name: HORIZONTE.razao, name: 'Horizonte — Suprimentos', clientName: HORIZONTE.razao, status: 'PENDING', score: PRIMATUS.scoreProcesso,
    issued_at: null, expires_at: null, reqIds: null },
]

// ── Marketplace ─────────────────────────────────────────────────────────────
export const DEMO_MARKETPLACE = [
  { id:1, razao_social:PRIMATUS.razao, fantasia:'Primatus', cnpj:PRIMATUS.cnpj, city:'São Paulo', state:'SP', cnae:'Manutenção Industrial', score:PRIMATUS.score, sealType:'verificado', porte:'Médio', simples:true, capital:850000 },
  { id:2, razao_social:'Ômega Engenharia Ltda',   fantasia:'Ômega Engenharia', cnpj:'41.090.118/0001-30', city:'Belo Horizonte', state:'MG', cnae:'Serviços Elétricos',      score:88, sealType:'homologado', porte:'Médio', simples:false, capital:1200000,
    socios:[{ nome:'Henrique Valadares', qual:'Sócio-Administrador', pct:'70%' }, { nome:'Patrícia Lemos', qual:'Sócia', pct:'30%' }] },
  { id:3, razao_social:'TechFix Industrial S.A.', fantasia:'TechFix', cnpj:'07.332.910/0001-41', city:'Campinas', state:'SP', cnae:'Automação & Controle',   score:85, sealType:'verificado', porte:'Médio', simples:false, capital:2300000,
    socios:[{ nome:'Rodrigo Tavares', qual:'Diretor', pct:'—' }, { nome:'Juliana Prado', qual:'Diretora', pct:'—' }] },
  { id:4, razao_social:'Sulbras Serviços Ltda',   fantasia:'Sulbras', cnpj:'19.554.203/0001-88', city:'Porto Alegre', state:'RS', cnae:'Manutenção Mecânica',       score:79, sealType:'verificado', porte:'ME', simples:true, capital:320000,
    socios:[{ nome:'Eduardo Klein', qual:'Sócio-Administrador', pct:'100%' }] },
  { id:5, razao_social:'Norte Industrial Ltda',   fantasia:'Norte Industrial', cnpj:'28.119.340/0001-55', city:'Parauapebas', state:'PA', cnae:'Instalações Industriais', score:74, sealType:'verificado', porte:'ME', simples:true, capital:280000,
    socios:[{ nome:'Marcelo Araújo', qual:'Sócio-Administrador', pct:'55%' }, { nome:'Denise Araújo', qual:'Sócia', pct:'45%' }] },
  { id:6, razao_social:'Inova Sistemas Ltda',     fantasia:'Inova Sistemas', cnpj:'31.774.052/0001-63', city:'Rio de Janeiro', state:'RJ', cnae:'TI Industrial',     score:null, sealType:null, porte:'MEI', simples:true, capital:80000,
    socios:[{ nome:'Bruno Siqueira', qual:'Titular', pct:'100%' }] },
]

// ── Cliente ────────────────────────────────────────────────────────────────
export const DEMO_CLIENT = {
  razao_social: HORIZONTE.razao,
  totalFornecedores: 128,
  homologados: 94,
  emAnalise: 23,
  subsidiados: 8,
  saudeGeral: 73,
}

// Fornecedores da Horizonte. Primatus: processo EM ANÁLISE (score do processo 72)
export const DEMO_CLIENT_SUPPLIERS = [
  { id:1, razao_social:PRIMATUS.razao,            cnpj:PRIMATUS.cnpj,       initials:'PS', city:'São Paulo',      state:'SP', subsidiado:true,  sealStatus:'PENDING',   score:PRIMATUS.scoreProcesso, nivel:'Suprimentos – Nível 2', invitedAt:isoD(-51), escopo:'Manutenção preventiva de correias transportadoras — unidade Itabira/MG', tipo:'Serviço' },
  { id:2, razao_social:'Ômega Engenharia Ltda',    cnpj:'41.090.118/0001-30', initials:'ÔE', city:'Belo Horizonte', state:'MG', subsidiado:true,  sealStatus:'ACTIVE',    score:88, nivel:'Suprimentos – Nível 3', invitedAt:isoD(-58), issuedAt:isoD(-10), expiresAt:isoD(355), escopo:'Serviços elétricos', tipo:'Serviço' },
  { id:3, razao_social:'TechFix Industrial S.A.',  cnpj:'07.332.910/0001-41', initials:'TF', city:'Campinas',       state:'SP', subsidiado:false, sealStatus:'PENDING',   score:null, nivel:'Suprimentos – Nível 2', invitedAt:isoD(-30), prioridade:true, escopo:'Automação', tipo:'Serviço' },
  { id:4, razao_social:'Sulbras Serviços Ltda',    cnpj:'19.554.203/0001-88', initials:'SS', city:'Porto Alegre',   state:'RS', subsidiado:true,  sealStatus:'ACTIVE',    score:79, nivel:'Suprimentos – Nível 3', invitedAt:isoD(-47), issuedAt:isoD(-8), expiresAt:isoD(357), carta:true, escopo:'Manutenção mecânica', tipo:'Serviço' },
  { id:5, razao_social:'Norte Industrial Ltda',    cnpj:'28.119.340/0001-55', initials:'NI', city:'Parauapebas',    state:'PA', subsidiado:false, sealStatus:'PENDING',   score:null, nivel:'Suprimentos – Nível 1', invitedAt:isoD(-22), escopo:'Instalações industriais', tipo:'Produto e Serviço' },
  { id:6, razao_social:'BioTech Serviços Ambientais', cnpj:'22.781.604/0001-17', initials:'BS', city:'Curitiba',    state:'PR', subsidiado:false, sealStatus:'ACTIVE',    score:81, nivel:'Suprimentos – Nível 2', invitedAt:isoD(-150), issuedAt:isoD(-120), expiresAt:isoD(42), escopo:'Gestão de resíduos', tipo:'Serviço' },
  { id:7, razao_social:'Metalmax Ind. Ltda',       cnpj:'12.408.771/0001-09', initials:'MI', city:'Contagem',       state:'MG', subsidiado:true,  sealStatus:'SUSPENDED', score:55, nivel:'Suprimentos – Nível 1', invitedAt:isoD(-60), escopo:'Peças usinadas', tipo:'Produto' },
  { id:8, razao_social:'LogFlex Transportes',      cnpj:'10.228.551/0001-02', initials:'LF', city:'Santos',         state:'SP', subsidiado:true,  sealStatus:'ACTIVE',    score:90, nivel:'Suprimentos – Nível 1', invitedAt:isoD(-40), issuedAt:isoD(-14), expiresAt:isoD(351), escopo:'Transporte de cargas', tipo:'Serviço' },
]

// ── Questionários da Horizonte (o cliente consulta; o fornecedor responde) ─
export const DEMO_QUESTIONNAIRES = [
  { id:'q1', title:'Questionário de Integridade', description:'Programa de integridade, exposição política dos sócios e equipe alocada no contrato.', active:true, questions:[
    { id:'q1a', text:'A empresa possui programa de integridade (compliance) formalizado?', type:'boolean', required:true },
    { id:'q1b', text:'Algum sócio é pessoa politicamente exposta (PEP)?', type:'boolean', required:true },
    { id:'q1c', text:'Quantos colaboradores serão alocados no contrato?', type:'text', required:true },
  ] },
  { id:'q2', title:'Questionário de SSMA', description:'Saúde, segurança e meio ambiente: estrutura de segurança do trabalho e programas legais.', active:true, questions:[
    { id:'q2a', text:'A empresa possui SESMT próprio?', type:'boolean', required:true },
    { id:'q2b', text:'Possui PGR e PCMSO atualizados?', type:'boolean', required:true },
    { id:'q2c', text:'Qual o índice de acidentes com afastamento nos últimos 12 meses?', type:'select', required:true, options:['Nenhum','1 a 2','3 a 5','Mais de 5'] },
    { id:'q2d', text:'Possui certificação ISO 45001?', type:'boolean', required:false },
    { id:'q2e', text:'Descreva o programa de treinamentos em segurança:', type:'text', required:false },
  ] },
  { id:'q3', title:'Compliance Ambiental', description:'Avaliação das práticas ambientais e conformidade com a legislação vigente.', active:true, questions:[
    { id:'q3a', text:'A empresa possui Licença de Operação válida?', type:'boolean', required:true },
    { id:'q3b', text:'Possui programa de descarte de resíduos sólidos?', type:'boolean', required:true },
    { id:'q3c', text:'Descreva as principais ações de gestão ambiental adotadas:', type:'text', required:false },
    { id:'q3d', text:'Qual o nível de conformidade com a PNRS?', type:'select', required:true, options:['Total','Parcial','Não se aplica','Em implantação'] },
    { id:'q3e', text:'A empresa realiza auditorias ambientais internas?', type:'boolean', required:false },
  ] },
  { id:'q4', title:'Dados Financeiros', description:'Informações sobre a saúde financeira e a capacidade de execução de contratos.', active:false, questions:[
    { id:'q4a', text:'A empresa está em situação regular com o Fisco (Federal, Estadual, Municipal)?', type:'boolean', required:true },
    { id:'q4b', text:'Possui capital social adequado ao escopo de fornecimento?', type:'boolean', required:true },
    { id:'q4c', text:'Qual a faixa de faturamento anual?', type:'select', required:true, options:['Até R$360K (MEI/ME)','R$360K–R$4,8M','R$4,8M–R$30M','Acima de R$30M'] },
    { id:'q4d', text:'Descreva eventuais restrições de crédito ou processos judiciais relevantes:', type:'text', required:false },
  ] },
]
// Respostas da Primatus (todas as obrigatórias respondidas → processo na fila)
export const DEMO_SUPPLIER_ANSWERS = {
  q1a:{ boolean:true }, q1b:{ boolean:false }, q1c:{ text:'12 colaboradores' },
  q2a:{ boolean:false }, q2b:{ boolean:true }, q2c:{ text:'Nenhum' }, q2d:{ boolean:false },
  q3a:{ boolean:true }, q3b:{ boolean:true }, q3d:{ text:'Total' },
}
export const respostaTexto = (a) => a?.boolean === true ? 'Sim' : a?.boolean === false ? 'Não' : (a?.text || null)

// ── Categorias do fornecedor (as mesmas 4 em todas as telas) ───────────────
export const DEMO_SUPPLIER_CATEGORIES = PRIMATUS.categorias.map(c => ({
  name: c.nome, parent: c.grupo, docs: c.docs, status: c.cnae ? 'ACTIVE' : 'REJECTED_CNAE',
}))

// ── Meus Dados ─────────────────────────────────────────────────────────────
export const DEMO_MEUS_DADOS = {
  razao_social: PRIMATUS.razao, nome_fantasia: PRIMATUS.fantasia,
  cnpj: PRIMATUS.cnpj, ie: PRIMATUS.ie, im: PRIMATUS.im,
  data_abertura: PRIMATUS.abertura, tipo_empresa: 'LTDA', porte: 'Médio',
  telefone: PRIMATUS.telefone, email: PRIMATUS.email, email_financeiro: PRIMATUS.emailFin,
  endereco: PRIMATUS.endereco.logradouro, bairro: PRIMATUS.endereco.bairro,
  cidade: PRIMATUS.endereco.cidade, uf: PRIMATUS.endereco.uf, cep: PRIMATUS.endereco.cep,
  socios: PRIMATUS.socios.map(s => ({ nome: s.nome, cargo: s.qual, cpf: s.cpf, desde: s.desde })),
}

// ── Clientes ELOS (diretório p/ fornecedor declarar intenção) ──────────────
export const DEMO_ELOS_CLIENTS = [
  { id:1, name:HORIZONTE.razao,           segmento:'Mineração',   uf:'MG', interesse:false, portal:true,  emProcesso:true },
  { id:2, name:'Serra Azul Agroflorestal', segmento:'Agronegócio', uf:'BA', interesse:true,  portal:true  },
  { id:3, name:MERIDIANO.razao,            segmento:'Construção',  uf:'SP', interesse:false, portal:false },
  { id:4, name:'EnergiaSul Distribuição',  segmento:'Energia',     uf:'RS', interesse:false, portal:true  },
]

// ── Equipes ────────────────────────────────────────────────────────────────
export const DEMO_TEAM_SUPPLIER = [
  { id:'u1', nome:'Lucas Andrade', email:'lucas@primatus.com.br', perfil:'Acesso Total', ativo:true,  master:true,  me:true,  desde:isoD(-281) },
  { id:'u2', nome:'Paula Rocha',   email:'paula@primatus.com.br', perfil:'Documentos',   ativo:true,  master:false, me:false, desde:isoD(-120) },
  { id:'u3', nome:'João Siqueira', email:'joao@primatus.com.br',  perfil:'Acesso Total', ativo:false, master:false, me:false, desde:isoD(-200) },
]
export const DEMO_TEAM_CLIENT = [
  { id:'c1', nome:'Rafael Costa',  email:'rafael@horizonte.com.br',   perfil:'Acesso Total',       ativo:true,  master:true,  me:true,  desde:isoD(-400) },
  { id:'c2', nome:'Fernanda Lima', email:'fernanda@horizonte.com.br', perfil:'Homologação',        ativo:true,  master:false, me:false, desde:isoD(-300) },
  { id:'c3', nome:'Carlos Nunes',  email:'carlos@horizonte.com.br',   perfil:'Consulta (leitura)', ativo:true,  master:false, me:false, desde:isoD(-210) },
  { id:'c4', nome:'Beatriz Souza', email:'beatriz@horizonte.com.br',  perfil:'Homologação',        ativo:true,  master:false, me:false, desde:isoD(-95) },
  { id:'c5', nome:'Diego Martins', email:'diego@horizonte.com.br',    perfil:'Consulta (leitura)', ativo:false, master:false, me:false, desde:isoD(-330) },
]

// ── Interessados (convite reverso, visão do cliente) ───────────────────────
export const DEMO_INTERESTED_SUPPLIERS = [
  { id:1, razao_social:'Delta Caldeiraria Ltda',  cnpj:'46.302.118/0001-74', cidade:'Betim/MG',     categoria:'Caldeiraria e Solda', selo:'ELOS Verificado', score:84, desde:brD(-12), msg:'Atuamos há 15 anos com caldeiraria pesada para mineração.' },
  { id:2, razao_social:'ProServ Facilities S.A.', cnpj:'08.719.553/0001-20', cidade:'São Paulo/SP', categoria:'Facilities',          selo:'ELOS Homologado', score:91, desde:brD(-20) },
  { id:3, razao_social:'Andaimes Rocha ME',       cnpj:'37.051.229/0001-08', cidade:'Contagem/MG',  categoria:'Acesso e Andaimes',   selo:'ELOS Verificado', score:77, desde:brD(-31) },
]

// ── Pré-cadastros feitos pelo portal (visão do cliente) ────────────────────
export const DEMO_PRE_REGISTRATIONS = [
  { id:'pr1', razao_social:'Vértice Montagens Ltda',    cnpj:'33.901.227/0001-60', city:'Itabira',        state:'MG', email:'contato@vertice.com.br',  contato:'Sérgio Vidal',  telefone:'(31) 98765-4321', created:isoD(-9),  cnae:'4292-8/02 — Obras de montagem industrial', status:'ACTIVE', invited:true,  in_process:false, answers:{ q1a:'Sim', q1b:'Não', q1c:'20 colaboradores' } },
  { id:'pr2', razao_social:'Agro Serviços Itabira ME',  cnpj:'44.180.665/0001-12', city:'Itabira',        state:'MG', email:'adm@agroitabira.com.br',  contato:'Renata Couto',  telefone:'(31) 3833-1200', created:isoD(-17), cnae:'8130-3/00 — Atividades paisagísticas', status:'ACTIVE', invited:true,  in_process:true,  answers:{ q1a:'Sim', q1b:'Não', q1c:'6 colaboradores' } },
  { id:'pr3', razao_social:'Rota Sul Transportes Ltda', cnpj:'10.228.551/0001-02', city:'Belo Horizonte', state:'MG', email:'comercial@rotasul.com.br', contato:'Alex Moreira', telefone:'',               created:isoD(-4),  cnae:'4930-2/02 — Transporte rodoviário de carga', status:'ACTIVE', invited:false, in_process:false, answers:{ q1a:'Não' } },
  { id:'pr4', razao_social:'Delta Serviços Gerais Ltda', cnpj:'05.448.310/0001-91', city:'Contagem',      state:'MG', email:'adm@deltaservicos.com.br', contato:'',            telefone:'',               created:isoD(-48), cnae:'8121-4/00 — Limpeza em prédios', status:'ARCHIVED', invited:false, in_process:false, answers:{} },
]

// ── Cliente · Relatórios (dashboard executivo) ─────────────────────────────
export const DEMO_CLIENT_REPORTS = {
  kpis: { fornecedores: 128, homologados: 94, emHomologacao: 23, vencidos: 3, docsAVencer30: 17, processosAVencer60: 9 },
  funil: [
    { label: '✉️ Enviados', value: 160 }, { label: '👁 Visualizados', value: 141 },
    { label: '✅ Cadastrados', value: 128 }, { label: '🏅 Homologados vigentes', value: 94 },
  ],
  porMes: monthSeries([4, 5, 7, 6, 8, 9, 12, 11, 15, 18, 21, 14]),
  situacao: [
    { label: '🏅 Homologados vigentes', value: 94, color: '#22c55e' }, { label: '⏳ Em homologação', value: 23, color: '#f59e0b' },
    { label: '⛔ Suspensos', value: 8, color: '#ef4444' }, { label: '💤 Vencidos', value: 3, color: '#9B9B9B' },
  ],
  questionarios: { responderam: 88, naoResponderam: 6 },
  rfq: { abertas: 4, respostas: 17 },
}

// ── Cliente · Compliance ───────────────────────────────────────────────────
export const DEMO_COMPLIANCE = [
  { fornecedor: 'Metalmax Ind. Ltda', cnpj: '12.408.771/0001-09', pergunta: 'A empresa possui processos judiciais trabalhistas em andamento?', resposta: 'Sim — 3 processos', regra: 'Resposta "Sim" exige avaliação' },
  { fornecedor: 'Norte Industrial Ltda', cnpj: '28.119.340/0001-55', pergunta: 'Algum sócio é pessoa politicamente exposta (PEP)?', resposta: 'Sim', regra: 'PEP exige avaliação de compliance' },
  { fornecedor: 'TechFix Industrial S.A.', cnpj: '07.332.910/0001-41', pergunta: 'A empresa possui programa de integridade (compliance) formalizado?', resposta: 'Não', regra: 'Ausência de programa de integridade' },
]

// ── Cotações (RFQ) ─────────────────────────────────────────────────────────
// Caixa do fornecedor (Primatus): de clientes que o homologaram e de
// compradores Pro do marketplace
export const DEMO_SUPPLIER_RFQ_INBOX = [
  { response_id:'r1', requester_role:'CLIENT', client_name:HORIZONTE.razao, title:'Manutenção Elétrica — Unidade Itabira', category_name:'Serviços Elétricos', created_at:isoD(-3), deadline:isoD(9), status:'SENT', message:'', price:null,
    description:'Manutenção preventiva e corretiva de painéis elétricos de média tensão (2 subestações). Atendimento em turno, 6 meses, com relatório mensal de inspeção termográfica.' },
  { response_id:'r2', requester_role:'BUYER', client_name:MERIDIANO.razao, title:'Montagem de painéis elétricos — obra Campinas', category_name:'Serviços Elétricos', created_at:isoD(-5), deadline:isoD(6), status:'READ', message:'', price:null,
    description:'Montagem e comissionamento de 14 painéis de distribuição em obra comercial. Início previsto em 30 dias; informar prazo de execução e equipe.' },
  { response_id:'r3', requester_role:'CLIENT', client_name:HORIZONTE.razao, title:'Manutenção preventiva de correias — parada geral', category_name:'Manutenção Industrial', created_at:isoD(-12), deadline:isoD(2), status:'READ',
    message:'Equipe de 8 técnicos, 5 dias de parada, inclui troca de roletes e alinhamento. Validade da proposta: 30 dias.', price:46800,
    description:'Parada geral programada das correias TC-01 a TC-04. Escopo: inspeção, troca de roletes danificados e alinhamento.' },
  { response_id:'r4', requester_role:'CLIENT', client_name:HORIZONTE.razao, title:'Manutenção Elétrica — Unidade MG', category_name:'Serviços Elétricos', created_at:isoD(-34), deadline:isoD(-14), status:'ACCEPTED',
    message:'Podemos atender ao escopo completo com mobilização em até 5 dias úteis.', price:28500,
    description:'Serviços de manutenção preventiva e corretiva de painéis elétricos.' },
  { response_id:'r5', requester_role:'BUYER', client_name:MERIDIANO.razao, title:'Manutenção de pontes rolantes — galpão Contagem', category_name:'Manutenção Industrial', created_at:isoD(-40), deadline:isoD(-20), status:'DECLINED',
    message:'Inspeção NR-11 e manutenção de 3 pontes rolantes de 10 t.', price:19700,
    description:'Inspeção e manutenção corretiva de 3 pontes rolantes (10 t).' },
]

// Cotações do comprador Pro (Construtora Meridiano) — as mesmas histórias
// vistas pela Primatus na caixa dela
export const DEMO_BUYER_RFQS = [
  { id:'b1', title:'Montagem de painéis elétricos — obra Campinas', created_at:isoD(-5), deadline:isoD(6),
    description:'Montagem e comissionamento de 14 painéis de distribuição em obra comercial. Início previsto em 30 dias; informar prazo de execução e equipe.',
    responses:[
      { id:'b1r1', supplier_id:1, razao_social:PRIMATUS.razao, city:'São Paulo', state:'SP', status:'READ', message:'', price:null },
      { id:'b1r2', supplier_id:2, razao_social:'Ômega Engenharia Ltda', city:'Belo Horizonte', state:'MG', status:'READ', message:'Equipe própria de 6 eletricistas, execução em 25 dias corridos. Proposta técnica anexada por e-mail.', price:48900, updated_at:isoD(-2) },
      { id:'b1r3', supplier_id:3, razao_social:'TechFix Industrial S.A.', city:'Campinas', state:'SP', status:'SENT', message:'', price:null },
    ] },
  { id:'b2', title:'Manutenção de pontes rolantes — galpão Contagem', created_at:isoD(-40), deadline:isoD(-20),
    description:'Inspeção e manutenção corretiva de 3 pontes rolantes (10 t).',
    responses:[
      { id:'b2r1', supplier_id:1, razao_social:PRIMATUS.razao, city:'São Paulo', state:'SP', status:'DECLINED', message:'Inspeção NR-11 e manutenção de 3 pontes rolantes de 10 t.', price:19700, updated_at:isoD(-36) },
      { id:'b2r2', supplier_id:4, razao_social:'Sulbras Serviços Ltda', city:'Porto Alegre', state:'RS', status:'ACCEPTED', message:'Atendemos com equipe certificada; mobilização em 3 dias.', price:17900, updated_at:isoD(-35) },
    ] },
]
