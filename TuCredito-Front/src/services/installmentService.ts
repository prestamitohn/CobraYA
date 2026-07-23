import { supabase } from '../lib/supabase';
import { Cuota, EstadoCuota } from '../types/cobraya';

interface CuotaRow {
  id: string;
  prestamo_id: string;
  nro_cuota: number;
  monto: number;
  interes: number | null;
  capital: number | null;
  saldo_pendiente: number | null;
  fecha_vto: string;
  estado: EstadoCuota;
}

function mapCuota(row: CuotaRow): Cuota {
  return {
    id: row.id,
    prestamoId: row.prestamo_id,
    nroCuota: row.nro_cuota,
    monto: row.monto,
    interes: row.interes,
    capital: row.capital,
    saldoPendiente: row.saldo_pendiente,
    fechaVto: row.fecha_vto,
    estado: row.estado,
  };
}

export async function getInstallments(filters: { prestamoId?: string; estado?: EstadoCuota }): Promise<Cuota[]> {
  let query = supabase
    .from('cuotas')
    .select('id, prestamo_id, nro_cuota, monto, interes, capital, saldo_pendiente, fecha_vto, estado')
    .order('nro_cuota');

  if (filters.prestamoId) query = query.eq('prestamo_id', filters.prestamoId);
  if (filters.estado) query = query.eq('estado', filters.estado);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => mapCuota(row as CuotaRow));
}
