import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { simulateLoan, createLoan } from '../../services/loanService';
import { getBorrowers } from '../../services/borrowerService';
import type { SimulacionResultado } from '../../lib/amortizacion';
import { SISTEMAS_AMORTIZACION, FRECUENCIAS_COBRO } from '../../types/cobraya';
import { Loader2, Calculator, CheckCircle, User, Search } from 'lucide-react';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { ConfirmationModal } from '../ui/ConfirmationModal';
import { CurrencyInput } from '../ui/CurrencyInput';

import { useToast } from '../../context/ToastContext';
import { useLoanAliases } from '../../hooks/useLoanAliases';

const loanSchema = z.object({
  clienteId: z.string().min(1, 'Debe seleccionar un cliente'),
  montoOtorgado: z.number().refine((val) => !Number.isNaN(val), { message: 'El monto es obligatorio' }).refine((val) => val >= 50, { message: 'El monto debe ser mayor o igual a 50' }),
  cantidadCuotas: z.number().refine((val) => !Number.isNaN(val), { message: 'La cantidad de cuotas es obligatoria' }).refine((val) => val >= 1, { message: 'Debe haber al menos 1 cuota' }),
  tasaInteres: z.number().refine((val) => !Number.isNaN(val), { message: 'La tasa de interés es obligatoria' }).refine((val) => val >= 0, { message: 'La tasa no puede ser negativa' }),
  sistemaAmortizacion: z.enum(['directo', 'frances', 'aleman', 'americano']),
  frecuenciaCobro: z.enum(['diario', 'semanal', 'quincenal', 'mensual']),
  fechaOtorgamiento: z.string().refine((val) => !isNaN(Date.parse(val)), { message: 'Fecha inválida' }),
});

type LoanFormData = z.infer<typeof loanSchema>;

export function LoanForm() {
  const { addToast } = useToast();
  const { setAlias } = useLoanAliases();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [simulation, setSimulation] = useState<SimulacionResultado | null>(null);
  const [alias, setAliasInput] = useState('');
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false);
  const [pendingData, setPendingData] = useState<LoanFormData | null>(null);

  const { register, handleSubmit, formState: { errors }, getValues, reset, control } = useForm<LoanFormData>({
    resolver: zodResolver(loanSchema),
    defaultValues: {
      clienteId: '',
      sistemaAmortizacion: 'directo',
      frecuenciaCobro: 'mensual',
      tasaInteres: 10,
      cantidadCuotas: 12,
      fechaOtorgamiento: new Date().toISOString().split('T')[0],
    }
  });

  const { data: borrowers } = useQuery({
    queryKey: ['borrowers'],
    queryFn: () => getBorrowers(),
  });

  const createMutation = useMutation({
    mutationFn: createLoan,
    onSuccess: (data) => {
      if (data.prestamoId && alias.trim()) {
        setAlias(data.prestamoId, alias.trim());
      }
      addToast('Préstamo creado exitosamente!', 'success');
      setSimulation(null);
      reset();
      setAliasInput('');
      setIsConfirmationOpen(false);
      queryClient.invalidateQueries({ queryKey: ['loans'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardKpis'] });
      navigate('/loans');
    },
    onError: (error: any) => {
      addToast(error.message || 'Error al crear préstamo', 'error');
      setIsConfirmationOpen(false);
    }
  });

  const onSimulate = () => {
    const data = getValues();
    if (!data.montoOtorgado || !data.cantidadCuotas || data.tasaInteres === undefined) return;
    try {
      const resultado = simulateLoan({
        montoPrestamo: Number(data.montoOtorgado),
        cantidadCuotas: Number(data.cantidadCuotas),
        tasaInteres: Number(data.tasaInteres),
        fechaInicio: new Date(`${data.fechaOtorgamiento}T00:00:00Z`),
        sistemaAmortizacion: data.sistemaAmortizacion,
        frecuenciaCobro: data.frecuenciaCobro,
      });
      setSimulation(resultado);
    } catch (err: any) {
      addToast(err.message || 'No se pudo simular el préstamo', 'error');
    }
  };

  const onSubmit = (data: LoanFormData) => {
    setPendingData(data);
    setIsConfirmationOpen(true);
  };

  const handleConfirmCreate = () => {
    if (!pendingData) return;

    createMutation.mutate({
      clienteId: pendingData.clienteId,
      montoPrestamo: Number(pendingData.montoOtorgado),
      cantidadCuotas: Number(pendingData.cantidadCuotas),
      tasaInteres: Number(pendingData.tasaInteres),
      sistemaAmortizacion: pendingData.sistemaAmortizacion,
      frecuenciaCobro: pendingData.frecuenciaCobro,
      fechaOtorgamiento: pendingData.fechaOtorgamiento,
      moneda: 'HNL',
    });
  };

  const totalInteres = simulation?.detalleCuotas.reduce((acc, curr) => acc + curr.interes, 0) || 0;
  const selectedBorrower = borrowers?.find((b) => b.id === getValues('clienteId'));

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Form */}
      <div className="glass-panel p-6">
        <h2 className="mb-6 text-xl font-bold text-main">Nuevo Préstamo</h2>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="mb-2">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-muted flex items-center gap-2">
                <User className="h-4 w-4 text-primary-500" />
                Cliente *
              </label>
              <button
                type="button"
                onClick={() => navigate('/borrowers/create')}
                className="text-xs text-primary-500 hover:text-primary-400 font-medium hover:underline"
              >
                + Crear Nuevo Cliente
              </button>
            </div>
            <div className="relative">
              <select
                {...register('clienteId')}
                className={`block w-full rounded-xl border bg-surface px-4 py-3 text-main focus:ring-1 transition-all duration-200 [&>option]:bg-surface ${errors.clienteId ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : 'border-border focus:border-primary-500 focus:ring-primary-500'}`}
              >
                <option value="">-- Seleccione un Cliente --</option>
                {borrowers?.map((borrower) => (
                  <option key={borrower.id} value={borrower.id}>
                    {borrower.apellido ? `${borrower.apellido}, ${borrower.nombre}` : borrower.nombre} (Identidad: {borrower.documento})
                  </option>
                ))}
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-muted">
                <Search className="h-4 w-4" />
              </div>
            </div>
            {errors.clienteId && (
              <p className="mt-1 text-xs text-red-400">{errors.clienteId.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-muted">Alias (Opcional)</label>
            <input
              type="text"
              value={alias}
              onChange={(e) => setAliasInput(e.target.value)}
              className="mt-1 block w-full rounded-xl border border-border bg-surface/50 px-4 py-3 text-main placeholder-muted focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-all duration-200"
              placeholder="Ej. Préstamo Moto, Capital Semilla..."
            />
            <p className="mt-1 text-xs text-muted">Nombre corto para identificar este préstamo fácilmente (solo visible para ti).</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-muted">Monto (L)</label>
              <Controller
                control={control}
                name="montoOtorgado"
                render={({ field }) => (
                  <CurrencyInput
                    value={field.value}
                    onValueChange={field.onChange}
                    className={`mt-1 block w-full rounded-xl border bg-surface/50 px-4 py-3 text-main placeholder-muted focus:ring-1 transition-all duration-200 ${errors.montoOtorgado ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : 'border-border focus:border-primary-500 focus:ring-primary-500'}`}
                  />
                )}
              />
              {errors.montoOtorgado && <p className="mt-1 text-xs text-red-400">{errors.montoOtorgado.message}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-muted">Tasa de Interés por Período (%)</label>
              <input
                type="number"
                step="0.1"
                {...register('tasaInteres', { valueAsNumber: true })}
                className={`mt-1 block w-full rounded-xl border bg-surface/50 px-4 py-3 text-main placeholder-muted focus:ring-1 transition-all duration-200 ${errors.tasaInteres ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : 'border-border focus:border-primary-500 focus:ring-primary-500'}`}
              />
              {errors.tasaInteres && <p className="mt-1 text-xs text-red-400">{errors.tasaInteres.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-muted">Cuotas</label>
              <input
                type="number"
                {...register('cantidadCuotas', { valueAsNumber: true })}
                className={`mt-1 block w-full rounded-xl border bg-surface/50 px-4 py-3 text-main placeholder-muted focus:ring-1 transition-all duration-200 ${errors.cantidadCuotas ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : 'border-border focus:border-primary-500 focus:ring-primary-500'}`}
              />
              {errors.cantidadCuotas && <p className="mt-1 text-xs text-red-400">{errors.cantidadCuotas.message}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-muted">Frecuencia de Cobro</label>
              <select
                {...register('frecuenciaCobro')}
                className="mt-1 block w-full rounded-xl border border-border bg-surface/50 px-4 py-3 text-main focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-all duration-200 [&>option]:bg-surface"
              >
                {FRECUENCIAS_COBRO.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-muted">Sistema de Amortización</label>
              <select
                {...register('sistemaAmortizacion')}
                className="mt-1 block w-full rounded-xl border border-border bg-surface/50 px-4 py-3 text-main focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-all duration-200 [&>option]:bg-surface"
              >
                {SISTEMAS_AMORTIZACION.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-muted">Fecha Otorgamiento</label>
              <input
                type="date"
                {...register('fechaOtorgamiento')}
                className={`mt-1 block w-full rounded-xl border bg-surface/50 px-4 py-3 text-main placeholder-muted focus:ring-1 transition-all duration-200 ${errors.fechaOtorgamiento ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : 'border-border focus:border-primary-500 focus:ring-primary-500'}`}
              />
              {errors.fechaOtorgamiento && <p className="mt-1 text-xs text-red-400">{errors.fechaOtorgamiento.message}</p>}
            </div>
          </div>

          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={onSimulate}
              className="flex flex-1 items-center justify-center rounded-xl border border-border bg-surfaceHighlight px-4 py-3 text-sm font-medium text-main hover:bg-border transition-all duration-200"
            >
              <Calculator className="mr-2 h-4 w-4" />
              Simular
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="flex flex-1 items-center justify-center rounded-xl bg-gradient-to-r from-primary-600 to-accent-gold px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-primary-500/25 transition-all duration-200 hover:shadow-primary-500/40 hover:scale-[1.02] disabled:opacity-50"
            >
              {createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
              Crear Préstamo
            </button>
          </div>
        </form>
      </div>

      {/* Simulation Results */}
      <div className="glass-panel p-6">
        <h3 className="mb-4 text-lg font-bold text-main">Proyección de Pagos</h3>
        {simulation ? (
          <div className="flex h-full flex-col">
            <div className="mb-4 grid grid-cols-2 gap-4 rounded-xl bg-surfaceHighlight/30 border border-border p-4">
              <div>
                <span className="text-xs text-muted">Total a Pagar</span>
                <p className="text-lg font-bold text-main">{formatCurrency(simulation.totalAPagar)}</p>
              </div>
              <div>
                <span className="text-xs text-muted">Total Intereses</span>
                <p className="text-lg font-bold text-primary-400">{formatCurrency(totalInteres)}</p>
              </div>
            </div>
            <div className="flex-1 overflow-auto max-h-[400px] custom-scrollbar">
              <table className="w-full text-sm text-left">
                <thead className="bg-surfaceHighlight text-muted sticky top-0 backdrop-blur-sm">
                  <tr>
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">Vencimiento</th>
                    <th className="px-3 py-2">Cuota</th>
                    <th className="px-3 py-2">Interés</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {simulation.detalleCuotas.map((cuota) => (
                    <tr key={cuota.numeroCuota} className="hover:bg-surfaceHighlight/30 transition-colors">
                      <td className="px-3 py-2 text-muted">{cuota.numeroCuota}</td>
                      <td className="px-3 py-2 text-muted">{formatDate(cuota.fechaVencimiento)}</td>
                      <td className="px-3 py-2 font-medium text-emerald-400">{formatCurrency(cuota.monto)}</td>
                      <td className="px-3 py-2 text-muted">{formatCurrency(cuota.interes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="flex h-64 items-center justify-center text-muted">
            <div className="text-center">
              <Calculator className="mx-auto h-12 w-12 opacity-50" />
              <p className="mt-2">Simula el préstamo para ver el detalle</p>
            </div>
          </div>
        )}
      </div>

      <ConfirmationModal
        isOpen={isConfirmationOpen}
        onClose={() => setIsConfirmationOpen(false)}
        onConfirm={handleConfirmCreate}
        title="Confirmar Creación de Préstamo"
        message={`¿Estás seguro que deseas crear este préstamo para ${selectedBorrower ? `${selectedBorrower.nombre} ${selectedBorrower.apellido ?? ''}` : 'el cliente seleccionado'} por un monto de ${formatCurrency(pendingData?.montoOtorgado || 0)}?`}
        confirmText="Crear Préstamo"
        cancelText="Cancelar"
        isLoading={createMutation.isPending}
        variant="primary"
      />
    </div>
  );
}
