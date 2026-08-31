// Certificado de Homologação — formato diploma, imprimível (paisagem).
// Inspirado no certificado do HOC (certificado.jrxml): moldura, texto
// "Certificamos que...", categorias homologadas, emissão e validade.
// Disponível apenas para selos ACTIVE. Rota standalone (sem navbar) para
// impressão limpa: /fornecedor/certificado/:sealId
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { supabase } from '../../lib/supabase.js'
import { Spinner } from '../../components/ui.jsx'

const fmtCnpj = (c) => {
  const d = String(c || '').replace(/\D/g, '')
  return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : (c || '')
}
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }) : null

const MAX_CATEGORIES = 24

export default function SupplierCertificate() {
  const { sealId } = useParams()
  const { user }   = useAuth()
  const navigate   = useNavigate()
  const [data, setData]   = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const isAdmin = user?.role === 'ADMIN'
    if (!sealId || (!user?.supplierId && !isAdmin)) return
    ;(async () => {
      try {
        // ADMIN (backoffice) emite o certificado de qualquer fornecedor;
        // fornecedor só emite o próprio
        let q = supabase
          .from('seals')
          .select('*, clients(razao_social, cnpj)')
          .eq('id', sealId)
        if (!isAdmin) q = q.eq('supplier_id', user.supplierId)
        const { data: seal } = await q.maybeSingle()
        if (!seal) throw new Error('Selo não encontrado')
        if (seal.status !== 'ACTIVE' || seal.client_suspended_at)
          throw new Error('O certificado só está disponível para selos ativos.')

        const supplierId = isAdmin ? seal.supplier_id : user.supplierId

        const { data: supplier } = await supabase
          .from('suppliers')
          .select('razao_social, nome_fantasia, cnpj')
          .eq('id', supplierId)
          .single()

        // Categorias do fluxo deste selo: do cliente (selo HOC) ou globais (selo ELOS)
        const { data: catRows } = await supabase
          .from('supplier_categories')
          .select('categories(id, name, client_id)')
          .eq('supplier_id', supplierId)
        const cats = (catRows || [])
          .map(r => r.categories)
          .filter(c => c && (seal.client_id ? c.client_id === seal.client_id : !c.client_id))
          .map(c => c.name.trim())
          .sort((a, b) => a.localeCompare(b, 'pt-BR'))

        setData({ seal, supplier, categories: cats })
      } catch (e) { setError(e.message) }
    })()
  }, [sealId, user?.supplierId])

  if (error) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, fontFamily: 'DM Sans,sans-serif', background: '#f4f5f9' }}>
      <div style={{ fontSize: 40 }}>🎓</div>
      <div style={{ color: '#dc2626', fontSize: 15 }}>{error}</div>
      <button onClick={() => navigate(-1)} style={{ background: '#2E3192', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 24px', cursor: 'pointer', fontFamily: 'Montserrat,sans-serif', fontWeight: 700 }}>← Voltar</button>
    </div>
  )
  if (!data) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spinner size={48}/></div>

  const { seal, supplier, categories } = data
  const isElos     = !seal.client_id
  // Selo de cliente SEMPRE exibe o nome do cliente — fallback extrai do seal_name
  const clientName = isElos
    ? 'SIGEC-ELOS'
    : (seal.clients?.razao_social
        || seal.seal_name?.replace(/^(Homologado|HOC)\s*[–-]\s*/i, '')
        || 'Cliente')
  const certNumber = `ELOS-${String(seal.id).replace(/-/g, '').slice(0, 12).toUpperCase()}`
  const shown      = categories.slice(0, MAX_CATEGORIES)
  const extra      = categories.length - shown.length

  return (
    <div style={{ minHeight: '100vh', background: '#3a3d52', padding: '32px 16px', fontFamily: 'DM Sans,sans-serif' }}>
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 0; }
          body { background: #fff !important; }
          .cert-toolbar { display: none !important; }
          .cert-wrap { padding: 0 !important; background: #fff !important; min-height: 0 !important; }
          .cert-sheet { box-shadow: none !important; margin: 0 auto !important; width: 100% !important; min-height: 100vh !important; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      {/* Barra de ações (some na impressão) */}
      <div className="cert-toolbar" style={{ maxWidth: 1050, margin: '0 auto 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button onClick={() => navigate(-1)} style={{ background: 'rgba(255,255,255,.12)', color: '#fff', border: '1px solid rgba(255,255,255,.25)', borderRadius: 10, padding: '9px 18px', cursor: 'pointer', fontFamily: 'DM Sans,sans-serif', fontSize: 13 }}>← Voltar</button>
        <button onClick={() => window.print()} style={{ background: '#F47E2F', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 28px', cursor: 'pointer', fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: 14, boxShadow: '0 6px 20px rgba(244,126,47,.4)' }}>
          🖨️ Imprimir / Salvar PDF
        </button>
      </div>

      {/* Folha do certificado — A4 paisagem */}
      <div className="cert-wrap">
        <div className="cert-sheet" style={{ maxWidth: 1050, margin: '0 auto', background: '#fffdf8', boxShadow: '0 24px 80px rgba(0,0,0,.5)', position: 'relative' }}>
          {/* Moldura dupla clássica */}
          <div style={{ border: '4px solid #1a1c5e', padding: 7 }}>
            <div style={{ border: '1.5px solid #b8860b', padding: '38px 56px 30px', position: 'relative', minHeight: 620, display: 'flex', flexDirection: 'column' }}>

              {/* Ornamentos de canto */}
              {[{ top: 8, left: 8, bt: '2px solid', bl: '2px solid' }, { top: 8, right: 8, bt: '2px solid', br: '2px solid' },
                { bottom: 8, left: 8, bb: '2px solid', bl: '2px solid' }, { bottom: 8, right: 8, bb: '2px solid', br: '2px solid' }].map((p, i) => (
                <div key={i} style={{ position: 'absolute', width: 34, height: 34, borderColor: '#b8860b',
                  top: p.top, left: p.left, right: p.right, bottom: p.bottom,
                  borderTop: p.bt || 'none', borderBottom: p.bb || 'none', borderLeft: p.bl || 'none', borderRight: p.br || 'none' }}/>
              ))}

              {/* Cabeçalho */}
              <div style={{ textAlign: 'center', marginBottom: 22 }}>
                <div style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 900, fontSize: 13, letterSpacing: 6, color: '#F47E2F', textTransform: 'uppercase', marginBottom: 14 }}>
                  SIGEC · ELOS
                </div>
                <div style={{ fontFamily: 'Georgia,\'Times New Roman\',serif', fontSize: 52, fontWeight: 700, color: '#1a1c5e', letterSpacing: 10, textTransform: 'uppercase', lineHeight: 1 }}>
                  Certificado
                </div>
                <div style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 12, letterSpacing: 4, color: '#8a8fa8', textTransform: 'uppercase', marginTop: 10 }}>
                  de Homologação de Fornecedor
                </div>
                <div style={{ width: 180, height: 2, background: 'linear-gradient(90deg, transparent, #b8860b, transparent)', margin: '16px auto 0' }}/>
              </div>

              {/* Corpo */}
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ fontFamily: 'Georgia,serif', fontSize: 16, color: '#4a4f66', marginBottom: 10 }}>
                  Certificamos que o fornecedor
                </div>
                <div style={{ fontFamily: 'Georgia,serif', fontStyle: 'italic', fontWeight: 700, fontSize: 34, color: '#1a1c5e', lineHeight: 1.2, margin: '0 auto 8px', maxWidth: 820 }}>
                  {supplier.razao_social}
                </div>
                <div style={{ fontFamily: 'DM Sans,sans-serif', fontSize: 14, color: '#4a4f66', marginBottom: 18 }}>
                  inscrito sob o CNPJ <strong style={{ color: '#1a1c5e' }}>{fmtCnpj(supplier.cnpj)}</strong>
                </div>
                <div style={{ fontFamily: 'Georgia,serif', fontSize: 16.5, color: '#374151', lineHeight: 1.7, maxWidth: 840, margin: '0 auto' }}>
                  está <strong>conforme</strong> no processo de homologação de fornecedores
                  {isElos ? ' da plataforma ' : ' da empresa '}
                  <strong style={{ color: '#1a1c5e' }}>{clientName}</strong>
                  {shown.length > 0 ? ', para as categorias de prestação de serviço e/ou fornecimento:' : '.'}
                </div>

                {shown.length > 0 && (
                  <div style={{ margin: '16px auto 0', maxWidth: 860, fontFamily: 'DM Sans,sans-serif', fontSize: 12.5, color: '#4a4f66', lineHeight: 1.9 }}>
                    {shown.join('  ·  ')}
                    {extra > 0 && <span style={{ fontStyle: 'italic' }}>  ·  e mais {extra} categoria{extra > 1 ? 's' : ''} homologada{extra > 1 ? 's' : ''}</span>}
                  </div>
                )}
              </div>

              {/* Rodapé: emissão · selo · validade */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 28, gap: 20 }}>
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 10, letterSpacing: 1.5, color: '#8a8fa8', textTransform: 'uppercase', marginBottom: 4 }}>Certificado Nº</div>
                  <div style={{ fontFamily: 'DM Sans,sans-serif', fontSize: 13, color: '#1a1c5e', fontWeight: 700 }}>{certNumber}</div>
                  <div style={{ fontFamily: 'DM Sans,sans-serif', fontSize: 11.5, color: '#8a8fa8', marginTop: 6 }}>
                    Emitido em {fmtDate(new Date().toISOString())}
                  </div>
                </div>

                {/* Medalha central */}
                <div style={{ textAlign: 'center', flexShrink: 0 }}>
                  <div style={{ width: 92, height: 92, borderRadius: '50%', margin: '0 auto',
                    background: isElos ? 'radial-gradient(circle at 35% 35%, #3d40b5, #1a1c5e)' : 'radial-gradient(circle at 35% 35%, #ffa057, #c85a0a)',
                    border: `4px solid ${isElos ? '#2E3192' : '#F47E2F'}`,
                    boxShadow: '0 4px 16px rgba(0,0,0,.25)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                    <div style={{ fontSize: 26, lineHeight: 1 }}>{isElos ? '⭐' : '🏅'}</div>
                    <div style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 900, fontSize: 10, letterSpacing: 1, marginTop: 4 }}>
                      {seal.seal_type === 'homologado' || !isElos ? 'HOMOLOGADO' : 'VERIFICADO'}
                    </div>
                  </div>
                </div>

                <div style={{ flex: 1, textAlign: 'right' }}>
                  {seal.expires_at && (
                    <>
                      <div style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 10, letterSpacing: 1.5, color: '#8a8fa8', textTransform: 'uppercase', marginBottom: 4 }}>Válido até</div>
                      <div style={{ fontFamily: 'DM Sans,sans-serif', fontSize: 13, color: '#1a1c5e', fontWeight: 700 }}>{fmtDate(seal.expires_at)}</div>
                    </>
                  )}
                  <div style={{ borderTop: '1px solid #c9cddb', marginTop: 14, paddingTop: 6, display: 'inline-block', minWidth: 190 }}>
                    <div style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 11, color: '#1a1c5e' }}>EQPI Tech · SIGEC-ELOS</div>
                    <div style={{ fontFamily: 'DM Sans,sans-serif', fontSize: 10, color: '#8a8fa8' }}>elos.eqpitech.com.br</div>
                  </div>
                </div>
              </div>

              {/* Nota de verificação */}
              <div style={{ textAlign: 'center', marginTop: 16, fontFamily: 'DM Sans,sans-serif', fontSize: 9.5, color: '#a8adc2' }}>
                Verifique a autenticidade e a situação atual em <strong>elos.eqpitech.com.br/verificar</strong> informando o número do certificado ·
                A validade está condicionada à manutenção da regularidade documental do fornecedor na plataforma SIGEC-ELOS.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
