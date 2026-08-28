// Tipos de dominio de CobraYA, alineados 1:1 con supabase/migrations/*.sql.
// Conviven con ../types/index.ts (los DTOs viejos, todavía usados por páginas que no
// se migraron en esta pasada: Settings, Calculator standalone, Documentos, Evaluación
// BCRA, Dólar) para no romper su compilación.

export type RolUsuario = 'owner' | 'collector' | 'socio' | 'auditor';
export type EstadoPrestamo = 'activo' | 'finalizado' | 'eliminado' | 'archivado' | 'refinanciado';
export type EstadoCuota = 'pendiente' | 'saldada' | 'vencida' | 'reprogramada';
export type SistemaAmortizacion = 'frances' | 'aleman' | 'americano' | 'directo';
export type FrecuenciaCobro = 'diario' | 'semanal' | 'quincenal' | 'mensual';
export type FrecuenciaGastoAdministrativo = 'semanal' | 'mensual' | 'por_cuota';
export type EstadoSuscripcion = 'prueba' | 'activa' | 'suspendida' | 'cancelada';
export type TipoCuentaPago = 'banco' | 'tigo_money' | 'paypal' | 'otro';
export type TipoTenant = 'prestamista' | 'cooperativa';
export type TipoAportacion = 'obligatoria' | 'extraordinaria' | 'retiro';

export function getTipoAportacionLabel(tipo: TipoAportacion): string {
  switch (tipo) {
    case 'obligatoria': return 'Obligatoria';
    case 'extraordinaria': return 'Extraordinaria';
    case 'retiro': return 'Retiro';
    default: return tipo;
  }
}

export interface Aportacion {
  id: string;
  clienteId: string;
  tipo: TipoAportacion;
  monto: number;
  fecha: string;
  observaciones?: string | null;
  createdAt: string;
}

export interface ExcedenteDetalleSocio {
  clienteId: string;
  nombre: string;
  apellido?: string | null;
  interesPagado: number;
  proporcion: number;
  montoExcedente: number;
}

export interface FondoExcedenteSnapshot {
  nombre: string;
  porcentaje: number;
  monto: number;
}

export interface ExcedentePeriodo {
  id: string;
  fechaDesde: string;
  fechaHasta: string;
  ingresosTotales: number;
  excedenteNeto: number;
  createdAt: string;
}

export interface FondoExcedenteConfig {
  id: string;
  nombre: string;
  porcentaje: number;
  orden: number;
  esReservaLegal: boolean;
  activo: boolean;
}

export type TipoProductoAhorro = 'a_la_vista' | 'programado' | 'plazo_fijo';
export type PeriodicidadCapitalizacion = 'diaria' | 'mensual' | 'trimestral' | 'anual';
export type EstadoCuentaAhorro = 'activa' | 'cerrada' | 'vencida';
export type TipoMovimiento = 'deposito' | 'retiro' | 'devengo' | 'pago' | 'ajuste';
export type OrigenMovimiento = 'ahorro' | 'aportacion';

export function getTipoProductoAhorroLabel(tipo: TipoProductoAhorro): string {
  switch (tipo) {
    case 'a_la_vista': return 'A la Vista';
    case 'programado': return 'Programado';
    case 'plazo_fijo': return 'Plazo Fijo';
    default: return tipo;
  }
}

export function getPeriodicidadLabel(p: PeriodicidadCapitalizacion): string {
  switch (p) {
    case 'diaria': return 'Diaria';
    case 'mensual': return 'Mensual';
    case 'trimestral': return 'Trimestral';
    case 'anual': return 'Anual';
    default: return p;
  }
}

export function getTipoMovimientoLabel(tipo: TipoMovimiento): string {
  switch (tipo) {
    case 'deposito': return 'Depósito';
    case 'retiro': return 'Retiro';
    case 'devengo': return 'Interés Devengado';
    case 'pago': return 'Pago';
    case 'ajuste': return 'Ajuste';
    default: return tipo;
  }
}

export interface ProductoAhorro {
  id: string;
  nombre: string;
  tipo: TipoProductoAhorro;
  tasaPasiva: number;
  periodicidadCapitalizacion: PeriodicidadCapitalizacion;
  permiteRetiroLibre: boolean;
  penalidadRetiroAnticipado?: number | null;
  plazoDias?: number | null;
  montoMeta?: number | null;
  activo: boolean;
}

export interface CuentaAhorro {
  id: string;
  clienteId: string;
  productoId: string;
  numeroCuenta: string;
  saldo: number;
  fechaApertura: string;
  fechaVencimiento?: string | null;
  proximaCapitalizacion?: string | null;
  estado: EstadoCuentaAhorro;
}

export interface Movimiento {
  id: string;
  clienteId: string;
  origen: OrigenMovimiento;
  tipo: TipoMovimiento;
  cuentaAhorroId?: string | null;
  monto: number;
  saldoResultante: number;
  fecha: string;
  descripcion?: string | null;
}

export interface PerfilSocio {
  clienteId: string;
  nombre: string;
  apellido?: string | null;
  documento: string;
  numeroSocio?: string | null;
  fechaIngreso: string;
  tenantNombre: string;
  saldoAportaciones: number;
}

export interface PlatformPaymentAccount {
  id: string;
  tipo: TipoCuentaPago;
  nombreBeneficiario: string;
  banco?: string | null;
  numeroCuenta?: string | null;
  tipoCuentaBancaria?: string | null;
  telefono?: string | null;
  instrucciones?: string | null;
  activo?: boolean;
  orden?: number;
}

export function getTipoCuentaPagoLabel(tipo: TipoCuentaPago): string {
  switch (tipo) {
    case 'banco': return 'Transferencia Bancaria';
    case 'tigo_money': return 'Tigo Money';
    case 'paypal': return 'PayPal';
    case 'otro': return 'Otro';
    default: return tipo;
  }
}

export interface Usuario {
  id: string;
  tenantId: string;
  rol: RolUsuario;
  nombre: string;
  correo: string;
  activo: boolean;
}

export interface Tenant {
  id: string;
  nombre: string;
  rtn?: string | null;
  moneda: string;
  estadoSuscripcion: EstadoSuscripcion;
  logoUrl?: string | null;
  tipoTenant?: TipoTenant;
}

export interface Garante {
  id: string;
  documento?: string | null;
  nombre: string;
  apellido?: string | null;
  telefono?: string | null;
  domicilio?: string | null;
}

export interface Cliente {
  id: string;
  documento: string;
  nombre: string;
  apellido?: string | null;
  telefono?: string | null;
  domicilio?: string | null;
  correo?: string | null;
  activo: boolean;
  garanteId?: string | null;
  garante?: Garante | null;
  usuarioId?: string | null;
  numeroSocio?: string | null;
  fechaIngreso?: string;
}

export interface Prestamo {
  id: string;
  clienteId: string;
  cobradorId?: string | null;
  montoOtorgado: number;
  saldoRestante: number;
  cantidadCuotas: number;
  tasaInteres: number;
  sistemaAmortizacion: SistemaAmortizacion;
  frecuenciaCobro: FrecuenciaCobro;
  estado: EstadoPrestamo;
  fechaOtorgamiento: string;
  fechaPrimerVto: string;
  fechaFinEstimada?: string | null;
  moneda: string;
  gastoAdministrativoMonto?: number | null;
  gastoAdministrativoFrecuencia?: FrecuenciaGastoAdministrativo | null;
  multaPorAtrasoMonto?: number | null;
  refinanciadoDeId?: string | null;
  motivoRefinanciamiento?: string | null;
  /** Tasa periódica implícita (%) derivada del flujo real de pagos (TIR) — null en préstamos previos a esta función que quedaron sin cuotas para recalcularla. */
  tasaPeriodicaImplicita?: number | null;
  /** Tasa nominal anual (%) = tasa periódica declarada × períodos por año — no confundir con la TCEA. */
  tasaNominalAnual?: number | null;
  /** TCEA — costo real anualizado del crédito (%), derivado del flujo de pagos. Ver la función SQL calcular_tcea(). */
  tasaEfectivaAnual?: number | null;
  /** Suma de cuotas menos capital — cuánto termina pagando el cliente por encima de lo prestado. */
  costoTotalCredito?: number | null;
  cliente?: Pick<Cliente, 'id' | 'nombre' | 'apellido' | 'documento' | 'telefono'> | null;
}

export interface Cuota {
  id: string;
  prestamoId: string;
  nroCuota: number;
  monto: number;
  interes?: number | null;
  capital?: number | null;
  saldoPendiente?: number | null;
  fechaVto: string;
  estado: EstadoCuota;
}

/** Cargo del cronograma de gastos administrativos — cobro aparte de capital+interés. */
export interface GastoAdministrativo {
  id: string;
  prestamoId: string;
  numero: number;
  monto: number;
  saldoPendiente: number;
  fechaVto: string;
  estado: EstadoCuota;
}

export const FRECUENCIAS_GASTO_ADMINISTRATIVO: { value: FrecuenciaGastoAdministrativo; label: string }[] = [
  { value: 'por_cuota', label: 'Incluido en cada cuota (ej. interés + servicio en el mismo cobro)' },
  { value: 'semanal', label: 'Cronograma aparte — Semanal' },
  { value: 'mensual', label: 'Cronograma aparte — Mensual' },
];

/** Multa por atraso — registro aparte con motivo y fecha, ligado a una cuota vencida. */
export interface Multa {
  id: string;
  prestamoId: string;
  cuotaId: string;
  monto: number;
  saldoPendiente: number;
  motivo: string;
  fechaIncumplimiento: string;
  estado: EstadoCuota;
  aplicadaAutomaticamente: boolean;
}

export type ClasificacionCliente = 'excelente' | 'bueno' | 'regular' | 'malo';

/** Score de comportamiento de pago de un cliente, calculado en base a su historial real de cuotas. */
export interface ClienteClasificacion {
  clienteId: string;
  totalCuotasVencidasHist: number;
  cuotasPagadasATiempo: number;
  cuotasPagadasTarde: number;
  cuotasVencidasActuales: number;
  multasActivas: number;
  porcentajeCumplimiento: number;
  clasificacion: ClasificacionCliente;
  noRecomendadoRefinanciamiento: boolean;
  esManual: boolean;
  clasificacionManualMotivo?: string | null;
}

export function getClasificacionLabel(c: ClasificacionCliente): string {
  switch (c) {
    case 'excelente': return 'Excelente';
    case 'bueno': return 'Bueno';
    case 'regular': return 'Regular';
    case 'malo': return 'Malo';
    default: return c;
  }
}

export function getClasificacionColorClass(c: ClasificacionCliente): string {
  switch (c) {
    case 'excelente': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
    case 'bueno': return 'bg-primary-500/10 text-primary-500 border-primary-500/20';
    case 'regular': return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
    case 'malo': return 'bg-red-500/10 text-red-500 border-red-500/20';
    default: return 'bg-surfaceHighlight text-muted border-border';
  }
}

export interface Pago {
  id: string;
  cuotaId: string;
  cobradorId?: string | null;
  fechaPago: string;
  medioPagoId: number;
  monto: number;
  descuento: number;
  recargo: number;
  saldoSnapshot?: number | null;
  observaciones?: string | null;
  estado: string;
}

export interface MedioPago {
  id: number;
  nombre: string;
}

// "directo" va primero: es el sistema que realmente usan los prestamistas informales
// en Honduras (interés simple sobre saldo, tasa fija por período — ver investigación
// de mercado HN). Francés/Alemán/Americano son terminología de banca formal
// (hipotecas tipo BAC/Ficohsa/LAFISE); quedan disponibles para el prestamista que
// quiera ofrecer un crédito más formal, pero no son la opción esperada por defecto.
export const SISTEMAS_AMORTIZACION: { value: SistemaAmortizacion; label: string }[] = [
  { value: 'directo', label: 'Interés Simple sobre Saldo (el más común en HN)' },
  { value: 'frances', label: 'Francés — banca formal (Cuota Fija)' },
  { value: 'aleman', label: 'Alemán — banca formal (Amortización Fija)' },
  { value: 'americano', label: 'Bullet / Americano (Interés primero, capital al final)' },
];

export const FRECUENCIAS_COBRO: { value: FrecuenciaCobro; label: string }[] = [
  { value: 'diario', label: 'Diario' },
  { value: 'semanal', label: 'Semanal' },
  { value: 'quincenal', label: 'Quincenal' },
  { value: 'mensual', label: 'Mensual' },
];

export function getEstadoPrestamoLabel(estado: EstadoPrestamo): string {
  switch (estado) {
    case 'activo': return 'Activo';
    case 'finalizado': return 'Finalizado';
    case 'eliminado': return 'Eliminado';
    case 'archivado': return 'Archivado';
    case 'refinanciado': return 'Refinanciado';
    default: return estado;
  }
}

export function getEstadoCuotaLabel(estado: EstadoCuota): string {
  switch (estado) {
    case 'pendiente': return 'Pendiente';
    case 'saldada': return 'Saldada';
    case 'vencida': return 'Vencida';
    case 'reprogramada': return 'Reprogramada';
    default: return estado;
  }
}
