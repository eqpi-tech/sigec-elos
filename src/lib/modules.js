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
    { key: 'configuracoes', label: 'Configurações',  icon: '⚙️', desc: 'Termos e portal white-label' },
    { key: 'equipe',        label: 'Equipe',         icon: '👥', desc: 'Gestão de usuários da empresa' },
  ],
}

// AÇÕES dentro dos módulos (nível abaixo do menu — 09/09/2026).
// Guardadas na MESMA lista modules do perfil, com prefixo 'acao:'.
export const ACTIONS = {
  CLIENT: [
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
}

// Módulo liberado para o usuário?
// Sem perfil vinculado (modules null) → acesso total (fallback seguro:
// nunca tranca um usuário fora por falta de vínculo)
export function hasModule(user, key) {
  if (!user) return false
  if (!['SUPPLIER', 'CLIENT'].includes(user.role)) return true
  if (!user.modules) return true
  return user.modules.includes(key)
}

// Ação liberada? Perfis criados ANTES das ações (nenhuma chave 'acao:' na
// lista) continuam permitindo tudo — o bloqueio só vale para perfis que
// configuraram ações explicitamente.
export function hasAction(user, key) {
  if (!user) return false
  if (!['SUPPLIER', 'CLIENT'].includes(user.role)) return true
  if (!user.modules) return true
  if (!user.modules.some(k => String(k).startsWith('acao:'))) return true
  return user.modules.includes(key)
}
