// lib/render/light.js — template do BC Report LIGHT (1 página A4, handoff §9):
// header navy + badge · card empresa + score box · situação documental ELOS
// (só quando supplier_id) · tabela "Consultas públicas realizadas" · parecer ·
// footer com contatos + disclaimer LGPD. Montserrat embutida (fonts.js).
// O QA (pypdfium2) valida: Light === 1 página.

const { montserrat } = require('./fonts.js')

const NAVY = '#2E3191'
const ORANGE = '#F57D2E'
const INK = '#1F2937'
const MUTED = '#6B7280'

const FLAG_BADGE = {
  nada_consta: { bg: '#DCFCE7', fg: '#15803D', label: 'Nada consta' },
  apontamento: { bg: '#FEE2E2', fg: '#B91C1C', label: 'Apontamento' },
  verificar: { bg: '#FEF3C7', fg: '#B45309', label: 'Verificar' },
  indisponivel: { bg: '#E5E7EB', fg: '#4B5563', label: 'Indisponível' },
}
const BAND = {
  baixo: { fg: '#15803D', label: 'BAIXO RISCO' },
  medio: { fg: '#B45309', label: 'RISCO MÉDIO' },
  alto: { fg: '#EA580C', label: 'RISCO ALTO' },
  critico: { fg: '#B91C1C', label: 'RISCO CRÍTICO' },
}

// nome/escopo da linha do quadro por conector (ordem fixa do relatório)
const SOURCE_META = [
  ['cnpj_base',        'Receita Federal — Base CNPJ',        'Situação cadastral, QSA, CNAE'],
  ['pgfn_cnd',         'CND Federal (PGFN/RFB)',             'Débitos tributários federais'],
  ['fgts_crf',         'CRF FGTS (Caixa)',                   'Regularidade FGTS'],
  ['cndt',             'CNDT (TST)',                         'Débitos trabalhistas'],
  ['ceis',             'CEIS (Portal da Transparência)',     'Empresas inidôneas e suspensas'],
  ['cnep',             'CNEP (Portal da Transparência)',     'Punições Lei Anticorrupção'],
  ['cepim',            'CEPIM (Portal da Transparência)',    'Entidades impedidas'],
  ['trabalho_escravo', 'Lista Suja — Trabalho Escravo (MTE)','Cadastro de Empregadores'],
  ['ofac',             'OFAC — SDN List (EUA)',              'Sanções internacionais'],
  ['onu',              'ONU — Consolidated Sanctions',       'Sanções internacionais'],
  ['cartao_cnpj',      'Comprovante CNPJ + QSA',             'Cartão CNPJ oficial'],
  ['midia_negativa',   'Mídia negativa',                     'Busca padrão EQP'],
  ['assertiva_pj',     'Assertiva — Análise Restritiva PJ',  'Score, protestos, ações, CCF'],
]

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const fmtCnpj = (d) => d?.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` : d
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '—'

// req: linha de report_requests · sources: { slug: source_result } ·
// elos: { docsAnalisados, docsPendentes } | null (emissão avulsa)
function buildLightHtml({ req, sources, elos = null }) {
  const base = sources.cnpj_base?.parsed?.details || {}
  const scoreColor = BAND[req.risk_band]?.fg || MUTED

  const linhas = SOURCE_META
    .filter(([slug]) => sources[slug])
    .map(([slug, fonte, escopo]) => {
      const s = sources[slug]
      const b = FLAG_BADGE[s.result_flag] || FLAG_BADGE.indisponivel
      const headline = s.parsed?.headline || ''
      return `<tr>
        <td><strong>${esc(fonte)}</strong><div class="escopo">${esc(escopo)}</div></td>
        <td class="headline">${esc(headline)}</td>
        <td class="badge-cell"><span class="badge" style="background:${b.bg};color:${b.fg}">${b.label}</span></td>
      </tr>`
    }).join('\n')

  const elosBlock = elos ? `
  <div class="card elos">
    <div class="card-title">Situação documental na base ELOS</div>
    <div class="elos-grid">
      <div><span class="big">${elos.docsAnalisados}</span><br>documentos analisados</div>
      <div><span class="big">${elos.docsPendentes}</span><br>pendentes de envio/análise</div>
    </div>
  </div>` : ''

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>BC Report Light</title>
<style>
  @font-face { font-family: Montserrat; font-weight: 100 900;
    src: url(data:font/woff2;base64,${montserrat}) format('woff2'); }
  @page { size: A4; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 210mm; height: 297mm; }
  body { font-family: Montserrat, sans-serif; color: ${INK}; font-size: 8.4pt; background: #fff; }
  header { background: ${NAVY}; color: #fff; padding: 7mm 10mm 5mm; display: flex; justify-content: space-between; align-items: center; }
  header .brand { font-size: 15pt; font-weight: 700; letter-spacing: .5px; }
  header .brand span { color: ${ORANGE}; }
  header .badge-hdr { border: 1.5px solid ${ORANGE}; color: #fff; padding: 1.6mm 3.5mm; border-radius: 3mm; font-weight: 600; font-size: 8.5pt; letter-spacing: 1px; }
  header .meta { font-size: 7pt; opacity: .85; text-align: right; margin-top: 1mm; }
  main { padding: 5mm 10mm 0; }
  .card { border: 1px solid #E5E7EB; border-radius: 2mm; padding: 3.4mm 4mm; margin-bottom: 3.4mm; }
  .top { display: flex; gap: 4mm; }
  .top .empresa { flex: 1; }
  .card-title { font-size: 7pt; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: ${MUTED}; margin-bottom: 2mm; }
  .empresa .razao { font-size: 11.5pt; font-weight: 700; color: ${NAVY}; }
  .empresa .linha { color: ${MUTED}; margin-top: .8mm; }
  .scorebox { width: 44mm; text-align: center; border-left: 4px solid ${scoreColor}; }
  .scorebox .valor { font-size: 22pt; font-weight: 700; color: ${scoreColor}; line-height: 1; }
  .scorebox .de100 { color: ${MUTED}; font-size: 7pt; }
  .scorebox .faixa { font-weight: 700; color: ${scoreColor}; margin-top: 1mm; font-size: 8.6pt; }
  .elos-grid { display: flex; gap: 10mm; text-align: center; color: ${MUTED}; }
  .elos-grid .big { font-size: 14pt; font-weight: 700; color: ${NAVY}; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 6.8pt; letter-spacing: .8px; text-transform: uppercase; color: ${MUTED}; padding: 1.2mm 1.6mm; border-bottom: 1.5px solid ${NAVY}; }
  td { padding: 1.35mm 1.6mm; border-bottom: 1px solid #F3F4F6; vertical-align: top; }
  td .escopo { color: ${MUTED}; font-size: 7pt; }
  td.headline { color: ${INK}; }
  .badge { display: inline-block; padding: .8mm 2.4mm; border-radius: 2.4mm; font-weight: 600; font-size: 7pt; white-space: nowrap; }
  .badge-cell { text-align: right; }
  .parecer { white-space: pre-line; }
  footer { position: absolute; bottom: 0; left: 0; right: 0; background: #F3F4F6; padding: 3mm 10mm; font-size: 6.4pt; color: ${MUTED}; }
  footer .contatos { font-weight: 600; color: ${INK}; margin-bottom: 1mm; }
</style></head>
<body>
<header>
  <div>
    <div class="brand">ELOS <span>·</span> BC REPORT</div>
    <div class="meta">Solicitação ${esc(req.id)} · Emitido em ${fmtDate(req.finished_at || new Date().toISOString())}</div>
  </div>
  <div class="badge-hdr">BC REPORT · LIGHT</div>
</header>
<main>
  <div class="top">
    <div class="card empresa">
      <div class="card-title">Empresa consultada</div>
      <div class="razao">${esc(base.razao_social || '—')}</div>
      <div class="linha">CNPJ ${fmtCnpj(req.cnpj)}${base.nome_fantasia ? ' · ' + esc(base.nome_fantasia) : ''}</div>
      <div class="linha">${esc(base.endereco?.municipio || '—')}/${esc(base.endereco?.uf || '—')} · ${esc(base.situacao || '—')} desde ${esc(base.abertura || '—')} · ${esc(base.porte || '')}</div>
      <div class="linha">${esc(base.cnae_principal || '')}</div>
    </div>
    <div class="card scorebox">
      <div class="card-title">Score EQPI</div>
      <div class="valor">${req.score_eqpi ?? '—'}</div>
      <div class="de100">de 100</div>
      <div class="faixa">${BAND[req.risk_band]?.label || '—'}</div>
    </div>
  </div>
  ${elosBlock}
  <div class="card">
    <div class="card-title">Consultas públicas realizadas</div>
    <table>
      <thead><tr><th>Fonte</th><th>Resultado</th><th style="text-align:right">Situação</th></tr></thead>
      <tbody>${linhas}</tbody>
    </table>
  </div>
  <div class="card">
    <div class="card-title">Parecer resumido</div>
    <div class="parecer">${esc(req.parecer || '—')}</div>
  </div>
</main>
<footer>
  <div class="contatos">EQPI Tech · elos.eqpitech.com.br · contato@eqpitech.com.br</div>
  Relatório gerado automaticamente a partir de fontes públicas e bureaus contratados, para uso interno do solicitante na
  qualificação de fornecedores (LGPD, art. 7º, IX — legítimo interesse). Não utilizar como fonte única de decisão. As
  informações refletem as fontes na data da consulta; certidões possuem validade própria indicada pelos órgãos emissores.
</footer>
</body></html>`
}

module.exports = { buildLightHtml, SOURCE_META }
