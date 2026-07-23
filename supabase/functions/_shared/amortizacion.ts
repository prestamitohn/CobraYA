// ⚠️ COPIA — el original (fuente de verdad) es TuCredito-Front/src/lib/amortizacion.ts.
// Se duplica acá porque `supabase functions deploy` empaqueta el grafo de imports
// Deno y no soporta de forma confiable referencias fuera de supabase/functions/.
// Es TypeScript puro sin APIs de Deno ni de Node (solo Date/Math), así que la copia
// es mecánica: cualquier cambio de fórmulas en el original debe replicarse aquí tal
// cual, sin adaptaciones.

export type SistemaAmortizacion = 'frances' | 'aleman' | 'americano' | 'directo';
export type FrecuenciaCobro = 'diario' | 'semanal' | 'quincenal' | 'mensual';

export interface SimulacionEntrada {
  montoPrestamo: number;
  cantidadCuotas: number;
  /** Tasa de interés por período (%), interpretada según frecuenciaCobro. */
  tasaInteres: number;
  fechaInicio: Date;
  sistemaAmortizacion: SistemaAmortizacion;
  frecuenciaCobro: FrecuenciaCobro;
}

export interface CuotaSimulada {
  numeroCuota: number;
  monto: number;
  capital: number;
  interes: number;
  saldoRestante: number;
  fechaVencimiento: Date;
}

export interface SimulacionResultado {
  montoCuota: number;
  totalAPagar: number;
  detalleCuotas: CuotaSimulada[];
}

// Replica MidpointRounding.AwayFromZero de C#. Todos los montos del dominio son
// no negativos, así que away-from-zero y round-half-up coinciden.
function roundMoney(value: number): number {
  return value >= 0 ? Math.floor(value + 0.5) : Math.ceil(value - 0.5);
}

// Usa métodos UTC (no getDate/getMonth locales): fecha_vto es un `date` puro en
// Postgres, sin timezone, y este cálculo corre tanto en el navegador (hora de
// Honduras) como en la Edge Function (UTC) — con métodos locales, la misma cuota
// podía caer un día distinto según dónde se ejecutara.
function sumarPeriodo(fecha: Date, numeroPeriodo: number, frecuencia: FrecuenciaCobro): Date {
  const resultado = new Date(fecha.getTime());
  switch (frecuencia) {
    case 'diario':
      resultado.setUTCDate(resultado.getUTCDate() + numeroPeriodo);
      return resultado;
    case 'semanal':
      resultado.setUTCDate(resultado.getUTCDate() + numeroPeriodo * 7);
      return resultado;
    case 'quincenal':
      resultado.setUTCDate(resultado.getUTCDate() + numeroPeriodo * 15);
      return resultado;
    case 'mensual':
      resultado.setUTCMonth(resultado.getUTCMonth() + numeroPeriodo);
      return resultado;
  }
}

function validar(entrada: SimulacionEntrada): void {
  if (entrada.montoPrestamo <= 0) throw new Error('El monto del préstamo debe ser mayor a cero');
  if (entrada.cantidadCuotas <= 0) throw new Error('La cantidad de cuotas debe ser mayor a cero');
  if (entrada.tasaInteres < 0) throw new Error('El interés no puede ser negativo');
}

export function calcularSimulacion(entrada: SimulacionEntrada): SimulacionResultado {
  validar(entrada);
  switch (entrada.sistemaAmortizacion) {
    case 'frances':
      return calcularFrances(entrada);
    case 'aleman':
      return calcularAleman(entrada);
    case 'americano':
      return calcularAmericano(entrada);
    case 'directo':
      return calcularDirecto(entrada);
  }
}

function calcularDirecto(entrada: SimulacionEntrada): SimulacionResultado {
  const { montoPrestamo, cantidadCuotas, tasaInteres, fechaInicio, frecuenciaCobro } = entrada;
  const i = tasaInteres / 100;
  const interesTotal = montoPrestamo * i * cantidadCuotas;
  let totalAPagar = montoPrestamo + interesTotal;
  const montoCuota = roundMoney(totalAPagar / cantidadCuotas);
  totalAPagar = montoCuota * cantidadCuotas;

  const capitalPorCuota = montoPrestamo / cantidadCuotas;
  const interesPorCuota = montoPrestamo * i;
  let saldoRestante = montoPrestamo;

  const detalleCuotas: CuotaSimulada[] = [];
  for (let k = 1; k <= cantidadCuotas; k++) {
    const capitalRound = roundMoney(capitalPorCuota);
    saldoRestante -= capitalRound;
    detalleCuotas.push({
      numeroCuota: k,
      monto: montoCuota,
      capital: capitalRound,
      interes: roundMoney(interesPorCuota),
      saldoRestante: saldoRestante > 0 ? saldoRestante : 0,
      fechaVencimiento: sumarPeriodo(fechaInicio, k, frecuenciaCobro),
    });
  }

  return { montoCuota, totalAPagar, detalleCuotas };
}

function calcularFrances(entrada: SimulacionEntrada): SimulacionResultado {
  const { montoPrestamo, cantidadCuotas, tasaInteres, fechaInicio, frecuenciaCobro } = entrada;
  const i = tasaInteres / 100;
  const n = cantidadCuotas;

  let cuota: number;
  if (i === 0) {
    cuota = roundMoney(montoPrestamo / n);
  } else {
    const factor = Math.pow(1 + i, n);
    cuota = roundMoney((montoPrestamo * (i * factor)) / (factor - 1));
  }

  const detalleCuotas: CuotaSimulada[] = [];
  let saldo = montoPrestamo;
  for (let k = 1; k <= n; k++) {
    const interes = roundMoney(saldo * i);
    let capital = cuota - interes;
    let cuotaK = cuota;

    // Última cuota: fuerza capital = saldo para que el préstamo cierre en 0 exacto
    // (compensa el redondeo acumulado de las cuotas anteriores).
    if (k === n) {
      capital = saldo;
      cuotaK = capital + interes;
    }

    saldo -= capital;

    detalleCuotas.push({
      numeroCuota: k,
      monto: cuotaK,
      capital,
      interes,
      saldoRestante: saldo > 0 ? saldo : 0,
      fechaVencimiento: sumarPeriodo(fechaInicio, k, frecuenciaCobro),
    });
  }

  const totalAPagar = detalleCuotas.reduce((acc, c) => acc + c.monto, 0);

  return { montoCuota: cuota, totalAPagar, detalleCuotas };
}

function calcularAleman(entrada: SimulacionEntrada): SimulacionResultado {
  const { montoPrestamo, cantidadCuotas, tasaInteres, fechaInicio, frecuenciaCobro } = entrada;
  const i = tasaInteres / 100;
  const n = cantidadCuotas;
  const amortizacionConstante = roundMoney(montoPrestamo / n);
  let saldo = montoPrestamo;
  let totalAPagar = 0;

  const detalleCuotas: CuotaSimulada[] = [];
  for (let k = 1; k <= n; k++) {
    const interes = roundMoney(saldo * i);
    const capital = k === n ? saldo : amortizacionConstante;
    const cuota = capital + interes;
    saldo -= capital;
    totalAPagar += cuota;

    detalleCuotas.push({
      numeroCuota: k,
      monto: cuota,
      capital,
      interes,
      saldoRestante: saldo > 0 ? saldo : 0,
      fechaVencimiento: sumarPeriodo(fechaInicio, k, frecuenciaCobro),
    });
  }

  // En el sistema alemán la cuota es decreciente; se reporta la primera como referencia.
  const montoCuota = detalleCuotas[0].monto;

  return { montoCuota, totalAPagar, detalleCuotas };
}

function calcularAmericano(entrada: SimulacionEntrada): SimulacionResultado {
  const { montoPrestamo, cantidadCuotas, tasaInteres, fechaInicio, frecuenciaCobro } = entrada;
  const i = tasaInteres / 100;
  const n = cantidadCuotas;
  const interesConstante = roundMoney(montoPrestamo * i);
  let saldo = montoPrestamo;
  let totalAPagar = 0;

  const detalleCuotas: CuotaSimulada[] = [];
  for (let k = 1; k <= n; k++) {
    let capital = 0;
    let cuota = interesConstante;

    if (k === n) {
      capital = montoPrestamo;
      cuota = capital + interesConstante;
    }

    saldo -= capital;
    totalAPagar += cuota;

    detalleCuotas.push({
      numeroCuota: k,
      monto: cuota,
      capital,
      interes: interesConstante,
      saldoRestante: saldo > 0 ? saldo : 0,
      fechaVencimiento: sumarPeriodo(fechaInicio, k, frecuenciaCobro),
    });
  }

  return { montoCuota: interesConstante, totalAPagar, detalleCuotas };
}

/**
 * Interés moratorio: 1% del monto de la cuota por día de atraso.
 * Puerto directo de CalculadoraService.CalcularInteresMoratorio. En el .NET original
 * este método existía pero nunca se invocaba — la mora solo entraba manualmente vía el
 * campo Recargo de un pago. Se mantiene disponible con el mismo comportamiento; queda
 * como decisión de producto si se cablea automáticamente en registrar-pago.
 */
export function calcularInteresMoratorio(
  montoCuotaOriginal: number,
  fechaVencimiento: Date,
  fechaPago: Date,
): number {
  if (fechaPago.getTime() <= fechaVencimiento.getTime()) return 0;
  const msPorDia = 24 * 60 * 60 * 1000;
  const diasAtraso = Math.round((fechaPago.getTime() - fechaVencimiento.getTime()) / msPorDia);
  const interes = montoCuotaOriginal * 0.01 * diasAtraso;
  return Math.round(interes * 100) / 100;
}
