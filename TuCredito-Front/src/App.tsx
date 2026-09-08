import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Layout } from './components/layout/Layout';
import { PortalLayout } from './components/layout/PortalLayout';
import { ToastProvider } from './context/ToastContext';
import { BlockedAccountScreen } from './components/auth/BlockedAccountScreen';

// Cada página en su propio chunk: /login no debería tener que descargar el código de
// Dashboard/Recharts/panel de Admin antes de poder pintarse (medido: el bundle único
// pesaba ~1.1MB, lento en conexiones móviles de HN).
const Dashboard = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })));
const Login = lazy(() => import('./pages/Login').then((m) => ({ default: m.Login })));
const Register = lazy(() => import('./pages/Register').then((m) => ({ default: m.Register })));
const CreateLoan = lazy(() => import('./pages/CreateLoan').then((m) => ({ default: m.CreateLoan })));
const LoanDetails = lazy(() => import('./pages/LoanDetails').then((m) => ({ default: m.LoanDetails })));
const Loans = lazy(() => import('./pages/Loans').then((m) => ({ default: m.Loans })));
const Borrowers = lazy(() => import('./pages/Borrowers').then((m) => ({ default: m.Borrowers })));
const CreateBorrower = lazy(() => import('./pages/CreateBorrower').then((m) => ({ default: m.CreateBorrower })));
const EditBorrower = lazy(() => import('./pages/EditBorrower').then((m) => ({ default: m.EditBorrower })));
const BorrowerDetails = lazy(() => import('./pages/BorrowerDetails').then((m) => ({ default: m.BorrowerDetails })));
const Payments = lazy(() => import('./pages/Payments').then((m) => ({ default: m.Payments })));
const Multas = lazy(() => import('./pages/Multas').then((m) => ({ default: m.Multas })));
const Reportes = lazy(() => import('./pages/Reportes').then((m) => ({ default: m.Reportes })));
const Calculator = lazy(() => import('./pages/Calculator').then((m) => ({ default: m.Calculator })));
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })));
const Aportaciones = lazy(() => import('./pages/Aportaciones').then((m) => ({ default: m.Aportaciones })));
const Ahorros = lazy(() => import('./pages/Ahorros').then((m) => ({ default: m.Ahorros })));
const Excedentes = lazy(() => import('./pages/Excedentes').then((m) => ({ default: m.Excedentes })));
const Admin = lazy(() => import('./pages/Admin').then((m) => ({ default: m.Admin })));
const NotFound = lazy(() => import('./pages/NotFound').then((m) => ({ default: m.NotFound })));
const LandingPage = lazy(() => import('./pages/LandingPage').then((m) => ({ default: m.LandingPage })));

// Portal de autoservicio del socio (rol 'socio') — layout y páginas propios, nunca
// comparte chunk con el panel del dueño/cobrador.
const PortalDashboard = lazy(() => import('./pages/portal/PortalDashboard').then((m) => ({ default: m.PortalDashboard })));
const PortalAportaciones = lazy(() => import('./pages/portal/PortalAportaciones').then((m) => ({ default: m.PortalAportaciones })));
const PortalAhorros = lazy(() => import('./pages/portal/PortalAhorros').then((m) => ({ default: m.PortalAhorros })));
const PortalPrestamos = lazy(() => import('./pages/portal/PortalPrestamos').then((m) => ({ default: m.PortalPrestamos })));
const PortalDividendos = lazy(() => import('./pages/portal/PortalDividendos').then((m) => ({ default: m.PortalDividendos })));
const PortalMovimientos = lazy(() => import('./pages/portal/PortalMovimientos').then((m) => ({ default: m.PortalMovimientos })));

const queryClient = new QueryClient();

function PageSpinner() {
  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
    </div>
  );
}

/** Pantalla de bloqueo compartida (suspendida/cancelada/prueba vencida) — la usan tanto
 * el panel del dueño/cobrador como el portal del socio, ya que ambos dependen del
 * mismo estado de suscripción del tenant. Devuelve null si no hay nada que bloquear. */
function useTenantBlockScreen(): React.ReactNode | null {
  const { tenantEstado, logout } = useAuth();

  if (tenantEstado && (tenantEstado.estadoSuscripcion === 'suspendida' || tenantEstado.estadoSuscripcion === 'cancelada')) {
    return (
      <BlockedAccountScreen
        titulo={`Cuenta ${tenantEstado.estadoSuscripcion}`}
        mensaje={`La cuenta de ${tenantEstado.nombre} está ${tenantEstado.estadoSuscripcion} y no tiene acceso al sistema. Regulariza tu suscripción para reactivarla.`}
        onLogout={logout}
      />
    );
  }

  if (tenantEstado?.trialVencido) {
    return (
      <BlockedAccountScreen
        titulo="Tu prueba gratuita terminó"
        mensaje={`Los 14 días de prueba gratuita de ${tenantEstado.nombre} ya terminaron. Realiza el pago de tu suscripción para seguir usando CobraYA.`}
        onLogout={logout}
      />
    );
  }

  return null;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const blockScreen = useTenantBlockScreen();
  const location = useLocation();

  if (isLoading) {
    return <PageSpinner />;
  }

  if (!isAuthenticated) {
    // La landing pública solo se sirve en la raíz exacta ("/") — cualquier otra ruta
    // protegida (ej. /borrowers escrita a mano sin sesión) sigue mandando a /login,
    // igual que antes.
    if (location.pathname === '/') {
      return <LandingPage />;
    }
    return <Navigate to="/login" replace />;
  }

  // Un socio nunca entra al panel del dueño/cobrador — todas las rutas bajo "/" están
  // acá adentro, así que basta este único chequeo para mandarlo siempre a su portal.
  if (user?.rol === 'socio') {
    return <Navigate to="/portal" replace />;
  }

  if (blockScreen) return blockScreen;

  return <>{children}</>;
}

function PortalRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const blockScreen = useTenantBlockScreen();

  if (isLoading) {
    return <PageSpinner />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (user?.rol !== 'socio') {
    return <Navigate to="/" replace />;
  }

  if (blockScreen) return blockScreen;

  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, esSuperadmin } = useAuth();

  if (isLoading) {
    return <PageSpinner />;
  }

  if (!isAuthenticated || !esSuperadmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

/** Rutas de gestión bloqueadas para el cobrador de campo ('collector') — solo cobra lo
 * que le asignaron, nunca administra (Configuración, alta de préstamos/clientes,
 * módulo de cooperativa). El auditor SÍ conserva acceso (solo lectura, ya reutiliza
 * este mismo panel — ver nota de admisión de 'auditor' en el módulo de cooperativas).
 * La RLS ya bloquea a nivel de datos lo que el collector no debe tocar (crear_prestamo,
 * tablas de cooperativa, etc.); esto solo evita que llegue a una pantalla que le va a
 * rechazar todo. */
function OwnerRoute({ children }: { children: React.ReactNode }) {
  const { isLoading, user } = useAuth();

  if (isLoading) {
    return <PageSpinner />;
  }

  if (user?.rol === 'collector') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

/** Aportaciones/Excedentes solo aplican a tenants tipo cooperativa — los RPC ya lo validan server-side, esto solo evita que un prestamista llegue a una página que no le sirve. */
function CooperativaRoute({ children }: { children: React.ReactNode }) {
  const { isLoading, tenantEstado } = useAuth();

  if (isLoading) {
    return <PageSpinner />;
  }

  if (tenantEstado && tenantEstado.tipoTenant !== 'cooperativa') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        <Route path="/" element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }>
          <Route index element={<Dashboard />} />
          <Route path="loans" element={<Loans />} />
          <Route path="loans/create" element={<OwnerRoute><CreateLoan /></OwnerRoute>} />
          <Route path="loans/:id" element={<LoanDetails />} />
          <Route path="borrowers" element={<Borrowers />} />
          <Route path="borrowers/create" element={<OwnerRoute><CreateBorrower /></OwnerRoute>} />
          <Route path="borrowers/edit/:documento" element={<OwnerRoute><EditBorrower /></OwnerRoute>} />
          <Route path="borrowers/:documento" element={<BorrowerDetails />} />
          <Route path="payments" element={<Payments />} />
          <Route path="multas" element={<Multas />} />
          <Route path="reportes" element={<OwnerRoute><Reportes /></OwnerRoute>} />
          <Route path="aportaciones" element={<OwnerRoute><CooperativaRoute><Aportaciones /></CooperativaRoute></OwnerRoute>} />
          <Route path="ahorros" element={<OwnerRoute><CooperativaRoute><Ahorros /></CooperativaRoute></OwnerRoute>} />
          <Route path="excedentes" element={<OwnerRoute><CooperativaRoute><Excedentes /></CooperativaRoute></OwnerRoute>} />
          <Route path="calculator" element={<Calculator />} />
          <Route path="settings" element={<OwnerRoute><Settings /></OwnerRoute>} />
          <Route path="admin" element={<AdminRoute><Admin /></AdminRoute>} />
        </Route>

        <Route path="/portal" element={
          <PortalRoute>
            <PortalLayout />
          </PortalRoute>
        }>
          <Route index element={<PortalDashboard />} />
          <Route path="aportaciones" element={<PortalAportaciones />} />
          <Route path="ahorros" element={<PortalAhorros />} />
          <Route path="prestamos" element={<PortalPrestamos />} />
          <Route path="dividendos" element={<PortalDividendos />} />
          <Route path="movimientos" element={<PortalMovimientos />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
