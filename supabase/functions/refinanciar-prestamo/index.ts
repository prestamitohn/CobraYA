// Edge Function: refinanciar-prestamo
//
// Igual que crear-prestamo: recalcula el cronograma del nuevo préstamo del lado del
// servidor con el motor compartido (nunca confía en la simulación del front) y llama
// a refinanciar_prestamo() vía RPC reenviando el JWT del caller (RLS sigue aplicando).
// La diferencia es que el "monto a prestar" no lo manda el front — se calcula acá
// mismo a partir del saldo_restante real del préstamo original (leído con autoridad
// justo antes de simular), más el monto adicional que el front sí puede indicar.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { calcularSimulacion, type FrecuenciaCobro, type SistemaAmortizacion } from '../_shared/amortizacion.ts';
import { corsHeaders, handleCorsPreflight } from '../_shared/cors.ts';

interface RefinanciarPrestamoPayload {
  prestamoOriginalId: string;
  montoAdicional?: number;
  cantidadCuotas: number;
  tasaInteres: number;
  sistemaAmortizacion: SistemaAmortizacion;
  frecuenciaCobro: FrecuenciaCobro;
  fechaOtorgamiento: string; // ISO date (yyyy-mm-dd)
  moneda?: string;
  cobradorId?: string | null;
  gastoAdministrativoMonto?: number | null;
  gastoAdministrativoFrecuencia?: 'semanal' | 'mensual' | 'por_cuota' | null;
  multaPorAtrasoMonto?: number | null;
  motivo?: string | null;
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Método no permitido' }, 405);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'Falta encabezado Authorization' }, 401);
  }

  let payload: RefinanciarPrestamoPayload;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: 'Body inválido, se esperaba JSON' }, 400);
  }

  const {
    prestamoOriginalId, montoAdicional, cantidadCuotas, tasaInteres,
    sistemaAmortizacion, frecuenciaCobro, fechaOtorgamiento, moneda, cobradorId,
    gastoAdministrativoMonto, gastoAdministrativoFrecuencia, multaPorAtrasoMonto, motivo,
  } = payload;

  if (!prestamoOriginalId || !cantidadCuotas || tasaInteres === undefined
      || !sistemaAmortizacion || !frecuenciaCobro || !fechaOtorgamiento) {
    return jsonResponse({ error: 'Payload incompleto' }, 400);
  }

  if (gastoAdministrativoMonto && !gastoAdministrativoFrecuencia) {
    return jsonResponse({ error: 'Falta la frecuencia del gasto administrativo' }, 400);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: original, error: originalError } = await supabase
    .from('prestamos')
    .select('saldo_restante, estado')
    .eq('id', prestamoOriginalId)
    .single();

  if (originalError || !original) {
    return jsonResponse({ error: 'Préstamo original no encontrado' }, 404);
  }
  if (original.estado !== 'activo') {
    return jsonResponse({ error: 'Solo se pueden refinanciar préstamos activos' }, 400);
  }

  const montoPrestamo = Number(original.saldo_restante) + Number(montoAdicional ?? 0);
  if (montoPrestamo <= 0) {
    return jsonResponse({ error: 'El monto a refinanciar debe ser mayor a cero' }, 400);
  }

  let simulacion;
  try {
    simulacion = calcularSimulacion({
      montoPrestamo,
      cantidadCuotas,
      tasaInteres,
      fechaInicio: new Date(`${fechaOtorgamiento}T00:00:00Z`),
      sistemaAmortizacion,
      frecuenciaCobro,
    });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Simulación inválida' }, 400);
  }

  const cuotasPayload = simulacion.detalleCuotas.map((c) => ({
    nro_cuota: c.numeroCuota,
    monto: c.monto,
    interes: c.interes,
    capital: c.capital,
    fecha_vto: c.fechaVencimiento.toISOString().slice(0, 10),
  }));

  const { data, error } = await supabase.rpc('refinanciar_prestamo', {
    p_prestamo_original_id: prestamoOriginalId,
    p_monto_adicional: montoAdicional ?? 0,
    p_cantidad_cuotas: cantidadCuotas,
    p_tasa_interes: tasaInteres,
    p_sistema_amortizacion: sistemaAmortizacion,
    p_frecuencia_cobro: frecuenciaCobro,
    p_fecha_otorgamiento: fechaOtorgamiento,
    p_fecha_primer_vto: cuotasPayload[0].fecha_vto,
    p_cuotas: cuotasPayload,
    p_moneda: moneda ?? null,
    p_cobrador_id: cobradorId ?? null,
    p_gasto_administrativo_monto: gastoAdministrativoMonto ?? null,
    p_gasto_administrativo_frecuencia: gastoAdministrativoFrecuencia ?? null,
    p_multa_por_atraso_monto: multaPorAtrasoMonto ?? null,
    p_motivo: motivo ?? null,
  });

  if (error) {
    return jsonResponse({ error: error.message }, 400);
  }

  return jsonResponse({ prestamoId: data, montoPrestamo, simulacion }, 201);
});
