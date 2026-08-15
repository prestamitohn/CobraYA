import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Layout } from './components/layout/Layout';
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
const Calculator = lazy(() => import('./pages/Calculator').then((m) => ({ default: m.Calculator })));
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })));
const Aportaciones = lazy(() => import('./pages/Aportaciones').then((m) => ({ default: m.Aportaciones })));
const Excedentes = lazy(() => import('./pages/Excedentes').then((m) => ({ default: m.Excedentes })));
const Admin = lazy(() => import('./pages/Admin').then((m) => ({ default: m.Admin })));
const NotFound = lazy(() => import('./pages/NotFound').then((m) => ({ default: m.NotFound })));

const queryClient = new QueryClient();

function PageSpinner() {
  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, tenantEstado, logout } = useAuth();

  if (isLoading) {
    return <PageSpinner />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

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
          <Route path="loans/create" element={<CreateLoan />} />
          <Route path="loans/:id" element={<LoanDetails />} />
          <Route path="borrowers" element={<Borrowers />} />
          <Route path="borrowers/create" element={<CreateBorrower />} />
          <Route path="borrowers/edit/:documento" element={<EditBorrower />} />
          <Route path="borrowers/:documento" element={<BorrowerDetails />} />
          <Route path="payments" element={<Payments />} />
          <Route path="multas" element={<Multas />} />
          <Route path="aportaciones" element={<CooperativaRoute><Aportaciones /></CooperativaRoute>} />
          <Route path="excedentes" element={<CooperativaRoute><Excedentes /></CooperativaRoute>} />
          <Route path="calculator" element={<Calculator />} />
          <Route path="settings" element={<Settings />} />
          <Route path="admin" element={<AdminRoute><Admin /></AdminRoute>} />
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
