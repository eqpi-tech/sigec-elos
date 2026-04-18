import { useState } from 'react'
import { Button, Card, PageHeader } from '../../components/ui.jsx'
import { supabase } from '../../lib/supabase.js'

const ROLES = [
  { value:'BUYER', label:'Comprador',  icon:'🔍', desc:'Acesso ao marketplace para buscar fornecedores' },
  { value:'ADMIN', label:'Backoffice', icon:'⚙️', desc:'Acesso administrativo completo (EQPI Tech)' },
]

export default function BackofficeCreateUser() {
  const [name, setName]       = useState('')
  const [email, setEmail]     = useState('')
  const [org, setOrg]         = useState('')
  const [role, setRole]       = useState('BUYER')
  const [loading, setLoading] = useState(false)
  const [result, setResult]   = useState(null)
  const [error, setError]     = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(''); setResult(null); setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      const res = await fetch('/.netlify/functions/admin-create-user', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${token}` },
        body: JSON.stringify({ email, role, name, organization: org }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setResult(data)
      setName(''); setEmail(''); setOrg('')
    } catch (err) {
      setError(err.message)
    } finally { setLoading(false) }
  }

  const inp = { width:'100%', padding:'11px 14px', borderRadius:10, border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#1a1c5e', boxSizing:'border-box' }
  const lbl = { display:'block', fontFamily:'Montserrat,sans-serif', fontWeight:600, fontSize:11, color:'#1a1c5e', letterSpacing:.5, marginBottom:6, textTransform:'uppercase' }

  return (
    <div style={{ padding:'28px 32px', maxWidth:640, margin:'0 auto' }}>
      <PageHeader title="Criar Usuário" subtitle="Adicionar novo comprador ou membro do backoffice" />

      <Card style={{ borderRadius:16, padding:'24px 28px' }}>
        <form onSubmit={handleSubmit}>

          <div style={{ marginBottom:20 }}>
            <label style={lbl}>Tipo de acesso</label>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              {ROLES.map(r => (
                <button key={r.value} type="button" onClick={() => setRole(r.value)}
                  style={{ padding:'14px', borderRadius:12, textAlign:'left', cursor:'pointer',
                    border:`2px solid ${role===r.value?'#2E3192':'#e2e4ef'}`,
                    background:role===r.value?'rgba(46,49,146,.08)':'#fff' }}>
                  <div style={{ fontSize:20, marginBottom:4 }}>{r.icon}</div>
                  <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, color:role===r.value?'#2E3192':'#1a1c5e' }}>{r.label}</div>
                  <div style={{ fontFamily:'DM Sans,sans-serif', fontSize:11, color:'#9B9B9B', marginTop:2 }}>{r.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom:16 }}>
            <label style={lbl}>Nome completo</label>
            <input value={name} onChange={e=>setName(e.target.value)} placeholder="João da Silva" required style={inp} />
          </div>

          <div style={{ marginBottom:16 }}>
            <label style={lbl}>E-mail</label>
            <input value={email} onChange={e=>setEmail(e.target.value)} type="email" placeholder="usuario@empresa.com.br" required style={inp} />
          </div>

          {role === 'BUYER' && (
            <div style={{ marginBottom:16 }}>
              <label style={lbl}>Empresa / Organização</label>
              <input value={org} onChange={e=>setOrg(e.target.value)} placeholder="Vale S.A. — Suprimentos" style={inp} />
            </div>
          )}

          <div style={{ marginBottom:16, background:'rgba(46,49,146,.04)', border:'1px solid rgba(46,49,146,.1)', borderRadius:10, padding:'10px 14px' }}>
            <div style={{ fontSize:12, color:'#2E3192', fontFamily:'DM Sans,sans-serif' }}>
              🔑 Uma senha segura será gerada automaticamente e enviada por e-mail ao usuário.
            </div>
          </div>

          {error && (
            <div style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:10, padding:'10px 14px', marginBottom:16, fontSize:13, color:'#dc2626' }}>
              {error}
            </div>
          )}

          <Button type="submit" variant="primary" full size="lg" style={{ borderRadius:12 }} disabled={loading}>
            {loading ? '⏳ Criando...' : `✅ Criar ${ROLES.find(r=>r.value===role)?.label}`}
          </Button>
        </form>

        {result && (
          <div style={{ marginTop:20, background:'#f0fdf4', border:'1px solid #86efac', borderRadius:14, padding:'20px 24px' }}>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:15, color:'#15803d', marginBottom:16 }}>
              ✅ Usuário criado com sucesso!
            </div>

            <div style={{ background:'#fff', border:'2px solid #2E3192', borderRadius:10, padding:'14px 18px', marginBottom:16 }}>
              <div style={{ fontSize:11, color:'#9B9B9B', fontFamily:'Montserrat,sans-serif', fontWeight:700, textTransform:'uppercase', marginBottom:4 }}>Senha Gerada</div>
              <div style={{ fontSize:22, fontFamily:'Courier New, monospace', fontWeight:700, color:'#2E3192', letterSpacing:2 }}>
                {result.password}
              </div>
              <div style={{ fontSize:11, color:'#9B9B9B', marginTop:6 }}>
                ⚠️ Anote esta senha — ela não será exibida novamente. Um e-mail com as credenciais também foi enviado ao usuário.
              </div>
            </div>

            <div style={{ display:'grid', gap:6 }}>
              {[
                ['E-mail', result.email || email],
                ['Perfil', role === 'ADMIN' ? 'Backoffice / Analista' : 'Comprador'],
                ['Status', 'Conta ativa — acesso imediato'],
              ].map(([k, v]) => (
                <div key={k} style={{ display:'flex', gap:10 }}>
                  <span style={{ fontSize:12, color:'#9B9B9B', minWidth:80 }}>{k}</span>
                  <span style={{ fontSize:12, color:'#15803d', fontWeight:600 }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
