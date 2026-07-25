import { supabase } from '../lib/supabase';
import { Multa, EstadoCuota } from '../types/cobraya';

interface MultaRow {
  id: string;
  prestamo_id: string;
  cuota_id: string;
  monto: number;
  saldo_pendiente: number;
  motivo: string;
  fecha_incumplimiento: string;
  estado: EstadoCuota;
  aplicada_automaticamente: boolean;
}

function mapMulta(row: MultaRow): Multa {
  return {
    id: row.id,
    prestamoId: row.prestamo_id,
    cuotaId: row.cuota_id,
    monto: row.monto,
    saldoPendiente: row.saldo_pendiente,
    motivo: row.motivo,
    fechaIncumplimiento: row.fecha_incumplimiento,
    estado: row.estado,
    aplicadaAutomaticamente: row.aplicada_automaticamente,
  };
}

export async function getMultasByPrestamo(prestamoId: string): Promise<Multa[]> {
  const { data, error } = await supabase
    .from('multas')
    .select('id, prestamo_id, cuota_id, monto, saldo_pendiente, motivo, fecha_incumplimiento, estado, aplicada_automaticamente')
    .eq('prestamo_id', prestamoId)
    .order('fecha_incumplimiento', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => mapMulta(row as MultaRow));
}

export interface AplicarMultaInput {
  cuotaId: string;
  monto: number;
  motivo?: string;
  fechaIncumplimiento?: string; // yyyy-mm-dd
}

export async function aplicarMulta(input: AplicarMultaInput): Promise<string> {
  const { data, error } = await supabase.rpc('aplicar_multa', {
    p_cuota_id: input.cuotaId,
    p_monto: input.monto,
    p_motivo: input.motivo ?? 'No pagó',
    p_fecha_incumplimiento: input.fechaIncumplimiento ?? new Date().toISOString().slice(0, 10),
  });
  if (error) throw error;
  return data as string;
}

export interface RegistrarPagoMultaInput {
  multaId: string;
  medioPagoId: number;
  monto: number;
  descuento?: number;
  recargo?: number;
  observaciones?: string;
  fechaPago?: string;
}

export async function registrarPagoMulta(input: RegistrarPagoMultaInput): Promise<string> {
  const { data, error } = await supabase.rpc('registrar_pago_multa', {
    p_multa_id: input.multaId,
    p_medio_pago_id: input.medioPagoId,
    p_monto: input.monto,
    p_descuento: input.descuento ?? 0,
    p_recargo: input.recargo ?? 0,
    p_observaciones: input.observaciones ?? null,
    p_fecha_pago: input.fechaPago ?? new Date().toISOString().slice(0, 10),
  });
  if (error) throw error;
  return data as string;
}
