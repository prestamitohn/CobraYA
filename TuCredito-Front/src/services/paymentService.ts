import { supabase } from '../lib/supabase';
import { MedioPago } from '../types/cobraya';

export interface PagoDetalle {
  id: string;
  cuotaId: string;
  nroCuota: number;
  cantidadCuotas: number;
  clienteId: string | null;
  clienteNombre: string;
  fechaPago: string;
  medioPago: string;
  monto: number;
  descuento: number;
  recargo: number;
  estado: string;
}

interface PagoRow {
  id: string;
  cuota_id: string;
  fecha_pago: string;
  monto: number;
  descuento: number;
  recargo: number;
  estado: string;
  cuota: {
    nro_cuota: number;
    prestamo: {
      cantidad_cuotas: number;
      cliente: { id: string; nombre: string; apellido: string | null } | null;
    } | null;
  } | null;
  medio_pago: { nombre: string } | null;
}

const PAGO_SELECT = `
  id, cuota_id, fecha_pago, monto, descuento, recargo, estado,
  cuota:cuotas(nro_cuota, prestamo:prestamos(cantidad_cuotas, cliente:clientes(id, nombre, apellido))),
  medio_pago:medios_pago(nombre)
`;

function mapPago(row: PagoRow): PagoDetalle {
  const cliente = row.cuota?.prestamo?.cliente;
  return {
    id: row.id,
    cuotaId: row.cuota_id,
    nroCuota: row.cuota?.nro_cuota ?? 0,
    cantidadCuotas: row.cuota?.prestamo?.cantidad_cuotas ?? 0,
    clienteId: cliente?.id ?? null,
    clienteNombre: cliente ? `${cliente.nombre} ${cliente.apellido ?? ''}`.trim() : 'N/A',
    fechaPago: row.fecha_pago,
    medioPago: row.medio_pago?.nombre ?? '-',
    monto: row.monto,
    descuento: row.descuento,
    recargo: row.recargo,
    estado: row.estado,
  };
}

export async function getPayments(): Promise<PagoDetalle[]> {
  const { data, error } = await supabase
    .from('pagos')
    .select(PAGO_SELECT)
    .order('fecha_pago', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => mapPago(row as unknown as PagoRow));
}

export async function getMediosPago(): Promise<MedioPago[]> {
  const { data, error } = await supabase.from('medios_pago').select('id, nombre').order('id');
  if (error) throw error;
  return data ?? [];
}

export interface RegistrarPagoInput {
  cuotaId: string;
  medioPagoId: number;
  monto: number;
  descuento?: number;
  recargo?: number;
  observaciones?: string;
  fechaPago?: string; // yyyy-mm-dd
}

export async function registrarPago(input: RegistrarPagoInput): Promise<string> {
  const { data, error } = await supabase.rpc('registrar_pago', {
    p_cuota_id: input.cuotaId,
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
