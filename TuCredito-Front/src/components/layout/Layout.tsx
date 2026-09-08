import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useAuth } from '../../context/AuthContext';
import { Clock } from 'lucide-react';
import { InstallAppBanner } from '../ui/InstallAppButton';

export function Layout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { tenantEstado, esSuperadmin } = useAuth();

  const mostrarBannerPrueba = !esSuperadmin && tenantEstado?.estadoSuscripcion === 'prueba' && !tenantEstado.trialVencido;

  return (
    <div className="flex h-screen bg-background text-main overflow-hidden relative transition-colors duration-300">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-gray-900/50 via-background to-background pointer-events-none dark:block hidden"></div>

      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      <div className="flex flex-1 flex-col overflow-hidden relative w-full">
        <div className="absolute top-0 left-0 w-full h-96 bg-primary-500/5 rounded-full blur-3xl pointer-events-none -translate-y-1/2"></div>
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-accent-gold/5 rounded-full blur-3xl pointer-events-none translate-y-1/3 translate-x-1/3"></div>

        <Header onMenuClick={() => setIsSidebarOpen(true)} />
        {mostrarBannerPrueba && (
          <div className="mx-4 md:mx-8 mb-2 flex items-center gap-2 rounded-lg bg-accent-gold/10 border border-accent-gold/20 px-4 py-2 text-sm text-accent-goldDark relative z-10">
            <Clock className="h-4 w-4 flex-shrink-0" />
            <span>
              Te quedan <strong>{Math.max(tenantEstado.diasRestantesPrueba, 0)} día{tenantEstado.diasRestantesPrueba === 1 ? '' : 's'}</strong> de prueba gratuita.
            </span>
          </div>
        )}
        <InstallAppBanner />
        <main className="flex-1 overflow-y-auto p-4 md:p-8 relative z-10 scrollbar-thin">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
