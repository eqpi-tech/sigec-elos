// Verificação pública de certificado ELOS — /verificar (sem login).
// Qualquer pessoa digita o código impresso no certificado e vê se é
// verídico e se AINDA está válido (status atual do selo, não o da emissão).
import { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'

const font   = { fontFamily:'DM Sans,sans-serif' }
const titleF = { fontFamily:'Montserrat,sans-serif' }
const fmtD   = d => d ? new Date(d).toLocaleDateString('pt-BR') : '—'

const SITUATION = {
  VALIDO:    { icon:'✅', label:'Certificado VÁLIDO',      color:'#15803d', bg:'#f0fdf4', border:'#86efac',
               desc:'O certificado é verídico e o selo está vigente nesta data.' },
  VENCIDO:   { icon:'⏰', label:'Certificado VENCIDO',     color:'#92400e', bg:'#fff7ed', border:'#fdba74',
               desc:'O certificado é verídico, porém a validade do selo expirou.' },
  SUSPENSO:  { icon:'⛔', label:'Certificado SUSPENSO',    color:'#b91c1c', bg:'#fef2f2', border:'#fca5a5',
               desc:'O certificado é verídico, porém o selo está suspenso — houve pendência documental ou cadastral após a emissão.' },
  CANCELADO: { icon:'🚫', label:'Certificado NÃO VIGENTE', color:'#b91c1c', bg:'#fef2f2', border:'#fca5a5',
               desc:'O código existe, mas o selo não está vigente no momento.' },
}

export default function VerifyCertificate() {
  const [params] = useSearchParams()
  const [code, setCode]       = useState(params.get('code') || '')
  const [result, setResult]   = useState(null)
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)

  async function verify(c) {
    const q = (c ?? code).trim()
    if (!q) return
    setLoading(true); setError(''); setResult(null)
    try {
      const res = await fetch(`/.netlify/functions/verify-certificate?code=${encodeURIComponent(q)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro na verificação')
      setResult(data)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  // Código vindo por URL (?code=) → verifica direto (ex.: QR/link no PDF)
  useEffect(() => { if (params.get('code')) verify(params.get('code')) }, [])  // eslint-disable-line

  const sit = result?.found ? SITUATION[result.situation] || SITUATION.CANCELADO : null

  return (
    <div style={{ minHeight:'100vh', background:'linear-gradient(180deg,#f7f8fc 0%,#eef0fa 100%)', display:'flex', flexDirection:'column' }}>
      {/* Topo */}
      <div style={{ background:'#2E3192', padding:'18px 32px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <Link to="/" style={{ ...titleF, fontWeight:900, fontSize:20, color:'#fff', textDecoration:'none' }}>
          SIGEC-<span style={{ color:'#F47E2F' }}>ELOS</span>
        </Link>
        <Link to="/login" style={{ ...font, fontSize:13, color:'#C7D2FE', textDecoration:'none' }}>Entrar →</Link>
      </div>

      <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', padding:'48px 16px' }}>
        <div style={{ width:'100%', maxWidth:560 }}>
          <div style={{ textAlign:'center', marginBottom:28 }}>
            <div style={{ fontSize:40, marginBottom:8 }}>🎓</div>
            <h1 style={{ ...titleF, fontWeight:900, fontSize:26, color:'#1a1c5e', margin:0 }}>Verificar Certificado</h1>
            <p style={{ ...font, fontSize:14, color:'#64748b', marginTop:8, lineHeight:1.6 }}>
              Digite o código impresso no certificado (ex.: <strong>ELOS-1A2B3C4D5E6F</strong>) para
              confirmar a autenticidade e a situação <strong>nesta data</strong>.
            </p>
          </div>

          <div style={{ background:'#fff', borderRadius:16, padding:'24px 28px', boxShadow:'0 8px 30px rgba(26,28,94,.08)' }}>
            <form onSubmit={e => { e.preventDefault(); verify() }} style={{ display:'flex', gap:10 }}>
              <input value={code} onChange={e => setCode(e.target.value)} autoFocus
                placeholder="ELOS-XXXXXXXXXXXX"
                style={{ flex:1, padding:'13px 16px', borderRadius:12, border:'1.5px solid #e2e4ef', ...font, fontSize:15, letterSpacing:1, textTransform:'uppercase', outline:'none' }}/>
              <button type="submit" disabled={loading || !code.trim()}
                style={{ padding:'13px 26px', borderRadius:12, border:'none', background: code.trim() ? '#F47E2F' : '#f8cdb0', color:'#fff', ...titleF, fontWeight:800, fontSize:14, cursor: code.trim() ? 'pointer' : 'not-allowed' }}>
                {loading ? '...' : 'Verificar'}
              </button>
            </form>

            {error && (
              <div style={{ marginTop:16, padding:'10px 14px', borderRadius:10, background:'#fef2f2', border:'1px solid #fca5a5', ...font, fontSize:13, color:'#b91c1c' }}>{error}</div>
            )}

            {result && !result.found && (
              <div style={{ marginTop:20, padding:'18px 20px', borderRadius:12, background:'#fef2f2', border:'1.5px solid #fca5a5', textAlign:'center' }}>
                <div style={{ fontSize:30 }}>❌</div>
                <div style={{ ...titleF, fontWeight:900, fontSize:16, color:'#b91c1c', marginTop:6 }}>Certificado NÃO ENCONTRADO</div>
                <div style={{ ...font, fontSize:13, color:'#64748b', marginTop:6 }}>
                  Este código não corresponde a nenhum certificado emitido pela plataforma SIGEC-ELOS.
                  Confira a digitação — se persistir, o documento apresentado não é autêntico.
                </div>
              </div>
            )}

            {result?.found && sit && (
              <div style={{ marginTop:20, borderRadius:12, background:sit.bg, border:`1.5px solid ${sit.border}`, overflow:'hidden' }}>
                <div style={{ padding:'16px 20px', textAlign:'center', borderBottom:`1px solid ${sit.border}` }}>
                  <div style={{ fontSize:30 }}>{sit.icon}</div>
                  <div style={{ ...titleF, fontWeight:900, fontSize:17, color:sit.color, marginTop:4 }}>{sit.label}</div>
                  <div style={{ ...font, fontSize:12.5, color:'#64748b', marginTop:4 }}>{sit.desc}</div>
                </div>
                <div style={{ padding:'14px 20px', ...font, fontSize:13.5, color:'#1a1c5e' }}>
                  {[
                    ['Código',        result.cert_code],
                    ['Empresa',       result.supplier],
                    ['CNPJ',          result.cnpj],
                    ['Selo',          `${result.seal_name}${result.exception ? ' · Homologado com Exceção' : ''}`],
                    result.client ? ['Homologado para', result.client] : null,
                    ['Emitido em',    fmtD(result.issued_at)],
                    ['Válido até',    fmtD(result.expires_at)],
                    ['Consulta em',   new Date(result.checked_at).toLocaleString('pt-BR')],
                  ].filter(Boolean).map(([k, v]) => (
                    <div key={k} style={{ display:'flex', justifyContent:'space-between', gap:16, padding:'5px 0', borderBottom:'1px dashed rgba(0,0,0,.06)' }}>
                      <span style={{ color:'#9B9B9B' }}>{k}</span>
                      <span style={{ fontWeight:700, textAlign:'right' }}>{v || '—'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <p style={{ ...font, fontSize:11.5, color:'#9B9B9B', textAlign:'center', marginTop:20, lineHeight:1.6 }}>
            A situação reflete o status do selo <strong>no momento da consulta</strong> — um certificado emitido pode
            perder a validade posteriormente por vencimento ou pendência de documentos.<br/>
            EQPI Tech · SIGEC-ELOS · elos.eqpitech.com.br
          </p>
        </div>
      </div>
    </div>
  )
}
