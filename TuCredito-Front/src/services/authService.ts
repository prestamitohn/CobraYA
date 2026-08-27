import { supabase } from '../lib/supabase';

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
  rol: 'socio' | 'auditor';
  correo: string;
  password: string;
  nombreUsuario: string;
  clienteId?: string;
}

/** El dueño invita a un socio (login propio, vinculado a un cliente) o a un auditor (solo lectura) a SU tenant. */
export async function invitarUsuario(input: InvitarUsuarioInput): Promise<{ userId: string }> {
  const { data, error } = await supabase.functions.invoke('invitar-usuario', {
    body: { rol: input.rol, correo: input.correo, password: input.password, nombreUsuario: input.nombreUsuario, clienteId: input.clienteId },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
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
