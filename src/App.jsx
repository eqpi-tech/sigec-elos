import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext.jsx'
import { can } from './lib/permissions.js'
import { hasModule } from './lib/modules.js'
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
import SupplierProcess    from './pages/supplier/Process.jsx'
import SupplierCertificate from './pages/supplier/Certificate.jsx'
import SupplierMyData      from './pages/supplier/MyData.jsx'
import SupplierClientsDirectory from './pages/supplier/ClientsDirectory.jsx'

import BuyerMarketplace     from './pages/buyer/Marketplace.jsx'
import BuyerSupplierProfile from './pages/buyer/SupplierProfile.jsx'
import BuyerInvitations     from './pages/buyer/Invitations.jsx'
import BuyerPlan            from './pages/buyer/BuyerPlan.jsx'

import BackofficeOverview from './pages/backoffice/Overview.jsx'
import BackofficeMetrics  from './pages/backoffice/Metrics.jsx'
import BackofficeCreateUser   from './pages/backoffice/CreateUser.jsx'
import BackofficeCreateClient from './pages/backoffice/CreateClient.jsx'
import { BackofficeQueue, BackofficeAnalysis } from './pages/backoffice/Queue.jsx'
import { BackofficeHomologados } from './pages/backoffice/Homologados.jsx'
import BackofficeProcessSearch  from './pages/backoffice/ProcessSearch.jsx'
import BackofficeQuestionnaires from './pages/backoffice/Questionnaires.jsx'
import BackofficeUsers               from './pages/backoffice/Users.jsx'
import BackofficeClientDocumentFlows from './pages/backoffice/ClientDocumentFlows.jsx'
import BackofficeDocumentCatalog from './pages/backoffice/DocumentCatalog.jsx'
import BackofficeElosPricing from './pages/backoffice/ElosPricing.jsx'
import BackofficeDocumentAnalysis    from './pages/backoffice/DocumentAnalysis.jsx'
import BackofficeClientSettings     from './pages/backoffice/ClientSettings.jsx'
import BackofficeLandingPages        from './pages/backoffice/LandingPages.jsx'
import BackofficeComunicados         from './pages/backoffice/Comunicados.jsx'
import BackofficeFeriados            from './pages/backoffice/Feriados.jsx'
import SupplierQuestionnaire    from './pages/supplier/Questionnaire.jsx'
import SupplierTeam             from './pages/supplier/Team.jsx'
import LandingPage   from './pages/LandingPage.jsx'
import Privacidade   from './pages/Privacidade.jsx'
import ClientPortal  from './pages/ClientPortal.jsx'
import PortalLogin   from './pages/PortalLogin.jsx'
import DemoPage      from './pages/DemoPage.jsx'

import ClientDashboard         from './pages/client/Dashboard.jsx'
import ClientSuppliers         from './pages/client/Suppliers.jsx'
import ClientInvitations       from './pages/client/Invitations.jsx'
import ClientSupplierProcess   from './pages/client/SupplierProcess.jsx'
import ClientSupplierDiscover  from './pages/client/SupplierDiscover.jsx'
import ClientQuestionnaires    from './pages/client/Questionnaires.jsx'
import ClientSettings          from './pages/client/Settings.jsx'
import ClientRFQ               from './pages/client/RFQ.jsx'
import ClientTeam              from './pages/client/Team.jsx'
import BackofficeUserProfiles  from './pages/backoffice/UserProfiles.jsx'

const ROLE_HOME = { SUPPLIER:'/fornecedor', BUYER:'/comprador', ADMIN:'/backoffice', CLIENT:'/cliente' }

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

function Protect({ roles, perm, module, children }) {
  return <ProtectedRoute allowedRoles={roles}><AppLayout><PermGate perm={perm} module={module}>{children}</PermGate></AppLayout></ProtectedRoute>
}

// Gates: permissão granular (patch_030) + módulos do perfil (patch_038)
function PermGate({ perm, module, children }) {
  const { user } = useAuth()
  if (perm && !can(user, perm)) return <Navigate to={ROLE_HOME[user?.role] || '/'} replace/>
  if (module && !hasModule(user, module)) return <Navigate to={ROLE_HOME[user?.role] || '/'} replace/>
  return children
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/privacidade"       element={<Privacidade/>} />
      <Route path="/login"            element={<Login/>} />
      <Route path="/cadastro"         element={<SupplierOnboarding/>} />
      <Route path="/redefinir-senha"  element={<ResetPassword/>} />
      <Route path="/portal/:slug"       element={<ClientPortal/>} />
      <Route path="/portal/:slug/login" element={<PortalLogin/>} />
      <Route path="/demo"             element={<DemoPage/>} />
      <Route path="/"                 element={<RootRedirect/>} />

      {/* Supplier */}
      <Route path="/fornecedor"             element={<Protect roles={['SUPPLIER']}><SupplierDashboard/></Protect>} />
      <Route path="/fornecedor/documentos"  element={<Protect roles={['SUPPLIER']} module="documentos"><SupplierDocuments/></Protect>} />
      <Route path="/fornecedor/planos"      element={<Protect roles={['SUPPLIER']} module="plano"><SupplierPlans/></Protect>} />
      <Route path="/fornecedor/plano-ativo"    element={<Protect roles={['SUPPLIER']}><PlanSuccess/></Protect>} />
      <Route path="/fornecedor/categorias"    element={<Protect roles={['SUPPLIER']} module="categorias"><SupplierCategories/></Protect>} />
      <Route path="/fornecedor/questionario"  element={<Protect roles={['SUPPLIER']} module="questionario"><SupplierQuestionnaire/></Protect>} />
      <Route path="/fornecedor/processo/:sealId" element={<Protect roles={['SUPPLIER']}><SupplierProcess/></Protect>} />
      {/* Certificado: rota standalone (sem navbar) para impressão limpa */}
      <Route path="/fornecedor/certificado/:sealId" element={<ProtectedRoute allowedRoles={['SUPPLIER','ADMIN']}><SupplierCertificate/></ProtectedRoute>} />
      <Route path="/fornecedor/equipe"           element={<Protect roles={['SUPPLIER']} module="equipe"><SupplierTeam/></Protect>} />
      <Route path="/fornecedor/dados"            element={<Protect roles={['SUPPLIER']} module="meus_dados"><SupplierMyData/></Protect>} />
      <Route path="/fornecedor/clientes"         element={<Protect roles={['SUPPLIER']} module="clientes_elos"><SupplierClientsDirectory/></Protect>} />

      {/* Buyer */}
      <Route path="/comprador"                  element={<Protect roles={['BUYER']}><BuyerMarketplace/></Protect>} />
      <Route path="/comprador/fornecedor/:id"   element={<Protect roles={['BUYER']}><BuyerSupplierProfile/></Protect>} />
      <Route path="/comprador/convites"         element={<Protect roles={['BUYER']}><BuyerInvitations/></Protect>} />
      <Route path="/comprador/plano"            element={<Protect roles={['BUYER']}><BuyerPlan/></Protect>} />

      {/* Backoffice */}
      <Route path="/backoffice"                 element={<Protect roles={['ADMIN']}><BackofficeOverview/></Protect>} />
      <Route path="/backoffice/fila"            element={<Protect roles={['ADMIN']}><BackofficeQueue/></Protect>} />
      <Route path="/backoffice/analise/:id"     element={<Protect roles={['ADMIN']}><BackofficeAnalysis/></Protect>} />
      <Route path="/backoffice/metricas"        element={<Protect roles={['ADMIN']}><BackofficeMetrics/></Protect>} />
      <Route path="/backoffice/criar-usuario"   element={<Protect roles={['ADMIN']} perm="manage_users"><BackofficeCreateUser/></Protect>} />
      <Route path="/backoffice/criar-cliente"  element={<Protect roles={['ADMIN']} perm="manage_clients"><BackofficeCreateClient/></Protect>} />
      <Route path="/backoffice/homologados"     element={<Protect roles={['ADMIN']}><BackofficeHomologados/></Protect>} />
      <Route path="/backoffice/processos"        element={<Protect roles={['ADMIN']}><BackofficeProcessSearch/></Protect>} />
      <Route path="/backoffice/questionarios"   element={<Protect roles={['ADMIN']}><BackofficeQuestionnaires/></Protect>} />
      <Route path="/backoffice/usuarios"        element={<Protect roles={['ADMIN']} perm="manage_users"><BackofficeUsers/></Protect>} />
      <Route path="/backoffice/perfis"          element={<Protect roles={['ADMIN']} perm="manage_users"><BackofficeUserProfiles/></Protect>} />
      <Route path="/backoffice/fluxo-documentos"    element={<Protect roles={['ADMIN']} perm="manage_clients"><BackofficeClientDocumentFlows/></Protect>} />
      <Route path="/backoffice/catalogo-documentos" element={<Protect roles={['ADMIN']}><BackofficeDocumentCatalog/></Protect>} />
      <Route path="/backoffice/precos"              element={<Protect roles={['ADMIN']}><BackofficeElosPricing/></Protect>} />
      <Route path="/backoffice/analise-documentos"  element={<Protect roles={['ADMIN']}><BackofficeDocumentAnalysis/></Protect>} />
      <Route path="/backoffice/clientes"            element={<Protect roles={['ADMIN']} perm="manage_clients"><BackofficeClientSettings/></Protect>} />
      <Route path="/backoffice/landing-pages"   element={<Protect roles={['ADMIN']} perm="manage_clients"><BackofficeLandingPages/></Protect>} />
      <Route path="/backoffice/comunicados"     element={<Protect roles={['ADMIN']} perm="manage_comunicados"><BackofficeComunicados/></Protect>} />
      <Route path="/backoffice/feriados"        element={<Protect roles={['ADMIN']}><BackofficeFeriados/></Protect>} />

      {/* Cliente (HOC) */}
      <Route path="/cliente"                                element={<Protect roles={['CLIENT']}><ClientDashboard/></Protect>} />
      <Route path="/cliente/fornecedores"               element={<Protect roles={['CLIENT']} module="fornecedores"><ClientSuppliers/></Protect>} />
      <Route path="/cliente/fornecedor/:supplierId"     element={<Protect roles={['CLIENT']} module="fornecedores"><ClientSupplierProcess/></Protect>} />
      <Route path="/cliente/perfil-fornecedor/:id"      element={<Protect roles={['CLIENT']} module="fornecedores"><ClientSupplierDiscover/></Protect>} />
      <Route path="/cliente/convites"                 element={<Protect roles={['CLIENT']} module="convites"><ClientInvitations/></Protect>} />
      <Route path="/cliente/questionarios"            element={<Protect roles={['CLIENT']} module="questionarios"><ClientQuestionnaires/></Protect>} />
      <Route path="/cliente/configuracoes"            element={<Protect roles={['CLIENT']} module="configuracoes"><ClientSettings/></Protect>} />
      <Route path="/cliente/rfq"                      element={<Protect roles={['CLIENT']} module="rfq"><ClientRFQ/></Protect>} />
      <Route path="/cliente/equipe"                   element={<Protect roles={['CLIENT']} module="equipe"><ClientTeam/></Protect>} />

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
