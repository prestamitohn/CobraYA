import { useQuery } from '@tanstack/react-query';
import { getMiPerfilSocio, getMiExcedenteEstimado, getCuentasAhorroByCliente } from '../../services/cooperativaService';
import { getLoans } from '../../services/loanService';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { PiggyBank, Wallet, Wallet2, TrendingUp } from 'lucide-react';

function primerDiaDelAnio(): string {
  return `${new Date().getFullYear()}-01-01`;
}

function hoy(): string {
  return new Date().toISOString().slice(0, 10);
}

export function PortalDashboard() {
  const { data: perfil, isLoading } = useQuery({ queryKey: ['miPerfilSocio'], queryFn: getMiPerfilSocio });
  const { data: cuentas } = useQuery({
    queryKey: ['cuentasAhorroCliente', perfil?.clienteId],
    queryFn: () => getCuentasAhorroByCliente(perfil!.clienteId),
    enabled: !!perfil?.clienteId,
  });
  const { data: prestamos } = useQuery({ queryKey: ['loans'], queryFn: getLoans });
  const { data: excedenteEstimado } = useQuery({
    queryKey: ['miExcedenteEstimado'],
    queryFn: () => getMiExcedenteEstimado(primerDiaDelAnio(), hoy()),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  if (!perfil) {
    return <p className="text-muted text-center py-12">No se encontró tu perfil de socio.</p>;
  }

  const totalAhorros = (cuentas ?? []).reduce((acc, c) => acc + c.saldo, 0);
  const prestamosActivos = (prestamos ?? []).filter((p) => p.estado === 'activo');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-main">Hola, {perfil.nombre}</h1>
        <p className="text-muted">{perfil.tenantNombre} · Socio desde {formatDate(perfil.fechaIngreso)}{perfil.numeroSocio ? ` · N° ${perfil.numeroSocio}` : ''}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-panel p-4 rounded-xl flex items-center gap-3">
          <div className="p-3 rounded-lg bg-primary-500/10 text-primary-500 flex-shrink-0"><PiggyBank className="h-5 w-5" /></div>
          <div className="min-w-0">
            <p className="text-xs text-muted truncate">Aportaciones</p>
            <p className="text-lg font-bold text-main truncate">{formatCurrency(perfil.saldoAportaciones)}</p>
          </div>
        </div>
        <div className="glass-panel p-4 rounded-xl flex items-center gap-3">
          <div className="p-3 rounded-lg bg-emerald-500/10 text-emerald-500 flex-shrink-0"><Wallet2 className="h-5 w-5" /></div>
          <div className="min-w-0">
            <p className="text-xs text-muted truncate">Ahorros</p>
            <p className="text-lg font-bold text-main truncate">{formatCurrency(totalAhorros)}</p>
          </div>
        </div>
        <div className="glass-panel p-4 rounded-xl flex items-center gap-3">
          <div className="p-3 rounded-lg bg-amber-500/10 text-amber-500 flex-shrink-0"><Wallet className="h-5 w-5" /></div>
          <div className="min-w-0">
            <p className="text-xs text-muted truncate">Préstamos activos</p>
            <p className="text-lg font-bold text-main truncate">{prestamosActivos.length}</p>
          </div>
        </div>
        <div className="glass-panel p-4 rounded-xl flex items-center gap-3">
          <div className="p-3 rounded-lg bg-purple-500/10 text-purple-500 flex-shrink-0"><TrendingUp className="h-5 w-5" /></div>
          <div className="min-w-0">
            <p className="text-xs text-muted truncate">Excedente estimado {new Date().getFullYear()}</p>
            <p className="text-lg font-bold text-main truncate">{formatCurrency(excedenteEstimado?.montoExcedente ?? 0)}</p>
          </div>
        </div>
      </div>

      {excedenteEstimado && excedenteEstimado.montoExcedente > 0 && (
        <div className="glass-panel p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 text-sm text-muted">
          El excedente del ejercicio en curso es una <span className="font-medium text-main">estimación provisional</span> — se confirma hasta el cierre oficial del período.
        </div>
      )}
    </div>
  );
}
