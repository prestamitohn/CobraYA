// Edge Function: crear-prestamo
//
// Único punto de la app que corre el motor de amortización del lado del servidor
// (con autoridad) antes de persistir. registrar_pago() y actualizar_cuotas_vencidas()
// son funciones Postgres puras y el front las invoca directo vía supabase.rpc() —
// pero crear un préstamo primero necesita CALCULAR el cronograma (JS/TS), algo que
// Postgres no puede hacer sin re-implementar las fórmulas en PL/pgSQL (tercera copia,
// riesgo de divergencia). Por eso esta función:
//   1. recalcula el cronograma con supabase/functions/_shared/amortizacion.ts
//      (nunca confía en el cronograma que el front pudo simular localmente), y
//   2. llama a la función Postgres crear_prestamo() vía RPC, reenviando el JWT del
//      usuario para que la inserción corra con SUS permisos (RLS sigue aplicando).

import { createClient } from 'npm:@supabase/supabase-js@2';
import { calcularSimulacion, type FrecuenciaCobro, type SistemaAmortizacion } from '../_shared/amortizacion.ts';
import { corsHeaders, handleCorsPreflight } from '../_shared/cors.ts';

interface CrearPrestamoPayload {
  clienteId: string;
  montoPrestamo: number;
  cantidadCuotas: number;
  tasaInteres: number;
  sistemaAmortizacion: SistemaAmortizacion;
  frecuenciaCobro: FrecuenciaCobro;
  fechaOtorgamiento: string; // ISO date (yyyy-mm-dd)
  moneda?: string;
  cobradorId?: string | null;
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

  let payload: CrearPrestamoPayload;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: 'Body inválido, se esperaba JSON' }, 400);
  }

  const {
    clienteId, montoPrestamo, cantidadCuotas, tasaInteres,
    sistemaAmortizacion, frecuenciaCobro, fechaOtorgamiento, moneda, cobradorId,
  } = payload;

  if (!clienteId || !montoPrestamo || !cantidadCuotas || tasaInteres === undefined
      || !sistemaAmortizacion || !frecuenciaCobro || !fechaOtorgamiento) {
    return jsonResponse({ error: 'Payload incompleto' }, 400);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

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
    saldo_pendiente: c.saldoRestante,
    fecha_vto: c.fechaVencimiento.toISOString().slice(0, 10),
  }));

  const { data, error } = await supabase.rpc('crear_prestamo', {
    p_cliente_id: clienteId,
    p_monto_otorgado: montoPrestamo,
    p_cantidad_cuotas: cantidadCuotas,
    p_tasa_interes: tasaInteres,
    p_sistema_amortizacion: sistemaAmortizacion,
    p_frecuencia_cobro: frecuenciaCobro,
    p_fecha_otorgamiento: fechaOtorgamiento,
    p_fecha_primer_vto: cuotasPayload[0].fecha_vto,
    p_moneda: moneda ?? 'HNL',
    p_cobrador_id: cobradorId ?? null,
    p_cuotas: cuotasPayload,
  });

  if (error) {
    return jsonResponse({ error: error.message }, 400);
  }

  return jsonResponse({ prestamoId: data, simulacion }, 201);
});
