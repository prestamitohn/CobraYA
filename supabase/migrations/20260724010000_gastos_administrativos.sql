-- CobraYA: gastos administrativos — un cargo adicional al cliente (aparte de
-- capital+interés), con su propia frecuencia (semanal o mensual) independiente de la
-- frecuencia de cobro del préstamo. Genera su propio cronograma de cobros, vigente
-- mientras dure el préstamo (mismo horizonte que las cuotas).

-- Enum propio (no reutiliza frecuencia_cobro): el gasto administrativo solo admite
-- semanal/mensual, nunca diario/quincenal, y son conceptos independientes.
create type public.frecuencia_gasto_administrativo as enum ('semanal', 'mensual');

alter table public.prestamos
  add column gasto_administrativo_monto numeric(12, 2),
  add column gasto_administrativo_frecuencia public.frecuencia_gasto_administrativo;

alter table public.prestamos
  add constraint chk_gasto_administrativo_coherente
  check (
    (gasto_administrativo_monto is null and gasto_administrativo_frecuencia is null)
    or (gasto_administrativo_monto > 0 and gasto_administrativo_frecuencia is not null)
  );

comment on column public.prestamos.gasto_administrativo_monto is 'Cargo periódico adicional al cliente (aparte de capital+interés). Null si el préstamo no tiene gasto administrativo.';

-- ---------------------------------------------------------------------------
-- gastos_administrativos: cronograma de cobros del cargo, análogo a cuotas
-- ---------------------------------------------------------------------------

create table public.gastos_administrativos (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null default public.current_tenant_id() references public.tenants (id) on delete cascade,
  prestamo_id       uuid not null references public.prestamos (id) on delete cascade,
  numero            integer not null,
  monto             numeric(12, 2) not null,
  saldo_pendiente   numeric(12, 2) not null,
  fecha_vto         date not null,
  estado            public.estado_cuota not null default 'pendiente',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint uq_gastos_admin_prestamo_nro unique (prestamo_id, numero)
);

create index idx_gastos_admin_tenant on public.gastos_administrativos (tenant_id);
create index idx_gastos_admin_prestamo on public.gastos_administrativos (prestamo_id);
create index idx_gastos_admin_estado_fecha on public.gastos_administrativos (estado, fecha_vto);

create trigger trg_gastos_admin_updated_at
  before update on public.gastos_administrativos
  for each row execute function public.set_updated_at();

alter table public.gastos_administrativos enable row level security;

create policy gastos_admin_owner_all on public.gastos_administrativos
  for all
  using (tenant_id = public.current_tenant_id() and public.current_rol() = 'owner')
  with check (tenant_id = public.current_tenant_id() and public.current_rol() = 'owner');

create policy gastos_admin_collector_select on public.gastos_administrativos
  for select
  using (
    tenant_id = public.current_tenant_id()
    and public.current_rol() = 'collector'
    and exists (
      select 1 from public.prestamos p
      where p.id = gastos_administrativos.prestamo_id and p.cobrador_id = auth.uid()
    )
  );

grant select, insert, update, delete on public.gastos_administrativos to authenticated;

-- ---------------------------------------------------------------------------
-- pagos: un pago ahora referencia una cuota O un gasto administrativo (nunca ambos)
-- ---------------------------------------------------------------------------

alter table public.pagos alter column cuota_id drop not null;
alter table public.pagos add column gasto_administrativo_id uuid references public.gastos_administrativos (id);
alter table public.pagos add constraint chk_pagos_referencia_unica check (
  (cuota_id is not null and gasto_administrativo_id is null)
  or (cuota_id is null and gasto_administrativo_id is not null)
);

create index idx_pagos_gasto_admin on public.pagos (gasto_administrativo_id);
