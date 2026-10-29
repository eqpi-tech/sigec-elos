// "Acompanhar" fornecedor (29/10, patch_166): o usuário do cliente escolhe de
// quem quer receber e-mail na hora sobre o andamento (cadastro concluído, entrada
// em análise, homologado, reprovado/suspenso). Chave = CNPJ — vale desde o convite.
import { useState } from 'react'
import { watchApi } from '../services/api.js'
import { normalizeCnpj } from '../lib/cnpj.js'

export default function WatchButton({ cnpj, clientId, watched, onChange, size = 'sm' }) {
  const [busy, setBusy] = useState(false)
  const c = normalizeCnpj(cnpj || '')
  if (!c || !clientId) return null
  const alternar = async (e) => {
    e?.stopPropagation?.()
    setBusy(true)
    try { await watchApi.set(clientId, c, !watched); onChange?.(c, !watched) }
    catch (err) { alert('Não foi possível salvar: ' + err.message) }
    finally { setBusy(false) }
  }
  const p = size === 'sm' ? '3px 10px' : '7px 14px'
  return (
    <button onClick={alternar} disabled={busy}
      title={watched ? 'Você recebe e-mail sobre o andamento deste fornecedor — clique para parar' : 'Receber e-mail quando este fornecedor concluir o cadastro, entrar em análise, for homologado ou reprovado'}
      style={{ fontSize: size === 'sm' ? 10.5 : 12, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, borderRadius: 8, padding: p, cursor: busy ? 'wait' : 'pointer',
        background: watched ? '#eef0ff' : '#fff', color: watched ? '#2E3192' : '#64748b', border: `1px solid ${watched ? '#2E3192' : '#d1d5db'}` }}>
      {watched ? '🔔 Acompanhando' : '🔔 Acompanhar'}
    </button>
  )
}
