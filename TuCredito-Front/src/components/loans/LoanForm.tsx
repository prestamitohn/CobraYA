import { useMemo, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { simulateLoan, createLoan, previsualizarTcea, compararFlatVsSaldos, TceaResultado } from '../../services/loanService';
import { getBorrowers } from '../../services/borrowerService';
import { listUsuarios } from '../../services/authService';
import { periodosPorAnio, tasaAnualAPorPeriodo, type SimulacionResultado } from '../../lib/amortizacion';
import { SISTEMAS_AMORTIZACION, FRECUENCIAS_COBRO, FRECUENCIAS_GASTO_ADMINISTRATIVO } from '../../types/cobraya';
import { Loader2, Calculator, CheckCircle, User, Search, Receipt, AlertTriangle, UserCog } from 'lucide-react';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { ConfirmationModal } from '../ui/ConfirmationModal';
import { CurrencyInput } from '../ui/CurrencyInput';
import { TransparenciaTasaCard } from './TransparenciaTasaCard';

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
  tieneGastoAdministrativo: z.boolean(),
  gastoAdministrativoMonto: z.number().optional(),
  gastoAdministrativoFrecuencia: z.enum(['semanal', 'mensual', 'por_cuota']).optional(),
  tieneMulta: z.boolean(),
  multaPorAtrasoMonto: z.number().optional(),
  cobradorId: z.string().optional(),
}).refine(
  (data) => !data.tieneGastoAdministrativo || (data.gastoAdministrativoMonto ?? 0) > 0,
  { message: 'Indicá el monto del gasto administrativo', path: ['gastoAdministrativoMonto'] },
).refine(
  (data) => !data.tieneMulta || (data.multaPorAtrasoMonto ?? 0) > 0,
  { message: 'Indicá el monto de la multa por atraso', path: ['multaPorAtrasoMonto'] },
);

type LoanFormData = z.infer<typeof loanSchema>;

// Días aproximados por período, solo para estimar el plazo en calendario y el atajo
// "hasta fin de año" — el cronograma real (con fechas exactas) lo calcula
// sumarPeriodo() en lib/amortizacion.ts al simular. Constante de módulo (no dentro
// del componente) para que los useMemo que la usan no la vean como una dependencia
// distinta en cada render.
const DIAS_POR_PERIODO: Record<LoanFormData['frecuenciaCobro'], number> = {
  diario: 1, semanal: 7, quincenal: 15, mensual: 30,
};

export function LoanForm() {
  const { addToast } = useToast();
  const { setAlias } = useLoanAliases();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [simulation, setSimulation] = useState<SimulacionResultado | null>(null);
  // En Honduras la tasa casi siempre se piensa/cotiza anual ("12% anual"), pero el
  // motor de amortización necesita la tasa POR PERÍODO (ver comentario en
  // lib/amortizacion.ts). Este toggle deja entrar cualquiera de las dos y convierte
  // antes de simular/crear — lo que se guarda en prestamos.tasa_interes SIEMPRE es
  // la tasa por período, sin cambios de esquema.
  const [tasaModo, setTasaModo] = useState<'anual' | 'periodo'>('anual');
  const [tcea, setTcea] = useState<TceaResultado | null>(null);
  const [comparativo, setComparativo] = useState<{ interesFlat: number; interesSaldos: number; diferencia: number } | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [alias, setAliasInput] = useState('');
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false);
  const [pendingData, setPendingData] = useState<LoanFormData | null>(null);

  const { register, handleSubmit, formState: { errors }, getValues, reset, control, watch, setValue } = useForm<LoanFormData>({
    resolver: zodResolver(loanSchema),
    defaultValues: {
      clienteId: '',
      sistemaAmortizacion: 'directo',
      frecuenciaCobro: 'mensual',
      tasaInteres: 10,
      cantidadCuotas: 12,
      fechaOtorgamiento: new Date().toISOString().split('T')[0],
      tieneGastoAdministrativo: false,
      gastoAdministrativoFrecuencia: 'por_cuota',
      tieneMulta: false,
      cobradorId: '',
    }
  });

  const tieneGastoAdministrativo = watch('tieneGastoAdministrativo');
  const tieneMulta = watch('tieneMulta');
  const tasaInteresIngresada = watch('tasaInteres');
  const frecuenciaCobroWatch = watch('frecuenciaCobro');
  const sistemaAmortizacionWatch = watch('sistemaAmortizacion');
  const cantidadCuotasWatch = watch('cantidadCuotas');
  const montoOtorgadoWatch = watch('montoOtorgado');
  const fechaOtorgamientoWatch = watch('fechaOtorgamiento');

  // Fecha estimada de la última cuota — para que el default de 12 cuotas no
  // empuje a todos los préstamos a un año completo sin que el usuario lo note
  // (el pedido original de la cooperativa: un préstamo otorgado a mitad de año
  // debe poder armarse a 6 meses, no forzar 12).
  const fechaFinEstimada = useMemo(() => {
    if (!fechaOtorgamientoWatch || !cantidadCuotasWatch || Number(cantidadCuotasWatch) <= 0) return undefined;
    const inicio = new Date(`${fechaOtorgamientoWatch}T00:00:00Z`);
    if (Number.isNaN(inicio.getTime())) return undefined;
    const fin = new Date(inicio.getTime());
    fin.setUTCDate(fin.getUTCDate() + Number(cantidadCuotasWatch) * DIAS_POR_PERIODO[frecuenciaCobroWatch]);
    return fin;
  }, [fechaOtorgamientoWatch, cantidadCuotasWatch, frecuenciaCobroWatch]);

  // Cuántas cuotas hacen falta para que el plazo termine el 31 de diciembre del
  // año de otorgamiento (ej. otorgado en junio → cuotas hasta fin de año, no 12).
  const cuotasHastaFinDeAnio = useMemo(() => {
    if (!fechaOtorgamientoWatch) return undefined;
    const inicio = new Date(`${fechaOtorgamientoWatch}T00:00:00Z`);
    if (Number.isNaN(inicio.getTime())) return undefined;
    const finAnio = new Date(Date.UTC(inicio.getUTCFullYear(), 11, 31));
    const diasRestantes = Math.round((finAnio.getTime() - inicio.getTime()) / 86400000);
    if (diasRestantes <= 0) return undefined;
    return Math.max(1, Math.round(diasRestantes / DIAS_POR_PERIODO[frecuenciaCobroWatch]));
  }, [fechaOtorgamientoWatch, frecuenciaCobroWatch]);

  // Conversión de "tasa anual" a la tasa por período que de verdad recibe el motor
  // de amortización — prorrateada por la frecuencia de cobro, igual para los 4
  // sistemas (ver el comentario largo en lib/amortizacion.ts:tasaAnualAPorPeriodo).
  // Antes "directo" (flat) tenía una cuenta aparte que dividía entre cantidadCuotas
  // en vez de entre períodos-por-año, así que un flat cobraba el 12% completo sin
  // importar si el plazo era de 6 o de 12 meses — bug real reportado por una
  // cooperativa cliente, corregido acá.
  const aTasaPorPeriodo = (tasaIngresada: number, frecuencia: LoanFormData['frecuenciaCobro']): number => {
    if (tasaModo !== 'anual') return tasaIngresada;
    return tasaAnualAPorPeriodo(tasaIngresada, frecuencia);
  };

  const tasaPeriodicaEfectiva = useMemo(() => {
    if (tasaInteresIngresada == null || Number.isNaN(tasaInteresIngresada)) return undefined;
    return aTasaPorPeriodo(tasaInteresIngresada, frecuenciaCobroWatch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasaInteresIngresada, frecuenciaCobroWatch, tasaModo]);

  // Lo que se muestra como "tasa nominal declarada" — a diferencia de la tasa por
  // período (de uso interno), esto es simplemente lo que el usuario escribió,
  // re-expresado en términos anuales para que el rótulo "anual" del panel de
  // transparencia sea siempre coherente, sin volver a pasar por la conversión
  // específica del flat (que usaría cantidadCuotas, no periodos_por_año).
  const tasaDeclaradaAnual = useMemo(() => {
    if (tasaInteresIngresada == null || Number.isNaN(tasaInteresIngresada)) return undefined;
    return tasaModo === 'anual' ? tasaInteresIngresada : tasaInteresIngresada * periodosPorAnio(frecuenciaCobroWatch);
  }, [tasaInteresIngresada, frecuenciaCobroWatch, tasaModo]);

  const { data: borrowers } = useQuery({
    queryKey: ['borrowers'],
    queryFn: () => getBorrowers(),
  });

  const { data: cobradores } = useQuery({
    queryKey: ['usuarios-tenant', 'collector'],
    queryFn: () => listUsuarios('collector'),
  });

  const createMutation = useMutation({
    mutationFn: createLoan,
    onSuccess: (data) => {
      if (data.prestamoId && alias.trim()) {
        setAlias(data.prestamoId, alias.trim());
      }
      addToast('Préstamo creado exitosamente!', 'success');
      setSimulation(null);
      setTcea(null);
      setComparativo(null);
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

  const onSimulate = async () => {
    const data = getValues();
    if (!data.montoOtorgado || !data.cantidadCuotas || data.tasaInteres === undefined) return;
    setIsSimulating(true);
    try {
      const entrada = {
        montoPrestamo: Number(data.montoOtorgado),
        cantidadCuotas: Number(data.cantidadCuotas),
        tasaInteres: aTasaPorPeriodo(Number(data.tasaInteres), data.frecuenciaCobro),
        fechaInicio: new Date(`${data.fechaOtorgamiento}T00:00:00Z`),
        sistemaAmortizacion: data.sistemaAmortizacion,
        frecuenciaCobro: data.frecuenciaCobro,
      };
      const resultado = simulateLoan(entrada);
      setSimulation(resultado);

      // Comparativo flat vs. saldos: solo tiene sentido mostrarlo cuando el sistema
      // elegido es el flat (directo) — francés/alemán ya cobran sobre saldos.
      setComparativo(data.sistemaAmortizacion === 'directo' ? compararFlatVsSaldos(entrada) : null);

      try {
        const tceaResultado = await previsualizarTcea(entrada.montoPrestamo, resultado.detalleCuotas, entrada.frecuenciaCobro);
        setTcea(tceaResultado);
      } catch {
        // La TCEA es informativa — si el RPC falla no debe bloquear la simulación ya calculada.
        setTcea(null);
      }
    } catch (err: any) {
      addToast(err.message || 'No se pudo simular el préstamo', 'error');
    } finally {
      setIsSimulating(false);
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
      tasaInteres: aTasaPorPeriodo(Number(pendingData.tasaInteres), pendingData.frecuenciaCobro),
      sistemaAmortizacion: pendingData.sistemaAmortizacion,
      frecuenciaCobro: pendingData.frecuenciaCobro,
      fechaOtorgamiento: pendingData.fechaOtorgamiento,
      moneda: 'HNL',
      gastoAdministrativoMonto: pendingData.tieneGastoAdministrativo ? Number(pendingData.gastoAdministrativoMonto) : null,
      gastoAdministrativoFrecuencia: pendingData.tieneGastoAdministrativo ? pendingData.gastoAdministrativoFrecuencia : null,
      multaPorAtrasoMonto: pendingData.tieneMulta ? Number(pendingData.multaPorAtrasoMonto) : null,
      cobradorId: pendingData.cobradorId || null,
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

          {cobradores && cobradores.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-muted flex items-center gap-2">
                <UserCog className="h-4 w-4 text-primary-500" />
                Cobrador asignado (Opcional)
              </label>
              <select
                {...register('cobradorId')}
                className="mt-1 block w-full rounded-xl border border-border bg-surface/50 px-4 py-3 text-main focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-all duration-200 [&>option]:bg-surface"
              >
                <option value="">-- Sin asignar --</option>
                {cobradores.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted">El cobrador solo verá y podrá cobrar los préstamos que le asignes.</p>
            </div>
          )}

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
              <label className="block text-sm font-medium text-muted">Tasa de Interés (%)</label>
              <div className="mt-1 flex rounded-lg border border-border overflow-hidden text-xs mb-1.5">
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
              <input
                type="number"
                step="0.1"
                {...register('tasaInteres', { valueAsNumber: true })}
                className={`block w-full rounded-xl border bg-surface/50 px-4 py-3 text-main placeholder-muted focus:ring-1 transition-all duration-200 ${errors.tasaInteres ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : 'border-border focus:border-primary-500 focus:ring-primary-500'}`}
              />
              {errors.tasaInteres && <p className="mt-1 text-xs text-red-400">{errors.tasaInteres.message}</p>}
              {tasaModo === 'anual' && sistemaAmortizacionWatch === 'directo' && tasaPeriodicaEfectiva !== undefined && (
                <p className="mt-1 text-xs text-muted">
                  ≈ {tasaPeriodicaEfectiva.toLocaleString('es-HN', { maximumFractionDigits: 4 })}% {FRECUENCIAS_COBRO.find((f) => f.value === frecuenciaCobroWatch)?.label.toLowerCase()} — se prorratea por el plazo real:
                  {montoOtorgadoWatch && cantidadCuotasWatch
                    ? ` ${cantidadCuotasWatch} cuota(s) = ${formatCurrency(montoOtorgadoWatch * (tasaPeriodicaEfectiva / 100) * Number(cantidadCuotasWatch))} de interés total.`
                    : ''}
                </p>
              )}
              {tasaModo === 'anual' && sistemaAmortizacionWatch !== 'directo' && tasaPeriodicaEfectiva !== undefined && (
                <p className="mt-1 text-xs text-muted">
                  ≈ {tasaPeriodicaEfectiva.toLocaleString('es-HN', { maximumFractionDigits: 4 })}% {FRECUENCIAS_COBRO.find((f) => f.value === frecuenciaCobroWatch)?.label.toLowerCase()}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-muted">Cuotas</label>
                {cuotasHastaFinDeAnio !== undefined && Number(cantidadCuotasWatch) !== cuotasHastaFinDeAnio && (
                  <button
                    type="button"
                    onClick={() => setValue('cantidadCuotas', cuotasHastaFinDeAnio, { shouldValidate: true })}
                    className="text-xs text-primary-400 hover:text-primary-300"
                  >
                    Hasta fin de año ({cuotasHastaFinDeAnio})
                  </button>
                )}
              </div>
              <input
                type="number"
                {...register('cantidadCuotas', { valueAsNumber: true })}
                className={`mt-1 block w-full rounded-xl border bg-surface/50 px-4 py-3 text-main placeholder-muted focus:ring-1 transition-all duration-200 ${errors.cantidadCuotas ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : 'border-border focus:border-primary-500 focus:ring-primary-500'}`}
              />
              {errors.cantidadCuotas ? (
                <p className="mt-1 text-xs text-red-400">{errors.cantidadCuotas.message}</p>
              ) : fechaFinEstimada ? (
                <p className="mt-1 text-xs text-muted">Plazo estimado: vence ≈ {formatDate(fechaFinEstimada)} (la fecha exacta la fija la simulación).</p>
              ) : null}
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

          <div className="rounded-xl border border-border bg-surfaceHighlight/30 p-4">
            <label className="flex items-center gap-2 text-sm font-medium text-main cursor-pointer">
              <input type="checkbox" {...register('tieneGastoAdministrativo')} className="rounded border-border text-primary-500 focus:ring-primary-500" />
              <Receipt className="h-4 w-4 text-primary-500" />
              Cobrar Gasto Administrativo
            </label>
            <p className="mt-1 text-xs text-muted">Cargo adicional al cliente, aparte de capital e interés, con su propia frecuencia (independiente de la frecuencia de cobro del préstamo).</p>

            {tieneGastoAdministrativo && (
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div>
                  <label className="block text-sm font-medium text-muted">Monto (L)</label>
                  <Controller
                    control={control}
                    name="gastoAdministrativoMonto"
                    render={({ field }) => (
                      <CurrencyInput
                        value={field.value}
                        onValueChange={field.onChange}
                        className={`mt-1 block w-full rounded-xl border bg-surface/50 px-4 py-3 text-main placeholder-muted focus:ring-1 transition-all duration-200 ${errors.gastoAdministrativoMonto ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : 'border-border focus:border-primary-500 focus:ring-primary-500'}`}
                      />
                    )}
                  />
                  {errors.gastoAdministrativoMonto && <p className="mt-1 text-xs text-red-400">{errors.gastoAdministrativoMonto.message}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted">Frecuencia del Gasto</label>
                  <select
                    {...register('gastoAdministrativoFrecuencia')}
                    className="mt-1 block w-full rounded-xl border border-border bg-surface/50 px-4 py-3 text-main focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-all duration-200 [&>option]:bg-surface"
                  >
                    {FRECUENCIAS_GASTO_ADMINISTRATIVO.map((f) => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border bg-surfaceHighlight/30 p-4">
            <label className="flex items-center gap-2 text-sm font-medium text-main cursor-pointer">
              <input type="checkbox" {...register('tieneMulta')} className="rounded border-border text-primary-500 focus:ring-primary-500" />
              <AlertTriangle className="h-4 w-4 text-red-500" />
              Multa por Atraso
            </label>
            <p className="mt-1 text-xs text-muted">Monto fijo que se aplica automáticamente a cada cuota que caiga en mora (se puede aplicar manualmente también).</p>

            {tieneMulta && (
              <div className="mt-4">
                <label className="block text-sm font-medium text-muted">Monto (L)</label>
                <Controller
                  control={control}
                  name="multaPorAtrasoMonto"
                  render={({ field }) => (
                    <CurrencyInput
                      value={field.value}
                      onValueChange={field.onChange}
                      className={`mt-1 block w-full rounded-xl border bg-surface/50 px-4 py-3 text-main placeholder-muted focus:ring-1 transition-all duration-200 ${errors.multaPorAtrasoMonto ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : 'border-border focus:border-primary-500 focus:ring-primary-500'}`}
                    />
                  )}
                />
                {errors.multaPorAtrasoMonto && <p className="mt-1 text-xs text-red-400">{errors.multaPorAtrasoMonto.message}</p>}
              </div>
            )}
          </div>

          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={onSimulate}
              disabled={isSimulating}
              className="flex flex-1 items-center justify-center rounded-xl border border-border bg-surfaceHighlight px-4 py-3 text-sm font-medium text-main hover:bg-border transition-all duration-200 disabled:opacity-50"
            >
              {isSimulating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Calculator className="mr-2 h-4 w-4" />}
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

            {tcea && (
              <div className="mb-4">
                <TransparenciaTasaCard
                  tasaNominalAnual={tasaDeclaradaAnual}
                  tasaEfectivaAnual={tcea.tcea}
                  costoTotalCredito={tcea.costoTotalCredito}
                  comparativo={comparativo}
                />
              </div>
            )}

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
