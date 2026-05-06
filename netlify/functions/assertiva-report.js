// netlify/functions/assertiva-report.js
// POST: gera Análise Restritiva PJ (Assertiva), cria PDF e salva como documento do fornecedor
// GET:  retorna o último relatório salvo (assertiva_reports)

const { createClient } = require('@supabase/supabase-js')

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const ASSERTIVA_DOC_TYPE = '578'
const ASSERTIVA_BUCKET   = 'documents'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCnpj(raw) {
  const d = raw.replace(/\D/g, '')
  if (d.length !== 14) return raw
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12,14)}`
}

function fmtMoney(n) {
  if (n == null) return '-'
  return 'R$ ' + Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(d) {
  if (!d) return '-'
  try { return new Date(d).toLocaleDateString('pt-BR') } catch { return String(d) }
}

// Remove caracteres fora do Latin-1 (WinAnsi) para compatibilidade com pdf-lib
function safe(s) {
  return String(s ?? '-').replace(/[^\x00-\xFF]/g, '-')
}

// ── OAuth2 para Assertiva ─────────────────────────────────────────────────────

async function getAssertivaToken() {
  const clientId = process.env.ASSERTIVA_CLIENT_ID
  const secret   = process.env.ASSERTIVA_CLIENT_SECRET
  if (!clientId || !secret) throw new Error('Credenciais Assertiva não configuradas (ASSERTIVA_CLIENT_ID, ASSERTIVA_CLIENT_SECRET)')

  const credentials = Buffer.from(`${clientId}:${secret}`).toString('base64')
  const res = await fetch('https://api.assertivasolucoes.com.br/oauth2/v3/token', {
    method: 'POST',
    headers: { 'Authorization': `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Assertiva auth falhou (${res.status}): ${text}`)
  }
  const data = await res.json()
  if (!data.access_token) throw new Error('Assertiva não retornou access_token')
  return data.access_token
}

// ── Geração de PDF com pdf-lib ────────────────────────────────────────────────

async function buildPdf(reportData, supplier) {
  const { PDFDocument, rgb, StandardFonts } = require('pdf-lib')

  const doc  = await PDFDocument.create()
  const page = doc.addPage([595.28, 841.89]) // A4
  const { width, height } = page.getSize()

  const fReg  = await doc.embedFont(StandardFonts.Helvetica)
  const fBold = await doc.embedFont(StandardFonts.HelveticaBold)

  // Color constants
  const C_BLUE   = rgb(0.18, 0.19, 0.57)
  const C_ORANGE = rgb(0.96, 0.49, 0.18)
  const C_DARK   = rgb(0.12, 0.16, 0.22)
  const C_GRAY   = rgb(0.42, 0.45, 0.50)
  const C_LGRAY  = rgb(0.95, 0.96, 0.96)
  const C_RED    = rgb(0.86, 0.15, 0.15)
  const C_WHITE  = rgb(1, 1, 1)
  const C_LINE   = rgb(0.90, 0.91, 0.93)

  const scoreClassColor = {
    A: rgb(0.13, 0.77, 0.37), B: rgb(0.52, 0.80, 0.09),
    C: rgb(0.96, 0.62, 0.04), D: rgb(0.98, 0.57, 0.19),
    E: rgb(0.94, 0.27, 0.27), F: rgb(0.86, 0.15, 0.15),
  }

  const MARGIN = 50
  const COL2   = 210
  const RMARGIN = width - MARGIN

  const cab      = reportData?.cabecalho  || {}
  const resp     = reportData?.resposta   || {}
  const score    = resp.score             || {}
  const dados    = resp.dadosCadastrais   || {}
  const protestos= resp.protestosPublicos || {}
  const acoes    = resp.acoesJudiciais    || resp.acaoJudicial || {}
  const cheques  = resp.cheques           || {}
  const debitos  = resp.registroDebitos   || resp.debitosVencidos || {}
  const consultas= resp.registroConsultas || resp.consultas       || {}
  const faturamento = resp.faturamentoPJ  || {}

  const scoreColor = scoreClassColor[score.classe] || C_GRAY

  // ── Header ──────────────────────────────────────────────────────────────────
  const HDR_H = 72
  page.drawRectangle({ x: 0, y: height - HDR_H, width, height: HDR_H, color: C_BLUE })

  page.drawText('ELOS - Analise Restritiva PJ', {
    x: MARGIN, y: height - 32, font: fBold, size: 16, color: C_WHITE,
  })
  page.drawText(`Protocolo: ${safe(cab.protocolo) || '-'}`, {
    x: MARGIN, y: height - 50, font: fReg, size: 9, color: rgb(0.8, 0.82, 0.95),
  })
  page.drawText(`Emitido em: ${fmtDate(cab.dataHora || new Date())}`, {
    x: MARGIN, y: height - 63, font: fReg, size: 9, color: rgb(0.8, 0.82, 0.95),
  })

  // ── Shared drawing helpers ───────────────────────────────────────────────────
  let curY = height - HDR_H - 16

  const sectionTitle = (title) => {
    curY -= 8
    page.drawRectangle({ x: MARGIN, y: curY - 14, width: RMARGIN - MARGIN, height: 20, color: C_BLUE })
    page.drawText(title.toUpperCase(), { x: MARGIN + 6, y: curY - 10, font: fBold, size: 9, color: C_WHITE })
    curY -= 24
  }

  const row = (label, value, alert = false) => {
    const vc = alert ? C_RED : C_DARK
    page.drawText(label + ':', { x: MARGIN + 8, y: curY, font: fBold, size: 9, color: vc, maxWidth: COL2 - MARGIN - 8 })
    const valStr = safe(value ?? '-').slice(0, 90)
    page.drawText(valStr, { x: COL2, y: curY, font: fReg, size: 9, color: vc, maxWidth: RMARGIN - COL2 })
    curY -= 15
  }

  const separator = () => {
    page.drawLine({ start: { x: MARGIN, y: curY }, end: { x: RMARGIN, y: curY }, thickness: 0.5, color: C_LINE })
    curY -= 10
  }

  const checkBreak = () => {
    if (curY < 80) {
      const newPage = doc.addPage([595.28, 841.89])
      // Copy helpers to new page — reassign page-scoped drawing to new page context
      // Since pdf-lib draws to current page reference, we just update our reference
      // and continue. (We return the new page for callers that need it.)
      curY = height - 50
      return newPage
    }
  }

  // ── Dados da Empresa ─────────────────────────────────────────────────────────
  sectionTitle('Dados da Empresa')
  row('Razão Social', dados.razaoSocial || supplier.razao_social)
  row('CNPJ', dados.cnpj || formatCnpj(supplier.cnpj || ''))
  if (dados.naturezaJuridica) row('Natureza Jurídica', dados.naturezaJuridica)
  if (dados.situacaoCadastral) row('Situação Cadastral', dados.situacaoCadastral)
  if (dados.porte) row('Porte', dados.porte)
  curY -= 6

  // ── Score de Crédito ─────────────────────────────────────────────────────────
  checkBreak()
  sectionTitle('Score de Crédito')

  // Score badge
  const BADGE = 40
  page.drawRectangle({ x: MARGIN + 8, y: curY - BADGE + 8, width: BADGE, height: BADGE, color: scoreColor })
  page.drawText(score.classe || '?', {
    x: MARGIN + 8 + BADGE / 2 - (fBold.widthOfTextAtSize(score.classe || '?', 22) / 2),
    y: curY - BADGE / 2 + 2,
    font: fBold, size: 22, color: C_WHITE,
  })

  const scoreX = MARGIN + BADGE + 20
  page.drawText(`Classe ${score.classe || '-'}`, { x: scoreX, y: curY, font: fBold, size: 11, color: scoreColor })
  curY -= 14
  page.drawText(`Pontos: ${score.pontos != null ? score.pontos : '-'} / 1000`, { x: scoreX, y: curY, font: fReg, size: 9, color: C_DARK })
  curY -= 13
  if (score.faixa?.descricao || score.faixa?.titulo) {
    page.drawText(safe(score.faixa.descricao || score.faixa.titulo), { x: scoreX, y: curY, font: fReg, size: 9, color: C_GRAY, maxWidth: RMARGIN - scoreX })
    curY -= 13
  }
  curY -= 8

  // ── Protestos ────────────────────────────────────────────────────────────────
  checkBreak()
  sectionTitle('Protestos Públicos')
  const qtdProt = protestos.qtdProtestos ?? protestos.quantidade ?? 0
  const temProt = qtdProt > 0
  row('Quantidade', qtdProt, temProt)
  if (protestos.valorTotal != null) row('Valor Total', fmtMoney(protestos.valorTotal), temProt)
  if (protestos.cartoriosProtestados?.length) {
    const cartorios = protestos.cartoriosProtestados.map(c => c.municipio || c.cidade || c.nome || '').filter(Boolean).join(', ')
    if (cartorios) row('Cartórios', cartorios)
  }
  if (!temProt) {
    page.drawText('Nenhum protesto registrado', { x: MARGIN + 8, y: curY, font: fReg, size: 9, color: rgb(0.13, 0.77, 0.37) })
    curY -= 14
  }
  curY -= 6

  // ── Ações Judiciais ──────────────────────────────────────────────────────────
  const qtdAcoes = acoes.qtd ?? acoes.quantidade ?? acoes.qtdAcoes
  if (qtdAcoes != null || acoes.valor != null) {
    checkBreak()
    sectionTitle('Ações Judiciais')
    const temAcoes = (qtdAcoes || 0) > 0
    row('Quantidade', qtdAcoes ?? 0, temAcoes)
    if (acoes.valor != null) row('Valor', fmtMoney(acoes.valor), temAcoes)
    if (!temAcoes) {
      page.drawText('Nenhuma acao judicial registrada', { x: MARGIN + 8, y: curY, font: fReg, size: 9, color: rgb(0.13, 0.77, 0.37) })
      curY -= 14
    }
    curY -= 6
  }

  // ── Cheques ──────────────────────────────────────────────────────────────────
  checkBreak()
  sectionTitle('Cheques Sem Fundo')
  const qtdCheq = cheques.qtd ?? cheques.quantidade ?? 0
  const temCheq = qtdCheq > 0
  row('Quantidade', qtdCheq, temCheq)
  if (cheques.valor != null) row('Valor Total', fmtMoney(cheques.valor), temCheq)
  if (!temCheq) {
    page.drawText('Nenhum cheque sem fundo registrado', { x: MARGIN + 8, y: curY, font: fReg, size: 9, color: rgb(0.13, 0.77, 0.37) })
    curY -= 14
  }
  curY -= 6

  // ── Registro de Débitos ──────────────────────────────────────────────────────
  const qtdDeb = debitos.qtd ?? debitos.quantidade ?? debitos.qtdDebitos
  if (qtdDeb != null || debitos.valor != null) {
    checkBreak()
    sectionTitle('Registro de Débitos')
    const temDeb = (qtdDeb || 0) > 0
    row('Quantidade', qtdDeb ?? 0, temDeb)
    if (debitos.valor != null) row('Valor Total', fmtMoney(debitos.valor), temDeb)
    if (!temDeb) {
      page.drawText('Nenhum debito registrado', { x: MARGIN + 8, y: curY, font: fReg, size: 9, color: rgb(0.13, 0.77, 0.37) })
      curY -= 14
    }
    curY -= 6
  }

  // ── Registro de Consultas ────────────────────────────────────────────────────
  const qtdCons = consultas.qtdConsultas ?? consultas.quantidade ?? consultas.qtd
  if (qtdCons != null) {
    checkBreak()
    sectionTitle('Registro de Consultas')
    row('Total de Consultas', qtdCons)
    if (consultas.primeiraConsulta || consultas.primeiraData) row('Primeira Consulta', fmtDate(consultas.primeiraConsulta || consultas.primeiraData))
    if (consultas.ultimaConsulta   || consultas.ultimaData)   row('Última Consulta',   fmtDate(consultas.ultimaConsulta   || consultas.ultimaData))
    curY -= 6
  }

  // ── Faturamento Presumido ────────────────────────────────────────────────────
  const fatVal = faturamento.faturamentoPJ ?? faturamento.valor ?? faturamento.faturamento
  if (fatVal != null) {
    checkBreak()
    sectionTitle('Faturamento Presumido')
    row('Faturamento Anual Estimado', fmtMoney(fatVal))
    if (faturamento.dataBase) row('Data Base', fmtDate(faturamento.dataBase))
    curY -= 6
  }

  // ── Footer ───────────────────────────────────────────────────────────────────
  const lastPage = doc.getPage(doc.getPageCount() - 1)
  const footerY  = 30
  lastPage.drawRectangle({ x: 0, y: 0, width, height: footerY + 10, color: C_LGRAY })
  lastPage.drawText(
    `Relatorio gerado em ${new Date().toLocaleDateString('pt-BR')} - Protocolo ${safe(cab.protocolo) || '-'} - Assertiva Solucoes`,
    { x: MARGIN, y: 14, font: fReg, size: 7.5, color: C_GRAY, maxWidth: width - MARGIN * 2 }
  )

  const pdfBytes = await doc.save()
  return Buffer.from(pdfBytes)
}

// ── Handler principal ─────────────────────────────────────────────────────────

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' }

  // Autenticação do chamador
  const token = (event.headers.authorization || '').replace('Bearer ', '')
  if (!token) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Token ausente' }) }

  const { data: { user: caller }, error: authErr } = await supabaseAdmin.auth.getUser(token)
  if (authErr || !caller) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Token inválido' }) }

  const { data: callerRole } = await supabaseAdmin
    .from('user_roles').select('role').eq('user_id', caller.id).order('is_primary', { ascending: false }).limit(1).maybeSingle()
  const isAdmin    = callerRole?.role === 'ADMIN'
  const isSupplier = callerRole?.role === 'SUPPLIER'
  if (!isAdmin && !isSupplier) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Sem permissão' }) }

  // ── GET: retorna último relatório salvo ───────────────────────────────────
  if (event.httpMethod === 'GET') {
    let targetSupplierId = event.queryStringParameters?.supplierId
    if (!isAdmin) {
      const { data: profile } = await supabaseAdmin.from('profiles').select('supplier_id').eq('id', caller.id).maybeSingle()
      targetSupplierId = profile?.supplier_id
    }
    if (!targetSupplierId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'supplierId ausente' }) }

    const { data: report } = await supabaseAdmin
      .from('assertiva_reports')
      .select('id, cnpj, score_classe, score_pontos, protocol, generated_at, report_data')
      .eq('supplier_id', targetSupplierId)
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    return { statusCode: 200, headers, body: JSON.stringify({ report: report || null }) }
  }

  // ── POST: gera novo relatório ─────────────────────────────────────────────
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método não suportado' }) }

  let body = {}
  try { body = JSON.parse(event.body || '{}') } catch { /* usa vazio */ }

  let targetSupplierId = body.supplierId
  if (!isAdmin) {
    const { data: profile } = await supabaseAdmin.from('profiles').select('supplier_id').eq('id', caller.id).maybeSingle()
    targetSupplierId = profile?.supplier_id
  }
  if (!targetSupplierId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'supplierId ausente' }) }

  const { data: supplier, error: supErr } = await supabaseAdmin
    .from('suppliers').select('cnpj, razao_social').eq('id', targetSupplierId).maybeSingle()
  if (supErr || !supplier?.cnpj) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Fornecedor ou CNPJ não encontrado' }) }

  try {
    // 1. Obtém token Assertiva
    const assertivaToken = await getAssertivaToken()

    // 2. Chama Análise Restritiva PJ
    const cnpjFormatado = formatCnpj(supplier.cnpj)
    const cnpjEncoded   = encodeURIComponent(cnpjFormatado)
    const apiRes = await fetch(
      `https://api.assertivasolucoes.com.br/score/v3/pj/credito/${cnpjEncoded}?idFinalidade=2`,
      { headers: { 'Authorization': `Bearer ${assertivaToken}`, 'Accept': 'application/json' } }
    )

    if (apiRes.status === 429) return { statusCode: 429, headers, body: JSON.stringify({ error: 'Consulta duplicada. Aguarde 2 minutos antes de gerar novamente.' }) }
    if (apiRes.status === 202) return { statusCode: 202, headers, body: JSON.stringify({ error: 'CNPJ não encontrado ou restrição LGPD.' }) }
    if (!apiRes.ok) {
      const errText = await apiRes.text()
      throw new Error(`Assertiva API error ${apiRes.status}: ${errText.slice(0, 200)}`)
    }

    const reportData = await apiRes.json()
    const scoreClasse = reportData?.resposta?.score?.classe || null
    const scorePontos = reportData?.resposta?.score?.pontos ?? null
    const protocol    = reportData?.cabecalho?.protocolo    || null

    // 3. Salva em assertiva_reports
    const { data: saved, error: saveErr } = await supabaseAdmin
      .from('assertiva_reports')
      .insert({ supplier_id: targetSupplierId, cnpj: supplier.cnpj, report_data: reportData, protocol, score_classe: scoreClasse, score_pontos: scorePontos, generated_by: caller.id })
      .select('id, generated_at')
      .single()
    if (saveErr) console.error('[assertiva-report] save assertiva_reports error:', saveErr.message)

    // 4. Gera PDF
    const pdfBuffer = await buildPdf(reportData, supplier)

    // 5. Faz upload para Supabase Storage
    const timestamp  = Date.now()
    const storagePath = `${targetSupplierId}/assertiva_360_${timestamp}.pdf`

    const { error: uploadErr } = await supabaseAdmin.storage
      .from(ASSERTIVA_BUCKET)
      .upload(storagePath, pdfBuffer, { contentType: 'application/pdf', upsert: true })
    if (uploadErr) throw new Error('Erro no upload do PDF: ' + uploadErr.message)

    // 6. Gera signed URL (1 ano)
    const { data: signedData } = await supabaseAdmin.storage
      .from(ASSERTIVA_BUCKET)
      .createSignedUrl(storagePath, 60 * 60 * 24 * 365)

    // 7. Upsert na tabela documents (tipo '100')
    const { error: docErr } = await supabaseAdmin
      .from('documents')
      .upsert({
        supplier_id:  targetSupplierId,
        type:         ASSERTIVA_DOC_TYPE,
        label:        'Relatório Assertiva 360 — Análise Restritiva PJ',
        source:       'AUTO',
        status:       'VALID',
        storage_path: storagePath,
        public_url:   signedData?.signedUrl || '',
        metadata: {
          protocolo:   protocol,
          scoreClasse,
          scorePontos,
          assertivaReportId: saved?.id,
          geradoPor:   caller.id,
        },
      }, { onConflict: 'supplier_id,type' })
    if (docErr) console.error('[assertiva-report] upsert documents error:', docErr.message)

    return {
      statusCode: 200, headers,
      body: JSON.stringify({ success: true, reportId: saved?.id, generatedAt: saved?.generated_at, scoreClasse, scorePontos, storagePath }),
    }
  } catch (err) {
    console.error('[assertiva-report]', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) }
  }
}
