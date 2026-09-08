import { supabase } from '../lib/supabase';
import { RolUsuario, Usuario } from '../types/cobraya';

export interface SignUpOwnerInput {
  nombreNegocio: string;
  nombreUsuario: string;
  correo: string;
  password: string;
  tipoTenant: 'prestamista' | 'cooperativa';
}

/**
 * Autoregistro de un prestamista nuevo (tenant nuevo). El trigger
 * handle_new_user() en Postgres crea el tenant + la fila en `usuarios` (rol owner)
 * a partir de raw_user_meta_data — ver supabase/migrations/20260721010300_auth_onboarding.sql
 * y supabase/migrations/20260731010000_cooperativas.sql (tipo_tenant).
 */
export async function signUpOwner(input: SignUpOwnerInput) {
  const { data, error } = await supabase.auth.signUp({
    email: input.correo,
    password: input.password,
    options: {
      data: {
        nombre_negocio: input.nombreNegocio,
        nombre_usuario: input.nombreUsuario,
        tipo_tenant: input.tipoTenant,
      },
    },
  });

  if (error) throw error;
  return data;
}

export async function signIn(correo: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email: correo, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export interface InvitarUsuarioInput {
  rol: 'socio' | 'auditor' | 'collector';
  correo: string;
  password: string;
  nombreUsuario: string;
  clienteId?: string;
}

/** El dueño invita a un socio (login propio, vinculado a un cliente), a un auditor (solo lectura) o a un cobrador de campo a SU tenant. */
export async function invitarUsuario(input: InvitarUsuarioInput): Promise<{ userId: string }> {
  const { data, error } = await supabase.functions.invoke('invitar-usuario', {
    body: { rol: input.rol, correo: input.correo, password: input.password, nombreUsuario: input.nombreUsuario, clienteId: input.clienteId },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

interface UsuarioRow {
  id: string;
  tenant_id: string;
  rol: RolUsuario;
  nombre: string;
  correo: string;
  activo: boolean;
}

function mapUsuario(row: UsuarioRow): Usuario {
  return { id: row.id, tenantId: row.tenant_id, rol: row.rol, nombre: row.nombre, correo: row.correo, activo: row.activo };
}

/** Usuarios del propio tenant (owner incluido), acotado por RLS. Opcionalmente filtrado por rol — ej. listar solo cobradores para el selector de asignación. */
export async function listUsuarios(rol?: RolUsuario): Promise<Usuario[]> {
  let query = supabase.from('usuarios').select('id, tenant_id, rol, nombre, correo, activo').order('nombre');
  if (rol) query = query.eq('rol', rol);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as UsuarioRow[]).map(mapUsuario);
}

/** Activa/desactiva a un usuario del tenant (solo el owner puede, via policy usuarios_owner_manage). Desactivarlo le retira el acceso de inmediato (current_tenant_id/current_rol respetan usuarios.activo). */
export async function setUsuarioActivo(userId: string, activo: boolean): Promise<void> {
  const { error } = await supabase.from('usuarios').update({ activo }).eq('id', userId);
  if (error) throw error;
}

export interface UpdateProfileInput {
  nombre?: string;
  nuevaContrasenia?: string;
}

export async function updateProfile(userId: string, data: UpdateProfileInput) {
  if (data.nombre) {
    const { error } = await supabase.from('usuarios').update({ nombre: data.nombre }).eq('id', userId);
    if (error) throw error;
  }

  if (data.nuevaContrasenia) {
    const { error } = await supabase.auth.updateUser({ password: data.nuevaContrasenia });
    if (error) throw error;
  }
}
