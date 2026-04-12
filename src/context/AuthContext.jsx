import { createContext, useContext, useState, useEffect } from 'react'
import { authApi } from '../services/mockApi.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (authApi.isAuthenticated()) setUser(authApi.me())
    setLoading(false)
  }, [])

  const login = async (credentials) => {
    const { user } = await authApi.login(credentials)
    setUser(user)
    return user
  }

  const logout = () => {
    authApi.logout()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
