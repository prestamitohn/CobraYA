import { useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getBorrowerByDocumento, updateBorrower } from '../services/borrowerService';
import { getLoans } from '../services/loanService';
import { getClasificacionesClientes, establecerClasificacionManual, quitarClasificacionManual } from '../services/clasificacionService';
import { getAportacionesByCliente, getCuentasAhorroByCliente } from '../services/cooperativaService';
import { getMyTenant } from '../services/tenantService';
import { ArrowLeft, User, Users, Edit, Save, X, ShieldAlert, TrendingUp, UserCog, RotateCcw, PiggyBank, Plus, KeyRound, CheckCircle2, Receipt, Loader2 } from 'lucide-react';
import { getEstadoPrestamoLabel, getClasificacionLabel, getClasificacionColorClass, ClasificacionCliente, getTipoAportacionLabel, Aportacion } from '../types/cobraya';
import { StatusBadge } from '../components/ui/StatusBadge';
import { WhatsappButton } from '../components/ui/WhatsappButton';
import { AportacionModal } from '../components/cooperativa/AportacionModal';
import { InvitarSocioModal } from '../components/cooperativa/InvitarSocioModal';
import { AbrirCuentaAhorroModal } from '../components/cooperativa/AbrirCuentaAhorroModal';
import { MovimientoAhorroModal } from '../components/cooperativa/MovimientoAhorroModal';
import { CuentaAhorro } from '../types/cobraya';
import { formatCurrency, formatDate } from '../utils/formatters';
import { useToast } from '../context/ToastContext';

export function BorrowerDetails() {
  const { documento } = useParams<{ documento: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { addToast } = useToast();

  const { data: tenant } = useQuery({ queryKey: ['tenant'], queryFn: getMyTenant });
  const esCooperativa = tenant?.tipoTenant === 'cooperativa';

  const validTabs = ['info', 'loans', 'aportaciones', 'ahorros'];
  const tabParam = searchParams.get('tab');
  const initialTab = validTabs.includes(tabParam || '') ? (tabParam as 'info' | 'loans' | 'aportaciones' | 'ahorros') : 'info';
  const [activeTab, setActiveTab] = useState<'info' | 'loans' | 'aportaciones' | 'ahorros'>(initialTab);
  const [isAportacionModalOpen, setIsAportacionModalOpen] = useState(false);
  const [isInvitarSocioModalOpen, setIsInvitarSocioModalOpen] = useState(false);
  const [isAbrirCuentaModalOpen, setIsAbrirCuentaModalOpen] = useState(false);
  const [cuentaSeleccionada, setCuentaSeleccionada] = useState<CuentaAhorro | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<{ correo?: string; telefono?: string; domicilio?: string }>({});

  const [isEditingClasificacion, setIsEditingClasificacion] = useState(false);
  const [manualClasificacion, setManualClasificacion] = useState<ClasificacionCliente>('bueno');
  const [manualMotivo, setManualMotivo] = useState('');

  const { data: borrower, isLoading: isLoadingBorrower } = useQuery({
    queryKey: ['borrower', documento],
    queryFn: () => getBorrowerByDocumento(documento!),
    enabled: !!documento,
  });

  const { data: loans } = useQuery({
    queryKey: ['loans'],
    queryFn: getLoans,
  });

  const { data: clasificaciones } = useQuery({
    queryKey: ['clasificaciones'],
    queryFn: getClasificacionesClientes,
  });

  const { data: aportaciones } = useQuery({
    queryKey: ['aportacionesCliente', borrower?.id],
    queryFn: () => getAportacionesByCliente(borrower!.id),
    enabled: esCooperativa && !!borrower?.id,
  });

  const { data: cuentasAhorro } = useQuery({
    queryKey: ['cuentasAhorroCliente', borrower?.id],
    queryFn: () => getCuentasAhorroByCliente(borrower!.id),
    enabled: esCooperativa && !!borrower?.id,
  });

  const saldoAportaciones = (aportaciones ?? []).reduce(
    (acc, a) => acc + (a.tipo === 'retiro' ? -a.monto : a.monto),
    0,
  );

  const [generandoReciboId, setGenerandoReciboId] = useState<string | null>(null);

  const handleDescargarReciboAportacion = async (a: Aportacion) => {
    if (!borrower) return;
    setGenerandoReciboId(a.id);
    try {
      const { exportReciboAportacion } = await import('../utils/pdfGenerator');
      await exportReciboAportacion(
        {
          id: a.id,
          tipoLabel: getTipoAportacionLabel(a.tipo),
          monto: a.monto,
          fecha: a.fecha,
          observaciones: a.observaciones,
          // Saldo actual del socio — para aportaciones antiguas no refleja el saldo
          // justo después de ese movimiento en particular, solo el saldo de hoy.
          saldoNuevo: saldoAportaciones,
          clienteNombre: `${borrower.nombre} ${borrower.apellido ?? ''}`.trim(),
          clienteDocumento: borrower.documento,
        },
        { nombre: tenant?.nombre || 'CobraYA', logoUrl: tenant?.logoUrl, rtn: tenant?.rtn },
      );
    } finally {
      setGenerandoReciboId(null);
    }
  };

  const mensajeWhatsappAportacion = (a: Aportacion) =>
    `Hola ${borrower?.nombre}, registramos tu aportación ${getTipoAportacionLabel(a.tipo).toLowerCase()} de ${formatCurrency(a.monto)} el ${formatDate(a.fecha)}. Tu saldo de aportaciones es ${formatCurrency(saldoAportaciones)}. — ${tenant?.nombre || 'CobraYA'}`;

  const borrowerLoans = loans?.filter((l) => l.clienteId === borrower?.id) || [];
  const clasificacion = clasificaciones?.find((c) => c.clienteId === borrower?.id);

  const updateMutation = useMutation({
    mutationFn: (data: { correo?: string; telefono?: string; domicilio?: string }) =>
      updateBorrower(borrower!.id, { nombre: borrower!.nombre, apellido: borrower!.apellido || undefined, ...data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['borrower', documento] });
      queryClient.invalidateQueries({ queryKey: ['borrowers'] });
      setIsEditing(false);
      addToast('Cliente actualizado correctamente', 'success');
    },
    onError: () => {
      addToast('Error al actualizar el cliente', 'error');
    }
  });

  const startEdit = () => {
    if (borrower) {
      setEditForm({
        telefono: borrower.telefono || '',
        domicilio: borrower.domicilio || '',
        correo: borrower.correo || '',
      });
      setIsEditing(true);
    }
  };

  const saveEdit = () => updateMutation.mutate(editForm);

  const setManualMutation = useMutation({
    mutationFn: () => establecerClasificacionManual(borrower!.id, manualClasificacion, manualMotivo.trim() || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clasificaciones'] });
      setIsEditingClasificacion(false);
      addToast('Clasificación manual guardada', 'success');
    },
    onError: () => {
      addToast('Error al guardar la clasificación manual', 'error');
    }
  });

  const clearManualMutation = useMutation({
    mutationFn: () => quitarClasificacionManual(borrower!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clasificaciones'] });
      addToast('Se volvió a la clasificación automática', 'success');
    },
    onError: () => {
      addToast('Error al quitar la clasificación manual', 'error');
    }
  });

  const startEditClasificacion = () => {
    setManualClasificacion(clasificacion?.clasificacion ?? 'bueno');
    setManualMotivo(clasificacion?.clasificacionManualMotivo ?? '');
    setIsEditingClasificacion(true);
  };

  if (isLoadingBorrower) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  if (!borrower) return <div>Cliente no encontrado</div>;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/borrowers')} className="p-2 hover:bg-surfaceHighlight rounded-full text-muted hover:text-main">
          <ArrowLeft className="h-6 w-6" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-main">{borrower.nombre} {borrower.apellido}</h1>
          <p className="text-muted">Identidad: {borrower.documento}</p>
        </div>
      </div>

      <div className="flex border-b border-border overflow-x-auto">
        <button
          onClick={() => setActiveTab('info')}
          className={`px-4 py-2 border-b-2 transition-colors whitespace-nowrap flex-shrink-0 ${activeTab === 'info' ? 'border-primary-500 text-primary-500' : 'border-transparent text-muted hover:text-main'}`}
        >
          Información
        </button>
        <button
          onClick={() => setActiveTab('loans')}
          className={`px-4 py-2 border-b-2 transition-colors whitespace-nowrap flex-shrink-0 ${activeTab === 'loans' ? 'border-primary-500 text-primary-500' : 'border-transparent text-muted hover:text-main'}`}
        >
          Préstamos ({borrowerLoans.length})
        </button>
        {esCooperativa && (
          <button
            onClick={() => setActiveTab('aportaciones')}
            className={`px-4 py-2 border-b-2 transition-colors whitespace-nowrap flex-shrink-0 ${activeTab === 'aportaciones' ? 'border-primary-500 text-primary-500' : 'border-transparent text-muted hover:text-main'}`}
          >
            Aportaciones
          </button>
        )}
        {esCooperativa && (
          <button
            onClick={() => setActiveTab('ahorros')}
            className={`px-4 py-2 border-b-2 transition-colors whitespace-nowrap flex-shrink-0 ${activeTab === 'ahorros' ? 'border-primary-500 text-primary-500' : 'border-transparent text-muted hover:text-main'}`}
          >
            Ahorros
          </button>
        )}
      </div>

      <div className="mt-6">
        {activeTab === 'info' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {clasificacion && (
              <div className="md:col-span-2 glass-panel p-6 rounded-xl border border-border space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h3 className="font-semibold text-lg text-main flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-primary-500" /> Clasificación de Comportamiento de Pago
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className={`px-3 py-1 rounded-lg text-sm font-semibold border ${getClasificacionColorClass(clasificacion.clasificacion)}`}>
                      {getClasificacionLabel(clasificacion.clasificacion)}
                    </span>
                    {clasificacion.esManual && (
                      <span className="px-2 py-1 rounded-md text-xs font-medium bg-surfaceHighlight text-muted border border-border">
                        Manual
                      </span>
                    )}
                    {!isEditingClasificacion && (
                      <button
                        onClick={startEditClasificacion}
                        title="Clasificar manualmente"
                        className="p-1.5 hover:bg-surfaceHighlight rounded-lg text-muted hover:text-primary-500 transition-colors"
                      >
                        <UserCog className="h-4 w-4" />
                      </button>
                    )}
                    {clasificacion.esManual && !isEditingClasificacion && (
                      <button
                        onClick={() => clearManualMutation.mutate()}
                        disabled={clearManualMutation.isPending}
                        title="Volver a clasificación automática"
                        className="p-1.5 hover:bg-red-500/10 rounded-lg text-muted hover:text-red-500 transition-colors"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                {isEditingClasificacion && (
                  <div className="rounded-xl border border-border bg-surfaceHighlight/30 p-4 space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-muted mb-1">Clasificación manual</label>
                      <select
                        value={manualClasificacion}
                        onChange={(e) => setManualClasificacion(e.target.value as ClasificacionCliente)}
                        className="w-full bg-surface/50 border border-border rounded-lg px-3 py-2 text-sm text-main focus:outline-none focus:border-primary-500 [&>option]:bg-surface"
                      >
                        <option value="excelente">Excelente</option>
                        <option value="bueno">Bueno</option>
                        <option value="regular">Regular</option>
                        <option value="malo">Malo</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted mb-1">Motivo (opcional)</label>
                      <input
                        type="text"
                        value={manualMotivo}
                        onChange={(e) => setManualMotivo(e.target.value)}
                        placeholder="Ej. Referencia personal confiable, cliente conocido..."
                        className="w-full bg-surface/50 border border-border rounded-lg px-3 py-2 text-sm text-main focus:outline-none focus:border-primary-500"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setIsEditingClasificacion(false)}
                        className="px-3 py-1.5 text-sm text-muted hover:text-main transition-colors"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={() => setManualMutation.mutate()}
                        disabled={setManualMutation.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                      >
                        <Save className="h-3.5 w-3.5" />
                        Guardar
                      </button>
                    </div>
                  </div>
                )}

                {clasificacion.esManual && clasificacion.clasificacionManualMotivo && !isEditingClasificacion && (
                  <p className="text-sm text-muted italic">Motivo: {clasificacion.clasificacionManualMotivo}</p>
                )}

                {clasificacion.noRecomendadoRefinanciamiento && (
                  <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/5 border border-red-500/20 rounded-lg px-3 py-2">
                    <ShieldAlert className="h-4 w-4 flex-shrink-0" />
                    Cliente no recomendado para refinanciamiento
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-muted block">% Cumplimiento</span>
                    <span className="text-main font-medium text-lg">{clasificacion.porcentajeCumplimiento}%</span>
                  </div>
                  <div>
                    <span className="text-muted block">Cuotas a Tiempo</span>
                    <span className="text-main font-medium text-lg">{clasificacion.cuotasPagadasATiempo}</span>
                  </div>
                  <div>
                    <span className="text-muted block">Cuotas Tardías</span>
                    <span className="text-main font-medium text-lg">{clasificacion.cuotasPagadasTarde}</span>
                  </div>
                  <div>
                    <span className="text-muted block">Vencidas / Multas Activas</span>
                    <span className="text-main font-medium text-lg">{clasificacion.cuotasVencidasActuales} / {clasificacion.multasActivas}</span>
                  </div>
                </div>
              </div>
            )}

            <div className="glass-panel p-6 rounded-xl border border-border space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-lg text-main flex items-center gap-2">
                  <User className="h-5 w-5 text-primary-500" /> Datos Personales
                </h3>
                {!isEditing ? (
                  <button
                    onClick={startEdit}
                    className="p-1.5 hover:bg-surfaceHighlight rounded-lg text-muted hover:text-primary-500 transition-colors"
                  >
                    <Edit className="h-4 w-4" />
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsEditing(false)}
                      className="p-1.5 hover:bg-red-500/10 rounded-lg text-muted hover:text-red-500 transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                    <button
                      onClick={saveEdit}
                      disabled={updateMutation.isPending}
                      className="p-1.5 hover:bg-green-500/10 rounded-lg text-muted hover:text-green-500 transition-colors"
                    >
                      <Save className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>

              {!isEditing ? (
                <div className="space-y-2 text-sm">
                  <p><span className="text-muted">Email:</span> {borrower.correo}</p>
                  <p><span className="text-muted">Teléfono:</span> {borrower.telefono}</p>
                  <p><span className="text-muted">Dirección:</span> {borrower.domicilio}</p>
                  <p><span className="text-muted">Estado:</span>
                    <span className={`ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${borrower.activo ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                      {borrower.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-muted mb-1">Email</label>
                    <input
                      type="email"
                      value={editForm.correo || ''}
                      onChange={e => setEditForm(prev => ({ ...prev, correo: e.target.value }))}
                      className="w-full bg-surface/50 border border-border rounded-lg px-3 py-2 text-sm text-main focus:outline-none focus:border-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted mb-1">Teléfono</label>
                    <input
                      type="text"
                      value={editForm.telefono || ''}
                      onChange={e => setEditForm(prev => ({ ...prev, telefono: e.target.value }))}
                      className="w-full bg-surface/50 border border-border rounded-lg px-3 py-2 text-sm text-main focus:outline-none focus:border-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted mb-1">Dirección</label>
                    <input
                      type="text"
                      value={editForm.domicilio || ''}
                      onChange={e => setEditForm(prev => ({ ...prev, domicilio: e.target.value }))}
                      className="w-full bg-surface/50 border border-border rounded-lg px-3 py-2 text-sm text-main focus:outline-none focus:border-primary-500"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="glass-panel p-6 rounded-xl border border-border space-y-4">
               <h3 className="font-semibold text-lg text-main flex items-center gap-2">
                 <Users className="h-5 w-5 text-primary-500" /> Datos del Garante
               </h3>
               {borrower.garante ? (
                 <div className="space-y-2 text-sm">
                   <p><span className="text-muted">Nombre:</span> {borrower.garante.nombre} {borrower.garante.apellido}</p>
                   <p><span className="text-muted">Identidad:</span> {borrower.garante.documento}</p>
                   {borrower.garante.telefono && <p><span className="text-muted">Teléfono:</span> {borrower.garante.telefono}</p>}
                   {borrower.garante.domicilio && <p><span className="text-muted">Dirección:</span> {borrower.garante.domicilio}</p>}
                 </div>
               ) : (
                 <div className="flex flex-col items-center justify-center py-4 text-muted">
                   <p className="italic">No hay garante asignado</p>
                 </div>
               )}
             </div>
          </div>
        )}

        {activeTab === 'loans' && (
           <div className="glass-panel rounded-xl overflow-hidden border border-border">
             <div className="overflow-x-auto">
             <table className="w-full text-left text-sm">
               <thead className="bg-surfaceHighlight text-muted">
                 <tr>
                   <th className="px-6 py-3 font-medium">Monto</th>
                   <th className="px-6 py-3 font-medium">Estado</th>
                   <th className="px-6 py-3 font-medium">Acciones</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-border">
                 {borrowerLoans.map(loan => (
                   <tr key={loan.id} className="hover:bg-surfaceHighlight/50 transition-colors">
                     <td className="px-6 py-4 text-main">{formatCurrency(loan.montoOtorgado)}</td>
                     <td className="px-6 py-4">
                        <StatusBadge variant={
                          loan.estado === 'activo' ? 'success' :
                          loan.estado === 'finalizado' ? 'warning' : 'error'
                        }>
                         {getEstadoPrestamoLabel(loan.estado)}
                       </StatusBadge>
                     </td>
                     <td className="px-6 py-4">
                       <button
                         onClick={() => navigate(`/loans/${loan.id}`)}
                         className="text-primary-400 hover:text-primary-300 font-medium hover:underline"
                       >
                         Ver detalles
                       </button>
                     </td>
                   </tr>
                 ))}
                 {borrowerLoans.length === 0 && (
                   <tr>
                     <td colSpan={3} className="px-6 py-8 text-center text-muted">
                       Este cliente no tiene préstamos registrados
                     </td>
                   </tr>
                 )}
               </tbody>
             </table>
             </div>
           </div>
        )}

        {activeTab === 'aportaciones' && esCooperativa && (
          <div className="space-y-4">
            <div className="glass-panel p-4 rounded-xl border border-border flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-3 rounded-lg bg-primary-500/10 text-primary-500 flex-shrink-0">
                  <PiggyBank className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-muted truncate">Saldo de aportaciones</p>
                  <p className="text-xl font-bold text-main truncate">{formatCurrency(saldoAportaciones)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {borrower.usuarioId ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500/10 text-emerald-500 text-sm font-medium">
                    <CheckCircle2 className="h-4 w-4" /> Tiene acceso al portal
                  </span>
                ) : (
                  <button
                    onClick={() => setIsInvitarSocioModalOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-surfaceHighlight border border-border hover:border-primary-500 text-main rounded-lg text-sm font-medium transition-colors"
                  >
                    <KeyRound className="h-4 w-4" />
                    Dar Acceso al Portal
                  </button>
                )}
                <button
                  onClick={() => setIsAportacionModalOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  Registrar Aportación
                </button>
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
                      <th className="px-6 py-3 font-medium text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {aportaciones?.map((a) => (
                      <tr key={a.id} className="hover:bg-surfaceHighlight/50 transition-colors">
                        <td className="px-6 py-4 text-muted">{formatDate(a.fecha)}</td>
                        <td className="px-6 py-4">
                          <StatusBadge variant={a.tipo === 'retiro' ? 'error' : 'success'}>
                            {getTipoAportacionLabel(a.tipo)}
                          </StatusBadge>
                        </td>
                        <td className="px-6 py-4 text-muted">{a.observaciones || '-'}</td>
                        <td className={`px-6 py-4 text-right font-medium ${a.tipo === 'retiro' ? 'text-red-400' : 'text-main'}`}>
                          {a.tipo === 'retiro' ? '- ' : ''}{formatCurrency(a.monto)}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-2 flex-wrap">
                            <button
                              onClick={() => handleDescargarReciboAportacion(a)}
                              disabled={generandoReciboId === a.id}
                              title="Descargar recibo"
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-primary-500/10 text-primary-500 hover:bg-primary-500/20 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                            >
                              {generandoReciboId === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Receipt className="h-3.5 w-3.5" />}
                              Recibo
                            </button>
                            <WhatsappButton telefono={borrower.telefono} mensaje={mensajeWhatsappAportacion(a)} />
                          </div>
                        </td>
                      </tr>
                    ))}
                    {(aportaciones?.length ?? 0) === 0 && (
                      <tr>
                        <td colSpan={5} className="px-6 py-8 text-center text-muted">
                          Este socio no tiene aportaciones registradas
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'ahorros' && esCooperativa && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <button
                onClick={() => setIsAbrirCuentaModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <Plus className="h-4 w-4" />
                Abrir Cuenta
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {cuentasAhorro?.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCuentaSeleccionada(c)}
                  className="glass-panel p-4 rounded-xl border border-border text-left hover:border-primary-500/50 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-sm font-medium text-main truncate">{c.numeroCuenta}</span>
                    <StatusBadge variant={c.estado === 'activa' ? 'success' : c.estado === 'vencida' ? 'error' : 'default'}>{c.estado}</StatusBadge>
                  </div>
                  <p className="text-2xl font-bold text-main">{formatCurrency(c.saldo)}</p>
                  <p className="text-xs text-muted mt-1">Abierta el {formatDate(c.fechaApertura)}</p>
                </button>
              ))}
              {(cuentasAhorro?.length ?? 0) === 0 && (
                <div className="md:col-span-2 glass-panel rounded-xl border border-border p-8 text-center text-muted">
                  Este socio no tiene cuentas de ahorro
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {esCooperativa && borrower && (
        <>
          <AportacionModal
            isOpen={isAportacionModalOpen}
            onClose={() => setIsAportacionModalOpen(false)}
            clienteIdFijo={borrower.id}
            clienteNombreFijo={`${borrower.nombre} ${borrower.apellido ?? ''}`}
          />
          <InvitarSocioModal
            isOpen={isInvitarSocioModalOpen}
            onClose={() => setIsInvitarSocioModalOpen(false)}
            clienteId={borrower.id}
            clienteNombre={`${borrower.nombre} ${borrower.apellido ?? ''}`}
          />
          <AbrirCuentaAhorroModal
            isOpen={isAbrirCuentaModalOpen}
            onClose={() => setIsAbrirCuentaModalOpen(false)}
            clienteId={borrower.id}
          />
          <MovimientoAhorroModal
            isOpen={!!cuentaSeleccionada}
            onClose={() => setCuentaSeleccionada(null)}
            cuenta={cuentaSeleccionada}
            cliente={borrower}
          />
        </>
      )}
    </div>
  );
}
