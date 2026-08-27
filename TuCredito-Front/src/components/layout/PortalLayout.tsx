import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, PiggyBank, Wallet, Wallet2, TrendingUp, ArrowLeftRight, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { cn } from '../../lib/utils';

const portalItems = [
  { icon: LayoutDashboard, label: 'Resumen', to: '/portal' },
  { icon: PiggyBank, label: 'Aportaciones', to: '/portal/aportaciones' },
  { icon: Wallet2, label: 'Ahorros', to: '/portal/ahorros' },
  { icon: Wallet, label: 'Préstamos', to: '/portal/prestamos' },
  { icon: TrendingUp, label: 'Dividendos', to: '/portal/dividendos' },
  { icon: ArrowLeftRight, label: 'Movimientos', to: '/portal/movimientos' },
];

/** Portal de autoservicio del socio — SOLO LECTURA. No comparte layout con el panel del
 * dueño/cobrador a propósito: un socio nunca debería ver navegación a Préstamos/Clientes
 * a nivel de todo el tenant, ni botones de escritura que RLS igual rechazaría. */
export function PortalLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border/50 bg-background/95 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-tr from-primary-600 to-accent-gold flex items-center justify-center flex-shrink-0">
              <span className="font-bold text-white text-base">C</span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-main truncate">Portal del Socio</p>
              <p className="text-xs text-muted truncate">{user?.nombre}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20 transition-all"
          >
            <LogOut className="h-3.5 w-3.5" />
            Cerrar Sesión
          </button>
        </div>
        <nav className="max-w-5xl mx-auto px-4 flex gap-1 overflow-x-auto">
          {portalItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/portal'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors',
                  isActive ? 'border-primary-500 text-primary-500' : 'border-transparent text-muted hover:text-main'
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
