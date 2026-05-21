import { useState, useEffect } from 'react'
import { clientApi } from '../../services/api.js'
import { Button, Card, Spinner, PageHeader, SectionTitle } from '../../components/ui.jsx'

export default function ClientSettings() {
  const [terms,    setTerms]    = useState('')
  const [original, setOriginal] = useState('')
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [saved,    setSaved]    = useState(false)

  useEffect(() => {
    clientApi.getTerms()
      .then(t => { setTerms(t || ''); setOriginal(t || '') })
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    try {
      await clientApi.saveTerms(terms)
      setOriginal(terms)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch(e) { alert('Erro ao salvar: ' + e.message) }
    setSaving(false)
  }

  const handleReset = () => {
    if (!confirm('Restaurar para os termos padrão SIGEC-ELOS? Seus termos personalizados serão removidos.')) return
    setTerms('')
  }

  const isDirty = terms !== original

  if (loading) return <div style={{ display:'flex', justifyContent:'center', alignItems:'center', height:'50vh' }}><Spinner size={48}/></div>

  return (
    <div style={{ padding:'28px 32px', maxWidth:900, margin:'0 auto' }}>
      <PageHeader
        title="Configurações"
        subtitle="Personalize a experiência para seus fornecedores"
      />

      <Card style={{ borderRadius:16, padding:'28px 32px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
          <div>
            <SectionTitle>Termos de Uso Personalizados</SectionTitle>
            <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#64748b', marginTop:4, maxWidth:520 }}>
              Seu fornecedor verá estes termos durante o onboarding. Deixe em branco para usar os termos padrão do SIGEC-ELOS.
            </div>
          </div>
          {!terms && (
            <div style={{ fontSize:11, fontWeight:700, color:'#9B9B9B', background:'#f0f0f0', borderRadius:20, padding:'4px 10px', fontFamily:'Montserrat,sans-serif', flexShrink:0 }}>
              Usando termos padrão
            </div>
          )}
          {terms && (
            <div style={{ fontSize:11, fontWeight:700, color:'#2E3192', background:'rgba(46,49,146,.1)', borderRadius:20, padding:'4px 10px', fontFamily:'Montserrat,sans-serif', flexShrink:0 }}>
              Termos personalizados ativos
            </div>
          )}
        </div>

        {/* Info banner */}
        <div style={{ background:'rgba(46,49,146,.04)', border:'1px solid rgba(46,49,146,.15)', borderRadius:10, padding:'10px 14px', marginBottom:16, fontFamily:'DM Sans,sans-serif', fontSize:12, color:'#1a1c5e' }}>
          <strong>Dica:</strong> Inclua cláusulas específicas do seu processo de homologação, prazos, responsabilidades e requisitos legais. Novos convites passarão a exibir estes termos automaticamente.
        </div>

        <textarea
          value={terms}
          onChange={e => setTerms(e.target.value)}
          placeholder="Cole aqui o texto dos seus Termos de Uso personalizados...&#10;&#10;Ex: Termos e Condições de Homologação de Fornecedores&#10;&#10;1. O fornecedor declara que as informações prestadas são verdadeiras...&#10;2. ..."
          rows={20}
          style={{ width:'100%', padding:'14px 16px', borderRadius:12, border:'1px solid #e2e4ef', fontFamily:'DM Mono,monospace,DM Sans,sans-serif', fontSize:13, color:'#1a1c5e', resize:'vertical', lineHeight:1.6, boxSizing:'border-box', outline:'none' }}
        />

        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:16 }}>
          <button onClick={handleReset}
            style={{ background:'none', border:'none', cursor:'pointer', color:'#9B9B9B', fontSize:13, fontFamily:'DM Sans,sans-serif', textDecoration:'underline', padding:0 }}>
            Restaurar termos padrão
          </button>

          <div style={{ display:'flex', gap:10, alignItems:'center' }}>
            {saved && (
              <span style={{ color:'#22c55e', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:12 }}>
                ✓ Salvo com sucesso
              </span>
            )}
            <Button variant="primary" disabled={saving || !isDirty} onClick={handleSave}>
              {saving ? '⏳ Salvando...' : 'Salvar Termos'}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
