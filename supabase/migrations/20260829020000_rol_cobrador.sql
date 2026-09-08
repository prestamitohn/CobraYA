-- CobraYA: activar el rol collector (cobrador de campo) en producto.
--
-- El enum, las policies de lectura (clientes/prestamos/cuotas/pagos/multas/
-- gastos_administrativos) y los RPC de pago ya validan al collector desde la
-- migración inicial (20260721010000_schema.sql, 20260721010100_rls_policies.sql,
-- 20260721010400_funciones_negocio.sql) — nunca se usó desde el frontend. Esta
-- migración cierra 3 huecos encontrados al auditar ese camino antes de habilitarlo:
--  1) usuarios.activo se ignoraba (dar de baja a un cobrador no le quitaba acceso).
--  2) prestamos.cobrador_id es una FK global sin validar tenant/rol.
--  3) pagos_collector_select no veía los pagos que el DUEÑO cobraba en préstamos
--     asignados a un cobrador (comparaba pagos.cobrador_id = quien cobró, no el
--     cobrador del préstamo).

-- ---------------------------------------------------------------------------
-- 1) current_tenant_id() / current_rol(): respetar usuarios.activo.
-- Sin esto, desactivar a un cobrador (o a cualquier usuario) no le retira el acceso:
-- ambas funciones seguían resolviendo tenant/rol de una fila inactiva.
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
    and u.activo
    and (
      t.estado_suscripcion = 'activa'
      or (t.estado_suscripcion = 'prueba' and t.fecha_inicio + 14 >= current_date)
    )
$$;

create or replace function public.current_rol()
returns public.rol_usuario
language sql
stable
security definer
set search_path = public
as $$
  select rol from public.usuarios where id = auth.uid() and activo
$$;

-- ---------------------------------------------------------------------------
-- 2) Validar a quién se puede asignar como cobrador de un préstamo.
-- prestamos.cobrador_id referencia usuarios(id) sin restricción de tenant ni de rol
-- (20260721010000_schema.sql:126) y el owner escribe por UPDATE directo vía PostgREST
-- (policy prestamos_owner_all) — hoy nada impide asignar un usuario de OTRO tenant o
-- con rol distinto de collector (ej. un socio).
-- ---------------------------------------------------------------------------

create or replace function public.validar_cobrador_prestamo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.cobrador_id is not null then
    if not exists (
      select 1 from public.usuarios u
      where u.id = new.cobrador_id
        and u.tenant_id = new.tenant_id
        and u.rol = 'collector'
    ) then
      raise exception 'cobrador_id debe ser un usuario con rol collector del mismo tenant';
    end if;
  end if;
  return new;
end;
$$;

comment on function public.validar_cobrador_prestamo is 'Trigger de prestamos: impide asignar como cobrador a un usuario de otro tenant o que no tenga rol collector.';

drop trigger if exists trg_validar_cobrador_prestamo on public.prestamos;
create trigger trg_validar_cobrador_prestamo
before insert or update of cobrador_id on public.prestamos
for each row
execute function public.validar_cobrador_prestamo();

-- ---------------------------------------------------------------------------
-- 3) El cobrador debe ver TODOS los pagos de sus préstamos asignados, no solo los que
-- él mismo registró. Antes: pagos_collector_select comparaba pagos.cobrador_id (quien
-- cobró) contra auth.uid(). Si el dueño cobraba una cuota de un préstamo asignado, el
-- cobrador dejaba de verla — sus totales no cuadraban. pagos.cuota_id es NOT NULL
-- incluso para pagos de multa/gasto administrativo (20260721010000_schema.sql:180),
-- así que un solo join cubre los tres tipos de pago.
-- ---------------------------------------------------------------------------

drop policy if exists pagos_collector_select on public.pagos;

create policy pagos_collector_select on public.pagos
  for select
  using (
    tenant_id = public.current_tenant_id()
    and public.current_rol() = 'collector'
    and exists (
      select 1
      from public.cuotas cu
      join public.prestamos p on p.id = cu.prestamo_id
      where cu.id = pagos.cuota_id and p.cobrador_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 4) handle_new_user(): hacer explícito el mapeo a 'collector' en vez de depender del
-- `else` implícito — mismo comportamiento, más legible/robusto ante roles futuros.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id       uuid;
  v_usuario_id      uuid;
  v_nombre_negocio  text;
  v_nombre_usuario  text;
  v_invited_tenant  text;
  v_tipo_tenant     text;
  v_rol_solicitado  text;
  v_cliente_id      text;
  v_rol             public.rol_usuario;
begin
  v_nombre_negocio := new.raw_user_meta_data ->> 'nombre_negocio';
  v_nombre_usuario := coalesce(new.raw_user_meta_data ->> 'nombre_usuario', split_part(new.email, '@', 1));
  v_invited_tenant := new.raw_user_meta_data ->> 'tenant_id';
  v_tipo_tenant := new.raw_user_meta_data ->> 'tipo_tenant';
  v_rol_solicitado := new.raw_user_meta_data ->> 'rol';
  v_cliente_id := new.raw_user_meta_data ->> 'cliente_id';

  if v_invited_tenant is not null then
    v_tenant_id := v_invited_tenant::uuid;
    v_rol := case
      when v_rol_solicitado = 'socio' then 'socio'::public.rol_usuario
      when v_rol_solicitado = 'auditor' then 'auditor'::public.rol_usuario
      when v_rol_solicitado = 'collector' then 'collector'::public.rol_usuario
      else 'collector'::public.rol_usuario
    end;
  else
    insert into public.tenants (nombre, tipo_tenant)
    values (
      coalesce(v_nombre_negocio, v_nombre_usuario || ' - CobraYA'),
      coalesce(v_tipo_tenant::public.tipo_tenant, 'prestamista')
    )
    returning id into v_tenant_id;
    v_rol := 'owner';

    if coalesce(v_tipo_tenant::public.tipo_tenant, 'prestamista') = 'cooperativa' then
      insert into public.fondo_excedente_config (tenant_id, nombre, porcentaje, orden, es_reserva_legal)
      values (v_tenant_id, 'Reserva Legal', 10, 1, true);
    end if;
  end if;

  insert into public.usuarios (id, tenant_id, rol, nombre, correo)
  values (new.id, v_tenant_id, v_rol, v_nombre_usuario, new.email)
  returning id into v_usuario_id;

  if v_rol = 'socio' and v_cliente_id is not null then
    update public.clientes
    set usuario_id = v_usuario_id
    where id = v_cliente_id::uuid and tenant_id = v_tenant_id and usuario_id is null;

    if not found then
      raise exception 'El socio indicado ya tiene una cuenta o no pertenece a este tenant';
    end if;
  end if;

  return new;
end;
$$;
