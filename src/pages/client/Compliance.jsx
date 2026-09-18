// Compliance (18/09, patch_073) — fornecedores com respostas de questionário
// que disparam revisão da área de compliance (regra por pergunta:
// questionnaire_questions.compliance_alert). NÃO trava a homologação — é um
// relatório para a área responsável, acessível por perfil específico
// (módulo 'compliance' no editor de perfis).
import { useState, useEffect } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../../lib/supabase.js'
import { Button, Card, Spinner, PageHeader, SectionTitle } from '../../components/ui.jsx'
import { Tile } from '../../components/charts.jsx'

const fmtCnpj = (c) => c ? c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : ''

export default function ClientCompliance() {
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    supabase.rpc('client_compliance_report')
      .then(({ data, error }) => error ? setErr(error.message) : setRows(data || []))
  }, [])

  if (err) return <div style={{ padding: 40 }}><Card style={{ padding: 20, borderRadius: 14, color: '#dc2626', fontSize: 13 }}>Erro: {err}</Card></div>
  if (!rows) return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><Spinner size={40} /></div>

  // agrupa por fornecedor
  const bySup = {}
  for (const r of rows) (bySup[r.supplier_id] = bySup[r.supplier_id] || { razao: r.razao_social, cnpj: r.cnpj, alerts: [] }).alerts.push(r)
  const sups = Object.values(bySup).sort((a, b) => b.alerts.length - a.alerts.length)

  const exportXlsx = () => {
    const data = rows.map(r => ({
      'Fornecedor': r.razao_social, 'CNPJ': fmtCnpj(r.cnpj), 'Questionário': r.questionario,
      'Pergunta': r.pergunta, 'Resposta': r.resposta,
      'Respondido em': r.respondido_em ? new Date(r.respondido_em).toLocaleDateString('pt-BR') : '',
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    ws['!cols'] = [{ wch: 40 }, { wch: 20 }, { wch: 28 }, { wch: 70 }, { wch: 14 }, { wch: 14 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Não Compliance')
    XLSX.writeFile(wb, `compliance_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1000, margin: '0 auto' }}>
      <PageHeader title="Compliance" subtitle="Fornecedores com respostas que exigem avaliação da área de compliance"
        action={rows.length > 0 ? <Button variant="primary" onClick={exportXlsx}>⬇ Exportar Excel</Button> : undefined} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
        <Tile label="Fornecedores em atenção" value={sups.length} accent={sups.length ? '#b45309' : '#15803d'} />
        <Tile label="Respostas sinalizadas" value={rows.length} />
      </div>

      {sups.length === 0 ? (
        <Card style={{ borderRadius: 16, padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>✅</div>
          <div style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 16, color: '#15803d' }}>Nenhum apontamento de compliance</div>
          <div style={{ fontSize: 13, color: '#9B9B9B', marginTop: 6, fontFamily: 'DM Sans,sans-serif' }}>
            Nenhum fornecedor ativo respondeu algo que dispare a revisão. Os alertas aparecem aqui assim que uma resposta sinalizada for registrada.
          </div>
        </Card>
      ) : sups.map(s => (
        <Card key={s.cnpj} style={{ borderRadius: 16, padding: '18px 22px', marginBottom: 14, borderLeft: '4px solid #f59e0b' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
            <div>
              <div style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: 15, color: '#1a1c5e' }}>{s.razao}</div>
              <div style={{ fontSize: 12, color: '#9B9B9B', fontFamily: 'DM Sans,sans-serif' }}>{fmtCnpj(s.cnpj)}</div>
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#b45309', background: 'rgba(245,158,11,.12)', borderRadius: 20, padding: '4px 12px', fontFamily: 'Montserrat,sans-serif' }}>
              ⚠️ {s.alerts.length} apontamento{s.alerts.length !== 1 ? 's' : ''}
            </span>
          </div>
          {s.alerts.map((a, i) => (
            <div key={i} style={{ padding: '10px 12px', borderRadius: 10, background: '#fffbeb', border: '1px solid #fef3c7', marginBottom: 6 }}>
              <div style={{ fontSize: 12, color: '#374151', fontFamily: 'DM Sans,sans-serif', lineHeight: 1.5 }}>{a.pergunta}</div>
              <div style={{ fontSize: 12, marginTop: 4, fontFamily: 'Montserrat,sans-serif' }}>
                <span style={{ fontWeight: 700, color: '#b45309' }}>Resposta: {a.resposta}</span>
                <span style={{ color: '#9B9B9B', fontWeight: 400 }}> · {a.questionario}{a.respondido_em ? ` · ${new Date(a.respondido_em).toLocaleDateString('pt-BR')}` : ''}</span>
              </div>
            </div>
          ))}
        </Card>
      ))}
    </div>
  )
}
