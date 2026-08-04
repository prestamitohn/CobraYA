import { supabase } from '../lib/supabase';
import { PlatformPaymentAccount, TipoCuentaPago } from '../types/cobraya';

interface PaymentAccountRow {
  id: string;
  tipo: TipoCuentaPago;
  nombre_beneficiario: string;
  banco: string | null;
  numero_cuenta: string | null;
  tipo_cuenta_bancaria: string | null;
  telefono: string | null;
  instrucciones: string | null;
  activo?: boolean;
  orden?: number;
}

function mapPaymentAccount(row: PaymentAccountRow): PlatformPaymentAccount {
  return {
    id: row.id,
    tipo: row.tipo,
    nombreBeneficiario: row.nombre_beneficiario,
    banco: row.banco,
    numeroCuenta: row.numero_cuenta,
    tipoCuentaBancaria: row.tipo_cuenta_bancaria,
    telefono: row.telefono,
    instrucciones: row.instrucciones,
    activo: row.activo,
    orden: row.orden,
  };
}

/** Cuentas de pago activas — visibles para cualquier usuario autenticado (pantalla de prueba vencida / cuenta suspendida). */
export async function getActivePaymentAccounts(): Promise<PlatformPaymentAccount[]> {
  const { data, error } = await supabase.rpc('obtener_cuentas_pago_activas');
  if (error) throw error;
  return ((data ?? []) as PaymentAccountRow[]).map(mapPaymentAccount);
}

/** Listado completo (activas + inactivas) — solo superadmin. */
export async function adminListPaymentAccounts(): Promise<PlatformPaymentAccount[]> {
  const { data, error } = await supabase.rpc('admin_listar_cuentas_pago');
  if (error) throw error;
  return ((data ?? []) as PaymentAccountRow[]).map(mapPaymentAccount);
}

export interface PaymentAccountInput {
  tipo: TipoCuentaPago;
  nombreBeneficiario: string;
  banco?: string | null;
  numeroCuenta?: string | null;
  tipoCuentaBancaria?: string | null;
  telefono?: string | null;
  instrucciones?: string | null;
  orden?: number;
}

export async function adminCreatePaymentAccount(input: PaymentAccountInput): Promise<string> {
  const { data, error } = await supabase.rpc('admin_crear_cuenta_pago', {
    p_tipo: input.tipo,
    p_nombre_beneficiario: input.nombreBeneficiario,
    p_banco: input.banco ?? null,
    p_numero_cuenta: input.numeroCuenta ?? null,
    p_tipo_cuenta_bancaria: input.tipoCuentaBancaria ?? null,
    p_telefono: input.telefono ?? null,
    p_instrucciones: input.instrucciones ?? null,
    p_orden: input.orden ?? 0,
  });
  if (error) throw error;
  return data as string;
}

export async function adminUpdatePaymentAccount(id: string, input: PaymentAccountInput & { activo: boolean }): Promise<void> {
  const { error } = await supabase.rpc('admin_actualizar_cuenta_pago', {
    p_id: id,
    p_tipo: input.tipo,
    p_nombre_beneficiario: input.nombreBeneficiario,
    p_banco: input.banco ?? null,
    p_numero_cuenta: input.numeroCuenta ?? null,
    p_tipo_cuenta_bancaria: input.tipoCuentaBancaria ?? null,
    p_telefono: input.telefono ?? null,
    p_instrucciones: input.instrucciones ?? null,
    p_activo: input.activo,
    p_orden: input.orden ?? 0,
  });
  if (error) throw error;
}

export async function adminDeletePaymentAccount(id: string): Promise<void> {
  const { error } = await supabase.rpc('admin_eliminar_cuenta_pago', { p_id: id });
  if (error) throw error;
}
