-- CobraYA: clasificación manual de clientes
--
-- El dueño puede fijar manualmente la clasificación de un cliente (Excelente/Bueno/
-- Regular/Malo), anulando el cálculo automático de obtener_clasificacion_clientes().
-- Útil en casos donde el prestamista conoce contexto que el historial de cuotas
-- no captura (ej. cliente nuevo con buena referencia, o cliente problemático fuera
-- del sistema). Queda registrado quién y cuándo la fijó, y el motivo.

alter table public.clientes
  add column clasificacion_manual        public.clasificacion_cliente,
  add column clasificacion_manual_motivo text,
  add column clasificacion_manual_at     timestamptz,
  add column clasificacion_manual_by     uuid references public.usuarios (id);

comment on column public.clientes.clasificacion_manual is 'Clasificación fijada manualmente por el dueño; si no es null, anula el cálculo automático en obtener_clasificacion_clientes().';

create or replace function public.establecer_clasificacion_manual(
  p_cliente_id   uuid,
  p_clasificacion public.clasificacion_cliente,
  p_motivo       text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_rol() <> 'owner' then
    raise exception 'Solo el dueño puede clasificar manualmente a un cliente';
  end if;

  update public.clientes
  set clasificacion_manual        = p_clasificacion,
      clasificacion_manual_motivo = p_motivo,
      clasificacion_manual_at     = now(),
      clasificacion_manual_by     = auth.uid()
  where id = p_cliente_id
    and tenant_id = public.current_tenant_id();

  if not found then
    raise exception 'Cliente no encontrado';
  end if;
end;
$$;

comment on function public.establecer_clasificacion_manual(uuid, public.clasificacion_cliente, text) is 'Fija manualmente la clasificación de un cliente (solo owner), anulando el cálculo automático.';

grant execute on function public.establecer_clasificacion_manual(uuid, public.clasificacion_cliente, text) to authenticated;

create or replace function public.quitar_clasificacion_manual(p_cliente_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_rol() <> 'owner' then
    raise exception 'Solo el dueño puede modificar la clasificación de un cliente';
  end if;

  update public.clientes
  set clasificacion_manual        = null,
      clasificacion_manual_motivo = null,
      clasificacion_manual_at     = null,
      clasificacion_manual_by     = null
  where id = p_cliente_id
    and tenant_id = public.current_tenant_id();

  if not found then
    raise exception 'Cliente no encontrado';
  end if;
end;
$$;

comment on function public.quitar_clasificacion_manual(uuid) is 'Revierte la clasificación de un cliente al cálculo automático.';

grant execute on function public.quitar_clasificacion_manual(uuid) to authenticated;

-- Se redefine obtener_clasificacion_clientes() para: (1) partir de TODOS los clientes
-- visibles por RLS -- no solo los que tienen cuotas -- así un cliente sin préstamos
-- también puede recibir una clasificación manual; y (2) dar prioridad a la
-- clasificación manual sobre la automática, exponiendo si es manual y su motivo.
drop function if exists public.obtener_clasificacion_clientes();

create or replace function public.obtener_clasificacion_clientes()
returns table (
  cliente_id                       uuid,
  total_cuotas_vencidas_hist       integer,
  cuotas_pagadas_a_tiempo          integer,
  cuotas_pagadas_tarde             integer,
  cuotas_vencidas_actuales         integer,
  multas_activas                   integer,
  porcentaje_cumplimiento          numeric,
  clasificacion                    public.clasificacion_cliente,
  no_recomendado_refinanciamiento  boolean,
  es_manual                        boolean,
  clasificacion_manual_motivo      text
)
language sql
stable
security invoker
set search_path = public
as $$
  with clientes_visibles as (
    select id as cliente_id, clasificacion_manual, clasificacion_manual_motivo
    from public.clientes
  ),
  base as (
    select
      p.cliente_id,
      cu.id as cuota_id,
      cu.fecha_vto,
      cu.estado
    from public.prestamos p
    join public.cuotas cu on cu.prestamo_id = p.id
    where p.estado <> 'eliminado'
  ),
  ultimo_pago as (
    select cuota_id, max(fecha_pago) as fecha_pago
    from public.pagos
    group by cuota_id
  ),
  metricas as (
    select
      cv.cliente_id,
      count(*) filter (where b.fecha_vto <= current_date) as total_cuotas_vencidas_hist,
      count(*) filter (
        where b.fecha_vto <= current_date and b.estado = 'saldada'
          and coalesce(up.fecha_pago, b.fecha_vto) <= b.fecha_vto
      ) as cuotas_pagadas_a_tiempo,
      count(*) filter (
        where b.fecha_vto <= current_date and b.estado = 'saldada'
          and up.fecha_pago > b.fecha_vto
      ) as cuotas_pagadas_tarde,
      count(*) filter (where b.estado = 'vencida') as cuotas_vencidas_actuales
    from clientes_visibles cv
    left join base b on b.cliente_id = cv.cliente_id
    left join ultimo_pago up on up.cuota_id = b.cuota_id
    group by cv.cliente_id
  ),
  multas_por_cliente as (
    select p.cliente_id, count(*) as multas_activas
    from public.multas m
    join public.prestamos p on p.id = m.prestamo_id
    where m.estado <> 'saldada'
    group by p.cliente_id
  ),
  completo as (
    select
      m.cliente_id,
      m.total_cuotas_vencidas_hist,
      m.cuotas_pagadas_a_tiempo,
      m.cuotas_pagadas_tarde,
      m.cuotas_vencidas_actuales,
      coalesce(mp.multas_activas, 0) as multas_activas,
      case when m.total_cuotas_vencidas_hist = 0 then 100
           else round(m.cuotas_pagadas_a_tiempo::numeric / m.total_cuotas_vencidas_hist * 100, 1)
      end as porcentaje_cumplimiento
    from metricas m
    left join multas_por_cliente mp on mp.cliente_id = m.cliente_id
  ),
  clasificado as (
    select
      c.*,
      case
        when c.total_cuotas_vencidas_hist = 0 then 'bueno'::public.clasificacion_cliente
        when c.porcentaje_cumplimiento >= 90 and c.cuotas_vencidas_actuales = 0 and c.multas_activas = 0
          then 'excelente'::public.clasificacion_cliente
        when c.porcentaje_cumplimiento >= 75 and c.cuotas_vencidas_actuales <= 1
          then 'bueno'::public.clasificacion_cliente
        when c.porcentaje_cumplimiento >= 50 and c.cuotas_vencidas_actuales <= 2 and c.multas_activas <= 1
          then 'regular'::public.clasificacion_cliente
        else 'malo'::public.clasificacion_cliente
      end as clasificacion_auto
    from completo c
  )
  select
    cl.cliente_id,
    cl.total_cuotas_vencidas_hist,
    cl.cuotas_pagadas_a_tiempo,
    cl.cuotas_pagadas_tarde,
    cl.cuotas_vencidas_actuales,
    cl.multas_activas,
    cl.porcentaje_cumplimiento,
    coalesce(cv.clasificacion_manual, cl.clasificacion_auto) as clasificacion,
    (coalesce(cv.clasificacion_manual, cl.clasificacion_auto) = 'malo') as no_recomendado_refinanciamiento,
    (cv.clasificacion_manual is not null) as es_manual,
    cv.clasificacion_manual_motivo
  from clasificado cl
  join clientes_visibles cv on cv.cliente_id = cl.cliente_id
$$;

comment on function public.obtener_clasificacion_clientes() is
  'Clasificación Excelente/Bueno/Regular/Malo por cliente. Usa la clasificación manual fijada por el owner si existe; si no, la calcula automáticamente en base a cuotas a tiempo/tarde/vencidas y multas activas. Incluye todos los clientes visibles por RLS, tengan o no préstamos.';

grant execute on function public.obtener_clasificacion_clientes() to authenticated;
