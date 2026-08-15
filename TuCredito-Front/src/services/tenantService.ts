import { supabase } from '../lib/supabase';
import { Tenant } from '../types/cobraya';

interface TenantRow {
  id: string;
  nombre: string;
  rtn: string | null;
  moneda: string;
  estado_suscripcion: Tenant['estadoSuscripcion'];
  logo_url: string | null;
  tipo_tenant: Tenant['tipoTenant'];
}

const TENANT_SELECT = 'id, nombre, rtn, moneda, estado_suscripcion, logo_url, tipo_tenant';

function mapTenant(row: TenantRow): Tenant {
  return {
    id: row.id,
    nombre: row.nombre,
    rtn: row.rtn,
    moneda: row.moneda,
    estadoSuscripcion: row.estado_suscripcion,
    logoUrl: row.logo_url,
    tipoTenant: row.tipo_tenant,
  };
}

export async function getMyTenant(): Promise<Tenant | null> {
  const { data, error } = await supabase.from('tenants').select(TENANT_SELECT).single();
  if (error) throw error;
  return data ? mapTenant(data as unknown as TenantRow) : null;
}

export interface UpdateTenantInput {
  nombre?: string;
  rtn?: string | null;
}

export async function updateTenant(tenantId: string, input: UpdateTenantInput): Promise<void> {
  const { error } = await supabase.from('tenants').update(input).eq('id', tenantId);
  if (error) throw error;
}

function extensionFrom(file: File): string {
  const parts = file.name.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : 'png';
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // reader.result es un data URL "data:<mime>;base64,<contenido>" — solo interesa lo de después de la coma.
      const result = reader.result as string;
      resolve(result.split(',')[1] ?? '');
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Sube (o reemplaza) el logo del negocio vía la Edge Function `subir-logo` (usa
 * service_role para Storage). No se hace con RLS directo sobre storage.objects porque
 * en este proyecto esa RLS no resuelve auth.uid() correctamente (verificado
 * empíricamente); la Edge Function verifica igual que el caller sea el owner del
 * tenant, solo que del lado del servidor.
 */
export async function uploadTenantLogo(file: File): Promise<string> {
  const fileBase64 = await fileToBase64(file);
  const { data, error } = await supabase.functions.invoke('subir-logo', {
    body: { action: 'upload', fileBase64, contentType: file.type || 'image/png', extension: extensionFrom(file) },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data.logoUrl as string;
}

export async function removeTenantLogo(): Promise<void> {
  const { data, error } = await supabase.functions.invoke('subir-logo', { body: { action: 'remove' } });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
}
