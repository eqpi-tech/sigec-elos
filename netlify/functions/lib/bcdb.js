// lib/bcdb.js — client Supabase service_role para os conectores local_db
// (listas ref_* têm RLS; escrita/consulta dos conectores é sempre server-side)
const { createClient } = require('@supabase/supabase-js')

let _client = null
function getAdminClient() {
  if (!_client) {
    _client = createClient(
      process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )
  }
  return _client
}

module.exports = { getAdminClient }
