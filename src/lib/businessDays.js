// Cálculo de dias úteis considerando fins de semana e feriados cadastrados.
// Feriados vêm da tabela `holidays` (patch_028) como strings 'YYYY-MM-DD'.
import { supabase } from './supabase.js'

let _cache = null // Set<'YYYY-MM-DD'> — carregado uma vez por sessão de página

export async function getHolidaySet() {
  if (_cache) return _cache
  try {
    const { data } = await supabase.from('holidays').select('data')
    _cache = new Set((data || []).map(h => h.data))
  } catch {
    _cache = new Set()
  }
  return _cache
}

function toKey(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function isBusinessDay(date, holidaySet) {
  const dow = date.getDay()
  if (dow === 0 || dow === 6) return false
  return !holidaySet.has(toKey(date))
}

// Rola a data para frente até cair em dia útil (fim de semana e feriados pulam)
export function adjustToBusinessDay(date, holidaySet) {
  const d = new Date(date)
  while (!isBusinessDay(d, holidaySet)) d.setDate(d.getDate() + 1)
  return d
}
