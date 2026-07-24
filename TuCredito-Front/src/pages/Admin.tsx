import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listTenants, getPlatformMetrics, setTenantEstado, createTenant } from '../services/adminService';
import { EstadoSuscripcion } from '../types/cobraya';
import { Building2, Users, Wallet, TrendingUp, Plus, X, Loader2, ShieldAlert } from 'lucide-react';
import { formatCurrency, formatDate } from '../utils/formatters';
import { StatusBadge } from '../components/ui/StatusBadge';
import { KPIWidget } from '../components/dashboard/KPIWidget';
import { useToast } from '../context/ToastContext';

const ESTADO_VARIANT: Record<EstadoSuscripcion, 'success' | 'warning' | 'error' | 'default'> = {
  activa: 'success',
  prueba: 'warning',
  suspendida: 'error',
  cancelada: 'default',
};

function CrearTenantModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [nombreNegocio, setNombreNegocio] = useState('');
  const [nombreUsuario, setNombreUsuario] = useState('');
  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');

  const mutation = useMutation({
    mutationFn: createTenant,
    onSuccess: () => {
      addToast('Tenant creado correctamente', 'success');
      queryClient.invalidateQueries({ queryKey: ['admin', 'tenants'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'metrics'] });
      setNombreNegocio('');
      setNombreUsuario('');
      setCorreo('');
      setPassword('');
      onClose();
    },
    onError: (error: any) => {
      addToast(error.message || 'Error al crear el tenant', 'error');
    },
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-surface border border-border rounded-xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-main">Crear Tenant Manualmente</h2>
          <button onClick={onClose} className="text-muted hover:text-main"><X className="h-5 w-5" /></button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate({ nombreNegocio, nombreUsuario, correo, password });
          }}
          className="p-6 space-y-4"
        >
          <div>
            <label className="text-sm font-medium text-muted">Nombre del Negocio</label>
            <input required value={nombreNegocio} onChange={(e) => setNombreNegocio(e.target.value)}
              className="mt-1 w-full bg-surfaceHighlight border border-border rounded-lg px-4 py-2 text-main focus:border-primary-500 focus:outline-none" />
          </div>
          <div>
            <label className="text-sm font-medium text-muted">Nombre del Dueño</label>
            <input required value={nombreUsuario} onChange={(e) => setNombreUsuario(e.target.value)}
              className="mt-1 w-full bg-surfaceHighlight border border-border rounded-lg px-4 py-2 text-main focus:border-primary-500 focus:outline-none" />
          </div>
          <div>
            <label className="text-sm font-medium text-muted">Correo</label>
            <input required type="email" value={correo} onChange={(e) => setCorreo(e.target.value)}
              className="mt-1 w-full bg-surfaceHighlight border border-border rounded-lg px-4 py-2 text-main focus:border-primary-500 focus:outline-none" />
          </div>
          <div>
            <label className="text-sm font-medium text-muted">Contraseña Inicial</label>
            <input required type="text" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full bg-surfaceHighlight border border-border rounded-lg px-4 py-2 text-main focus:border-primary-500 focus:outline-none" />
            <p className="mt-1 text-xs text-muted">Se crea con el correo ya confirmado; compartísela al prestamista para que inicie sesión.</p>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-muted hover:text-main">Cancelar</button>
            <button type="submit" disabled={mutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium disabled:opacity-50">
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Crear Tenant
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function Admin() {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const { data: metrics, isLoading: isLoadingMetrics } = useQuery({
    queryKey: ['admin', 'metrics'],
    queryFn: getPlatformMetrics,
  });

  const { data: tenants, isLoading: isLoadingTenants } = useQuery({
    queryKey: ['admin', 'tenants'],
    queryFn: listTenants,
  });

  const estadoMutation = useMutation({
    mutationFn: ({ tenantId, estado }: { tenantId: string; estado: EstadoSuscripcion }) => setTenantEstado(tenantId, estado),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'tenants'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'metrics'] });
      addToast('Estado del tenant actualizado', 'success');
    },
    onError: () => addToast('Error al actualizar el estado del tenant', 'error'),
  });

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-main flex items-center gap-2">
            <ShieldAlert className="h-6 w-6 text-primary-500" />
            Panel de Superadmin
          </h1>
          <p className="text-muted">Administración de toda la plataforma CobraYA</p>
        </div>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg transition-colors shadow-lg shadow-primary-500/20"
        >
          <Plus className="h-5 w-5" />
          Crear Tenant
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <KPIWidget
          title="Tenants Totales"
          value={metrics ? String(metrics.totalTenants) : '...'}
          icon={Building2}
          iconColor="bg-primary-500/10 text-primary-400"
          description={metrics ? `${metrics.tenantsActivos} activos, ${metrics.tenantsPrueba} en prueba, ${metrics.tenantsSuspendidos} suspendidos` : ''}
          loading={isLoadingMetrics}
        />
        <KPIWidget
          title="Clientes Totales"
          value={metrics ? String(metrics.totalClientes) : '...'}
          icon={Users}
          iconColor="bg-blue-500/10 text-blue-400"
          description="Clientes registrados en toda la plataforma"
          loading={isLoadingMetrics}
        />
        <KPIWidget
          title="Total Prestado (Plataforma)"
          value={metrics ? formatCurrency(metrics.totalPrestadoPlataforma) : '...'}
          icon={Wallet}
          iconColor="bg-emerald-500/10 text-emerald-400"
          description={`${metrics?.totalPrestamos ?? 0} préstamos otorgados`}
          loading={isLoadingMetrics}
        />
        <KPIWidget
          title="Total Cobrado (Plataforma)"
          value={metrics ? formatCurrency(metrics.totalCobradoPlataforma) : '...'}
          icon={TrendingUp}
          iconColor="bg-blue-500/10 text-blue-400"
          description="Suma de todos los pagos registrados"
          loading={isLoadingMetrics}
        />
      </div>

      <div className="glass-panel rounded-xl overflow-hidden border border-border">
        <div className="p-4 border-b border-border">
          <h2 className="font-semibold text-main">Tenants</h2>
        </div>
        <div className="overflow-x-auto">
          {isLoadingTenants ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
            </div>
          ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-surfaceHighlight text-muted">
              <tr>
                <th className="px-6 py-3 font-medium">Negocio</th>
                <th className="px-6 py-3 font-medium">Alta</th>
                <th className="px-6 py-3 font-medium">Usuarios</th>
                <th className="px-6 py-3 font-medium">Clientes</th>
                <th className="px-6 py-3 font-medium">Préstamos</th>
                <th className="px-6 py-3 font-medium">Monto Otorgado</th>
                <th className="px-6 py-3 font-medium">Estado</th>
                <th className="px-6 py-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {tenants?.map((t) => (
                <tr key={t.id} className="hover:bg-surfaceHighlight/50 transition-colors">
                  <td className="px-6 py-4 font-medium text-main">{t.nombre}</td>
                  <td className="px-6 py-4 text-muted">{formatDate(t.createdAt)}</td>
                  <td className="px-6 py-4 text-muted">{t.cantidadUsuarios}</td>
                  <td className="px-6 py-4 text-muted">{t.cantidadClientes}</td>
                  <td className="px-6 py-4 text-muted">{t.cantidadPrestamos}</td>
                  <td className="px-6 py-4 text-main">{formatCurrency(t.montoOtorgadoTotal)}</td>
                  <td className="px-6 py-4">
                    <StatusBadge variant={ESTADO_VARIANT[t.estadoSuscripcion]}>{t.estadoSuscripcion}</StatusBadge>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {t.estadoSuscripcion !== 'activa' && (
                        <button
                          onClick={() => estadoMutation.mutate({ tenantId: t.id, estado: 'activa' })}
                          className="text-xs font-medium text-green-500 hover:text-green-400"
                        >
                          Activar
                        </button>
                      )}
                      {t.estadoSuscripcion !== 'suspendida' && (
                        <button
                          onClick={() => estadoMutation.mutate({ tenantId: t.id, estado: 'suspendida' })}
                          className="text-xs font-medium text-red-500 hover:text-red-400"
                        >
                          Suspender
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {tenants?.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-muted">No hay tenants registrados todavía</td>
                </tr>
              )}
            </tbody>
          </table>
          )}
        </div>
      </div>

      <CrearTenantModal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} />
    </div>
  );
}
