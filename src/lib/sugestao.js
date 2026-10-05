// Sugestão da automação para um documento (29/09): Rota A (fonte oficial —
// documents.metadata.consulta) ou Rota B (pré-análise por IA — ai_review_jobs).
// "Aceitar sugestão" PREENCHE a decisão (status, validade, motivo) para o
// analista confirmar — nunca decide sozinho. Usado na fila de análise e na
// tela do processo, para as duas nunca divergirem.

const hoje = () => new Date().toISOString().slice(0, 10)
const umAno = () => { const d = new Date(); d.setFullYear(d.getFullYear() + 1); return d.toISOString().slice(0, 10) }
// reprovado: nova checagem do documento em 4 meses (Luiz, 05/10)
const quatroMeses = () => { const d = new Date(); d.setMonth(d.getMonth() + 4); return d.toISOString().slice(0, 10) }
const dataValida = (v) => (v && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null)

// ia = pré-análise mais recente do documento (ai_review_jobs) ou undefined
export function sugestaoDoc(doc, ia) {
  if (!doc) return null
  // Rota B: só vale a análise do arquivo ATUAL
  if (ia?.status === 'done' && ia.verdict && (!ia.storage_path || ia.storage_path === doc.storage_path)) {
    const r = ia.result || {}
    return { origem: 'B', veredito: ia.verdict, validade: dataValida(r.data_validade),
             motivoCodigo: r.motivo_codigo || null, motivoTexto: r.motivo_texto || '' }
  }
  const c = doc.metadata?.route === 'A' ? doc.metadata.consulta : null
  if (c?.sugestao) {
    return { origem: 'A', veredito: c.sugestao, validade: dataValida(c.validade_fonte) || dataValida(doc.expires_at),
             motivoCodigo: null, motivoTexto: c.motivo || '' }
  }
  return null
}

export const ORIGEM = { A: 'Rota A — fonte oficial', B: 'Rota B — pré-análise por IA' }

// Motivo de reprovação: o motivo padronizado (quando a IA indicou o código)
// + a explicação do caso, que é o que o fornecedor precisa para corrigir
export function motivoSugerido(sug, reasons = []) {
  if (!sug) return ''
  const label = sug.motivoCodigo ? reasons.find((r) => r.code === sug.motivoCodigo)?.label : null
  if (label && sug.motivoTexto) return `${label} — ${sug.motivoTexto}`
  return label || sug.motivoTexto || ''
}

// Decisão preenchida a partir da sugestão. null quando a sugestão é "revisar".
// Validade na aprovação: a da fonte/documento, se ainda futura; senão a regra
// do sistema (análise + 1 ano — regra 09/09). Na reprovação: análise + 4 meses,
// prazo para rechecar o documento rejeitado (05/10).
export function decisaoSugerida(sug, reasons = []) {
  if (!sug || !['aprovar', 'reprovar'].includes(sug.veredito)) return null
  if (sug.veredito === 'aprovar') {
    const futura = sug.validade && sug.validade > hoje()
    return {
      status: 'VALID',
      expiry: futura ? sug.validade : umAno(),
      expiryOrigem: futura ? (sug.origem === 'A' ? 'validade informada pela fonte oficial' : 'validade lida no documento pela IA')
                           : 'sem validade no documento — análise + 1 ano',
      note: `Aprovado conforme sugestão da ${ORIGEM[sug.origem]}`,
    }
  }
  return { status: 'REJECTED', note: motivoSugerido(sug, reasons),
           expiry: quatroMeses(), expiryOrigem: 'reprovado — nova checagem em 4 meses' }
}
