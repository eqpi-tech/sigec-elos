// Registro de módulos da plataforma por tipo de usuário (patch_038).
// O backoffice monta perfis (access_profiles) escolhendo módulos deste
// registro; o menu e as rotas são montados conforme o perfil do usuário.
// As chaves são estáveis — mudanças aqui exigem migração dos perfis.

export const MODULES = {
  SUPPLIER: [
    { key: 'dashboard',     label: 'Dashboard',      icon: '⊞',  desc: 'Visão geral, selos e processos' },
    { key: 'documentos',    label: 'Documentos',     icon: '📋', desc: 'Envio e acompanhamento de documentos' },
    { key: 'questionario',  label: 'Questionário',   icon: '❓', desc: 'Questionários dos clientes' },
    { key: 'plano',         label: 'Meu Plano',      icon: '⭐', desc: 'Assinatura e planos ELOS' },
    { key: 'categorias',    label: 'Categorias',     icon: '📦', desc: 'Categorias de atuação' },
    { key: 'meus_dados',    label: 'Meus Dados',     icon: '🏢', desc: 'Dados cadastrais e quadro societário' },
    { key: 'clientes_elos', label: 'Clientes ELOS',  icon: '🤝', desc: 'Vitrine de clientes e intenção de serviços' },
    { key: 'equipe',        label: 'Equipe',         icon: '👥', desc: 'Gestão de usuários da empresa' },
  ],
  CLIENT: [
    { key: 'dashboard',     label: 'Dashboard',      icon: '⊞',  desc: 'Visão geral da homologação' },
    { key: 'fornecedores',  label: 'Fornecedores',   icon: '🏭', desc: 'Meus fornecedores, busca e interessados' },
    { key: 'convites',      label: 'Convites',       icon: '🤝', desc: 'Convidar e acompanhar fornecedores' },
    { key: 'rfq',           label: 'Cotações (RFQ)', icon: '💬', desc: 'Solicitações de cotação' },
    { key: 'questionarios', label: 'Questionários',  icon: '📋', desc: 'Questionários personalizados' },
    { key: 'relatorios',    label: 'Relatórios',     icon: '📈', desc: 'Dashboard executivo da homologação' },
    { key: 'compliance',    label: 'Compliance',     icon: '🛡️', desc: 'Fornecedores com respostas que exigem revisão de compliance' },
    { key: 'configuracoes', label: 'Configurações',  icon: '⚙️', desc: 'Portal white-label e termos de aceite' },
    { key: 'equipe',        label: 'Equipe',         icon: '👥', desc: 'Gestão de usuários da empresa' },
  ],
  // Backoffice (20/09): granularidade = itens do menu ADMIN do Navbar.
  // O motivo de existir perfil no backoffice é separar Custos/BC Report —
  // mas o perfil considera TODOS os itens, como nos demais papéis.
  ADMIN: [
    { key: 'inicio',        label: 'Início',                icon: '⊞',  desc: 'Farol de análise e visão geral' },
    { key: 'analise',       label: 'Análise',               icon: '📋', desc: 'Análise de docs, processos, homologados e questionários' },
    { key: 'financeiro',    label: 'Financeiro',            icon: '💰', desc: 'Métricas, assinaturas, subsidiados' },
    { key: 'relatorios',    label: 'Relatórios',            icon: '📈', desc: 'Funil da campanha e dashboard executivo' },
    { key: 'bc_report',     label: 'BC Report',             icon: '🕵️', desc: 'Emissão de background checks' },
    { key: 'comunicados',   label: 'Comunicados',           icon: '📢', desc: 'Mensagens para a base' },
    { key: 'clientes',      label: 'Clientes',              icon: '🏢', desc: 'Cadastro, fluxos, portais e termos de clientes' },
    { key: 'usuarios',      label: 'Usuários',              icon: '👥', desc: 'Gestão de usuários e perfis de acesso' },
    { key: 'config_gerais', label: 'Configurações Gerais',  icon: '⚙️', desc: 'Preços ELOS, feriados e catálogo de documentos' },
  ],
  BUYER: [
    { key: 'marketplace',   label: 'Marketplace',           icon: '🔍', desc: 'Busca de fornecedores homologados' },
    { key: 'convites',      label: 'Convites',              icon: '🤝', desc: 'Convites recebidos/enviados' },
    { key: 'plano',         label: 'Meu Plano',             icon: '⭐', desc: 'Assinatura Comprador Pro' },
  ],
}

// AÇÕES dentro dos módulos (nível abaixo do menu — 09/09/2026).
// Guardadas na MESMA lista modules do perfil, com prefixo 'acao:'.
export const ACTIONS = {
  CLIENT: [
    { key: 'acao:todos_fornecedores',module: 'fornecedores', label: 'Todos os Fornecedores',        icon: '🔍', desc: 'Pesquisar em toda a base ELOS (aba Todos / marketplace)' },
    { key: 'acao:interessados',      module: 'fornecedores', label: 'Interessados',                 icon: '💡', desc: 'Ver fornecedores que declararam intenção de atender' },
    { key: 'acao:ver_documentos',    module: 'fornecedores', label: 'Ver documentos do fornecedor', icon: '👁', desc: 'Abrir/baixar arquivos no processo do fornecedor' },
    { key: 'acao:carta_excecao',     module: 'fornecedores', label: 'Enviar Carta de Exceção',      icon: '📜', desc: 'Anexar carta aprovando categoria com pendência' },
    { key: 'acao:enviar_doc_cliente',module: 'fornecedores', label: 'Enviar documentos do cliente', icon: '📎', desc: 'Anexar documentos de responsabilidade do cliente no processo (ex.: Laudo GETEC — VIX)' },
    { key: 'acao:novo_convite',      module: 'convites',     label: 'Enviar convites',              icon: '✉️', desc: 'Convidar fornecedores (individual e em massa)' },
    { key: 'acao:nova_cotacao',      module: 'rfq',          label: 'Criar cotações (RFQ)',         icon: '📝', desc: 'Abrir novas solicitações de cotação' },
  ],
  SUPPLIER: [
    { key: 'acao:enviar_documentos', module: 'documentos',   label: 'Enviar documentos',            icon: '📤', desc: 'Upload e substituição de documentos' },
    { key: 'acao:mudar_categorias',  module: 'categorias',   label: 'Mudar categorias',             icon: '📦', desc: 'Alterar as categorias de atuação' },
  ],
  // Backoffice: os SUBMENUS do menu são o segundo nível do perfil (20/09),
  // mesmo mecanismo do cliente/fornecedor. As chaves espelham o Navbar.
  ADMIN: [
    { key: 'acao:analise_docs',      module: 'analise',      label: 'Análise de Docs',              icon: '📄', desc: 'Revisar documentos em lote' },
    { key: 'acao:processos',         module: 'analise',      label: 'Processos',                    icon: '🔍', desc: 'Buscar e abrir fichas de fornecedores' },
    { key: 'acao:homologados',       module: 'analise',      label: 'Homologados',                  icon: '✅', desc: 'Fornecedores com selo ativo' },
    { key: 'acao:questionarios',     module: 'analise',      label: 'Questionários',                icon: '❓', desc: 'Gerenciar questionários dos clientes' },
    { key: 'acao:custos',            module: 'financeiro',   label: 'Custos e COGS (BC Report)',    icon: '💰', desc: 'Aba de custos por rota/CNPJ no Financeiro' },
    { key: 'acao:emitir_bc',         module: 'bc_report',    label: 'Emitir BC Report',             icon: '🕵️', desc: 'Disparar emissões Light/Full (consome créditos)' },
    { key: 'acao:lista_clientes',    module: 'clientes',     label: 'Lista de Clientes',            icon: '🏛️', desc: 'Ver e gerenciar todos os clientes' },
    { key: 'acao:novo_cliente',      module: 'clientes',     label: 'Novo Cliente',                 icon: '➕', desc: 'Wizard completo de cadastro' },
    { key: 'acao:fluxo_homologacao', module: 'clientes',     label: 'Fluxo de Homologação',         icon: '📂', desc: 'Documentos exigidos por categoria/cliente' },
    { key: 'acao:portais_whitelabel',module: 'clientes',     label: 'Portais White-label',          icon: '🌐', desc: 'Páginas de convite personalizadas' },
    { key: 'acao:termos_clientes',   module: 'clientes',     label: 'Termos de Aceite',             icon: '📜', desc: 'Textos e documentos de aceite por cliente' },
    { key: 'acao:lista_usuarios',    module: 'usuarios',     label: 'Lista de Usuários',            icon: '👤', desc: 'Bloquear, redefinir senha, editar' },
    { key: 'acao:novo_usuario',      module: 'usuarios',     label: 'Novo Usuário',                 icon: '➕', desc: 'Criar comprador, cliente ou analista' },
    { key: 'acao:perfis_usuario',    module: 'usuarios',     label: 'Perfis de Usuário',            icon: '🎛️', desc: 'Módulos e ações por perfil' },
    { key: 'acao:precos_elos',       module: 'config_gerais',label: 'Preços ELOS',                  icon: '💰', desc: 'Valores dos planos da plataforma' },
    { key: 'acao:feriados',          module: 'config_gerais',label: 'Feriados',                     icon: '📅', desc: 'Datas que ajustam os prazos do farol' },
    { key: 'acao:catalogo_docs',     module: 'config_gerais',label: 'Catálogo de Docs',             icon: '🗂️', desc: 'Tipos de documento e regras de validação' },
  ],
}

// Módulo liberado para o usuário?
// Sem perfil vinculado (modules null) → acesso total (fallback seguro:
// nunca tranca um usuário fora por falta de vínculo)
export function hasModule(user, key) {
  if (!user) return false
  if (!MODULES[user.role]) return true
  if (!user.modules) return true
  if (user.modules.includes('*')) return true // perfis de sistema 'Acesso Total'
  return user.modules.includes(key)
}

// Ação liberada? Perfis criados ANTES das ações (nenhuma chave 'acao:' na
// lista) continuam permitindo tudo — o bloqueio só vale para perfis que
// configuraram ações explicitamente.
export function hasAction(user, key) {
  if (!user) return false
  if (!MODULES[user.role]) return true
  if (!user.modules) return true
  if (user.modules.includes('*')) return true // perfis de sistema 'Acesso Total'
  if (!user.modules.some(k => String(k).startsWith('acao:'))) return true
  return user.modules.includes(key)
}
