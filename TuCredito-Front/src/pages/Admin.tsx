import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listTenants, getPlatformMetrics, setTenantEstado, createTenant } from '../services/adminService';
import { adminListPaymentAccounts, adminCreatePaymentAccount, adminUpdatePaymentAccount, adminDeletePaymentAccount, PaymentAccountInput } from '../services/paymentAccountService';
import { EstadoSuscripcion, PlatformPaymentAccount, TipoCuentaPago, getTipoCuentaPagoLabel } from '../types/cobraya';
import { Building2, Users, Wallet, TrendingUp, Plus, X, Loader2, ShieldAlert, CreditCard, Pencil, Trash2, Power, Check } from 'lucide-react';
import { formatCurrency, formatDate } from '../utils/formatters';
import { StatusBadge } from '../components/ui/StatusBadge';
import { KPIWidget } from '../components/dashboard/KPIWidget';
import { useToast } from '../context/ToastContext';
import { ConfirmationModal } from '../components/ui/ConfirmationModal';

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

const TIPO_CUENTA_PAGO_OPTIONS: TipoCuentaPago[] = ['banco', 'tigo_money', 'paypal', 'otro'];

interface CuentaPagoModalProps {
  isOpen: boolean;
  onClose: () => void;
  cuenta: PlatformPaymentAccount | null;
}

function CuentaPagoModal({ isOpen, onClose, cuenta }: CuentaPagoModalProps) {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const isEditing = !!cuenta;

  const [form, setForm] = useState<PaymentAccountInput & { activo: boolean }>({
    tipo: 'banco',
    nombreBeneficiario: '',
    banco: '',
    numeroCuenta: '',
    tipoCuentaBancaria: '',
    telefono: '',
    instrucciones: '',
    orden: 0,
    activo: true,
  });

  useEffect(() => {
    if (isOpen) {
      setForm({
        tipo: cuenta?.tipo ?? 'banco',
        nombreBeneficiario: cuenta?.nombreBeneficiario ?? '',
        banco: cuenta?.banco ?? '',
        numeroCuenta: cuenta?.numeroCuenta ?? '',
        tipoCuentaBancaria: cuenta?.tipoCuentaBancaria ?? '',
        telefono: cuenta?.telefono ?? '',
        instrucciones: cuenta?.instrucciones ?? '',
        orden: cuenta?.orden ?? 0,
        activo: cuenta?.activo ?? true,
      });
    }
  }, [isOpen, cuenta]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (isEditing) {
        await adminUpdatePaymentAccount(cuenta!.id, form);
      } else {
        await adminCreatePaymentAccount(form);
      }
    },
    onSuccess: () => {
      addToast(isEditing ? 'Cuenta de pago actualizada' : 'Cuenta de pago creada', 'success');
      queryClient.invalidateQueries({ queryKey: ['admin', 'cuentasPago'] });
      onClose();
    },
    onError: (error: any) => {
      addToast(error.message || 'Error al guardar la cuenta de pago', 'error');
    },
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-surface border border-border rounded-xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-surface">
          <h2 className="text-lg font-semibold text-main">{isEditing ? 'Editar Cuenta de Pago' : 'Nueva Cuenta de Pago'}</h2>
          <button onClick={onClose} className="text-muted hover:text-main"><X className="h-5 w-5" /></button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
          className="p-6 space-y-4"
        >
          <div>
            <label className="text-sm font-medium text-muted">Tipo</label>
            <select
              value={form.tipo}
              onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value as TipoCuentaPago }))}
              className="mt-1 w-full bg-surfaceHighlight border border-border rounded-lg px-4 py-2 text-main focus:border-primary-500 focus:outline-none [&>option]:bg-surface"
            >
              {TIPO_CUENTA_PAGO_OPTIONS.map((t) => (
                <option key={t} value={t}>{getTipoCuentaPagoLabel(t)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-muted">Nombre del Beneficiario</label>
            <input required value={form.nombreBeneficiario} onChange={(e) => setForm((f) => ({ ...f, nombreBeneficiario: e.target.value }))}
              className="mt-1 w-full bg-surfaceHighlight border border-border rounded-lg px-4 py-2 text-main focus:border-primary-500 focus:outline-none" />
          </div>
          {form.tipo === 'banco' && (
            <>
              <div>
                <label className="text-sm font-medium text-muted">Banco</label>
                <input value={form.banco ?? ''} onChange={(e) => setForm((f) => ({ ...f, banco: e.target.value }))}
                  className="mt-1 w-full bg-surfaceHighlight border border-border rounded-lg px-4 py-2 text-main focus:border-primary-500 focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted">Número de Cuenta</label>
                  <input value={form.numeroCuenta ?? ''} onChange={(e) => setForm((f) => ({ ...f, numeroCuenta: e.target.value }))}
                    className="mt-1 w-full bg-surfaceHighlight border border-border rounded-lg px-4 py-2 text-main focus:border-primary-500 focus:outline-none" />
                </div>
                <div>
                  <label className="text-sm font-medium text-muted">Tipo de Cuenta</label>
                  <input placeholder="Ahorros / Cheques" value={form.tipoCuentaBancaria ?? ''} onChange={(e) => setForm((f) => ({ ...f, tipoCuentaBancaria: e.target.value }))}
                    className="mt-1 w-full bg-surfaceHighlight border border-border rounded-lg px-4 py-2 text-main focus:border-primary-500 focus:outline-none" />
                </div>
              </div>
            </>
          )}
          {(form.tipo === 'tigo_money' || form.tipo === 'otro') && (
            <div>
              <label className="text-sm font-medium text-muted">Teléfono</label>
              <input value={form.telefono ?? ''} onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))}
                className="mt-1 w-full bg-surfaceHighlight border border-border rounded-lg px-4 py-2 text-main focus:border-primary-500 focus:outline-none" />
            </div>
          )}
          {form.tipo === 'paypal' && (
            <div>
              <label className="text-sm font-medium text-muted">Correo de PayPal</label>
              <input value={form.numeroCuenta ?? ''} onChange={(e) => setForm((f) => ({ ...f, numeroCuenta: e.target.value }))}
                className="mt-1 w-full bg-surfaceHighlight border border-border rounded-lg px-4 py-2 text-main focus:border-primary-500 focus:outline-none" />
            </div>
          )}
          <div>
            <label className="text-sm font-medium text-muted">Instrucciones (opcional)</label>
            <textarea value={form.instrucciones ?? ''} onChange={(e) => setForm((f) => ({ ...f, instrucciones: e.target.value }))}
              rows={2}
              className="mt-1 w-full bg-surfaceHighlight border border-border rounded-lg px-4 py-2 text-main focus:border-primary-500 focus:outline-none" />
          </div>
          {isEditing && (
            <label className="flex items-center gap-2 text-sm text-main cursor-pointer">
              <input type="checkbox" checked={form.activo} onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))}
                className="rounded border-border text-primary-500 focus:ring-primary-500" />
              Cuenta activa (visible para los tenants)
            </label>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-muted hover:text-main">Cancelar</button>
            <button type="submit" disabled={mutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium disabled:opacity-50">
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Guardar
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
  const [isCuentaModalOpen, setIsCuentaModalOpen] = useState(false);
  const [editingCuenta, setEditingCuenta] = useState<PlatformPaymentAccount | null>(null);
  const [deletingCuentaId, setDeletingCuentaId] = useState<string | null>(null);

  const { data: metrics, isLoading: isLoadingMetrics } = useQuery({
    queryKey: ['admin', 'metrics'],
    queryFn: getPlatformMetrics,
  });

  const { data: tenants, isLoading: isLoadingTenants } = useQuery({
    queryKey: ['admin', 'tenants'],
    queryFn: listTenants,
  });

  const { data: cuentasPago, isLoading: isLoadingCuentas } = useQuery({
    queryKey: ['admin', 'cuentasPago'],
    queryFn: adminListPaymentAccounts,
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

  const deleteCuentaMutation = useMutation({
    mutationFn: (id: string) => adminDeletePaymentAccount(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'cuentasPago'] });
      addToast('Cuenta de pago eliminada', 'success');
      setDeletingCuentaId(null);
    },
    onError: () => addToast('Error al eliminar la cuenta de pago', 'error'),
  });

  const toggleCuentaActivaMutation = useMutation({
    mutationFn: (c: PlatformPaymentAccount) => adminUpdatePaymentAccount(c.id, {
      tipo: c.tipo,
      nombreBeneficiario: c.nombreBeneficiario,
      banco: c.banco,
      numeroCuenta: c.numeroCuenta,
      tipoCuentaBancaria: c.tipoCuentaBancaria,
      telefono: c.telefono,
      instrucciones: c.instrucciones,
      orden: c.orden,
      activo: !c.activo,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'cuentasPago'] });
      addToast('Estado de la cuenta actualizado', 'success');
    },
    onError: () => addToast('Error al actualizar la cuenta de pago', 'error'),
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
                <th className="px-6 py-3 font-medium">Propietario</th>
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
                  <td className="px-6 py-4 font-medium text-main max-w-[180px] truncate">{t.nombre}</td>
                  <td className="px-6 py-4 max-w-[220px]">
                    <p className="text-main truncate">{t.propietarioNombre || '-'}</p>
                    {t.propietarioCorreo && (
                      <a href={`mailto:${t.propietarioCorreo}`} className="text-xs text-primary-500 hover:underline truncate block">
                        {t.propietarioCorreo}
                      </a>
                    )}
                  </td>
                  <td className="px-6 py-4 text-muted whitespace-nowrap">{formatDate(t.createdAt)}</td>
                  <td className="px-6 py-4 text-muted">{t.cantidadUsuarios}</td>
                  <td className="px-6 py-4 text-muted">{t.cantidadClientes}</td>
                  <td className="px-6 py-4 text-muted">{t.cantidadPrestamos}</td>
                  <td className="px-6 py-4 text-main">{formatCurrency(t.montoOtorgadoTotal)}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <StatusBadge variant={ESTADO_VARIANT[t.estadoSuscripcion]}>{t.estadoSuscripcion}</StatusBadge>
                      {t.estadoSuscripcion === 'prueba' && new Date(t.fechaInicio).getTime() + 14 * 86400000 < Date.now() && (
                        <span className="text-xs font-medium text-red-500">Prueba vencida</span>
                      )}
                    </div>
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
                  <td colSpan={9} className="px-6 py-8 text-center text-muted">No hay tenants registrados todavía</td>
                </tr>
              )}
            </tbody>
          </table>
          )}
        </div>
      </div>

      <div className="glass-panel rounded-xl overflow-hidden border border-border">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-main flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary-500" />
              Cuentas de Pago
            </h2>
            <p className="text-xs text-muted mt-0.5">Cuentas manuales mostradas a los tenants cuando su prueba vence o su cuenta está suspendida.</p>
          </div>
          <button
            onClick={() => { setEditingCuenta(null); setIsCuentaModalOpen(true); }}
            className="flex items-center gap-2 px-3 py-1.5 bg-primary-500/10 text-primary-500 hover:bg-primary-500/20 rounded-lg text-xs font-medium transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Nueva Cuenta
          </button>
        </div>
        <div className="overflow-x-auto">
          {isLoadingCuentas ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
            </div>
          ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-surfaceHighlight text-muted">
              <tr>
                <th className="px-6 py-3 font-medium">Tipo</th>
                <th className="px-6 py-3 font-medium">Beneficiario</th>
                <th className="px-6 py-3 font-medium">Detalle</th>
                <th className="px-6 py-3 font-medium">Estado</th>
                <th className="px-6 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {cuentasPago?.map((c) => (
                <tr key={c.id} className="hover:bg-surfaceHighlight/50 transition-colors">
                  <td className="px-6 py-4 text-main">{getTipoCuentaPagoLabel(c.tipo)}</td>
                  <td className="px-6 py-4 text-main">{c.nombreBeneficiario}</td>
                  <td className="px-6 py-4 text-muted">
                    {[c.banco, c.numeroCuenta, c.telefono].filter(Boolean).join(' · ') || '-'}
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge variant={c.activo ? 'success' : 'default'}>{c.activo ? 'Activa' : 'Inactiva'}</StatusBadge>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button
                        onClick={() => toggleCuentaActivaMutation.mutate(c)}
                        title={c.activo ? 'Desactivar' : 'Activar'}
                        className="text-muted hover:text-primary-500 transition-colors"
                      >
                        <Power className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => { setEditingCuenta(c); setIsCuentaModalOpen(true); }}
                        title="Editar"
                        className="text-muted hover:text-primary-500 transition-colors"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setDeletingCuentaId(c.id)}
                        title="Eliminar"
                        className="text-muted hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {cuentasPago?.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-muted">No hay cuentas de pago configuradas todavía</td>
                </tr>
              )}
            </tbody>
          </table>
          )}
        </div>
      </div>

      <CrearTenantModal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} />

      <CuentaPagoModal
        isOpen={isCuentaModalOpen}
        onClose={() => setIsCuentaModalOpen(false)}
        cuenta={editingCuenta}
      />

      <ConfirmationModal
        isOpen={!!deletingCuentaId}
        onClose={() => setDeletingCuentaId(null)}
        onConfirm={() => deletingCuentaId && deleteCuentaMutation.mutate(deletingCuentaId)}
        title="Eliminar Cuenta de Pago"
        message="¿Estás seguro que deseas eliminar esta cuenta de pago? Ya no se mostrará a los tenants."
        confirmText="Eliminar"
        cancelText="Cancelar"
        variant="danger"
        isLoading={deleteCuentaMutation.isPending}
      />
    </div>
  );
}
