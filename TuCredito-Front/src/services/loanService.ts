import { supabase } from '../lib/supabase';
import {
  calcularSimulacion,
  type SimulacionEntrada,
  type SimulacionResultado,
} from '../lib/amortizacion';
import { Prestamo, EstadoPrestamo, SistemaAmortizacion, FrecuenciaCobro } from '../types/cobraya';

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
  cliente?: { id: string; nombre: string; apellido: string | null; documento: string } | null;
}

const PRESTAMO_SELECT = 'id, cliente_id, cobrador_id, monto_otorgado, saldo_restante, cantidad_cuotas, tasa_interes, sistema_amortizacion, frecuencia_cobro, estado, fecha_otorgamiento, fecha_primer_vto, fecha_fin_estimada, moneda, cliente:clientes(id, nombre, apellido, documento)';

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

export interface LoanFilters {
  nombre?: string;
  estado?: EstadoPrestamo;
  clienteId?: string;
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
      if (!nombreCompleto.includes(term) && !documento.includes(term)) return false;
    }
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
