// netlify/functions/collect-document.js
// Dispara a coleta automática de um documento específico para um fornecedor.
// Chamado pelo frontend quando o fornecedor clica "Buscar automaticamente"
// POST body: { supplierId, documentId, cnpj, uf }
//
// documentId → qual documento coletar:
//   7  = CRF FGTS (via scraping Caixa)
//   37 = Cartão CNPJ (BrasilAPI — já feito no cadastro)
//   62 = Simples Nacional (BrasilAPI — já feito no cadastro)

const { createClient } = require('@supabase/supabase-js')

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  }
  if (event.httpMethod === 'OPTIONS') return { statusCode:200, headers, body:'' }
  if (event.httpMethod !== 'POST') return { statusCode:405, headers, body: JSON.stringify({ error:'Method not allowed' }) }

  let body
  try { body = JSON.parse(event.body) } catch { return { statusCode:400, headers, body: JSON.stringify({ error:'Invalid JSON' }) } }

  const { supplierId, documentId, cnpj, uf } = body
  if (!supplierId || !documentId || !cnpj) {
    return { statusCode:400, headers, body: JSON.stringify({ error:'supplierId, documentId e cnpj são obrigatórios' }) }
  }

  const docIdNum = Number(documentId)

  try {
    // ── Documento 7: CRF FGTS ───────────────────────────────────────────────
    if (docIdNum === 7) {
      const fgtsUrl = new URL(`${process.env.FRONTEND_URL}/.netlify/functions/fgts-crf-lookup`)
      fgtsUrl.searchParams.set('cnpj', cnpj.replace(/\D/g,''))
      fgtsUrl.searchParams.set('uf',   uf || '')

      const res  = await fetch(fgtsUrl.toString())
      const data = await res.json()

      if (data.status === 'INDEFINIDO') {
        return { statusCode:200, headers, body: JSON.stringify({ status:'INDEFINIDO', message: data.message }) }
      }

      const isRegular = data.status === 'REGULAR'

      // Calcula data de expiração a partir da validade do certificado
      let expiresAt = null
      if (data.validadeFim) {
        // Converte "29/04/2026" → "2026-04-29"
        const [d, m, y] = data.validadeFim.split('/')
        expiresAt = `${y}-${m}-${d}`
      }

      // Upsert no banco
      const { data: doc, error } = await supabaseAdmin
        .from('documents')
        .upsert({
          supplier_id:  supplierId,
          type:         '7',
          label:        'Certidão de Regularidade do FGTS (CRF)',
          source:       'AUTO',
          status:       isRegular ? 'VALID' : 'MISSING',
          storage_path: null,
          expires_at:   expiresAt,
          metadata: {
            auto_collect:      true,
            source:            'Caixa Econômica Federal — CRF',
            regular:           isRegular,
            empresa:           data.empresa,
            numeroCertificado: data.numeroCertificado,
            validadeInicio:    data.validadeInicio,
            validadeFim:       data.validadeFim,
            consultadoEm:      data.consultadoEm,
          },
        }, { onConflict: 'supplier_id,type' })
        .select()
        .single()

      if (error) throw new Error(error.message)

      // Recalcula score do fornecedor
      await recalcScore(supplierId)

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          documentId: 7,
          status:     isRegular ? 'VALID' : 'MISSING',
          empresa:    data.empresa,
          validadeFim:       data.validadeFim,
          numeroCertificado: data.numeroCertificado,
          message: isRegular
            ? `✅ FGTS regular. Validade: ${data.validadeInicio} a ${data.validadeFim}`
            : '❌ Empresa com pendências perante o FGTS.',
        }),
      }
    }

    return { statusCode:400, headers, body: JSON.stringify({ error: `Documento ${documentId} não suportado para coleta automática` }) }

  } catch (err) {
    console.error('[collect-document] Erro:', err)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Erro na coleta', detail: err.message }),
    }
  }
}

async function recalcScore(supplierId) {
  try {
    const [{ data: allDocs }, { data: catRows }] = await Promise.all([
      supabaseAdmin.from('documents').select('type, status').eq('supplier_id', supplierId),
      supabaseAdmin.from('supplier_categories').select('category_id').eq('supplier_id', supplierId),
    ])
    let reqDocs = []
    if (catRows?.length) {
      const catIds = catRows.map(r => r.category_id)
      const { data: catDocRows } = await supabaseAdmin
        .from('category_documents').select('document_id').in('category_id', catIds)
      const seen = new Set()
      reqDocs = (catDocRows||[]).map(r=>({id:r.document_id})).filter(d=>{if(seen.has(d.id))return false;seen.add(d.id);return true})
    }
    // Score simples: (docs válidos / total) * 100
    const totalW = reqDocs.reduce((a,d)=>a+(d.id===37||d.id===42||d.id===7||d.id===8?8:3),0)
    const validW = reqDocs.reduce((a,d)=>{
      const found = (allDocs||[]).find(u=>u.type===String(d.id)&&u.status==='VALID')
      return a+(found?(d.id===37||d.id===42||d.id===7||d.id===8?8:3):0)
    },0)
    const score = totalW>0 ? Math.min(Math.round((validW/totalW)*100),100) : 0
    await supabaseAdmin.from('seals').update({ score }).eq('supplier_id', supplierId)
  } catch(e) { console.warn('[recalcScore]', e.message) }
}
