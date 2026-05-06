import { useState } from 'react'
import { Button, Card, PageHeader } from '../../components/ui.jsx'
import { supabase } from '../../lib/supabase.js'

const ROLES = [
  { value:'BUYER',  label:'Comprador', icon:'🔍', desc:'Acesso ao marketplace para buscar fornecedores e enviar convites simples' },
  { value:'CLIENT', label:'Cliente',   icon:'🏢', desc:'Acesso completo ao processo de homologação dos seus fornecedores (HOC)' },
  { value:'ADMIN',  label:'Backoffice',icon:'⚙️', desc:'Acesso administrativo completo — análise e aprovação de fornecedores (EQPI)' },
]

function formatCnpj(v) {
  const n = v.replace(/\D/g,'').slice(0,14)
  return n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2}).*/, (_,a,b,c,d,e)=>
    e ? `${a}.${b}.${c}/${d}-${e}` : d ? `${a}.${b}.${c}/${d}` : c ? `${a}.${b}.${c}` : b ? `${a}.${b}` : a)
}

export default function BackofficeCreateUser() {
  const [name, setName]       = useState('')
  const [email, setEmail]     = useState('')
  const [org, setOrg]         = useState('')
  const [cnpj, setCnpj]       = useState('')
  const [role, setRole]       = useState('CLIENT')
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
        body: JSON.stringify({ email, role, name, organization: org, cnpj: cnpj.replace(/\D/g,'') }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setResult({ ...data, createdRole: role, createdOrg: org })
      setName(''); setEmail(''); setOrg(''); setCnpj('')
    } catch (err) {
      setError(err.message)
    } finally { setLoading(false) }
  }

  const inp = { width:'100%', padding:'11px 14px', borderRadius:10, border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#1a1c5e', boxSizing:'border-box' }
  const lbl = { display:'block', fontFamily:'Montserrat,sans-serif', fontWeight:600, fontSize:11, color:'#1a1c5e', letterSpacing:.5, marginBottom:6, textTransform:'uppercase' }

  const roleLabel = { BUYER:'Comprador', CLIENT:'Cliente', ADMIN:'Backoffice / Analista' }

  return (
    <div style={{ padding:'28px 32px', maxWidth:640, margin:'0 auto' }}>
      <PageHeader title="Criar Usuário" subtitle="Adicionar comprador, cliente ou membro do backoffice" />

      <Card style={{ borderRadius:16, padding:'24px 28px' }}>
        <form onSubmit={handleSubmit}>

          <div style={{ marginBottom:20 }}>
            <label style={lbl}>Tipo de acesso</label>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
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

          {role === 'CLIENT' && (
            <div style={{ marginBottom:16, background:'#EEF0FF', border:'1px solid #C7CAFF', borderRadius:10, padding:'10px 14px' }}>
              <div style={{ fontSize:12, color:'#2E3192', fontFamily:'DM Sans,sans-serif' }}>
                O Cliente terá acesso completo ao processo de homologação dos fornecedores que ele convidar — equivalente ao perfil HOC.
              </div>
            </div>
          )}

          <div style={{ marginBottom:16 }}>
            <label style={lbl}>Nome do responsável</label>
            <input value={name} onChange={e=>setName(e.target.value)} placeholder="João da Silva" required style={inp} />
          </div>

          <div style={{ marginBottom:16 }}>
            <label style={lbl}>E-mail</label>
            <input value={email} onChange={e=>setEmail(e.target.value)} type="email" placeholder="usuario@empresa.com.br" required style={inp} />
          </div>

          {(role === 'BUYER' || role === 'CLIENT') && (
            <div style={{ marginBottom:16 }}>
              <label style={lbl}>{role === 'CLIENT' ? 'Razão Social da Empresa *' : 'Empresa / Organização'}</label>
              <input value={org} onChange={e=>setOrg(e.target.value)} placeholder="Vale S.A." required={role === 'CLIENT'} style={inp} />
            </div>
          )}

          {role === 'CLIENT' && (
            <div style={{ marginBottom:16 }}>
              <label style={lbl}>CNPJ da Empresa</label>
              <input value={cnpj} onChange={e=>setCnpj(formatCnpj(e.target.value))} placeholder="00.000.000/0001-00" style={inp} />
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
                ['E-mail', email],
                ['Perfil', roleLabel[result.createdRole]],
                result.createdOrg ? ['Empresa', result.createdOrg] : null,
                ['Status', 'Conta ativa — acesso imediato'],
              ].filter(Boolean).map(([k, v]) => (
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
