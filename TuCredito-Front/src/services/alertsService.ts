import { supabase } from '../lib/supabase';
import { getBorrowers } from './borrowerService';
import { getLoans } from './loanService';
import { getClasificacionesClientes } from './clasificacionService';

export type TipoAlerta =
  | 'paga_hoy'
  | 'vence_manana'
  | 'en_mora'
  | 'finaliza_pronto'
  | 'elegible_nuevo'
  | 'no_elegible_refinanciamiento';

export interface AlertaItem {
  id: string;
  tipo: TipoAlerta;
  clienteId: string | null;
  clienteNombre: string;
  clienteDocumento: string | null;
  prestamoId: string | null;
  monto?: number;
  cantidad?: number;
}

interface CuotaAlertaRow {
  id: string;
  monto: number;
  prestamo: { id: string; cliente: { id: string; nombre: string; apellido: string | null } | null } | null;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysStr(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function nombreCompleto(cliente: { nombre: string; apellido?: string | null } | null): string {
  return cliente ? `${cliente.nombre} ${cliente.apellido ?? ''}`.trim() : 'N/A';
}

/** Genera alertas "inteligentes" agregando datos ya existentes (cuotas por vencer/vencidas, clasificación de clientes, préstamos activos) — no hay tabla de notificaciones propia, se calculan al vuelo cada vez que se consultan. */
export async function getSmartAlerts(): Promise<AlertaItem[]> {
  const hoy = todayStr();
  const manana = addDaysStr(1);

  const cuotaSelect = 'id, monto, prestamo:prestamos(id, cliente:clientes(id, nombre, apellido))';

  const [
    { data: cuotasHoy, error: e1 },
    { data: cuotasManana, error: e2 },
    { data: cuotasVencidas, error: e3 },
    { data: cuotasPendientesPorPrestamo, error: e4 },
    borrowers,
    loans,
    clasificaciones,
  ] = await Promise.all([
    supabase.from('cuotas').select(cuotaSelect).eq('estado', 'pendiente').eq('fecha_vto', hoy),
    supabase.from('cuotas').select(cuotaSelect).eq('estado', 'pendiente').eq('fecha_vto', manana),
    supabase.from('cuotas').select(cuotaSelect).eq('estado', 'vencida'),
    supabase.from('cuotas').select('prestamo_id').eq('estado', 'pendiente'),
    getBorrowers(),
    getLoans(),
    getClasificacionesClientes(),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  if (e3) throw e3;
  if (e4) throw e4;

  const clientePorId = new Map(borrowers.map((b) => [b.id, b]));
  const alerts: AlertaItem[] = [];

  for (const c of (cuotasHoy ?? []) as unknown as CuotaAlertaRow[]) {
    alerts.push({
      id: `hoy-${c.id}`,
      tipo: 'paga_hoy',
      clienteId: c.prestamo?.cliente?.id ?? null,
      clienteNombre: nombreCompleto(c.prestamo?.cliente ?? null),
      clienteDocumento: clientePorId.get(c.prestamo?.cliente?.id ?? '')?.documento ?? null,
      prestamoId: c.prestamo?.id ?? null,
      monto: Number(c.monto),
    });
  }

  for (const c of (cuotasManana ?? []) as unknown as CuotaAlertaRow[]) {
    alerts.push({
      id: `manana-${c.id}`,
      tipo: 'vence_manana',
      clienteId: c.prestamo?.cliente?.id ?? null,
      clienteNombre: nombreCompleto(c.prestamo?.cliente ?? null),
      clienteDocumento: clientePorId.get(c.prestamo?.cliente?.id ?? '')?.documento ?? null,
      prestamoId: c.prestamo?.id ?? null,
      monto: Number(c.monto),
    });
  }

  const moraPorCliente = new Map<string, { clienteNombre: string; prestamoId: string | null; cantidad: number; monto: number }>();
  for (const c of (cuotasVencidas ?? []) as unknown as CuotaAlertaRow[]) {
    const cliente = c.prestamo?.cliente;
    if (!cliente) continue;
    const entry = moraPorCliente.get(cliente.id) ?? { clienteNombre: nombreCompleto(cliente), prestamoId: c.prestamo?.id ?? null, cantidad: 0, monto: 0 };
    entry.cantidad += 1;
    entry.monto += Number(c.monto);
    moraPorCliente.set(cliente.id, entry);
  }
  for (const [clienteId, info] of moraPorCliente) {
    alerts.push({
      id: `mora-${clienteId}`,
      tipo: 'en_mora',
      clienteId,
      clienteNombre: info.clienteNombre,
      clienteDocumento: clientePorId.get(clienteId)?.documento ?? null,
      prestamoId: info.prestamoId,
      monto: info.monto,
      cantidad: info.cantidad,
    });
  }

  const pendientesPorPrestamo = new Map<string, number>();
  for (const row of cuotasPendientesPorPrestamo ?? []) {
    pendientesPorPrestamo.set(row.prestamo_id, (pendientesPorPrestamo.get(row.prestamo_id) ?? 0) + 1);
  }
  for (const loan of loans) {
    if (loan.estado !== 'activo') continue;
    const pendientes = pendientesPorPrestamo.get(loan.id) ?? 0;
    if (pendientes > 0 && pendientes <= 2) {
      alerts.push({
        id: `finaliza-${loan.id}`,
        tipo: 'finaliza_pronto',
        clienteId: loan.clienteId,
        clienteNombre: loan.cliente ? nombreCompleto(loan.cliente) : 'N/A',
        clienteDocumento: loan.cliente?.documento ?? null,
        prestamoId: loan.id,
        cantidad: pendientes,
      });
    }
  }

  const clientesConPrestamoActivo = new Set(loans.filter((l) => l.estado === 'activo').map((l) => l.clienteId));
  for (const c of clasificaciones) {
    const cliente = clientePorId.get(c.clienteId);
    if (!cliente || !cliente.activo) continue;

    if ((c.clasificacion === 'excelente' || c.clasificacion === 'bueno') && !clientesConPrestamoActivo.has(c.clienteId)) {
      alerts.push({
        id: `elegible-${c.clienteId}`,
        tipo: 'elegible_nuevo',
        clienteId: c.clienteId,
        clienteNombre: nombreCompleto(cliente),
        clienteDocumento: cliente.documento,
        prestamoId: null,
      });
    }

    if (c.noRecomendadoRefinanciamiento) {
      alerts.push({
        id: `no-refi-${c.clienteId}`,
        tipo: 'no_elegible_refinanciamiento',
        clienteId: c.clienteId,
        clienteNombre: nombreCompleto(cliente),
        clienteDocumento: cliente.documento,
        prestamoId: null,
      });
    }
  }

  return alerts;
}
