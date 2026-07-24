import { supabase } from '../lib/supabase';
import { GastoAdministrativo, EstadoCuota } from '../types/cobraya';

interface GastoAdministrativoRow {
  id: string;
  prestamo_id: string;
  numero: number;
  monto: number;
  saldo_pendiente: number;
  fecha_vto: string;
  estado: EstadoCuota;
}

function mapGasto(row: GastoAdministrativoRow): GastoAdministrativo {
  return {
    id: row.id,
    prestamoId: row.prestamo_id,
    numero: row.numero,
    monto: row.monto,
    saldoPendiente: row.saldo_pendiente,
    fechaVto: row.fecha_vto,
    estado: row.estado,
  };
}

export async function getGastosAdministrativos(prestamoId: string): Promise<GastoAdministrativo[]> {
  const { data, error } = await supabase
    .from('gastos_administrativos')
    .select('id, prestamo_id, numero, monto, saldo_pendiente, fecha_vto, estado')
    .eq('prestamo_id', prestamoId)
    .order('numero');
  if (error) throw error;
  return (data ?? []).map((row) => mapGasto(row as GastoAdministrativoRow));
}

export interface RegistrarPagoGastoInput {
  gastoAdministrativoId: string;
  medioPagoId: number;
  monto: number;
  descuento?: number;
  recargo?: number;
  observaciones?: string;
  fechaPago?: string; // yyyy-mm-dd
}

export async function registrarPagoGastoAdministrativo(input: RegistrarPagoGastoInput): Promise<string> {
  const { data, error } = await supabase.rpc('registrar_pago_gasto_administrativo', {
    p_gasto_administrativo_id: input.gastoAdministrativoId,
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
