import { supabase } from '../lib/supabase';
import {
  Aportacion,
  CuentaAhorro,
  EstadoCuentaAhorro,
  ExcedenteDetalleSocio,
  ExcedentePeriodo,
  FondoExcedenteConfig,
  FondoExcedenteSnapshot,
  Movimiento,
  OrigenMovimiento,
  PeriodicidadCapitalizacion,
  PerfilSocio,
  ProductoAhorro,
  ResumenFondosCooperativa,
  SaldoAportaciones,
  TipoAportacion,
  TipoMovimiento,
  TipoProductoAhorro,
} from '../types/cobraya';

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

interface SaldoAportacionesRow {
  cliente_id: string;
  saldo_total: number;
  saldo_reserva: number;
  saldo_retirable: number;
}

function mapSaldoAportaciones(row: SaldoAportacionesRow): SaldoAportaciones {
  return {
    clienteId: row.cliente_id,
    saldoTotal: Number(row.saldo_total),
    saldoReserva: Number(row.saldo_reserva),
    saldoRetirable: Number(row.saldo_retirable),
  };
}

/** Saldo actual de aportaciones de un socio, desglosado (total/reserva no retirable/retirable). */
export async function getSaldoAportaciones(clienteId: string): Promise<SaldoAportaciones> {
  const { data, error } = await supabase.rpc('saldos_aportaciones');
  if (error) throw error;
  const row = ((data ?? []) as SaldoAportacionesRow[]).find((r) => r.cliente_id === clienteId);
  return row ? mapSaldoAportaciones(row) : { clienteId, saldoTotal: 0, saldoReserva: 0, saldoRetirable: 0 };
}

/** Saldos de aportaciones de todos los socios del tenant (mapa clienteId -> saldo desglosado). */
export async function getSaldosAportaciones(): Promise<Record<string, SaldoAportaciones>> {
  const { data, error } = await supabase.rpc('saldos_aportaciones');
  if (error) throw error;
  const map: Record<string, SaldoAportaciones> = {};
  for (const row of (data ?? []) as SaldoAportacionesRow[]) {
    map[row.cliente_id] = mapSaldoAportaciones(row);
  }
  return map;
}

/** Interés acumulado sobre aportaciones (capital, ganado por devengo periódico) por socio del tenant. */
export async function getInteresAcumuladoAportaciones(): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc('interes_acumulado_aportaciones');
  if (error) throw error;
  const map: Record<string, number> = {};
  for (const row of (data ?? []) as { cliente_id: string; interes_acumulado: number }[]) {
    map[row.cliente_id] = Number(row.interes_acumulado);
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

interface ResumenFondosRow {
  capital_aportaciones_total: number;
  capital_aportaciones_reserva: number;
  capital_aportaciones_retirable: number;
  ahorros_captados: number;
  monto_otorgado_vigente: number;
  capital_pendiente_cobro: number;
  disponible_aportaciones: number;
}

/** Desglose de fondos de la cooperativa (capital social, reserva, ahorros, colocado y disponible) — ver resumen_fondos_cooperativa() en Postgres. */
export async function getResumenFondosCooperativa(): Promise<ResumenFondosCooperativa | null> {
  const { data, error } = await supabase.rpc('resumen_fondos_cooperativa');
  if (error) throw error;
  const row = (data as ResumenFondosRow[] | null)?.[0];
  if (!row) return null;
  return {
    capitalAportacionesTotal: Number(row.capital_aportaciones_total),
    capitalAportacionesReserva: Number(row.capital_aportaciones_reserva),
    capitalAportacionesRetirable: Number(row.capital_aportaciones_retirable),
    ahorrosCaptados: Number(row.ahorros_captados),
    montoOtorgadoVigente: Number(row.monto_otorgado_vigente),
    capitalPendienteCobro: Number(row.capital_pendiente_cobro),
    disponibleAportaciones: Number(row.disponible_aportaciones),
  };
}

export async function configurarInteresAportacion(tasaAnual: number, periodicidad: PeriodicidadCapitalizacion): Promise<void> {
  const { error } = await supabase.rpc('configurar_interes_aportacion', {
    p_tasa_anual: tasaAnual,
    p_periodicidad: periodicidad,
  });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Fondos de excedente (parametrizables — Reserva Legal obligatoria + los que
// cada cooperativa agregue, ej. Contribución Social, Educación, Bienestar Social)
// ---------------------------------------------------------------------------

interface FondoRow {
  id: string;
  nombre: string;
  porcentaje: number;
  orden: number;
  es_reserva_legal: boolean;
  activo: boolean;
}

function mapFondo(row: FondoRow): FondoExcedenteConfig {
  return {
    id: row.id,
    nombre: row.nombre,
    porcentaje: Number(row.porcentaje),
    orden: row.orden,
    esReservaLegal: row.es_reserva_legal,
    activo: row.activo,
  };
}

export async function getFondosExcedente(): Promise<FondoExcedenteConfig[]> {
  const { data, error } = await supabase
    .from('fondo_excedente_config')
    .select('id, nombre, porcentaje, orden, es_reserva_legal, activo')
    .order('orden', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as FondoRow[]).map(mapFondo);
}

export async function crearFondoExcedente(nombre: string, porcentaje: number, orden = 0): Promise<string> {
  const { data, error } = await supabase.rpc('crear_fondo_excedente', { p_nombre: nombre, p_porcentaje: porcentaje, p_orden: orden });
  if (error) throw error;
  return data as string;
}

export async function actualizarFondoExcedente(id: string, nombre: string, porcentaje: number, orden: number, activo: boolean): Promise<void> {
  const { error } = await supabase.rpc('actualizar_fondo_excedente', { p_id: id, p_nombre: nombre, p_porcentaje: porcentaje, p_orden: orden, p_activo: activo });
  if (error) throw error;
}

export async function eliminarFondoExcedente(id: string): Promise<void> {
  const { error } = await supabase.rpc('eliminar_fondo_excedente', { p_id: id });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Excedentes
// ---------------------------------------------------------------------------

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

/** Cálculo del excedente para un rango de fechas sin persistir — para que el dueño revise antes de confirmar. Aplica los fondos activos configurados (fondo_excedente_config). */
export async function previsualizarExcedente(fechaDesde: string, fechaHasta: string): Promise<ExcedenteDetalleSocio[]> {
  const { data, error } = await supabase.rpc('previsualizar_excedente', { p_fecha_desde: fechaDesde, p_fecha_hasta: fechaHasta });
  if (error) throw error;
  return ((data ?? []) as ExcedenteDetalleRow[]).map(mapDetalle);
}

/** Confirma y persiste el cierre de excedente del período (no se puede repetir el mismo rango de fechas). */
export async function calcularYGuardarExcedente(fechaDesde: string, fechaHasta: string): Promise<string> {
  const { data, error } = await supabase.rpc('calcular_y_guardar_excedente', { p_fecha_desde: fechaDesde, p_fecha_hasta: fechaHasta });
  if (error) throw error;
  return data as string;
}

interface ExcedentePeriodoRow {
  id: string;
  fecha_desde: string;
  fecha_hasta: string;
  ingresos_totales: number;
  excedente_neto: number;
  created_at: string;
}

function mapPeriodo(row: ExcedentePeriodoRow): ExcedentePeriodo {
  return {
    id: row.id,
    fechaDesde: row.fecha_desde,
    fechaHasta: row.fecha_hasta,
    ingresosTotales: Number(row.ingresos_totales),
    excedenteNeto: Number(row.excedente_neto),
    createdAt: row.created_at,
  };
}

/** Historial de cierres de excedente ya guardados, más recientes primero. */
export async function getExcedentesPeriodos(): Promise<ExcedentePeriodo[]> {
  const { data, error } = await supabase
    .from('excedentes_periodo')
    .select('id, fecha_desde, fecha_hasta, ingresos_totales, excedente_neto, created_at')
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

/** Fondos aplicados (snapshot inmutable) en un cierre ya guardado. */
export async function getExcedenteFondos(periodoId: string): Promise<FondoExcedenteSnapshot[]> {
  const { data, error } = await supabase
    .from('excedentes_periodo_fondos')
    .select('nombre, porcentaje, monto')
    .eq('excedente_periodo_id', periodoId);
  if (error) throw error;
  return ((data ?? []) as { nombre: string; porcentaje: number; monto: number }[]).map((r) => ({
    nombre: r.nombre,
    porcentaje: Number(r.porcentaje),
    monto: Number(r.monto),
  }));
}

// ---------------------------------------------------------------------------
// Productos y cuentas de ahorro
// ---------------------------------------------------------------------------

interface ProductoAhorroRow {
  id: string;
  nombre: string;
  tipo: TipoProductoAhorro;
  tasa_pasiva: number;
  periodicidad_capitalizacion: PeriodicidadCapitalizacion;
  permite_retiro_libre: boolean;
  penalidad_retiro_anticipado: number | null;
  plazo_dias: number | null;
  monto_meta: number | null;
  activo: boolean;
}

function mapProducto(row: ProductoAhorroRow): ProductoAhorro {
  return {
    id: row.id,
    nombre: row.nombre,
    tipo: row.tipo,
    tasaPasiva: Number(row.tasa_pasiva),
    periodicidadCapitalizacion: row.periodicidad_capitalizacion,
    permiteRetiroLibre: row.permite_retiro_libre,
    penalidadRetiroAnticipado: row.penalidad_retiro_anticipado != null ? Number(row.penalidad_retiro_anticipado) : null,
    plazoDias: row.plazo_dias,
    montoMeta: row.monto_meta != null ? Number(row.monto_meta) : null,
    activo: row.activo,
  };
}

export async function getProductosAhorro(): Promise<ProductoAhorro[]> {
  const { data, error } = await supabase
    .from('producto_ahorro')
    .select('id, nombre, tipo, tasa_pasiva, periodicidad_capitalizacion, permite_retiro_libre, penalidad_retiro_anticipado, plazo_dias, monto_meta, activo')
    .order('nombre');
  if (error) throw error;
  return ((data ?? []) as ProductoAhorroRow[]).map(mapProducto);
}

export interface CrearProductoAhorroInput {
  nombre: string;
  tipo: TipoProductoAhorro;
  tasaPasiva: number;
  periodicidad: PeriodicidadCapitalizacion;
  permiteRetiroLibre?: boolean;
  penalidadRetiroAnticipado?: number | null;
  plazoDias?: number | null;
  montoMeta?: number | null;
}

export async function crearProductoAhorro(input: CrearProductoAhorroInput): Promise<string> {
  const { data, error } = await supabase.rpc('crear_producto_ahorro', {
    p_nombre: input.nombre,
    p_tipo: input.tipo,
    p_tasa_pasiva: input.tasaPasiva,
    p_periodicidad: input.periodicidad,
    p_permite_retiro_libre: input.permiteRetiroLibre ?? true,
    p_penalidad_retiro_anticipado: input.penalidadRetiroAnticipado ?? null,
    p_plazo_dias: input.plazoDias ?? null,
    p_monto_meta: input.montoMeta ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function actualizarProductoAhorro(
  id: string,
  input: { nombre: string; tasaPasiva: number; permiteRetiroLibre: boolean; penalidadRetiroAnticipado?: number | null; activo: boolean },
): Promise<void> {
  const { error } = await supabase.rpc('actualizar_producto_ahorro', {
    p_id: id,
    p_nombre: input.nombre,
    p_tasa_pasiva: input.tasaPasiva,
    p_permite_retiro_libre: input.permiteRetiroLibre,
    p_penalidad_retiro_anticipado: input.penalidadRetiroAnticipado ?? null,
    p_activo: input.activo,
  });
  if (error) throw error;
}

interface CuentaAhorroRow {
  id: string;
  cliente_id: string;
  producto_id: string;
  numero_cuenta: string;
  saldo: number;
  fecha_apertura: string;
  fecha_vencimiento: string | null;
  proxima_capitalizacion: string | null;
  estado: EstadoCuentaAhorro;
}

function mapCuenta(row: CuentaAhorroRow): CuentaAhorro {
  return {
    id: row.id,
    clienteId: row.cliente_id,
    productoId: row.producto_id,
    numeroCuenta: row.numero_cuenta,
    saldo: Number(row.saldo),
    fechaApertura: row.fecha_apertura,
    fechaVencimiento: row.fecha_vencimiento,
    proximaCapitalizacion: row.proxima_capitalizacion,
    estado: row.estado,
  };
}

const CUENTA_SELECT = 'id, cliente_id, producto_id, numero_cuenta, saldo, fecha_apertura, fecha_vencimiento, proxima_capitalizacion, estado';

export async function getCuentasAhorroByCliente(clienteId: string): Promise<CuentaAhorro[]> {
  const { data, error } = await supabase.from('cuentas_ahorro').select(CUENTA_SELECT).eq('cliente_id', clienteId).order('fecha_apertura', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as CuentaAhorroRow[]).map(mapCuenta);
}

export async function getTodasCuentasAhorro(): Promise<CuentaAhorro[]> {
  const { data, error } = await supabase.from('cuentas_ahorro').select(CUENTA_SELECT).order('fecha_apertura', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as CuentaAhorroRow[]).map(mapCuenta);
}

export async function abrirCuentaAhorro(clienteId: string, productoId: string, montoInicial = 0, fechaApertura?: string): Promise<string> {
  const { data, error } = await supabase.rpc('abrir_cuenta_ahorro', {
    p_cliente_id: clienteId,
    p_producto_id: productoId,
    p_monto_inicial: montoInicial,
    p_fecha_apertura: fechaApertura ?? new Date().toISOString().slice(0, 10),
  });
  if (error) throw error;
  return data as string;
}

export async function registrarMovimientoAhorro(
  cuentaId: string,
  tipo: Extract<TipoMovimiento, 'deposito' | 'retiro' | 'ajuste'>,
  monto: number,
  descripcion?: string | null,
  fecha?: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('registrar_movimiento_ahorro', {
    p_cuenta_id: cuentaId,
    p_tipo: tipo,
    p_monto: monto,
    p_descripcion: descripcion ?? null,
    p_fecha: fecha ?? new Date().toISOString().slice(0, 10),
  });
  if (error) throw error;
  return data as string;
}

interface MovimientoRow {
  id: string;
  cliente_id: string;
  origen: OrigenMovimiento;
  tipo: TipoMovimiento;
  cuenta_ahorro_id: string | null;
  monto: number;
  saldo_resultante: number;
  fecha: string;
  descripcion: string | null;
}

function mapMovimiento(row: MovimientoRow): Movimiento {
  return {
    id: row.id,
    clienteId: row.cliente_id,
    origen: row.origen,
    tipo: row.tipo,
    cuentaAhorroId: row.cuenta_ahorro_id,
    monto: Number(row.monto),
    saldoResultante: Number(row.saldo_resultante),
    fecha: row.fecha,
    descripcion: row.descripcion,
  };
}

const MOVIMIENTO_SELECT = 'id, cliente_id, origen, tipo, cuenta_ahorro_id, monto, saldo_resultante, fecha, descripcion';

export async function getMovimientosByCuenta(cuentaId: string): Promise<Movimiento[]> {
  const { data, error } = await supabase.from('movimientos').select(MOVIMIENTO_SELECT).eq('cuenta_ahorro_id', cuentaId).order('fecha', { ascending: false }).order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as MovimientoRow[]).map(mapMovimiento);
}

/** Todos los movimientos de un socio (ahorro + devengo de aportación) — usado en el portal del socio. */
export async function getMisMovimientos(clienteId: string): Promise<Movimiento[]> {
  const { data, error } = await supabase.from('movimientos').select(MOVIMIENTO_SELECT).eq('cliente_id', clienteId).order('fecha', { ascending: false }).order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as MovimientoRow[]).map(mapMovimiento);
}

// ---------------------------------------------------------------------------
// Portal del socio
// ---------------------------------------------------------------------------

interface PerfilSocioRow {
  cliente_id: string;
  nombre: string;
  apellido: string | null;
  documento: string;
  numero_socio: string | null;
  fecha_ingreso: string;
  tenant_nombre: string;
  saldo_aportaciones: number;
}

export async function getMiPerfilSocio(): Promise<PerfilSocio | null> {
  const { data, error } = await supabase.rpc('mi_perfil_socio');
  if (error) throw error;
  const row = (data as PerfilSocioRow[] | null)?.[0];
  if (!row) return null;
  return {
    clienteId: row.cliente_id,
    nombre: row.nombre,
    apellido: row.apellido,
    documento: row.documento,
    numeroSocio: row.numero_socio,
    fechaIngreso: row.fecha_ingreso,
    tenantNombre: row.tenant_nombre,
    saldoAportaciones: Number(row.saldo_aportaciones),
  };
}

/** Excedente estimado del ejercicio en curso para el socio autenticado — siempre marcar como "provisional" en la UI, no es un cierre guardado. */
export async function getMiExcedenteEstimado(fechaDesde: string, fechaHasta: string): Promise<ExcedenteDetalleSocio | null> {
  const { data, error } = await supabase.rpc('mi_excedente_estimado', { p_fecha_desde: fechaDesde, p_fecha_hasta: fechaHasta });
  if (error) throw error;
  const row = (data as { interes_pagado: number; proporcion: number; monto_excedente: number }[] | null)?.[0];
  if (!row) return null;
  return {
    clienteId: '',
    nombre: '',
    interesPagado: Number(row.interes_pagado),
    proporcion: Number(row.proporcion),
    montoExcedente: Number(row.monto_excedente),
  };
}
