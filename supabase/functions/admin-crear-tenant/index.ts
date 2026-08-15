// Edge Function: admin-crear-tenant
//
// Único lugar del sistema que usa la service_role key — Supabase la inyecta sola como
// variable de entorno en cada Edge Function (nunca hay que pegarla en ningún .env ni
// en el bundle del front). Se usa exclusivamente para llamar al Admin API de Auth
// (crear un usuario con email ya confirmado); el resto de la lógica (crear tenant +
// usuario owner) la sigue haciendo el trigger handle_new_user, el mismo que corre en
// el autoregistro normal — no hay una segunda copia de esa lógica acá.
//
// Doble verificación de que quien llama es superadmin:
//  1. Con un cliente anon+JWT del caller, se llama a is_superadmin() (RPC) — si no lo
//     es, la función corta ahí. Este chequeo respeta RLS/lógica normal.
//  2. Recién después se usa el cliente service_role (que se salta todo RLS) para la
//     única operación que realmente lo necesita: crear el usuario en auth.users.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, handleCorsPreflight } from '../_shared/cors.ts';

interface CrearTenantPayload {
  nombreNegocio: string;
  nombreUsuario: string;
  correo: string;
  password: string;
  tipoTenant?: 'prestamista' | 'cooperativa';
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

  let payload: CrearTenantPayload;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: 'Body inválido, se esperaba JSON' }, 400);
  }

  const { nombreNegocio, nombreUsuario, correo, password, tipoTenant } = payload;
  if (!nombreNegocio || !nombreUsuario || !correo || !password) {
    return jsonResponse({ error: 'Payload incompleto' }, 400);
  }
  if (tipoTenant && tipoTenant !== 'prestamista' && tipoTenant !== 'cooperativa') {
    return jsonResponse({ error: 'tipoTenant inválido' }, 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: esSuperadmin, error: checkError } = await callerClient.rpc('is_superadmin');
  if (checkError || !esSuperadmin) {
    return jsonResponse({ error: 'No autorizado' }, 403);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data, error } = await adminClient.auth.admin.createUser({
    email: correo,
    password,
    email_confirm: true,
    user_metadata: {
      nombre_negocio: nombreNegocio,
      nombre_usuario: nombreUsuario,
      tipo_tenant: tipoTenant ?? 'prestamista',
    },
  });

  if (error) {
    return jsonResponse({ error: error.message }, 400);
  }

  return jsonResponse({ userId: data.user?.id }, 201);
});
