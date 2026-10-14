import { supabase } from './supabase.js'
import { supplierHeader } from './activeSupplier.js'

// Chamada autenticada às Netlify functions. Garante um token válido antes de
// enviar (renova se vence em menos de 60 s) e, se o servidor recusar a sessão
// (401), renova e tenta mais uma vez. Tela aberta por mais de 1 h mandava o
// token vencido e a function respondia "Token inválido" (28/09, carta de
// exceção da SALUMED).
export async function authFetch(url, init = {}) {
  const token = async (forcar) => {
    let { data: { session } } = await supabase.auth.getSession()
    if (forcar || !session || (session.expires_at && session.expires_at * 1000 < Date.now() + 60000)) {
      const { data, error } = await supabase.auth.refreshSession()
      if (!error && data?.session) session = data.session
    }
    return session?.access_token || ''
  }
  // multiempresa (patch_138): a empresa ativa vai junto; o servidor confere o vínculo
  const call = async (tk) => fetch(url, { ...init, headers: { ...supplierHeader(), ...(init.headers || {}), Authorization: `Bearer ${tk}` } })
  let res = await call(await token(false))
  if (res.status === 401) res = await call(await token(true))
  return res
}
