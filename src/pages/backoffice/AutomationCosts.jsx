// AutomationCosts.jsx — abas "Custos Captura" (Rota A: coleta nas fontes
// oficiais) e "Custos IA" (Rota B: pré-análise de documentos) do Financeiro,
// ao lado de "Custos BC" (07/10/2026). Dados da RPC admin_automation_costs
// (SECURITY DEFINER + is_admin — patch_122); gated por 'acao:custos' em Metrics.
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase.js'
import { Spinner } from '../../components/ui.jsx'

const money = (v, casas = 2) => `R$ ${Number(v || 0).toFixed(casas).replace('.', ',')}`
const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : '—')

// nome legível de cada fonte da Rota A (slug do conector)
const FONTES = {
  receita_cadastro: 'Receita — Cartão CNPJ', receita_simples: 'Receita — Simples Nacional',
  sintegra: 'Sintegra', pgfn_cnd: 'CND Federal (PGFN)', pgfn_devedores: 'Dívida Ativa da União',
  fgts_crf: 'FGTS (CRF)', cndt: 'CNDT (Justiça do Trabalho)', sefaz_cnd: 'CND Estadual (Sefaz)',
  pref_cnd: 'CND Municipal', trabalho_escravo: '"Lista suja" (MTE)', falencia_rj: 'Falência / Recuperação Judicial',
  ibama_cr: 'IBAMA (CTF)', pf_seguranca: 'Polícia Federal — Segurança Privada',
}

const th = { textAlign: 'left', fontSize: 11, color: '#9B9B9B', textTransform: 'uppercase', letterSpacing: 0.5, padding: '6px 4px', borderBottom: '2px solid #232360' }
const td = { padding: '7px 4px', fontSize: 13, borderBottom: '1px solid #F0F0F5' }
const num = { ...td, textAlign: 'right' }

function useCustos() {
  const [data, setData] = useState(null)
  useEffect(() => {
    supabase.rpc('admin_automation_costs', { p_meses: 6 }).then(({ data: d, error }) => {
      setData(!error && d ? d : { erro: true })
    })
  }, [])
  return data
}

function Kpis({ itens }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${itens.length},1fr)`, gap: 12, marginBottom: 18 }}>
      {itens.map(([l, v, c, sub]) => (
        <div key={l} style={{ background: `${c}08`, border: `1px solid ${c}22`, borderRadius: 12, padding: '12px 16px' }}>
          <div style={{ fontSize: 11, color: '#9B9B9B', textTransform: 'uppercase', letterSpacing: 0.5 }}>{l}</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: c }}>{v}</div>
          {sub && <div style={{ fontSize: 11, color: '#9B9B9B', marginTop: 2 }}>{sub}</div>}
        </div>
      ))}
    </div>
  )
}

const Carregando = () => <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}><Spinner size={28} /></div>
const Vazio = ({ texto }) => <div style={{ fontSize: 13, color: '#9B9B9B', fontStyle: 'italic', padding: '16px 0' }}>{texto}</div>
const Titulo = ({ children }) => <div style={{ fontWeight: 700, fontSize: 13, color: '#232360', marginBottom: 6 }}>{children}</div>

// ── Custos com captura de documentos (Rota A) ─────────────────────────────
export function CaptureCostsTab() {
  const data = useCustos()
  if (!data) return <Carregando />
  if (data.erro) return <Vazio texto="Não foi possível carregar os custos de captura." />
  const c = data.captura || {}
  const k = c.kpi_mes || {}
  if (!(c.por_mes_fonte || []).length) return <Vazio texto="Nenhuma captura automática ainda." />
  return (
    <div>
      <Kpis itens={[
        ['Custo no mês', money(k.custo), '#DC2626', `${k.pagas || 0} consulta(s) paga(s)`],
        ['Documentos obtidos', k.obtidas || 0, '#15803D', 'pela fonte oficial no mês'],
        ['Para envio manual', k.manual || 0, '#B45309', 'fonte não emitiu / indisponível'],
        ['Aguardando', k.aguardando || 0, '#232360', 'nova tentativa automática'],
      ]} />
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 20 }}>
        <div>
          <Titulo>Custo mensal por fonte</Titulo>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>Mês</th><th style={th}>Fonte</th><th style={{ ...th, textAlign: 'right' }}>Consultas</th><th style={{ ...th, textAlign: 'right' }}>Obtidas</th><th style={{ ...th, textAlign: 'right' }}>Pagas</th><th style={{ ...th, textAlign: 'right' }}>Custo</th></tr></thead>
            <tbody>{c.por_mes_fonte.map((r, i) => (
              <tr key={i}><td style={td}>{r.mes}</td><td style={td}>{FONTES[r.fonte] || r.fonte}</td><td style={num}>{r.consultas}</td><td style={num}>{r.obtidas}</td><td style={num}>{r.pagas}</td><td style={{ ...num, fontWeight: 700 }}>{money(r.custo)}</td></tr>
            ))}</tbody>
          </table>
        </div>
        <div>
          <Titulo>Custo por cliente</Titulo>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>Mês</th><th style={th}>Cliente</th><th style={{ ...th, textAlign: 'right' }}>Processos</th><th style={{ ...th, textAlign: 'right' }}>Custo</th></tr></thead>
            <tbody>{(c.por_cliente || []).map((r, i) => (
              <tr key={i}><td style={td}>{r.mes}</td><td style={td}>{r.cliente}</td><td style={num}>{r.processos}</td><td style={{ ...num, fontWeight: 700 }}>{money(r.custo)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </div>
      <div style={{ marginTop: 14, fontSize: 11, color: '#9B9B9B' }}>
        Fontes pagas (Infosimples) só cobram quando devolvem o dado; Receita, Simples e "Lista suja" são gratuitas.
        Documento válido já existente ou enviado pelo fornecedor não gera consulta.
      </div>
    </div>
  )
}

// ── Custos com IA (Rota B) ────────────────────────────────────────────────
export function AiCostsTab() {
  const data = useCustos()
  if (!data) return <Carregando />
  if (data.erro) return <Vazio texto="Não foi possível carregar os custos de IA." />
  const a = data.ia || {}
  const k = a.kpi_mes || {}
  if (!(a.por_mes || []).length) return <Vazio texto="Nenhuma pré-análise por IA ainda." />
  return (
    <div>
      <Kpis itens={[
        ['Custo no mês', money(k.custo), '#DC2626', `${k.analises || 0} análise(s)`],
        ['Gasto hoje', money(a.hoje), '#232360', 'teto diário configurado no ambiente'],
        ['Concordância do analista', pct(k.concordou || 0, k.decididas || 0), '#15803D', `${k.decididas || 0} sugestão(ões) já decidida(s)`],
        ['Aguardando', k.aguardando || 0, '#B45309', 'na fila ou em lote'],
      ]} />
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 20 }}>
        <div>
          <Titulo>Análises e custo por mês</Titulo>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>Mês</th><th style={{ ...th, textAlign: 'right' }}>Análises</th><th style={{ ...th, textAlign: 'right' }}>Aprovar</th><th style={{ ...th, textAlign: 'right' }}>Reprovar</th><th style={{ ...th, textAlign: 'right' }}>Revisar</th><th style={{ ...th, textAlign: 'right' }}>Concordância</th><th style={{ ...th, textAlign: 'right' }}>Custo médio</th><th style={{ ...th, textAlign: 'right' }}>Custo</th></tr></thead>
            <tbody>{a.por_mes.map((r, i) => (
              <tr key={i}><td style={td}>{r.mes}</td><td style={num}>{r.analises}</td><td style={num}>{r.aprovar}</td><td style={num}>{r.reprovar}</td><td style={num}>{r.revisar}</td><td style={num}>{pct(r.concordou, r.decididas)}</td><td style={num}>{money(r.custo_medio, 3)}</td><td style={{ ...num, fontWeight: 700 }}>{money(r.custo)}</td></tr>
            ))}</tbody>
          </table>
        </div>
        <div>
          <Titulo>Custo por fornecedor (6 meses · top 20)</Titulo>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>Fornecedor</th><th style={{ ...th, textAlign: 'right' }}>Análises</th><th style={{ ...th, textAlign: 'right' }}>Custo</th></tr></thead>
            <tbody>{(a.por_fornecedor || []).map((r, i) => (
              <tr key={i}><td style={td}>{r.razao_social || r.cnpj}</td><td style={num}>{r.analises}</td><td style={{ ...num, fontWeight: 700 }}>{money(r.custo)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </div>
      <div style={{ marginTop: 14, fontSize: 11, color: '#9B9B9B' }}>
        Concordância = sugestões "aprovar"/"reprovar" que o analista confirmou com a mesma decisão. A IA só sugere — quem decide é sempre o analista.
      </div>
    </div>
  )
}
