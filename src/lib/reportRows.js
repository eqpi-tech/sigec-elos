// Linhas padronizadas dos relatórios e exportações do cliente (11/11, chamado
// #755248): o mesmo formato no Dashboard, nos Relatórios e no backoffice —
// as telas montam a tabela e o Excel com estas funções.
import { formatCnpj } from './cnpj.js'
import { SITUACAO, clientSealStatus } from './clientSituacao.js'

export const dataBR = (v) => (v ? new Date(v).toLocaleDateString('pt-BR') : '')
const cnpj = (v) => formatCnpj(v || '')

const PROCESSO = { ACTIVE: 'Homologado', PENDING: 'Em homologação', SUSPENDED: 'Suspenso', EXPIRED: 'Vencido' }
const CONVITE = { SENT: 'Enviado', VIEWED: 'Visualizado', REGISTERED: 'Cadastrado', CANCELLED: 'Cancelado', EXPIRED: 'Expirado', SUPERSEDED: 'Substituído' }
const DOC = { VALID: 'Válido', EXPIRING: 'A vencer', PENDING: 'Em análise', REJECTED: 'Reprovado', EXPIRED: 'Vencido', NOT_APPLICABLE: 'Não se aplica' }

// item de clientApi.getSuppliers (Dashboard, Meus Fornecedores)
export function linhaFornecedor(item, flowNames = {}) {
  const seal = item.seal || {}, sup = item.supplier || {}
  return {
    'Razão social': sup.razao_social || item.inviteRazaoSocial || '',
    'CNPJ': cnpj(sup.cnpj || item.inviteCnpj),
    'Situação': seal.client_suspended_at ? 'Inativado pela empresa' : (SITUACAO.find(o => o.value === clientSealStatus(seal))?.label || seal.status || ''),
    'Nível': item.flowId ? (flowNames[item.flowId] || '') : '',
    'Custeio': item.subsidiado ? 'Subsidiado' : 'Pago pelo fornecedor',
    'Categorias': (sup.categorias || []).filter(c => !c.reprovada).map(c => c.nome).join('; '),
    'Homologado em': seal.status === 'ACTIVE' ? dataBR(seal.issued_at) : '',
    'Validade': dataBR(seal.expires_at),
    'Convidado em': dataBR(item.invitedAt),
    'Cidade': sup.city || '', 'UF': sup.state || '',
  }
}

// convite ainda sem cadastro (Dashboard)
export function linhaConviteAberto(inv) {
  return {
    'Razão social': inv.supplier_razao_social || '', 'CNPJ': cnpj(inv.supplier_cnpj),
    'Situação': inv.status === 'VIEWED' ? 'Convite visualizado' : 'Convite enviado',
    'Nível': '', 'Custeio': inv.subsidiado ? 'Subsidiado' : 'Pago pelo fornecedor', 'Categorias': '',
    'Homologado em': '', 'Validade': '', 'Convidado em': dataBR(inv.created_at), 'Cidade': '', 'UF': '',
  }
}

// linhas de client_exec_detail (patch_175), por grupo de indicador
export function linhaDetalhe(kind, r, flowNames = {}) {
  if (kind.startsWith('docs_')) return {
    'Razão social': r.razao_social || '', 'CNPJ': cnpj(r.cnpj), 'Documento': r.documento || '',
    'Situação': DOC[r.situacao] || r.situacao || '', 'Vencimento': r.vencimento ? String(r.vencimento).split('-').reverse().join('/') : '',
    'Enviado em': dataBR(r.enviado_em),
  }
  if (kind.startsWith('convites')) return {
    'Razão social': r.razao_social || '', 'CNPJ': cnpj(r.cnpj), 'E-mail': r.email || '',
    'Situação': CONVITE[r.situacao] || r.situacao || '', 'Nível': r.flow_id ? (flowNames[r.flow_id] || '') : '',
    'Custeio': r.subsidiado ? 'Subsidiado' : 'Pago pelo fornecedor', 'Enviado em': dataBR(r.enviado_em),
    'Lembretes': r.lembretes || 0, 'Origem': r.hoc ? 'Histórico do HOC' : 'ELOS',
  }
  if (kind.startsWith('quest_')) return {
    'Razão social': r.razao_social || '', 'CNPJ': cnpj(r.cnpj), 'Cidade': r.cidade || '', 'UF': r.uf || '',
  }
  return {
    'Razão social': r.razao_social || '', 'CNPJ': cnpj(r.cnpj),
    'Situação': r.inativado ? 'Inativado pela empresa' : r.vencido ? 'Vencido' : (PROCESSO[r.processo] || r.processo || ''),
    'Nível': r.flow_id ? (flowNames[r.flow_id] || '') : '',
    'Custeio': r.subsidiado ? 'Subsidiado' : 'Pago pelo fornecedor',
    'Iniciado em': dataBR(r.iniciado_em), 'Homologado em': dataBR(r.homologado_em), 'Validade': dataBR(r.validade),
    'Cidade': r.cidade || '', 'UF': r.uf || '',
  }
}
