// Termos e Aceites do cliente (patch_073) — subitem de Configurações.
// Mesmo editor do backoffice (ClientTermsEditor): coleção de documentos de
// aceite + texto legado dos Termos de Homologação.
import { PageHeader } from '../../components/ui.jsx'
import ClientTermsEditor from '../../components/ClientTermsEditor.jsx'

export default function ClientTerms() {
  return (
    <div style={{ padding: '28px 32px', maxWidth: 900, margin: '0 auto' }}>
      <PageHeader title="Termos e Aceites" subtitle="O que o fornecedor lê e aceita ao se cadastrar para a sua homologação" />
      <ClientTermsEditor />
    </div>
  )
}
