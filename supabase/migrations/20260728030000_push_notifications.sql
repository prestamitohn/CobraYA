-- CobraYA: notificaciones push (Web Push / PWA).
--
-- Cada navegador que activa las notificaciones guarda una "suscripción" (endpoint +
-- claves de cifrado) en push_subscriptions. Una vez al día, pg_cron dispara la Edge
-- Function enviar-notificaciones-push (vía pg_net, ya que pg_cron no puede firmar
-- payloads VAPID en SQL puro), que usa service_role para recorrer TODAS las
-- suscripciones de TODOS los tenants y envía un resumen ("tienes N cuotas que cobrar
-- hoy / M en mora") a cada usuario, respetando su alcance (owner ve todo el tenant,
-- cobrador solo sus préstamos asignados) vía obtener_resumen_notificacion().

create table public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  usuario_id  uuid not null references public.usuarios (id) on delete cascade,
  endpoint    text not null,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now(),
  constraint uq_push_subscriptions_endpoint unique (endpoint)
);

comment on table public.push_subscriptions is 'Suscripciones Web Push por navegador/dispositivo. Un usuario puede tener varias (distintos dispositivos).';

create index idx_push_subscriptions_usuario on public.push_subscriptions (usuario_id);
create index idx_push_subscriptions_tenant on public.push_subscriptions (tenant_id);

alter table public.push_subscriptions enable row level security;

-- Cada usuario gestiona solo sus propias suscripciones (no es el patrón owner_all: un
-- cobrador también necesita poder suscribirse/desuscribirse a sus propias push).
create policy push_subscriptions_self on public.push_subscriptions
  for all
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid() and tenant_id = public.current_tenant_id());

grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- ---------------------------------------------------------------------------
-- obtener_resumen_notificacion(): cuotas de hoy y en mora, con el mismo alcance que
-- vería ese usuario en la app (owner = todo el tenant, cobrador = solo lo suyo).
-- security definer porque lo llama la Edge Function con service_role, sin sesión de
-- usuario real — recibe el usuario_id explícito en vez de usar auth.uid().
-- ---------------------------------------------------------------------------

create or replace function public.obtener_resumen_notificacion(p_usuario_id uuid)
returns table (
  cuotas_hoy   integer,
  monto_hoy    numeric,
  cuotas_mora  integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_rol       public.rol_usuario;
begin
  select tenant_id, rol into v_tenant_id, v_rol from public.usuarios where id = p_usuario_id;

  if v_tenant_id is null then
    return query select 0, 0::numeric, 0;
    return;
  end if;

  return query
  select
    count(*) filter (where cu.fecha_vto = current_date and cu.estado = 'pendiente')::integer,
    coalesce(sum(cu.monto) filter (where cu.fecha_vto = current_date and cu.estado = 'pendiente'), 0),
    count(*) filter (where cu.estado = 'vencida')::integer
  from public.cuotas cu
  join public.prestamos p on p.id = cu.prestamo_id
  where p.tenant_id = v_tenant_id
    and p.estado <> 'eliminado'
    and (v_rol = 'owner' or p.cobrador_id = p_usuario_id);
end;
$$;

comment on function public.obtener_resumen_notificacion is 'Resumen diario (cuotas de hoy, monto, cuotas en mora) para el push diario — respeta el mismo alcance owner/cobrador que la app.';

grant execute on function public.obtener_resumen_notificacion(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Programación: pg_cron dispara la Edge Function todos los días a las 07:00 hora de
-- Honduras. El secreto compartido (x-cron-secret) evita que cualquiera con la anon key
-- pública pueda disparar envíos masivos llamando al endpoint directamente.
-- ---------------------------------------------------------------------------

create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'cobraya-notificaciones-push',
  '0 13 * * *', -- 13:00 UTC = 07:00 hora de Honduras (UTC-6)
  $$
  select net.http_post(
    url := 'https://lmmnjmucukbmyvacndst.supabase.co/functions/v1/enviar-notificaciones-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxtbW5qbXVjdWtibXl2YWNuZHN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2NzMwMjEsImV4cCI6MjEwMDI0OTAyMX0.--J3qt2KmrBR62d9jSf9xhEAgwjjEPdDGuZnHFtq1Xg',
      'x-cron-secret', 'f50625ed08d0603553972b80ec83e7247c9e5f33330272ac16aef952c2a258c1'
    ),
    body := '{}'::jsonb
  );
  $$
);
