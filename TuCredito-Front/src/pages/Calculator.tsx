import { useMemo, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { simulateLoan, createLoan } from '../services/loanService';
import { getBorrowers } from '../services/borrowerService';
import { tasaAnualAPorPeriodo, type SimulacionResultado } from '../lib/amortizacion';
import { SISTEMAS_AMORTIZACION, FRECUENCIAS_COBRO, SistemaAmortizacion, FrecuenciaCobro } from '../types/cobraya';
import { Calculator as CalculatorIcon, Banknote, Calendar, Percent, User, X, Check, Search, CalendarDays, BookOpen, ChevronUp, ChevronDown } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { formatCurrency, formatDate } from '../utils/formatters';
import { CurrencyInput } from '../components/ui/CurrencyInput';

interface SimulateFormData {
  montoPrestamo: number;
  interesPeriodo: number;
  cantidadCuotas: number;
  sistemaAmortizacion: SistemaAmortizacion;
  frecuenciaCobro: FrecuenciaCobro;
}

export function Calculator() {
  const { register, handleSubmit, control, watch } = useForm<SimulateFormData>({
    defaultValues: {
      sistemaAmortizacion: 'directo',
      frecuenciaCobro: 'mensual',
    }
  });
  // Mismo criterio que en el alta de préstamo (ver comentario largo en
  // lib/amortizacion.ts:tasaAnualAPorPeriodo): "tasa anual" se prorratea por la
  // frecuencia de cobro, igual para los 4 sistemas — ya no hay una cuenta aparte
  // para flat que ignorara el plazo real.
  const [tasaModo, setTasaModo] = useState<'anual' | 'periodo'>('anual');
  const interesIngresado = watch('interesPeriodo');
  const frecuenciaCobroWatch = watch('frecuenciaCobro');
  const sistemaAmortizacionWatch = watch('sistemaAmortizacion');
  const cantidadCuotasWatch = watch('cantidadCuotas');
  const montoPrestamoWatch = watch('montoPrestamo');

  const aTasaPorPeriodo = (tasaIngresada: number, frecuencia: FrecuenciaCobro): number => {
    if (tasaModo !== 'anual') return tasaIngresada;
    return tasaAnualAPorPeriodo(tasaIngresada, frecuencia);
  };

  const tasaPeriodicaEfectiva = useMemo(() => {
    if (interesIngresado == null || Number.isNaN(interesIngresado)) return undefined;
    return aTasaPorPeriodo(interesIngresado, frecuenciaCobroWatch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interesIngresado, frecuenciaCobroWatch, tasaModo]);

  const [result, setResult] = useState<SimulacionResultado | null>(null);
  const [simulationParams, setSimulationParams] = useState<SimulateFormData | null>(null);
  const [simulationError, setSimulationError] = useState('');

  const { addToast } = useToast();
  const queryClient = useQueryClient();

  const [isGuideOpen, setIsGuideOpen] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedClienteId, setSelectedClienteId] = useState<string>('');
  const [fechaOtorgamiento, setFechaOtorgamiento] = useState(new Date().toISOString().split('T')[0]);

  const { data: borrowers } = useQuery({
    queryKey: ['borrowers'],
    queryFn: () => getBorrowers(),
  });

  const createLoanMutation = useMutation({
    mutationFn: createLoan,
    onSuccess: () => {
      addToast('Préstamo creado exitosamente', 'success');
      setIsModalOpen(false);
      setResult(null);
      setSimulationParams(null);
      queryClient.invalidateQueries({ queryKey: ['loans'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardKpis'] });
    },
    onError: (error: any) => {
      addToast(error.message || 'Error al crear el préstamo', 'error');
    }
  });

  const onSubmit = (data: SimulateFormData) => {
    setSimulationError('');
    setSimulationParams(data);
    try {
      const resultado = simulateLoan({
        montoPrestamo: Number(data.montoPrestamo),
        cantidadCuotas: Number(data.cantidadCuotas),
        tasaInteres: aTasaPorPeriodo(Number(data.interesPeriodo), data.frecuenciaCobro),
        fechaInicio: new Date(`${fechaOtorgamiento}T00:00:00Z`),
        sistemaAmortizacion: data.sistemaAmortizacion,
        frecuenciaCobro: data.frecuenciaCobro,
      });
      setResult(resultado);
    } catch (err: any) {
      setSimulationError(err.message || 'No se pudo calcular la simulación');
      setResult(null);
    }
  };

  const handleCreateLoan = () => {
    if (!simulationParams || !selectedClienteId) return;

    createLoanMutation.mutate({
      clienteId: selectedClienteId,
      montoPrestamo: Number(simulationParams.montoPrestamo),
      cantidadCuotas: Number(simulationParams.cantidadCuotas),
      tasaInteres: aTasaPorPeriodo(Number(simulationParams.interesPeriodo), simulationParams.frecuenciaCobro),
      sistemaAmortizacion: simulationParams.sistemaAmortizacion,
      frecuenciaCobro: simulationParams.frecuenciaCobro,
      fechaOtorgamiento,
      moneda: 'HNL',
    });
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-main mb-2">Simulador de Préstamos</h1>
        <p className="text-muted">Calcula las cuotas y el plan de pagos estimado</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Formulario */}
        <div className="lg:col-span-4 glass-panel p-6 rounded-2xl border border-border h-fit">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-muted mb-1">Monto del Préstamo (L)</label>
              <div className="relative">
                <Banknote className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                <Controller
                  control={control}
                  name="montoPrestamo"
                  rules={{ required: true, min: 1 }}
                  render={({ field }) => (
                    <CurrencyInput
                      value={field.value}
                      onValueChange={field.onChange}
                      className="w-full bg-surface/50 border border-border rounded-lg pl-10 pr-4 py-2.5 text-main placeholder-muted focus:outline-none focus:border-primary-500 transition-colors"
                      placeholder="0"
                    />
                  )}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-muted mb-1">Tasa de Interés (%)</label>
              <div className="flex rounded-lg border border-border overflow-hidden text-xs mb-1.5">
                <button
                  type="button"
                  onClick={() => setTasaModo('anual')}
                  className={`flex-1 py-1 transition-colors ${tasaModo === 'anual' ? 'bg-primary-500 text-white' : 'text-muted hover:bg-surfaceHighlight'}`}
                >
                  Anual
                </button>
                <button
                  type="button"
                  onClick={() => setTasaModo('periodo')}
                  className={`flex-1 py-1 transition-colors ${tasaModo === 'periodo' ? 'bg-primary-500 text-white' : 'text-muted hover:bg-surfaceHighlight'}`}
                >
                  Por período
                </button>
              </div>
              <div className="relative">
                <Percent className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                <input
                  type="number"
                  step="0.1"
                  {...register('interesPeriodo', { required: true, min: 0 })}
                  className="w-full bg-surface/50 border border-border rounded-lg pl-10 pr-4 py-2.5 text-main placeholder-muted focus:outline-none focus:border-primary-500 transition-colors"
                  placeholder="0.0"
                />
              </div>
              {tasaModo === 'anual' && sistemaAmortizacionWatch === 'directo' && tasaPeriodicaEfectiva !== undefined && (
                <p className="mt-1 text-xs text-muted">
                  ≈ {tasaPeriodicaEfectiva.toLocaleString('es-HN', { maximumFractionDigits: 4 })}% {FRECUENCIAS_COBRO.find((f) => f.value === frecuenciaCobroWatch)?.label.toLowerCase()} — se prorratea por el plazo real:
                  {montoPrestamoWatch && cantidadCuotasWatch
                    ? ` ${cantidadCuotasWatch} cuota(s) = ${formatCurrency(montoPrestamoWatch * (tasaPeriodicaEfectiva / 100) * Number(cantidadCuotasWatch))} de interés total.`
                    : ''}
                </p>
              )}
              {tasaModo === 'anual' && sistemaAmortizacionWatch !== 'directo' && tasaPeriodicaEfectiva !== undefined && (
                <p className="mt-1 text-xs text-muted">
                  ≈ {tasaPeriodicaEfectiva.toLocaleString('es-HN', { maximumFractionDigits: 4 })}% {FRECUENCIAS_COBRO.find((f) => f.value === frecuenciaCobroWatch)?.label.toLowerCase()}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-muted mb-1">Cantidad de Cuotas</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                <input
                  type="number"
                  {...register('cantidadCuotas', { required: true, min: 1 })}
                  className="w-full bg-surface/50 border border-border rounded-lg pl-10 pr-4 py-2.5 text-main placeholder-muted focus:outline-none focus:border-primary-500 transition-colors"
                  placeholder="12"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-muted mb-1">Frecuencia de Cobro</label>
              <div className="relative">
                <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                <select
                  {...register('frecuenciaCobro')}
                  className="w-full bg-surface/50 border border-border rounded-lg pl-10 pr-4 py-2.5 text-main focus:outline-none focus:border-primary-500 transition-colors appearance-none"
                >
                  {FRECUENCIAS_COBRO.map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-muted mb-1">Sistema de Amortización</label>
              <div className="relative">
                <BookOpen className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                <select
                  {...register('sistemaAmortizacion')}
                  className="w-full bg-surface/50 border border-border rounded-lg pl-10 pr-4 py-2.5 text-main focus:outline-none focus:border-primary-500 transition-colors appearance-none"
                >
                  {SISTEMAS_AMORTIZACION.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {simulationError && <p className="text-xs text-red-400">{simulationError}</p>}

            <button
              type="submit"
              className="w-full bg-primary-600 hover:bg-primary-700 text-white font-medium py-3 rounded-lg transition-all shadow-lg shadow-primary-500/20 mt-4 flex items-center justify-center gap-2"
            >
              <CalculatorIcon className="h-5 w-5" />
              Calcular
            </button>
          </form>

            <div className="mt-6 pt-6 border-t border-border">
                <button
                    type="button"
                    onClick={() => setIsGuideOpen(!isGuideOpen)}
                    className="flex items-center justify-between w-full text-sm font-medium text-main mb-3 hover:text-primary-500 transition-colors group"
                >
                    <div className="flex items-center gap-2">
                        <BookOpen className="h-4 w-4 text-primary-500 group-hover:scale-110 transition-transform" />
                        Guía de Sistemas
                    </div>
                    {isGuideOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>

                {isGuideOpen && (
                    <div className="space-y-3 text-xs text-muted animate-in fade-in slide-in-from-top-2">
                        <div className="p-3 bg-primary-500/10 rounded-lg border border-primary-500/30">
                            <span className="font-bold text-primary-400 block mb-1">Directo / Flat (el más usado en HN)</span>
                            Cuota fija calculada con la tasa aplicada sobre el monto ORIGINAL en cada cuota, aunque ya se haya abonado capital — por eso su costo real (TCEA) suele ser bastante mayor a la tasa declarada. Es la forma en que trabaja la mayoría de los prestamistas informales en Honduras (cobro diario, semanal o quincenal).
                        </div>
                        <div className="p-3 bg-surfaceHighlight/30 rounded-lg border border-border/50">
                            <span className="font-bold text-main block mb-1">Francés — sobre saldo (banca formal)</span>
                            Cuota constante, pero el interés se calcula sobre el saldo pendiente. Al principio pagas más interés y menos capital. Es el sistema típico de bancos y financieras (hipotecas, préstamos personales).
                        </div>
                        <div className="p-3 bg-surfaceHighlight/30 rounded-lg border border-border/50">
                            <span className="font-bold text-main block mb-1">Alemán — sobre saldo (banca formal)</span>
                            Amortización de capital constante, interés sobre saldo pendiente. La cuota disminuye con el tiempo. Pagas menos intereses totales.
                        </div>
                        <div className="p-3 bg-surfaceHighlight/30 rounded-lg border border-border/50">
                            <span className="font-bold text-main block mb-1">Americano (banca formal)</span>
                            Pagas solo intereses durante el plazo. El capital se devuelve todo junto al final.
                        </div>
                    </div>
                )}
            </div>
        </div>

        {/* Resultados */}
        <div className="lg:col-span-8 space-y-6">
          {result ? (
            <div className="glass-panel p-6 rounded-2xl border border-border animate-in fade-in slide-in-from-bottom-4 duration-500">
               <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="p-4 rounded-xl bg-surfaceHighlight/50 border border-border">
                     <p className="text-xs text-muted mb-1">Cuota Promedio</p>
                     <p className="text-lg font-bold text-primary-400">
                        {formatCurrency(result.detalleCuotas.reduce((acc, curr) => acc + curr.monto, 0) / result.detalleCuotas.length)}
                     </p>
                  </div>
                  <div className="p-4 rounded-xl bg-surfaceHighlight/50 border border-border">
                     <p className="text-xs text-muted mb-1">Total Intereses</p>
                     <p className="text-lg font-bold text-accent-gold">
                        {formatCurrency(result.detalleCuotas.reduce((acc, curr) => acc + curr.interes, 0))}
                     </p>
                  </div>
                   <div className="p-4 rounded-xl bg-surfaceHighlight/50 border border-border">
                     <p className="text-xs text-muted mb-1">Total a Pagar</p>
                     <p className="text-lg font-bold text-main">
                        {formatCurrency(result.totalAPagar)}
                     </p>
                  </div>
               </div>

               <div className="overflow-hidden rounded-xl border border-border">
                <table className="w-full text-sm text-left">
                  <thead className="bg-surfaceHighlight text-muted">
                    <tr>
                      <th className="px-4 py-3 font-medium">N°</th>
                      <th className="px-4 py-3 font-medium">Cuota</th>
                      <th className="px-4 py-3 font-medium">Vencimiento</th>
                      <th className="px-4 py-3 font-medium">Interés</th>
                      <th className="px-4 py-3 font-medium">Amortización</th>
                      <th className="px-4 py-3 font-medium">Saldo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {result.detalleCuotas.map((cuota) => (
                      <tr key={cuota.numeroCuota} className="hover:bg-surfaceHighlight/30">
                        <td className="px-4 py-2.5 text-muted">{cuota.numeroCuota}</td>
                        <td className="px-4 py-2.5 font-medium text-main">{formatCurrency(cuota.monto)}</td>
                        <td className="px-4 py-2.5 text-muted">{formatDate(cuota.fechaVencimiento)}</td>
                        <td className="px-4 py-2.5 text-accent-gold">{formatCurrency(cuota.interes)}</td>
                        <td className="px-4 py-2.5 text-green-400">{formatCurrency(cuota.capital)}</td>
                        <td className="px-4 py-2.5 text-muted">{formatCurrency(Math.abs(cuota.saldoRestante))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
               </div>

               <div className="mt-6 flex justify-end">
                 <button
                   onClick={() => setIsModalOpen(true)}
                   className="bg-primary-600 hover:bg-primary-700 text-white font-medium px-6 py-2.5 rounded-lg transition-all shadow-lg shadow-primary-500/20 flex items-center gap-2"
                 >
                   <Check className="h-5 w-5" />
                   Crear Préstamo
                 </button>
               </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-12 glass-panel rounded-2xl border border-border border-dashed text-muted">
              <CalculatorIcon className="h-16 w-16 mb-4 opacity-20" />
              <p className="text-lg">Ingresa los datos para ver la proyección</p>
            </div>
          )}
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />
          <div className="relative bg-background border border-border rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <h2 className="text-xl font-bold text-main">Confirmar Nuevo Préstamo</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-muted hover:text-main">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
                <div className="p-4 bg-surfaceHighlight/50 rounded-xl border border-border">
                    <label className="block text-sm font-medium text-muted mb-2 flex items-center gap-2">
                        <User className="h-4 w-4 text-primary-500" />
                        Seleccionar Cliente
                    </label>
                    <div className="relative">
                        <select
                            value={selectedClienteId}
                            onChange={(e) => setSelectedClienteId(e.target.value)}
                            className="block w-full rounded-xl border border-border bg-surface px-4 py-3 text-main focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-all duration-200"
                        >
                            <option value="">-- Seleccione un cliente --</option>
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
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div>
                        <label className="block text-sm font-medium text-muted mb-1">Fecha Otorgamiento</label>
                        <div className="relative">
                            <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                            <input
                                type="date"
                                value={fechaOtorgamiento}
                                onChange={(e) => setFechaOtorgamiento(e.target.value)}
                                className="w-full bg-surface/50 border border-border rounded-lg pl-10 pr-4 py-2.5 text-main"
                            />
                        </div>
                    </div>
                </div>

                <div className="p-4 bg-primary-500/10 border border-primary-500/20 rounded-xl">
                    <h3 className="font-semibold text-primary-400 mb-2">Resumen del Préstamo</h3>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                            <span className="text-muted block">Monto</span>
                            <span className="text-main font-medium">{formatCurrency(simulationParams?.montoPrestamo || 0)}</span>
                        </div>
                         <div>
                            <span className="text-muted block">Tasa ({tasaModo === 'anual' ? 'anual' : 'por período'})</span>
                            <span className="text-main font-medium">{simulationParams?.interesPeriodo}%</span>
                        </div>
                         <div>
                            <span className="text-muted block">Cuotas</span>
                            <span className="text-main font-medium">{simulationParams?.cantidadCuotas}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="p-6 border-t border-border bg-surfaceHighlight/30 flex justify-end gap-3">
                <button
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-muted hover:text-main hover:bg-surfaceHighlight transition-colors"
                >
                    Cancelar
                </button>
                <button
                    onClick={handleCreateLoan}
                    disabled={createLoanMutation.isPending || !selectedClienteId}
                    className="px-4 py-2 rounded-lg text-sm font-medium bg-primary-600 hover:bg-primary-700 text-white transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                    {createLoanMutation.isPending ? 'Procesando...' : 'Confirmar Préstamo'}
                </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
