// lib/infosimples_crypto.js — criptografia de parâmetros sensíveis exigida
// pela Infosimples (certificado A1 e senha — docs/certificados.md e
// docs/criptografia.md). Compatível com AesBridge GCM (encrypt padrão do
// exemplo oficial): PBKDF2-HMAC-SHA256 (100.000 iterações, sal de 16 bytes)
// → AES-256-GCM (nonce de 12 bytes, sem AAD); saída
// sal(16) + nonce(12) + cifrado + tag(16), em base64 URL-safe sem padding.
// A chave de criptografia é da conta (INFOSIMPLES_ENC_KEY) — nunca logar.
const crypto = require('crypto')

function encryptParam(plain, key = process.env.INFOSIMPLES_ENC_KEY) {
  if (!key) throw new Error('INFOSIMPLES_ENC_KEY não configurada')
  const salt = crypto.randomBytes(16)
  const nonce = crypto.randomBytes(12)
  const k = crypto.pbkdf2Sync(Buffer.from(String(key), 'utf8'), salt, 100000, 32, 'sha256')
  const cipher = crypto.createCipheriv('aes-256-gcm', k, nonce)
  const ct = Buffer.concat([cipher.update(Buffer.from(String(plain), 'utf8')), cipher.final()])
  return Buffer.concat([salt, nonce, ct, cipher.getAuthTag()]).toString('base64url')
}

// usado só em teste (conferência de ida e volta)
function decryptParam(token, key = process.env.INFOSIMPLES_ENC_KEY) {
  const b = Buffer.from(token, 'base64url')
  const salt = b.subarray(0, 16), nonce = b.subarray(16, 28), tag = b.subarray(b.length - 16), ct = b.subarray(28, b.length - 16)
  const k = crypto.pbkdf2Sync(Buffer.from(String(key), 'utf8'), salt, 100000, 32, 'sha256')
  const d = crypto.createDecipheriv('aes-256-gcm', k, nonce)
  d.setAuthTag(tag)
  return Buffer.concat([d.update(ct), d.final()]).toString('utf8')
}

// Certificado A1 → { pkcs12_cert, pkcs12_pass } já criptografados
function certParams(pfxBuffer, password, key) {
  return { pkcs12_cert: encryptParam(pfxBuffer.toString('base64'), key), pkcs12_pass: encryptParam(password, key) }
}

module.exports = { encryptParam, decryptParam, certParams }
