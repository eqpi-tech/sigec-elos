import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import Navbar from './components/Navbar.jsx'
import { Spinner } from './components/ui.jsx'

import Login from './pages/Login.jsx'
import ResetPassword from './pages/ResetPassword.jsx'
import SupplierOnboarding from './pages/supplier/Onboarding.jsx'

import SupplierDashboard  from './pages/supplier/Dashboard.jsx'
import SupplierDocuments  from './pages/supplier/Documents.jsx'
import SupplierPlans      from './pages/supplier/Plans.jsx'
import PlanSuccess        from './pages/supplier/PlanSuccess.jsx'
import SupplierCategories from './pages/supplier/Categories.jsx'

import BuyerMarketplace     from './pages/buyer/Marketplace.jsx'
import BuyerSupplierProfile from './pages/buyer/SupplierProfile.jsx'
import BuyerQuotations      from './pages/buyer/Quotations.jsx'
import BuyerInvitations     from './pages/buyer/Invitations.jsx'

import BackofficeOverview from './pages/backoffice/Overview.jsx'
import BackofficeMetrics  from './pages/backoffice/Metrics.jsx'
import BackofficeCreateUser from './pages/backoffice/CreateUser.jsx'
import { BackofficeQueue, BackofficeAnalysis } from './pages/backoffice/Queue.jsx'
import { BackofficeHomologados } from './pages/backoffice/Homologados.jsx'
import LandingPage from './pages/LandingPage.jsx'

const ROLE_HOME = { SUPPLIER:'/fornecedor', BUYER:'/comprador', ADMIN:'/backoffice' }

function RootRedirect() {
  const { user, loading } = useAuth()
  if (loading) return <div style={{ display:'flex',justifyContent:'center',alignItems:'center',height:'100vh' }}><Spinner size={48}/></div>
  // Usuário não logado → Landing Page (não redireciona para login)
  if (!user) return <LandingPage />
  return <Navigate to={ROLE_HOME[user.role] || '/login'} replace />
}

function AppLayout({ children }) {
  return (
    <div style={{ display:'flex',flexDirection:'column',minHeight:'100vh' }}>
      <Navbar/>
      <main style={{ flex:1 }}>{children}</main>
    </div>
  )
}

function Protect({ roles, children }) {
  return <ProtectedRoute allowedRoles={roles}><AppLayout>{children}</AppLayout></ProtectedRoute>
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login"            element={<Login/>} />
      <Route path="/cadastro"         element={<SupplierOnboarding/>} />
      <Route path="/redefinir-senha"  element={<ResetPassword/>} />
      <Route path="/"                 element={<RootRedirect/>} />

      {/* Supplier */}
      <Route path="/fornecedor"             element={<Protect roles={['SUPPLIER']}><SupplierDashboard/></Protect>} />
      <Route path="/fornecedor/documentos"  element={<Protect roles={['SUPPLIER']}><SupplierDocuments/></Protect>} />
      <Route path="/fornecedor/planos"      element={<Protect roles={['SUPPLIER']}><SupplierPlans/></Protect>} />
      <Route path="/fornecedor/plano-ativo"    element={<Protect roles={['SUPPLIER']}><PlanSuccess/></Protect>} />
      <Route path="/fornecedor/categorias"    element={<Protect roles={['SUPPLIER']}><SupplierCategories/></Protect>} />

      {/* Buyer */}
      <Route path="/comprador"                  element={<Protect roles={['BUYER']}><BuyerMarketplace/></Protect>} />
      <Route path="/comprador/fornecedor/:id"   element={<Protect roles={['BUYER']}><BuyerSupplierProfile/></Protect>} />
      <Route path="/comprador/cotacoes"         element={<Protect roles={['BUYER']}><BuyerQuotations/></Protect>} />
      <Route path="/comprador/convites"         element={<Protect roles={['BUYER']}><BuyerInvitations/></Protect>} />

      {/* Backoffice */}
      <Route path="/backoffice"                 element={<Protect roles={['ADMIN']}><BackofficeOverview/></Protect>} />
      <Route path="/backoffice/fila"            element={<Protect roles={['ADMIN']}><BackofficeQueue/></Protect>} />
      <Route path="/backoffice/analise/:id"     element={<Protect roles={['ADMIN']}><BackofficeAnalysis/></Protect>} />
      <Route path="/backoffice/metricas"        element={<Protect roles={['ADMIN']}><BackofficeMetrics/></Protect>} />
      <Route path="/backoffice/criar-usuario"   element={<Protect roles={['ADMIN']}><BackofficeCreateUser/></Protect>} />
      <Route path="/backoffice/homologados"    element={<Protect roles={['ADMIN']}><BackofficeHomologados/></Protect>} />

      <Route path="*" element={<Navigate to="/" replace/>} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes/>
      </AuthProvider>
    </BrowserRouter>
  )
}
