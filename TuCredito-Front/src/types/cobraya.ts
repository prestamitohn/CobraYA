// Tipos de dominio de CobraYA, alineados 1:1 con supabase/migrations/*.sql.
// Conviven con ../types/index.ts (los DTOs viejos, todavía usados por páginas que no
// se migraron en esta pasada: Settings, Calculator standalone, Documentos, Evaluación
// BCRA, Dólar) para no romper su compilación.

export type RolUsuario = 'owner' | 'collector';
export type EstadoPrestamo = 'activo' | 'finalizado' | 'eliminado' | 'archivado';
export type EstadoCuota = 'pendiente' | 'saldada' | 'vencida' | 'reprogramada';
export type SistemaAmortizacion = 'frances' | 'aleman' | 'americano' | 'directo';
export type FrecuenciaCobro = 'diario' | 'semanal' | 'quincenal' | 'mensual';
export type FrecuenciaGastoAdministrativo = 'semanal' | 'mensual' | 'por_cuota';
export type EstadoSuscripcion = 'prueba' | 'activa' | 'suspendida' | 'cancelada';

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
  cliente?: Pick<Cliente, 'id' | 'nombre' | 'apellido' | 'documento'> | null;
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
