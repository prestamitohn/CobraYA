import { supabase } from '../lib/supabase';
import {
  calcularSimulacion,
  type SimulacionEntrada,
  type SimulacionResultado,
} from '../lib/amortizacion';
import { Prestamo, EstadoPrestamo, SistemaAmortizacion, FrecuenciaCobro, FrecuenciaGastoAdministrativo } from '../types/cobraya';

interface PrestamoRow {
  id: string;
  cliente_id: string;
  cobrador_id: string | null;
  monto_otorgado: number;
  saldo_restante: number;
  cantidad_cuotas: number;
  tasa_interes: number;
  sistema_amortizacion: SistemaAmortizacion;
  frecuencia_cobro: FrecuenciaCobro;
  estado: EstadoPrestamo;
  fecha_otorgamiento: string;
  fecha_primer_vto: string;
  fecha_fin_estimada: string | null;
  moneda: string;
  gasto_administrativo_monto: number | null;
  gasto_administrativo_frecuencia: FrecuenciaGastoAdministrativo | null;
  multa_por_atraso_monto: number | null;
  refinanciado_de_id: string | null;
  motivo_refinanciamiento: string | null;
  cliente?: { id: string; nombre: string; apellido: string | null; documento: string; telefono: string | null } | null;
}

const PRESTAMO_SELECT = 'id, cliente_id, cobrador_id, monto_otorgado, saldo_restante, cantidad_cuotas, tasa_interes, sistema_amortizacion, frecuencia_cobro, estado, fecha_otorgamiento, fecha_primer_vto, fecha_fin_estimada, moneda, gasto_administrativo_monto, gasto_administrativo_frecuencia, multa_por_atraso_monto, refinanciado_de_id, motivo_refinanciamiento, cliente:clientes(id, nombre, apellido, documento, telefono)';

function mapPrestamo(row: PrestamoRow): Prestamo {
  return {
    id: row.id,
    clienteId: row.cliente_id,
    cobradorId: row.cobrador_id,
    montoOtorgado: row.monto_otorgado,
    saldoRestante: row.saldo_restante,
    cantidadCuotas: row.cantidad_cuotas,
    tasaInteres: row.tasa_interes,
    sistemaAmortizacion: row.sistema_amortizacion,
    frecuenciaCobro: row.frecuencia_cobro,
    estado: row.estado,
    fechaOtorgamiento: row.fecha_otorgamiento,
    fechaPrimerVto: row.fecha_primer_vto,
    fechaFinEstimada: row.fecha_fin_estimada,
    moneda: row.moneda,
    gastoAdministrativoMonto: row.gasto_administrativo_monto,
    gastoAdministrativoFrecuencia: row.gasto_administrativo_frecuencia,
    multaPorAtrasoMonto: row.multa_por_atraso_monto,
    refinanciadoDeId: row.refinanciado_de_id,
    motivoRefinanciamiento: row.motivo_refinanciamiento,
    cliente: row.cliente,
  };
}

/** Simulación instantánea (client-side, sin red) — mismo motor que usa crear-prestamo del lado del servidor. */
export function simulateLoan(entrada: SimulacionEntrada): SimulacionResultado {
  return calcularSimulacion(entrada);
}

export interface CreateLoanInput {
  clienteId: string;
  montoPrestamo: number;
  cantidadCuotas: number;
  tasaInteres: number;
  sistemaAmortizacion: SistemaAmortizacion;
  frecuenciaCobro: FrecuenciaCobro;
  fechaOtorgamiento: string; // yyyy-mm-dd
  moneda?: string;
  cobradorId?: string | null;
  gastoAdministrativoMonto?: number | null;
  gastoAdministrativoFrecuencia?: FrecuenciaGastoAdministrativo | null;
  multaPorAtrasoMonto?: number | null;
}

export async function createLoan(input: CreateLoanInput): Promise<{ prestamoId: string; simulacion: SimulacionResultado }> {
  const { data, error } = await supabase.functions.invoke('crear-prestamo', { body: input });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function getLoans(): Promise<Prestamo[]> {
  const { data, error } = await supabase
    .from('prestamos')
    .select(PRESTAMO_SELECT)
    .order('fecha_otorgamiento', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => mapPrestamo(row as unknown as PrestamoRow));
}

export async function getLoanById(id: string): Promise<Prestamo> {
  const { data, error } = await supabase.from('prestamos').select(PRESTAMO_SELECT).eq('id', id).single();
  if (error) throw error;
  return mapPrestamo(data as unknown as PrestamoRow);
}

/** Encuentra el préstamo nuevo que refinanció a este (si lo hubo) — búsqueda inversa por refinanciado_de_id. */
export async function getLoanThatRefinanced(prestamoId: string): Promise<Prestamo | null> {
  const { data, error } = await supabase.from('prestamos').select(PRESTAMO_SELECT).eq('refinanciado_de_id', prestamoId).maybeSingle();
  if (error) throw error;
  return data ? mapPrestamo(data as unknown as PrestamoRow) : null;
}

export interface RefinanceLoanInput {
  prestamoOriginalId: string;
  montoAdicional?: number;
  cantidadCuotas: number;
  tasaInteres: number;
  sistemaAmortizacion: SistemaAmortizacion;
  frecuenciaCobro: FrecuenciaCobro;
  fechaOtorgamiento: string; // yyyy-mm-dd
  moneda?: string;
  cobradorId?: string | null;
  gastoAdministrativoMonto?: number | null;
  gastoAdministrativoFrecuencia?: FrecuenciaGastoAdministrativo | null;
  multaPorAtrasoMonto?: number | null;
  motivo?: string | null;
}

export async function refinanceLoan(input: RefinanceLoanInput): Promise<{ prestamoId: string; montoPrestamo: number; simulacion: SimulacionResultado }> {
  const { data, error } = await supabase.functions.invoke('refinanciar-prestamo', { body: input });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export interface LoanFilters {
  /** Busca en nombre, apellido, identidad y teléfono del cliente. */
  nombre?: string;
  estado?: EstadoPrestamo;
  clienteId?: string;
  fechaDesde?: string; // yyyy-mm-dd, sobre fecha_otorgamiento
  fechaHasta?: string; // yyyy-mm-dd, sobre fecha_otorgamiento
  montoMin?: number;
  montoMax?: number;
}

export async function getLoansByFilter(filters: LoanFilters): Promise<Prestamo[]> {
  const loans = await getLoans();
  return loans.filter((loan) => {
    if (filters.estado && loan.estado !== filters.estado) return false;
    if (filters.clienteId && loan.clienteId !== filters.clienteId) return false;
    if (filters.nombre) {
      const term = filters.nombre.toLowerCase();
      const nombreCompleto = `${loan.cliente?.nombre ?? ''} ${loan.cliente?.apellido ?? ''}`.toLowerCase();
      const documento = (loan.cliente?.documento ?? '').toLowerCase();
      const telefono = (loan.cliente?.telefono ?? '').toLowerCase();
      if (!nombreCompleto.includes(term) && !documento.includes(term) && !telefono.includes(term)) return false;
    }
    if (filters.fechaDesde && loan.fechaOtorgamiento < filters.fechaDesde) return false;
    if (filters.fechaHasta && loan.fechaOtorgamiento > filters.fechaHasta) return false;
    if (filters.montoMin !== undefined && loan.montoOtorgado < filters.montoMin) return false;
    if (filters.montoMax !== undefined && loan.montoOtorgado > filters.montoMax) return false;
    return true;
  });
}

export async function archiveLoan(id: string): Promise<void> {
  const { error } = await supabase.from('prestamos').update({ estado: 'finalizado' }).eq('id', id);
  if (error) throw error;
}

export async function deleteLoan(id: string): Promise<void> {
  const { error } = await supabase.from('prestamos').update({ estado: 'eliminado' }).eq('id', id);
  if (error) throw error;
}
