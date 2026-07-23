-- CobraYA: esquema base multi-tenant
-- Portado desde el modelo de "Tu Crédito" (Prestamista/Prestatario/Prestamo/Cuota/Pago),
-- agregando tenant_id en toda tabla de negocio y adaptando claves naturales AR (DNI) a
-- claves surrogate + documento (Identidad/RTN hondureño).

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.rol_usuario as enum ('owner', 'collector');

create type public.estado_prestamo as enum ('activo', 'finalizado', 'eliminado', 'archivado');

create type public.estado_cuota as enum ('pendiente', 'saldada', 'vencida', 'reprogramada');

-- Mapeo explícito y correcto (el .NET original tenía un desfase entre el catálogo
-- sembrado y el switch de CalculadoraService; acá el nombre del sistema ES la clave,
-- no hay id numérico que se pueda desalinear).
create type public.sistema_amortizacion as enum ('frances', 'aleman', 'americano', 'directo');

-- Frecuencias de cobro típicas del mercado hondureño (el sistema original solo
-- soportaba mensual).
create type public.frecuencia_cobro as enum ('diario', 'semanal', 'quincenal', 'mensual');

create type public.estado_suscripcion as enum ('prueba', 'activa', 'suspendida', 'cancelada');

-- ---------------------------------------------------------------------------
-- tenants (cada prestamista/empresa que usa CobraYA)
-- ---------------------------------------------------------------------------

create table public.tenants (
  id                  uuid primary key default gen_random_uuid(),
  nombre              text not null,
  rtn                 text,
  moneda              text not null default 'HNL',
  estado_suscripcion  estado_suscripcion not null default 'prueba',
  fecha_inicio        date not null default current_date,
  config              jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.tenants is 'Cuenta de un prestamista (organización) dentro del SaaS CobraYA.';

-- ---------------------------------------------------------------------------
-- usuarios (membresía: vincula auth.users con un tenant y un rol)
-- ---------------------------------------------------------------------------

create table public.usuarios (
  id          uuid primary key references auth.users (id) on delete cascade,
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  rol         rol_usuario not null default 'owner',
  nombre      text not null,
  correo      text not null,
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.usuarios is 'Membresía de un usuario de Supabase Auth dentro de un tenant, con su rol (owner=dueño, collector=cobrador). MVP: 1 usuario pertenece a 1 tenant.';

create index idx_usuarios_tenant on public.usuarios (tenant_id);

-- ---------------------------------------------------------------------------
-- garantes
-- ---------------------------------------------------------------------------

create table public.garantes (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  documento   text,
  nombre      text not null,
  apellido    text,
  telefono    text,
  domicilio   text,
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_garantes_tenant on public.garantes (tenant_id);

-- ---------------------------------------------------------------------------
-- clientes (ex-Prestatario). Clave natural (DNI argentino) -> surrogate + documento HN.
-- ---------------------------------------------------------------------------

create table public.clientes (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  documento   text not null,
  nombre      text not null,
  apellido    text,
  telefono    text,
  domicilio   text,
  correo      text,
  activo      boolean not null default true,
  garante_id  uuid references public.garantes (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint uq_clientes_tenant_documento unique (tenant_id, documento)
);

comment on column public.clientes.documento is 'Número de Identidad o RTN hondureño. Único por tenant (no globalmente, a diferencia del DNI en el sistema original).';

create index idx_clientes_tenant on public.clientes (tenant_id);

-- ---------------------------------------------------------------------------
-- medios_pago: catálogo global (no varía por tenant, se administra por migración/seed)
-- ---------------------------------------------------------------------------

create table public.medios_pago (
  id      smallint generated always as identity primary key,
  nombre  text not null unique
);

insert into public.medios_pago (nombre) values ('efectivo'), ('transferencia'), ('deposito');

-- ---------------------------------------------------------------------------
-- prestamos
-- ---------------------------------------------------------------------------

create table public.prestamos (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants (id) on delete cascade,
  cliente_id            uuid not null references public.clientes (id),
  cobrador_id           uuid references public.usuarios (id),
  monto_otorgado        numeric(14, 2) not null check (monto_otorgado > 0),
  saldo_restante        numeric(14, 2) not null default 0,
  cantidad_cuotas       integer not null check (cantidad_cuotas > 0),
  tasa_interes          numeric(7, 4) not null check (tasa_interes >= 0),
  sistema_amortizacion  public.sistema_amortizacion not null,
  frecuencia_cobro      public.frecuencia_cobro not null default 'mensual',
  estado                public.estado_prestamo not null default 'activo',
  fecha_otorgamiento    date not null,
  fecha_primer_vto      date not null,
  fecha_fin_estimada    date,
  moneda                text not null default 'HNL',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on column public.prestamos.tasa_interes is 'Tasa de interés por período, interpretada según frecuencia_cobro (no siempre mensual, a diferencia del sistema original).';
comment on column public.prestamos.cobrador_id is 'Cobrador de campo asignado a este préstamo (rol collector). Null si aún no se asigna.';

create index idx_prestamos_tenant on public.prestamos (tenant_id);
create index idx_prestamos_cliente on public.prestamos (cliente_id);
create index idx_prestamos_cobrador on public.prestamos (cobrador_id);

-- ---------------------------------------------------------------------------
-- cuotas
-- ---------------------------------------------------------------------------

create table public.cuotas (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants (id) on delete cascade,
  prestamo_id       uuid not null references public.prestamos (id) on delete cascade,
  nro_cuota         integer not null,
  monto             numeric(14, 2) not null,
  interes           numeric(14, 2),
  capital           numeric(14, 2),
  saldo_pendiente   numeric(14, 2),
  fecha_vto         date not null,
  estado            public.estado_cuota not null default 'pendiente',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint uq_cuotas_prestamo_nro unique (prestamo_id, nro_cuota)
);

create index idx_cuotas_tenant on public.cuotas (tenant_id);
create index idx_cuotas_prestamo on public.cuotas (prestamo_id);
create index idx_cuotas_estado_fecha on public.cuotas (estado, fecha_vto);

-- ---------------------------------------------------------------------------
-- pagos
-- ---------------------------------------------------------------------------

create table public.pagos (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants (id) on delete cascade,
  cuota_id          uuid not null references public.cuotas (id),
  cobrador_id       uuid references public.usuarios (id),
  fecha_pago        date not null default current_date,
  medio_pago_id     smallint not null references public.medios_pago (id),
  monto             numeric(14, 2) not null check (monto > 0),
  descuento         numeric(14, 2) not null default 0,
  recargo           numeric(14, 2) not null default 0,
  saldo_snapshot    numeric(14, 2),
  observaciones     text,
  estado            text not null default 'aprobado',
  created_at        timestamptz not null default now()
);

comment on column public.pagos.saldo_snapshot is 'Saldo pendiente de la cuota inmediatamente después de este pago (snapshot histórico).';

create index idx_pagos_tenant on public.pagos (tenant_id);
create index idx_pagos_cuota on public.pagos (cuota_id);

-- ---------------------------------------------------------------------------
-- documentos
-- ---------------------------------------------------------------------------

create table public.documentos (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  entidad_tipo    text not null check (entidad_tipo in ('cliente', 'prestamo')),
  entidad_id      uuid not null,
  tipo_documento  text,
  nombre_original text not null,
  ruta_storage    text not null,
  content_type    text,
  subido_por      uuid references public.usuarios (id),
  activo          boolean not null default true,
  created_at      timestamptz not null default now()
);

create index idx_documentos_tenant on public.documentos (tenant_id);
create index idx_documentos_entidad on public.documentos (entidad_tipo, entidad_id);

-- ---------------------------------------------------------------------------
-- audit_logs (reemplaza al AuditInterceptor de EF Core)
-- ---------------------------------------------------------------------------

create table public.audit_logs (
  id           bigint generated always as identity primary key,
  tenant_id    uuid references public.tenants (id) on delete cascade,
  entity_name  text not null,
  action       text not null,
  entity_id    text not null,
  changes      jsonb,
  user_id      uuid,
  "timestamp"  timestamptz not null default now()
);

create index idx_audit_tenant on public.audit_logs (tenant_id);
