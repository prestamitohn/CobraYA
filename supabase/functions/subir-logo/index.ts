// Edge Function: subir-logo
//
// Sube/reemplaza o elimina el logo del negocio (tenants.logo_url), usando service_role
// para el acceso a Storage. Se hace vía Edge Function y no con RLS directo sobre
// storage.objects porque en este proyecto la evaluación de RLS de Storage no resuelve
// auth.uid() correctamente (verificado empíricamente: incluso una policy trivial
// `auth.uid() is not null` rechaza el insert) — service_role evita ese problema.
//
// Verificación de autorización: con un cliente anon+JWT del caller se confirma que es
// el owner de su tenant (usuarios.rol = 'owner'), igual que el resto de operaciones
// sensibles del sistema (mismo patrón que admin-crear-tenant).

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, handleCorsPreflight } from '../_shared/cors.ts';

interface SubirLogoPayload {
  action: 'upload' | 'remove';
  fileBase64?: string;
  contentType?: string;
  extension?: string;
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

  let payload: SubirLogoPayload;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: 'Body inválido, se esperaba JSON' }, 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: userError } = await callerClient.auth.getUser();
  if (userError || !user) {
    return jsonResponse({ error: 'No autorizado' }, 401);
  }

  const { data: usuario, error: usuarioError } = await callerClient
    .from('usuarios')
    .select('tenant_id, rol')
    .eq('id', user.id)
    .single();

  if (usuarioError || !usuario) {
    return jsonResponse({ error: 'No autorizado' }, 403);
  }
  if (usuario.rol !== 'owner') {
    return jsonResponse({ error: 'Solo el dueño del negocio puede modificar el logo' }, 403);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  if (payload.action === 'remove') {
    const { data: tenantRow } = await callerClient.from('tenants').select('logo_url').eq('id', usuario.tenant_id).single();
    if (tenantRow?.logo_url) {
      const match = tenantRow.logo_url.match(/\/logos\/(.+?)(\?|$)/);
      if (match) {
        await adminClient.storage.from('logos').remove([decodeURIComponent(match[1])]);
      }
    }

    const { error: updateError } = await adminClient.from('tenants').update({ logo_url: null }).eq('id', usuario.tenant_id);
    if (updateError) return jsonResponse({ error: updateError.message }, 400);

    return jsonResponse({ ok: true }, 200);
  }

  if (payload.action !== 'upload' || !payload.fileBase64 || !payload.contentType || !payload.extension) {
    return jsonResponse({ error: 'Payload incompleto' }, 400);
  }

  const bytes = Uint8Array.from(atob(payload.fileBase64), (c) => c.charCodeAt(0));
  const path = `${usuario.tenant_id}/logo.${payload.extension}`;

  const { error: uploadError } = await adminClient.storage.from('logos').upload(path, bytes, {
    contentType: payload.contentType,
    upsert: true,
  });
  if (uploadError) return jsonResponse({ error: uploadError.message }, 400);

  const { data: publicUrlData } = adminClient.storage.from('logos').getPublicUrl(path);
  const logoUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`;

  const { error: updateError } = await adminClient.from('tenants').update({ logo_url: logoUrl }).eq('id', usuario.tenant_id);
  if (updateError) return jsonResponse({ error: updateError.message }, 400);

  return jsonResponse({ logoUrl }, 200);
});
