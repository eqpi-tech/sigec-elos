// lib/render/full.js — template do BC Report FULL (multi-página, handoff §9):
// capa CONFIDENCIAL → Score EQPI (gauge SVG) → Resumo das conclusões em 5
// aspectos (bullets laranja "Não foram/Foram encontradas…", espelhando o BC
// manual) → 1 seção por conector com os dados → página final de contatos.
// As EVIDÊNCIAS (receipts/certidões) são anexadas como páginas ao final do
// PDF pelo bc_render (pdf-lib) — cada seção referencia "evidência anexa".

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

// 5 aspectos do BC manual → conectores (ordem de impressão)
const ASPECTOS = [
  ['Identidade e Situação Cadastral', ['cnpj_base', 'cartao_cnpj', 'sintegra', 'simples']],
  ['Integridade e Reputação', ['cgu_correcional', 'cnj_improbidade', 'leniencia', 'pep', 'ceaf', 'midia_negativa']],
  ['Listas Restritivas e Sanções', ['ceis', 'cnep', 'cepim', 'trabalho_escravo', 'ofac', 'onu', 'icij']],
  ['Jurídico e Trabalhista', ['cndt', 'mpt_cnf', 'mpf_cn', 'datajud', 'ibama']],
  ['Fiscal e Financeiro', ['pgfn_cnd', 'fgts_crf', 'sefaz_cnd', 'pref_cnd', 'renuncias', 'assertiva_pj']],
]

const NOME_FONTE = {
  cnpj_base: 'Receita Federal — Base CNPJ', cartao_cnpj: 'Comprovante CNPJ + QSA',
  sintegra: 'Sintegra (UF da sede)', simples: 'Simples Nacional',
  cgu_correcional: 'CGU — Certidão Correcional (CNC)', cnj_improbidade: 'CNJ — Improbidade Administrativa',
  leniencia: 'Acordos de Leniência (CGU)', pep: 'PEP — Pessoas Politicamente Expostas',
  ceaf: 'CEAF — Expulsões da Adm. Federal', midia_negativa: 'Mídia negativa (busca padrão EQP)',
  ceis: 'CEIS — Empresas Inidôneas e Suspensas', cnep: 'CNEP — Lei Anticorrupção',
  cepim: 'CEPIM — Entidades Impedidas', trabalho_escravo: 'Lista Suja — Trabalho Escravo (MTE)',
  ofac: 'OFAC — SDN List (EUA)', onu: 'ONU — Consolidated Sanctions', icij: 'ICIJ Offshore Leaks',
  cndt: 'CNDT — Débitos Trabalhistas (TST)', mpt_cnf: 'MPT — Certidão de Feitos',
  mpf_cn: 'MPF — Certidão Negativa', datajud: 'DataJud (CNJ)', ibama: 'IBAMA — Embargos e Regularidade',
  pgfn_cnd: 'CND Federal (PGFN/RFB)', fgts_crf: 'CRF FGTS (Caixa)',
  sefaz_cnd: 'CND Estadual (Sefaz)', pref_cnd: 'CND Municipal', renuncias: 'Renúncias Fiscais (Gov. Federal)',
  assertiva_pj: 'Assertiva — Análise Restritiva PJ',
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const fmtCnpj = (d) => d?.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` : d
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '—'

// gauge SVG semicircular do Score EQPI — o preenchimento usa o MESMO path
// da trilha com stroke-dasharray (alinhamento perfeito por construção; a
// versão com endpoint calculado desalinhava e cortava o topo)
function gauge(score, band) {
  const color = BAND[band]?.fg || MUTED
  const pct = Math.max(0, Math.min(100, score ?? 0)) / 100
  const len = Math.PI * 80 // comprimento do semicírculo r=80
  return `<svg viewBox="0 -2 200 116" style="width:70mm">
    <path d="M 20 95 A 80 80 0 0 1 180 95" fill="none" stroke="#E5E7EB" stroke-width="14" stroke-linecap="round"/>
    <path d="M 20 95 A 80 80 0 0 1 180 95" fill="none" stroke="${color}" stroke-width="14" stroke-linecap="round"
      stroke-dasharray="${(pct * len).toFixed(1)} ${len.toFixed(1)}"/>
    <text x="100" y="78" text-anchor="middle" font-size="32" font-weight="700" fill="${color}" font-family="Montserrat">${score ?? '—'}</text>
    <text x="100" y="104" text-anchor="middle" font-size="11" fill="${MUTED}" font-family="Montserrat">de 100 · ${BAND[band]?.label || ''}</text>
  </svg>`
}

const fmtVal = (v) => {
  if (v === true) return 'Sim'
  if (v === false) return 'Não'
  return esc(v)
}

function kv(details, max = 14) {
  const rows = []
  const walk = (obj, prefix) => {
    for (const [k, v] of Object.entries(obj || {})) {
      if (k.startsWith('_') || v == null || v === '') continue
      if (/receipt|storage|url/i.test(k)) continue          // links internos/expiráveis
      if (typeof v === 'string' && /^https?:\/\//.test(v)) continue
      const label = (prefix ? prefix + ' · ' : '') + k.replace(/_/g, ' ')
      if (Array.isArray(v)) {
        if (!v.length) continue
        // só valores primitivos dos itens (objetos aninhados viravam [object Object])
        rows.push([label, v.slice(0, 5).map((i) => {
          if (i && typeof i === 'object') {
            // primitivos do item + listas de texto aninhadas (ex.: amostra
            // de títulos da mídia negativa) — nunca objetos crus
            return Object.values(i).flatMap((x) => {
              if (Array.isArray(x)) return x.filter((y) => y != null && typeof y !== 'object' && y !== '').slice(0, 3)
              return x != null && typeof x !== 'object' && x !== '' ? [x] : []
            }).slice(0, 6).map(fmtVal).join(' · ')
          }
          return fmtVal(i)
        }).filter(Boolean).join('<br>')])
      } else if (typeof v === 'object') {
        if (!prefix) walk(v, k.replace(/_/g, ' '))
      } else rows.push([label, fmtVal(v)])
      if (rows.length >= max) return
    }
  }
  walk(details)
  return rows.map(([k2, v2]) => `<tr><th>${esc(k2)}</th><td>${v2}</td></tr>`).join('')
}

// bases locais opcionais ainda não carregadas (ICIJ/TSE): não são fonte
// consultada — ficam fora do relatório até a ingestão ser feita
const naoIngerida = (s2) => /ainda não ingerida/.test(s2?.parsed?.headline || '')

function buildFullHtml({ req, sources, solicitante = null, evidenceIndex = {} }) {
  const base = sources.cnpj_base?.parsed?.details || {}
  const findingsPorAspecto = ASPECTOS.map(([titulo, slugs]) => {
    const presentes = slugs.filter((s) => sources[s] && !naoIngerida(sources[s]))
    const problemas = presentes.filter((s) => ['apontamento', 'verificar'].includes(sources[s]?.result_flag))
    return { titulo, presentes, problemas }
  })

  const resumo = findingsPorAspecto.map(({ titulo, presentes, problemas }) => {
    if (!presentes.length) return ''
    const ok = problemas.length === 0
    const frase = ok
      ? `<b>Não foram encontradas</b> ocorrências em ${titulo.toLowerCase()} (${presentes.length} fonte(s) consultada(s)).`
      : `<b>Foram encontradas</b> ${problemas.length} ocorrência(s) em ${titulo.toLowerCase()}: ` +
        problemas.map((s) => esc(sources[s]?.parsed?.headline || NOME_FONTE[s])).join(' · ')
    return `<li class="${ok ? 'ok' : 'atencao'}">${frase}</li>`
  }).join('\n')

  const secoes = ASPECTOS.map(([titulo, slugs]) => {
    const blocos = slugs.filter((s) => sources[s] && !naoIngerida(sources[s])).map((slug) => {
      const s = sources[slug]
      const b = FLAG_BADGE[s.result_flag] || FLAG_BADGE.indisponivel
      const ev = evidenceIndex[slug]
      return `<div class="fonte">
        <div class="fonte-hdr">
          <div><b>${esc(NOME_FONTE[slug] || slug)}</b><div class="hl">${esc(s.parsed?.headline || '')}</div></div>
          <span class="badge" style="background:${b.bg};color:${b.fg}">${b.label}</span>
        </div>
        <table class="kv">${kv(s.parsed?.details)}</table>
        ${ev ? `<div class="ev">🧾 Evidência oficial anexa — ver Índice de Evidências</div>` : ''}
      </div>`
    }).join('\n')
    if (!blocos) return ''
    return `<section class="aspecto"><h2>${esc(titulo)}</h2>${blocos}</section>`
  }).join('\n')

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>BC Report Full</title>
<style>
  @font-face { font-family: Montserrat; font-weight: 100 900;
    src: url(data:font/woff2;base64,${montserrat}) format('woff2'); }
  @page { size: A4; margin: 14mm 12mm 16mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Montserrat, sans-serif; color: ${INK}; font-size: 8.6pt; }
  .capa { page-break-after: always; height: 250mm; display: flex; flex-direction: column;
          justify-content: space-between; padding-top: 30mm; }
  .capa .conf { color: ${ORANGE}; font-weight: 700; letter-spacing: 4px; font-size: 10pt; }
  .capa h1 { color: ${NAVY}; font-size: 26pt; margin: 6mm 0 2mm; }
  .capa .razao { font-size: 15pt; font-weight: 600; margin-top: 18mm; }
  .capa .cnpj { color: ${MUTED}; font-size: 11pt; margin-top: 2mm; }
  .capa .meta { color: ${MUTED}; font-size: 9pt; line-height: 1.7; }
  .capa .marca { color: ${NAVY}; font-weight: 700; font-size: 13pt; }
  .capa .marca span { color: ${ORANGE}; }
  .score-page { page-break-after: always; text-align: center; padding-top: 16mm; }
  .score-page h2 { color: ${NAVY}; font-size: 14pt; margin-bottom: 10mm; }
  .parecer { text-align: left; margin: 12mm auto 0; max-width: 150mm; white-space: pre-line;
             border: 1px solid #E5E7EB; border-left: 4px solid ${ORANGE}; border-radius: 2mm; padding: 5mm; }
  .resumo { page-break-after: always; padding-top: 6mm; }
  h2.titulo, .resumo h2 { color: ${NAVY}; font-size: 13pt; border-bottom: 2px solid ${ORANGE}; padding-bottom: 2mm; margin-bottom: 5mm; }
  .resumo ul { list-style: none; }
  .resumo li { margin-bottom: 4mm; padding-left: 7mm; position: relative; line-height: 1.5; font-size: 9.5pt; }
  .resumo li::before { content: '●'; position: absolute; left: 0; }
  .resumo li.ok::before { color: #15803D; }
  .resumo li.atencao::before { color: ${ORANGE}; }
  .resumo li.atencao b { color: ${ORANGE}; }
  section.aspecto { margin-bottom: 7mm; }
  section.aspecto h2 { page-break-after: avoid; }
  h2.titulo { page-break-after: avoid; }
  section.aspecto h2 { color: ${NAVY}; font-size: 11.5pt; border-bottom: 1.5px solid ${NAVY}; padding-bottom: 1.5mm; margin-bottom: 3.5mm; }
  .fonte { border: 1px solid #E5E7EB; border-radius: 2mm; padding: 3mm; margin-bottom: 3mm; page-break-inside: avoid; }
  .fonte-hdr { display: flex; justify-content: space-between; gap: 4mm; align-items: flex-start; }
  .fonte-hdr .hl { color: ${MUTED}; margin-top: 1mm; }
  .badge { padding: .8mm 2.6mm; border-radius: 2.4mm; font-weight: 600; font-size: 7pt; white-space: nowrap; }
  table.kv { width: 100%; border-collapse: collapse; margin-top: 2mm; }
  table.kv th { text-align: left; color: ${MUTED}; font-weight: 600; width: 42mm; padding: .8mm 2mm .8mm 0; vertical-align: top; font-size: 7.4pt; text-transform: capitalize; }
  table.kv td { padding: .8mm 0; font-size: 7.8pt; }
  .ev { margin-top: 2mm; color: ${NAVY}; font-weight: 600; font-size: 7.4pt; }
  .final { page-break-before: always; padding-top: 60mm; text-align: center; color: ${MUTED}; }
  .final .marca { color: ${NAVY}; font-weight: 700; font-size: 16pt; }
  .final .marca span { color: ${ORANGE}; }
  .final .disclaimer { max-width: 150mm; margin: 12mm auto 0; font-size: 7pt; text-align: justify; }
</style></head>
<body>
<div class="capa">
  <div>
    <div class="conf">CONFIDENCIAL</div>
    <h1>BC REPORT · FULL</h1>
    <div class="meta">Background check completo de fornecedor</div>
    <div class="razao">${esc(base.razao_social || '—')}</div>
    <div class="cnpj">CNPJ ${fmtCnpj(req.cnpj)}</div>
  </div>
  <div class="meta">
    <div class="marca">ELOS <span>·</span> EQPI Tech</div>
    Emitido em ${fmtDate(req.finished_at || new Date().toISOString())} · Solicitação ${esc(req.id)}<br>
    ${solicitante ? `Solicitante: ${esc(solicitante)}` : ''}
  </div>
</div>

<div class="score-page">
  <h2>Score EQPI</h2>
  ${gauge(req.score_eqpi, req.risk_band)}
  <div class="parecer">${esc(req.parecer || '—')}</div>
</div>

<div class="resumo">
  <h2>Resumo das conclusões</h2>
  <ul>${resumo}</ul>
</div>

<h2 class="titulo">Detalhamento por fonte</h2>
${secoes}

<div class="final">
  <div class="marca">ELOS <span>·</span> EQPI Tech</div>
  <div style="margin-top:4mm">elos.eqpitech.com.br · contato@eqpitech.com.br</div>
  <div class="disclaimer">Relatório gerado automaticamente a partir de fontes públicas e bureaus contratados, para uso
  interno do solicitante na qualificação de fornecedores (LGPD, art. 7º, IX — legítimo interesse). Não utilizar como
  fonte única de decisão. As informações refletem as fontes na data da consulta; certidões possuem validade própria
  indicada pelos órgãos emissores. Evidências oficiais anexadas ao final deste documento.</div>
</div>
</body></html>`
}

// página de índice das evidências (renderizada à parte e mesclada entre o
// corpo e os anexos — assim o corpo sai em UMA passada de impressão)
function buildEvidenceIndexHtml(entries) {
  const linhas = entries.map((e) => `<tr><td>${esc(NOME_FONTE[e.slug] || e.slug)}</td><td>${esc(e.protocol || '—')}</td><td style="text-align:right">página ${e.page}</td></tr>`).join('')
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
    @font-face { font-family: Montserrat; font-weight: 100 900; src: url(data:font/woff2;base64,${montserrat}) format('woff2'); }
    @page { size: A4; margin: 14mm 12mm; }
    body { font-family: Montserrat, sans-serif; color: ${INK}; font-size: 9pt; }
    h2 { color: ${NAVY}; font-size: 13pt; border-bottom: 2px solid ${ORANGE}; padding-bottom: 2mm; margin-bottom: 5mm; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; color: ${MUTED}; font-size: 7pt; text-transform: uppercase; letter-spacing: 1px; padding: 1.5mm 2mm; border-bottom: 1.5px solid ${NAVY}; }
    td { padding: 1.6mm 2mm; border-bottom: 1px solid #F3F4F6; }
    .nota { color: ${MUTED}; font-size: 7.4pt; margin-top: 6mm; }
  </style></head><body>
  <h2>Índice de Evidências</h2>
  <table><thead><tr><th>Fonte</th><th>Protocolo</th><th style="text-align:right">Localização</th></tr></thead>
  <tbody>${linhas}</tbody></table>
  <div class="nota">Certidões oficiais em PDF anexadas na íntegra. Comprovantes de consulta em HTML ficam arquivados
  com hash SHA-256 no dossiê digital da emissão e podem ser disponibilizados sob demanda.</div>
  </body></html>`
}

module.exports = { buildFullHtml, buildEvidenceIndexHtml, ASPECTOS, NOME_FONTE }
