-- Hasta ahora estado_suscripcion era solo un campo informativo: suspender un tenant no
-- le bloqueaba realmente el acceso a sus datos. Como current_tenant_id() es el punto
-- que TODAS las policies RLS usan para autorizar (tenant_id = current_tenant_id()),
-- basta con que devuelva NULL para un tenant suspendido/cancelado para que el acceso
-- se corte en cascada en cada tabla, sin tocar cada policy una por una.

create or replace function public.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select u.tenant_id
  from public.usuarios u
  join public.tenants t on t.id = u.tenant_id
  where u.id = auth.uid()
    and t.estado_suscripcion in ('activa', 'prueba')
$$;

-- Para que el front pueda mostrar "tu cuenta está suspendida" (en vez de errores
-- genéricos), este helper SÍ devuelve el estado del tenant propio aunque esté
-- suspendido — no depende de current_tenant_id() y solo expone el tenant del usuario
-- que llama, nunca datos de otros tenants.
create or replace function public.mi_tenant_estado()
returns table (nombre text, estado_suscripcion public.estado_suscripcion)
language sql
stable
security definer
set search_path = public
as $$
  select t.nombre, t.estado_suscripcion
  from public.usuarios u
  join public.tenants t on t.id = u.tenant_id
  where u.id = auth.uid()
$$;

comment on function public.mi_tenant_estado is 'Estado de suscripción del tenant del usuario actual, visible incluso si está suspendido (a diferencia de current_tenant_id()). Usado por el front para mostrar el motivo del bloqueo.';

grant execute on function public.mi_tenant_estado() to authenticated;
