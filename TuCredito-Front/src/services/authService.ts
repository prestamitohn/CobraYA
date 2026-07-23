import { supabase } from '../lib/supabase';

export interface SignUpOwnerInput {
  nombreNegocio: string;
  nombreUsuario: string;
  correo: string;
  password: string;
}

/**
 * Autoregistro de un prestamista nuevo (tenant nuevo). El trigger
 * handle_new_user() en Postgres crea el tenant + la fila en `usuarios` (rol owner)
 * a partir de raw_user_meta_data — ver supabase/migrations/20260721010300_auth_onboarding.sql.
 */
export async function signUpOwner(input: SignUpOwnerInput) {
  const { data, error } = await supabase.auth.signUp({
    email: input.correo,
    password: input.password,
    options: {
      data: {
        nombre_negocio: input.nombreNegocio,
        nombre_usuario: input.nombreUsuario,
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
