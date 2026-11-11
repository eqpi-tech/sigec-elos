// Indicadores do Dashboard do cliente, clicáveis (11/11, chamado #755248): cada
// número abre a lista que o compõe, com busca e "Exportar Excel". O mesmo
// componente no Dashboard do cliente e nos Relatórios do cliente do backoffice.
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase.js'
import { clientApi } from '../../services/api.js'
import { KpiCard, Spinner } from '../ui.jsx'
import { clientSealStatus } from '../../lib/clientSituacao.js'
import { linhaFornecedor, linhaConviteAberto } from '../../lib/reportRows.js'
import DetailModal from '../DetailModal.jsx'

export default function ClientKpis({ clientId, data: dataProp }) {
  const [data, setData] = useState(dataProp || null)
  const [flowNames, setFlowNames] = useState({})
  const [aberto, setAberto] = useState(null)   // { title, rows }

  useEffect(() => { if (dataProp) setData(dataProp) }, [dataProp])
  useEffect(() => {
    if (!clientId) return
    if (!dataProp) { setData(null); clientApi.getDashboard(clientId).then(setData).catch(() => setData({})) }
    supabase.from('client_flows').select('id, name').eq('client_id', clientId)
      .then(({ data: fl }) => setFlowNames(Object.fromEntries((fl || []).map(f => [f.id, f.name]))))
  }, [clientId])   // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}><Spinner size={28} /></div>

  const items = data.items || [], abertos = data.abertos || []
  const sit = (i) => clientSealStatus(i.seal)
  const lista = (title, its, convites = []) => ({
    onClick: () => setAberto({ title, rows: [...its.map(i => linhaFornecedor(i, flowNames)), ...convites.map(linhaConviteAberto)] }),
  })

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 16, marginBottom: 28 }}>
        <KpiCard label="Fornecedores" value={data.total ?? 0} icon="🤝"
          sub={data.convitesAbertos ? `+ ${data.convitesAbertos} convite(s) em aberto` : 'Com processo de homologação'}
          {...lista('Fornecedores (e convites em aberto)', items, abertos)} />
        <KpiCard label="Homologados" value={data.homologados ?? 0} icon="✅" sub="Selo ELOS ativo"
          {...lista('Homologados', items.filter(i => sit(i) === 'ACTIVE'))} />
        <KpiCard label="Em Análise" value={data.emAnalise ?? 0} icon="⏳"
          sub={data.aguardandoPagamento ? `+ ${data.aguardandoPagamento} aguardando pagamento` : 'Aguardando revisão EQPI'}
          {...lista('Em análise (e aguardando pagamento)', items.filter(i => ['PENDING', 'PAGAMENTO'].includes(sit(i))))} />
        <KpiCard label="Subsidiados" value={data.subsidiados ?? 0} icon="💰" sub="Custo assumido pelo cliente"
          {...lista('Subsidiados', items.filter(i => i.subsidiado), abertos.filter(a => a.subsidiado))} />
        <KpiCard label="Carta de Exceção" value={data.cartasExcecao ?? 0} icon="📜" sub="Fornecedores com carta vigente"
          {...lista('Com carta de exceção', items.filter(i => i.cartaExcecao))} />
      </div>
      {aberto && <DetailModal title={aberto.title} rows={aberto.rows} fileBase="dashboard" onClose={() => setAberto(null)} />}
    </>
  )
}
