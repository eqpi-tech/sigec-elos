// Backoffice — Termos de Aceite por cliente (18/09, patch_073).
// Mesmo editor da visão cliente, com seletor de cliente (a EQPI mantém os
// documentos em nome do cliente quando ele não opera a plataforma).
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase.js'
import { Card, Spinner, PageHeader } from '../../components/ui.jsx'
import ClientTermsEditor from '../../components/ClientTermsEditor.jsx'

export default function BackofficeClientTerms() {
  const [clients, setClients] = useState(null)
  const [cid, setCid] = useState('')

  useEffect(() => {
    supabase.from('clients')
      .select('id, razao_social, nome_fantasia, active')
      .order('razao_social')
      .then(({ data }) => {
        const list = (data || []).filter(c => c.active !== false)
        setClients(list)
        if (list.length) setCid(list[0].id)
      })
  }, [])

  if (!clients) return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><Spinner size={40} /></div>

  return (
    <div style={{ padding: '28px 32px', maxWidth: 900, margin: '0 auto' }}>
      <PageHeader title="Termos de Aceite" subtitle="Documentos e textos que o fornecedor aceita no cadastro, por cliente" />
      <Card style={{ borderRadius: 14, padding: '14px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 12, fontFamily: 'Montserrat,sans-serif', fontWeight: 700, color: '#9B9B9B', textTransform: 'uppercase', letterSpacing: .5 }}>Cliente</span>
        <select value={cid} onChange={e => setCid(e.target.value)}
          style={{ flex: 1, maxWidth: 420, padding: '9px 12px', borderRadius: 10, border: '1px solid #e2e4ef', fontFamily: 'DM Sans,sans-serif', fontSize: 13 }}>
          {clients.map(c => <option key={c.id} value={c.id}>{c.nome_fantasia || c.razao_social}</option>)}
        </select>
      </Card>
      {cid && <ClientTermsEditor key={cid} clientId={cid} />}
    </div>
  )
}
