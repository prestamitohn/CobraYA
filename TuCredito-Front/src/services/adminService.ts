import { supabase } from '../lib/supabase';
import { EstadoSuscripcion, TipoTenant } from '../types/cobraya';

export interface AdminTenantRow {
  id: string;
  nombre: string;
  rtn: string | null;
  moneda: string;
  estadoSuscripcion: EstadoSuscripcion;
  fechaInicio: string;
  createdAt: string;
  propietarioNombre: string | null;
  propietarioCorreo: string | null;
  tipoTenant: TipoTenant;
  cantidadUsuarios: number;
  cantidadClientes: number;
  cantidadPrestamos: number;
  montoOtorgadoTotal: number;
}

export interface PlatformMetrics {
  totalTenants: number;
  tenantsActivos: number;
  tenantsPrueba: number;
  tenantsSuspendidos: number;
  tenantsCancelados: number;
  totalClientes: number;
  totalPrestamos: number;
  totalPrestadoPlataforma: number;
  totalCobradoPlataforma: number;
}

export async function listTenants(): Promise<AdminTenantRow[]> {
  const { data, error } = await supabase.rpc('admin_list_tenants');
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    nombre: row.nombre,
    rtn: row.rtn,
    moneda: row.moneda,
    estadoSuscripcion: row.estado_suscripcion,
    fechaInicio: row.fecha_inicio,
    createdAt: row.created_at,
    propietarioNombre: row.propietario_nombre,
    propietarioCorreo: row.propietario_correo,
    tipoTenant: row.tipo_tenant,
    cantidadUsuarios: Number(row.cantidad_usuarios),
    cantidadClientes: Number(row.cantidad_clientes),
    cantidadPrestamos: Number(row.cantidad_prestamos),
    montoOtorgadoTotal: Number(row.monto_otorgado_total),
  }));
}

export async function getPlatformMetrics(): Promise<PlatformMetrics> {
  const { data, error } = await supabase.rpc('admin_platform_metrics');
  if (error) throw error;
  const row = data?.[0] ?? {};
  return {
    totalTenants: Number(row.total_tenants ?? 0),
    tenantsActivos: Number(row.tenants_activos ?? 0),
    tenantsPrueba: Number(row.tenants_prueba ?? 0),
    tenantsSuspendidos: Number(row.tenants_suspendidos ?? 0),
    tenantsCancelados: Number(row.tenants_cancelados ?? 0),
    totalClientes: Number(row.total_clientes ?? 0),
    totalPrestamos: Number(row.total_prestamos ?? 0),
    totalPrestadoPlataforma: Number(row.total_prestado_plataforma ?? 0),
    totalCobradoPlataforma: Number(row.total_cobrado_plataforma ?? 0),
  };
}

export async function setTenantEstado(tenantId: string, estado: EstadoSuscripcion): Promise<void> {
  const { error } = await supabase.rpc('admin_set_tenant_estado', {
    p_tenant_id: tenantId,
    p_estado: estado,
  });
  if (error) throw error;
}

export interface CreateTenantInput {
  nombreNegocio: string;
  nombreUsuario: string;
  correo: string;
  password: string;
  tipoTenant?: TipoTenant;
}

export async function createTenant(input: CreateTenantInput): Promise<{ userId: string }> {
  const { data, error } = await supabase.functions.invoke('admin-crear-tenant', { body: input });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}
