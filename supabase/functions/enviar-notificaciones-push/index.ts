// Edge Function: enviar-notificaciones-push
//
// Tres formas de invocarla, todas protegidas por el mismo header x-cron-secret (evita
// que cualquiera con la anon key pública dispare envíos masivos llamando al endpoint
// directamente — la anon key sola solo pasa la verificación JWT genérica de Edge
// Functions, no autoriza nada por sí misma):
//
//   1. Sin body (o {"action":"resumen_diario"}) — la dispara pg_cron una vez al día
//      (ver migración 20260728030000_push_notifications.sql) y manda a cada
//      suscripción su resumen de cuotas de hoy / en mora.
//   2. {"action":"test","usuarioId":"..."} — manda una notificación de prueba a todas
//      las suscripciones de ese usuario. Pensada para probar el flujo end-to-end o
//      diagnosticar sin esperar al cron diario.
//   3. {"action":"nuevo_tenant","nombreNegocio":"..."} — la dispara el trigger
//      notificar_nuevo_tenant() (migración 20260728040000_notificar_nuevo_tenant.sql)
//      cuando se crea un tenant nuevo, y avisa a todos los superadmins con push activo.
//
// Usa service_role porque tiene que recorrer suscripciones de TODOS los tenants /
// leer platform_admins, algo que ningún JWT de usuario normal puede hacer.

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';
import { corsHeaders, handleCorsPreflight } from '../_shared/cors.ts';

interface Suscripcion {
  id: string;
  usuario_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface PushPayload {
  title: string;
  body: string;
  url: string;
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

  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) {
    return jsonResponse({ error: 'No autorizado' }, 401);
  }

  let payload: Record<string, unknown> = {};
  try {
    if (req.headers.get('content-length') !== '0') payload = await req.json();
  } catch {
    // body vacío o inválido -> se trata como el envío diario por defecto
  }
  const action = (payload.action as string) ?? 'resumen_diario';

  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')!;
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')!;
  const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:soporte@cobraya.app';
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  async function enviarA(sub: Suscripcion, notif: PushPayload): Promise<'enviado' | 'eliminado' | 'fallido'> {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(notif),
      );
      return 'enviado';
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await supabase.from('push_subscriptions').delete().eq('id', sub.id);
        return 'eliminado';
      }
      return 'fallido';
    }
  }

  // --- Prueba manual: manda a todas las suscripciones de un usuario puntual ---
  if (action === 'test') {
    const usuarioId = payload.usuarioId as string | undefined;
    if (!usuarioId) return jsonResponse({ error: 'Falta usuarioId' }, 400);

    const { data: subs, error } = await supabase
      .from('push_subscriptions')
      .select('id, usuario_id, endpoint, p256dh, auth')
      .eq('usuario_id', usuarioId);
    if (error) return jsonResponse({ error: error.message }, 500);
    if (!subs?.length) return jsonResponse({ error: 'Ese usuario no tiene notificaciones push activadas' }, 404);

    const resultados = await Promise.all(subs.map((s) => enviarA(s as Suscripcion, {
      title: 'CobraYA',
      body: 'Esta es una notificación de prueba. Si la ves, todo funciona correctamente 🎉',
      url: '/',
    })));

    return jsonResponse({
      enviados: resultados.filter((r) => r === 'enviado').length,
      eliminados: resultados.filter((r) => r === 'eliminado').length,
      fallidos: resultados.filter((r) => r === 'fallido').length,
    }, 200);
  }

  // --- Nuevo tenant registrado: avisa a todos los superadmins con push activo ---
  if (action === 'nuevo_tenant') {
    const nombreNegocio = (payload.nombreNegocio as string) ?? 'un negocio nuevo';

    const { data: admins, error: adminsError } = await supabase.from('platform_admins').select('user_id');
    if (adminsError) return jsonResponse({ error: adminsError.message }, 500);
    const adminIds = (admins ?? []).map((a) => a.user_id);

    if (adminIds.length === 0) return jsonResponse({ enviados: 0, eliminados: 0, fallidos: 0, total: 0 }, 200);

    const { data: subs, error } = await supabase
      .from('push_subscriptions')
      .select('id, usuario_id, endpoint, p256dh, auth')
      .in('usuario_id', adminIds);
    if (error) return jsonResponse({ error: error.message }, 500);

    const resultados = await Promise.all((subs ?? []).map((s) => enviarA(s as Suscripcion, {
      title: 'CobraYA — Nuevo registro',
      body: `${nombreNegocio} se acaba de registrar en la plataforma.`,
      url: '/admin',
    })));

    return jsonResponse({
      enviados: resultados.filter((r) => r === 'enviado').length,
      eliminados: resultados.filter((r) => r === 'eliminado').length,
      fallidos: resultados.filter((r) => r === 'fallido').length,
      total: subs?.length ?? 0,
    }, 200);
  }

  // --- Resumen diario (default, disparado por pg_cron) ---
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

  for (const sub of (subscripciones ?? []) as Suscripcion[]) {
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

    const resultado = await enviarA(sub, {
      title: 'CobraYA — Resumen del día',
      body: partes.join(' · '),
      url: '/payments',
    });

    if (resultado === 'enviado') enviados++;
    else if (resultado === 'eliminado') eliminados++;
    else fallidos++;
  }

  return jsonResponse({ enviados, sinNovedad, eliminados, fallidos, total: subscripciones?.length ?? 0 }, 200);
});
