-- CobraYA: módulo de cooperativas — un tenant puede ser 'prestamista' (default, comportamiento
-- actual) o 'cooperativa'. En una cooperativa los "clientes" son "socios": además de recibir
-- préstamos, aportan capital social (aportaciones) y al cierre del período reciben una parte
-- del excedente (no "utilidad"/"dividendo" — terminología de la Ley de Cooperativas de Honduras,
-- Decreto 65-87) generado por los intereses de los préstamos de todos los socios.

create type public.tipo_tenant as enum ('prestamista', 'cooperativa');

alter table public.tenants
  add column tipo_tenant public.tipo_tenant not null default 'prestamista';

comment on column public.tenants.tipo_tenant is 'Prestamista individual/empresa vs. cooperativa de ahorro y crédito (socios con aportaciones y reparto de excedentes).';

-- ---------------------------------------------------------------------------
-- handle_new_user: captura tipo_tenant del metadata al autoregistrarse
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id       uuid;
  v_nombre_negocio  text;
  v_nombre_usuario  text;
  v_invited_tenant  text;
  v_tipo_tenant     text;
  v_rol             public.rol_usuario;
begin
  v_nombre_negocio := new.raw_user_meta_data ->> 'nombre_negocio';
  v_nombre_usuario := coalesce(new.raw_user_meta_data ->> 'nombre_usuario', split_part(new.email, '@', 1));
  v_invited_tenant := new.raw_user_meta_data ->> 'tenant_id';
  v_tipo_tenant := new.raw_user_meta_data ->> 'tipo_tenant';

  if v_invited_tenant is not null then
    v_tenant_id := v_invited_tenant::uuid;
    v_rol := 'collector';
  else
    insert into public.tenants (nombre, tipo_tenant)
    values (
      coalesce(v_nombre_negocio, v_nombre_usuario || ' - CobraYA'),
      coalesce(v_tipo_tenant::public.tipo_tenant, 'prestamista')
    )
    returning id into v_tenant_id;
    v_rol := 'owner';
  end if;

  insert into public.usuarios (id, tenant_id, rol, nombre, correo)
  values (new.id, v_tenant_id, v_rol, v_nombre_usuario, new.email);

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- mi_tenant_estado: agregar tipo_tenant a la firma existente (cambia el shape)
-- ---------------------------------------------------------------------------

drop function public.mi_tenant_estado();

create or replace function public.mi_tenant_estado()
returns table (
  nombre                text,
  estado_suscripcion    public.estado_suscripcion,
  fecha_inicio          date,
  dias_restantes_prueba integer,
  trial_vencido         boolean,
  tipo_tenant           public.tipo_tenant
)
language sql
security definer
set search_path = public
as $$
  select
    t.nombre,
    t.estado_suscripcion,
    t.fecha_inicio,
    (14 - (current_date - t.fecha_inicio))::integer as dias_restantes_prueba,
    (t.estado_suscripcion = 'prueba' and t.fecha_inicio + 14 < current_date) as trial_vencido,
    t.tipo_tenant
  from public.tenants t
  join public.usuarios u on u.tenant_id = t.id
  where u.id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- aportaciones: capital social aportado (o retirado) por cada socio
-- ---------------------------------------------------------------------------

create table public.aportaciones (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null default public.current_tenant_id() references public.tenants (id) on delete cascade,
  cliente_id      uuid not null references public.clientes (id) on delete cascade,
  tipo            text not null check (tipo in ('obligatoria', 'extraordinaria', 'retiro')),
  monto           numeric(14, 2) not null check (monto > 0),
  fecha           date not null default current_date,
  observaciones   text,
  registrado_por  uuid references public.usuarios (id),
  created_at      timestamptz not null default now()
);

comment on table public.aportaciones is 'Movimientos de capital social por socio en una cooperativa: obligatoria/extraordinaria suman al saldo, retiro resta.';
comment on column public.aportaciones.monto is 'Siempre positivo; el signo lo determina el tipo (retiro resta del saldo del socio).';

create index idx_aportaciones_tenant on public.aportaciones (tenant_id);
create index idx_aportaciones_cliente on public.aportaciones (cliente_id);

alter table public.aportaciones enable row level security;

create policy aportaciones_owner_all on public.aportaciones
  for all
  using (tenant_id = public.current_tenant_id() and public.current_rol() = 'owner')
  with check (tenant_id = public.current_tenant_id() and public.current_rol() = 'owner');

grant select, insert, update, delete on public.aportaciones to authenticated;

-- registrar_aportacion: valida tenant cooperativa + cliente propio + tipo válido
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
  v_saldo     numeric;
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

  if p_tipo not in ('obligatoria', 'extraordinaria', 'retiro') then
    raise exception 'Tipo de aportación inválido: %', p_tipo;
  end if;

  if p_monto <= 0 then
    raise exception 'El monto debe ser mayor a cero';
  end if;

  if p_tipo = 'retiro' then
    select coalesce(sum(case when a.tipo = 'retiro' then -a.monto else a.monto end), 0)
      into v_saldo
      from public.aportaciones a
      where a.cliente_id = p_cliente_id;

    if v_saldo < p_monto then
      raise exception 'El socio no tiene saldo de aportaciones suficiente para este retiro (saldo: %)', v_saldo;
    end if;
  end if;

  insert into public.aportaciones (tenant_id, cliente_id, tipo, monto, fecha, observaciones, registrado_por)
  values (v_tenant_id, p_cliente_id, p_tipo, p_monto, p_fecha, p_observaciones, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

-- saldo de aportaciones por socio (uso en listados/UI)
create or replace function public.saldos_aportaciones()
returns table (cliente_id uuid, saldo numeric)
language sql
security definer
set search_path = public
as $$
  select a.cliente_id, coalesce(sum(case when a.tipo = 'retiro' then -a.monto else a.monto end), 0) as saldo
  from public.aportaciones a
  where a.tenant_id = public.current_tenant_id()
  group by a.cliente_id;
$$;

-- ---------------------------------------------------------------------------
-- excedentes: cálculo y reparto anual (o del período que elija el dueño)
-- ---------------------------------------------------------------------------

create table public.excedentes_periodo (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null default public.current_tenant_id() references public.tenants (id) on delete cascade,
  fecha_desde            date not null,
  fecha_hasta            date not null,
  ingresos_totales       numeric(14, 2) not null,
  porcentaje_reserva     numeric(5, 2) not null default 10,
  monto_reserva          numeric(14, 2) not null,
  excedente_distribuible numeric(14, 2) not null,
  creado_por             uuid references public.usuarios (id),
  created_at             timestamptz not null default now(),
  constraint chk_excedentes_fechas check (fecha_hasta >= fecha_desde),
  constraint chk_excedentes_reserva check (porcentaje_reserva >= 10)
);

comment on table public.excedentes_periodo is 'Cierre de excedente cooperativo por período: ingresos (intereses+multas+servicios) menos reserva legal (mínimo 10%, Art. 44 Decreto 65-87), guardado como histórico inmutable.';

create index idx_excedentes_periodo_tenant on public.excedentes_periodo (tenant_id);

alter table public.excedentes_periodo enable row level security;

create policy excedentes_periodo_owner_all on public.excedentes_periodo
  for all
  using (tenant_id = public.current_tenant_id() and public.current_rol() = 'owner')
  with check (tenant_id = public.current_tenant_id() and public.current_rol() = 'owner');

grant select, insert, update, delete on public.excedentes_periodo to authenticated;

create table public.excedentes_detalle (
  id                    uuid primary key default gen_random_uuid(),
  excedente_periodo_id  uuid not null references public.excedentes_periodo (id) on delete cascade,
  cliente_id            uuid not null references public.clientes (id),
  interes_pagado        numeric(14, 2) not null,
  proporcion            numeric(9, 6) not null,
  monto_excedente       numeric(14, 2) not null
);

create index idx_excedentes_detalle_periodo on public.excedentes_detalle (excedente_periodo_id);
create index idx_excedentes_detalle_cliente on public.excedentes_detalle (cliente_id);

alter table public.excedentes_detalle enable row level security;

create policy excedentes_detalle_owner_all on public.excedentes_detalle
  for all
  using (
    public.current_rol() = 'owner'
    and exists (
      select 1 from public.excedentes_periodo ep
      where ep.id = excedentes_detalle.excedente_periodo_id and ep.tenant_id = public.current_tenant_id()
    )
  )
  with check (
    public.current_rol() = 'owner'
    and exists (
      select 1 from public.excedentes_periodo ep
      where ep.id = excedentes_detalle.excedente_periodo_id and ep.tenant_id = public.current_tenant_id()
    )
  );

grant select, insert, update, delete on public.excedentes_detalle to authenticated;

-- previsualizar_excedente: calcula sin guardar (para que el dueño revise antes de confirmar)
create or replace function public.previsualizar_excedente(
  p_fecha_desde        date,
  p_fecha_hasta        date,
  p_porcentaje_reserva numeric default 10
)
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
  v_reserva         numeric;
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

  if p_porcentaje_reserva < 10 then
    raise exception 'La reserva legal no puede ser menor al 10%% (Art. 44, Decreto 65-87)';
  end if;

  if p_fecha_hasta < p_fecha_desde then
    raise exception 'El rango de fechas es inválido';
  end if;

  -- interés por socio en el período: prorrateo del pago según composición de la cuota
  -- (mismo criterio que dashboardService.proporcionCuota en el frontend) + multas + gastos
  -- administrativos cobrados en el período, atribuidos íntegros como ingreso (no capital).
  -- drop previo: calcular_y_guardar_excedente invoca esta función dos veces dentro de la
  -- misma transacción (misma llamada RPC), y "on commit drop" solo limpia al cerrar la
  -- transacción completa, no entre invocaciones — sin el drop, la 2ª llamada choca con "ya existe".
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
  select coalesce(sum(t.interes), 0) into v_total_intereses from tmp_interes_socio t;

  v_reserva := round(v_ingresos * p_porcentaje_reserva / 100, 2);
  v_distribuible := v_ingresos - v_reserva;

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

-- ---------------------------------------------------------------------------
-- admin_list_tenants: agregar tipo_tenant (el superadmin necesita distinguir
-- cooperativas de prestamistas en el panel de plataforma)
-- ---------------------------------------------------------------------------

drop function public.admin_list_tenants();

create or replace function public.admin_list_tenants()
returns table (
  id                    uuid,
  nombre                text,
  rtn                   text,
  moneda                text,
  estado_suscripcion    public.estado_suscripcion,
  fecha_inicio          date,
  created_at            timestamptz,
  propietario_nombre    text,
  propietario_correo    text,
  tipo_tenant           public.tipo_tenant,
  cantidad_usuarios     bigint,
  cantidad_clientes     bigint,
  cantidad_prestamos    bigint,
  monto_otorgado_total  numeric
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
    (select u.nombre from public.usuarios u where u.tenant_id = t.id and u.rol = 'owner' order by u.created_at limit 1),
    (select u.correo from public.usuarios u where u.tenant_id = t.id and u.rol = 'owner' order by u.created_at limit 1),
    t.tipo_tenant,
    (select count(*) from public.usuarios u where u.tenant_id = t.id),
    (select count(*) from public.clientes c where c.tenant_id = t.id),
    (select count(*) from public.prestamos p where p.tenant_id = t.id and p.estado <> 'eliminado'),
    (select coalesce(sum(p.monto_otorgado), 0) from public.prestamos p where p.tenant_id = t.id and p.estado <> 'eliminado')
  from public.tenants t
  order by t.created_at desc;
end;
$$;

comment on function public.admin_list_tenants is 'Lista todos los tenants de la plataforma con conteos básicos, datos de contacto del dueño y tipo (prestamista/cooperativa), solo para superadmin.';

grant execute on function public.admin_list_tenants() to authenticated;

-- calcular_y_guardar_excedente: igual que la previsualización pero persiste el resultado
create or replace function public.calcular_y_guardar_excedente(
  p_fecha_desde        date,
  p_fecha_hasta        date,
  p_porcentaje_reserva numeric default 10
)
returns uuid
language plpgsql
as $$
declare
  v_tenant_id     uuid := public.current_tenant_id();
  v_periodo_id    uuid;
  v_ingresos      numeric := 0;
  v_reserva       numeric;
  v_distribuible  numeric;
begin
  if v_tenant_id is null then
    raise exception 'Usuario sin tenant asignado';
  end if;

  if public.current_rol() <> 'owner' then
    raise exception 'Solo el dueño del negocio puede confirmar el reparto de excedentes';
  end if;

  if exists (
    select 1 from public.excedentes_periodo
    where tenant_id = v_tenant_id
      and fecha_desde = p_fecha_desde
      and fecha_hasta = p_fecha_hasta
  ) then
    raise exception 'Ya existe un cierre de excedente guardado para ese período';
  end if;

  select coalesce(sum(d.interes_pagado), 0) into v_ingresos
  from public.previsualizar_excedente(p_fecha_desde, p_fecha_hasta, p_porcentaje_reserva) d;

  v_reserva := round(v_ingresos * p_porcentaje_reserva / 100, 2);
  v_distribuible := v_ingresos - v_reserva;

  insert into public.excedentes_periodo (
    tenant_id, fecha_desde, fecha_hasta, ingresos_totales, porcentaje_reserva,
    monto_reserva, excedente_distribuible, creado_por
  ) values (
    v_tenant_id, p_fecha_desde, p_fecha_hasta, v_ingresos, p_porcentaje_reserva,
    v_reserva, v_distribuible, auth.uid()
  )
  returning id into v_periodo_id;

  insert into public.excedentes_detalle (excedente_periodo_id, cliente_id, interes_pagado, proporcion, monto_excedente)
  select v_periodo_id, d.cliente_id, d.interes_pagado, d.proporcion, d.monto_excedente
  from public.previsualizar_excedente(p_fecha_desde, p_fecha_hasta, p_porcentaje_reserva) d;

  return v_periodo_id;
end;
$$;
