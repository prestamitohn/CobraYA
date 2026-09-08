-- CobraYA: cierre de 4 funciones `security definer` sin control de acceso, detectadas
-- al auditar el backend antes de habilitar el rol collector (más cuentas por tenant =
-- más superficie para explotarlas). Mismo patrón de fuga que ya se corrigió en
-- devengar_intereses_ahorro/aportacion (20260801010000_cooperativa_ahorro_ledger.sql):
-- Postgres concede EXECUTE a PUBLIC por defecto en funciones nuevas de `public`.

-- ---------------------------------------------------------------------------
-- 1) actualizar_cuotas_vencidas(): mutaba TODOS los tenants sin filtro ni chequeo de
-- caller, pese a tener grant a `authenticated`. El dashboard la sigue llamando en cada
-- carga (dashboardService.ts -> actualizarMora()), así que no se puede revocar sin
-- más: se acota al tenant del caller, y se crea una función aparte SIN acotar para el
-- job de pg_cron (que sí necesita barrer todos los tenants).
-- ---------------------------------------------------------------------------

create or replace function public.actualizar_cuotas_vencidas()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_count     integer;
begin
  if v_tenant_id is null then
    raise exception 'Usuario sin tenant asignado';
  end if;

  update public.cuotas
     set estado = 'vencida'
   where tenant_id = v_tenant_id
     and estado = 'pendiente'
     and fecha_vto < current_date;

  get diagnostics v_count = row_count;

  insert into public.multas (tenant_id, prestamo_id, cuota_id, monto, saldo_pendiente, motivo, fecha_incumplimiento, aplicada_automaticamente)
  select c.tenant_id, c.prestamo_id, c.id, p.multa_por_atraso_monto, p.multa_por_atraso_monto,
         'Cuota vencida automáticamente', c.fecha_vto, true
  from public.cuotas c
  join public.prestamos p on p.id = c.prestamo_id
  where c.tenant_id = v_tenant_id
    and c.estado = 'vencida'
    and p.multa_por_atraso_monto is not null
    and not exists (select 1 from public.multas m where m.cuota_id = c.id);

  update public.gastos_administrativos
     set estado = 'vencida'
   where tenant_id = v_tenant_id
     and estado = 'pendiente'
     and fecha_vto < current_date;

  return v_count;
end;
$$;

comment on function public.actualizar_cuotas_vencidas is 'Versión acotada al tenant del caller (current_tenant_id()) — invocada bajo demanda desde el dashboard. Para el barrido global de pg_cron ver actualizar_cuotas_vencidas_global().';

-- ---------------------------------------------------------------------------
-- actualizar_cuotas_vencidas_global(): copia sin acotar, exclusiva del job diario.
-- No expuesta a authenticated/anon — solo pg_cron (que ejecuta como el rol dueño del
-- job, con privilegios de servidor) debe poder invocarla.
-- ---------------------------------------------------------------------------

create or replace function public.actualizar_cuotas_vencidas_global()
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

comment on function public.actualizar_cuotas_vencidas_global is 'Barrido diario de TODOS los tenants para pg_cron. No expuesta a authenticated/anon — nunca invocar desde el front ni desde una Edge Function con JWT de usuario.';

revoke execute on function public.actualizar_cuotas_vencidas_global() from public, authenticated, anon;

-- Reapuntar el cron job (creado en 20260721010500_mora_cron.sql) a la versión global.
select cron.unschedule('cobraya-actualizar-mora');

select cron.schedule(
  'cobraya-actualizar-mora',
  '0 6 * * *', -- 06:00 UTC = 00:00 hora de Honduras (UTC-6)
  $$select public.actualizar_cuotas_vencidas_global();$$
);

-- ---------------------------------------------------------------------------
-- 2) obtener_resumen_notificacion(uuid): confía en el uuid recibido sin verificar al
-- caller. Diseñada para que la invoque la Edge Function de push con service_role (que
-- ya tiene su propio grant), pero sin este revoke cualquier `authenticated` puede
-- pasar el uuid de un usuario de OTRO tenant y leer sus KPIs (cuotas de hoy, monto,
-- mora) — fuga cross-tenant. Sin cambios de lógica, solo de grants.
-- ---------------------------------------------------------------------------

revoke execute on function public.obtener_resumen_notificacion(uuid) from public, authenticated, anon;

-- ---------------------------------------------------------------------------
-- 3) saldos_aportaciones() / interes_acumulado_aportaciones(): `security definer` sin
-- chequeo de rol — devuelven capital social e interés acumulado de TODOS los socios
-- del tenant, esquivando las policies aportaciones_owner_all y la RLS de movimientos.
-- Único consumidor hoy: cooperativaService.ts (páginas Aportaciones/Ahorros,
-- solo-owner) — el portal del socio usa mi_perfil_socio()/mi_excedente_estimado(),
-- que sí están acotadas al propio socio. Se agrega el mismo gate que ya usan las
-- funciones de gestión del módulo (crear_producto_ahorro, registrar_aportacion, etc.).
-- ---------------------------------------------------------------------------

create or replace function public.saldos_aportaciones()
returns table (cliente_id uuid, saldo numeric)
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
  select a.cliente_id,
         coalesce(sum(case when a.tipo = 'retiro' then -a.monto else a.monto end), 0) as saldo
  from public.aportaciones a
  where a.tenant_id = public.current_tenant_id()
  group by a.cliente_id;
end;
$$;

create or replace function public.interes_acumulado_aportaciones()
returns table (cliente_id uuid, interes_acumulado numeric)
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
  select m.cliente_id, coalesce(sum(m.monto), 0) as interes_acumulado
  from public.movimientos m
  where m.tenant_id = public.current_tenant_id()
    and m.origen = 'aportacion'
  group by m.cliente_id;
end;
$$;
