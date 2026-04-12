// ─── SIGEC-ELOS Mock API ───────────────────────────────────────────────────
// Espelha exatamente o contrato NestJS definido na Arquitetura Técnica.
// Troca por chamadas Axios reais sem alterar nenhuma página.

const delay = (ms = 400) => new Promise(r => setTimeout(r, ms))

const USERS = [
  { id: 'sup-001', email: 'fornecedor@demo.com', password: 'demo123', role: 'SUPPLIER', name: 'João Souza', supplierId: 'spl-001' },
  { id: 'sup-002', email: 'fornecedor2@demo.com', password: 'demo123', role: 'SUPPLIER', name: 'Maria Santos', supplierId: 'spl-002' },
  { id: 'buy-001', email: 'comprador@demo.com', password: 'demo123', role: 'BUYER', name: 'Carlos Vale', buyerId: 'buy-001' },
  { id: 'adm-001', email: 'admin@eqpi.com.br', password: 'demo123', role: 'ADMIN', name: 'Ana Silva — EQPI Tech' },
]

const SUPPLIERS_DB = [
  { id: 'spl-001', cnpj: '12.345.678/0001-99', razaoSocial: 'Metalúrgica Souza Ltda', cnaeMain: '2512-8/00', cnaeList: ['2512-8/00','2591-8/00'], state: 'MG', city: 'Belo Horizonte', employeeRange: '50–100', revenueRange: 'R$ 1–5M', status: 'ACTIVE', sealLevel: 'Simples', sealStatus: 'ACTIVE', score: 74, services: ['Usinagem CNC','Solda Industrial','Estruturas Metálicas'], certifications: [], sealSince: '2024-01-15' },
  { id: 'spl-002', cnpj: '98.765.432/0001-11', razaoSocial: 'TechServ Industrial S.A.', cnaeMain: '3314-7/10', cnaeList: ['3314-7/10','4321-5/00'], state: 'SP', city: 'São Paulo', employeeRange: '100–500', revenueRange: 'R$ 5–20M', status: 'ACTIVE', sealLevel: 'Premium', sealStatus: 'ACTIVE', score: 96, services: ['Manutenção Preventiva','Automação','Caldeiraria'], certifications: ['ISO 9001','ISO 45001'], sealSince: '2023-06-10' },
  { id: 'spl-003', cnpj: '44.555.666/0001-22', razaoSocial: 'LogTrans Mineração Ltda', cnaeMain: '4930-2/02', cnaeList: ['4930-2/02'], state: 'PA', city: 'Parauapebas', employeeRange: '100–500', revenueRange: 'R$ 5–20M', status: 'ACTIVE', sealLevel: 'Premium', sealStatus: 'ACTIVE', score: 91, services: ['Transporte de Minério','Gestão de Frota'], certifications: ['ISO 9001'], sealSince: '2022-11-20' },
  { id: 'spl-004', cnpj: '77.888.999/0001-33', razaoSocial: 'EnviroClean Serviços', cnaeMain: '3812-0/00', cnaeList: ['3812-0/00'], state: 'MG', city: 'Contagem', employeeRange: '10–50', revenueRange: 'R$ 500k–1M', status: 'ACTIVE', sealLevel: 'Simples', sealStatus: 'ACTIVE', score: 68, services: ['Gestão de Resíduos'], certifications: [], sealSince: '2024-03-01' },
  { id: 'spl-005', cnpj: '11.222.333/0001-44', razaoSocial: 'SegMax Proteção Ltda', cnaeMain: '8011-1/01', cnaeList: ['8011-1/01'], state: 'GO', city: 'Goiânia', employeeRange: '50–100', revenueRange: 'R$ 1–5M', status: 'PENDING', sealLevel: 'Simples', sealStatus: 'PENDING', score: 42, services: ['EPI/EPC','Treinamentos NR'], certifications: [], sealSince: null },
  { id: 'spl-006', cnpj: '55.666.777/0001-88', razaoSocial: 'Alpha Manutenção Industrial', cnaeMain: '3314-7/10', cnaeList: ['3314-7/10','3319-8/00'], state: 'SP', city: 'Campinas', employeeRange: '100–500', revenueRange: 'R$ 5–20M', status: 'ACTIVE', sealLevel: 'Premium', sealStatus: 'ACTIVE', score: 93, services: ['Manutenção Industrial','Caldeiraria'], certifications: ['ISO 9001','ISO 45001'], sealSince: '2023-01-10' },
  { id: 'spl-007', cnpj: '22.333.444/0001-55', razaoSocial: 'Construtora Beta Ltda', cnaeMain: '4120-4/00', cnaeList: ['4120-4/00'], state: 'MG', city: 'Uberlândia', employeeRange: '50–100', revenueRange: 'R$ 1–5M', status: 'PENDING', sealLevel: 'Premium', sealStatus: 'PENDING', score: 0, services: ['Construção Civil'], certifications: [], sealSince: null },
]

const DOCS_DB = {
  'spl-001': [
    { id:'d1', type:'CNPJ_CARD',   label:'Cartão CNPJ',           status:'VALID',    expires:null,         source:'AUTO' },
    { id:'d2', type:'CND_FEDERAL', label:'CND Federal',           status:'VALID',    expires:'2025-08-15', source:'AUTO' },
    { id:'d3', type:'CRF_FGTS',   label:'CRF (FGTS)',            status:'EXPIRING', expires:'2025-06-30', source:'AUTO' },
    { id:'d4', type:'CNDT',        label:'CNDT Trabalhista',      status:'VALID',    expires:'2025-09-20', source:'AUTO' },
    { id:'d5', type:'ALVARA',      label:'Alvará de Funcionamento',status:'MISSING', expires:null,         source:'MANUAL' },
    { id:'d6', type:'CONTRACT',    label:'Contrato Social',        status:'VALID',    expires:null,         source:'MANUAL' },
  ],
  'spl-002': [
    { id:'d1', type:'CNPJ_CARD',   label:'Cartão CNPJ',           status:'VALID',    expires:null,         source:'AUTO' },
    { id:'d2', type:'CND_FEDERAL', label:'CND Federal',           status:'VALID',    expires:'2025-10-01', source:'AUTO' },
    { id:'d3', type:'CRF_FGTS',   label:'CRF (FGTS)',            status:'VALID',    expires:'2025-09-15', source:'AUTO' },
    { id:'d4', type:'CNDT',        label:'CNDT Trabalhista',      status:'VALID',    expires:'2025-11-20', source:'AUTO' },
    { id:'d5', type:'ALVARA',      label:'Alvará de Funcionamento',status:'VALID',   expires:'2025-12-31', source:'MANUAL' },
    { id:'d6', type:'CONTRACT',    label:'Contrato Social',        status:'VALID',    expires:null,         source:'MANUAL' },
    { id:'d7', type:'ISO9001',     label:'Certificado ISO 9001',  status:'VALID',    expires:'2026-01-15', source:'MANUAL' },
  ],
  'spl-005': [
    { id:'d1', type:'CNPJ_CARD',   label:'Cartão CNPJ',           status:'VALID',    expires:null,         source:'AUTO' },
    { id:'d2', type:'CND_FEDERAL', label:'CND Federal',           status:'MISSING',  expires:null,         source:'AUTO' },
    { id:'d3', type:'CRF_FGTS',   label:'CRF (FGTS)',            status:'MISSING',  expires:null,         source:'AUTO' },
    { id:'d4', type:'CNDT',        label:'CNDT Trabalhista',      status:'MISSING',  expires:null,         source:'AUTO' },
    { id:'d5', type:'ALVARA',      label:'Alvará de Funcionamento',status:'MISSING', expires:null,         source:'MANUAL' },
    { id:'d6', type:'CONTRACT',    label:'Contrato Social',        status:'MISSING',  expires:null,         source:'MANUAL' },
  ],
  'spl-007': [
    { id:'d1', type:'CNPJ_CARD',   label:'Cartão CNPJ',           status:'VALID',    expires:null,         source:'AUTO' },
    { id:'d2', type:'CND_FEDERAL', label:'CND Federal',           status:'VALID',    expires:'2025-08-01', source:'AUTO' },
    { id:'d3', type:'CRF_FGTS',   label:'CRF (FGTS)',            status:'VALID',    expires:'2025-07-15', source:'AUTO' },
    { id:'d4', type:'CNDT',        label:'CNDT Trabalhista',      status:'EXPIRING', expires:'2025-06-20', source:'AUTO' },
    { id:'d5', type:'ALVARA',      label:'Alvará de Funcionamento',status:'MISSING', expires:null,         source:'MANUAL' },
    { id:'d6', type:'CONTRACT',    label:'Contrato Social',        status:'VALID',    expires:null,         source:'MANUAL' },
  ],
}

// ── Helpers de storage ──────────────────────────────────────────────────────
const store = {
  get: (k) => { try { return JSON.parse(localStorage.getItem(k)) } catch { return null } },
  set: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
  del: (k) => localStorage.removeItem(k),
}

// ── Auth ────────────────────────────────────────────────────────────────────
export const authApi = {
  login: async ({ email, password }) => {
    await delay(600)
    const user = USERS.find(u => u.email === email && u.password === password)
    if (!user) throw new Error('E-mail ou senha incorretos')
    const { password: _, ...safe } = user
    const token = btoa(JSON.stringify({ userId: user.id, role: user.role, exp: Date.now() + 86400000 }))
    store.set('elos_token', token)
    store.set('elos_user', safe)
    return { user: safe, access_token: token }
  },
  logout: () => { store.del('elos_token'); store.del('elos_user') },
  me: () => store.get('elos_user'),
  isAuthenticated: () => {
    const token = store.get('elos_token')
    if (!token) return false
    try { const p = JSON.parse(atob(token)); return p.exp > Date.now() } catch { return false }
  },
}

// ── CNPJ ────────────────────────────────────────────────────────────────────
export const cnpjApi = {
  lookup: async (cnpj) => {
    await delay(800)
    const clean = cnpj.replace(/\D/g, '')
    if (clean.length !== 14) throw new Error('CNPJ inválido')
    const found = SUPPLIERS_DB.find(s => s.cnpj.replace(/\D/g,'') === clean)
    if (found) return { razaoSocial: found.razaoSocial, cnaeMain: found.cnaeMain, state: found.state, city: found.city, situacao: 'ATIVA' }
    return { razaoSocial: 'Empresa Demonstração Ltda', cnaeMain: '4619-2/00', state: 'SP', city: 'São Paulo', situacao: 'ATIVA' }
  },
}

// ── Suppliers ───────────────────────────────────────────────────────────────
export const supplierApi = {
  me: async (supplierId) => {
    await delay(300)
    const s = SUPPLIERS_DB.find(s => s.id === supplierId)
    if (!s) throw new Error('Fornecedor não encontrado')
    return { ...s, documents: DOCS_DB[supplierId] || [] }
  },
  updateProfile: async (supplierId, data) => {
    await delay(400)
    return { ...SUPPLIERS_DB.find(s => s.id === supplierId), ...data }
  },
}

// ── Marketplace ─────────────────────────────────────────────────────────────
export const marketplaceApi = {
  search: async ({ level, state, category, q, page = 1, limit = 20 } = {}) => {
    await delay(500)
    let results = SUPPLIERS_DB.filter(s => s.sealStatus === 'ACTIVE')
    if (level && level !== 'Todos') results = results.filter(s => s.sealLevel === level)
    if (state && state !== 'Todos') results = results.filter(s => s.state === state)
    if (q) results = results.filter(s =>
      s.razaoSocial.toLowerCase().includes(q.toLowerCase()) ||
      s.services.some(sv => sv.toLowerCase().includes(q.toLowerCase()))
    )
    if (category && category !== 'Todos') results = results.filter(s =>
      s.services.some(sv => sv.toLowerCase().includes(category.toLowerCase()))
    )
    return { data: results, total: results.length, page, limit }
  },
  getById: async (id) => {
    await delay(300)
    const s = SUPPLIERS_DB.find(s => s.id === id)
    if (!s) throw new Error('Não encontrado')
    return { ...s, documents: DOCS_DB[id] || [] }
  },
}

// ── RFQ ─────────────────────────────────────────────────────────────────────
export const rfqApi = {
  send: async ({ supplierIds, category, message, buyerId }) => {
    await delay(600)
    const rfqs = supplierIds.map(sid => ({
      id: `rfq-${Date.now()}-${sid}`,
      supplierId: sid,
      buyerId, category, message,
      status: 'SENT',
      createdAt: new Date().toISOString(),
    }))
    const existing = store.get('elos_rfqs') || []
    store.set('elos_rfqs', [...existing, ...rfqs])
    return rfqs
  },
  list: async (userId, role) => {
    await delay(300)
    const all = store.get('elos_rfqs') || []
    if (role === 'BUYER') return all.filter(r => r.buyerId === userId)
    if (role === 'SUPPLIER') {
      const user = USERS.find(u => u.id === userId)
      return all.filter(r => r.supplierId === user?.supplierId)
    }
    return all
  },
}

// ── Admin / Backoffice ───────────────────────────────────────────────────────
export const adminApi = {
  getQueue: async () => {
    await delay(400)
    return SUPPLIERS_DB.filter(s => s.sealStatus === 'PENDING').map(s => ({
      ...s,
      documents: DOCS_DB[s.id] || [],
      riskLevel: s.score < 30 ? 'Alto' : s.score < 60 ? 'Médio' : 'Baixo',
      requestedAt: '2025-06-04',
    }))
  },
  getSealAnalysis: async (supplierId) => {
    await delay(300)
    const s = SUPPLIERS_DB.find(s => s.id === supplierId)
    return { ...s, documents: DOCS_DB[supplierId] || [] }
  },
  approveSeal: async (supplierId, level) => {
    await delay(700)
    return { supplierId, level, status: 'ACTIVE', approvedAt: new Date().toISOString() }
  },
  rejectSeal: async (supplierId, reason) => {
    await delay(600)
    return { supplierId, status: 'SUSPENDED', reason }
  },
  getMetrics: async () => {
    await delay(300)
    return {
      totalSuppliers: 3842, activeSeals: 3218, pendingAnalysis: 47,
      mrrBrl: 89400, mrrGrowth: 18,
      byPlan: { Simples: { count: 2100, rev: 28600 }, Premium: { count: 1118, rev: 60800 } },
      newThisMonth: 127, churnRate: 2.1,
    }
  },
  updateDocStatus: async (docId, status, obs) => {
    await delay(400)
    return { docId, status, obs, updatedAt: new Date().toISOString() }
  },
}
