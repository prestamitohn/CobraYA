-- CobraYA: RPCs de reportería pedidas por una cooperativa cliente (FAN, feedback 2026-08-31):
-- historial de préstamos con saldo pendiente por cliente, y disponibilidad real de fondos de
-- aportaciones (capital social menos lo colocado en préstamos).
--
-- Mismo patrón de seguridad que saldos_aportaciones()/interes_acumulado_aportaciones()
-- (20260829010000_fix_scope_rpc_seguridad.sql): security definer + stable + gate explícito
-- de rol, con el EXECUTE revocado de public/anon (Supabase lo concede por defecto en
-- funciones nuevas de `public`) y otorgado solo a `authenticated`.

-- ---------------------------------------------------------------------------
-- reporte_prestamos: una fila por préstamo — nombre, código de socio, cuota
-- actual, cuotas pagadas/totales, total pagado y saldo pendiente.
-- ---------------------------------------------------------------------------

create or replace function public.reporte_prestamos()
returns table (
  prestamo_id         uuid,
  cliente_id          uuid,
  cliente_nombre      text,
  cliente_apellido    text,
  cliente_documento   text,
  numero_socio        text,
  monto_otorgado      numeric,
  monto_cuota_actual  numeric,
  cuotas_pagadas      bigint,
  cuotas_totales      integer,
  total_pagado        numeric,
  -- Deliberadamente NO es prestamos.saldo_restante: esa columna se siembra con el
  -- capital pero registrar_pago() la decrementa con el pago TOTAL (capital+interés),
  -- así que en un préstamo flat llega a 0 antes de que el cliente termine de pagar.
  -- El saldo real por cobrar es la suma de cuotas.saldo_pendiente.
  saldo_pendiente     numeric,
  estado              public.estado_prestamo,
  fecha_otorgamiento  date,
  fecha_fin_estimada  date
)
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
    p.id,
    c.id,
    c.nombre,
    c.apellido,
    c.documento,
    c.numero_socio,
    p.monto_otorgado,
    (
      select cu.monto from public.cuotas cu
      where cu.prestamo_id = p.id and cu.estado in ('pendiente', 'vencida')
      order by cu.fecha_vto asc
      limit 1
    ),
    (select count(*) from public.cuotas cu where cu.prestamo_id = p.id and cu.estado = 'saldada'),
    p.cantidad_cuotas,
    (
      select coalesce(sum(pg.monto), 0)
      from public.pagos pg
      join public.cuotas cu on cu.id = pg.cuota_id
      where cu.prestamo_id = p.id
    ),
    (
      select coalesce(sum(cu.saldo_pendiente), 0)
      from public.cuotas cu
      where cu.prestamo_id = p.id and cu.estado in ('pendiente', 'vencida')
    ),
    p.estado,
    p.fecha_otorgamiento,
    p.fecha_fin_estimada
  from public.prestamos p
  join public.clientes c on c.id = p.cliente_id
  where p.tenant_id = public.current_tenant_id()
    and p.estado <> 'eliminado'
  order by p.fecha_otorgamiento desc;
end;
$$;

comment on function public.reporte_prestamos is 'Historial de préstamos del tenant con cuota actual y saldo pendiente real (por cuotas, no por prestamos.saldo_restante) — para la página de Reportes.';

revoke execute on function public.reporte_prestamos() from public, authenticated, anon;
grant execute on function public.reporte_prestamos() to authenticated;

-- ---------------------------------------------------------------------------
-- resumen_fondos_cooperativa: capital social (con su reserva no retirable),
-- ahorros captados y capital colocado en préstamos aún pendiente de cobro.
-- Aportaciones y ahorros son bolsas de fondos DISTINTAS (no hay ninguna columna
-- que ligue un préstamo a de dónde salió el capital), así que "disponible" se
-- calcula solo contra aportaciones, no mezclando ambas — ver el detalle de este
-- hallazgo en la exploración previa a esta migración.
-- ---------------------------------------------------------------------------

create or replace function public.resumen_fondos_cooperativa()
returns table (
  capital_aportaciones_total     numeric,
  capital_aportaciones_reserva   numeric,
  capital_aportaciones_retirable numeric,
  ahorros_captados               numeric,
  monto_otorgado_vigente         numeric,
  -- Capital pendiente de cobro (no el monto otorgado bruto): mismo criterio que
  -- dashboardService.capitalPendiente en el frontend — sum(cuota.monto - cuota.interes)
  -- de cuotas no saldadas — para que este número no contradiga al del dashboard.
  capital_pendiente_cobro        numeric,
  disponible_aportaciones        numeric
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_tenant_id              uuid := public.current_tenant_id();
  v_aportaciones_total     numeric;
  v_aportaciones_reserva   numeric;
  v_aportaciones_retirable numeric;
  v_ahorros                numeric;
  v_otorgado               numeric;
  v_pendiente              numeric;
begin
  if public.current_rol() not in ('owner', 'auditor') then
    raise exception 'No autorizado';
  end if;

  if not exists (select 1 from public.tenants where id = v_tenant_id and tipo_tenant = 'cooperativa') then
    raise exception 'Este resumen solo aplica a tenants tipo cooperativa';
  end if;

  select
    coalesce(sum(case when a.tipo = 'retiro' then -a.monto else a.monto end), 0),
    coalesce(sum(case when a.tipo = 'reserva' then a.monto else 0 end), 0),
    coalesce(sum(case
               when a.tipo in ('obligatoria', 'extraordinaria') then a.monto
               when a.tipo = 'retiro' then -a.monto
               else 0
             end), 0)
    into v_aportaciones_total, v_aportaciones_reserva, v_aportaciones_retirable
  from public.aportaciones a
  where a.tenant_id = v_tenant_id;

  select coalesce(sum(ca.saldo), 0) into v_ahorros
  from public.cuentas_ahorro ca
  where ca.tenant_id = v_tenant_id and ca.estado = 'activa';

  select coalesce(sum(p.monto_otorgado), 0) into v_otorgado
  from public.prestamos p
  where p.tenant_id = v_tenant_id and p.estado = 'activo';

  select coalesce(sum(cu.monto - coalesce(cu.interes, 0)), 0) into v_pendiente
  from public.cuotas cu
  where cu.tenant_id = v_tenant_id and cu.estado in ('pendiente', 'vencida');

  return query select
    v_aportaciones_total,
    v_aportaciones_reserva,
    v_aportaciones_retirable,
    v_ahorros,
    v_otorgado,
    v_pendiente,
    v_aportaciones_total - v_pendiente;
end;
$$;

comment on function public.resumen_fondos_cooperativa is 'Desglose de fondos de una cooperativa: capital social (total/reserva/retirable), ahorros captados y capital colocado en préstamos pendiente de cobro. disponible_aportaciones = capital_aportaciones_total - capital_pendiente_cobro (no se mezcla con ahorros, que es una bolsa de fondos distinta).';

revoke execute on function public.resumen_fondos_cooperativa() from public, authenticated, anon;
grant execute on function public.resumen_fondos_cooperativa() to authenticated;
