import { useQuery } from '@tanstack/react-query';
import { getMiPerfilSocio, getMisMovimientos } from '../../services/cooperativaService';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { getTipoMovimientoLabel } from '../../types/cobraya';
import { StatusBadge } from '../../components/ui/StatusBadge';

export function PortalMovimientos() {
  const { data: perfil } = useQuery({ queryKey: ['miPerfilSocio'], queryFn: getMiPerfilSocio });
  const { data: movimientos, isLoading } = useQuery({
    queryKey: ['misMovimientos', perfil?.clienteId],
    queryFn: () => getMisMovimientos(perfil!.clienteId),
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
        <h1 className="text-2xl font-bold text-main">Movimientos</h1>
        <p className="text-muted">Todos tus depósitos, retiros y devengos de interés (ahorro y aportación)</p>
      </div>

      <div className="glass-panel rounded-xl overflow-hidden border border-border">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-surfaceHighlight text-muted">
              <tr>
                <th className="px-6 py-3 font-medium">Fecha</th>
                <th className="px-6 py-3 font-medium">Origen</th>
                <th className="px-6 py-3 font-medium">Tipo</th>
                <th className="px-6 py-3 font-medium">Descripción</th>
                <th className="px-6 py-3 font-medium text-right">Monto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {movimientos?.map((m) => (
                <tr key={m.id}>
                  <td className="px-6 py-4 text-muted">{formatDate(m.fecha)}</td>
                  <td className="px-6 py-4"><StatusBadge variant="default">{m.origen === 'ahorro' ? 'Ahorro' : 'Aportación'}</StatusBadge></td>
                  <td className="px-6 py-4 text-muted">{getTipoMovimientoLabel(m.tipo)}</td>
                  <td className="px-6 py-4 text-muted">{m.descripcion || '-'}</td>
                  <td className={`px-6 py-4 text-right font-medium ${m.monto < 0 ? 'text-red-400' : 'text-main'}`}>{m.monto < 0 ? '' : '+'}{formatCurrency(m.monto)}</td>
                </tr>
              ))}
              {(movimientos?.length ?? 0) === 0 && (
                <tr><td colSpan={5} className="px-6 py-8 text-center text-muted">Aún no tienes movimientos registrados</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
