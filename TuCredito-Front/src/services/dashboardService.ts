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

/** Suma proporcional de interés o capital cobrado en un pago, prorrateando monto pagado según la composición de la cuota (mismo criterio que el motor de amortización). */
function proporcionCuota(pago: { monto: number; cuota?: { monto: number; interes: number | null; capital: number | null } | null }, campo: 'interes' | 'capital'): number {
  const cuotaMonto = Number(pago.cuota?.monto ?? 0);
  const cuotaCampo = Number(pago.cuota?.[campo] ?? 0);
  if (cuotaMonto <= 0) return 0;
  return Number(pago.monto) * (cuotaCampo / cuotaMonto);
}

/** Ganancia (interés + multas + servicios administrativos, sin capital) cobrada desde una fecha de corte en adelante. */
function gananciaDesde(pagos: PagoConDetalle[], desdeMs: number): number {
  return pagos.reduce((acc, p) => {
    if (new Date(p.fecha_pago).getTime() < desdeMs) return acc;
    if (p.multa_id || p.gasto_administrativo_id) return acc + Number(p.monto);
    return acc + proporcionCuota(p, 'interes');
  }, 0);
}

interface PagoConDetalle {
  monto: number;
  fecha_pago: string;
  multa_id: string | null;
  gasto_administrativo_id: string | null;
  cuota: { monto: number; interes: number | null; capital: number | null } | null;
}

export async function getDashboardKpis(): Promise<DashboardKpisDTO> {
  await actualizarMora();

  const [
    { data: prestamos, error: e1 },
    { data: cuotas, error: e2 },
    { data: pagos, error: e3 },
    { data: clientes, error: e4 },
    { data: cuotasVencidas, error: e5 },
  ] = await Promise.all([
    supabase.from('prestamos').select('monto_otorgado'),
    supabase.from('cuotas').select('monto, interes, estado'),
    supabase.from('pagos').select('monto, fecha_pago, multa_id, gasto_administrativo_id, cuota:cuotas(monto, interes, capital)'),
    supabase.from('clientes').select('id, activo'),
    supabase.from('cuotas').select('prestamo:prestamos(cliente_id)').eq('estado', 'vencida'),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  if (e3) throw e3;
  if (e4) throw e4;
  if (e5) throw e5;

  const pagosDetalle = (pagos ?? []) as unknown as PagoConDetalle[];

  const totalPrestadoHistorico = (prestamos ?? []).reduce((acc, p) => acc + Number(p.monto_otorgado), 0);

  const capitalPendiente = (cuotas ?? [])
    .filter((c) => c.estado === 'pendiente' || c.estado === 'vencida')
    .reduce((acc, c) => acc + (Number(c.monto) - Number(c.interes ?? 0)), 0);

  const totalEnMora = (cuotas ?? [])
    .filter((c) => c.estado === 'vencida')
    .reduce((acc, c) => acc + Number(c.monto), 0);

  const totalCobrado = pagosDetalle.reduce((acc, p) => acc + Number(p.monto), 0);

  const totalInteresCobrado = pagosDetalle.reduce((acc, p) => acc + proporcionCuota(p, 'interes'), 0);
  const capitalRecuperado = pagosDetalle.reduce((acc, p) => acc + proporcionCuota(p, 'capital'), 0);
  const gananciaMultas = pagosDetalle.filter((p) => !!p.multa_id).reduce((acc, p) => acc + Number(p.monto), 0);
  const gananciaServicios = pagosDetalle.filter((p) => !!p.gasto_administrativo_id).reduce((acc, p) => acc + Number(p.monto), 0);
  const gananciaNeta = totalInteresCobrado + gananciaMultas + gananciaServicios;

  const porcentajeMorosidad = capitalPendiente > 0 ? Math.round((totalEnMora / capitalPendiente) * 1000) / 10 : 0;
  const rentabilidad = totalPrestadoHistorico > 0 ? Math.round((totalInteresCobrado / totalPrestadoHistorico) * 1000) / 10 : 0;

  const ahora = Date.now();
  const dia = 24 * 60 * 60 * 1000;
  const rentabilidadEnVentana = (dias: number) =>
    totalPrestadoHistorico > 0 ? Math.round((gananciaDesde(pagosDetalle, ahora - dias * dia) / totalPrestadoHistorico) * 1000) / 10 : 0;

  const totalClientes = clientes?.length ?? 0;
  const clientesActivos = (clientes ?? []).filter((c) => c.activo).length;
  const clientesEnMora = new Set((cuotasVencidas ?? []).map((r: any) => r.prestamo?.cliente_id).filter(Boolean)).size;

  return {
    totalPrestadoHistorico,
    capitalPendiente,
    totalCobrado,
    totalInteresCobrado,
    totalEnMora,
    porcentajeMorosidad,
    rentabilidad,
    capitalRecuperado,
    gananciaIntereses: totalInteresCobrado,
    gananciaMultas,
    gananciaServicios,
    gananciaNeta,
    rentabilidadSemanal: rentabilidadEnVentana(7),
    rentabilidadMensual: rentabilidadEnVentana(30),
    rentabilidadAnual: rentabilidadEnVentana(365),
    totalClientes,
    clientesActivos,
    clientesEnMora,
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

/** Ingresos cobrados por semana calendario (lunes a domingo), últimas 8 semanas — para comparar semana a semana. */
export async function getWeeklyCollections(): Promise<GraficoDatoDTO[]> {
  const { data, error } = await supabase.from('pagos').select('monto, fecha_pago');
  if (error) throw error;

  const startOfWeek = (d: Date) => {
    const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const dayOfWeek = date.getUTCDay(); // 0=domingo
    const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    date.setUTCDate(date.getUTCDate() - diffToMonday);
    return date;
  };

  const hoy = new Date();
  const semanas: { inicio: Date; valor: number }[] = [];
  for (let i = 7; i >= 0; i--) {
    const inicio = startOfWeek(new Date(hoy.getTime() - i * 7 * 24 * 60 * 60 * 1000));
    semanas.push({ inicio, valor: 0 });
  }

  for (const row of data ?? []) {
    const fecha = new Date(`${row.fecha_pago}T00:00:00Z`);
    const inicioSemana = startOfWeek(fecha).getTime();
    const semana = semanas.find((s) => s.inicio.getTime() === inicioSemana);
    if (semana) semana.valor += Number(row.monto);
  }

  return semanas.map((s) => ({
    etiqueta: `${s.inicio.getUTCDate()}/${s.inicio.getUTCMonth() + 1}`,
    valor: s.valor,
  }));
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

export interface ProyeccionSemanalRow {
  etiqueta: string;
  cantidadCuotas: number;
  capital: number;
  interes: number;
  serviciosAdministrativos: number;
  total: number;
}

/** Proyección semana a semana (lunes a domingo) de lo que se espera cobrar: cuotas pendientes + cronograma de gastos administrativos pendientes, desglosado por capital/interés/servicios. */
export async function getWeeklyPortfolioProjection(semanas = 6): Promise<ProyeccionSemanalRow[]> {
  const [{ data: cuotas, error: e1 }, { data: gastos, error: e2 }] = await Promise.all([
    supabase.from('cuotas').select('monto, interes, fecha_vto').eq('estado', 'pendiente'),
    supabase.from('gastos_administrativos').select('monto, fecha_vto').eq('estado', 'pendiente'),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;

  const startOfDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const hoy = startOfDay(new Date());

  const buckets = Array.from({ length: semanas }, (_, i) => {
    const inicio = new Date(hoy.getTime() + i * 7 * 24 * 60 * 60 * 1000);
    const fin = new Date(inicio.getTime() + 7 * 24 * 60 * 60 * 1000);
    return { inicio, fin, cantidadCuotas: 0, capital: 0, interes: 0, serviciosAdministrativos: 0 };
  });

  for (const c of cuotas ?? []) {
    const t = new Date(`${c.fecha_vto}T00:00:00Z`).getTime();
    const bucket = buckets.find((b) => t >= b.inicio.getTime() && t < b.fin.getTime());
    if (!bucket) continue;
    const interes = Number(c.interes ?? 0);
    bucket.cantidadCuotas += 1;
    bucket.interes += interes;
    bucket.capital += Number(c.monto) - interes;
  }

  for (const g of gastos ?? []) {
    const t = new Date(`${g.fecha_vto}T00:00:00Z`).getTime();
    const bucket = buckets.find((b) => t >= b.inicio.getTime() && t < b.fin.getTime());
    if (bucket) bucket.serviciosAdministrativos += Number(g.monto);
  }

  const fmt = (d: Date) => `${d.getUTCDate().toString().padStart(2, '0')}/${(d.getUTCMonth() + 1).toString().padStart(2, '0')}`;

  return buckets.map((b) => ({
    etiqueta: `${fmt(b.inicio)} - ${fmt(new Date(b.fin.getTime() - 24 * 60 * 60 * 1000))}`,
    cantidadCuotas: b.cantidadCuotas,
    capital: b.capital,
    interes: b.interes,
    serviciosAdministrativos: b.serviciosAdministrativos,
    total: b.capital + b.interes + b.serviciosAdministrativos,
  }));
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
