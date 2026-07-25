-- CobraYA: control de mora y multas.
--
-- Diseño: la multa NO se mezcla dentro del monto/saldo_pendiente de la cuota (a
-- diferencia del gasto administrativo 'por_cuota') — es un registro aparte con su
-- propio motivo y fecha de incumplimiento, para tener historial/auditoría real de
-- cada infracción ("Registrar motivo", "Registrar fecha de incumplimiento" del
-- pedido). "Se suma automáticamente al próximo cobro" se traduce en: aparece listada
-- junto a la cuota vencida para que el cobrador la cobre en la misma visita, con su
-- propio RPC de pago — no se funde en el número de la cuota, así se puede reportar
-- "ganancias por multas" por separado de intereses (ítem 8 del pedido del usuario).

alter table public.prestamos
  add column multa_por_atraso_monto numeric(12, 2);

alter table public.prestamos
  add constraint chk_multa_por_atraso_positiva
  check (multa_por_atraso_monto is null or multa_por_atraso_monto > 0);

comment on column public.prestamos.multa_por_atraso_monto is 'Monto fijo que se aplica automáticamente cada vez que una cuota de este préstamo pasa a vencida. Null = sin multas automáticas.';

create table public.multas (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null default public.current_tenant_id() references public.tenants (id) on delete cascade,
  prestamo_id           uuid not null references public.prestamos (id) on delete cascade,
  cuota_id              uuid not null references public.cuotas (id) on delete cascade,
  monto                 numeric(12, 2) not null check (monto > 0),
  saldo_pendiente        numeric(12, 2) not null,
  motivo                text not null default 'Cuota vencida',
  fecha_incumplimiento   date not null,
  estado                public.estado_cuota not null default 'pendiente',
  aplicada_automaticamente boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on table public.multas is 'Multa por atraso aplicada a una cuota vencida. Ledger propio con motivo y fecha, aparte del monto de la cuota.';

create index idx_multas_tenant on public.multas (tenant_id);
create index idx_multas_prestamo on public.multas (prestamo_id);
create index idx_multas_cuota on public.multas (cuota_id);
create index idx_multas_estado on public.multas (estado);

create trigger trg_multas_updated_at
  before update on public.multas
  for each row execute function public.set_updated_at();

alter table public.multas enable row level security;

create policy multas_owner_all on public.multas
  for all
  using (tenant_id = public.current_tenant_id() and public.current_rol() = 'owner')
  with check (tenant_id = public.current_tenant_id() and public.current_rol() = 'owner');

create policy multas_collector_select on public.multas
  for select
  using (
    tenant_id = public.current_tenant_id()
    and public.current_rol() = 'collector'
    and exists (
      select 1 from public.prestamos p
      where p.id = multas.prestamo_id and p.cobrador_id = auth.uid()
    )
  );

grant select, insert, update, delete on public.multas to authenticated;

-- ---------------------------------------------------------------------------
-- pagos: ahora puede referenciar cuota, gasto administrativo O multa (exactamente una)
-- ---------------------------------------------------------------------------

alter table public.pagos add column multa_id uuid references public.multas (id);
alter table public.pagos drop constraint chk_pagos_referencia_unica;
alter table public.pagos add constraint chk_pagos_referencia_unica check (
  (case when cuota_id is not null then 1 else 0 end
   + case when gasto_administrativo_id is not null then 1 else 0 end
   + case when multa_id is not null then 1 else 0 end) = 1
);

create index idx_pagos_multa on public.pagos (multa_id);

-- ---------------------------------------------------------------------------
-- actualizar_cuotas_vencidas(): además de marcar vencidas, aplica la multa
-- automática configurada en el préstamo (una sola vez por cuota).
-- ---------------------------------------------------------------------------

create or replace function public.actualizar_cuotas_vencidas()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.cuotas
     set estado = 'vencida'
   where estado = 'pendiente'
     and fecha_vto < current_date;

  get diagnostics v_count = row_count;

  insert into public.multas (tenant_id, prestamo_id, cuota_id, monto, saldo_pendiente, motivo, fecha_incumplimiento, aplicada_automaticamente)
  select c.tenant_id, c.prestamo_id, c.id, p.multa_por_atraso_monto, p.multa_por_atraso_monto,
         'Cuota vencida automáticamente', c.fecha_vto, true
  from public.cuotas c
  join public.prestamos p on p.id = c.prestamo_id
  where c.estado = 'vencida'
    and p.multa_por_atraso_monto is not null
    and not exists (select 1 from public.multas m where m.cuota_id = c.id);

  update public.gastos_administrativos
     set estado = 'vencida'
   where estado = 'pendiente'
     and fecha_vto < current_date;

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- aplicar_multa(): acción manual del owner ("Marcar No Pagó / Aplicar Multa"),
-- independiente de la automática — permite monto y motivo propios.
-- ---------------------------------------------------------------------------

create or replace function public.aplicar_multa(
  p_cuota_id              uuid,
  p_monto                 numeric,
  p_motivo                text default 'No pagó',
  p_fecha_incumplimiento  date default current_date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id  uuid := public.current_tenant_id();
  v_cuota      public.cuotas%rowtype;
  v_multa_id   uuid;
begin
  if v_tenant_id is null then
    raise exception 'Usuario sin tenant asignado';
  end if;

  if public.current_rol() <> 'owner' then
    raise exception 'Solo el dueño del negocio puede aplicar multas';
  end if;

  if p_monto <= 0 then
    raise exception 'El monto de la multa debe ser mayor a cero';
  end if;

  select * into v_cuota from public.cuotas where id = p_cuota_id and tenant_id = v_tenant_id;
  if not found then
    raise exception 'Cuota % no encontrada', p_cuota_id;
  end if;

  insert into public.multas (tenant_id, prestamo_id, cuota_id, monto, saldo_pendiente, motivo, fecha_incumplimiento, aplicada_automaticamente)
  values (v_tenant_id, v_cuota.prestamo_id, v_cuota.id, p_monto, p_monto, p_motivo, p_fecha_incumplimiento, false)
  returning id into v_multa_id;

  return v_multa_id;
end;
$$;

comment on function public.aplicar_multa is 'Aplica una multa manual ("Marcar No Pagó") sobre una cuota, con motivo y fecha propios. Independiente de la multa automática de actualizar_cuotas_vencidas().';

grant execute on function public.aplicar_multa(uuid, numeric, text, date) to authenticated;

-- ---------------------------------------------------------------------------
-- registrar_pago_multa(): análogo a registrar_pago_gasto_administrativo().
-- ---------------------------------------------------------------------------

create or replace function public.registrar_pago_multa(
  p_multa_id       uuid,
  p_medio_pago_id  smallint,
  p_monto          numeric,
  p_descuento      numeric default 0,
  p_recargo        numeric default 0,
  p_observaciones  text default null,
  p_fecha_pago     date default current_date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id         uuid := public.current_tenant_id();
  v_rol               public.rol_usuario := public.current_rol();
  v_multa             public.multas%rowtype;
  v_prestamo          public.prestamos%rowtype;
  v_saldo_actual      numeric;
  v_monto_amortizado  numeric;
  v_nuevo_saldo       numeric;
  v_pago_id           uuid;
begin
  if v_tenant_id is null then
    raise exception 'Usuario sin tenant asignado';
  end if;

  select * into v_multa from public.multas
   where id = p_multa_id and tenant_id = v_tenant_id
   for update;

  if not found then
    raise exception 'Multa % no encontrada', p_multa_id;
  end if;

  select * into v_prestamo from public.prestamos where id = v_multa.prestamo_id;

  if v_rol = 'collector' and v_prestamo.cobrador_id is distinct from auth.uid() then
    raise exception 'No autorizado para registrar pagos de este préstamo';
  end if;

  if v_multa.estado = 'saldada' then
    raise exception 'La multa ya está saldada';
  end if;

  if p_monto <= 0 then
    raise exception 'El monto del pago debe ser mayor a cero';
  end if;

  v_saldo_actual := coalesce(v_multa.saldo_pendiente, v_multa.monto);
  v_monto_amortizado := p_monto + p_descuento - p_recargo;

  if v_monto_amortizado <= 0 then
    raise exception 'El monto neto del pago (monto + descuento - recargo) debe ser mayor a cero';
  end if;

  if v_monto_amortizado > v_saldo_actual then
    raise exception 'El pago excede el saldo pendiente de la multa (saldo: %, neto: %)',
      v_saldo_actual, v_monto_amortizado;
  end if;

  v_nuevo_saldo := greatest(v_saldo_actual - v_monto_amortizado, 0);

  update public.multas
     set saldo_pendiente = v_nuevo_saldo,
         estado = case when v_nuevo_saldo <= 0 then 'saldada'::public.estado_cuota
                        else 'pendiente'::public.estado_cuota end
   where id = v_multa.id;

  insert into public.pagos (
    tenant_id, multa_id, cobrador_id, fecha_pago, medio_pago_id,
    monto, descuento, recargo, saldo_snapshot, observaciones, estado
  ) values (
    v_tenant_id, v_multa.id, auth.uid(), p_fecha_pago, p_medio_pago_id,
    p_monto, p_descuento, p_recargo, v_nuevo_saldo, p_observaciones, 'aprobado'
  ) returning id into v_pago_id;

  return v_pago_id;
end;
$$;

comment on function public.registrar_pago_multa is 'Registra un pago sobre una multa. No afecta saldo_restante ni estado del préstamo.';

grant execute on function public.registrar_pago_multa(uuid, smallint, numeric, numeric, numeric, text, date) to authenticated;
