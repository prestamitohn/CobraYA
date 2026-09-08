import { supabase } from '../lib/supabase';
import { MedioPago } from '../types/cobraya';

export interface PagoDetalle {
  id: string;
  cuotaId: string | null;
  prestamoId: string | null;
  /** 'cuota' | 'gasto' | 'multa' — de qué tabla viene este pago, ya que pagos cubre las tres. */
  tipo: 'cuota' | 'gasto' | 'multa';
  /** Texto listo para mostrar: "Cuota 3/12", "Gasto Administrativo #2", "Multa por Atraso". */
  concepto: string;
  clienteId: string | null;
  clienteNombre: string;
  clienteDocumento: string | null;
  clienteTelefono: string | null;
  fechaPago: string;
  medioPago: string;
  monto: number;
  descuento: number;
  recargo: number;
  estado: string;
  /** Quién registró el pago (usuarios.nombre) — null si lo cobró el dueño sin cuenta de cobrador asignada. */
  cobradorNombre: string | null;
}

interface ClienteEmbed {
  id: string;
  nombre: string;
  apellido: string | null;
  documento: string;
  telefono: string | null;
}

interface PagoRow {
  id: string;
  cuota_id: string | null;
  gasto_administrativo_id: string | null;
  multa_id: string | null;
  fecha_pago: string;
  monto: number;
  descuento: number;
  recargo: number;
  estado: string;
  cobrador: { nombre: string } | null;
  cuota: {
    nro_cuota: number;
    prestamo: { id: string; cantidad_cuotas: number; cliente: ClienteEmbed | null } | null;
  } | null;
  gasto: {
    numero: number;
    prestamo: { id: string; cliente: ClienteEmbed | null } | null;
  } | null;
  multa: {
    motivo: string;
    prestamo: { id: string; cliente: ClienteEmbed | null } | null;
  } | null;
  medio_pago: { nombre: string } | null;
}

const PAGO_SELECT = `
  id, cuota_id, gasto_administrativo_id, multa_id, fecha_pago, monto, descuento, recargo, estado,
  cuota:cuotas(nro_cuota, prestamo:prestamos(id, cantidad_cuotas, cliente:clientes(id, nombre, apellido, documento, telefono))),
  gasto:gastos_administrativos(numero, prestamo:prestamos(id, cliente:clientes(id, nombre, apellido, documento, telefono))),
  multa:multas(motivo, prestamo:prestamos(id, cliente:clientes(id, nombre, apellido, documento, telefono))),
  medio_pago:medios_pago(nombre),
  cobrador:usuarios(nombre)
`;

function mapPago(row: PagoRow): PagoDetalle {
  let tipo: PagoDetalle['tipo'] = 'cuota';
  let concepto = '-';
  let cliente: ClienteEmbed | null = null;
  let prestamoId: string | null = null;

  if (row.cuota_id && row.cuota) {
    tipo = 'cuota';
    concepto = `Cuota ${row.cuota.nro_cuota}/${row.cuota.prestamo?.cantidad_cuotas ?? '?'}`;
    cliente = row.cuota.prestamo?.cliente ?? null;
    prestamoId = row.cuota.prestamo?.id ?? null;
  } else if (row.gasto_administrativo_id && row.gasto) {
    tipo = 'gasto';
    concepto = `Gasto Administrativo #${row.gasto.numero}`;
    cliente = row.gasto.prestamo?.cliente ?? null;
    prestamoId = row.gasto.prestamo?.id ?? null;
  } else if (row.multa_id && row.multa) {
    tipo = 'multa';
    concepto = `Multa por Atraso — ${row.multa.motivo}`;
    cliente = row.multa.prestamo?.cliente ?? null;
    prestamoId = row.multa.prestamo?.id ?? null;
  }

  return {
    id: row.id,
    cuotaId: row.cuota_id,
    prestamoId,
    tipo,
    concepto,
    clienteId: cliente?.id ?? null,
    clienteNombre: cliente ? `${cliente.nombre} ${cliente.apellido ?? ''}`.trim() : 'N/A',
    clienteDocumento: cliente?.documento ?? null,
    clienteTelefono: cliente?.telefono ?? null,
    fechaPago: row.fecha_pago,
    medioPago: row.medio_pago?.nombre ?? '-',
    monto: row.monto,
    descuento: row.descuento,
    recargo: row.recargo,
    estado: row.estado,
    cobradorNombre: row.cobrador?.nombre ?? null,
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
