-- CobraYA: vencimiento de prueba gratuita (14 días) + cuentas de pago manual del
-- superadmin.
--
-- Flujo: cada tenant nace con estado_suscripcion='prueba' y fecha_inicio=hoy (trigger
-- de onboarding, sin cambios). A partir del día 15 sin que el superadmin lo pase a
-- 'activa' (tras confirmar el pago manual, fuera del sistema — no hay pasarela), el
-- acceso se bloquea igual que una suspensión, y el front le muestra al dueño las
-- cuentas de pago configuradas por el superadmin para que transfiera manualmente.
-- No hace falta pg_cron: el vencimiento se calcula al vuelo (fecha_inicio + 14 días)
-- en cada request, así que siempre está al día sin depender de que un job haya corrido.

-- ---------------------------------------------------------------------------
-- current_tenant_id(): una prueba vencida bloquea el acceso igual que 'suspendida'.
-- ---------------------------------------------------------------------------

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
    and (
      t.estado_suscripcion = 'activa'
      or (t.estado_suscripcion = 'prueba' and t.fecha_inicio + 14 >= current_date)
    )
$$;

-- ---------------------------------------------------------------------------
-- mi_tenant_estado(): agrega fecha_inicio, días restantes de prueba y si ya venció —
-- el front lo usa tanto para el contador durante la prueba como para decidir qué
-- pantalla de bloqueo mostrar (vencimiento de prueba vs. suspensión manual).
-- ---------------------------------------------------------------------------

drop function if exists public.mi_tenant_estado();

create or replace function public.mi_tenant_estado()
returns table (
  nombre                  text,
  estado_suscripcion      public.estado_suscripcion,
  fecha_inicio            date,
  dias_restantes_prueba   integer,
  trial_vencido           boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.nombre,
    t.estado_suscripcion,
    t.fecha_inicio,
    (t.fecha_inicio + 14 - current_date)::integer,
    (t.estado_suscripcion = 'prueba' and t.fecha_inicio + 14 < current_date)
  from public.usuarios u
  join public.tenants t on t.id = u.tenant_id
  where u.id = auth.uid()
$$;

grant execute on function public.mi_tenant_estado() to authenticated;

-- ---------------------------------------------------------------------------
-- platform_payment_accounts: cuentas de pago manual configuradas por el superadmin
-- (transferencia bancaria, dinero móvil, etc.), mostradas al tenant cuando debe pagar.
-- Sin policies de RLS a propósito (mismo patrón que platform_admins): default-deny
-- total vía PostgREST, todo el acceso pasa por funciones security definer.
-- ---------------------------------------------------------------------------

create type public.tipo_cuenta_pago as enum ('banco', 'tigo_money', 'paypal', 'otro');

create table public.platform_payment_accounts (
  id                    uuid primary key default gen_random_uuid(),
  tipo                  public.tipo_cuenta_pago not null default 'banco',
  nombre_beneficiario   text not null,
  banco                 text,
  numero_cuenta         text,
  tipo_cuenta_bancaria  text,
  telefono              text,
  instrucciones         text,
  activo                boolean not null default true,
  orden                 integer not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

alter table public.platform_payment_accounts enable row level security;
-- Deliberadamente sin policies: incluso el superadmin accede solo vía las funciones
-- admin_* de abajo, nunca por REST directo.

comment on table public.platform_payment_accounts is 'Cuentas de pago manual (banco, dinero móvil, etc.) que el superadmin configura para que los tenants transfieran el pago de su suscripción — no hay pasarela de pago online.';

create or replace function public.obtener_cuentas_pago_activas()
returns table (
  id                    uuid,
  tipo                  public.tipo_cuenta_pago,
  nombre_beneficiario   text,
  banco                 text,
  numero_cuenta         text,
  tipo_cuenta_bancaria  text,
  telefono              text,
  instrucciones         text
)
language sql
stable
security definer
set search_path = public
as $$
  select id, tipo, nombre_beneficiario, banco, numero_cuenta, tipo_cuenta_bancaria, telefono, instrucciones
  from public.platform_payment_accounts
  where activo = true
  order by orden, created_at
$$;

comment on function public.obtener_cuentas_pago_activas is 'Cuentas de pago activas, visibles para cualquier usuario autenticado (se muestran en la pantalla de prueba vencida/cuenta suspendida).';

grant execute on function public.obtener_cuentas_pago_activas() to authenticated;

create or replace function public.admin_listar_cuentas_pago()
returns table (
  id                    uuid,
  tipo                  public.tipo_cuenta_pago,
  nombre_beneficiario   text,
  banco                 text,
  numero_cuenta         text,
  tipo_cuenta_bancaria  text,
  telefono              text,
  instrucciones         text,
  activo                boolean,
  orden                 integer,
  created_at            timestamptz
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
  select p.id, p.tipo, p.nombre_beneficiario, p.banco, p.numero_cuenta, p.tipo_cuenta_bancaria, p.telefono, p.instrucciones, p.activo, p.orden, p.created_at
  from public.platform_payment_accounts p
  order by p.orden, p.created_at;
end;
$$;

grant execute on function public.admin_listar_cuentas_pago() to authenticated;

create or replace function public.admin_crear_cuenta_pago(
  p_tipo                 public.tipo_cuenta_pago,
  p_nombre_beneficiario  text,
  p_banco                text default null,
  p_numero_cuenta        text default null,
  p_tipo_cuenta_bancaria text default null,
  p_telefono             text default null,
  p_instrucciones        text default null,
  p_orden                integer default 0
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_superadmin() then
    raise exception 'No autorizado';
  end if;

  insert into public.platform_payment_accounts (
    tipo, nombre_beneficiario, banco, numero_cuenta, tipo_cuenta_bancaria, telefono, instrucciones, orden
  ) values (
    p_tipo, p_nombre_beneficiario, p_banco, p_numero_cuenta, p_tipo_cuenta_bancaria, p_telefono, p_instrucciones, p_orden
  ) returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.admin_crear_cuenta_pago(
  public.tipo_cuenta_pago, text, text, text, text, text, text, integer
) to authenticated;

create or replace function public.admin_actualizar_cuenta_pago(
  p_id                    uuid,
  p_tipo                  public.tipo_cuenta_pago,
  p_nombre_beneficiario   text,
  p_banco                 text default null,
  p_numero_cuenta         text default null,
  p_tipo_cuenta_bancaria  text default null,
  p_telefono              text default null,
  p_instrucciones         text default null,
  p_activo                boolean default true,
  p_orden                 integer default 0
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_superadmin() then
    raise exception 'No autorizado';
  end if;

  update public.platform_payment_accounts
  set tipo = p_tipo,
      nombre_beneficiario = p_nombre_beneficiario,
      banco = p_banco,
      numero_cuenta = p_numero_cuenta,
      tipo_cuenta_bancaria = p_tipo_cuenta_bancaria,
      telefono = p_telefono,
      instrucciones = p_instrucciones,
      activo = p_activo,
      orden = p_orden,
      updated_at = now()
  where id = p_id;

  if not found then
    raise exception 'Cuenta de pago no encontrada';
  end if;
end;
$$;

grant execute on function public.admin_actualizar_cuenta_pago(
  uuid, public.tipo_cuenta_pago, text, text, text, text, text, text, boolean, integer
) to authenticated;

create or replace function public.admin_eliminar_cuenta_pago(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_superadmin() then
    raise exception 'No autorizado';
  end if;

  delete from public.platform_payment_accounts where id = p_id;

  if not found then
    raise exception 'Cuenta de pago no encontrada';
  end if;
end;
$$;

grant execute on function public.admin_eliminar_cuenta_pago(uuid) to authenticated;
