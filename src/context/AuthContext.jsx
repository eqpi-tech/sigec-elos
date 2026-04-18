import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [loading, setLoading] = useState(true)

  const buildUser = (authUser, profile) => {
    if (!authUser || !profile) return null
    return {
      id:         authUser.id,
      email:      authUser.email,
      role:       profile.role,
      name:       profile.name || authUser.email,
      supplierId: profile.supplier_id,
      buyerId:    profile.buyer_id,
    }
  }

  const [roleOptions, setRoleOptions] = useState([]) // para multi-perfil
  const [activeRole, setActiveRole]   = useState(null)

  const switchRole = (role) => {
    const opt = roleOptions.find(r => r.role === role)
    if (!opt) return
    setActiveRole(role)
    setUser(prev => ({ ...prev, role, supplier_id: opt.supplier_id, supplierId: opt.supplier_id, buyer_id: opt.buyer_id, buyerId: opt.buyer_id }))
    localStorage.setItem('elos_active_role', role)
  }

  const fetchProfile = async (authUser) => {
    if (!authUser) { setUser(null); setLoading(false); return }
    try {
      // Busca todos os perfis do usuário (tabela user_roles — multi-perfil)
      const { data: roles } = await supabase
        .from('user_roles')
        .select('role, supplier_id, buyer_id, is_primary')
        .eq('user_id', authUser.id)

      if (roles && roles.length > 0) {
        setRoleOptions(roles)
        // Decide qual role ativar: salva preferência no localStorage
        const saved = localStorage.getItem('elos_active_role')
        const preferred = roles.find(r => r.role === saved) || roles.find(r => r.is_primary) || roles[0]
        setActiveRole(preferred.role)
        // Busca profile base
        const { data: profile } = await supabase
          .from('profiles').select('*').eq('id', authUser.id).maybeSingle()
        setUser(buildUser(authUser, { ...profile, role: preferred.role, supplier_id: preferred.supplier_id, buyer_id: preferred.buyer_id }))
      } else {
        // Fallback: usa profiles legacy
        const { data: profile } = await supabase
          .from('profiles').select('*').eq('id', authUser.id).maybeSingle()
        setUser(buildUser(authUser, profile))
      }
    } catch (err) {
      console.warn('fetchProfile error:', err?.message)
      setUser(null)
    } finally { setLoading(false) }
  }

  useEffect(() => {
    // Sessão inicial
    supabase.auth.getSession().then(({ data: { session } }) => {
      fetchProfile(session?.user || null)
    })

    // FIX: setLoading(true) ANTES de fetchProfile para que RootRedirect
    // mostre o spinner enquanto o perfil carrega — evita blank page pós-login
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setLoading(true)
      fetchProfile(session?.user || null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const login = async ({ email, password }) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new Error(error.message)
    return data.user
  }

  const signup = async ({ email, password, role, name }) => {
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { role, name } },
    })
    if (error) throw new Error(error.message)
    return data.user
  }

  const logout = async () => {
    await supabase.auth.signOut()
    setUser(null)
  }

  const reloadProfile = async () => {
    setLoading(true)
    const { data: { user: authUser } } = await supabase.auth.getUser()
    await fetchProfile(authUser)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout, reloadProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
