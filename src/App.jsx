import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { paymentsApi } from './services/api.js'
import { AuthProvider, useAuth } from './context/AuthContext.jsx'
import { can } from './lib/permissions.js'
import { hasModule } from './lib/modules.js'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import Navbar from './components/Navbar.jsx'
import OnboardingTour from './components/OnboardingTour.jsx'
import { Spinner } from './components/ui.jsx'

import Login from './pages/Login.jsx'
import ResetPassword from './pages/ResetPassword.jsx'
import CreatePassword from './pages/CreatePassword.jsx'
import SupplierOnboarding from './pages/supplier/Onboarding.jsx'

import SupplierDashboard  from './pages/supplier/Dashboard.jsx'
import SupplierDocuments  from './pages/supplier/Documents.jsx'
import SupplierPlans      from './pages/supplier/Plans.jsx'
import PlanSuccess        from './pages/supplier/PlanSuccess.jsx'
import SupplierPayment    from './pages/supplier/Payment.jsx'
import SupplierCategories from './pages/supplier/Categories.jsx'
import SupplierProcess    from './pages/supplier/Process.jsx'
import SupplierCertificate from './pages/supplier/Certificate.jsx'
import SupplierMyData      from './pages/supplier/MyData.jsx'
import SupplierClientsDirectory from './pages/supplier/ClientsDirectory.jsx'

import BuyerMarketplace     from './pages/buyer/Marketplace.jsx'
import BuyerSupplierProfile from './pages/buyer/SupplierProfile.jsx'
import BuyerInvitations     from './pages/buyer/Invitations.jsx'
import BuyerPlan            from './pages/buyer/BuyerPlan.jsx'
import BuyerQuotations      from './pages/buyer/Quotations.jsx'

import BackofficeOverview from './pages/backoffice/Overview.jsx'
import BackofficeMetrics  from './pages/backoffice/Metrics.jsx'
import BackofficeReports  from './pages/backoffice/Reports.jsx'
import BackofficeBcReport from './pages/backoffice/BcReport.jsx'
import BackofficeCreateUser   from './pages/backoffice/CreateUser.jsx'
import BackofficeCreateClient from './pages/backoffice/CreateClient.jsx'
import { BackofficeQueue, BackofficeAnalysis } from './pages/backoffice/Queue.jsx'
import { BackofficeHomologados } from './pages/backoffice/Homologados.jsx'
import BackofficeProcessSearch  from './pages/backoffice/ProcessSearch.jsx'
import BackofficeInvitations    from './pages/backoffice/Invitations.jsx'
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
import SupplierQuotations      from './pages/supplier/Quotations.jsx'
import LandingPage   from './pages/LandingPage.jsx'
import Privacidade   from './pages/Privacidade.jsx'
import VerifyCertificate from './pages/VerifyCertificate.jsx'
import ClientPortal  from './pages/ClientPortal.jsx'
import PortalLogin   from './pages/PortalLogin.jsx'
import DemoPage      from './pages/DemoPage.jsx'

import ClientDashboard         from './pages/client/Dashboard.jsx'
import ClientSuppliers         from './pages/client/Suppliers.jsx'
import ClientInvitations       from './pages/client/Invitations.jsx'
import ClientSupplierProcess   from './pages/client/SupplierProcess.jsx'
import ClientSupplierDiscover  from './pages/client/SupplierDiscover.jsx'
import ClientQuestionnaires    from './pages/client/Questionnaires.jsx'
import ClientReports           from './pages/client/Reports.jsx'
import ClientCompliance        from './pages/client/Compliance.jsx'
import ClientTermsPage         from './pages/client/Terms.jsx'
import BackofficeClientTerms   from './pages/backoffice/ClientTerms.jsx'
import ClientSettings          from './pages/client/Settings.jsx'
import ClientRFQ               from './pages/client/RFQ.jsx'
import ClientTeam              from './pages/client/Team.jsx'
import BackofficeUserProfiles  from './pages/backoffice/UserProfiles.jsx'
import Account                 from './pages/Account.jsx'
import Help                    from './pages/Help.jsx'

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
      <OnboardingTour/>
    </div>
  )
}

function Protect({ roles, perm, module, children }) {
  return <ProtectedRoute allowedRoles={roles}><AppLayout><PermGate perm={perm} module={module}><PaymentGate><TermsGate>{children}</TermsGate></PaymentGate></PermGate></AppLayout></ProtectedRoute>
}

// Trava de pagamento (01/10, patch_112): fornecedor sem processo liberado
// (pago, subsidiado, HOC ou homologado) só acessa pagamento, planos e Minha
// Conta. O banco também trava o envio de documentos (RLS) e o selo.
const PAY_FREE = ['/fornecedor/pagamento', '/fornecedor/planos', '/fornecedor/plano-ativo', '/conta', '/ajuda']
function PaymentGate({ children }) {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const sid = user?.role === 'SUPPLIER' ? (user.supplierId || user.supplier_id) : null
  const [st, setSt] = useState(null)
  useEffect(() => {
    if (!sid) return
    paymentsApi.paymentStatus(sid).then(setSt).catch(() => setSt({ released: true }))
  }, [sid, pathname])
  if (!sid || PAY_FREE.some(p => pathname.startsWith(p))) return children
  if (!st) return null
  // pré-cadastro (patch_126): sem processo — painel, questionário, dados,
  // equipe e conta; documentos e demais telas de processo voltam ao painel
  if (!st.released && st.preCadastro) {
    const PRE_FREE = ['/fornecedor/questionario', '/fornecedor/dados', '/fornecedor/equipe', '/fornecedor/clientes']
    if (pathname === '/fornecedor' || PRE_FREE.some(p => pathname.startsWith(p))) return children
    return <Navigate to="/fornecedor" replace/>
  }
  if (!st.released) return <Navigate to="/fornecedor/pagamento" replace/>
  return children
}

// Termos do cliente no 1º acesso (29/10, go-live): empresas pré-cadastradas
// pela EQPI não passaram pela etapa de termos do cadastro. Uma vez por login —
// o aceite vale para todas as empresas dele com o cliente. O Operacional não
// aceita em nome da empresa (o servidor não devolve pendência para ele).
// Falha ao carregar nunca bloqueia o uso.
const TERMS_FREE = ['/conta', '/ajuda']
function TermsGate({ children }) {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const ativo = user?.role === 'SUPPLIER' && !TERMS_FREE.some(p => pathname.startsWith(p))
  const [pend, setPend] = useState(null)
  const [ok, setOk] = useState({})
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  useEffect(() => {
    if (user?.role !== 'SUPPLIER') return
    paymentsApi.pendingTerms().then(setPend).catch(() => setPend([]))
  }, [user?.id])
  if (!ativo || !pend?.length) return children
  const t = pend[0]
  const todos = t.itens.every(it => ok[it.id])
  const aceitar = async () => {
    setSalvando(true); setErro('')
    try {
      await paymentsApi.acceptTerms(t.client_id, t.itens.map(it => ({ item_id: it.id, version: it.version })))
      setOk({}); setPend(p => p.slice(1))
    } catch (e) { setErro(e.message) } finally { setSalvando(false) }
  }
  return (
    <div style={{ maxWidth:720, margin:'32px auto', padding:'0 16px' }}>
      <div style={{ background:'#fff', borderRadius:16, border:'1px solid #e2e4ef', padding:'28px 26px', boxShadow:'0 4px 20px rgba(46,49,146,.06)' }}>
        <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:20, color:'#1a1c5e', marginBottom:6 }}>Termos da {t.cliente}</div>
        <div style={{ fontSize:14, color:'#4b5563', lineHeight:1.6, marginBottom:18 }}>
          Antes de começar, leia e aceite os termos da <strong>{t.cliente}</strong> para a homologação.
          {t.empresas > 1 && <> O aceite vale para as <strong>{t.empresas} empresas</strong> do seu acesso.</>}
        </div>
        {t.itens.map(it => (
          <label key={it.id} style={{ display:'flex', alignItems:'flex-start', gap:10, cursor:'pointer', marginBottom:10, padding:'12px', background: ok[it.id] ? 'rgba(34,197,94,.05)' : 'rgba(46,49,146,.04)', borderRadius:10, border:`1px solid ${ok[it.id]?'#22c55e':'#e2e4ef'}` }}>
            <input type="checkbox" checked={!!ok[it.id]} onChange={e => setOk(p => ({ ...p, [it.id]: e.target.checked }))} style={{ marginTop:2, accentColor:'#2E3192' }}/>
            <span style={{ fontSize:13, color:'#374151', flex:1 }}>
              Li e aceito o documento <strong>{it.title}</strong>
              {it.kind === 'DOCUMENT' && it.url && (
                <> — <a href={it.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ color:'#2E3192', fontWeight:700 }}>📄 visualizar PDF</a></>
              )}
              {it.kind === 'TEXT' && it.content && (
                <details style={{ marginTop:6 }} onClick={e => e.stopPropagation()}>
                  <summary style={{ fontSize:12, color:'#2E3192', fontWeight:700, cursor:'pointer' }}>ler o texto completo</summary>
                  <pre style={{ fontSize:12, color:'#374151', lineHeight:1.6, whiteSpace:'pre-wrap', fontFamily:'DM Sans,sans-serif', maxHeight:180, overflowY:'auto', background:'#fff', border:'1px solid #eef0f6', borderRadius:8, padding:10, marginTop:6 }}>{it.content}</pre>
                </details>
              )}
            </span>
          </label>
        ))}
        {erro && <div style={{ color:'#b91c1c', fontSize:13, margin:'8px 0' }}>{erro}</div>}
        <button disabled={!todos || salvando} onClick={aceitar}
          style={{ marginTop:12, width:'100%', padding:'13px', borderRadius:10, border:'none', background: todos ? '#F47E2F' : '#e5e7eb', color: todos ? '#fff' : '#9ca3af', fontWeight:700, fontSize:15, cursor: todos ? 'pointer' : 'not-allowed' }}>
          {salvando ? 'Registrando…' : 'Aceitar e continuar'}
        </button>
      </div>
    </div>
  )
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
      <Route path="/verificar"         element={<VerifyCertificate/>} />
      <Route path="/login"            element={<Login/>} />
      <Route path="/cadastro"         element={<SupplierOnboarding/>} />
      <Route path="/redefinir-senha"  element={<ResetPassword/>} />
      <Route path="/criar-senha"      element={<CreatePassword/>} />
      <Route path="/portal/:slug"       element={<ClientPortal/>} />
      <Route path="/portal/:slug/login" element={<PortalLogin/>} />
      <Route path="/demo"             element={<DemoPage/>} />
      <Route path="/"                 element={<RootRedirect/>} />

      {/* Supplier */}
      <Route path="/fornecedor"             element={<Protect roles={['SUPPLIER']}><SupplierDashboard/></Protect>} />
      <Route path="/fornecedor/documentos"  element={<Protect roles={['SUPPLIER']} module="documentos"><SupplierDocuments/></Protect>} />
      <Route path="/fornecedor/planos"      element={<Protect roles={['SUPPLIER']} module="plano"><SupplierPlans/></Protect>} />
      <Route path="/fornecedor/plano-ativo"    element={<Protect roles={['SUPPLIER']}><PlanSuccess/></Protect>} />
      <Route path="/fornecedor/pagamento"      element={<Protect roles={['SUPPLIER']}><SupplierPayment/></Protect>} />
      <Route path="/fornecedor/categorias"    element={<Protect roles={['SUPPLIER']} module="categorias"><SupplierCategories/></Protect>} />
      <Route path="/fornecedor/questionario"  element={<Protect roles={['SUPPLIER']} module="questionario"><SupplierQuestionnaire/></Protect>} />
      <Route path="/fornecedor/processo/:sealId" element={<Protect roles={['SUPPLIER']}><SupplierProcess/></Protect>} />
      {/* Certificado: rota standalone (sem navbar) para impressão limpa */}
      <Route path="/fornecedor/certificado/:sealId" element={<ProtectedRoute allowedRoles={['SUPPLIER','ADMIN']}><SupplierCertificate/></ProtectedRoute>} />
      <Route path="/cliente/certificado/:sealId" element={<ProtectedRoute allowedRoles={['CLIENT']}><SupplierCertificate/></ProtectedRoute>} />
      <Route path="/fornecedor/equipe"           element={<Protect roles={['SUPPLIER']} module="equipe"><SupplierTeam/></Protect>} />
      <Route path="/fornecedor/dados"            element={<Protect roles={['SUPPLIER']} module="meus_dados"><SupplierMyData/></Protect>} />
      <Route path="/fornecedor/clientes"         element={<Protect roles={['SUPPLIER']} module="clientes_elos"><SupplierClientsDirectory/></Protect>} />
      <Route path="/fornecedor/cotacoes"         element={<Protect roles={['SUPPLIER']} module="dashboard"><SupplierQuotations/></Protect>} />

      {/* Buyer */}
      <Route path="/comprador"                  element={<Protect roles={['BUYER']}><BuyerMarketplace/></Protect>} />
      <Route path="/comprador/fornecedor/:id"   element={<Protect roles={['BUYER']}><BuyerSupplierProfile/></Protect>} />
      <Route path="/comprador/convites"         element={<Protect roles={['BUYER']}><BuyerInvitations/></Protect>} />
      <Route path="/comprador/plano"            element={<Protect roles={['BUYER']}><BuyerPlan/></Protect>} />
      {/* cotações do Comprador Pro e respostas dos fornecedores (patch_131) */}
      <Route path="/comprador/cotacoes"         element={<Protect roles={['BUYER']}><BuyerQuotations/></Protect>} />

      {/* Backoffice */}
      {/* Minha Conta — todos os papéis (aberta pelo avatar do Navbar) */}
      <Route path="/conta" element={<Protect roles={['SUPPLIER','BUYER','CLIENT','ADMIN']}><Account/></Protect>} />
      {/* Ajuda — manuais (só logado) e canais de suporte (13/10) */}
      <Route path="/ajuda" element={<Protect roles={['SUPPLIER','BUYER','CLIENT','ADMIN']}><Help/></Protect>} />

      <Route path="/backoffice"                 element={<Protect roles={['ADMIN']}><BackofficeOverview/></Protect>} />
      <Route path="/backoffice/fila"            element={<Protect roles={['ADMIN']}><BackofficeQueue/></Protect>} />
      <Route path="/backoffice/analise/:id"     element={<Protect roles={['ADMIN']}><BackofficeAnalysis/></Protect>} />
      <Route path="/backoffice/metricas"        element={<Protect roles={['ADMIN']}><BackofficeMetrics/></Protect>} />
      <Route path="/backoffice/relatorios"      element={<Protect roles={['ADMIN']}><BackofficeReports/></Protect>} />
      <Route path="/backoffice/bc-report"       element={<Protect roles={['ADMIN']}><BackofficeBcReport/></Protect>} />
      <Route path="/backoffice/criar-usuario"   element={<Protect roles={['ADMIN']} perm="manage_users"><BackofficeCreateUser/></Protect>} />
      <Route path="/backoffice/criar-cliente"  element={<Protect roles={['ADMIN']} perm="manage_clients"><BackofficeCreateClient/></Protect>} />
      <Route path="/backoffice/homologados"     element={<Protect roles={['ADMIN']}><BackofficeHomologados/></Protect>} />
      <Route path="/backoffice/processos"        element={<Protect roles={['ADMIN']}><BackofficeProcessSearch/></Protect>} />
      <Route path="/backoffice/convites"        element={<Protect roles={['ADMIN']}><BackofficeInvitations/></Protect>} />
      <Route path="/backoffice/questionarios"   element={<Protect roles={['ADMIN']}><BackofficeQuestionnaires/></Protect>} />
      <Route path="/backoffice/usuarios"        element={<Protect roles={['ADMIN']} perm="manage_users"><BackofficeUsers/></Protect>} />
      <Route path="/backoffice/perfis"          element={<Protect roles={['ADMIN']} perm="manage_users"><BackofficeUserProfiles/></Protect>} />
      <Route path="/backoffice/fluxo-documentos"    element={<Protect roles={['ADMIN']} perm="manage_clients"><BackofficeClientDocumentFlows/></Protect>} />
      <Route path="/backoffice/catalogo-documentos" element={<Protect roles={['ADMIN']}><BackofficeDocumentCatalog/></Protect>} />
      <Route path="/backoffice/precos"              element={<Protect roles={['ADMIN']}><BackofficeElosPricing/></Protect>} />
      <Route path="/backoffice/analise-documentos"  element={<Protect roles={['ADMIN']}><BackofficeDocumentAnalysis/></Protect>} />
      <Route path="/backoffice/clientes"            element={<Protect roles={['ADMIN']} perm="manage_clients"><BackofficeClientSettings/></Protect>} />
      <Route path="/backoffice/landing-pages"   element={<Protect roles={['ADMIN']} perm="manage_clients"><BackofficeLandingPages/></Protect>} />
      <Route path="/backoffice/termos-clientes" element={<Protect roles={['ADMIN']} perm="manage_clients"><BackofficeClientTerms/></Protect>} />
      <Route path="/backoffice/comunicados"     element={<Protect roles={['ADMIN']} perm="manage_comunicados"><BackofficeComunicados/></Protect>} />
      <Route path="/backoffice/feriados"        element={<Protect roles={['ADMIN']}><BackofficeFeriados/></Protect>} />

      {/* Cliente (HOC) */}
      <Route path="/cliente"                                element={<Protect roles={['CLIENT']}><ClientDashboard/></Protect>} />
      <Route path="/cliente/fornecedores"               element={<Protect roles={['CLIENT']} module="fornecedores"><ClientSuppliers/></Protect>} />
      <Route path="/cliente/fornecedor/:supplierId"     element={<Protect roles={['CLIENT']} module="fornecedores"><ClientSupplierProcess/></Protect>} />
      <Route path="/cliente/perfil-fornecedor/:id"      element={<Protect roles={['CLIENT']} module="fornecedores"><ClientSupplierDiscover/></Protect>} />
      <Route path="/cliente/convites"                 element={<Protect roles={['CLIENT']} module="convites"><ClientInvitations/></Protect>} />
      <Route path="/cliente/questionarios"            element={<Protect roles={['CLIENT']} module="questionarios"><ClientQuestionnaires/></Protect>} />
      <Route path="/cliente/relatorios"               element={<Protect roles={['CLIENT']} module="relatorios"><ClientReports/></Protect>} />
      <Route path="/cliente/compliance"               element={<Protect roles={['CLIENT']} module="compliance"><ClientCompliance/></Protect>} />
      <Route path="/cliente/termos"                   element={<Protect roles={['CLIENT']} module="configuracoes"><ClientTermsPage/></Protect>} />
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
