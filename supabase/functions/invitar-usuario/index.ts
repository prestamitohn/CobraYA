// Edge Function: invitar-usuario
//
// El dueño de un tenant invita a un socio (con login propio, vinculado a un cliente
// existente) o a un auditor (solo lectura) a su MISMO tenant. A diferencia de
// admin-crear-tenant (que crea un tenant NUEVO y solo la usa el superadmin), esta
// función la invoca el OWNER de un tenant existente para dar de alta gente en SU
// cooperativa — mismo patrón de doble verificación:
//  1. Con el cliente anon+JWT del caller, se confirma que es 'owner' de un tenant (RPC
//     current_rol()) antes de tocar nada.
//  2. Recién ahí se usa service_role para la única operación que lo necesita: crear el
//     usuario en auth.users con el tenant_id/rol/cliente_id ya resueltos server-side
//     (nunca se confía en un tenant_id que mande el body, para que un owner no pueda
//     invitar gente a OTRO tenant).

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, handleCorsPreflight } from '../_shared/cors.ts';

interface InvitarUsuarioPayload {
  rol: 'socio' | 'auditor';
  correo: string;
  password: string;
  nombreUsuario: string;
  clienteId?: string; // requerido si rol === 'socio'
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Método no permitido' }, 405);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'Falta encabezado Authorization' }, 401);
  }

  let payload: InvitarUsuarioPayload;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: 'Body inválido, se esperaba JSON' }, 400);
  }

  const { rol, correo, password, nombreUsuario, clienteId } = payload;
  if (!rol || !correo || !password || !nombreUsuario) {
    return jsonResponse({ error: 'Payload incompleto' }, 400);
  }
  if (rol !== 'socio' && rol !== 'auditor') {
    return jsonResponse({ error: 'rol inválido' }, 400);
  }
  if (rol === 'socio' && !clienteId) {
    return jsonResponse({ error: 'clienteId es obligatorio para invitar a un socio' }, 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: caller, error: callerError } = await callerClient.auth.getUser();
  if (callerError || !caller?.user) {
    return jsonResponse({ error: 'No autorizado' }, 401);
  }

  const { data: callerRow, error: callerRowError } = await callerClient
    .from('usuarios')
    .select('tenant_id, rol')
    .eq('id', caller.user.id)
    .single();

  if (callerRowError || !callerRow || callerRow.rol !== 'owner') {
    return jsonResponse({ error: 'Solo el dueño del negocio puede invitar usuarios' }, 403);
  }

  const tenantId = callerRow.tenant_id;

  if (rol === 'socio') {
    const { data: clienteRow, error: clienteError } = await callerClient
      .from('clientes')
      .select('id, usuario_id')
      .eq('id', clienteId)
      .eq('tenant_id', tenantId)
      .single();

    if (clienteError || !clienteRow) {
      return jsonResponse({ error: 'El socio indicado no pertenece a este tenant' }, 400);
    }
    if (clienteRow.usuario_id) {
      return jsonResponse({ error: 'Este socio ya tiene una cuenta' }, 400);
    }
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data, error } = await adminClient.auth.admin.createUser({
    email: correo,
    password,
    email_confirm: true,
    user_metadata: {
      tenant_id: tenantId,
      rol,
      nombre_usuario: nombreUsuario,
      ...(rol === 'socio' ? { cliente_id: clienteId } : {}),
    },
  });

  if (error) {
    return jsonResponse({ error: error.message }, 400);
  }

  return jsonResponse({ userId: data.user?.id }, 201);
});
