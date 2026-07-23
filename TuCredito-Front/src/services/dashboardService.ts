import { supabase } from '../lib/supabase';
import { getEstadoPrestamoLabel } from '../types/cobraya';
import {
  DashboardKpisDTO,
  GraficoDatoDTO,
  SerieTiempoDTO,
  MorosidadDetalleDTO,
  TransactionDTO,
} from '../types';

// Reimplementación de DashboardService.cs (.NET) sobre Supabase: se trae el dataset
// (ya acotado por RLS al tenant actual — negocios chicos, volumen bajo) y se agrega en
// JS, en vez de escribir una vista SQL por gráfico. Fórmulas idénticas a las del
// original documentadas ahí.

export interface CuotaAVencerDTO {
  fechaVencimiento: string;
  nombrePrestatario: string;
  apellidoPrestatario: string;
  monto: number;
}

async function actualizarMora(): Promise<void> {
  await supabase.rpc('actualizar_cuotas_vencidas');
}

export async function getDashboardKpis(): Promise<DashboardKpisDTO> {
  await actualizarMora();

  const [{ data: prestamos, error: e1 }, { data: cuotas, error: e2 }, { data: pagos, error: e3 }] = await Promise.all([
    supabase.from('prestamos').select('monto_otorgado'),
    supabase.from('cuotas').select('monto, interes, estado'),
    supabase.from('pagos').select('monto, cuota:cuotas(monto, interes)'),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  if (e3) throw e3;

  const totalPrestadoHistorico = (prestamos ?? []).reduce((acc, p) => acc + Number(p.monto_otorgado), 0);

  const capitalPendiente = (cuotas ?? [])
    .filter((c) => c.estado === 'pendiente' || c.estado === 'vencida')
    .reduce((acc, c) => acc + (Number(c.monto) - Number(c.interes ?? 0)), 0);

  const totalEnMora = (cuotas ?? [])
    .filter((c) => c.estado === 'vencida')
    .reduce((acc, c) => acc + Number(c.monto), 0);

  const totalCobrado = (pagos ?? []).reduce((acc, p) => acc + Number(p.monto), 0);

  const totalInteresCobrado = (pagos ?? []).reduce((acc: number, p: any) => {
    const cuotaMonto = Number(p.cuota?.monto ?? 0);
    const cuotaInteres = Number(p.cuota?.interes ?? 0);
    if (cuotaMonto <= 0) return acc;
    return acc + Number(p.monto) * (cuotaInteres / cuotaMonto);
  }, 0);

  const porcentajeMorosidad = capitalPendiente > 0 ? Math.round((totalEnMora / capitalPendiente) * 1000) / 10 : 0;
  const rentabilidad = totalPrestadoHistorico > 0 ? Math.round((totalInteresCobrado / totalPrestadoHistorico) * 1000) / 10 : 0;

  return {
    totalPrestadoHistorico,
    capitalPendiente,
    totalCobrado,
    totalInteresCobrado,
    totalEnMora,
    porcentajeMorosidad,
    rentabilidad,
  };
}

export async function getLoansTrend(): Promise<SerieTiempoDTO[]> {
  const { data, error } = await supabase.from('prestamos').select('monto_otorgado, fecha_otorgamiento');
  if (error) throw error;

  const buckets = new Map<string, SerieTiempoDTO>();
  for (const row of data ?? []) {
    const d = new Date(row.fecha_otorgamiento);
    const anio = d.getUTCFullYear();
    const mes = d.getUTCMonth() + 1;
    const key = `${anio}-${mes}`;
    const existing = buckets.get(key) ?? { anio, mes, valor: 0 };
    existing.valor += Number(row.monto_otorgado);
    buckets.set(key, existing);
  }

  return Array.from(buckets.values())
    .sort((a, b) => a.anio - b.anio || a.mes - b.mes)
    .slice(-12);
}

export async function getLoansByStatus(): Promise<GraficoDatoDTO[]> {
  const { data, error } = await supabase.from('prestamos').select('estado').neq('estado', 'eliminado');
  if (error) throw error;

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    counts.set(row.estado, (counts.get(row.estado) ?? 0) + 1);
  }

  return Array.from(counts.entries()).map(([estado, valor]) => ({
    etiqueta: getEstadoPrestamoLabel(estado as any),
    valor,
  }));
}

export async function getMonthlyCollections(): Promise<SerieTiempoDTO[]> {
  const { data, error } = await supabase.from('pagos').select('monto, fecha_pago');
  if (error) throw error;

  const buckets = new Map<string, SerieTiempoDTO>();
  for (const row of data ?? []) {
    const d = new Date(row.fecha_pago);
    const anio = d.getUTCFullYear();
    const mes = d.getUTCMonth() + 1;
    const key = `${anio}-${mes}`;
    const existing = buckets.get(key) ?? { anio, mes, valor: 0 };
    existing.valor += Number(row.monto);
    buckets.set(key, existing);
  }

  return Array.from(buckets.values())
    .sort((a, b) => a.anio - b.anio || a.mes - b.mes)
    .slice(-12);
}

export async function getUpcomingInstallments(): Promise<CuotaAVencerDTO[]> {
  const today = new Date().toISOString().slice(0, 10);
  const in15Days = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('cuotas')
    .select('monto, fecha_vto, prestamo:prestamos(cliente:clientes(nombre, apellido))')
    .eq('estado', 'pendiente')
    .gte('fecha_vto', today)
    .lte('fecha_vto', in15Days)
    .order('fecha_vto')
    .limit(10);
  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    fechaVencimiento: row.fecha_vto,
    nombrePrestatario: row.prestamo?.cliente?.nombre ?? '',
    apellidoPrestatario: row.prestamo?.cliente?.apellido ?? '',
    monto: Number(row.monto),
  }));
}

export async function getRecentTransactions(): Promise<TransactionDTO[]> {
  const [{ data: prestamos, error: e1 }, { data: pagos, error: e2 }] = await Promise.all([
    supabase
      .from('prestamos')
      .select('monto_otorgado, fecha_otorgamiento, estado, cliente:clientes(nombre, apellido)')
      .order('fecha_otorgamiento', { ascending: false })
      .limit(5),
    supabase
      .from('pagos')
      .select('monto, fecha_pago, estado, cuota:cuotas(prestamo:prestamos(cliente:clientes(nombre, apellido)))')
      .order('fecha_pago', { ascending: false })
      .limit(5),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;

  const loanTx: TransactionDTO[] = (prestamos ?? []).map((row: any) => ({
    type: 'Préstamo',
    date: row.fecha_otorgamiento,
    amount: Number(row.monto_otorgado),
    entityName: row.cliente ? `${row.cliente.nombre} ${row.cliente.apellido ?? ''}`.trim() : 'N/A',
    status: getEstadoPrestamoLabel(row.estado),
  }));

  const paymentTx: TransactionDTO[] = (pagos ?? []).map((row: any) => ({
    type: 'Pago',
    date: row.fecha_pago,
    amount: Number(row.monto),
    entityName: row.cuota?.prestamo?.cliente
      ? `${row.cuota.prestamo.cliente.nombre} ${row.cuota.prestamo.cliente.apellido ?? ''}`.trim()
      : 'N/A',
    status: row.estado,
  }));

  return [...loanTx, ...paymentTx]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 10);
}

export async function getCashFlowProjection(): Promise<GraficoDatoDTO[]> {
  const { data, error } = await supabase
    .from('cuotas')
    .select('monto, fecha_vto')
    .eq('estado', 'pendiente');
  if (error) throw error;

  const now = Date.now();
  const semanas = [1, 2, 3, 4].map((n) => ({
    etiqueta: `Semana ${n}`,
    inicio: now + (n - 1) * 7 * 24 * 60 * 60 * 1000,
    fin: now + n * 7 * 24 * 60 * 60 * 1000,
    valor: 0,
  }));

  for (const row of data ?? []) {
    const t = new Date(row.fecha_vto).getTime();
    const semana = semanas.find((s) => t >= s.inicio && t < s.fin);
    if (semana) semana.valor += Number(row.monto);
  }

  return semanas.map(({ etiqueta, valor }) => ({ etiqueta, valor }));
}

export async function getDelinquencyDetails(): Promise<MorosidadDetalleDTO[]> {
  const { data, error } = await supabase
    .from('cuotas')
    .select('monto, fecha_vto, prestamo:prestamos(cliente:clientes(nombre, apellido))')
    .eq('estado', 'vencida');
  if (error) throw error;

  const today = new Date();
  return (data ?? []).map((row: any) => {
    const fechaVencimiento = row.fecha_vto;
    const diasAtraso = Math.max(0, Math.floor((today.getTime() - new Date(fechaVencimiento).getTime()) / 86400000));
    const cliente = row.prestamo?.cliente;
    return {
      cliente: cliente ? `${cliente.nombre} ${cliente.apellido ?? ''}`.trim() : 'N/A',
      fechaVencimiento,
      diasAtraso,
      montoAdeudado: Number(row.monto),
    };
  });
}
