-- CobraYA: panel de superadmin de plataforma (fuera de cada tenant).
--
-- platform_admins es una tabla aparte de `usuarios` a propósito: "ser superadmin" es un
-- atributo de PLATAFORMA, no de membresía a un tenant. No tiene ninguna policy de
-- select/insert/update para `authenticated` — nadie puede leerla ni escribirla vía la
-- API REST directamente, ni siquiera un superadmin. El único acceso es a través de
-- is_superadmin() (security definer) y de las funciones admin_* que la usan como
-- guardia. Así, aunque alguien inspeccione las requests del front, no hay ningún
-- endpoint que exponga "quién es superadmin".

create table public.platform_admins (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);

alter table public.platform_admins enable row level security;
-- Deliberadamente sin policies: default-deny total vía PostgREST.

create or replace function public.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid())
$$;

comment on function public.is_superadmin is 'true si el usuario autenticado actual es superadmin de la plataforma CobraYA (no de un tenant). Guardia usada por todas las funciones admin_*.';

grant execute on function public.is_superadmin() to authenticated;

-- ---------------------------------------------------------------------------
-- admin_platform_metrics(): KPIs globales de toda la plataforma
-- ---------------------------------------------------------------------------

create or replace function public.admin_platform_metrics()
returns table (
  total_tenants           bigint,
  tenants_activos         bigint,
  tenants_prueba          bigint,
  tenants_suspendidos     bigint,
  tenants_cancelados      bigint,
  total_clientes          bigint,
  total_prestamos         bigint,
  total_prestado_plataforma   numeric,
  total_cobrado_plataforma    numeric
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_superadmin() then
    raise exception 'No autorizado';
  end if;

  return query
  select
    (select count(*) from public.tenants),
    (select count(*) from public.tenants where estado_suscripcion = 'activa'),
    (select count(*) from public.tenants where estado_suscripcion = 'prueba'),
    (select count(*) from public.tenants where estado_suscripcion = 'suspendida'),
    (select count(*) from public.tenants where estado_suscripcion = 'cancelada'),
    (select count(*) from public.clientes),
    (select count(*) from public.prestamos where estado <> 'eliminado'),
    (select coalesce(sum(monto_otorgado), 0) from public.prestamos where estado <> 'eliminado'),
    (select coalesce(sum(monto), 0) from public.pagos);
end;
$$;

comment on function public.admin_platform_metrics is 'KPIs agregados de toda la plataforma, solo para superadmin.';

grant execute on function public.admin_platform_metrics() to authenticated;

-- ---------------------------------------------------------------------------
-- admin_list_tenants(): listado de tenants con conteos por tenant
-- ---------------------------------------------------------------------------

create or replace function public.admin_list_tenants()
returns table (
  id                  uuid,
  nombre              text,
  rtn                 text,
  moneda              text,
  estado_suscripcion  public.estado_suscripcion,
  fecha_inicio        date,
  created_at          timestamptz,
  cantidad_usuarios   bigint,
  cantidad_clientes   bigint,
  cantidad_prestamos  bigint,
  monto_otorgado_total numeric
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_superadmin() then
    raise exception 'No autorizado';
  end if;

  return query
  select
    t.id, t.nombre, t.rtn, t.moneda, t.estado_suscripcion, t.fecha_inicio, t.created_at,
    (select count(*) from public.usuarios u where u.tenant_id = t.id),
    (select count(*) from public.clientes c where c.tenant_id = t.id),
    (select count(*) from public.prestamos p where p.tenant_id = t.id and p.estado <> 'eliminado'),
    (select coalesce(sum(p.monto_otorgado), 0) from public.prestamos p where p.tenant_id = t.id and p.estado <> 'eliminado')
  from public.tenants t
  order by t.created_at desc;
end;
$$;

comment on function public.admin_list_tenants is 'Lista todos los tenants de la plataforma con conteos básicos, solo para superadmin.';

grant execute on function public.admin_list_tenants() to authenticated;

-- ---------------------------------------------------------------------------
-- admin_set_tenant_estado(): suspender/reactivar/cancelar un tenant
-- ---------------------------------------------------------------------------

create or replace function public.admin_set_tenant_estado(p_tenant_id uuid, p_estado public.estado_suscripcion)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_superadmin() then
    raise exception 'No autorizado';
  end if;

  update public.tenants set estado_suscripcion = p_estado where id = p_tenant_id;

  if not found then
    raise exception 'Tenant % no encontrado', p_tenant_id;
  end if;
end;
$$;

comment on function public.admin_set_tenant_estado is 'Cambia el estado_suscripcion de un tenant (activa/prueba/suspendida/cancelada), solo para superadmin.';

grant execute on function public.admin_set_tenant_estado(uuid, public.estado_suscripcion) to authenticated;
