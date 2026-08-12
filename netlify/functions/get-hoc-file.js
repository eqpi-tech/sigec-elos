// netlify/functions/get-hoc-file.js
// Abre documentos migrados do HOC. Os arquivos vivem no S3 privado
// (hoc-file-store-prod) COMPRIMIDOS com zlib — não dá para servir a
// URL do S3 diretamente. Estratégia: cache lazy no Supabase Storage.
//
//   1º acesso : baixa do S3 → inflate (zlib) → grava no bucket
//               `documents` (hoc/{supplier_id}/{arquivo_id}.{ext})
//               → salva storage_path no documento → signed URL
//   demais    : signed URL direto do Storage (rápido)
//
// GET ?documentId=<uuid>
// Autorização: ADMIN | fornecedor dono | cliente com selo do fornecedor
//
// Env (Netlify): HOC_AWS_ACCESS_KEY_ID, HOC_AWS_SECRET_ACCESS_KEY,
//                HOC_S3_BUCKET?, HOC_S3_REGION?, HOC_S3_PREFIX?

const zlib = require('zlib')
const { createClient } = require('@supabase/supabase-js')
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3')

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const s3 = new S3Client({
  region: process.env.HOC_S3_REGION || 'sa-east-1',
  credentials: {
    accessKeyId: process.env.HOC_AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.HOC_AWS_SECRET_ACCESS_KEY,
  },
})

// Detecta tipo pelo conteúdo descomprimido
function sniff(buf) {
  if (buf.slice(0, 4).toString('latin1') === '%PDF') return { ext: 'pdf', mime: 'application/pdf' }
  if (buf[0] === 0xFF && buf[1] === 0xD8) return { ext: 'jpg', mime: 'image/jpeg' }
  if (buf[0] === 0x89 && buf.slice(1, 4).toString('latin1') === 'PNG') return { ext: 'png', mime: 'image/png' }
  if (buf.slice(0, 2).toString('latin1') === 'PK') return { ext: 'zip', mime: 'application/zip' }
  return { ext: 'bin', mime: 'application/octet-stream' }
}

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' }
  if (event.httpMethod !== 'GET') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método não suportado' }) }

  const token = (event.headers.authorization || '').replace('Bearer ', '')
  if (!token) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Token ausente' }) }

  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token)
  if (authErr || !user) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Token inválido' }) }

  const documentId = event.queryStringParameters?.documentId
  if (!documentId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'documentId obrigatório' }) }

  try {
    const { data: doc } = await supabaseAdmin
      .from('documents')
      .select('id, supplier_id, hoc_arquivo_id, storage_path, label')
      .eq('id', documentId)
      .maybeSingle()
    if (!doc) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Documento não encontrado' }) }

    // ── Autorização ─────────────────────────────────────────
    const { data: roles } = await supabaseAdmin
      .from('user_roles')
      .select('role, supplier_id, client_id')
      .eq('user_id', user.id)

    const isAdmin = (roles || []).some(r => r.role === 'ADMIN')
    const isOwner = (roles || []).some(r => r.role === 'SUPPLIER' && r.supplier_id === doc.supplier_id)
    let isLinkedClient = false
    if (!isAdmin && !isOwner) {
      const clientIds = (roles || []).filter(r => r.role === 'CLIENT' && r.client_id).map(r => r.client_id)
      if (clientIds.length) {
        const { data: seal } = await supabaseAdmin
          .from('seals').select('id')
          .eq('supplier_id', doc.supplier_id)
          .in('client_id', clientIds)
          .limit(1)
        isLinkedClient = !!seal?.length
      }
    }
    if (!isAdmin && !isOwner && !isLinkedClient)
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Sem permissão para este documento' }) }

    // ── Cache hit: já foi inflado para o Storage ────────────
    if (doc.storage_path) {
      const { data: signed, error: signErr } = await supabaseAdmin.storage
        .from('documents')
        .createSignedUrl(doc.storage_path, 3600)
      if (!signErr && signed?.signedUrl)
        return { statusCode: 200, headers, body: JSON.stringify({ url: signed.signedUrl, label: doc.label, cached: true }) }
      // storage_path inválido → cai para o fluxo S3 abaixo
    }

    if (!doc.hoc_arquivo_id)
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Documento sem arquivo disponível' }) }
    if (!process.env.HOC_AWS_ACCESS_KEY_ID)
      return { statusCode: 503, headers, body: JSON.stringify({ error: 'Acesso ao arquivo HOC não configurado (HOC_AWS_*)' }) }

    // ── 1º acesso: S3 → inflate → Storage ───────────────────
    const bucket = process.env.HOC_S3_BUCKET || 'hoc-file-store-prod'
    const prefix = process.env.HOC_S3_PREFIX || 'hoc_file_'
    const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: `${prefix}${doc.hoc_arquivo_id}` }))
    const compressed = Buffer.from(await obj.Body.transformToByteArray())

    let inflated
    try {
      inflated = zlib.inflateSync(compressed)
    } catch {
      // alguns arquivos podem estar sem compressão — usa como está
      inflated = compressed
    }

    const { ext, mime } = sniff(inflated)
    const storagePath = `hoc/${doc.supplier_id}/${doc.hoc_arquivo_id}.${ext}`

    const { error: upErr } = await supabaseAdmin.storage
      .from('documents')
      .upload(storagePath, inflated, { contentType: mime, upsert: true })
    if (upErr) throw new Error(`Falha ao cachear no Storage: ${upErr.message}`)

    await supabaseAdmin.from('documents').update({ storage_path: storagePath }).eq('id', doc.id)

    const { data: signed, error: signErr } = await supabaseAdmin.storage
      .from('documents')
      .createSignedUrl(storagePath, 3600)
    if (signErr) throw new Error(signErr.message)

    return { statusCode: 200, headers, body: JSON.stringify({ url: signed.signedUrl, label: doc.label, cached: false }) }
  } catch (err) {
    console.error('[get-hoc-file]', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) }
  }
}
