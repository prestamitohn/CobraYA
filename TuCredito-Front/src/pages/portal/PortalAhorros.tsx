import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getMiPerfilSocio, getCuentasAhorroByCliente, getProductosAhorro, getMovimientosByCuenta } from '../../services/cooperativaService';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { getTipoMovimientoLabel, getTipoProductoAhorroLabel } from '../../types/cobraya';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Wallet2, ChevronDown, ChevronUp } from 'lucide-react';

export function PortalAhorros() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { data: perfil } = useQuery({ queryKey: ['miPerfilSocio'], queryFn: getMiPerfilSocio });
  const { data: cuentas, isLoading } = useQuery({
    queryKey: ['cuentasAhorroCliente', perfil?.clienteId],
    queryFn: () => getCuentasAhorroByCliente(perfil!.clienteId),
    enabled: !!perfil?.clienteId,
  });
  const { data: productos } = useQuery({ queryKey: ['productosAhorro'], queryFn: getProductosAhorro });
  const { data: movimientos } = useQuery({
    queryKey: ['movimientosCuenta', expandedId],
    queryFn: () => getMovimientosByCuenta(expandedId!),
    enabled: !!expandedId,
  });

  if (isLoading || !perfil) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  const productosPorId: Record<string, { nombre: string; tipo: string }> = {};
  for (const p of productos ?? []) productosPorId[p.id] = { nombre: p.nombre, tipo: getTipoProductoAhorroLabel(p.tipo) };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-main">Ahorros</h1>
        <p className="text-muted">Tus cuentas de ahorro por producto</p>
      </div>

      <div className="space-y-3">
        {cuentas?.map((c) => {
          const producto = productosPorId[c.productoId];
          const expanded = expandedId === c.id;
          return (
            <div key={c.id} className="glass-panel rounded-xl border border-border overflow-hidden">
              <button onClick={() => setExpandedId(expanded ? null : c.id)} className="w-full flex items-center justify-between gap-3 p-4 hover:bg-surfaceHighlight/50 transition-colors text-left">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-500 flex-shrink-0"><Wallet2 className="h-5 w-5" /></div>
                  <div className="min-w-0">
                    <p className="text-main font-medium truncate">{producto?.nombre ?? 'Ahorro'} <span className="text-xs text-muted">({producto?.tipo})</span></p>
                    <p className="text-xs text-muted truncate">Cuenta {c.numeroCuenta} · Abierta {formatDate(c.fechaApertura)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="text-right hidden sm:block">
                    <p className="text-xs text-muted">Saldo</p>
                    <p className="text-main font-semibold">{formatCurrency(c.saldo)}</p>
                  </div>
                  <StatusBadge variant={c.estado === 'activa' ? 'success' : c.estado === 'vencida' ? 'error' : 'default'}>{c.estado}</StatusBadge>
                  {expanded ? <ChevronUp className="h-4 w-4 text-muted" /> : <ChevronDown className="h-4 w-4 text-muted" />}
                </div>
              </button>
              {expanded && (
                <div className="border-t border-border divide-y divide-border">
                  {movimientos?.map((m) => (
                    <div key={m.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                      <div className="min-w-0">
                        <p className="text-main truncate">{getTipoMovimientoLabel(m.tipo)}{m.descripcion ? ` — ${m.descripcion}` : ''}</p>
                        <p className="text-xs text-muted">{formatDate(m.fecha)}</p>
                      </div>
                      <p className={`font-medium flex-shrink-0 ${m.monto < 0 ? 'text-red-400' : 'text-main'}`}>{m.monto < 0 ? '' : '+'}{formatCurrency(m.monto)}</p>
                    </div>
                  ))}
                  {(movimientos?.length ?? 0) === 0 && <p className="text-sm text-muted text-center py-4">Sin movimientos</p>}
                </div>
              )}
            </div>
          );
        })}
        {(cuentas?.length ?? 0) === 0 && (
          <div className="glass-panel rounded-xl border border-border p-8 text-center text-muted">Aún no tienes cuentas de ahorro</div>
        )}
      </div>
    </div>
  );
}
