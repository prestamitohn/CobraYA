-- CobraYA: feedback de uso real de la cooperativa FAN (2026-08-31) — dos cambios de negocio:
--
-- 1) Baja definitiva de socio/cliente con motivo y fecha, en vez del borrado real que la
--    policy `clientes_owner_all` permitía sin querer. Un DELETE de `clientes` arrastra en
--    cascada `aportaciones`, `cuentas_ahorro` y `movimientos` (todas con `on delete cascade`
--    hacia clientes), así que hoy un owner puede borrar sin darse cuenta todo el historial
--    contable de un socio. Se reemplaza por baja lógica (ya existía `activo`, se le suma
--    fecha/motivo) y se revoca el DELETE.
--
-- 2) Aportación "reserva": tipo de aportación nuevo, no retirable — en FAN cada socio aporta
--    L3,000 fijos que quedan como reserva de la cooperativa, separados de obligatoria/
--    extraordinaria (que sí son retirables). No confundir con `monto_reserva` de
--    excedentes_periodo (esa es la reserva legal sobre el EXCEDENTE anual, Art. 44 Decreto
--    65-87) — esta es reserva sobre el CAPITAL APORTADO por cada socio individual.

-- ---------------------------------------------------------------------------
-- 1) Baja definitiva de socio
-- ---------------------------------------------------------------------------

alter table public.clientes
  add column fecha_retiro date,
  add column motivo_retiro text;

comment on column public.clientes.fecha_retiro is 'Fecha de baja definitiva (retiro del socio/fin de relación con el cliente). NULL mientras esté activo o solo suspendido temporalmente.';
comment on column public.clientes.motivo_retiro is 'Motivo de la baja definitiva, capturado por el dueño en dar_baja_socio().';

create or replace function public.dar_baja_socio(
  p_cliente_id uuid,
  p_motivo     text,
  p_fecha      date default current_date
)
returns void
language plpgsql
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
begin
  if v_tenant_id is null then
    raise exception 'Usuario sin tenant asignado';
  end if;

  if public.current_rol() <> 'owner' then
    raise exception 'Solo el dueño del negocio puede dar de baja a un socio/cliente';
  end if;

  if not exists (select 1 from public.clientes where id = p_cliente_id and tenant_id = v_tenant_id) then
    raise exception 'El socio no pertenece a este tenant';
  end if;

  update public.clientes
     set activo = false,
         fecha_retiro = p_fecha,
         motivo_retiro = p_motivo
   where id = p_cliente_id;
end;
$$;

comment on function public.dar_baja_socio is 'Baja definitiva (retiro) de un socio/cliente: marca activo=false y registra fecha+motivo. No borra ningún dato — conserva préstamos, aportaciones, ahorros y movimientos históricos.';

create or replace function public.reactivar_socio(p_cliente_id uuid)
returns void
language plpgsql
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
begin
  if v_tenant_id is null then
    raise exception 'Usuario sin tenant asignado';
  end if;

  if public.current_rol() <> 'owner' then
    raise exception 'Solo el dueño del negocio puede reactivar un socio/cliente';
  end if;

  if not exists (select 1 from public.clientes where id = p_cliente_id and tenant_id = v_tenant_id) then
    raise exception 'El socio no pertenece a este tenant';
  end if;

  update public.clientes
     set activo = true,
         fecha_retiro = null,
         motivo_retiro = null
   where id = p_cliente_id;
end;
$$;

comment on function public.reactivar_socio is 'Revierte una baja definitiva: reactiva al socio/cliente y limpia fecha_retiro/motivo_retiro.';

-- Endurecer RLS: `clientes_owner_all` era `for all`, y junto con el `grant ... delete`
-- de más abajo dejaba a cualquier owner borrar clientes desde el cliente JS directamente
-- (sin pasar por dar_baja_socio), perdiendo aportaciones/ahorros/movimientos en cascada
-- sin aviso. Se parte en select/insert/update y se revoca el delete.
drop policy clientes_owner_all on public.clientes;

create policy clientes_owner_select on public.clientes
  for select
  using (tenant_id = public.current_tenant_id() and public.current_rol() = 'owner');

create policy clientes_owner_insert on public.clientes
  for insert
  with check (tenant_id = public.current_tenant_id() and public.current_rol() = 'owner');

create policy clientes_owner_update on public.clientes
  for update
  using (tenant_id = public.current_tenant_id() and public.current_rol() = 'owner')
  with check (tenant_id = public.current_tenant_id() and public.current_rol() = 'owner');

revoke delete on public.clientes from authenticated;

-- ---------------------------------------------------------------------------
-- 2) Aportación de reserva (no retirable)
-- ---------------------------------------------------------------------------

-- Se busca el constraint por definición en vez de asumir el nombre autogenerado
-- (`aportaciones_tipo_check`): más robusto si alguna migración anterior lo nombró
-- distinto.
do $$
declare
  v_conname text;
begin
  select conname into v_conname
  from pg_constraint
  where conrelid = 'public.aportaciones'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%tipo%obligatoria%';

  if v_conname is not null then
    execute format('alter table public.aportaciones drop constraint %I', v_conname);
  end if;
end $$;

alter table public.aportaciones add constraint aportaciones_tipo_check
  check (tipo in ('obligatoria', 'extraordinaria', 'reserva', 'retiro'));

comment on column public.aportaciones.tipo is 'obligatoria/extraordinaria/reserva suman al saldo, retiro resta. reserva es capital bloqueado: cuenta para el saldo total del socio pero nunca es elegible para un retiro (ver registrar_aportacion).';

-- registrar_aportacion: acepta 'reserva' y el retiro ahora valida contra el saldo
-- RETIRABLE (obligatoria+extraordinaria-retiros), no contra el saldo total —
-- la reserva nunca debe poder vaciarse por esta vía.
create or replace function public.registrar_aportacion(
  p_cliente_id    uuid,
  p_tipo          text,
  p_monto         numeric,
  p_fecha         date default current_date,
  p_observaciones text default null
)
returns uuid
language plpgsql
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_id        uuid;
  v_saldo_retirable numeric;
begin
  if v_tenant_id is null then
    raise exception 'Usuario sin tenant asignado';
  end if;

  if public.current_rol() <> 'owner' then
    raise exception 'Solo el dueño del negocio puede registrar aportaciones';
  end if;

  if not exists (select 1 from public.tenants where id = v_tenant_id and tipo_tenant = 'cooperativa') then
    raise exception 'Las aportaciones solo aplican a tenants tipo cooperativa';
  end if;

  if not exists (select 1 from public.clientes where id = p_cliente_id and tenant_id = v_tenant_id) then
    raise exception 'El socio no pertenece a este tenant';
  end if;

  if p_tipo not in ('obligatoria', 'extraordinaria', 'reserva', 'retiro') then
    raise exception 'Tipo de aportación inválido: %', p_tipo;
  end if;

  if p_monto <= 0 then
    raise exception 'El monto debe ser mayor a cero';
  end if;

  if p_tipo = 'retiro' then
    select coalesce(sum(case
             when a.tipo in ('obligatoria', 'extraordinaria') then a.monto
             when a.tipo = 'retiro' then -a.monto
             else 0
           end), 0)
      into v_saldo_retirable
      from public.aportaciones a
      where a.cliente_id = p_cliente_id;

    if v_saldo_retirable < p_monto then
      raise exception 'El socio no tiene saldo retirable suficiente para este retiro (retirable: %, la reserva no es retirable)', v_saldo_retirable;
    end if;
  end if;

  insert into public.aportaciones (tenant_id, cliente_id, tipo, monto, fecha, observaciones, registrado_por)
  values (v_tenant_id, p_cliente_id, p_tipo, p_monto, p_fecha, p_observaciones, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

-- saldos_aportaciones: cambia el shape (saldo -> saldo_total/saldo_reserva/saldo_retirable),
-- así que hay que hacer drop antes del create (Postgres no permite cambiar el tipo de
-- retorno con create or replace). Se parte de la versión con el gate de rol de
-- 20260829010000_fix_scope_rpc_seguridad.sql, no de la original sin gate.
drop function public.saldos_aportaciones();

create or replace function public.saldos_aportaciones()
returns table (cliente_id uuid, saldo_total numeric, saldo_reserva numeric, saldo_retirable numeric)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if public.current_rol() not in ('owner', 'auditor') then
    raise exception 'No autorizado';
  end if;

  return query
  select
    a.cliente_id,
    coalesce(sum(case when a.tipo = 'retiro' then -a.monto else a.monto end), 0) as saldo_total,
    coalesce(sum(case when a.tipo = 'reserva' then a.monto else 0 end), 0) as saldo_reserva,
    coalesce(sum(case
               when a.tipo in ('obligatoria', 'extraordinaria') then a.monto
               when a.tipo = 'retiro' then -a.monto
               else 0
             end), 0) as saldo_retirable
  from public.aportaciones a
  where a.tenant_id = public.current_tenant_id()
  group by a.cliente_id;
end;
$$;

comment on function public.saldos_aportaciones is 'Saldo de capital social por socio del tenant, desglosado en total/reserva(no retirable)/retirable. security definer con gate de rol — ver 20260829010000_fix_scope_rpc_seguridad.sql.';

-- El DROP de arriba borra cualquier grant que tuviera la función vieja, y Postgres
-- concede EXECUTE a PUBLIC por defecto en la función nueva — mismo patrón de fuga ya
-- corregido dos veces en este proyecto (devengar_intereses_*, obtener_resumen_notificacion).
-- El chequeo interno de rol ya la protege en la práctica (anon no tiene current_rol()),
-- pero se revoca explícito para no depender solo de eso.
revoke execute on function public.saldos_aportaciones() from public, anon;
grant execute on function public.saldos_aportaciones() to authenticated;
