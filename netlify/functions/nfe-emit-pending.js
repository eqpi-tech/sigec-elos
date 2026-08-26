// netlify/functions/nfe-emit-pending.js
// Emite NFSe (NFE.io) para pagamentos Stripe pendentes em nfe_invoices.
// Portado do eqpi-nfe-emissor (lambda do HOC): mesmo payload/mapper, mesma
// disciplina — falha 4xx da NFE.io é NÃO-retryável (marca FAILED e não
// reprocessa); 5xx/rede mantém PENDING para a próxima varredura.
// Disparo: cron diário (CRON_SECRET) + chamada direta pós-webhook Stripe.
//
// Env: NFE_API_KEY, NFE_COMPANY_ID (NFE.io) · opcionais NFE_SERIE,
// NFE_DISCRIMINACAO e alíquotas (defaults = parâmetros fiscais do HOC)

const { createClient } = require('@supabase/supabase-js')

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const HEADERS = { 'Content-Type': 'application/json' }

// Parâmetros fiscais — copiados da tabela `parametros` do HOC (nfe.*)
const PARAMS = {
  serie:          process.env.NFE_SERIE          || 'ELOS',
  codigoServico:  process.env.NFE_CODIGO_SERVICO || '2800',
  codigoEcoserv:  process.env.NFE_CODIGO_ECOSERV || '1.1502.90.00',
  cIndOp:         process.env.NFE_CINDOP         || '100301',
  cstIbsCbs:      process.env.NFE_CST            || '000',
  cClasTrib:      process.env.NFE_CCLASTRIB      || '000001',
  aliquotaIbs:    Number(process.env.NFE_ALIQ_IBS || '0.10'),
  aliquotaCbs:    Number(process.env.NFE_ALIQ_CBS || '0.90'),
}

async function ibgePorCep(cep, municipio, uf) {
  const clean = String(cep || '').replace(/\D/g, '')
  if (clean.length === 8) {
    try {
      const r = await fetch(`https://brasilapi.com.br/api/cep/v2/${clean}`)
      if (r.ok) {
        const d = await r.json()
        if (d.city_ibge) return String(d.city_ibge)
        // v2 pode não trazer ibge — tenta v1
      }
      const r1 = await fetch(`https://viacep.com.br/ws/${clean}/json/`)
      if (r1.ok) {
        const d1 = await r1.json()
        if (d1.ibge) return String(d1.ibge)
      }
    } catch { /* fallback abaixo */ }
  }
  // fallback: IBGE por município/UF
  try {
    if (municipio && uf) {
      const r = await fetch(`https://brasilapi.com.br/api/ibge/municipios/v1/${uf}`)
      if (r.ok) {
        const list = await r.json()
        const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '')
        const hit = (list || []).find(m => norm(m.nome) === norm(municipio))
        if (hit?.codigo_ibge) return String(hit.codigo_ibge).slice(0, 7)
      }
    }
  } catch { /* sem IBGE */ }
  return null
}

function mapearParaNfeIo(sup, inv, codigoIbge) {
  const cleanCnpj = String(sup.cnpj || '').replace(/\D/g, '')
  const addr = sup.address || {}
  const hocEnd = (sup.hoc_extra?.enderecos || [])[0] || {}
  const cep = String(addr.cep || hocEnd.cep || '').replace(/\D/g, '')
  const municipio = addr.municipio || hocEnd.municipio || sup.city || ''
  const uf = addr.uf || hocEnd.uf || sup.state || 'SP'
  const isSaoPauloCapital = codigoIbge === '3550308'

  return {
    borrower: {
      type: cleanCnpj.length > 11 ? 'LegalEntity' : 'NaturalPerson',
      name: sup.razao_social,
      federalTaxNumber: Number(cleanCnpj),
      municipalTaxNumber: isSaoPauloCapital ? (sup.inscricao_municipal || '') : '',
      email: sup.email_financeiro || sup.email || '',
      address: {
        country: 'BRA',
        postalCode: cep,
        street: addr.logradouro || hocEnd.nome_logradouro || '',
        number: addr.numero || hocEnd.numero_endereco || 'S/N',
        additionalInformation: addr.complemento || hocEnd.complemento || '',
        district: addr.bairro || hocEnd.bairro || '',
        city: { code: codigoIbge || '', name: municipio },
        state: uf,
      },
    },
    cityServiceCode: PARAMS.codigoServico,
    nbsCode: PARAMS.codigoEcoserv,
    description: inv.description ||
      (process.env.NFE_DISCRIMINACAO || 'Serviço de Análise Cadastral — Assinatura SIGEC-ELOS'),
    servicesAmount: inv.amount_cents / 100,
    ibsCbs: {
      operationIndicator: PARAMS.cIndOp,
      situationCode: PARAMS.cstIbsCbs,
      classCode: PARAMS.cClasTrib,
      ibs: {
        state:     { rate: PARAMS.aliquotaIbs / 100 },
        municipal: { rate: PARAMS.aliquotaIbs / 100 },
      },
      cbs: { rate: PARAMS.aliquotaCbs / 100 },
    },
  }
}

exports.handler = async (event) => {
  // Aceita CRON_SECRET (varredura agendada) OU chamada interna do stripe-webhook
  const auth = event.headers.authorization || ''
  const isCron     = process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`
  const isInternal = process.env.INTERNAL_FN_SECRET && auth === `Bearer ${process.env.INTERNAL_FN_SECRET}`
  if (!isCron && !isInternal)
    return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: 'Não autorizado' }) }

  if (!process.env.NFE_API_KEY || !process.env.NFE_COMPANY_ID)
    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ skipped: 'NFE_API_KEY/NFE_COMPANY_ID não configuradas — fila preservada' }) }

  const { data: pending } = await supabaseAdmin
    .from('nfe_invoices')
    .select('*, suppliers(cnpj, razao_social, inscricao_municipal, email, email_financeiro, address, hoc_extra, city, state)')
    .eq('status', 'PENDING')   // PROCESSING/NEEDS_REVIEW NUNCA são retomados automaticamente
    .order('created_at')
    .limit(20)

  // ═══ GARANTIA ANTI-DUPLICAÇÃO (NFE.io bloqueia por reenvio) ═══
  // 1) Claim ATÔMICO: status PENDING→PROCESSING com condição — se outra
  //    execução (cron × pós-webhook) pegou antes, o update retorna vazio e
  //    esta instância PULA a linha.
  // 2) ≤1 envio automático por nota: depois que a chamada à NFE.io é
  //    INICIADA, qualquer resultado ambíguo (timeout/rede/5xx — a nota pode
  //    ter sido aceita lá) vira NEEDS_REVIEW e NUNCA é reenviado sozinho.
  //    Humano confere no painel da NFE.io e, se não emitiu, volta a linha
  //    para PENDING manualmente.
  let emitted = 0, failed = 0, review = 0, skippedClaim = 0
  for (const inv of (pending || [])) {
    const sup = inv.suppliers

    // claim atômico
    const { data: claimed } = await supabaseAdmin.from('nfe_invoices')
      .update({ status: 'PROCESSING', attempts: (inv.attempts || 0) + 1, last_attempt_at: new Date().toISOString() })
      .eq('id', inv.id).eq('status', 'PENDING')
      .select('id')
    if (!claimed?.length) { skippedClaim++; continue }

    let callStarted = false
    try {
      if (!sup?.cnpj) throw Object.assign(new Error('Fornecedor sem CNPJ'), { nonRetryable: true })
      const addr = sup.address || {}
      const hocEnd = (sup.hoc_extra?.enderecos || [])[0] || {}
      const codigoIbge = await ibgePorCep(addr.cep || hocEnd.cep, addr.municipio || hocEnd.municipio || sup.city, addr.uf || hocEnd.uf || sup.state)

      const payload = mapearParaNfeIo(sup, inv, codigoIbge)
      if (!payload.borrower.address.city.code) {
        throw Object.assign(new Error(`Cadastro incompleto: IBGE não resolvido (cep=${addr.cep || hocEnd.cep || '—'})`), { nonRetryable: true })
      }

      callStarted = true   // a partir daqui, ambiguidade = NEEDS_REVIEW
      const res = await fetch(
        `https://api.nfe.io/v1/companies/${process.env.NFE_COMPANY_ID}/serviceinvoices?apikey=${process.env.NFE_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': process.env.NFE_API_KEY },
          body: JSON.stringify(payload),
        }
      )
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw Object.assign(new Error(`NFe.io ${res.status}: ${JSON.stringify(body).slice(0, 800)}`),
          { nonRetryable: res.status >= 400 && res.status < 500 })
      }

      await supabaseAdmin.from('nfe_invoices').update({
        status: 'EMITTED', nfeio_id: body.id || null, serie: PARAMS.serie,
        nfe_status: body.status || 'processando', emitted_at: new Date().toISOString(), log_erro: null,
      }).eq('id', inv.id)
      emitted++
    } catch (e) {
      if (e.nonRetryable && !callStarted) {
        // erro NOSSO, antes de falar com a NFE.io — seguro marcar FAILED
        await supabaseAdmin.from('nfe_invoices').update({
          status: 'FAILED', log_erro: String(e.message).slice(0, 4000), serie: PARAMS.serie,
        }).eq('id', inv.id)
        failed++
      } else if (e.nonRetryable) {
        // 4xx da NFE.io: rejeitou o payload — não emitiu, mas registra como
        // FAILED (não-retryável) para não insistir e queimar cota
        await supabaseAdmin.from('nfe_invoices').update({
          status: 'FAILED', log_erro: String(e.message).slice(0, 4000), serie: PARAMS.serie,
        }).eq('id', inv.id)
        failed++
      } else {
        // AMBÍGUO (timeout/rede/5xx com chamada iniciada, ou falha pré-chamada
        // de rede): a nota PODE ter sido aceita na NFE.io — NUNCA reenviar
        // automaticamente. Revisão humana obrigatória.
        await supabaseAdmin.from('nfe_invoices').update({
          status: 'NEEDS_REVIEW',
          log_erro: `Resultado ambíguo (${callStarted ? 'chamada iniciada' : 'pré-chamada'}): ${String(e.message).slice(0, 3000)}. Confira no painel NFE.io se a nota saiu; se NÃO saiu, volte status para PENDING.`,
        }).eq('id', inv.id)
        review++
      }
    }
  }

  console.log(`[nfe-emit-pending] emitidas=${emitted} falhas=${failed} revisão=${review} claim_perdido=${skippedClaim}`)
  return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ emitted, failed, needs_review: review, pending: (pending || []).length }) }
}
