-- CobraYA: funciones helper de tenant/rol + Row Level Security
--
-- Regla de oro multi-tenant: toda tabla de negocio tiene tenant_id y solo es visible/
-- editable a través de estas policies. current_tenant_id()/current_rol() son
-- security definer para evitar recursión de RLS sobre la propia tabla `usuarios`
-- (patrón recomendado por Supabase).

-- ---------------------------------------------------------------------------
-- Funciones helper
-- ---------------------------------------------------------------------------

create or replace function public.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from public.usuarios where id = auth.uid()
$$;

create or replace function public.current_rol()
returns public.rol_usuario
language sql
stable
security definer
set search_path = public
as $$
  select rol from public.usuarios where id = auth.uid()
$$;

comment on function public.current_tenant_id() is 'Tenant del usuario autenticado actual. security definer para poder usarse dentro de la policy RLS de la propia tabla usuarios sin recursión.';
comment on function public.current_rol() is 'Rol (owner/collector) del usuario autenticado actual dentro de su tenant.';

-- ---------------------------------------------------------------------------
-- tenants
-- ---------------------------------------------------------------------------

alter table public.tenants enable row level security;

create policy tenants_select on public.tenants
  for select using (id = public.current_tenant_id());

create policy tenants_update_owner on public.tenants
  for update using (id = public.current_tenant_id() and public.current_rol() = 'owner')
  with check (id = public.current_tenant_id() and public.current_rol() = 'owner');

-- Insert de tenants solo vía el flujo de onboarding (security definer, ver migración
-- de auth) o service_role; no hay policy de insert para authenticated.

-- ---------------------------------------------------------------------------
-- usuarios
-- ---------------------------------------------------------------------------

alter table public.usuarios enable row level security;

create policy usuarios_select on public.usuarios
  for select using (tenant_id = public.current_tenant_id());

create policy usuarios_update_self on public.usuarios
  for update using (id = auth.uid())
  with check (id = auth.uid());

create policy usuarios_owner_manage on public.usuarios
  for update using (tenant_id = public.current_tenant_id() and public.current_rol() = 'owner')
  with check (tenant_id = public.current_tenant_id() and public.current_rol() = 'owner');

-- Nota: alta de nuevos usuarios (invitar cobradores) requiere primero crear el
-- auth.users vía Admin API — se hace desde una Edge Function con service_role,
-- que bypassea RLS. No se expone policy de insert a `authenticated`.

-- ---------------------------------------------------------------------------
-- clientes
-- ---------------------------------------------------------------------------

alter table public.clientes enable row level security;

create policy clientes_owner_all on public.clientes
  for all
  using (tenant_id = public.current_tenant_id() and public.current_rol() = 'owner')
  with check (tenant_id = public.current_tenant_id() and public.current_rol() = 'owner');

-- El cobrador solo ve clientes de préstamos que tiene asignados.
create policy clientes_collector_select on public.clientes
  for select
  using (
    tenant_id = public.current_tenant_id()
    and public.current_rol() = 'collector'
    and exists (
      select 1 from public.prestamos p
      where p.cliente_id = clientes.id and p.cobrador_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- garantes (gestión de owner únicamente en el MVP)
-- ---------------------------------------------------------------------------

alter table public.garantes enable row level security;

create policy garantes_owner_all on public.garantes
  for all
  using (tenant_id = public.current_tenant_id() and public.current_rol() = 'owner')
  with check (tenant_id = public.current_tenant_id() and public.current_rol() = 'owner');

-- ---------------------------------------------------------------------------
-- prestamos
-- ---------------------------------------------------------------------------

alter table public.prestamos enable row level security;

create policy prestamos_owner_all on public.prestamos
  for all
  using (tenant_id = public.current_tenant_id() and public.current_rol() = 'owner')
  with check (tenant_id = public.current_tenant_id() and public.current_rol() = 'owner');

-- El cobrador solo ve (lectura) los préstamos que tiene asignados; crear/editar
-- préstamos queda reservado al owner.
create policy prestamos_collector_select on public.prestamos
  for select
  using (
    tenant_id = public.current_tenant_id()
    and public.current_rol() = 'collector'
    and cobrador_id = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- cuotas
-- ---------------------------------------------------------------------------

alter table public.cuotas enable row level security;

create policy cuotas_owner_all on public.cuotas
  for all
  using (tenant_id = public.current_tenant_id() and public.current_rol() = 'owner')
  with check (tenant_id = public.current_tenant_id() and public.current_rol() = 'owner');

create policy cuotas_collector_select on public.cuotas
  for select
  using (
    tenant_id = public.current_tenant_id()
    and public.current_rol() = 'collector'
    and exists (
      select 1 from public.prestamos p
      where p.id = cuotas.prestamo_id and p.cobrador_id = auth.uid()
    )
  );

-- Nota: la actualización de saldo_pendiente/estado de una cuota al registrar un pago
-- NO pasa por estas policies de UPDATE — la hace la función registrar_pago()
-- (security definer) para garantizar la transacción atómica cuota+préstamo+pago.

-- ---------------------------------------------------------------------------
-- pagos
-- ---------------------------------------------------------------------------

alter table public.pagos enable row level security;

create policy pagos_owner_all on public.pagos
  for all
  using (tenant_id = public.current_tenant_id() and public.current_rol() = 'owner')
  with check (tenant_id = public.current_tenant_id() and public.current_rol() = 'owner');

create policy pagos_collector_select on public.pagos
  for select
  using (
    tenant_id = public.current_tenant_id()
    and public.current_rol() = 'collector'
    and cobrador_id = auth.uid()
  );

-- Nota: el registro de pagos (insert) por parte de un cobrador se hace SIEMPRE vía
-- la función registrar_pago() (security definer), no con INSERT directo — así se
-- reproduce la lógica transaccional de PagoService.NewPago (validar saldo, actualizar
-- cuota y préstamo) de forma atómica. No hay policy de insert para `authenticated`.

-- ---------------------------------------------------------------------------
-- documentos (gestión de owner únicamente en el MVP)
-- ---------------------------------------------------------------------------

alter table public.documentos enable row level security;

create policy documentos_owner_all on public.documentos
  for all
  using (tenant_id = public.current_tenant_id() and public.current_rol() = 'owner')
  with check (tenant_id = public.current_tenant_id() and public.current_rol() = 'owner');

-- ---------------------------------------------------------------------------
-- medios_pago (catálogo global de solo lectura para cualquier usuario autenticado)
-- ---------------------------------------------------------------------------

alter table public.medios_pago enable row level security;

create policy medios_pago_select on public.medios_pago
  for select using (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- audit_logs (solo lectura para el owner de su propio tenant; el insert lo hace
-- el trigger de auditoría, que corre como security definer)
-- ---------------------------------------------------------------------------

alter table public.audit_logs enable row level security;

create policy audit_logs_select_owner on public.audit_logs
  for select using (tenant_id = public.current_tenant_id() and public.current_rol() = 'owner');

-- ---------------------------------------------------------------------------
-- Grants: RLS es la barrera real, pero el rol `authenticated` necesita el
-- privilegio SQL base para que las policies se evalúen en absoluto.
-- ---------------------------------------------------------------------------

grant usage on schema public to authenticated;

grant select, insert, update, delete on
  public.tenants,
  public.usuarios,
  public.clientes,
  public.garantes,
  public.prestamos,
  public.cuotas,
  public.pagos,
  public.documentos
to authenticated;

grant select on public.medios_pago, public.audit_logs to authenticated;

grant execute on function public.current_tenant_id() to authenticated;
grant execute on function public.current_rol() to authenticated;
