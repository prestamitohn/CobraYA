import { supabase } from '../lib/supabase';
import { EstadoPrestamo, ReportePrestamoRow } from '../types/cobraya';

interface ReportePrestamoDbRow {
  prestamo_id: string;
  cliente_id: string;
  cliente_nombre: string;
  cliente_apellido: string | null;
  cliente_documento: string;
  numero_socio: string | null;
  monto_otorgado: number;
  monto_cuota_actual: number | null;
  cuotas_pagadas: number;
  cuotas_totales: number;
  total_pagado: number;
  saldo_pendiente: number;
  estado: EstadoPrestamo;
  fecha_otorgamiento: string;
  fecha_fin_estimada: string | null;
}

/** Historial de préstamos del tenant con cuota actual y saldo pendiente real — ver reporte_prestamos() en Postgres. */
export async function getReportePrestamos(): Promise<ReportePrestamoRow[]> {
  const { data, error } = await supabase.rpc('reporte_prestamos');
  if (error) throw error;
  return ((data ?? []) as ReportePrestamoDbRow[]).map((r) => ({
    prestamoId: r.prestamo_id,
    clienteId: r.cliente_id,
    clienteNombre: r.cliente_nombre,
    clienteApellido: r.cliente_apellido,
    clienteDocumento: r.cliente_documento,
    numeroSocio: r.numero_socio,
    montoOtorgado: Number(r.monto_otorgado),
    montoCuotaActual: r.monto_cuota_actual != null ? Number(r.monto_cuota_actual) : null,
    cuotasPagadas: Number(r.cuotas_pagadas),
    cuotasTotales: r.cuotas_totales,
    totalPagado: Number(r.total_pagado),
    saldoPendiente: Number(r.saldo_pendiente),
    estado: r.estado,
    fechaOtorgamiento: r.fecha_otorgamiento,
    fechaFinEstimada: r.fecha_fin_estimada,
  }));
}
