// Edge Function: gestionar-contrato
//
// Dos acciones, ambas autorizadas con el JWT normal del usuario (nunca con un secreto
// compartido — es el mismo patrón de subir-logo):
//
//   1. {"action":"guardar","prestamoId":"...","pdfBase64":"..."} — sube el PDF firmado
//      al bucket privado "documentos" y crea la fila en public.documentos que lo
//      enlaza al préstamo (queda en el expediente). Solo el owner del tenant dueño de
//      ese préstamo puede hacerlo.
//   2. {"action":"ver","documentoId":"..."} — devuelve una URL firmada (temporal) para
//      ver/descargar un contrato ya guardado.
//
// La subida y la URL firmada pasan por service_role porque en este proyecto la RLS
// directa sobre storage.objects no resuelve auth.uid() (verificado empíricamente, ver
// migración 20260726020000_logo_storage_fix.sql). La verificación de que el préstamo o
// el documento pertenecen al tenant del caller SÍ se hace con un cliente scoped a su
// JWT (respeta RLS de verdad, no confía en lo que mande el front).

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, handleCorsPreflight } from '../_shared/cors.ts';

interface Payload {
  action: 'guardar' | 'ver';
  prestamoId?: string;
  pdfBase64?: string;
  nombreArchivo?: string;
  documentoId?: string;
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

  let payload: Payload;
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
    return jsonResponse({ error: 'Solo el dueño del negocio puede gestionar contratos' }, 403);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  if (payload.action === 'guardar') {
    if (!payload.prestamoId || !payload.pdfBase64) {
      return jsonResponse({ error: 'Payload incompleto' }, 400);
    }

    const { data: prestamo, error: prestamoError } = await callerClient
      .from('prestamos')
      .select('id, cliente_id')
      .eq('id', payload.prestamoId)
      .single();
    if (prestamoError || !prestamo) {
      return jsonResponse({ error: 'Préstamo no encontrado' }, 404);
    }

    const bytes = Uint8Array.from(atob(payload.pdfBase64), (c) => c.charCodeAt(0));
    const path = `${usuario.tenant_id}/contratos/${prestamo.id}/${Date.now()}.pdf`;

    const { error: uploadError } = await adminClient.storage.from('documentos').upload(path, bytes, {
      contentType: 'application/pdf',
    });
    if (uploadError) return jsonResponse({ error: uploadError.message }, 400);

    const { data: documento, error: insertError } = await adminClient
      .from('documentos')
      .insert({
        tenant_id: usuario.tenant_id,
        entidad_tipo: 'prestamo',
        entidad_id: prestamo.id,
        tipo_documento: 'contrato',
        nombre_original: payload.nombreArchivo ?? `Contrato_${prestamo.id}.pdf`,
        ruta_storage: path,
        content_type: 'application/pdf',
        subido_por: user.id,
      })
      .select('id')
      .single();
    if (insertError) return jsonResponse({ error: insertError.message }, 400);

    return jsonResponse({ documentoId: documento.id }, 201);
  }

  if (payload.action === 'ver') {
    if (!payload.documentoId) {
      return jsonResponse({ error: 'Falta documentoId' }, 400);
    }

    const { data: documento, error: docError } = await callerClient
      .from('documentos')
      .select('ruta_storage')
      .eq('id', payload.documentoId)
      .single();
    if (docError || !documento) {
      return jsonResponse({ error: 'Documento no encontrado' }, 404);
    }

    const { data: signedUrl, error: signedError } = await adminClient.storage
      .from('documentos')
      .createSignedUrl(documento.ruta_storage, 300);
    if (signedError) return jsonResponse({ error: signedError.message }, 400);

    return jsonResponse({ url: signedUrl.signedUrl }, 200);
  }

  return jsonResponse({ error: 'Acción no reconocida' }, 400);
});
