// BcCosts.jsx — aba "Custos" do Financeiro (Estágio 10, movida da tela
// BC Report em 20/09 a pedido do produto). Dados da RPC bc_admin_costs
// (SECURITY DEFINER + is_admin). A aba é gated por hasAction 'acao:custos'
// — a razão de existir perfil de acesso no backoffice.
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase.js'
import { Spinner } from '../../components/ui.jsx'

const money = (v) => `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}`

export default function BcCostsTab() {
  const [data, setData] = useState(null)

  useEffect(() => {
    supabase.rpc('bc_admin_costs', { p_meses: 6 }).then(({ data: d, error }) => {
      setData(!error && d && !d.error ? d : { vazio: true })
    })
  }, [])

  if (!data) return <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}><Spinner size={28} /></div>
  if (data.vazio) return <div style={{ fontSize: 13, color: '#9B9B9B', fontStyle: 'italic', padding: '16px 0' }}>Sem dados de custo ainda.</div>

  const th = { textAlign: 'left', fontSize: 11, color: '#9B9B9B', textTransform: 'uppercase', letterSpacing: 0.5, padding: '6px 4px', borderBottom: '2px solid #232360' }
  const td = { padding: '7px 4px', fontSize: 13, borderBottom: '1px solid #F0F0F5' }
  const mesAtual = new Date().toISOString().slice(0, 7)
  const rotaMes = (data.por_mes_rota || []).filter((r) => r.mes === mesAtual)
  const custoMes = rotaMes.reduce((s, r) => s + Number(r.custo || 0), 0)
  const tipoMes = (data.por_mes_tipo || []).filter((r) => r.mes === mesAtual)
  const receitaMes = tipoMes.reduce((s, r) => s + Number(r.preco_medio || 0) * Number(r.concluidos || 0), 0)

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 18 }}>
        {[['Custo no mês (COGS)', money(custoMes), '#DC2626'],
          ['Receita no mês (tabela)', money(receitaMes), '#15803D'],
          ['Relatórios no mês', tipoMes.reduce((s, r) => s + Number(r.relatorios || 0), 0), '#232360']].map(([l, v, c]) => (
          <div key={l} style={{ background: `${c}08`, border: `1px solid ${c}22`, borderRadius: 12, padding: '12px 16px' }}>
            <div style={{ fontSize: 11, color: '#9B9B9B', textTransform: 'uppercase', letterSpacing: 0.5 }}>{l}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: c }}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#232360', marginBottom: 6 }}>Custo mensal por rota</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>Mês</th><th style={th}>Rota</th><th style={{ ...th, textAlign: 'right' }}>Consultas</th><th style={{ ...th, textAlign: 'right' }}>Reusos</th><th style={{ ...th, textAlign: 'right' }}>Custo</th></tr></thead>
            <tbody>{(data.por_mes_rota || []).map((r, i) => (
              <tr key={i}><td style={td}>{r.mes}</td><td style={td}>{r.rota}</td><td style={{ ...td, textAlign: 'right' }}>{r.consultas}</td><td style={{ ...td, textAlign: 'right' }}>{r.reusos}</td><td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{money(r.custo)}</td></tr>
            ))}</tbody>
          </table>
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#232360', marginBottom: 6 }}>Relatórios por mês/tipo</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>Mês</th><th style={th}>Tipo</th><th style={{ ...th, textAlign: 'right' }}>Qtd</th><th style={{ ...th, textAlign: 'right' }}>Custo médio</th><th style={{ ...th, textAlign: 'right' }}>Custo total</th></tr></thead>
            <tbody>{(data.por_mes_tipo || []).map((r, i) => (
              <tr key={i}><td style={td}>{r.mes}</td><td style={td}>{r.tipo === 'full' ? 'Full' : 'Light'}</td><td style={{ ...td, textAlign: 'right' }}>{r.relatorios}</td><td style={{ ...td, textAlign: 'right' }}>{money(r.custo_medio)}</td><td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{money(r.custo_total)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#232360', marginBottom: 6 }}>COGS por CNPJ consultado (6 meses · top 20)</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>CNPJ</th><th style={th}>Razão social</th><th style={{ ...th, textAlign: 'right' }}>Relatórios</th><th style={{ ...th, textAlign: 'right' }}>Custo</th><th style={{ ...th, textAlign: 'right' }}>Receita</th></tr></thead>
          <tbody>{(data.top_cnpjs || []).map((r, i) => (
            <tr key={i}><td style={{ ...td, fontFamily: 'monospace' }}>{r.cnpj}</td><td style={td}>{r.razao_social || '—'}</td><td style={{ ...td, textAlign: 'right' }}>{r.relatorios}</td><td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{money(r.custo)}</td><td style={{ ...td, textAlign: 'right' }}>{money(r.receita)}</td></tr>
          ))}</tbody>
        </table>
      </div>

      {(data.certidoes_vencendo || []).length > 0 && (
        <div style={{ marginTop: 18, background: '#FEF3C7', border: '1px solid #F2A516', borderRadius: 10, padding: '10px 14px', fontSize: 13 }}>
          ⚠️ <b>{data.certidoes_vencendo.length} certidão(ões)</b> com validade nos próximos 15 dias:{' '}
          {data.certidoes_vencendo.slice(0, 6).map((c) => `${c.cnpj} (${c.connector} até ${c.valido_ate})`).join(' · ')}
          {data.certidoes_vencendo.length > 6 ? ' …' : ''}
        </div>
      )}
    </div>
  )
}
