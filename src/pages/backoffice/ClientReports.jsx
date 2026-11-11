// Relatórios de um cliente no BACKOFFICE (11/11, chamado #755248): o analista
// escolhe o cliente e vê exatamente o que o cliente vê — indicadores do Dashboard
// (clicáveis), visão executiva, status dos documentos, aceite dos termos e
// respostas dos questionários —, com as mesmas exportações e o mesmo formato.
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { reportsApi } from '../../services/api.js'
import { Card, PageHeader, Spinner } from '../../components/ui.jsx'
import ClientKpis from '../../components/reports/ClientKpis.jsx'
import ClientReportsView from '../client/Reports.jsx'

const CHAVE = 'elos_bo_relatorio_cliente'
const lerSalvo = () => { try { return localStorage.getItem(CHAVE) || '' } catch { return '' } }

export default function BackofficeClientReports() {
  const navigate = useNavigate()
  const [clientes, setClientes] = useState(null)
  const [cid, setCid] = useState(lerSalvo)

  useEffect(() => { reportsApi.clients().then(setClientes).catch(() => setClientes([])) }, [])
  const escolher = (id) => { setCid(id); try { localStorage.setItem(CHAVE, id) } catch { /* sem storage: só não lembra */ } }
  const nome = (c) => c.nome_fantasia || c.razao_social

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100, margin: '0 auto' }}>
      <PageHeader title="Relatórios do cliente" subtitle="O mesmo painel e os mesmos relatórios que o cliente vê, com as mesmas exportações"
        action={<button onClick={() => navigate('/backoffice/relatorios')} style={{ background: 'none', border: '1px solid #e2e4ef', borderRadius: 10, padding: '9px 16px', fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 12.5, color: '#2E3192', cursor: 'pointer' }}>← Relatórios do projeto</button>} />
      <Card style={{ borderRadius: 14, padding: '14px 18px', marginBottom: 20, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#9B9B9B', fontFamily: 'Montserrat,sans-serif', textTransform: 'uppercase', letterSpacing: .5 }}>Cliente</span>
        {!clientes ? <Spinner size={20} /> : (
          <select value={cid} onChange={e => escolher(e.target.value)}
            style={{ flex: 1, minWidth: 260, padding: '9px 12px', borderRadius: 8, border: '1px solid #e2e4ef', fontSize: 13.5, fontFamily: 'DM Sans,sans-serif', color: '#1a1c5e' }}>
            <option value="">Escolha o cliente…</option>
            {clientes.map(c => <option key={c.id} value={c.id}>{nome(c)}{c.active === false ? ' (inativo)' : ''}</option>)}
          </select>
        )}
      </Card>
      {cid && clientes?.some(c => c.id === cid) && <>
        <ClientKpis key={`k-${cid}`} clientId={cid} />
        <ClientReportsView key={`r-${cid}`} clientId={cid} admin />
      </>}
    </div>
  )
}
