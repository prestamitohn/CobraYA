import { useQuery } from '@tanstack/react-query';
import { getMiPerfilSocio, getAportacionesByCliente } from '../../services/cooperativaService';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { getTipoAportacionLabel } from '../../types/cobraya';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { PiggyBank } from 'lucide-react';

export function PortalAportaciones() {
  const { data: perfil } = useQuery({ queryKey: ['miPerfilSocio'], queryFn: getMiPerfilSocio });
  const { data: aportaciones, isLoading } = useQuery({
    queryKey: ['aportacionesCliente', perfil?.clienteId],
    queryFn: () => getAportacionesByCliente(perfil!.clienteId),
    enabled: !!perfil?.clienteId,
  });

  if (isLoading || !perfil) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-main">Aportaciones</h1>
        <p className="text-muted">Tu capital social — nominativo e intransferible, solo retirable si te das de baja como socio</p>
      </div>

      <div className="glass-panel p-4 rounded-xl flex items-center gap-4">
        <div className="p-3 rounded-lg bg-primary-500/10 text-primary-500 flex-shrink-0"><PiggyBank className="h-6 w-6" /></div>
        <div>
          <p className="text-sm text-muted">Saldo actual</p>
          <p className="text-2xl font-bold text-main">{formatCurrency(perfil.saldoAportaciones)}</p>
        </div>
      </div>

      <div className="glass-panel rounded-xl overflow-hidden border border-border">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-surfaceHighlight text-muted">
              <tr>
                <th className="px-6 py-3 font-medium">Fecha</th>
                <th className="px-6 py-3 font-medium">Tipo</th>
                <th className="px-6 py-3 font-medium">Observaciones</th>
                <th className="px-6 py-3 font-medium text-right">Monto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {aportaciones?.map((a) => (
                <tr key={a.id}>
                  <td className="px-6 py-4 text-muted">{formatDate(a.fecha)}</td>
                  <td className="px-6 py-4"><StatusBadge variant={a.tipo === 'retiro' ? 'error' : 'success'}>{getTipoAportacionLabel(a.tipo)}</StatusBadge></td>
                  <td className="px-6 py-4 text-muted">{a.observaciones || '-'}</td>
                  <td className={`px-6 py-4 text-right font-medium ${a.tipo === 'retiro' ? 'text-red-400' : 'text-main'}`}>{a.tipo === 'retiro' ? '- ' : ''}{formatCurrency(a.monto)}</td>
                </tr>
              ))}
              {(aportaciones?.length ?? 0) === 0 && (
                <tr><td colSpan={4} className="px-6 py-8 text-center text-muted">Aún no tienes aportaciones registradas</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
