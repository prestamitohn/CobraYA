import { supabase } from '../lib/supabase';
import { Aportacion, ExcedenteDetalleSocio, ExcedentePeriodo, TipoAportacion } from '../types/cobraya';

interface AportacionRow {
  id: string;
  cliente_id: string;
  tipo: TipoAportacion;
  monto: number;
  fecha: string;
  observaciones: string | null;
  created_at: string;
}

function mapAportacion(row: AportacionRow): Aportacion {
  return {
    id: row.id,
    clienteId: row.cliente_id,
    tipo: row.tipo,
    monto: Number(row.monto),
    fecha: row.fecha,
    observaciones: row.observaciones,
    createdAt: row.created_at,
  };
}

/** Aportaciones de un socio (cliente), más recientes primero. */
export async function getAportacionesByCliente(clienteId: string): Promise<Aportacion[]> {
  const { data, error } = await supabase
    .from('aportaciones')
    .select('id, cliente_id, tipo, monto, fecha, observaciones, created_at')
    .eq('cliente_id', clienteId)
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as AportacionRow[]).map(mapAportacion);
}

/** Saldo actual de aportaciones de un socio (suma obligatoria+extraordinaria, menos retiros). */
export async function getSaldoAportaciones(clienteId: string): Promise<number> {
  const { data, error } = await supabase.rpc('saldos_aportaciones');
  if (error) throw error;
  const row = ((data ?? []) as { cliente_id: string; saldo: number }[]).find((r) => r.cliente_id === clienteId);
  return row ? Number(row.saldo) : 0;
}

/** Saldos de aportaciones de todos los socios del tenant (mapa clienteId -> saldo). */
export async function getSaldosAportaciones(): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc('saldos_aportaciones');
  if (error) throw error;
  const map: Record<string, number> = {};
  for (const row of (data ?? []) as { cliente_id: string; saldo: number }[]) {
    map[row.cliente_id] = Number(row.saldo);
  }
  return map;
}

export async function registrarAportacion(input: {
  clienteId: string;
  tipo: TipoAportacion;
  monto: number;
  fecha?: string;
  observaciones?: string | null;
}): Promise<string> {
  const { data, error } = await supabase.rpc('registrar_aportacion', {
    p_cliente_id: input.clienteId,
    p_tipo: input.tipo,
    p_monto: input.monto,
    p_fecha: input.fecha ?? new Date().toISOString().slice(0, 10),
    p_observaciones: input.observaciones ?? null,
  });
  if (error) throw error;
  return data as string;
}

interface ExcedenteDetalleRow {
  cliente_id: string;
  nombre: string;
  apellido: string | null;
  interes_pagado: number;
  proporcion: number;
  monto_excedente: number;
}

function mapDetalle(row: ExcedenteDetalleRow): ExcedenteDetalleSocio {
  return {
    clienteId: row.cliente_id,
    nombre: row.nombre,
    apellido: row.apellido,
    interesPagado: Number(row.interes_pagado),
    proporcion: Number(row.proporcion),
    montoExcedente: Number(row.monto_excedente),
  };
}

/** Cálculo del excedente para un rango de fechas sin persistir — para que el dueño revise antes de confirmar. */
export async function previsualizarExcedente(fechaDesde: string, fechaHasta: string, porcentajeReserva = 10): Promise<ExcedenteDetalleSocio[]> {
  const { data, error } = await supabase.rpc('previsualizar_excedente', {
    p_fecha_desde: fechaDesde,
    p_fecha_hasta: fechaHasta,
    p_porcentaje_reserva: porcentajeReserva,
  });
  if (error) throw error;
  return ((data ?? []) as ExcedenteDetalleRow[]).map(mapDetalle);
}

/** Confirma y persiste el cierre de excedente del período (no se puede repetir el mismo rango de fechas). */
export async function calcularYGuardarExcedente(fechaDesde: string, fechaHasta: string, porcentajeReserva = 10): Promise<string> {
  const { data, error } = await supabase.rpc('calcular_y_guardar_excedente', {
    p_fecha_desde: fechaDesde,
    p_fecha_hasta: fechaHasta,
    p_porcentaje_reserva: porcentajeReserva,
  });
  if (error) throw error;
  return data as string;
}

interface ExcedentePeriodoRow {
  id: string;
  fecha_desde: string;
  fecha_hasta: string;
  ingresos_totales: number;
  porcentaje_reserva: number;
  monto_reserva: number;
  excedente_distribuible: number;
  created_at: string;
}

function mapPeriodo(row: ExcedentePeriodoRow): ExcedentePeriodo {
  return {
    id: row.id,
    fechaDesde: row.fecha_desde,
    fechaHasta: row.fecha_hasta,
    ingresosTotales: Number(row.ingresos_totales),
    porcentajeReserva: Number(row.porcentaje_reserva),
    montoReserva: Number(row.monto_reserva),
    excedenteDistribuible: Number(row.excedente_distribuible),
    createdAt: row.created_at,
  };
}

/** Historial de cierres de excedente ya guardados, más recientes primero. */
export async function getExcedentesPeriodos(): Promise<ExcedentePeriodo[]> {
  const { data, error } = await supabase
    .from('excedentes_periodo')
    .select('id, fecha_desde, fecha_hasta, ingresos_totales, porcentaje_reserva, monto_reserva, excedente_distribuible, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as ExcedentePeriodoRow[]).map(mapPeriodo);
}

/** Detalle por socio de un cierre de excedente ya guardado. */
export async function getExcedenteDetalle(periodoId: string): Promise<ExcedenteDetalleSocio[]> {
  const { data, error } = await supabase
    .from('excedentes_detalle')
    .select('cliente_id, interes_pagado, proporcion, monto_excedente, clientes(nombre, apellido)')
    .eq('excedente_periodo_id', periodoId)
    .order('monto_excedente', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as any[]).map((row) => ({
    clienteId: row.cliente_id,
    nombre: row.clientes?.nombre ?? '',
    apellido: row.clientes?.apellido ?? null,
    interesPagado: Number(row.interes_pagado),
    proporcion: Number(row.proporcion),
    montoExcedente: Number(row.monto_excedente),
  }));
}
