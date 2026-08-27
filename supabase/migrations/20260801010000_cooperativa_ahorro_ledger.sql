-- CobraYA: expansión del módulo de cooperativas hacia el modelo completo de
-- cooperativa de ahorro y crédito regulada por CONSUCOOP —
--   (1) portal del socio con login propio (roles 'socio' y 'auditor' nuevos),
--   (2) productos de ahorro (a_la_vista/programado/plazo_fijo) + cuentas por socio,
--   (3) ledger "movimientos" auditable — usado SOLO para lo nuevo (ahorro + devengo
--       de interés sobre aportación); préstamos/pagos/aportaciones (capital) NO se
--       tocan — ya están en producción con datos reales y ya son auditables a su modo,
--   (4) fondos de excedente parametrizables (Reserva Legal + los que agregue cada
--       cooperativa, ej. Contribución Social), reemplazando el porcentaje_reserva único,
--   (5) motor de devengo periódico (pg_cron) para interés de ahorro y de aportación.
--
-- Decisiones ya acordadas con el usuario (2026-08-15):
--  - Portal del socio: login propio (nuevo rol), no una vista sin cuenta.
--  - Ledger unificado: solo para ahorro + devengo de aportación, no para préstamos/pagos.
--  - Excedente: se reparte SOLO por interés pagado en préstamos (patrocinio), como ya
--    estaba — no se agrega ahorro a la fórmula todavía.
--  - "Contribución social" no es una regla fiscal fija: es un fondo más, configurable,
--    igual que la Reserva Legal.
--
-- Aplicar en DOS pasos (ver notas al pie del archivo): el ALTER TYPE de rol_usuario no
-- puede usarse en la misma transacción en que se agrega — todo lo demás sí puede ir junto.

-- =============================================================================
-- PASO 1 (aplicar solo, y esperar a que quede confirmado, antes de lo demás)
-- =============================================================================
-- alter type public.rol_usuario add value 'socio';
-- alter type public.rol_usuario add value 'auditor';

-- =============================================================================
-- PASO 2 (todo lo de abajo, en una transacción/llamada separada del paso 1)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Enums nuevos (no chocan con el problema de ALTER TYPE porque son tipos nuevos)
-- ---------------------------------------------------------------------------

create type public.tipo_producto_ahorro as enum ('a_la_vista', 'programado', 'plazo_fijo');
create type public.periodicidad_capitalizacion as enum ('diaria', 'mensual', 'trimestral', 'anual');
create type public.estado_cuenta_ahorro as enum ('activa', 'cerrada', 'vencida');
create type public.tipo_movimiento as enum ('deposito', 'retiro', 'devengo', 'pago', 'ajuste');
create type public.origen_movimiento as enum ('ahorro', 'aportacion');

-- ---------------------------------------------------------------------------
-- clientes: socio con login propio (usuario_id) + campos de membresía
-- ---------------------------------------------------------------------------

alter table public.clientes
  add column usuario_id uuid references public.usuarios (id),
  add column numero_socio text,
  add column fecha_ingreso date not null default current_date;

create unique index uq_clientes_usuario_id on public.clientes (usuario_id) where usuario_id is not null;
create unique index uq_clientes_tenant_numero_socio on public.clientes (tenant_id, numero_socio) where numero_socio is not null;

comment on column public.clientes.usuario_id is 'Si no es null, este cliente/socio tiene su propia cuenta (rol socio) para el portal de autoservicio — ver handle_new_user().';

-- Helper: cliente vinculado al usuario autenticado actual (null si no es un socio con login propio).
create or replace function public.mi_cliente_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.clientes where usuario_id = auth.uid()
$$;

-- ---------------------------------------------------------------------------
-- tenants: parámetros de interés sobre aportaciones (nunca fijo en código)
-- ---------------------------------------------------------------------------

alter table public.tenants
  add column tasa_interes_aportacion numeric(7, 4),
  add column periodicidad_aportacion public.periodicidad_capitalizacion,
  add column fecha_ultima_capitalizacion_aportacion date,
  add column proxima_capitalizacion_aportacion date;

comment on column public.tenants.tasa_interes_aportacion is 'Tasa ANUAL nominal (%) para el interés capitalizable sobre aportaciones. Null = no se devenga interés sobre aportaciones en este tenant.';

-- ---------------------------------------------------------------------------
-- handle_new_user: soporta invitar socio (con cliente_id a vincular) o auditor,
-- y siembra el fondo "Reserva Legal" al crear un tenant tipo cooperativa.
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

-- ---------------------------------------------------------------------------
-- fondo_excedente_config: lista parametrizable de deducciones antes del
-- excedente neto (Reserva Legal obligatoria ≥10%, y las que cada cooperativa
-- agregue: Contribución Social, Educación, Bienestar Social, etc.)
-- ---------------------------------------------------------------------------

create table public.fondo_excedente_config (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null default public.current_tenant_id() references public.tenants (id) on delete cascade,
  nombre            text not null,
  porcentaje        numeric(5, 2) not null check (porcentaje > 0),
  orden             integer not null default 0,
  es_reserva_legal  boolean not null default false,
  activo            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.fondo_excedente_config is 'Fondos que se deducen del ingreso al cerrar un período de excedente, en orden. Exactamente uno debe tener es_reserva_legal=true y porcentaje>=10 (Art. 44, Decreto 65-87 de Honduras) — no se puede borrar ni bajar del mínimo legal.';

create unique index uq_fondo_reserva_legal_por_tenant on public.fondo_excedente_config (tenant_id) where es_reserva_legal;

create trigger trg_fondo_excedente_updated_at
  before update on public.fondo_excedente_config
  for each row execute function public.set_updated_at();

alter table public.fondo_excedente_config enable row level security;

create policy fondo_excedente_owner_all on public.fondo_excedente_config
  for all
  using (tenant_id = public.current_tenant_id() and public.current_rol() = 'owner')
  with check (tenant_id = public.current_tenant_id() and public.current_rol() = 'owner');

create policy fondo_excedente_socio_select on public.fondo_excedente_config
  for select
  using (tenant_id = public.current_tenant_id() and public.mi_cliente_id() is not null and activo);

create policy fondo_excedente_auditor_select on public.fondo_excedente_config
  for select
  using (tenant_id = public.current_tenant_id() and public.current_rol() = 'auditor');

grant select, insert, update, delete on public.fondo_excedente_config to authenticated;

create or replace function public.crear_fondo_excedente(p_nombre text, p_porcentaje numeric, p_orden integer default 0)
returns uuid
language plpgsql
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_id uuid;
begin
  if public.current_rol() <> 'owner' then
    raise exception 'Solo el dueño del negocio puede configurar fondos de excedente';
  end if;
  if p_porcentaje <= 0 then
    raise exception 'El porcentaje debe ser mayor a cero';
  end if;
  insert into public.fondo_excedente_config (tenant_id, nombre, porcentaje, orden)
  values (v_tenant_id, p_nombre, p_porcentaje, p_orden)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.actualizar_fondo_excedente(p_id uuid, p_nombre text, p_porcentaje numeric, p_orden integer, p_activo boolean)
returns void
language plpgsql
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_es_reserva boolean;
begin
  if public.current_rol() <> 'owner' then
    raise exception 'Solo el dueño del negocio puede configurar fondos de excedente';
  end if;

  select es_reserva_legal into v_es_reserva
  from public.fondo_excedente_config where id = p_id and tenant_id = v_tenant_id;

  if not found then
    raise exception 'Fondo no encontrado';
  end if;

  if v_es_reserva and p_porcentaje < 10 then
    raise exception 'La Reserva Legal no puede ser menor al 10%% (Art. 44, Decreto 65-87)';
  end if;
  if v_es_reserva and not p_activo then
    raise exception 'La Reserva Legal no se puede desactivar';
  end if;

  update public.fondo_excedente_config
  set nombre = p_nombre, porcentaje = p_porcentaje, orden = p_orden, activo = p_activo
  where id = p_id and tenant_id = v_tenant_id;
end;
$$;

create or replace function public.eliminar_fondo_excedente(p_id uuid)
returns void
language plpgsql
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_es_reserva boolean;
begin
  if public.current_rol() <> 'owner' then
    raise exception 'Solo el dueño del negocio puede configurar fondos de excedente';
  end if;

  select es_reserva_legal into v_es_reserva
  from public.fondo_excedente_config where id = p_id and tenant_id = v_tenant_id;

  if v_es_reserva then
    raise exception 'La Reserva Legal no se puede eliminar';
  end if;

  delete from public.fondo_excedente_config where id = p_id and tenant_id = v_tenant_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- producto_ahorro / cuentas_ahorro
-- ---------------------------------------------------------------------------

create table public.producto_ahorro (
  id                          uuid primary key default gen_random_uuid(),
  tenant_id                   uuid not null default public.current_tenant_id() references public.tenants (id) on delete cascade,
  nombre                      text not null,
  tipo                        public.tipo_producto_ahorro not null,
  tasa_pasiva                 numeric(7, 4) not null check (tasa_pasiva >= 0),
  periodicidad_capitalizacion public.periodicidad_capitalizacion not null,
  permite_retiro_libre        boolean not null default true,
  penalidad_retiro_anticipado numeric(5, 2),
  plazo_dias                  integer,
  monto_meta                  numeric(14, 2),
  activo                      boolean not null default true,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  constraint chk_producto_plazo check (tipo <> 'plazo_fijo' or plazo_dias > 0),
  constraint chk_producto_meta check (tipo <> 'programado' or monto_meta is null or monto_meta > 0)
);

comment on column public.producto_ahorro.tasa_pasiva is 'Tasa ANUAL nominal (%) que paga la cooperativa por este producto. El devengo la prorratea a los días reales entre capitalizaciones.';

create trigger trg_producto_ahorro_updated_at
  before update on public.producto_ahorro
  for each row execute function public.set_updated_at();

alter table public.producto_ahorro enable row level security;

create policy producto_ahorro_owner_all on public.producto_ahorro
  for all
  using (tenant_id = public.current_tenant_id() and public.current_rol() = 'owner')
  with check (tenant_id = public.current_tenant_id() and public.current_rol() = 'owner');

create policy producto_ahorro_select_todos on public.producto_ahorro
  for select
  using (tenant_id = public.current_tenant_id() and (public.mi_cliente_id() is not null or public.current_rol() = 'auditor'));

grant select, insert, update, delete on public.producto_ahorro to authenticated;

create table public.cuentas_ahorro (
  id                        uuid primary key default gen_random_uuid(),
  tenant_id                 uuid not null default public.current_tenant_id() references public.tenants (id) on delete cascade,
  cliente_id                uuid not null references public.clientes (id) on delete cascade,
  producto_id               uuid not null references public.producto_ahorro (id),
  numero_cuenta             text not null,
  saldo                     numeric(14, 2) not null default 0,
  fecha_apertura            date not null default current_date,
  fecha_vencimiento         date,
  fecha_ultima_capitalizacion date,
  proxima_capitalizacion    date,
  estado                    public.estado_cuenta_ahorro not null default 'activa',
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  constraint uq_cuentas_ahorro_tenant_numero unique (tenant_id, numero_cuenta)
);

create index idx_cuentas_ahorro_tenant on public.cuentas_ahorro (tenant_id);
create index idx_cuentas_ahorro_cliente on public.cuentas_ahorro (cliente_id);
create index idx_cuentas_ahorro_proxima_cap on public.cuentas_ahorro (proxima_capitalizacion) where estado = 'activa';

create trigger trg_cuentas_ahorro_updated_at
  before update on public.cuentas_ahorro
  for each row execute function public.set_updated_at();

alter table public.cuentas_ahorro enable row level security;

create policy cuentas_ahorro_owner_all on public.cuentas_ahorro
  for all
  using (tenant_id = public.current_tenant_id() and public.current_rol() = 'owner')
  with check (tenant_id = public.current_tenant_id() and public.current_rol() = 'owner');

create policy cuentas_ahorro_socio_select on public.cuentas_ahorro
  for select
  using (cliente_id = public.mi_cliente_id());

create policy cuentas_ahorro_auditor_select on public.cuentas_ahorro
  for select
  using (tenant_id = public.current_tenant_id() and public.current_rol() = 'auditor');

grant select, insert, update, delete on public.cuentas_ahorro to authenticated;

-- ---------------------------------------------------------------------------
-- movimientos: ledger auditable — SOLO para ahorro y devengo de aportación
-- (préstamos/pagos/aportaciones de capital siguen en sus tablas existentes).
-- ---------------------------------------------------------------------------

create table public.movimientos (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null default public.current_tenant_id() references public.tenants (id) on delete cascade,
  cliente_id       uuid not null references public.clientes (id) on delete cascade,
  origen           public.origen_movimiento not null,
  tipo             public.tipo_movimiento not null,
  cuenta_ahorro_id uuid references public.cuentas_ahorro (id) on delete cascade,
  monto            numeric(14, 2) not null,
  saldo_resultante numeric(14, 2) not null,
  fecha            date not null default current_date,
  descripcion      text,
  registrado_por   uuid references public.usuarios (id),
  created_at       timestamptz not null default now(),
  constraint chk_movimientos_cuenta_ahorro check (origen <> 'ahorro' or cuenta_ahorro_id is not null)
);

comment on table public.movimientos is 'Asiento auditable e inmutable (nunca se actualiza ni se borra) para depósitos/retiros/devengos de ahorro y devengo de interés sobre aportación. saldo_resultante es el snapshot del saldo justo después de este movimiento.';
comment on column public.movimientos.monto is 'Signo: positivo = entra (depósito, devengo), negativo = sale (retiro, ajuste a la baja).';

create index idx_movimientos_tenant on public.movimientos (tenant_id);
create index idx_movimientos_cliente on public.movimientos (cliente_id);
create index idx_movimientos_cuenta_ahorro on public.movimientos (cuenta_ahorro_id);

alter table public.movimientos enable row level security;

-- Sin policy de insert/update/delete directa para 'owner' a propósito: los movimientos
-- solo los crean las RPC (registrar_movimiento_ahorro, devengar_intereses_*), nunca un
-- insert manual desde el cliente — así se garantiza que siempre queden bien formados
-- (saldo_resultante correcto, saldo de la cuenta actualizado en la misma transacción).
create policy movimientos_owner_select on public.movimientos
  for select
  using (tenant_id = public.current_tenant_id() and public.current_rol() = 'owner');

create policy movimientos_socio_select on public.movimientos
  for select
  using (cliente_id = public.mi_cliente_id());

create policy movimientos_auditor_select on public.movimientos
  for select
  using (tenant_id = public.current_tenant_id() and public.current_rol() = 'auditor');

grant select on public.movimientos to authenticated;

-- ---------------------------------------------------------------------------
-- RPCs de ahorro
-- ---------------------------------------------------------------------------

create or replace function public.crear_producto_ahorro(
  p_nombre text,
  p_tipo public.tipo_producto_ahorro,
  p_tasa_pasiva numeric,
  p_periodicidad public.periodicidad_capitalizacion,
  p_permite_retiro_libre boolean default true,
  p_penalidad_retiro_anticipado numeric default null,
  p_plazo_dias integer default null,
  p_monto_meta numeric default null
)
returns uuid
language plpgsql
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_id uuid;
begin
  if public.current_rol() <> 'owner' then
    raise exception 'Solo el dueño del negocio puede crear productos de ahorro';
  end if;
  if not exists (select 1 from public.tenants where id = v_tenant_id and tipo_tenant = 'cooperativa') then
    raise exception 'Los productos de ahorro solo aplican a tenants tipo cooperativa';
  end if;

  insert into public.producto_ahorro (
    tenant_id, nombre, tipo, tasa_pasiva, periodicidad_capitalizacion,
    permite_retiro_libre, penalidad_retiro_anticipado, plazo_dias, monto_meta
  ) values (
    v_tenant_id, p_nombre, p_tipo, p_tasa_pasiva, p_periodicidad,
    p_permite_retiro_libre, p_penalidad_retiro_anticipado, p_plazo_dias, p_monto_meta
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.actualizar_producto_ahorro(
  p_id uuid,
  p_nombre text,
  p_tasa_pasiva numeric,
  p_permite_retiro_libre boolean,
  p_penalidad_retiro_anticipado numeric,
  p_activo boolean
)
returns void
language plpgsql
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
begin
  if public.current_rol() <> 'owner' then
    raise exception 'Solo el dueño del negocio puede editar productos de ahorro';
  end if;

  update public.producto_ahorro
  set nombre = p_nombre, tasa_pasiva = p_tasa_pasiva, permite_retiro_libre = p_permite_retiro_libre,
      penalidad_retiro_anticipado = p_penalidad_retiro_anticipado, activo = p_activo
  where id = p_id and tenant_id = v_tenant_id;

  if not found then
    raise exception 'Producto de ahorro no encontrado';
  end if;
end;
$$;

create or replace function public.siguiente_capitalizacion(p_desde date, p_periodicidad public.periodicidad_capitalizacion)
returns date
language sql
immutable
as $$
  select case p_periodicidad
    when 'diaria' then p_desde + interval '1 day'
    when 'mensual' then p_desde + interval '1 month'
    when 'trimestral' then p_desde + interval '3 months'
    when 'anual' then p_desde + interval '1 year'
  end::date
$$;

create or replace function public.abrir_cuenta_ahorro(
  p_cliente_id uuid,
  p_producto_id uuid,
  p_monto_inicial numeric default 0,
  p_fecha_apertura date default current_date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_cuenta_id uuid;
  v_producto public.producto_ahorro%rowtype;
  v_numero text;
begin
  if public.current_rol() <> 'owner' then
    raise exception 'Solo el dueño del negocio puede abrir cuentas de ahorro';
  end if;

  if not exists (select 1 from public.clientes where id = p_cliente_id and tenant_id = v_tenant_id) then
    raise exception 'El socio no pertenece a este tenant';
  end if;

  select * into v_producto from public.producto_ahorro where id = p_producto_id and tenant_id = v_tenant_id and activo;
  if not found then
    raise exception 'Producto de ahorro no encontrado o inactivo';
  end if;

  if p_monto_inicial < 0 then
    raise exception 'El monto inicial no puede ser negativo';
  end if;

  v_numero := to_char(p_fecha_apertura, 'YYYYMMDD') || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);

  insert into public.cuentas_ahorro (
    tenant_id, cliente_id, producto_id, numero_cuenta, saldo, fecha_apertura,
    fecha_vencimiento, fecha_ultima_capitalizacion, proxima_capitalizacion
  ) values (
    v_tenant_id, p_cliente_id, p_producto_id, v_numero, p_monto_inicial, p_fecha_apertura,
    case when v_producto.tipo = 'plazo_fijo' then p_fecha_apertura + (v_producto.plazo_dias || ' days')::interval else null end,
    p_fecha_apertura,
    public.siguiente_capitalizacion(p_fecha_apertura, v_producto.periodicidad_capitalizacion)
  )
  returning id into v_cuenta_id;

  if p_monto_inicial > 0 then
    insert into public.movimientos (tenant_id, cliente_id, origen, tipo, cuenta_ahorro_id, monto, saldo_resultante, fecha, descripcion, registrado_por)
    values (v_tenant_id, p_cliente_id, 'ahorro', 'deposito', v_cuenta_id, p_monto_inicial, p_monto_inicial, p_fecha_apertura, 'Depósito de apertura', auth.uid());
  end if;

  return v_cuenta_id;
end;
$$;

create or replace function public.registrar_movimiento_ahorro(
  p_cuenta_id uuid,
  p_tipo public.tipo_movimiento,
  p_monto numeric,
  p_descripcion text default null,
  p_fecha date default current_date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_cuenta public.cuentas_ahorro%rowtype;
  v_producto public.producto_ahorro%rowtype;
  v_monto_firmado numeric;
  v_nuevo_saldo numeric;
  v_movimiento_id uuid;
begin
  if public.current_rol() <> 'owner' then
    raise exception 'Solo el dueño del negocio puede registrar movimientos de ahorro';
  end if;

  if p_tipo not in ('deposito', 'retiro', 'ajuste') then
    raise exception 'Tipo de movimiento inválido para registro manual: %', p_tipo;
  end if;

  select * into v_cuenta from public.cuentas_ahorro where id = p_cuenta_id and tenant_id = v_tenant_id for update;
  if not found then
    raise exception 'Cuenta de ahorro no encontrada';
  end if;
  if v_cuenta.estado <> 'activa' then
    raise exception 'La cuenta no está activa';
  end if;

  select * into v_producto from public.producto_ahorro where id = v_cuenta.producto_id;

  if p_tipo = 'retiro' and not v_producto.permite_retiro_libre and v_producto.tipo = 'plazo_fijo'
     and current_date < v_cuenta.fecha_vencimiento then
    raise exception 'Este producto no permite retiro anticipado (vence el %)', v_cuenta.fecha_vencimiento;
  end if;

  v_monto_firmado := case when p_tipo = 'retiro' then -abs(p_monto) else abs(p_monto) end;
  v_nuevo_saldo := v_cuenta.saldo + v_monto_firmado;

  if v_nuevo_saldo < 0 then
    raise exception 'Saldo insuficiente (saldo actual: %)', v_cuenta.saldo;
  end if;

  update public.cuentas_ahorro set saldo = v_nuevo_saldo where id = p_cuenta_id;

  insert into public.movimientos (tenant_id, cliente_id, origen, tipo, cuenta_ahorro_id, monto, saldo_resultante, fecha, descripcion, registrado_por)
  values (v_tenant_id, v_cuenta.cliente_id, 'ahorro', p_tipo, p_cuenta_id, v_monto_firmado, v_nuevo_saldo, p_fecha, p_descripcion, auth.uid())
  returning id into v_movimiento_id;

  return v_movimiento_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Motor de devengo periódico — pg_cron diario, procesa solo las cuentas/tenants
-- cuya próxima_capitalizacion ya llegó. Interés = saldo * tasa_anual/100 *
-- (días_reales_transcurridos/365) — así la periodicidad (diaria/mensual/trimestral/
-- anual) queda puramente en CUÁNDO se postea, no en una tabla de "días por período"
-- fija en código.
-- ---------------------------------------------------------------------------

create or replace function public.devengar_intereses_ahorro()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cuenta record;
  v_dias integer;
  v_interes numeric;
  v_nuevo_saldo numeric;
  v_procesadas integer := 0;
begin
  for v_cuenta in
    select ca.*, p.tasa_pasiva, p.periodicidad_capitalizacion
    from public.cuentas_ahorro ca
    join public.producto_ahorro p on p.id = ca.producto_id
    where ca.estado = 'activa'
      and ca.proxima_capitalizacion is not null
      and ca.proxima_capitalizacion <= current_date
    for update of ca
  loop
    v_dias := v_cuenta.proxima_capitalizacion - coalesce(v_cuenta.fecha_ultima_capitalizacion, v_cuenta.fecha_apertura);
    v_interes := round(v_cuenta.saldo * (v_cuenta.tasa_pasiva / 100) * (v_dias / 365.0), 2);

    if v_interes > 0 then
      v_nuevo_saldo := v_cuenta.saldo + v_interes;

      update public.cuentas_ahorro
      set saldo = v_nuevo_saldo,
          fecha_ultima_capitalizacion = v_cuenta.proxima_capitalizacion,
          proxima_capitalizacion = public.siguiente_capitalizacion(v_cuenta.proxima_capitalizacion, v_cuenta.periodicidad_capitalizacion)
      where id = v_cuenta.id;

      insert into public.movimientos (tenant_id, cliente_id, origen, tipo, cuenta_ahorro_id, monto, saldo_resultante, fecha, descripcion)
      values (v_cuenta.tenant_id, v_cuenta.cliente_id, 'ahorro', 'devengo', v_cuenta.id, v_interes, v_nuevo_saldo, v_cuenta.proxima_capitalizacion,
              format('Interés devengado (%s%% anual, %s días)', v_cuenta.tasa_pasiva, v_dias));
    else
      update public.cuentas_ahorro
      set fecha_ultima_capitalizacion = v_cuenta.proxima_capitalizacion,
          proxima_capitalizacion = public.siguiente_capitalizacion(v_cuenta.proxima_capitalizacion, v_cuenta.periodicidad_capitalizacion)
      where id = v_cuenta.id;
    end if;

    v_procesadas := v_procesadas + 1;
  end loop;

  return v_procesadas;
end;
$$;

comment on function public.devengar_intereses_ahorro is 'Invocada por pg_cron diario. No expuesta a authenticated — corre con los privilegios propios de la función (security definer), sin RLS de por medio.';

-- Postgres otorga EXECUTE a PUBLIC por defecto en funciones nuevas — sin este revoke,
-- cualquier usuario autenticado (incluso un socio) podría llamar esta función
-- directamente y forzar el devengo de TODOS los tenants de la plataforma antes de
-- tiempo, ya que no tiene ningún chequeo de caller (procesa todo el sistema, no está
-- acotada a current_tenant_id()). Solo pg_cron (que ejecuta como el rol dueño del job,
-- con privilegios de servidor) debe poder invocarla.
revoke execute on function public.devengar_intereses_ahorro() from public, authenticated, anon;

create or replace function public.devengar_intereses_aportacion()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant record;
  v_socio record;
  v_saldo_capital numeric;
  v_dias integer;
  v_interes numeric;
  v_acumulado_previo numeric;
  v_procesadas integer := 0;
begin
  for v_tenant in
    select * from public.tenants
    where tipo_tenant = 'cooperativa'
      and tasa_interes_aportacion is not null
      and tasa_interes_aportacion > 0
      and proxima_capitalizacion_aportacion is not null
      and proxima_capitalizacion_aportacion <= current_date
  loop
    v_dias := v_tenant.proxima_capitalizacion_aportacion - coalesce(v_tenant.fecha_ultima_capitalizacion_aportacion, v_tenant.fecha_inicio);

    for v_socio in
      select cliente_id, coalesce(sum(case when tipo = 'retiro' then -monto else monto end), 0) as saldo
      from public.aportaciones
      where tenant_id = v_tenant.id
      group by cliente_id
      having coalesce(sum(case when tipo = 'retiro' then -monto else monto end), 0) > 0
    loop
      v_interes := round(v_socio.saldo * (v_tenant.tasa_interes_aportacion / 100) * (v_dias / 365.0), 2);
      if v_interes > 0 then
        select coalesce(sum(monto), 0) into v_acumulado_previo
        from public.movimientos
        where origen = 'aportacion' and cliente_id = v_socio.cliente_id;

        insert into public.movimientos (tenant_id, cliente_id, origen, tipo, monto, saldo_resultante, fecha, descripcion)
        values (v_tenant.id, v_socio.cliente_id, 'aportacion', 'devengo', v_interes, v_acumulado_previo + v_interes,
                v_tenant.proxima_capitalizacion_aportacion,
                format('Interés sobre aportación (%s%% anual, %s días)', v_tenant.tasa_interes_aportacion, v_dias));
      end if;
    end loop;

    update public.tenants
    set fecha_ultima_capitalizacion_aportacion = proxima_capitalizacion_aportacion,
        proxima_capitalizacion_aportacion = public.siguiente_capitalizacion(proxima_capitalizacion_aportacion, periodicidad_aportacion)
    where id = v_tenant.id;

    v_procesadas := v_procesadas + 1;
  end loop;

  return v_procesadas;
end;
$$;

comment on function public.devengar_intereses_aportacion is 'Interés capitalizable sobre aportaciones: se acumula en movimientos (origen=aportacion), NUNCA se mezcla con la tabla aportaciones (esa tabla es solo capital — obligatoria/extraordinaria/retiro). saldo_resultante es el acumulado de interés a la fecha, no el capital+interés.';

revoke execute on function public.devengar_intereses_aportacion() from public, authenticated, anon;

create or replace function public.configurar_interes_aportacion(
  p_tasa_anual numeric,
  p_periodicidad public.periodicidad_capitalizacion
)
returns void
language plpgsql
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
begin
  if public.current_rol() <> 'owner' then
    raise exception 'Solo el dueño del negocio puede configurar el interés sobre aportaciones';
  end if;
  if not exists (select 1 from public.tenants where id = v_tenant_id and tipo_tenant = 'cooperativa') then
    raise exception 'Solo aplica a tenants tipo cooperativa';
  end if;

  update public.tenants
  set tasa_interes_aportacion = nullif(p_tasa_anual, 0),
      periodicidad_aportacion = p_periodicidad,
      proxima_capitalizacion_aportacion = case
        when p_tasa_anual > 0 then public.siguiente_capitalizacion(current_date, p_periodicidad)
        else null
      end,
      fecha_ultima_capitalizacion_aportacion = case when p_tasa_anual > 0 then current_date else null end
  where id = v_tenant_id;
end;
$$;

-- Interés acumulado sobre aportaciones de cada socio (capital sigue siendo saldos_aportaciones()).
create or replace function public.interes_acumulado_aportaciones()
returns table (cliente_id uuid, interes_acumulado numeric)
language sql
security definer
set search_path = public
as $$
  select m.cliente_id, coalesce(sum(m.monto), 0)
  from public.movimientos m
  where m.tenant_id = public.current_tenant_id() and m.origen = 'aportacion'
  group by m.cliente_id;
$$;

select cron.schedule(
  'cobraya-devengo-ahorro',
  '30 6 * * *', -- 00:30 Honduras (UTC-6)
  $$select public.devengar_intereses_ahorro();$$
);

select cron.schedule(
  'cobraya-devengo-aportacion',
  '35 6 * * *',
  $$select public.devengar_intereses_aportacion();$$
);

-- ---------------------------------------------------------------------------
-- excedentes_periodo: reemplazar porcentaje_reserva único por fondos configurables
-- ---------------------------------------------------------------------------

alter table public.excedentes_periodo rename column excedente_distribuible to excedente_neto;
alter table public.excedentes_periodo drop column porcentaje_reserva;
alter table public.excedentes_periodo drop column monto_reserva;

create table public.excedentes_periodo_fondos (
  id                    uuid primary key default gen_random_uuid(),
  excedente_periodo_id  uuid not null references public.excedentes_periodo (id) on delete cascade,
  nombre                text not null,
  porcentaje            numeric(5, 2) not null,
  monto                 numeric(14, 2) not null
);

comment on table public.excedentes_periodo_fondos is 'Snapshot inmutable de los fondos aplicados en un cierre — no referencia fondo_excedente_config en vivo, porque la config puede cambiar después sin alterar cierres ya hechos.';

create index idx_excedentes_periodo_fondos on public.excedentes_periodo_fondos (excedente_periodo_id);

alter table public.excedentes_periodo_fondos enable row level security;

create policy excedentes_periodo_fondos_owner_all on public.excedentes_periodo_fondos
  for all
  using (exists (select 1 from public.excedentes_periodo ep where ep.id = excedente_periodo_id and ep.tenant_id = public.current_tenant_id() and public.current_rol() = 'owner'))
  with check (exists (select 1 from public.excedentes_periodo ep where ep.id = excedente_periodo_id and ep.tenant_id = public.current_tenant_id() and public.current_rol() = 'owner'));

create policy excedentes_periodo_fondos_select_todos on public.excedentes_periodo_fondos
  for select
  using (exists (
    select 1 from public.excedentes_periodo ep
    where ep.id = excedente_periodo_id
      and ep.tenant_id = public.current_tenant_id()
      and (public.mi_cliente_id() is not null or public.current_rol() = 'auditor')
  ));

grant select, insert, update, delete on public.excedentes_periodo_fondos to authenticated;

-- previsualizar_excedente / calcular_y_guardar_excedente: ya no reciben porcentaje de
-- reserva — leen los fondos activos configurados por la cooperativa (fondo_excedente_config).
drop function public.previsualizar_excedente(date, date, numeric);
drop function public.calcular_y_guardar_excedente(date, date, numeric);

create or replace function public.previsualizar_excedente(p_fecha_desde date, p_fecha_hasta date)
returns table (
  cliente_id       uuid,
  nombre           text,
  apellido         text,
  interes_pagado   numeric,
  proporcion       numeric,
  monto_excedente  numeric
)
language plpgsql
as $$
declare
  v_tenant_id       uuid := public.current_tenant_id();
  v_ingresos        numeric;
  v_total_fondos    numeric;
  v_distribuible    numeric;
  v_total_intereses numeric;
begin
  if v_tenant_id is null then
    raise exception 'Usuario sin tenant asignado';
  end if;
  if public.current_rol() <> 'owner' then
    raise exception 'Solo el dueño del negocio puede calcular excedentes';
  end if;
  if not exists (select 1 from public.tenants where id = v_tenant_id and tipo_tenant = 'cooperativa') then
    raise exception 'El cálculo de excedentes solo aplica a tenants tipo cooperativa';
  end if;
  if p_fecha_hasta < p_fecha_desde then
    raise exception 'El rango de fechas es inválido';
  end if;
  if not exists (select 1 from public.fondo_excedente_config where tenant_id = v_tenant_id and es_reserva_legal and activo) then
    raise exception 'No hay un fondo de Reserva Legal configurado y activo — configúralo antes de calcular el excedente';
  end if;

  drop table if exists tmp_interes_socio;
  create temporary table tmp_interes_socio on commit drop as
  select
    pr.cliente_id,
    sum(
      case
        when p.cuota_id is not null and c.monto > 0 then p.monto * (coalesce(c.interes, 0) / c.monto)
        when p.multa_id is not null or p.gasto_administrativo_id is not null then p.monto
        else 0
      end
    ) as interes
  from public.pagos p
  left join public.cuotas c on c.id = p.cuota_id
  left join public.multas m on m.id = p.multa_id
  left join public.gastos_administrativos g on g.id = p.gasto_administrativo_id
  join public.prestamos pr on pr.id = coalesce(c.prestamo_id, m.prestamo_id, g.prestamo_id)
  where p.tenant_id = v_tenant_id
    and p.fecha_pago between p_fecha_desde and p_fecha_hasta
  group by pr.cliente_id;

  select coalesce(sum(t.interes), 0) into v_ingresos from tmp_interes_socio t;
  v_total_intereses := v_ingresos;

  select coalesce(sum(round(v_ingresos * f.porcentaje / 100, 2)), 0) into v_total_fondos
  from public.fondo_excedente_config f
  where f.tenant_id = v_tenant_id and f.activo;

  v_distribuible := v_ingresos - v_total_fondos;

  return query
  select
    t.cliente_id,
    cl.nombre,
    cl.apellido,
    t.interes,
    case when v_total_intereses > 0 then t.interes / v_total_intereses else 0 end,
    case when v_total_intereses > 0 then round(v_distribuible * (t.interes / v_total_intereses), 2) else 0 end
  from tmp_interes_socio t
  join public.clientes cl on cl.id = t.cliente_id
  where t.interes > 0
  order by t.interes desc;
end;
$$;

create or replace function public.calcular_y_guardar_excedente(p_fecha_desde date, p_fecha_hasta date)
returns uuid
language plpgsql
as $$
declare
  v_tenant_id     uuid := public.current_tenant_id();
  v_periodo_id    uuid;
  v_ingresos      numeric := 0;
  v_total_fondos  numeric := 0;
  v_distribuible  numeric;
begin
  if v_tenant_id is null then
    raise exception 'Usuario sin tenant asignado';
  end if;
  if public.current_rol() <> 'owner' then
    raise exception 'Solo el dueño del negocio puede confirmar el reparto de excedentes';
  end if;
  if exists (select 1 from public.excedentes_periodo where tenant_id = v_tenant_id and fecha_desde = p_fecha_desde and fecha_hasta = p_fecha_hasta) then
    raise exception 'Ya existe un cierre de excedente guardado para ese período';
  end if;

  select coalesce(sum(d.interes_pagado), 0) into v_ingresos
  from public.previsualizar_excedente(p_fecha_desde, p_fecha_hasta) d;

  select coalesce(sum(round(v_ingresos * f.porcentaje / 100, 2)), 0) into v_total_fondos
  from public.fondo_excedente_config f
  where f.tenant_id = v_tenant_id and f.activo;

  v_distribuible := v_ingresos - v_total_fondos;

  insert into public.excedentes_periodo (tenant_id, fecha_desde, fecha_hasta, ingresos_totales, excedente_neto, creado_por)
  values (v_tenant_id, p_fecha_desde, p_fecha_hasta, v_ingresos, v_distribuible, auth.uid())
  returning id into v_periodo_id;

  insert into public.excedentes_periodo_fondos (excedente_periodo_id, nombre, porcentaje, monto)
  select v_periodo_id, f.nombre, f.porcentaje, round(v_ingresos * f.porcentaje / 100, 2)
  from public.fondo_excedente_config f
  where f.tenant_id = v_tenant_id and f.activo;

  insert into public.excedentes_detalle (excedente_periodo_id, cliente_id, interes_pagado, proporcion, monto_excedente)
  select v_periodo_id, d.cliente_id, d.interes_pagado, d.proporcion, d.monto_excedente
  from public.previsualizar_excedente(p_fecha_desde, p_fecha_hasta) d;

  return v_periodo_id;
end;
$$;

-- previsualizar_excedente() exige rol owner — el socio necesita su propia versión de
-- solo-lectura que no choque con ese chequeo (mismo cálculo, sin el gate de owner).
create or replace function public.previsualizar_excedente_socio(p_fecha_desde date, p_fecha_hasta date)
returns table (
  cliente_id       uuid,
  interes_pagado   numeric,
  proporcion       numeric,
  monto_excedente  numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id       uuid := public.current_tenant_id();
  v_ingresos        numeric;
  v_total_fondos    numeric;
  v_distribuible    numeric;
begin
  if v_tenant_id is null or public.mi_cliente_id() is null then
    raise exception 'No autorizado';
  end if;

  drop table if exists tmp_interes_socio_ro;
  create temporary table tmp_interes_socio_ro on commit drop as
  select
    pr.cliente_id,
    sum(
      case
        when p.cuota_id is not null and c.monto > 0 then p.monto * (coalesce(c.interes, 0) / c.monto)
        when p.multa_id is not null or p.gasto_administrativo_id is not null then p.monto
        else 0
      end
    ) as interes
  from public.pagos p
  left join public.cuotas c on c.id = p.cuota_id
  left join public.multas m on m.id = p.multa_id
  left join public.gastos_administrativos g on g.id = p.gasto_administrativo_id
  join public.prestamos pr on pr.id = coalesce(c.prestamo_id, m.prestamo_id, g.prestamo_id)
  where p.tenant_id = v_tenant_id
    and p.fecha_pago between p_fecha_desde and p_fecha_hasta
  group by pr.cliente_id;

  select coalesce(sum(t.interes), 0) into v_ingresos from tmp_interes_socio_ro t;

  select coalesce(sum(round(v_ingresos * f.porcentaje / 100, 2)), 0) into v_total_fondos
  from public.fondo_excedente_config f
  where f.tenant_id = v_tenant_id and f.activo;

  v_distribuible := v_ingresos - v_total_fondos;

  return query
  select t.cliente_id, t.interes,
    case when v_ingresos > 0 then t.interes / v_ingresos else 0 end,
    case when v_ingresos > 0 then round(v_distribuible * (t.interes / v_ingresos), 2) else 0 end
  from tmp_interes_socio_ro t;
end;
$$;

-- excedente estimado del ejercicio en curso, para el socio (siempre marcado "provisional"
-- en el frontend — esta función no persiste nada, solo reutiliza previsualizar_excedente_socio
-- pero acotado a la fila del socio que llama).
create or replace function public.mi_excedente_estimado(p_fecha_desde date, p_fecha_hasta date)
returns table (interes_pagado numeric, proporcion numeric, monto_excedente numeric)
language sql
security definer
set search_path = public
as $$
  select d.interes_pagado, d.proporcion, d.monto_excedente
  from public.previsualizar_excedente_socio(p_fecha_desde, p_fecha_hasta) d
  where d.cliente_id = public.mi_cliente_id();
$$;

-- ---------------------------------------------------------------------------
-- RLS del portal del socio sobre lo que YA existía (préstamos, cuotas, pagos,
-- multas, gastos administrativos, aportaciones, excedentes) — y policies de
-- auditor (solo lectura, todo el tenant) sobre lo mismo.
-- ---------------------------------------------------------------------------

create policy prestamos_socio_select on public.prestamos for select using (cliente_id = public.mi_cliente_id());
create policy prestamos_auditor_select on public.prestamos for select using (tenant_id = public.current_tenant_id() and public.current_rol() = 'auditor');

create policy cuotas_socio_select on public.cuotas for select using (
  exists (select 1 from public.prestamos p where p.id = cuotas.prestamo_id and p.cliente_id = public.mi_cliente_id())
);
create policy cuotas_auditor_select on public.cuotas for select using (tenant_id = public.current_tenant_id() and public.current_rol() = 'auditor');

create policy pagos_socio_select on public.pagos for select using (
  exists (
    select 1 from public.cuotas c join public.prestamos p on p.id = c.prestamo_id
    where c.id = pagos.cuota_id and p.cliente_id = public.mi_cliente_id()
  )
  or exists (
    select 1 from public.multas m join public.prestamos p on p.id = m.prestamo_id
    where m.id = pagos.multa_id and p.cliente_id = public.mi_cliente_id()
  )
  or exists (
    select 1 from public.gastos_administrativos g join public.prestamos p on p.id = g.prestamo_id
    where g.id = pagos.gasto_administrativo_id and p.cliente_id = public.mi_cliente_id()
  )
);
create policy pagos_auditor_select on public.pagos for select using (tenant_id = public.current_tenant_id() and public.current_rol() = 'auditor');

create policy multas_socio_select on public.multas for select using (
  exists (select 1 from public.prestamos p where p.id = multas.prestamo_id and p.cliente_id = public.mi_cliente_id())
);
create policy multas_auditor_select on public.multas for select using (tenant_id = public.current_tenant_id() and public.current_rol() = 'auditor');

create policy gastos_admin_socio_select on public.gastos_administrativos for select using (
  exists (select 1 from public.prestamos p where p.id = gastos_administrativos.prestamo_id and p.cliente_id = public.mi_cliente_id())
);
create policy gastos_admin_auditor_select on public.gastos_administrativos for select using (tenant_id = public.current_tenant_id() and public.current_rol() = 'auditor');

create policy aportaciones_socio_select on public.aportaciones for select using (cliente_id = public.mi_cliente_id());
create policy aportaciones_auditor_select on public.aportaciones for select using (tenant_id = public.current_tenant_id() and public.current_rol() = 'auditor');

create policy excedentes_periodo_socio_select on public.excedentes_periodo for select using (tenant_id = public.current_tenant_id() and public.mi_cliente_id() is not null);
create policy excedentes_periodo_auditor_select on public.excedentes_periodo for select using (tenant_id = public.current_tenant_id() and public.current_rol() = 'auditor');

create policy excedentes_detalle_socio_select on public.excedentes_detalle for select using (cliente_id = public.mi_cliente_id());
create policy excedentes_detalle_auditor_select on public.excedentes_detalle for select using (
  exists (select 1 from public.excedentes_periodo ep where ep.id = excedentes_detalle.excedente_periodo_id and ep.tenant_id = public.current_tenant_id() and public.current_rol() = 'auditor')
);

create policy clientes_socio_select_propio on public.clientes for select using (usuario_id = auth.uid());
create policy clientes_auditor_select on public.clientes for select using (tenant_id = public.current_tenant_id() and public.current_rol() = 'auditor');

-- ---------------------------------------------------------------------------
-- mi_perfil_socio(): lo primero que carga el portal del socio (dashboard)
-- ---------------------------------------------------------------------------

create or replace function public.mi_perfil_socio()
returns table (
  cliente_id      uuid,
  nombre          text,
  apellido        text,
  documento       text,
  numero_socio    text,
  fecha_ingreso   date,
  tenant_nombre   text,
  saldo_aportaciones numeric
)
language sql
security definer
set search_path = public
as $$
  select
    c.id, c.nombre, c.apellido, c.documento, c.numero_socio, c.fecha_ingreso, t.nombre,
    coalesce((
      select sum(case when a.tipo = 'retiro' then -a.monto else a.monto end)
      from public.aportaciones a where a.cliente_id = c.id
    ), 0)
  from public.clientes c
  join public.tenants t on t.id = c.tenant_id
  where c.usuario_id = auth.uid();
$$;

-- Nota sobre "socio" en mi_tenant_estado(): un socio NO es un owner, así que
-- current_tenant_id() sigue funcionando igual para él (usuarios.tenant_id normal).
-- mi_tenant_estado() ya es genérica por usuario autenticado, no requiere cambios.

-- ---------------------------------------------------------------------------
-- Grants explícitos (mismo criterio que el resto del proyecto: aunque Supabase ya
-- concede EXECUTE a `authenticated` por defecto en funciones nuevas de `public`, se
-- deja explícito por claridad/documentación — salvo los dos motores de devengo, que
-- se REVOCAN arriba porque no tienen ningún chequeo de caller (procesan toda la
-- plataforma) y solo deben poder correr vía pg_cron.
-- ---------------------------------------------------------------------------

grant execute on function public.mi_cliente_id() to authenticated;
grant execute on function public.crear_fondo_excedente(text, numeric, integer) to authenticated;
grant execute on function public.actualizar_fondo_excedente(uuid, text, numeric, integer, boolean) to authenticated;
grant execute on function public.eliminar_fondo_excedente(uuid) to authenticated;
grant execute on function public.crear_producto_ahorro(text, public.tipo_producto_ahorro, numeric, public.periodicidad_capitalizacion, boolean, numeric, integer, numeric) to authenticated;
grant execute on function public.actualizar_producto_ahorro(uuid, text, numeric, boolean, numeric, boolean) to authenticated;
grant execute on function public.siguiente_capitalizacion(date, public.periodicidad_capitalizacion) to authenticated;
grant execute on function public.abrir_cuenta_ahorro(uuid, uuid, numeric, date) to authenticated;
grant execute on function public.registrar_movimiento_ahorro(uuid, public.tipo_movimiento, numeric, text, date) to authenticated;
grant execute on function public.configurar_interes_aportacion(numeric, public.periodicidad_capitalizacion) to authenticated;
grant execute on function public.interes_acumulado_aportaciones() to authenticated;
grant execute on function public.previsualizar_excedente(date, date) to authenticated;
grant execute on function public.calcular_y_guardar_excedente(date, date) to authenticated;
grant execute on function public.previsualizar_excedente_socio(date, date) to authenticated;
grant execute on function public.mi_excedente_estimado(date, date) to authenticated;
grant execute on function public.mi_perfil_socio() to authenticated;
