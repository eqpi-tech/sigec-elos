import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { Spinner } from './ui.jsx'
import MfaGate from './MfaGate.jsx'

const ROLE_HOME = { SUPPLIER:'/fornecedor', BUYER:'/comprador', ADMIN:'/backoffice' }

// MFA desligado SÓ no staging (pedido 28/09, testes com o cliente): a flag
// VITE_MFA_DISABLED existe apenas em [context."staging".environment] do
// netlify.toml. Trava dupla: mesmo que a flag chegue a um build de produção,
// ela é ignorada nos domínios de produção.
const PROD_HOSTS = ['elos.eqpitech.com.br', 'sigec-elos.netlify.app']
const MFA_OFF = import.meta.env.VITE_MFA_DISABLED === 'true'
  && typeof window !== 'undefined' && !PROD_HOSTS.includes(window.location.hostname)

export default function ProtectedRoute({ children, allowedRoles }) {
  const { user, loading } = useAuth()
  if (loading) return <div style={{ display:'flex',justifyContent:'center',alignItems:'center',height:'100vh' }}><Spinner size={48}/></div>
  if (!user) return <Navigate to="/login" replace />
  if (allowedRoles && !allowedRoles.includes(user.role)) return <Navigate to={ROLE_HOME[user.role]||'/login'} replace />
  // MFA obrigatório para todos os perfis (24/09) — o gate cobre toda rota
  // autenticada; rotas públicas e o wizard de cadastro não passam por aqui
  if (MFA_OFF) return children
  return <MfaGate>{children}</MfaGate>
}
