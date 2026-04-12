import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import Navbar from './components/Navbar.jsx'

// Pages
import Login from './pages/Login.jsx'

// Supplier
import SupplierDashboard from './pages/supplier/Dashboard.jsx'
import SupplierDocuments from './pages/supplier/Documents.jsx'
import SupplierPlans     from './pages/supplier/Plans.jsx'

// Buyer
import BuyerMarketplace    from './pages/buyer/Marketplace.jsx'
import BuyerSupplierProfile from './pages/buyer/SupplierProfile.jsx'
import BuyerQuotations     from './pages/buyer/Quotations.jsx'

// Backoffice
import BackofficeOverview  from './pages/backoffice/Overview.jsx'
import BackofficeMetrics   from './pages/backoffice/Metrics.jsx'
import { BackofficeQueue, BackofficeAnalysis } from './pages/backoffice/Queue.jsx'

const ROLE_HOME = { SUPPLIER:'/fornecedor', BUYER:'/comprador', ADMIN:'/backoffice' }

function RootRedirect() {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  return <Navigate to={ROLE_HOME[user.role] || '/login'} replace />
}

function AppLayout({ children }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100vh' }}>
      <Navbar />
      <main style={{ flex:1 }}>{children}</main>
    </div>
  )
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<RootRedirect />} />

      {/* Supplier */}
      <Route path="/fornecedor" element={
        <ProtectedRoute allowedRoles={['SUPPLIER']}>
          <AppLayout><SupplierDashboard /></AppLayout>
        </ProtectedRoute>
      } />
      <Route path="/fornecedor/documentos" element={
        <ProtectedRoute allowedRoles={['SUPPLIER']}>
          <AppLayout><SupplierDocuments /></AppLayout>
        </ProtectedRoute>
      } />
      <Route path="/fornecedor/planos" element={
        <ProtectedRoute allowedRoles={['SUPPLIER']}>
          <AppLayout><SupplierPlans /></AppLayout>
        </ProtectedRoute>
      } />

      {/* Buyer */}
      <Route path="/comprador" element={
        <ProtectedRoute allowedRoles={['BUYER']}>
          <AppLayout><BuyerMarketplace /></AppLayout>
        </ProtectedRoute>
      } />
      <Route path="/comprador/fornecedor/:id" element={
        <ProtectedRoute allowedRoles={['BUYER']}>
          <AppLayout><BuyerSupplierProfile /></AppLayout>
        </ProtectedRoute>
      } />
      <Route path="/comprador/cotacoes" element={
        <ProtectedRoute allowedRoles={['BUYER']}>
          <AppLayout><BuyerQuotations /></AppLayout>
        </ProtectedRoute>
      } />

      {/* Backoffice */}
      <Route path="/backoffice" element={
        <ProtectedRoute allowedRoles={['ADMIN']}>
          <AppLayout><BackofficeOverview /></AppLayout>
        </ProtectedRoute>
      } />
      <Route path="/backoffice/fila" element={
        <ProtectedRoute allowedRoles={['ADMIN']}>
          <AppLayout><BackofficeQueue /></AppLayout>
        </ProtectedRoute>
      } />
      <Route path="/backoffice/analise/:id" element={
        <ProtectedRoute allowedRoles={['ADMIN']}>
          <AppLayout><BackofficeAnalysis /></AppLayout>
        </ProtectedRoute>
      } />
      <Route path="/backoffice/metricas" element={
        <ProtectedRoute allowedRoles={['ADMIN']}>
          <AppLayout><BackofficeMetrics /></AppLayout>
        </ProtectedRoute>
      } />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
