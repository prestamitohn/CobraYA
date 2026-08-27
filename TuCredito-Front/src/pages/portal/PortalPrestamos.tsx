import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getLoans } from '../../services/loanService';
import { getInstallments } from '../../services/installmentService';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { getEstadoCuotaLabel, getEstadoPrestamoLabel } from '../../types/cobraya';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Wallet, ChevronDown, ChevronUp } from 'lucide-react';

export function PortalPrestamos() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { data: prestamos, isLoading } = useQuery({ queryKey: ['loans'], queryFn: getLoans });
  const { data: cuotas } = useQuery({
    queryKey: ['installments', expandedId],
    queryFn: () => getInstallments({ prestamoId: expandedId! }),
    enabled: !!expandedId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-main">Préstamos</h1>
        <p className="text-muted">Tus préstamos y su plan de cuotas</p>
      </div>

      <div className="space-y-3">
        {prestamos?.map((p) => {
          const expanded = expandedId === p.id;
          return (
            <div key={p.id} className="glass-panel rounded-xl border border-border overflow-hidden">
              <button onClick={() => setExpandedId(expanded ? null : p.id)} className="w-full flex items-center justify-between gap-3 p-4 hover:bg-surfaceHighlight/50 transition-colors text-left">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2.5 rounded-lg bg-amber-500/10 text-amber-500 flex-shrink-0"><Wallet className="h-5 w-5" /></div>
                  <div className="min-w-0">
                    <p className="text-main font-medium truncate">{formatCurrency(p.montoOtorgado)}</p>
                    <p className="text-xs text-muted truncate">Otorgado {formatDate(p.fechaOtorgamiento)} · {p.cantidadCuotas} cuotas</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="text-right hidden sm:block">
                    <p className="text-xs text-muted">Saldo</p>
                    <p className="text-main font-semibold">{formatCurrency(p.saldoRestante)}</p>
                  </div>
                  <StatusBadge variant={p.estado === 'activo' ? 'success' : p.estado === 'finalizado' ? 'warning' : 'error'}>{getEstadoPrestamoLabel(p.estado)}</StatusBadge>
                  {expanded ? <ChevronUp className="h-4 w-4 text-muted" /> : <ChevronDown className="h-4 w-4 text-muted" />}
                </div>
              </button>
              {expanded && (
                <div className="border-t border-border overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-surfaceHighlight text-muted">
                      <tr>
                        <th className="px-4 py-2 font-medium">#</th>
                        <th className="px-4 py-2 font-medium">Vencimiento</th>
                        <th className="px-4 py-2 font-medium text-right">Cuota</th>
                        <th className="px-4 py-2 font-medium text-right">Saldo</th>
                        <th className="px-4 py-2 font-medium">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {cuotas?.map((c) => (
                        <tr key={c.id}>
                          <td className="px-4 py-2 text-muted">{c.nroCuota}</td>
                          <td className="px-4 py-2 text-muted">{formatDate(c.fechaVto)}</td>
                          <td className="px-4 py-2 text-main text-right">{formatCurrency(c.monto)}</td>
                          <td className="px-4 py-2 text-main text-right">{formatCurrency(c.saldoPendiente ?? 0)}</td>
                          <td className="px-4 py-2">
                            <StatusBadge variant={c.estado === 'saldada' ? 'success' : c.estado === 'pendiente' ? 'warning' : 'error'}>{getEstadoCuotaLabel(c.estado)}</StatusBadge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
        {(prestamos?.length ?? 0) === 0 && (
          <div className="glass-panel rounded-xl border border-border p-8 text-center text-muted">No tienes préstamos registrados</div>
        )}
      </div>
    </div>
  );
}
