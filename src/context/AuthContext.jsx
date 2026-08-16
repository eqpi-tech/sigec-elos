import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [loading, setLoading] = useState(true)

  const buildUser = (authUser, profile) => {
    if (!authUser || !profile) return null
    return {
      id:                  authUser.id,
      email:               authUser.email,
      role:                profile.role,
      name:                profile.name || authUser.email,
      supplierId:          profile.supplier_id,
      buyerId:             profile.buyer_id,
      clientId:            profile.client_id,
      isPrimary:           profile.is_primary !== false,
      // Perfil de acesso granular (patch_030): full | analyst | readonly
      accessProfile:       profile.access_profile || 'full',
      // Perfil de módulos (patch_038): null = acesso total (fallback)
      modules:             profile.modules ?? null,
      moduleProfileName:   profile.module_profile_name ?? null,
      // Plano do comprador (free → padrão, pro → assinante)
      buyerPlan:           profile.buyer_plan || 'free',
      buyerPlanExpiresAt:  profile.buyer_plan_expires_at || null,
    }
  }

  const [roleOptions, setRoleOptions] = useState([]) // para multi-perfil
  const [activeRole, setActiveRole]   = useState(null)

  const switchRole = (role) => {
    const opt = roleOptions.find(r => r.role === role)
    if (!opt) return
    setActiveRole(role)
    setUser(prev => ({
      ...prev,
      role,
      supplier_id: opt.supplier_id, supplierId: opt.supplier_id,
      buyer_id:    opt.buyer_id,    buyerId:    opt.buyer_id,
      client_id:   opt.client_id,   clientId:   opt.client_id,
      accessProfile: opt.access_profile || 'full',
      modules:           opt._modules ?? null,
      moduleProfileName: opt._profile_name ?? null,
    }))
    localStorage.setItem('elos_active_role', role)
  }

  const fetchProfile = async (authUser) => {
    if (!authUser) { setUser(null); setLoading(false); return }
    try {
      // Busca todos os perfis do usuário (tabela user_roles — multi-perfil)
      // Se a tabela não existir ainda (patch_003 pendente), faz fallback para profiles
      let roles = null
      try {
        const { data: rolesData, error: rolesErr } = await supabase
          .from('user_roles')
          .select('*')  // tolerante a colunas novas (ex.: access_profile do patch_030)
          .eq('user_id', authUser.id)
        if (!rolesErr) roles = rolesData
      } catch {}

      if (roles && roles.length > 0) {
        // Perfis de módulos (patch_038) de todas as roles — para o switchRole
        // trocar de módulos sem novo fetch
        const profileIds = [...new Set(roles.map(r => r.access_profile_id).filter(Boolean))]
        let profileMap = {}
        if (profileIds.length) {
          try {
            const { data: aps } = await supabase
              .from('access_profiles').select('id, name, modules').in('id', profileIds)
            ;(aps || []).forEach(p => { profileMap[p.id] = p })
          } catch { /* tabela ausente pré-patch_038 — segue com acesso total */ }
        }
        const withModules = roles.map(r => ({
          ...r,
          _modules:      r.access_profile_id ? (profileMap[r.access_profile_id]?.modules ?? null) : null,
          _profile_name: r.access_profile_id ? (profileMap[r.access_profile_id]?.name ?? null) : null,
        }))
        setRoleOptions(withModules)
        // Decide qual role ativar: salva preferência no localStorage
        const saved = localStorage.getItem('elos_active_role')
        const preferred = withModules.find(r => r.role === saved) || withModules.find(r => r.is_primary) || withModules[0]
        setActiveRole(preferred.role)
        // Busca profile base
        const { data: profile } = await supabase
          .from('profiles').select('*').eq('id', authUser.id).maybeSingle()
        setUser(buildUser(authUser, {
          ...profile,
          role:                  preferred.role,
          supplier_id:           preferred.supplier_id,
          buyer_id:              preferred.buyer_id,
          client_id:             preferred.client_id,
          is_primary:            preferred.is_primary,
          access_profile:        preferred.access_profile,
          modules:               preferred._modules,
          module_profile_name:   preferred._profile_name,
          buyer_plan:            preferred.buyer_plan,
          buyer_plan_expires_at: preferred.buyer_plan_expires_at,
        }))
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
    <AuthContext.Provider value={{ user, loading, login, signup, logout, reloadProfile, roleOptions, activeRole, switchRole }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
