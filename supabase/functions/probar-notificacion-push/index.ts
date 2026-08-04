// Edge Function: probar-notificacion-push
//
// Botón "Enviar prueba" de Configuración > Notificaciones. A propósito NO reutiliza
// enviar-notificaciones-push (que se protege con un secreto de cron que jamás debe
// llegar al bundle del front) — en cambio, se autoriza con el JWT normal del usuario
// que llama, igual que cualquier otra función invocada desde el front. Con un cliente
// scoped a ese JWT, RLS restringe la lectura de push_subscriptions a SUS propias filas
// (usuario_id = auth.uid()), así que no hace falta service_role ni validar nada a mano:
// no hay forma de que un usuario mande una prueba a otro.

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';
import { corsHeaders, handleCorsPreflight } from '../_shared/cors.ts';

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

  const callerClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error: userError } = await callerClient.auth.getUser();
  if (userError || !user) {
    return jsonResponse({ error: 'No autorizado' }, 401);
  }

  const { data: subs, error: subsError } = await callerClient
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth');

  if (subsError) return jsonResponse({ error: subsError.message }, 500);
  if (!subs?.length) return jsonResponse({ error: 'No tienes notificaciones push activadas en este navegador' }, 404);

  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')!;
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')!;
  const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:soporte@cobraya.app';
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const payload = JSON.stringify({
    title: 'CobraYA',
    body: 'Esta es una notificación de prueba. Si la ves, todo funciona correctamente 🎉',
    url: '/',
  });

  let enviados = 0;
  let fallidos = 0;

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      );
      enviados++;
    } catch {
      fallidos++;
    }
  }

  if (enviados === 0) {
    return jsonResponse({ error: 'No se pudo enviar la notificación de prueba' }, 500);
  }

  return jsonResponse({ enviados, fallidos }, 200);
});
