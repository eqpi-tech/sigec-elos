// scripts/eval_rota_b.cjs — piloto da Rota B (SPEC_ROTA_B.md §6-7).
// Para cada item da amostra (HOC, somente leitura): baixa o arquivo do S3
// legado (zlib), prepara (PDF com texto → texto com CPF/RG mascarados; PDF
// escaneado/imagem → arquivo), pede a pré-análise à IA e grava o resultado.
// Nada é gravado no HOC nem no ELOS. Uso:
//   node scripts/eval_rota_b.cjs <amostra.json> <regras.json> <motivos.json> <saida.jsonl> [concorrência]
const fs = require('fs')
const path = require('path')
const os = require('os')
const zlib = require('zlib')
const { execFileSync } = require('child_process')
for (const l of fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3')
const { Anthropic, revisar, mascararPII } = require('../netlify/functions/lib/ai_review/index.js')

const [amostraPath, regrasPath, motivosPath, saida, conc = '4'] = process.argv.slice(2)
const amostra = JSON.parse(fs.readFileSync(amostraPath, 'utf8'))
const regras = JSON.parse(fs.readFileSync(regrasPath, 'utf8'))
const motivos = JSON.parse(fs.readFileSync(motivosPath, 'utf8'))
const feitos = new Set(fs.existsSync(saida) ? fs.readFileSync(saida, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).pd_id) : [])
const s3 = new S3Client({ region: process.env.HOC_S3_REGION || 'sa-east-1',
  credentials: { accessKeyId: process.env.HOC_AWS_ACCESS_KEY_ID, secretAccessKey: process.env.HOC_AWS_SECRET_ACCESS_KEY } })
const client = new Anthropic()
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rotab-'))

function sniff(buf) {
  if (buf.slice(0, 4).toString('latin1') === '%PDF') return 'pdf'
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'jpg'
  if (buf[0] === 0x89 && buf.slice(1, 4).toString('latin1') === 'PNG') return 'png'
  return 'outro'
}

async function baixar(arquivoId) {
  const obj = await s3.send(new GetObjectCommand({ Bucket: process.env.HOC_S3_BUCKET || 'hoc-file-store-prod', Key: `${process.env.HOC_S3_PREFIX || 'hoc_file_'}${arquivoId}` }))
  const comp = Buffer.from(await obj.Body.transformToByteArray())
  try { return zlib.inflateSync(comp) } catch { return comp }
}

function preparar(buf, id) {
  const t = sniff(buf)
  if (t === 'jpg' || t === 'png') return { modo: 'imagem', mime: t === 'jpg' ? 'image/jpeg' : 'image/png', b64: buf.toString('base64') }
  if (t !== 'pdf') return { modo: 'pular', motivo: 'formato não suportado' }
  const f = path.join(tmp, `${id}.pdf`); fs.writeFileSync(f, buf)
  let texto = '', paginas = 1
  try { texto = execFileSync('pdftotext', ['-layout', f, '-'], { maxBuffer: 50e6 }).toString('utf8') } catch { /* PDF sem texto */ }
  try { paginas = Number((execFileSync('pdfinfo', [f]).toString().match(/Pages:\s+(\d+)/) || [])[1]) || 1 } catch { /* */ }
  fs.unlinkSync(f)
  const util = texto.replace(/\s+/g, '').length
  if (util >= 250 * paginas * 0.5 && util > 300) return { modo: 'texto', texto: mascararPII(texto), paginas }
  if (buf.length > 30e6) return { modo: 'pular', motivo: 'PDF escaneado grande demais' }
  return { modo: 'pdf', b64: buf.toString('base64'), paginas }
}

async function processar(item) {
  const base = { pd_id: item.pd_id, tipo: item.tipo, rotulo: item.rotulo, motivo_hoc: item.motivo, motivo_hoc_texto: item.motivo_texto }
  try {
    const arq = preparar(await baixar(item.arquivo_id), item.pd_id)
    if (arq.modo === 'pular') return { ...base, modo: 'pular', erro: arq.motivo }
    const r = await revisar({ client, motivos, tipoNome: regras[item.tipo].nome, regra: regras[item.tipo].regra,
      fornecedor: { cnpj: item.cnpj, razao_social: item.razao_social, municipio: item.municipio, categorias: item.categorias },
      dataReferencia: item.data_analise, arquivo: arq })
    return { ...base, modo: arq.modo, paginas: arq.paginas, ...r }
  } catch (e) {
    return { ...base, modo: 'erro', erro: `${e.constructor?.name || 'Error'}: ${String(e.message).slice(0, 300)}` }
  }
}

;(async () => {
  const fila = amostra.filter((i) => !feitos.has(i.pd_id))
  console.log(`${fila.length} a processar (${feitos.size} já feitos) · concorrência ${conc}`)
  let n = 0
  const workers = Array.from({ length: Number(conc) }, async () => {
    while (fila.length) {
      const item = fila.shift()
      const r = await processar(item)
      fs.appendFileSync(saida, JSON.stringify(r) + '\n')
      n++
      console.log(`${n}. tipo ${r.tipo} · ${r.rotulo} → ${r.resultado?.veredito || r.modo} (${r.modo}${r.custo_brl != null ? `, R$ ${r.custo_brl.toFixed(3)}` : ''})${r.erro ? ' · ' + r.erro.slice(0, 120) : ''}`)
    }
  })
  await Promise.all(workers)
  fs.rmSync(tmp, { recursive: true, force: true })
  console.log('fim')
})()
