import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../context/AuthContext.jsx'
import { Card, PageHeader, SectionTitle, Spinner } from '../components/ui.jsx'

// Ajuda (13/10): manuais em PDF (só para quem está logado — links temporários
// da função help-docs) + canais de suporte da EQPI. O manual do papel atual
// aparece primeiro.
const ROLE_MANUAL = { SUPPLIER: 'fornecedor', CLIENT: 'cliente', BUYER: 'comprador', ADMIN: 'backoffice' }
const ICON = { fornecedor: '🏭', cliente: '🏢', comprador: '🛒', backoffice: '⚙️' }

const CANAIS = [
  { icon: '✉️', label: 'E-mail', value: 'suporte@eqpitech.com.br', href: 'mailto:suporte@eqpitech.com.br' },
  { icon: '💬', label: 'WhatsApp', value: '(11) 5039-6769', href: 'https://wa.me/551150396769' },
  { icon: '📞', label: 'Telefone', value: '(11) 2305-3881', href: 'tel:+551123053881' },
]

export default function Help() {
  const { user } = useAuth()
  const [manuais, setManuais] = useState(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const r = await fetch('/.netlify/functions/help-docs', { headers: { Authorization: `Bearer ${session?.access_token || ''}` } })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Não foi possível carregar os manuais agora')
      const meu = ROLE_MANUAL[user?.role]
      setManuais([...j.manuais].sort((a, b) => (b.key === meu) - (a.key === meu)))
    }).catch(e => setErro(e.message))
  }, [user?.role])

  const meu = ROLE_MANUAL[user?.role]
  return (
    <div style={{ padding: '28px 32px', maxWidth: 820, margin: '0 auto' }}>
      <PageHeader title="Ajuda" subtitle="Manuais da plataforma e canais de suporte da EQPI" />

      <Card style={{ borderRadius: 16, padding: '24px 28px', marginBottom: 20 }}>
        <SectionTitle>Manuais</SectionTitle>
        <p style={{ fontFamily: 'DM Sans,sans-serif', fontSize: 13.5, color: '#6b7280', margin: '0 0 16px' }}>
          Passo a passo com imagens das telas. As telas dos manuais mostram empresas e pessoas fictícias.
        </p>
        {erro && <div style={{ fontFamily: 'DM Sans,sans-serif', fontSize: 13, color: '#dc2626' }}>{erro}</div>}
        {!manuais && !erro && <Spinner size={28} />}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
          {(manuais || []).map(m => (
            <a key={m.key} href={m.url || undefined} target="_blank" rel="noopener noreferrer"
              onClick={e => { if (!m.url) e.preventDefault() }}
              style={{ display: 'block', textDecoration: 'none', borderRadius: 12, padding: '16px 18px',
                border: `1px solid ${m.key === meu ? '#F47E2F' : '#e2e4ef'}`, background: m.key === meu ? '#fff7ed' : '#f8f9fb',
                opacity: m.url ? 1 : .5, cursor: m.url ? 'pointer' : 'default' }}>
              <div style={{ fontSize: 24, marginBottom: 6 }}>{ICON[m.key]}</div>
              <div style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: 14, color: '#1a1c5e' }}>
                {m.title}{m.key === meu && <span style={{ marginLeft: 6, fontSize: 10, color: '#F47E2F' }}>· seu perfil</span>}
              </div>
              <div style={{ fontFamily: 'DM Sans,sans-serif', fontSize: 12.5, color: '#6b7280', marginTop: 4, lineHeight: 1.5 }}>{m.desc}</div>
              <div style={{ fontFamily: 'DM Sans,sans-serif', fontSize: 12.5, color: '#2E3192', fontWeight: 700, marginTop: 10 }}>
                {m.url ? 'Abrir PDF →' : 'Indisponível no momento'}
              </div>
            </a>
          ))}
        </div>
      </Card>

      <Card style={{ borderRadius: 16, padding: '24px 28px' }}>
        <SectionTitle>Fale com o suporte</SectionTitle>
        <p style={{ fontFamily: 'DM Sans,sans-serif', fontSize: 13.5, color: '#6b7280', margin: '0 0 16px' }}>
          Dúvidas sobre o acesso, documentos ou processos? A equipe da EQPI ajuda você.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
          {CANAIS.map(c => (
            <a key={c.label} href={c.href} target={c.href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', borderRadius: 12, padding: '14px 16px', border: '1px solid #e2e4ef', background: '#f8f9fb' }}>
              <span style={{ fontSize: 22 }}>{c.icon}</span>
              <span>
                <span style={{ display: 'block', fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 11, color: '#9B9B9B', textTransform: 'uppercase', letterSpacing: .5 }}>{c.label}</span>
                <span style={{ display: 'block', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, fontSize: 14, color: '#1a1c5e', wordBreak: 'break-all' }}>{c.value}</span>
              </span>
            </a>
          ))}
        </div>
      </Card>
    </div>
  )
}
