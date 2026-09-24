import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { Spinner } from './ui.jsx'
import MfaGate from './MfaGate.jsx'

const ROLE_HOME = { SUPPLIER:'/fornecedor', BUYER:'/comprador', ADMIN:'/backoffice' }

export default function ProtectedRoute({ children, allowedRoles }) {
  const { user, loading } = useAuth()
  if (loading) return <div style={{ display:'flex',justifyContent:'center',alignItems:'center',height:'100vh' }}><Spinner size={48}/></div>
  if (!user) return <Navigate to="/login" replace />
  if (allowedRoles && !allowedRoles.includes(user.role)) return <Navigate to={ROLE_HOME[user.role]||'/login'} replace />
  // MFA obrigatório para todos os perfis (24/09) — o gate cobre toda rota
  // autenticada; rotas públicas e o wizard de cadastro não passam por aqui
  return <MfaGate>{children}</MfaGate>
}
