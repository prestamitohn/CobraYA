import { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { getLoanById, deleteLoan, getLoanThatRefinanced } from '../services/loanService';
import { getInstallments } from '../services/installmentService';
import { getGastosAdministrativos } from '../services/gastoAdministrativoService';
import { getMultasByPrestamo } from '../services/multaService';
import { ArrowLeft, Calendar, PieChart, AlertCircle, Clock, CreditCard, Trash2, Zap, Edit2, Save, X, Receipt, AlertTriangle, ShieldAlert, RefreshCw, Info } from 'lucide-react';
import { getEstadoPrestamoLabel, getEstadoCuotaLabel } from '../types/cobraya';
import { StatusBadge } from '../components/ui/StatusBadge';
import { formatCurrency, formatDate } from '../utils/formatters';
import { PaymentModal, PagableItem } from '../components/payments/PaymentModal';
import { AplicarMultaModal } from '../components/payments/AplicarMultaModal';
import { RefinanceLoanModal } from '../components/loans/RefinanceLoanModal';
import { ConfirmationModal } from '../components/ui/ConfirmationModal';
import { useToast } from '../context/ToastContext';
import { useLoanAliases } from '../hooks/useLoanAliases';

export function LoanDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { getAlias, setAlias } = useLoanAliases();
  const loanId = id || '';

  const [selectedItem, setSelectedItem] = useState<PagableItem | null>(null);
  const [selectedKind, setSelectedKind] = useState<'cuota' | 'gasto' | 'multa'>('cuota');
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isAdvancePayment, setIsAdvancePayment] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isRefinanceModalOpen, setIsRefinanceModalOpen] = useState(false);
  const [multaCuota, setMultaCuota] = useState<{ id: string; nroCuota: number; monto: number } | null>(null);

  const [isEditingAlias, setIsEditingAlias] = useState(false);
  const [aliasInput, setAliasInput] = useState('');

  const handleSaveAlias = () => {
    setAlias(loanId, aliasInput);
    setIsEditingAlias(false);
    addToast('Alias guardado correctamente', 'success');
  };

  const deleteMutation = useMutation({
    mutationFn: deleteLoan,
    onSuccess: () => {
      addToast('Préstamo eliminado correctamente', 'success');
      navigate('/loans');
    },
    onError: () => {
      addToast('Error al eliminar el préstamo', 'error');
    }
  });

  const { data: loan, isLoading: isLoadingLoan } = useQuery({
    queryKey: ['loan', loanId],
    queryFn: () => getLoanById(loanId),
    enabled: !!loanId,
  });

  const { data: installments, isLoading: isLoadingInstallments } = useQuery({
    queryKey: ['installments', loanId],
    queryFn: () => getInstallments({ prestamoId: loanId }),
    enabled: !!loanId,
  });

  const tieneGastoAdministrativo = !!loan?.gastoAdministrativoMonto;
  const gastoEsPorCuota = loan?.gastoAdministrativoFrecuencia === 'por_cuota';
  const tieneCronogramaGastoAdministrativo = tieneGastoAdministrativo && !gastoEsPorCuota;
  const { data: gastosAdministrativos } = useQuery({
    queryKey: ['gastosAdministrativos', loanId],
    queryFn: () => getGastosAdministrativos(loanId),
    enabled: !!loanId && tieneCronogramaGastoAdministrativo,
  });

  const tieneMulta = !!loan?.multaPorAtrasoMonto;
  const { data: multas } = useQuery({
    queryKey: ['multas', loanId],
    queryFn: () => getMultasByPrestamo(loanId),
    enabled: !!loanId,
  });

  const { data: prestamoRefinanciador } = useQuery({
    queryKey: ['loanThatRefinanced', loanId],
    queryFn: () => getLoanThatRefinanced(loanId),
    enabled: !!loanId && loan?.estado === 'refinanciado',
  });

  const { data: prestamoOriginal } = useQuery({
    queryKey: ['loan', loan?.refinanciadoDeId],
    queryFn: () => getLoanById(loan!.refinanciadoDeId!),
    enabled: !!loan?.refinanciadoDeId,
  });

  const cuotasSaldadas = installments?.filter((i) => i.estado === 'saldada').length ?? 0;
  const lastPendingInstallment = installments?.filter(i => i.estado === 'pendiente')
    .sort((a, b) => b.nroCuota - a.nroCuota)[0];

  const openPayment = (item: PagableItem, kind: 'cuota' | 'gasto' | 'multa', advance = false) => {
    setSelectedItem(item);
    setSelectedKind(kind);
    setIsAdvancePayment(advance);
    setIsPaymentModalOpen(true);
  };

  if (isLoadingLoan || isLoadingInstallments) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  if (!loan) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-red-400">
        <AlertCircle className="h-12 w-12 mb-4" />
        <p>Préstamo no encontrado</p>
        <button
          onClick={() => navigate('/loans')}
          className="mt-4 px-4 py-2 bg-surfaceHighlight rounded-lg text-main hover:bg-surfaceHighlight/80 transition-colors"
        >
          Volver a Préstamos
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/loans')}
            className="p-2 hover:bg-surfaceHighlight rounded-full transition-colors text-muted hover:text-main"
          >
            <ArrowLeft className="h-6 w-6" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-main">
                {loan.cliente ? `Préstamo de ${loan.cliente.nombre} ${loan.cliente.apellido ?? ''}` : 'Préstamo'}
              </h1>
              {isEditingAlias ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={aliasInput}
                    onChange={(e) => setAliasInput(e.target.value)}
                    className="bg-surface/50 border border-border rounded px-2 py-1 text-sm text-main w-40"
                    placeholder="Alias..."
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveAlias();
                      if (e.key === 'Escape') setIsEditingAlias(false);
                    }}
                  />
                  <button onClick={handleSaveAlias} className="p-1 text-green-500 hover:bg-green-500/10 rounded">
                    <Save className="h-4 w-4" />
                  </button>
                  <button onClick={() => setIsEditingAlias(false)} className="p-1 text-red-500 hover:bg-red-500/10 rounded">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 cursor-pointer group" onClick={() => {
                    setAliasInput(getAlias(loan.id));
                    setIsEditingAlias(true);
                  }}>
                  {getAlias(loan.id) ? (
                    <span className="px-2 py-0.5 rounded bg-primary-500/10 text-primary-500 text-sm font-medium italic flex items-center gap-2 hover:bg-primary-500/20 transition-colors">
                      {getAlias(loan.id)}
                      <Edit2 className="h-3 w-3 opacity-50 group-hover:opacity-100" />
                    </span>
                  ) : (
                    <span className="text-sm text-muted hover:text-primary-500 flex items-center gap-1 transition-colors border border-dashed border-border px-2 py-0.5 rounded hover:border-primary-500/50 hover:bg-surfaceHighlight">
                       <Edit2 className="h-3 w-3" />
                       <span className="italic">Agregar alias</span>
                    </span>
                  )}
                </div>
              )}
            </div>
            <p className="text-muted">Detalles y plan de cuotas</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {(loan.estado === 'activo' && lastPendingInstallment) && (
            <button
              onClick={() => openPayment(
                { id: lastPendingInstallment.id, numero: lastPendingInstallment.nroCuota, monto: lastPendingInstallment.monto, saldoPendiente: lastPendingInstallment.saldoPendiente ?? null },
                'cuota',
                true,
              )}
              className="flex items-center gap-2 px-4 py-2 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-500 rounded-lg transition-colors border border-yellow-500/20"
            >
              <Zap className="h-4 w-4" />
              Adelantar Cuota
            </button>
          )}

          {loan.estado === 'activo' && (
            <button
              onClick={() => setIsRefinanceModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary-500/10 hover:bg-primary-500/20 text-primary-500 rounded-lg transition-colors border border-primary-500/20"
            >
              <RefreshCw className="h-4 w-4" />
              Refinanciar
            </button>
          )}

          {(loan.estado === 'activo' || loan.estado === 'finalizado') && (
            <button
              onClick={() => setIsDeleteModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg transition-colors border border-red-500/20"
            >
              <Trash2 className="h-4 w-4" />
              Eliminar
            </button>
          )}
        </div>
      </div>

      {loan.estado === 'refinanciado' && (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 flex items-start gap-3">
          <Info className="h-5 w-5 text-blue-400 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-medium text-blue-400">Este préstamo fue refinanciado</h3>
            <p className="text-sm text-blue-400/80 mt-1">
              {loan.motivoRefinanciamiento && <>Motivo: {loan.motivoRefinanciamiento}. </>}
              Su saldo pendiente pasó a un préstamo nuevo{prestamoRefinanciador ? ':' : '.'}{' '}
              {prestamoRefinanciador && (
                <Link to={`/loans/${prestamoRefinanciador.id}`} className="underline hover:text-blue-300">
                  Ver préstamo nuevo
                </Link>
              )}
            </p>
          </div>
        </div>
      )}

      {loan.refinanciadoDeId && (
        <div className="bg-primary-500/10 border border-primary-500/20 rounded-xl p-4 flex items-start gap-3">
          <RefreshCw className="h-5 w-5 text-primary-500 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-medium text-primary-600 dark:text-primary-400">Este préstamo viene de un refinanciamiento</h3>
            <p className="text-sm text-primary-700 dark:text-primary-200 mt-1">
              Reemplaza al préstamo original.{' '}
              {prestamoOriginal && (
                <Link to={`/loans/${prestamoOriginal.id}`} className="underline hover:text-primary-500">
                  Ver préstamo original
                </Link>
              )}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Loan Info Card */}
        <div className="glass-panel p-6 rounded-xl border border-border space-y-6">
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-main flex items-center gap-2">
              <PieChart className="h-5 w-5 text-primary-500" />
              Información General
            </h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted">Cliente</span>
                <span className="text-main font-medium">{loan.cliente ? `${loan.cliente.nombre} ${loan.cliente.apellido ?? ''}` : 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Monto Otorgado</span>
                <span className="text-main font-medium">{formatCurrency(loan.montoOtorgado)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Tasa Interés</span>
                <span className="text-main font-medium">{loan.tasaInteres}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Frecuencia de Cobro</span>
                <span className="text-main font-medium capitalize">{loan.frecuenciaCobro}</span>
              </div>
              {tieneGastoAdministrativo && (
                <div className="flex justify-between">
                  <span className="text-muted">Gasto Administrativo</span>
                  <span className="text-main font-medium">
                    {formatCurrency(loan.gastoAdministrativoMonto!)} {gastoEsPorCuota
                      ? '(incluido en cada cuota)'
                      : <>/ <span className="capitalize">{loan.gastoAdministrativoFrecuencia}</span></>}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted">Fecha Otorgamiento</span>
                <span className="text-main font-medium">{formatDate(loan.fechaOtorgamiento)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Estado</span>
                <StatusBadge variant={
                  loan.estado === 'activo' ? 'success' :
                  loan.estado === 'finalizado' ? 'default' :
                  loan.estado === 'eliminado' ? 'error' :
                  loan.estado === 'refinanciado' ? 'warning' : 'default'
                }>
                  {getEstadoPrestamoLabel(loan.estado)}
                </StatusBadge>
              </div>
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-border">
            <h2 className="text-lg font-semibold text-main flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary-500" />
              Estadísticas
            </h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted">Cuotas Totales</span>
                <span className="text-main font-medium">{loan.cantidadCuotas}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Cuotas Pagadas</span>
                <span className="text-main font-medium">{cuotasSaldadas}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Saldo Restante</span>
                <span className="text-main font-medium">{formatCurrency(loan.saldoRestante)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Installments Table */}
        <div className="md:col-span-2 glass-panel rounded-xl border border-border overflow-hidden">
          <div className="p-6 border-b border-border">
            <h2 className="text-lg font-semibold text-main flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary-500" />
              Plan de Cuotas
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-surfaceHighlight text-muted">
                <tr>
                  <th className="px-6 py-3 font-medium">#</th>
                  <th className="px-6 py-3 font-medium">Vencimiento</th>
                  <th className="px-6 py-3 font-medium">Monto</th>
                  <th className="px-6 py-3 font-medium">Saldo</th>
                  <th className="px-6 py-3 font-medium">Estado</th>
                  <th className="px-6 py-3 font-medium text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {installments?.map((cuota) => (
                  <tr key={cuota.id} className="hover:bg-surfaceHighlight/50 transition-colors">
                    <td className="px-6 py-4 font-medium text-main">
                      {cuota.nroCuota.toString().padStart(2, '0')}/{loan.cantidadCuotas}
                    </td>
                    <td className="px-6 py-4 text-muted">{formatDate(cuota.fechaVto)}</td>
                    <td className="px-6 py-4 text-main">{formatCurrency(cuota.monto)}</td>
                    <td className="px-6 py-4 text-main">{cuota.saldoPendiente != null ? formatCurrency(cuota.saldoPendiente) : '-'}</td>
                    <td className="px-6 py-4">
                      <StatusBadge variant={
                        cuota.estado === 'saldada' ? 'success' :
                        cuota.estado === 'pendiente' ? 'warning' :
                        'error'
                      }>
                        {getEstadoCuotaLabel(cuota.estado)}
                      </StatusBadge>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {cuota.estado === 'vencida' && (
                          <button
                            onClick={() => setMultaCuota({ id: cuota.id, nroCuota: cuota.nroCuota, monto: loan.multaPorAtrasoMonto ?? 0 })}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-lg text-xs font-medium transition-colors"
                          >
                            <AlertTriangle className="h-3.5 w-3.5" />
                            No Pagó
                          </button>
                        )}
                        {cuota.estado !== 'saldada' && (
                          <button
                            onClick={() => openPayment(
                              { id: cuota.id, numero: cuota.nroCuota, monto: cuota.monto, saldoPendiente: cuota.saldoPendiente ?? null },
                              'cuota',
                            )}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary-500/10 text-primary-500 hover:bg-primary-500/20 rounded-lg text-xs font-medium transition-colors"
                          >
                            <CreditCard className="h-3.5 w-3.5" />
                            Pagar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!installments?.length && (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-muted">
                      No hay cuotas registradas para este préstamo.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {tieneCronogramaGastoAdministrativo && (
          <div className="md:col-span-3 glass-panel rounded-xl border border-border overflow-hidden">
            <div className="p-6 border-b border-border">
              <h2 className="text-lg font-semibold text-main flex items-center gap-2">
                <Receipt className="h-5 w-5 text-primary-500" />
                Gastos Administrativos
              </h2>
              <p className="text-sm text-muted mt-1">
                Cargo aparte de capital e interés, cobrado {loan.gastoAdministrativoFrecuencia === 'semanal' ? 'semanalmente' : 'mensualmente'}.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-surfaceHighlight text-muted">
                  <tr>
                    <th className="px-6 py-3 font-medium">#</th>
                    <th className="px-6 py-3 font-medium">Vencimiento</th>
                    <th className="px-6 py-3 font-medium">Monto</th>
                    <th className="px-6 py-3 font-medium">Saldo</th>
                    <th className="px-6 py-3 font-medium">Estado</th>
                    <th className="px-6 py-3 font-medium text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {gastosAdministrativos?.map((gasto) => (
                    <tr key={gasto.id} className="hover:bg-surfaceHighlight/50 transition-colors">
                      <td className="px-6 py-4 font-medium text-main">{gasto.numero.toString().padStart(2, '0')}</td>
                      <td className="px-6 py-4 text-muted">{formatDate(gasto.fechaVto)}</td>
                      <td className="px-6 py-4 text-main">{formatCurrency(gasto.monto)}</td>
                      <td className="px-6 py-4 text-main">{formatCurrency(gasto.saldoPendiente)}</td>
                      <td className="px-6 py-4">
                        <StatusBadge variant={
                          gasto.estado === 'saldada' ? 'success' :
                          gasto.estado === 'pendiente' ? 'warning' :
                          'error'
                        }>
                          {getEstadoCuotaLabel(gasto.estado)}
                        </StatusBadge>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {gasto.estado !== 'saldada' && (
                          <button
                            onClick={() => openPayment(
                              { id: gasto.id, numero: gasto.numero, monto: gasto.monto, saldoPendiente: gasto.saldoPendiente },
                              'gasto',
                            )}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary-500/10 text-primary-500 hover:bg-primary-500/20 rounded-lg text-xs font-medium transition-colors"
                          >
                            <CreditCard className="h-3.5 w-3.5" />
                            Pagar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!gastosAdministrativos?.length && (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-muted">
                        No hay cargos de gasto administrativo generados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {(tieneMulta || !!multas?.length) && (
          <div className="md:col-span-3 glass-panel rounded-xl border border-border overflow-hidden">
            <div className="p-6 border-b border-border">
              <h2 className="text-lg font-semibold text-main flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-red-500" />
                Multas
              </h2>
              <p className="text-sm text-muted mt-1">
                Cargos por mora, aplicados automáticamente al vencer una cuota o manualmente al marcar "No Pagó".
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-surfaceHighlight text-muted">
                  <tr>
                    <th className="px-6 py-3 font-medium">Motivo</th>
                    <th className="px-6 py-3 font-medium">Fecha Incumplimiento</th>
                    <th className="px-6 py-3 font-medium">Monto</th>
                    <th className="px-6 py-3 font-medium">Saldo</th>
                    <th className="px-6 py-3 font-medium">Estado</th>
                    <th className="px-6 py-3 font-medium text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {multas?.map((multa) => (
                    <tr key={multa.id} className="hover:bg-surfaceHighlight/50 transition-colors">
                      <td className="px-6 py-4 text-main">{multa.motivo}</td>
                      <td className="px-6 py-4 text-muted">{formatDate(multa.fechaIncumplimiento)}</td>
                      <td className="px-6 py-4 text-main">{formatCurrency(multa.monto)}</td>
                      <td className="px-6 py-4 text-main">{formatCurrency(multa.saldoPendiente)}</td>
                      <td className="px-6 py-4">
                        <StatusBadge variant={
                          multa.estado === 'saldada' ? 'success' :
                          multa.estado === 'pendiente' ? 'warning' :
                          'error'
                        }>
                          {getEstadoCuotaLabel(multa.estado)}
                        </StatusBadge>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {multa.estado !== 'saldada' && (
                          <button
                            onClick={() => openPayment(
                              { id: multa.id, numero: 0, monto: multa.monto, saldoPendiente: multa.saldoPendiente },
                              'multa',
                            )}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary-500/10 text-primary-500 hover:bg-primary-500/20 rounded-lg text-xs font-medium transition-colors"
                          >
                            <CreditCard className="h-3.5 w-3.5" />
                            Pagar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!multas?.length && (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-muted">
                        No hay multas registradas para este préstamo.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <AplicarMultaModal
        isOpen={!!multaCuota}
        onClose={() => setMultaCuota(null)}
        cuotaId={multaCuota?.id ?? null}
        nroCuota={multaCuota?.nroCuota}
        montoSugerido={multaCuota?.monto}
      />

      <RefinanceLoanModal
        isOpen={isRefinanceModalOpen}
        onClose={() => setIsRefinanceModalOpen(false)}
        prestamoId={loan.id}
        saldoRestante={loan.saldoRestante}
        tasaInteresActual={loan.tasaInteres}
        sistemaAmortizacionActual={loan.sistemaAmortizacion}
        frecuenciaCobroActual={loan.frecuenciaCobro}
      />

      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => {
          setIsPaymentModalOpen(false);
          setSelectedItem(null);
          setIsAdvancePayment(false);
        }}
        item={selectedItem}
        kind={selectedKind}
        isAdvance={isAdvancePayment}
      />

      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={() => deleteMutation.mutate(loanId)}
        title="Eliminar Préstamo - ¡Acción Peligrosa!"
        message="¡Atención! Si desea archivar el préstamo, debe marcar todas sus cuotas como pagadas. Solo elimine el préstamo si fue creado por error con datos incorrectos. Esta acción es irreversible."
        confirmText="Eliminar definitivamente"
        cancelText="Cancelar"
        variant="danger"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
