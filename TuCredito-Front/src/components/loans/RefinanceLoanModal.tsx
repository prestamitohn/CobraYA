import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { X, RefreshCw, Loader2, AlertTriangle } from 'lucide-react';
import { refinanceLoan } from '../../services/loanService';
import { SISTEMAS_AMORTIZACION, FRECUENCIAS_COBRO, SistemaAmortizacion, FrecuenciaCobro } from '../../types/cobraya';
import { useToast } from '../../context/ToastContext';
import { CurrencyInput } from '../ui/CurrencyInput';
import { formatCurrency } from '../../utils/formatters';

const refinanceSchema = z.object({
  montoAdicional: z.number().min(0, 'No puede ser negativo').optional(),
  cantidadCuotas: z.number().refine((val) => !Number.isNaN(val), { message: 'Obligatorio' }).refine((val) => val >= 1, { message: 'Debe haber al menos 1 cuota' }),
  tasaInteres: z.number().refine((val) => !Number.isNaN(val), { message: 'Obligatorio' }).refine((val) => val >= 0, { message: 'No puede ser negativa' }),
  sistemaAmortizacion: z.enum(['directo', 'frances', 'aleman', 'americano']),
  frecuenciaCobro: z.enum(['diario', 'semanal', 'quincenal', 'mensual']),
  fechaOtorgamiento: z.string().refine((val) => !isNaN(Date.parse(val)), { message: 'Fecha inválida' }),
  motivo: z.string().optional(),
});

type RefinanceFormData = z.infer<typeof refinanceSchema>;

interface RefinanceLoanModalProps {
  isOpen: boolean;
  onClose: () => void;
  prestamoId: string;
  saldoRestante: number;
  tasaInteresActual: number;
  sistemaAmortizacionActual: SistemaAmortizacion;
  frecuenciaCobroActual: FrecuenciaCobro;
}

export function RefinanceLoanModal({
  isOpen, onClose, prestamoId, saldoRestante,
  tasaInteresActual, sistemaAmortizacionActual, frecuenciaCobroActual,
}: RefinanceLoanModalProps) {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  const { register, handleSubmit, control, watch, formState: { errors } } = useForm<RefinanceFormData>({
    resolver: zodResolver(refinanceSchema),
    defaultValues: {
      montoAdicional: 0,
      cantidadCuotas: 12,
      tasaInteres: tasaInteresActual,
      sistemaAmortizacion: sistemaAmortizacionActual,
      frecuenciaCobro: frecuenciaCobroActual,
      fechaOtorgamiento: new Date().toISOString().split('T')[0],
      motivo: '',
    },
  });

  const montoAdicional = watch('montoAdicional');
  const montoNuevo = saldoRestante + Number(montoAdicional || 0);

  const mutation = useMutation({
    mutationFn: (data: RefinanceFormData) => refinanceLoan({
      prestamoOriginalId: prestamoId,
      montoAdicional: data.montoAdicional || 0,
      cantidadCuotas: Number(data.cantidadCuotas),
      tasaInteres: Number(data.tasaInteres),
      sistemaAmortizacion: data.sistemaAmortizacion,
      frecuenciaCobro: data.frecuenciaCobro,
      fechaOtorgamiento: data.fechaOtorgamiento,
      motivo: data.motivo || undefined,
    }),
    onSuccess: (result) => {
      addToast('Préstamo refinanciado correctamente', 'success');
      queryClient.invalidateQueries({ queryKey: ['loans'] });
      queryClient.invalidateQueries({ queryKey: ['loan', prestamoId] });
      queryClient.invalidateQueries({ queryKey: ['installments', prestamoId] });
      queryClient.invalidateQueries({ queryKey: ['dashboardKpis'] });
      onClose();
      navigate(`/loans/${result.prestamoId}`);
    },
    onError: (error: any) => {
      addToast(error.message || 'Error al refinanciar el préstamo', 'error');
    },
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-surface border border-border rounded-xl w-full max-w-lg shadow-2xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-surface z-10">
          <h2 className="text-lg font-semibold text-main flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-primary-500" />
            Refinanciar Préstamo
          </h2>
          <button onClick={onClose} className="text-muted hover:text-main transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit((data) => mutation.mutate(data))} className="p-6 space-y-4">
          <div className="rounded-xl border border-border bg-surfaceHighlight/30 p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted">Saldo Pendiente Actual</span>
              <span className="text-main font-medium">{formatCurrency(saldoRestante)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Monto Adicional</span>
              <span className="text-main font-medium">{formatCurrency(Number(montoAdicional || 0))}</span>
            </div>
            <div className="flex justify-between pt-2 border-t border-border">
              <span className="text-muted font-medium">Nuevo Capital</span>
              <span className="text-primary-500 font-bold text-lg">{formatCurrency(montoNuevo)}</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-muted">Monto Adicional (L) — opcional</label>
            <Controller
              control={control}
              name="montoAdicional"
              render={({ field }) => (
                <CurrencyInput
                  value={field.value}
                  onValueChange={field.onChange}
                  className="mt-1 block w-full rounded-xl border border-border bg-surface/50 px-4 py-3 text-main placeholder-muted focus:ring-1 focus:border-primary-500 focus:ring-primary-500 transition-all duration-200"
                />
              )}
            />
            {errors.montoAdicional && <p className="mt-1 text-xs text-red-400">{errors.montoAdicional.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-muted">Cuotas</label>
              <input
                type="number"
                {...register('cantidadCuotas', { valueAsNumber: true })}
                className="mt-1 block w-full rounded-xl border border-border bg-surface/50 px-4 py-3 text-main focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-all duration-200"
              />
              {errors.cantidadCuotas && <p className="mt-1 text-xs text-red-400">{errors.cantidadCuotas.message}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-muted">Tasa de Interés (%)</label>
              <input
                type="number"
                step="0.1"
                {...register('tasaInteres', { valueAsNumber: true })}
                className="mt-1 block w-full rounded-xl border border-border bg-surface/50 px-4 py-3 text-main focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-all duration-200"
              />
              {errors.tasaInteres && <p className="mt-1 text-xs text-red-400">{errors.tasaInteres.message}</p>}
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

          <div>
            <label className="block text-sm font-medium text-muted">Fecha de Otorgamiento</label>
            <input
              type="date"
              {...register('fechaOtorgamiento')}
              className="mt-1 block w-full rounded-xl border border-border bg-surface/50 px-4 py-3 text-main focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-all duration-200"
            />
            {errors.fechaOtorgamiento && <p className="mt-1 text-xs text-red-400">{errors.fechaOtorgamiento.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-muted">Motivo (opcional)</label>
            <input
              type="text"
              {...register('motivo')}
              placeholder="Ej. Cliente solicitó ampliar plazo y capital adicional"
              className="mt-1 block w-full rounded-xl border border-border bg-surface/50 px-4 py-3 text-main placeholder-muted focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-all duration-200"
            />
          </div>

          <div className="flex items-start gap-2 text-xs text-muted bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
            El préstamo actual quedará marcado como "Refinanciado" (sus cuotas pendientes pasan a "Reprogramada") y se creará un préstamo nuevo con estas condiciones.
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-muted hover:text-main transition-colors">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary-600 to-accent-gold text-white rounded-lg text-sm font-semibold shadow-lg shadow-primary-500/25 transition-all duration-200 disabled:opacity-50"
            >
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refinanciar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
