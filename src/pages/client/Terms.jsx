// Termos e Aceites do cliente (18/09, patch_073) — subitem de Configurações.
// Duas partes: o texto de termos legado (exibido no onboarding como bloco de
// leitura) e a COLEÇÃO de documentos de aceite (cada um com checkbox próprio
// e trilha de aceite por versão).
import { useState, useEffect } from 'react'
import { clientApi } from '../../services/api.js'
import { Button, Card, Spinner, PageHeader, SectionTitle } from '../../components/ui.jsx'
import ClientTermsEditor from '../../components/ClientTermsEditor.jsx'

export default function ClientTerms() {
  const [terms, setTerms]       = useState('')
  const [original, setOriginal] = useState('')
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)

  useEffect(() => {
    clientApi.getTerms()
      .then(t => { setTerms(t || ''); setOriginal(t || '') })
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true); setSaved(false)
    try {
      await clientApi.saveTerms(terms)
      setOriginal(terms); setSaved(true); setTimeout(() => setSaved(false), 3000)
    } catch (e) { alert('Erro ao salvar: ' + e.message) }
    setSaving(false)
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}><Spinner size={48} /></div>

  return (
    <div style={{ padding: '28px 32px', maxWidth: 900, margin: '0 auto' }}>
      <PageHeader title="Termos e Aceites" subtitle="O que o fornecedor lê e aceita ao se cadastrar para a sua homologação" />

      <div style={{ marginBottom: 24 }}>
        <ClientTermsEditor />
      </div>

      <Card style={{ borderRadius: 16, padding: '24px 28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap: 10 }}>
          <div>
            <SectionTitle>Termos de Homologação (texto de leitura)</SectionTitle>
            <div style={{ fontFamily: 'DM Sans,sans-serif', fontSize: 12, color: '#64748b', marginTop: 4, maxWidth: 520 }}>
              Bloco de texto exibido no topo do passo de aceite. Em branco, o fornecedor vê os termos padrão do SIGEC-ELOS.
            </div>
          </div>
          {!terms
            ? <span style={{ fontSize: 11, fontWeight: 700, color: '#9B9B9B', background: '#f0f0f0', borderRadius: 20, padding: '4px 10px', fontFamily: 'Montserrat,sans-serif', flexShrink: 0 }}>Usando termos padrão</span>
            : <span style={{ fontSize: 11, fontWeight: 700, color: '#2E3192', background: 'rgba(46,49,146,.1)', borderRadius: 20, padding: '4px 10px', fontFamily: 'Montserrat,sans-serif', flexShrink: 0 }}>Personalizado</span>}
        </div>
        <textarea value={terms} onChange={e => setTerms(e.target.value)} rows={14}
          placeholder="Cole aqui o texto dos seus Termos de Homologação..."
          style={{ width: '100%', padding: '14px 16px', borderRadius: 12, border: '1px solid #e2e4ef', fontFamily: 'DM Mono,monospace,DM Sans,sans-serif', fontSize: 13, color: '#1a1c5e', resize: 'vertical', lineHeight: 1.6, boxSizing: 'border-box', outline: 'none' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
          <button onClick={() => { if (confirm('Restaurar os termos padrão SIGEC-ELOS?')) setTerms('') }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9B9B9B', fontSize: 13, fontFamily: 'DM Sans,sans-serif', textDecoration: 'underline', padding: 0 }}>
            Restaurar termos padrão
          </button>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {saved && <span style={{ color: '#22c55e', fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 12 }}>✓ Salvo</span>}
            <Button variant="primary" disabled={saving || terms === original} onClick={handleSave}>
              {saving ? '⏳ Salvando...' : 'Salvar Termos'}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
