// Edge Function: enviar-notificaciones-push
//
// Disparada una vez al día por pg_cron (ver migración 20260728030000_push_notifications.sql,
// job "cobraya-notificaciones-push") vía pg_net — no la invoca el front. Usa service_role
// porque tiene que recorrer las suscripciones de TODOS los tenants, algo que ningún JWT
// de usuario normal puede hacer. Un header x-cron-secret compartido con el propio job de
// pg_cron evita que cualquiera con la anon key pública dispare envíos masivos llamando
// al endpoint directamente (la anon key sola solo pasa la verificación JWT genérica de
// Edge Functions, no autoriza nada por sí misma).

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

  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) {
    return jsonResponse({ error: 'No autorizado' }, 401);
  }

  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')!;
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')!;
  const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:soporte@cobraya.app';

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: subscripciones, error: subsError } = await supabase
    .from('push_subscriptions')
    .select('id, usuario_id, endpoint, p256dh, auth');

  if (subsError) {
    return jsonResponse({ error: subsError.message }, 500);
  }

  let enviados = 0;
  let sinNovedad = 0;
  let eliminados = 0;
  let fallidos = 0;

  for (const sub of subscripciones ?? []) {
    const { data: resumenRows, error: resumenError } = await supabase.rpc('obtener_resumen_notificacion', {
      p_usuario_id: sub.usuario_id,
    });

    if (resumenError) {
      fallidos++;
      continue;
    }

    const resumen = resumenRows?.[0];
    const cuotasHoy = resumen?.cuotas_hoy ?? 0;
    const cuotasMora = resumen?.cuotas_mora ?? 0;

    if (cuotasHoy === 0 && cuotasMora === 0) {
      sinNovedad++;
      continue;
    }

    const partes: string[] = [];
    if (cuotasHoy > 0) partes.push(`${cuotasHoy} cuota${cuotasHoy === 1 ? '' : 's'} por cobrar hoy`);
    if (cuotasMora > 0) partes.push(`${cuotasMora} en mora`);

    const payload = JSON.stringify({
      title: 'CobraYA — Resumen del día',
      body: partes.join(' · '),
      url: '/payments',
    });

    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      );
      enviados++;
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await supabase.from('push_subscriptions').delete().eq('id', sub.id);
        eliminados++;
      } else {
        fallidos++;
      }
    }
  }

  return jsonResponse({ enviados, sinNovedad, eliminados, fallidos, total: subscripciones?.length ?? 0 }, 200);
});
