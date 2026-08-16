// Meus Dados — autoatendimento do fornecedor (paridade HOC):
// dados cadastrais editáveis + quadro societário (CRUD).
// Razão social, CNPJ e status são somente leitura (fontes: Receita/backoffice).
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase.js'
import { Button, Card, Spinner, PageHeader, SectionTitle } from '../../components/ui.jsx'

const TIPO_LABEL = { pf: 'Pessoa Física', pj: 'Pessoa Jurídica', estrangeiro: 'Estrangeiro' }

async function callApi(method, body) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch('/.netlify/functions/update-supplier-profile', {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Erro')
  return data
}

const EMPTY_PARTNER = { tipo: 'pf', nome: '', cpf_cnpj: '', cargo: '', nacionalidade: 'Brasileira', participacao: '' }

export default function SupplierMyData() {
  const [supplier, setSupplier] = useState(null)
  const [partners, setPartners] = useState([])
  const [form,     setForm]     = useState({})
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [dirty,    setDirty]    = useState(false)
  const [toast,    setToast]    = useState(null)
  const [partnerModal, setPartnerModal] = useState(null)  // EMPTY_PARTNER ou sócio existente
  const [partnerSaving, setPartnerSaving] = useState(false)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { supplier: s, partners: p } = await callApi('GET')
      setSupplier(s)
      setPartners(p)
      setForm({
        nome_fantasia: s.nome_fantasia || '', phone: s.phone || '',
        email: s.email || '', email_financeiro: s.email_financeiro || '',
        contact_name: s.contact_name || '',
        inscricao_estadual: s.inscricao_estadual || '', inscricao_municipal: s.inscricao_municipal || '',
        tipo_empresa: s.tipo_empresa || '',
        state: s.state || '', city: s.city || '',
        logradouro: s.address?.logradouro || '', numero: s.address?.numero || '',
        bairro: s.address?.bairro || '', cep: s.address?.cep || '',
      })
      setDirty(false)
    } catch (e) { showToast('Erro: ' + e.message, 'error') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const set = (k) => (e) => { setForm(f => ({ ...f, [k]: e.target.value })); setDirty(true) }

  const save = async () => {
    setSaving(true)
    try {
      await callApi('POST', {
        action: 'update-profile',
        fields: {
          nome_fantasia: form.nome_fantasia, phone: form.phone,
          email: form.email, email_financeiro: form.email_financeiro,
          contact_name: form.contact_name,
          inscricao_estadual: form.inscricao_estadual, inscricao_municipal: form.inscricao_municipal,
          tipo_empresa: form.tipo_empresa,
          state: form.state, city: form.city,
          address: {
            logradouro: form.logradouro || undefined, numero: form.numero || undefined,
            bairro: form.bairro || undefined, cep: form.cep || undefined,
            municipio: form.city || undefined, uf: form.state || undefined,
          },
        },
      })
      setDirty(false)
      showToast('✅ Dados atualizados com sucesso!')
    } catch (e) { showToast('Erro: ' + e.message, 'error') }
    finally { setSaving(false) }
  }

  const savePartner = async () => {
    if (!partnerModal?.nome?.trim()) return
    setPartnerSaving(true)
    try {
      await callApi('POST', {
        action: partnerModal.id ? 'update-partner' : 'add-partner',
        partner: partnerModal,
      })
      setPartnerModal(null)
      await load()
      showToast('✅ Quadro societário atualizado!')
    } catch (e) { showToast('Erro: ' + e.message, 'error') }
    finally { setPartnerSaving(false) }
  }

  const deletePartner = async (p) => {
    if (!confirm(`Remover o sócio "${p.nome}"?`)) return
    try {
      await callApi('POST', { action: 'delete-partner', partnerId: p.id })
      setPartners(prev => prev.filter(x => x.id !== p.id))
      showToast('Sócio removido.')
    } catch (e) { showToast('Erro: ' + e.message, 'error') }
  }

  if (loading) return <div style={{ display:'flex', justifyContent:'center', alignItems:'center', height:'50vh' }}><Spinner size={48}/></div>

  const inp = { width:'100%', padding:'10px 12px', borderRadius:10, border:'1px solid #e2e4ef', fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#1a1c5e', boxSizing:'border-box', outline:'none' }
  const ro  = { ...inp, background:'#f4f5f9', color:'#64748b', cursor:'not-allowed' }
  const lbl = { display:'block', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:10, color:'#9B9B9B', letterSpacing:.5, textTransform:'uppercase', marginBottom:5 }
  const grid = { display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))', gap:14 }

  return (
    <div style={{ padding:'28px 32px', maxWidth:900, margin:'0 auto' }}>
      {toast && (
        <div style={{ position:'fixed', top:80, right:24, background:toast.type==='error'?'#ef4444':'#22c55e', color:'#fff', padding:'12px 20px', borderRadius:12, zIndex:9999, fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, boxShadow:'0 8px 24px rgba(0,0,0,.2)', maxWidth:360 }}>
          {toast.msg}
        </div>
      )}

      <PageHeader
        title="Meus Dados"
        subtitle="Mantenha os dados cadastrais e o quadro societário da sua empresa atualizados"
        action={
          <Button variant="orange" size="lg" style={{ borderRadius:12 }} disabled={!dirty || saving} onClick={save}>
            {saving ? <><Spinner size={16}/> Salvando...</> : '💾 Salvar alterações'}
          </Button>
        }
      />

      {/* ── Identificação (somente leitura) ── */}
      <Card style={{ borderRadius:16, padding:'20px 24px', marginBottom:16 }}>
        <SectionTitle>Identificação</SectionTitle>
        <div style={grid}>
          <div style={{ gridColumn:'1 / -1' }}>
            <span style={lbl}>Razão Social · atualizada pela Receita Federal</span>
            <input value={supplier?.razao_social || ''} disabled style={ro}/>
          </div>
          <div>
            <span style={lbl}>CNPJ</span>
            <input value={supplier?.cnpj || ''} disabled style={ro}/>
          </div>
          <div>
            <span style={lbl}>Data de Abertura</span>
            <input value={supplier?.data_abertura || '—'} disabled style={ro}/>
          </div>
          <div>
            <span style={lbl}>Nome Fantasia</span>
            <input value={form.nome_fantasia} onChange={set('nome_fantasia')} style={inp}/>
          </div>
          <div>
            <span style={lbl}>Tipo de Empresa</span>
            <input value={form.tipo_empresa} onChange={set('tipo_empresa')} placeholder="LTDA, S.A., MEI..." style={inp}/>
          </div>
          <div>
            <span style={lbl}>Inscrição Estadual</span>
            <input value={form.inscricao_estadual} onChange={set('inscricao_estadual')} placeholder="Número ou ISENTO" style={inp}/>
          </div>
          <div>
            <span style={lbl}>Inscrição Municipal</span>
            <input value={form.inscricao_municipal} onChange={set('inscricao_municipal')} placeholder="Número ou ISENTO" style={inp}/>
          </div>
        </div>
      </Card>

      {/* ── Contato ── */}
      <Card style={{ borderRadius:16, padding:'20px 24px', marginBottom:16 }}>
        <SectionTitle>Contato</SectionTitle>
        <div style={grid}>
          <div>
            <span style={lbl}>Pessoa de Contato</span>
            <input value={form.contact_name} onChange={set('contact_name')} style={inp}/>
          </div>
          <div>
            <span style={lbl}>Telefone</span>
            <input value={form.phone} onChange={set('phone')} style={inp}/>
          </div>
          <div>
            <span style={lbl}>E-mail Comercial</span>
            <input type="email" value={form.email} onChange={set('email')} style={inp}/>
          </div>
          <div>
            <span style={lbl}>E-mail Financeiro</span>
            <input type="email" value={form.email_financeiro} onChange={set('email_financeiro')} style={inp}/>
          </div>
        </div>
      </Card>

      {/* ── Endereço ── */}
      <Card style={{ borderRadius:16, padding:'20px 24px', marginBottom:16 }}>
        <SectionTitle>Endereço</SectionTitle>
        <div style={grid}>
          <div style={{ gridColumn:'1 / -1' }}>
            <span style={lbl}>Logradouro</span>
            <input value={form.logradouro} onChange={set('logradouro')} style={inp}/>
          </div>
          <div>
            <span style={lbl}>Número</span>
            <input value={form.numero} onChange={set('numero')} style={inp}/>
          </div>
          <div>
            <span style={lbl}>Bairro</span>
            <input value={form.bairro} onChange={set('bairro')} style={inp}/>
          </div>
          <div>
            <span style={lbl}>Cidade</span>
            <input value={form.city} onChange={set('city')} style={inp}/>
          </div>
          <div>
            <span style={lbl}>UF</span>
            <input value={form.state} onChange={set('state')} maxLength={2} style={inp}/>
          </div>
          <div>
            <span style={lbl}>CEP</span>
            <input value={form.cep} onChange={set('cep')} style={inp}/>
          </div>
        </div>
      </Card>

      {/* ── Quadro Societário ── */}
      <Card style={{ borderRadius:16, padding:'20px 24px', marginBottom:16 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
          <SectionTitle style={{ marginBottom:0 }}>Quadro Societário ({partners.length})</SectionTitle>
          <Button variant="primary" size="sm" onClick={() => setPartnerModal({ ...EMPTY_PARTNER })}>+ Adicionar Sócio</Button>
        </div>

        {partners.length === 0 ? (
          <div style={{ textAlign:'center', padding:'20px 0', color:'#9B9B9B', fontFamily:'DM Sans,sans-serif', fontSize:13 }}>
            Nenhum sócio cadastrado. Adicione os sócios e representantes legais da empresa.
          </div>
        ) : partners.map(p => (
          <div key={p.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', background:'#f8f9ff', borderRadius:12, marginBottom:8 }}>
            <div style={{ width:38, height:38, borderRadius:10, background:'rgba(46,49,146,.1)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:15, color:'#2E3192', flexShrink:0 }}>
              {p.nome?.[0]?.toUpperCase()}
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13.5, color:'#1a1c5e' }}>{p.nome}</div>
              <div style={{ fontSize:11.5, color:'#9B9B9B', fontFamily:'DM Sans,sans-serif' }}>
                {[TIPO_LABEL[p.tipo], p.cargo, p.cpf_cnpj, p.participacao != null ? `${p.participacao}%` : null].filter(Boolean).join(' · ')}
              </div>
            </div>
            <Button variant="neutral" size="sm" onClick={() => setPartnerModal({ ...p })}>✏</Button>
            <Button variant="danger" size="sm" onClick={() => deletePartner(p)}>🗑</Button>
          </div>
        ))}
      </Card>

      {/* Modal sócio */}
      {partnerModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'#fff', borderRadius:16, padding:28, maxWidth:460, width:'100%', boxShadow:'0 20px 60px rgba(0,0,0,.2)' }}>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:16, color:'#1a1c5e', marginBottom:16 }}>
              {partnerModal.id ? '✏ Editar Sócio' : '+ Adicionar Sócio'}
            </div>

            <div style={{ marginBottom:12 }}>
              <span style={lbl}>Tipo</span>
              <div style={{ display:'flex', gap:8 }}>
                {Object.entries(TIPO_LABEL).map(([val, label]) => (
                  <button key={val} onClick={() => setPartnerModal(p => ({ ...p, tipo: val }))}
                    style={{ flex:1, padding:'8px 6px', borderRadius:10, border:`2px solid ${partnerModal.tipo===val?'#2E3192':'#e2e4ef'}`, background:partnerModal.tipo===val?'rgba(46,49,146,.06)':'#fff', cursor:'pointer', fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:11, color:partnerModal.tipo===val?'#2E3192':'#9B9B9B' }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {[
              ['nome', 'Nome *', ''],
              ['cpf_cnpj', partnerModal.tipo === 'pj' ? 'CNPJ' : 'CPF', ''],
              ['cargo', 'Cargo', 'Sócio, Administrador, Diretor...'],
              ['nacionalidade', 'Nacionalidade', ''],
              ['participacao', 'Participação Societária (%)', '0 a 100'],
            ].map(([field, label, placeholder]) => (
              <div key={field} style={{ marginBottom:12 }}>
                <span style={lbl}>{label}</span>
                <input value={partnerModal[field] ?? ''} placeholder={placeholder}
                  type={field === 'participacao' ? 'number' : 'text'}
                  onChange={e => setPartnerModal(p => ({ ...p, [field]: e.target.value }))} style={inp}/>
              </div>
            ))}

            <div style={{ display:'flex', gap:8, marginTop:16 }}>
              <Button variant="neutral" full onClick={() => setPartnerModal(null)}>Cancelar</Button>
              <Button variant="primary" full disabled={partnerSaving || !partnerModal.nome?.trim()} onClick={savePartner}>
                {partnerSaving ? <Spinner size={14}/> : '💾 Salvar'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
