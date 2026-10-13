// netlify/functions/help-docs.js
// Página Ajuda (13/10): links temporários dos manuais em PDF, só para quem está
// logado. Os PDFs ficam no bucket PRIVADO "manuais" (docs/manuais/pdf/*.pdf).
// Fornecedor, Cliente e Comprador para todos; Backoffice só para ADMIN.
// Sem login → 401 (o envio dos comunicados 3 e 4 confere isso para saber se
// a página está no ar — scripts/migracao_hoc/enviar_comunicado.py).

const { createClient } = require('@supabase/supabase-js')

const MANUAIS = [
  { key: 'fornecedor', title: 'Manual do Fornecedor', desc: 'Cadastro, documentos, processos, renovação, cotações e equipe' },
  { key: 'cliente',    title: 'Manual do Cliente',    desc: 'Painel, fornecedores, convites, carta de exceção, relatórios e equipe' },
  { key: 'comprador',  title: 'Manual do Comprador',  desc: 'Marketplace, ficha do fornecedor, convites, planos e cotações' },
  { key: 'backoffice', title: 'Manual do Backoffice', desc: 'Uso interno da equipe EQPI', admin: true },
]

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  const auth = event.headers.authorization || event.headers.Authorization || ''
  if (!auth.startsWith('Bearer ')) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Faça login para ver os manuais' }) }
  try {
    const admin = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    const { data: { user }, error } = await admin.auth.getUser(auth.slice(7))
    if (error || !user) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Sessão expirada' }) }
    const { data: roles } = await admin.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'ADMIN').limit(1)
    const isAdmin = !!roles?.length
    const lista = MANUAIS.filter(m => !m.admin || isAdmin)
    const out = []
    for (const m of lista) {
      const { data: s } = await admin.storage.from('manuais').createSignedUrl(`manual-${m.key}.pdf`, 3600, { download: false })
      out.push({ key: m.key, title: m.title, desc: m.desc, url: s?.signedUrl || null })
    }
    return { statusCode: 200, headers, body: JSON.stringify({ manuais: out }) }
  } catch (e) {
    console.error('help-docs:', e)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Não foi possível carregar os manuais agora' }) }
  }
}
